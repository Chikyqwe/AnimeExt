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

console.log('🟢 Inicio del servidor y carga de módulos completada');

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
  console.log(`[MIDDLEWARE] Request a: ${req.path} - isUpdating: ${isUpdating}`);
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

console.log('🟢 Middlewares aplicados: CORS, cookieParser, JSON, static public');

// =================== RUTAS DE VISTAS ===================
app.get('/', (req, res) => {
  console.log(`[GET /] Página principal solicitada desde ${req.ip}`);
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/privacy_policy', (req, res) => {
  console.log(`[GET /privacy_policy] Política de privacidad solicitada desde ${req.ip}`);
  res.sendFile(path.join(__dirname, 'public', 'privacy-policy.html'));
});

app.get('/player', (req, res) => {
  console.log(`[GET /player] Player solicitado desde ${req.ip}`);
  res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

app.get('/maintenance', (req, res) => {
  console.log(`[GET /maintenance] Página de mantenimiento solicitada`);
  if (!isUpdating) {
    console.log(`[MAINTENANCE] No hay mantenimiento activo, redirigiendo a /`);
    return res.redirect('/');
  }
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
  if (isUpdating) {
    console.log(`[MANTENIMIENTO] Ya se está ejecutando mantenimiento, ignorando nueva solicitud`);
    return;
  }
  isUpdating = true;
  console.log(`[MANTENIMIENTO] Iniciando mantenimiento en hilo separado...`);

  const worker = new Worker(path.join(__dirname, 'worker-mantenimiento.js'));

  worker.on('message', (msg) => {
    if (msg.type === 'log') {
      console.log(`[MANTENIMIENTO][WORKER] ${msg.msg}`);
    } else if (msg.type === 'done') {
      console.log(`[MANTENIMIENTO][WORKER] Finalizado correctamente`);
      isUpdating = false;
    } else if (msg.type === 'error') {
      console.error(`[MANTENIMIENTO][WORKER] Error reportado:`, msg.err);
      isUpdating = false;
    } else {
      console.log(`[MANTENIMIENTO][WORKER] Mensaje desconocido:`, msg);
    }
  });

  worker.on('error', (err) => {
    console.error(`[MANTENIMIENTO] Error en worker:`, err);
    isUpdating = false;
  });

  worker.on('exit', (code) => {
    if (code !== 0) {
      console.error(`[MANTENIMIENTO] Worker terminó con código ${code}`);
    } else {
      console.log(`[MANTENIMIENTO] Worker salió correctamente`);
    }
    isUpdating = false;
  });
}

app.get('/up', async (req, res) => {
  const { pass } = req.query;
  console.log(`[UP] Solicitud de mantenimiento con pass: ${pass ? 'PROVIDED' : 'NO_PROVIDED'}`);
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
  console.log(`[API PLAYER] Solicitud con parámetros url=${url_original}, ep=${ep}`);

  if (!url_original || isNaN(ep)) {
    console.warn(`[API PLAYER] Parámetros inválidos: url=${url_original}, ep=${req.query.ep}`);
    return res.status(400).json({ error: "Faltan parámetros url o ep" });
  }

  try {
    console.log(`[API PLAYER] Leyendo lista de animes en: ${JSON_PATH_TIO}`);
    const anime_list = JSON.parse(fs.readFileSync(JSON_PATH_TIO, 'utf8'));
    const anime_data = anime_list.find(a => a.url === url_original);

    if (!anime_data) {
      console.warn(`[API PLAYER] Anime no encontrado para url: ${url_original}`);
      return res.status(404).json({ error: "Anime no encontrado" });
    }

    const episodes_count = anime_data.episodes_count || 1;
    if (ep <= 0 || ep > episodes_count) {
      console.warn(`[API PLAYER] Episodio inválido ${ep}, rango permitido 1-${episodes_count}`);
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

    console.log(`[API PLAYER] Respondiendo con URLs: current=${current_url}, prev=${prev_ep}, next=${next_ep}, total=${episodes_count}`);
    res.json({ current_url, url_original, ep_actual: ep, prev_ep, next_ep, episodes_count, anime_title: anime_data.title || '' });
  } catch (err) {
    console.error(`[API PLAYER] Error interno:`, err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// =================== API JSONS ===================
app.get('/json-list', (req, res) => {
  console.log(`[JSON LIST] Listando archivos JSON en: ${JSON_FOLDER}`);
  try {
    const files = fs.readdirSync(JSON_FOLDER).filter(f => f.endsWith('.json'));
    console.log(`[JSON LIST] Archivos encontrados: ${files.join(', ')}`);
    res.json(files);
  } catch (err) {
    console.error(`[JSON LIST] Error leyendo directorio:`, err);
    res.status(500).send('Error al leer directorio de JSONs');
  }
});

app.get('/jsons/:filename', (req, res) => {
  const filename = req.params.filename;
  console.log(`[JSON FILE] Solicitando archivo JSON: ${filename}`);
  res.sendFile(path.join(JSON_FOLDER, filename));
});

// =================== PROXY DE IMÁGENES ===================
app.get('/proxy-image', async (req, res) => {
  const { url } = req.query;
  console.log(`[PROXY IMAGE] Solicitud de imagen: ${url}`);

  if (!url) {
    console.warn('[PROXY IMAGE] Parámetro url faltante');
    return res.status(400).send('URL faltante');
  }

  try {
    console.log(`[PROXY IMAGE] Haciendo petición GET a imagen...`);
    const response = await axios.get(url, { responseType: 'stream', timeout: 10000 });
    res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store');
    console.log(`[PROXY IMAGE] Encabezados seteados, transmitiendo imagen...`);
    response.data.pipe(res);
  } catch (err) {
    console.error(`[PROXY IMAGE] Error al obtener imagen: ${err.message}`);
    res.status(500).send(`Error al obtener imagen: ${err.message}`);
  }
});

// =================== BROWSERLESS Y EXTRACTORS ===================
async function extractAllVideoLinks(pageUrl) {
  console.log(`[EXTRACTOR] Extrayendo videos desde: ${pageUrl}`);
  const { data: html } = await axios.get(pageUrl);
  const $ = cheerio.load(html);
  let videos = [];

  $('script').each((_, el) => {
    const scriptContent = $(el).html();
    let match = scriptContent && scriptContent.match(/var\s+videos\s*=\s*(\{[\s\S]*?\});/s);
    if (match) {
      try {
        const rawJson = match[1].replace(/\\\//g, '/');
        console.log(`[EXTRACTOR] Encontrado objeto videos JSON, intentando parsear...`);
        const videosObject = JSON.parse(rawJson);
        if (videosObject.SUB) {
          videos = videosObject.SUB.map(v => ({
            servidor: v.server || v[0],
            url: v.url || v.code || v[1]
          }));
          console.log(`[EXTRACTOR] Videos extraídos: ${JSON.stringify(videos)}`);
        }
        return false; // break each
      } catch (err) {
        console.error(`[EXTRACTOR] Error parseando videos JSON:`, err);
      }
    }
  });

  console.log(`[EXTRACTOR] Extracción finalizada, total videos: ${videos.length}`);
  return videos;
}

async function extractFromSW(swiftUrl) {
  console.log(`[EXTRACTOR SW] Iniciando extracción SW para URL: ${swiftUrl}`);
  const browser = await firefox.connect({
    wsEndpoint: 'wss://production-sfo.browserless.io/firefox/playwright?token=2SV8d19pqX3Rqww615a28370a099593392e6e89e6395e4e63'
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const m3u8Urls = new Set();

  page.on('requestfinished', request => {
    const url = request.url();
    if (url.includes('.m3u8')) {
      console.log(`[EXTRACTOR SW] Detectado archivo .m3u8: ${url}`);
      m3u8Urls.add(url);
    }
  });

  console.log(`[EXTRACTOR SW] Navegando a ${swiftUrl}`);
  await page.goto(swiftUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(7000);
  console.log(`[EXTRACTOR SW] Espera finalizada, extrayendo contenidos m3u8...`);

  const m3u8Contents = [];

  for (const url of m3u8Urls) {
    try {
      const content = await page.evaluate(async (m3u8url) => {
        const resp = await fetch(m3u8url);
        return await resp.text();
      }, url);
      console.log(`[EXTRACTOR SW] Contenido extraído de ${url} (longitud: ${content.length})`);
      m3u8Contents.push({ url, content });
    } catch (err) {
      console.error(`[EXTRACTOR SW] Error obteniendo contenido de ${url}:`, err);
    }
  }

  await browser.close();
  console.log(`[EXTRACTOR SW] Navegador cerrado, extracción SW terminada`);
  return m3u8Contents;
}

async function interceptPuppeteer(pageUrl, fileRegex, refererMatch) {
  console.log(`[INTERCEPT] Iniciando Puppeteer para ${pageUrl}, buscando patrón: ${fileRegex} (referer: ${refererMatch})`);
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
        console.error(`[INTERCEPT] Timeout: No se detectó archivo válido para ${refererMatch}`);
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
        console.log(`[INTERCEPT] Archivo válido detectado: ${reqUrl}`);
        await page.close();
        await browser.close();
        if (reqUrl.includes('novideo.mp4')) {
          console.warn(`[INTERCEPT] Servidor "${refererMatch}" devolvió novideo.mp4`);
          return reject(new Error(`⚠ El servidor "${refererMatch}" devolvió novideo.mp4`));
        }
        resolve({ url: reqUrl });
      }
    });

    try {
      console.log(`[INTERCEPT] Navegando a la URL: ${pageUrl}`);
      await page.setUserAgent('Mozilla/5.0');
      await page.goto(pageUrl, { waitUntil: 'networkidle2' });
      console.log(`[INTERCEPT] Página cargada correctamente`);
    } catch (e) {
      if (!resolved) {
        clearTimeout(timeout);
        resolved = true;
        console.error(`[INTERCEPT] Error navegando la página:`, e);
        await page.close();
        await browser.close();
        reject(e);
      }
    }
  });
}

const extractors = {
  'yourupload': url => {
    console.log(`[EXTRACTOR] YourUpload seleccionado para url: ${url}`);
    return interceptPuppeteer(url, /\.mp4$/, 'yourupload.com');
  },
  'yu': url => {
    console.log(`[EXTRACTOR] YourUpload (alias yu) seleccionado para url: ${url}`);
    return interceptPuppeteer(url, /\.mp4$/, 'yourupload.com');
  },
  'stape': url => {
    console.log(`[EXTRACTOR] Stape seleccionado para url: ${url}`);
    return interceptPuppeteer(url, /\.mp4$/, 'stape');
  },
  'streamtape': url => {
    console.log(`[EXTRACTOR] Streamtape seleccionado para url: ${url}`);
    return interceptPuppeteer(url, /\.mp4$/, 'streamtape');
  },
  'voe': url => {
    console.log(`[EXTRACTOR] Voe seleccionado para url: ${url}`);
    return interceptPuppeteer(url, /\.mp4$/, 'voe');
  },
  'ok.ru': url => {
    console.log(`[EXTRACTOR] OK.ru seleccionado para url: ${url}`);
    return interceptPuppeteer(url, /\.mp4$/, 'ok.ru');
  },
  'okru': url => {
    console.log(`[EXTRACTOR] OK.ru (alias okru) seleccionado para url: ${url}`);
    return interceptPuppeteer(url, /\.mp4$/, 'ok.ru');
  },
  'streamwish': url => {
    console.log(`[EXTRACTOR] Streamwish seleccionado para url: ${url}`);
    return extractFromSW(url);
  },
  'swiftplayers': url => {
    console.log(`[EXTRACTOR] Swiftplayers seleccionado para url: ${url}`);
    return extractFromSW(url);
  },
  'sw': url => {
    console.log(`[EXTRACTOR] SW seleccionado para url: ${url}`);
    return extractFromSW(url);
  }
};

function getExtractor(name) {
  console.log(`[EXTRACTOR] Buscando extractor para: ${name}`);
  return extractors[name.toLowerCase()];
}

// =================== API STREAMING ===================
app.get('/api/servers', async (req, res) => {
  const pageUrl = req.query.url;
  console.log(`[API SERVERS] Solicitud para url: ${pageUrl}`);

  if (!pageUrl) {
    console.warn(`[API SERVERS] Falta parámetro url`);
    return res.status(400).json({ error: 'Falta parámetro url' });
  }

  try {
    const videos = await extractAllVideoLinks(pageUrl);
    console.log(`[API SERVERS] Videos extraídos:`, videos);
    const valid = videos.filter(v => getExtractor(v.servidor));
    console.log(`[API SERVERS] Videos con extractores válidos:`, valid);
    res.json(valid);
  } catch (e) {
    console.error(`[API SERVERS] Error:`, e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api', async (req, res) => {
  const pageUrl = req.query.url;
  const serverRequested = req.query.server;
  console.log(`[API] Solicitud con url=${pageUrl}, server=${serverRequested}`);

  if (!pageUrl) {
    console.warn(`[API] Falta parámetro url`);
    return res.status(400).send('Falta parámetro url');
  }

  try {
    const videos = await extractAllVideoLinks(pageUrl);
    console.log(`[API] Videos extraídos:`, videos);
    const valid = videos.filter(v => getExtractor(v.servidor));
    if (!valid.length) {
      console.warn(`[API] No hay servidores válidos`);
      return res.status(404).send('No hay servidores válidos');
    }

    let selected = valid[0];
    if (serverRequested) {
      const found = valid.find(v => v.servidor.toLowerCase() === serverRequested.toLowerCase());
      if (!found) {
        console.warn(`[API] Servidor solicitado no soportado: ${serverRequested}`);
        return res.status(404).send(`Servidor '${serverRequested}' no soportado`);
      }
      selected = found;
    }
    console.log(`[API] Servidor seleccionado: ${selected.servidor}`);

    const extractor = getExtractor(selected.servidor);
    const result = await extractor(selected.url);

    console.log(`[API] Resultado del extractor:`, result);

    if (Array.isArray(result) && result[0]?.content) {
      console.log(`[API] Respondiendo con lista de archivos m3u8`);
      return res.json({ count: result.length, files: result, firstUrl: result[0].url });
    }

    if (result?.url) {
      console.log(`[API] Redireccionando a url de video: ${result.url}`);
      return res.redirect(`/api/stream?videoUrl=${encodeURIComponent(result.url)}`);
    }

    throw new Error('Formato de extractor no reconocido');
  } catch (e) {
    console.error(`[API] Error interno:`, e);
    res.status(500).send('Error interno del servidor: ' + e.message);
  }
});

app.get('/api/m3u8', async (req, res) => {
  const { url } = req.query;
  console.log(`[API M3U8] Solicitud para url: ${url}`);
  const apiUrl = `${req.protocol}://${req.get('host')}/api?url=${encodeURIComponent(url)}&server=sw`;

  try {
    const swRes = await axios.get(apiUrl);
    const files = swRes.data.files || [];
    console.log(`[API M3U8] Archivos recibidos: ${files.length}`);
    const best = files.find(f => f.url.includes('index-f2')) || files[0];
    if (!best || !best.content) {
      console.warn(`[API M3U8] No se encontró contenido válido, respondiendo lista vacía`);
      return res.status(404).send('#EXTM3U\n#EXT-X-ENDLIST\n');
    }

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    console.log(`[API M3U8] Enviando contenido m3u8 (longitud: ${best.content.length})`);
    res.send(best.content);
  } catch (e) {
    console.error(`[API M3U8] Error:`, e);
    res.status(500).send('#EXTM3U\n#EXT-X-ENDLIST\n');
  }
});

app.get('/api/stream', (req, res) => {
  const videoUrl = req.query.videoUrl;
  console.log(`[API STREAM] Solicitud para videoUrl: ${videoUrl}`);

  if (!videoUrl) {
    console.warn(`[API STREAM] Falta parámetro videoUrl`);
    return res.status(400).send('Falta parámetro videoUrl');
  }

  const parsedUrl = urlLib.parse(videoUrl);
  const isHttps = parsedUrl.protocol === 'https:';
  const protocol = isHttps ? https : http;

  const headers = {
    'Referer': 'https://www.yourupload.com/',
    'Origin': 'https://www.yourupload.com',
    'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0'
  };
  if (req.headers.range) headers['Range'] = req.headers.range;

  console.log(`[API STREAM] Opciones de petición:`, {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (isHttps ? 443 : 80),
    path: parsedUrl.path + (parsedUrl.search || ''),
    headers
  });

  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (isHttps ? 443 : 80),
    path: parsedUrl.path + (parsedUrl.search || ''),
    method: 'GET',
    headers,
    rejectUnauthorized: false,
  };

  const proxyReq = protocol.request(options, (proxyRes) => {
    console.log(`[API STREAM] Respuesta recibida con status: ${proxyRes.statusCode}`);
    proxyRes.headers['Content-Disposition'] = 'inline; filename="video.mp4"';
    proxyRes.headers['Content-Type'] = 'video/mp4';
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', err => {
    console.error(`[API STREAM] Error en proxy:`, err);
    if (!res.headersSent) {
      res.status(500).send('Error al obtener el video: ' + err.message);
    } else {
      res.end();
    }
  });

  proxyReq.end();
});

// =================== AUTO MANTENIMIENTO ===================
console.log(`[AUTO MANTENIMIENTO] Se configuró auto mantenimiento cada 24 horas`);
setInterval(iniciarMantenimiento, 24 * 60 * 60 * 1000);

// =================== SERVIDOR INICIADO ===================
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
