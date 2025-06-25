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
const { Worker } = require('worker_threads');
const { main } = require('./anim');

// =================== VARIABLES GLOBALES ===================
const app = express();
const PORT = 2015;
const BROWSERLESS_ENDPOINT = 'wss://production-sfo.browserless.io?token=2SV8d19pqX3Rqww615a28370a099593392e6e89e6395e4e63';
const JSON_FOLDER = path.join(__dirname, 'jsons');
const JSON_PATH_TIO = path.join(JSON_FOLDER, 'anime_list.json');
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

let isUpdating = false;
const maintenancePassword = Math.random().toString(36).slice(-8);
console.log(`🔐 Contraseña para mantenimiento (/up): ${maintenancePassword}`);

// =================== MIDDLEWARE BLOQUEO ===================
app.use((req, res, next) => {
  if (isUpdating && req.path !== '/maintenance') {
    console.log(`[BLOQUEADO] Acceso denegado temporalmente a ${req.path}`);
    return res.redirect('/maintenance');
  }
  next();
});

app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// =================== RUTAS DE VISTAS ===================
app.get('/', (req, res) => {
  console.log(`[GET /] Página principal solicitada`);
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/privacy_policy', (req, res) => {
  console.log(`[GET /privacy_policy] Política de privacidad solicitada`);
  res.sendFile(path.join(__dirname, 'public', 'privacy-policy.html'));
});

