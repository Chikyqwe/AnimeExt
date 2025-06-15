// =================== IMPORTACIONES ======================
const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { URL } = require('url');
const cors = require('cors');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const urlLib = require('url');
const { http, https } = require('follow-redirects');

// =================== VARIABLES GLOBALES ===================
const app = express();
const PORT = 2012;

const JSON_FOLDER = path.join(__dirname, 'jsons');
const JSON_PATH_TIO = path.join(JSON_FOLDER, 'anime_list.json');
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


// =================== RUTAS DE VISTAS ===================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/privacy_policy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacy-policy.html'));
});

app.get('/player', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

// =================== API PLAYER ===================
app.get('/api/player', (req, res) => {
  const url_original = req.query.url;
  const ep = parseInt(req.query.ep);

  if (!url_original || isNaN(ep)) {
    return res.status(400).json({ error: "Faltan parámetros url o ep" });
  }

  try {
    const anime_list = JSON.parse(fs.readFileSync(JSON_PATH_TIO, 'utf8'));
    const anime_data = anime_list.find(a => a.url === url_original);
    if (!anime_data) {
      return res.status(404).json({ error: "Anime no encontrado en la lista" });
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
    console.error('Error leyendo anime_list.json:', err);
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

// =================== AQUI INTEGRAMOS EL EXTRACTOR ===================

// === Puppeteer Manager (reutilizable) ===
let browser;
async function getBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({ headless: true });
  }
  return browser;
}
async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

// === EXTRACCIÓN DE VIDEOS ===
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

    match = scriptContent && scriptContent.match(/var\s+videos\s*=\s*(\[\[.*?\]\]);/s);
    if (match) {
      try {
        const rawArray = match[1].replace(/\\\//g, '/');
        const videosArray = JSON.parse(rawArray);
        videos = videosArray.map(v => ({ servidor: v[0], url: v[1] }));
        return false;
      } catch {}
    }
  });

  return videos;
}

// === Funciones por servidor ===
async function interceptPuppeteer(pageUrl, fileRegex, refererMatch) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  let resolved = false;

  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(async () => {
      if (!resolved) {
        resolved = true;
        await page.close();
        reject(new Error(`❌ No se detectó archivo válido para ${refererMatch}`));
      }
    }, 10000);

    page.on('request', async (req) => {
      const reqUrl = req.url();
      if (fileRegex.test(reqUrl) && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        await page.close();
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
        reject(e);
      }
    }
  });
}

async function extractFromSW(url) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  let resolved = false;

  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(async () => {
      if (!resolved) {
        resolved = true;
        await page.close();
        reject(new Error(`❌ No se detectó archivo válido para sw`));
      }
    }, 10000);

    page.on('request', async (req) => {
      const reqUrl = req.url();
      if (/\.m3u8$/.test(reqUrl) && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        await page.close();
        resolve({ url: reqUrl });
      }
    });

    try {
      await page.setUserAgent('Mozilla/5.0');
      const response = await page.goto(url, { waitUntil: 'networkidle2' });
      const html = await page.content();
      if (html.includes('File is no longer available')) {
        await page.close();
        return reject(new Error('⚠ Archivo eliminado o expirado en streamwish'));
      }
    } catch (e) {
      if (!resolved) {
        clearTimeout(timeout);
        resolved = true;
        await page.close();
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

// =================== NUEVAS RUTAS API EXTRACTOR ===================

// 🔹 API para obtener lista de servidores válidos
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

// 🔹 API para extraer y redirigir al video
// === API: Redirección al mejor video ===
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
      if (!found) return res.status(404).send(`Servidor '${serverRequested}' no soportado o no encontrado`);
      selected = found;
    }

    const extractor = getExtractor(selected.servidor);
    const result = await extractor(selected.url);
    const finalUrl = result.url;

    if (finalUrl.includes('.m3u8')) {
      return res.redirect(`/proxy?url=${encodeURIComponent(finalUrl)}`);
    } else {
      return res.redirect(`/api/stream?videoUrl=${encodeURIComponent(finalUrl)}`);
    }
  } catch (e) {
    if (e.message.toLowerCase().includes('novideo') || e.message.toLowerCase().includes('no se detectó archivo')) {
      return res.sendStatus(404);
    }
    res.status(500).send('Error interno del servidor');
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
    'User-Agent': req.headers['user-agent'] || '',
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

app.get('/proxy', async (req, res) => {
  const m3u8Url = req.query.url;
  try {
    const response = await axios.get(m3u8Url, { responseType: 'text', timeout: 10000 });
    const content = response.data;
    if (content.toLowerCase().includes('<html')) {
      return res.status(304).send('El .m3u8 fue bloqueado (contenido HTML detectado)');
    }

    const rewritten = content.split('\n').map(line => {
      line = line.trim();
      if (!line || line.startsWith('#') || line.startsWith('http')) return line;
      return `/proxy/${encodeURIComponent(line)}?base_url=${encodeURIComponent(m3u8Url)}`;
    }).join('\n');

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(rewritten);
  } catch (err) {
    res.status(500).send('Error al procesar el .m3u8: ' + err.message);
  }
});

app.get('/proxy/:resource', async (req, res) => {
  const resource = req.params.resource;
  const baseUrl = req.query.base_url;
  if (!baseUrl) return res.status(400).send("Falta parámetro 'base_url'");

  try {
    const fullUrl = new URL(resource, baseUrl).toString();
    const response = await axios.get(fullUrl, { responseType: 'stream', timeout: 10000 });
    res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
    response.data.pipe(res);
  } catch (err) {
    res.status(500).send('Error descargando recurso: ' + err.message);
  }
});

// Limpieza del puppeteer al cerrar
process.on('SIGINT', async () => {
  await closeBrowser();
  process.exit();
});

// =================== SERVIDOR LISTO ===================
app.listen(PORT, () => {
  console.log(`Servidor fusionado corriendo en http://localhost:${PORT}`);
});
