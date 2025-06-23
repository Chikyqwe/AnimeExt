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
const PORT = 2012;
const BROWSERLESS_ENDPOINT = 'wss://production-sfo.browserless.io?token=2SV8d19pqX3Rqww615a28370a099593392e6e89e6395e4e63';
const JSON_FOLDER = path.join(__dirname, 'jsons');
const JSON_PATH_TIO = path.join(JSON_FOLDER, 'anime_list.json');
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// =================== RUTAS DE VISTAS ===================
app.get('/', (req, res) => {
  console.log([GET /] Página principal solicitada);
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/privacy_policy', (req, res) => {
  console.log([GET /privacy_policy] Política de privacidad solicitada);
  res.sendFile(path.join(__dirname, 'public', 'privacy-policy.html'));
});

app.get('/player', (req, res) => {
  console.log([GET /player] Player solicitado);
  res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

app.get('/scrap', (req, res) => {
  console.log([GET /scrap] Scraper solicitado);
  res.sendFile(path.join(__dirname, 'public', 'scrap.html'));
});

// =================== API PLAYER ===================
app.get('/api/player', (req, res) => {
  const url_original = req.query.url;
  const ep = parseInt(req.query.ep);
  console.log([API PLAYER] Params: url=${url_original}, ep=${ep});

  if (!url_original || isNaN(ep)) {
    console.warn([API PLAYER] Parámetros inválidos);
    return res.status(400).json({ error: "Faltan parámetros url o ep" });
  }

  try {
    const anime_list = JSON.parse(fs.readFileSync(JSON_PATH_TIO, 'utf8'));
    console.log([API PLAYER] Lista cargada);

    const anime_data = anime_list.find(a => a.url === url_original);
    if (!anime_data) {
      console.warn([API PLAYER] Anime no encontrado: ${url_original});
      return res.status(404).json({ error: "Anime no encontrado en la lista" });
    }

    const episodes_count = anime_data.episodes_count || 1;
    if (ep <= 0 || ep > episodes_count) {
      console.warn([API PLAYER] Episodio fuera de rango: ${ep});
      return res.status(406).json({
        error: "Episodio inválido",
        redirect_url: /player?url=${url_original}&ep=${Math.min(Math.max(ep, 1), episodes_count)},
        delay: 2
      });
    }

    const base_url = url_original.replace('/anime/', '/ver/');
    const current_url = ${base_url}-${ep};
    const prev_ep = ep > 1 ? ep - 1 : 1;
    const next_ep = ep < episodes_count ? ep + 1 : episodes_count;

    console.log([API PLAYER] Episodio actual: ${current_url});
    res.json({ current_url, url_original, ep_actual: ep, prev_ep, next_ep, episodes_count, anime_title: anime_data.title || '' });
  } catch (err) {
    console.error('[API PLAYER] Error:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// =================== API JSONS ===================
app.get('/json-list', (req, res) => {
  console.log([GET /json-list] Solicitando lista de JSON);
  const files = fs.readdirSync(JSON_FOLDER).filter(f => f.endsWith('.json'));
  res.json(files);
});

app.get('/jsons/:filename', (req, res) => {
  const filename = req.params.filename;
  console.log([GET /jsons/${filename}] Archivo solicitado);
  res.sendFile(path.join(JSON_FOLDER, filename));
});

// =================== PROXY DE IMÁGENES ===================
app.get('/proxy-image', async (req, res) => {
  const { url } = req.query;
  console.log([GET /proxy-image] Imagen solicitada: ${url});
  if (!url) return res.status(400).send('URL faltante');
  try {
    const response = await axios.get(url, { responseType: 'stream', timeout: 10000 });
    console.log([GET /proxy-image] Imagen recibida correctamente);
    res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store');
    response.data.pipe(res);
  } catch (err) {
    console.error([GET /proxy-image] Error:, err.message);
    res.status(500).send(Error al obtener imagen: ${err.message});
  }
});

// =================== INTEGRACIÓN BROWSERLESS ===================

// Extraer todos los enlaces de video desde la página
async function extractAllVideoLinks(pageUrl) {
  console.log([EXTRACT] Extrayendo videos de: ${pageUrl});
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
        return false; // salir del each
      } catch (err) {
        console.warn([EXTRACT] Error parseando SUB:, err);
      }
    }
  });

  console.log([EXTRACT] Total videos extraídos: ${videos.length});
  return videos;
}

async function extractFromSW(swiftUrl) {
  console.log([SW] Extrayendo y descargando .m3u8 desde: ${swiftUrl});
  const browser = await firefox.connect({
    wsEndpoint: 'wss://production-sfo.browserless.io/firefox/playwright?token=2SV8d19pqX3Rqww615a28370a099593392e6e89e6395e4e63'
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  const m3u8Urls = new Set();

  page.on('requestfinished', request => {
    const url = request.url();
    if (url.includes('.m3u8')) {
      console.log('[SW] Detectado .m3u8:', url);
      m3u8Urls.add(url);
    }
  });

  try {
    await page.goto(swiftUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(7000);
  } catch (err) {
    console.error('[SW] Error navegando:', err.message);
    await browser.close();
    throw err;
  }

  if (m3u8Urls.size === 0) {
    await browser.close();
    throw new Error('No se encontraron URLs m3u8');
  }

  // Descargar contenido de todos los .m3u8 detectados dentro de Playwright
  const m3u8Contents = [];

  for (const url of m3u8Urls) {
    try {
      const content = await page.evaluate(async (m3u8url) => {
        const resp = await fetch(m3u8url);
        if (!resp.ok) throw new Error(Error HTTP ${resp.status});
        return await resp.text();
      }, url);
      m3u8Contents.push({ url, content });
      console.log([SW] Contenido descargado de ${url}, ${content.length} caracteres);
    } catch (error) {
      console.warn([SW] Error descargando contenido de ${url}:, error.message);
    }
  }

  await browser.close();

  if (m3u8Contents.length === 0) {
    throw new Error('No se pudo descargar el contenido de ninguna URL m3u8');
  }

  return m3u8Contents; // Devuelve array de objetos con url + texto
}


// Extractors mapeo
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
  console.log([GET EXTRACTOR] Solicitado: ${name});
  return extractors[name.toLowerCase()];
}

// Puppeteer intercept para mp4 (igual que antes)
async function interceptPuppeteer(pageUrl, fileRegex, refererMatch) {
  console.log([PUPPETEER] Interceptando: ${pageUrl});
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
        console.warn([PUPPETEER] Timeout alcanzado para ${refererMatch});
        reject(new Error(❌ No se detectó archivo válido para ${refererMatch}));
      }
    }, 15000);

    page.on('request', async (req) => {
      const reqUrl = req.url();
      console.log([PUPPETEER] ➤ Request: ${reqUrl});
      if (fileRegex.test(reqUrl) && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        await page.close();
        await browser.close();
        if (reqUrl.includes('novideo.mp4')) {
          return reject(new Error(⚠ El servidor "${refererMatch}" devolvió novideo.mp4));
        }
        console.log([PUPPETEER] ✅ Archivo encontrado: ${reqUrl});
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

// =================== NUEVAS RUTAS API ===================
app.get('/api/servers', async (req, res) => {
  const pageUrl = req.query.url;
  console.log([API SERVERS] URL: ${pageUrl});
  if (!pageUrl) return res.status(400).json({ error: 'Falta parámetro url' });

  try {
    const videos = await extractAllVideoLinks(pageUrl);
    const valid = videos.filter(v => getExtractor(v.servidor));
    console.log([API SERVERS] Servidores válidos:, valid);
    res.json(valid);
  } catch (e) {
    console.error([API SERVERS] Error:, e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api', async (req, res) => {
  const pageUrl = req.query.url;
  const serverRequested = req.query.server;
  console.log([API] URL: ${pageUrl}, Servidor: ${serverRequested});

  if (!pageUrl) return res.status(400).send('Falta parámetro url');

  try {
    const videos = await extractAllVideoLinks(pageUrl);
    const valid = videos.filter(v => getExtractor(v.servidor));
    if (!valid.length) return res.status(404).send('No hay servidores válidos');

    let selected = valid[0];
    if (serverRequested) {
      const found = valid.find(v => v.servidor.toLowerCase() === serverRequested.toLowerCase());
      if (!found) return res.status(404).send(Servidor '${serverRequested}' no soportado);
      selected = found;
    }

    const extractor = getExtractor(selected.servidor);
    const result = await extractor(selected.url);

    // --- Si es array de objetos con content (.m3u8) ---
    if (Array.isArray(result) && result[0]?.content) {
      console.log([API] Retornando JSON con ${result.length} archivos .m3u8);
      return res.json({
        count: result.length,
        files: result,
        firstUrl: result[0].url
      });
    }

    // --- Si es un solo objeto con url (.mp4) ---
    if (result?.url) {
      console.log([API] Redirigiendo a stream: ${result.url});
      return res.redirect(/api/stream?videoUrl=${encodeURIComponent(result.url)});
    }

    throw new Error('Formato de extractor no reconocido');

  } catch (e) {
    console.error([API] Error:, e);
    res.status(500).send('Error interno del servidor: ' + e.message);
  }
});

app.get('/api/m3u8', async (req, res) => {
  const { url } = req.query;
  const apiUrl = ${req.protocol}://${req.get('host')}/api?url=${encodeURIComponent(url)}&server=sw;

  try {
    const swRes = await axios.get(apiUrl);
    const files = swRes.data.files || [];
    const best = files.find(f => f.url.includes('index-f2')) || files[0];

    if (!best || !best.content) {
      return res.status(404).send('#EXTM3U\n#EXT-X-ENDLIST\n');
    }

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(best.content);
  } catch (err) {
    console.error('[API /m3u8] Error:', err.message);
    res.status(500).send('#EXTM3U\n#EXT-X-ENDLIST\n');
  }
});

app.get('/api/stream', (req, res) => {
  const videoUrl = req.query.videoUrl;
  console.log([API STREAM] Video URL: ${videoUrl});
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

    console.log([API STREAM] StatusCode: ${proxyRes.statusCode});
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', err => {
    console.error([API STREAM] Proxy error:, err.message);
    if (!res.headersSent) {
      res.status(500).send('Error al obtener el video: ' + err.message);
    } else {
      res.end();
    }
  });

  proxyReq.end();
});

app.get("/api/scrap/logs", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (msg) => {
    res.write(data: ${msg}\n\n);
  };

  req.on("close", () => {
    console.log("Cliente desconectado, cerrando conexión SSE.");
    res.end();
  });

  try {
    await main({ log: send });
    res.write(event: end\ndata: done\n\n);
    res.end();
  } catch (err) {
    res.write(event: error\ndata: ${err.message}\n\n);
    res.end();
  }
});

// =================== SERVIDOR LISTO ===================
app.listen(PORT, () => {
  console.log(🚀 Servidor corriendo en http://localhost:${PORT});
});
