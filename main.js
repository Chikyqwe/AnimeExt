// =================== IMPORTACIONES ======================
const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { URL } = require('url');
const cors = require('cors');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer-core');
const urlLib = require('url');
const playwright = require('playwright-core');
const cookieParser = require('cookie-parser');
const { http, https } = require('follow-redirects');
const { firefox } = require('playwright-core');
const { main } = require('./anim');

// =================== VARIABLES GLOBALES ===================
const app = express();
const PORT = process.env.PORT || 2012;
const BROWSERLESS_ENDPOINT = 'wss://production-sfo.browserless.io?token=2SV8d19pqX3Rqww615a28370a099593392e6e89e6395e4e63';
const JSON_FOLDER = path.join(__dirname, 'jsons');
const JSON_PATH_TIO = path.join(JSON_FOLDER, 'anime_list.json');
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// =================== COLA DE PETICIONES ===================
const queue = [];
let processing = false;

async function enqueue(task, info = {}) {
  return new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject, info });
    processQueue();
  });
}

async function processQueue() {
  if (processing || queue.length === 0) return;
  const { task, resolve, reject, info } = queue.shift();
  processing = true;

  console.log(`[QUEUE] Procesando tarea: ${info?.label || 'sin etiqueta'}`);
  try {
    const result = await task();
    resolve(result);
  } catch (err) {
    reject(err);
  } finally {
    processing = false;
    processQueue();
  }
}

app.get('/queue/status', (req, res) => {
  res.json({
    en_proceso: processing,
    en_cola: queue.length,
    tareas: queue.map((q, i) => ({ id: i + 1, label: q.info?.label || 'sin etiqueta' }))
  });
});

// =================== RUTAS DE VISTAS ===================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/privacy_policy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'privacy-policy.html')));
app.get('/player', (req, res) => res.sendFile(path.join(__dirname, 'public', 'player.html')));
app.get('/scrap', (req, res) => res.sendFile(path.join(__dirname, 'public', 'scrap.html')));

// =================== API PLAYER ===================
let anime_list = [];
try {
  anime_list = JSON.parse(fs.readFileSync(JSON_PATH_TIO, 'utf8'));
  console.log(`[INIT] Lista de animes cargada (${anime_list.length})`);
} catch (err) {
  console.error('[INIT] Error al cargar lista de animes:', err.message);
}

app.get('/api/player', (req, res) => {
  const url_original = req.query.url;
  const ep = parseInt(req.query.ep);
  if (!url_original || isNaN(ep)) return res.status(400).json({ error: "Faltan parámetros url o ep" });

  const anime_data = anime_list.find(a => a.url === url_original);
  if (!anime_data) return res.status(404).json({ error: "Anime no encontrado" });

  const episodes_count = anime_data.episodes_count || 1;
  if (ep <= 0 || ep > episodes_count) {
    return res.status(406).json({
      error: "Episodio inválido",
      redirect_url: `/player?url=${url_original}&ep=${Math.min(Math.max(ep, 1), episodes_count)}`,
      delay: 2
    });
  }

  const base_url = url_original.replace('/anime/', '/ver/');
  const current_url = `${base_url}-${ep}`;
  res.json({
    current_url, url_original, ep_actual: ep,
    prev_ep: ep > 1 ? ep - 1 : 1,
    next_ep: ep < episodes_count ? ep + 1 : episodes_count,
    episodes_count,
    anime_title: anime_data.title || ''
  });
});