app.get('/player', (req, res) => {
  console.log(`[GET /player] Player solicitado`);
  res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

app.get('/maintenance', (req, res) => {
  if (!isUpdating) return res.redirect('/');
  res.send(`
    <html><head><title>Mantenimiento</title></head>
    <body style="background:#111; color:#eee; text-align:center; padding-top:10%;">
      <h1>Lo sentimos</h1>
      <p>Nos encontramos actualizando la lista de animes. Inténtelo en unos minutos...</p>
    </body></html>
  `);
});

// =================== MANTENIMIENTO EN HILO ===================
async function iniciarMantenimiento() {
  if (isUpdating) return;
  isUpdating = true;
  console.log(`[MANTENIMIENTO] Iniciando (en hilo separado)...`);

  const worker = new Worker(path.join(__dirname, 'worker-mantenimiento.js'));

  worker.on('message', (msg) => {
    if (msg.type === 'log') {
      console.log(`[MANTENIMIENTO] ${msg.msg}`);
    } else if (msg.type === 'done') {
      console.log(`[MANTENIMIENTO] Finalizado`);
      isUpdating = false;
    } else if (msg.type === 'error') {
      console.error(`[MANTENIMIENTO] Error en worker:`, msg.err);
      isUpdating = false;
    }
  });

  worker.on('error', (err) => {
    console.error(`[MANTENIMIENTO] Worker error:`, err);
    isUpdating = false;
  });

  worker.on('exit', (code) => {
    if (code !== 0) {
      console.error(`[MANTENIMIENTO] Worker terminó con código ${code}`);
    }
    isUpdating = false;
  });
}

app.get('/up', async (req, res) => {
  const { pass } = req.query;
  if (pass !== maintenancePassword) {
    console.warn(`[UP] Contraseña incorrecta o ausente`);
    return res.status(401).send('⛔ Acceso no autorizado. Parámetro "pass" requerido.');
  }

  res.send('⏳ Iniciando mantenimiento. Intenta nuevamente en unos minutos...');
  iniciarMantenimiento();
});

// =================== API PLAYER ===================
app.get('/api/player', (req, res) => {
  const url_original = req.query.url;
  const ep = parseInt(req.query.ep);
  console.log(`[API PLAYER] Params: url=${url_original}, ep=${ep}`);

  if (!url_original || isNaN(ep)) {
    return res.status(400).json({ error: "Faltan parámetros url o ep" });
  }

  try {
    const anime_list = JSON.parse(fs.readFileSync(JSON_PATH_TIO, 'utf8'));
    const anime_data = anime_list.find(a => a.url === url_original);
    if (!anime_data) {
      return res.status(404).json({ error: "Anime no encontrado" });
    }

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
    const prev_ep = ep > 1 ? ep - 1 : 1;
    const next_ep = ep < episodes_count ? ep + 1 : episodes_count;

    res.json({ current_url, url_original, ep_actual: ep, prev_ep, next_ep, episodes_count, anime_title: anime_data.title || '' });
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// =================== API JSONS ===================
app.get('/json-list', (req, res) => {
  const files = fs.readdirSync(JSON_FOLDER).filter(f => f.endsWith('.json'));
  res.json(files);
});

app.get('/jsons/:filename', (req, res) => {
  const filename = req.params.filename;
  res.sendFile(path.join(JSON_FOLDER, filename));
});

// =================== PROXY DE IMÁGENES ===================
app.get('/proxy-image', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('URL faltante');
  try {
    const response = await axios.get(url, { responseType: 'stream', timeout: 10000 });
    res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store');
    response.data.pipe(res);
  } catch (err) {
    res.status(500).send(`Error al obtener imagen: ${err.message}`);
  }
});

// =================== BROWSERLESS Y EXTRACTORS ===================
async function extractAllVideoLinks(pageUrl) {
  const { data: html } = await axios.get(pageUrl);
  const $ = cheerio.load(html);
  let videos = [];

  $('script').each((_, el) => {
    const scriptContent = $(el).html();
    let match = scriptContent && scriptContent.match(/var\s+videos\s*=\s*(\{[\s\S]*?\});/s);
    if (match) {
      try {
        const rawJson = match[1].replace(/\\\//g, '/');
        const videosObject = JSON.parse(rawJson);
        if (videosObject.SUB) {
          videos = videosObject.SUB.map(v => ({
            servidor: v.server || v[0],
            url: v.url || v.code || v[1]
          }));
        }
        return false;
      } catch {}
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
      const content = await page.evaluate(async (m3u8url) => {
        const resp = await fetch(m3u8url);
        return await resp.text();
      }, url);
      m3u8Contents.push({ url, content });
    } catch {}
  }

  await browser.close();
  return m3u8Contents;
}

async function interceptPuppeteer(pageUrl, fileRegex, refererMatch) {
  const browser = await puppeteer.connect({
    browserWSEndpoint: BROWSERLESS_ENDPOINT,
    timeout: 60000
  });
  const page = await browser.newPage();
  let resolved = false;

  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(async () => {
      if (!resolved) {
        resolved = true;
        await page.close();
        await browser.close();
        reject(new Error(`❌ No se detectó archivo válido para ${refererMatch}`));
      }
    }, 15000);

    page.on('request', async (req) => {
      const reqUrl = req.url();
      if (fileRegex.test(reqUrl) && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        await page.close();
        await browser.close();
        if (reqUrl.includes('novideo.mp4')) {
          return reject(new Error(`⚠ El servidor "${refererMatch}" devolvió novideo.mp4`));
        }
        resolve({ url: reqUrl });
      }
    });

    try {
      await page.setUserAgent('Mozilla/5.0');
      await page.goto(pageUrl, { waitUntil: 'networkidle2' });
    } catch (e) {
      if (!resolved) {
        clearTimeout(timeout);
        resolved = true;
        await page.close();
        await browser.close();
        reject(e);
      }
    }
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

// =================== API STREAMING ===================
app.get('/api/servers', async (req, res) => {
  const pageUrl = req.query.url;
  if (!pageUrl) return res.status(400).json({ error: 'Falta parámetro url' });

  try {
    const videos = await extractAllVideoLinks(pageUrl);
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
    const videos = await extractAllVideoLinks(pageUrl);
    const valid = videos.filter(v => getExtractor(v.servidor));
    if (!valid.length) return res.status(404).send('No hay servidores válidos');

    let selected = valid[0];
    if (serverRequested) {
      const found = valid.find(v => v.servidor.toLowerCase() === serverRequested.toLowerCase());
      if (!found) return res.status(404).send(`Servidor '${serverRequested}' no soportado`);
      selected = found;
    }

    const extractor = getExtractor(selected.servidor);
    const result = await extractor(selected.url);

    if (Array.isArray(result) && result[0]?.content) {
      return res.json({ count: result.length, files: result, firstUrl: result[0].url });
    }

    if (result?.url) {
      return res.redirect(`/api/stream?videoUrl=${encodeURIComponent(result.url)}`);
    }

    throw new Error('Formato de extractor no reconocido');
  } catch (e) {
    res.status(500).send('Error interno del servidor: ' + e.message);
  }
});

app.get('/api/m3u8', async (req, res) => {
  const { url } = req.query;
  const apiUrl = `${req.protocol}://${req.get('host')}/api?url=${encodeURIComponent(url)}&server=sw`;

  try {
    const swRes = await axios.get(apiUrl);
    const files = swRes.data.files || [];
    const best = files.find(f => f.url.includes('index-f2')) || files[0];
    if (!best || !best.content) {
      return res.status(404).send('#EXTM3U\n#EXT-X-ENDLIST\n');
    }

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(best.content);
  } catch {
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
    if (!res.headersSent) {
      res.status(500).send('Error al obtener el video: ' + err.message);
    } else {
      res.end();
    }
  });

  proxyReq.end();
});

// =================== AUTO MANTENIMIENTO ===================
setInterval(iniciarMantenimiento, 24 * 60 * 60 * 1000);

// =================== SERVIDOR INICIADO ===================
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