// =================== EXTRACTORES ===================
async function extractAllVideoLinks(pageUrl) {
  const { data: html } = await axios.get(pageUrl);
  const $ = cheerio.load(html);
  let videos = [];

  $('script').each((_, el) => {
    const scriptContent = $(el).html();
    const match = scriptContent && scriptContent.match(/var\s+videos\s*=\s*(\{[\s\S]*?\});/s);
    if (match) {
      try {
        const videosObject = JSON.parse(match[1].replace(/\\\//g, '/'));
        if (videosObject.SUB) {
          videos = videosObject.SUB.map(v => ({
            servidor: v.server || v[0],
            url: v.url || v.code || v[1]
          }));
        }
        return false;
      } catch (err) { }
    }
  });

  return videos;
}

async function extractFromSW(swiftUrl) {
  const browser = await firefox.connect({
    wsEndpoint: 'wss://production-sfo.browserless.io/firefox/playwright?token=2SV8d19pqX3Rqww615a28370a099593392e6e89e6395e4e63'
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const m3u8Urls = new Set();

  page.on('requestfinished', request => {
    const url = request.url();
    if (url.includes('.m3u8')) m3u8Urls.add(url);
  });

  await page.goto(swiftUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(7000);

  const m3u8Contents = [];
  for (const url of m3u8Urls) {
    try {
      const content = await page.evaluate(async m3u8url => {
        const resp = await fetch(m3u8url);
        return await resp.text();
      }, url);
      m3u8Contents.push({ url, content });
    } catch (error) { }
  }

  await browser.close();
  if (!m3u8Contents.length) throw new Error('No se detectaron archivos .m3u8');
  return m3u8Contents;
}

async function interceptPuppeteer(pageUrl, fileRegex, refererMatch) {
  const browser = await puppeteer.connect({
    browserWSEndpoint: BROWSERLESS_ENDPOINT, timeout: 60000
  });
  const page = await browser.newPage();
  let resolved = false;

  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(async () => {
      if (!resolved) {
        resolved = true;
        await page.close(); await browser.close();
        reject(new Error(`❌ Timeout en ${refererMatch}`));
      }
    }, 15000);

    page.on('request', async (req) => {
      const reqUrl = req.url();
      if (fileRegex.test(reqUrl) && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        await page.close(); await browser.close();
        if (reqUrl.includes('novideo.mp4')) return reject(new Error('⚠ novideo.mp4 detectado'));
        resolve({ url: reqUrl });
      }
    });

    await page.setUserAgent('Mozilla/5.0');
    await page.goto(pageUrl, { waitUntil: 'networkidle2' });
  });
}

const extractors = {
  'yourupload': url => interceptPuppeteer(url, /\.mp4$/, 'yourupload.com'),
  'yu': url => interceptPuppeteer(url, /\.mp4$/, 'yourupload.com'),
  'stape': url => interceptPuppeteer(url, /\.mp4$/, 'stape'),
  'streamtape': url => interceptPuppeteer(url, /\.mp4$/, 'streamtape'),
  'voe': url => interceptPuppeteer(url, /\.mp4$/, 'voe'),
  'ok.ru': url => interceptPuppeteer(url, /\.mp4$/, 'ok.ru'),
  'okru': url => interceptPuppeteer(url, /\.mp4$/, 'ok.ru'),
  'streamwish': extractFromSW,
  'swiftplayers': extractFromSW,
  'sw': extractFromSW
};

function getExtractor(name) {
  return extractors[name.toLowerCase()];
}

// =================== RUTAS API ===================
app.get('/api/servers', async (req, res) => {
  const pageUrl = req.query.url;
  if (!pageUrl) return res.status(400).json({ error: 'Falta parámetro url' });

  try {
    const videos = await enqueue(() => extractAllVideoLinks(pageUrl), { label: `[SERVERS] ${pageUrl}` });
    const valid = videos.filter(v => getExtractor(v.servidor));
    res.json(valid);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api', async (req, res) => {
  const pageUrl = req.query.url;
  const serverRequested = req.query.server;
  if (!pageUrl) return res.status(400).send('Falta parámetro url');

  try {
    const videos = await enqueue(() => extractAllVideoLinks(pageUrl), { label: `[API] links: ${pageUrl}` });
    const valid = videos.filter(v => getExtractor(v.servidor));
    if (!valid.length) return res.status(404).send('No hay servidores válidos');

    let selected = valid[0];
    if (serverRequested) {
      const found = valid.find(v => v.servidor.toLowerCase() === serverRequested.toLowerCase());
      if (!found) return res.status(404).send(`Servidor '${serverRequested}' no soportado`);
      selected = found;
    }

    const extractor = getExtractor(selected.servidor);
    const result = await enqueue(() => extractor(selected.url), { label: `[EXTRACT] ${selected.servidor}` });

    if (Array.isArray(result) && result[0]?.content) {
      return res.json({ count: result.length, files: result, firstUrl: result[0].url });
    }

    if (result?.url) {
      return res.redirect(`/api/stream?videoUrl=${encodeURIComponent(result.url)}`);
    }

    throw new Error('Formato de extractor no reconocido');

  } catch (e) {
    res.status(500).send('Error: ' + e.message);
  }
});

app.get('/api/m3u8', async (req, res) => {
  const { url } = req.query;
  const apiUrl = `${req.protocol}://${req.get('host')}/api?url=${encodeURIComponent(url)}&server=sw`;

  try {
    const swRes = await enqueue(() => axios.get(apiUrl), { label: `[API/m3u8] ${url}` });
    const files = swRes.data.files || [];
    const best = files.find(f => f.url.includes('index-f2')) || files[0];

    if (!best || !best.content) {
      return res.status(404).send('#EXTM3U\n#EXT-X-ENDLIST\n');
    }

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(best.content);
  } catch (err) {
    res.status(500).send('#EXTM3U\n#EXT-X-ENDLIST\n');
  }
});

app.get('/api/stream', (req, res) => {
  const videoUrl = req.query.videoUrl;
  if (!videoUrl) return res.status(400).send('Falta parámetro videoUrl');

  const parsedUrl = urlLib.parse(videoUrl);
  const isHttps = parsedUrl.protocol === 'https:';
  const protocol = isHttps ? https : http;

  const headers = {
    'Referer': 'https://www.yourupload.com/',
    'Origin': 'https://www.yourupload.com',
    'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0'
  };
  if (req.headers.range) headers['Range'] = req.headers.range;

  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (isHttps ? 443 : 80),
    path: parsedUrl.path + (parsedUrl.search || ''),
    method: 'GET',
    headers,
    rejectUnauthorized: false,
  };

  const proxyReq = protocol.request(options, (proxyRes) => {
    proxyRes.headers['Content-Disposition'] = 'inline; filename="video.mp4"';
    proxyRes.headers['Content-Type'] = 'video/mp4';
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', err => {
    if (!res.headersSent) res.status(500).send('Error: ' + err.message);
    else res.end();
  });

  proxyReq.end();
});

// =================== SSE SCRAPER ===================
app.get("/api/scrap/logs", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (msg) => res.write(`data: ${msg}\n\n`);
  req.on("close", () => res.end());

  try {
    await main({ log: send });
    res.write(`event: end\ndata: done\n\n`);
    res.end();
  } catch (err) {
    res.write(`event: error\ndata: ${err.message}\n\n`);
    res.end();
  }
});

// =================== START SERVER ===================
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
