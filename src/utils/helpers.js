// src/utils/helpers.js
const axios = require('axios');
const urlLib = require('url');
const { slowAES } = require('./aes'); // aes.js adaptado a CommonJS
const cheerio = require('cheerio');
const { http, https } = require('follow-redirects');

// Funci�n para el proxy de im�genes
async function proxyImage(url, res) {
  if (!url) {
    console.warn('[PROXY IMAGE] Parámetro url faltante');
    return res.status(400).send('URL faltante');
  }

  try {
    // muestra la url en el log pls
    console.log(`[PROXY IMAGE] Haciendo petición GET a imagen: ${url}`);
    const response = await axios.get(url, { responseType: 'stream', timeout: 10000 });
    res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store');
    
    response.data.pipe(res);
  } catch (err) {
    console.error(`[PROXY IMAGE] Error al obtener imagen: ${err.message}`);
    res.status(500).send(`Error al obtener imagen: ${err.message}`);
  }
}
const TIMEOUT_MS = 20000; // 20 segundos

// Función para el stream de video
function streamVideo(videoUrl, req, res) {
  if (!videoUrl) return res.status(400).send('Falta parámetro videoUrl');

  const parsedUrl = urlLib.parse(videoUrl);
  const isHttps = parsedUrl.protocol === 'https:';
  const protocol = isHttps ? https : http;

  const referer = parsedUrl.hostname.includes('burstcloud.co')
    ? 'https://burstcloud.co/'
    : parsedUrl.hostname.includes('vidcache.net')
      ? 'https://www.yourupload.com/'
      : 'https://www.mp4upload.com/';

  let start = 0;
  const rangeHeader = req.headers.range;
  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-/);
    if (match) start = parseInt(match[1], 10);
  }

  function requestChunk(from) {
    const headers = {
      'Referer': referer,
      'Origin': referer,
      'User-Agent': 'Mozilla/5.0'
    };
    if (from > 0) headers['Range'] = `bytes=${from}-`;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.path + (parsedUrl.search || ''),
      method: 'GET',
      headers,
      rejectUnauthorized: false
    };

    const proxyReq = protocol.request(options, (proxyRes) => {
      if (proxyRes.statusCode >= 400) return res.status(proxyRes.statusCode).send('Video no disponible: ' + proxyRes.statusMessage);

      if (!res.headersSent) {
        const headersToSend = {
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'bytes',
          'Content-Length': proxyRes.headers['content-length'],
          'Content-Disposition': 'inline'
        };
        if (proxyRes.headers['content-range']) headersToSend['Content-Range'] = proxyRes.headers['content-range'];

        res.writeHead(proxyRes.statusCode, headersToSend);
      }

      proxyRes.on('data', (chunk) => {
        start += chunk.length;
        res.write(chunk);
      });

      proxyRes.on('end', () => {
        res.end();
      });

      proxyRes.on('error', () => {
        // Reconectar automáticamente desde el último byte
        requestChunk(start);
      });

      res.on('close', () => {
        proxyRes.destroy();
      });
    });

    proxyReq.on('timeout', () => {
      proxyReq.abort();
      requestChunk(start);
    });

    proxyReq.on('error', () => {
      requestChunk(start);
    });

    proxyReq.setTimeout(20000); // 20 segundos
    proxyReq.end();
  }

  requestChunk(start);
}


// funcion para descargar el video con los headers correctos
function downloadVideo(req, res) {
  return false;
}

function validateVideoUrl(videoUrl, timeoutMs = 5000) {
  console.log(`[VALIDATE VIDEO URL] Validando URL: ${videoUrl}`);
  return new Promise((resolve) => {
    if (!videoUrl) return resolve(false);

    const parsedUrl = urlLib.parse(videoUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const protocol = isHttps ? https : http;
  const referer = parsedUrl.hostname.includes('burstcloud.co')
    ? 'https://burstcloud.co/'
    : parsedUrl.hostname.includes('vidcache.net')
      ? 'https://www.yourupload.com/'
      : 'https://www.mp4upload.com/';
    const options = {
      method: 'HEAD',
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.path + (parsedUrl.search || ''),
      headers: {
        'Referer': referer,
        'Origin': referer,
        'User-Agent': 'Mozilla/5.0'
      },
      timeout: timeoutMs,
      rejectUnauthorized: false
    };

    const req = protocol.request(options, (res) => {
      const isValidStatus = [200, 206].includes(res.statusCode);
      const contentLength = parseInt(res.headers['content-length'] || '0', 10);
      const byContent = contentLength > 1000000; // > 1MB
      console.log('Content-Length:', contentLength);
      resolve(isValidStatus && byContent);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.on('error', () => resolve(false));
    req.end();
  });
}

function toNumbers(d) {
  const e = [];
  d.replace(/(..)/g, (m) => e.push(parseInt(m, 16)));
  return e;
}

function toHex(arr) {
  return arr.map(v => (v < 16 ? '0' : '') + v.toString(16)).join('').toLowerCase();
}

async function urlEpAX(urlPagina, capNum) {
  console.log(`[URL EPAX] Buscando episodio ${capNum} en ${urlPagina}`);

  const apiUrl = `https://animeext.xo.je/get_vid.php?url=${encodeURIComponent(urlPagina)}&ep=${encodeURIComponent(capNum)}`;

  // 1️⃣ Obtener HTML inicial que contiene el script de la cookie
  const { data: html } = await axios.get(apiUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });

  // 2️⃣ Extraer a, b, c del script usando regex
  const match = html.match(/toNumbers\("([0-9a-f]+)"\).*toNumbers\("([0-9a-f]+)"\).*toNumbers\("([0-9a-f]+)"\)/s);
  if (!match) throw new Error("No se pudieron extraer datos de cifrado");

  const a = toNumbers(match[1]);
  const b = toNumbers(match[2]);
  const c = toNumbers(match[3]);

  // 3️⃣ Calcular valor de cookie
  const cookieVal = toHex(slowAES.decrypt(c, 2, a, b));

  // 4️⃣ Rehacer petición con cookie
  const { data: jsonData } = await axios.get(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Cookie': `__test=${cookieVal}`
    }
  });

  if (!jsonData.success) {
    console.log(jsonData)
    console.warn(`[URL EPAX] Error desde API: ${jsonData.error || 'Respuesta inválida'}`);
    return null;
  }

  console.log(`[URL EPAX] Episodio encontrado: ${jsonData.capitulo} URL: ${jsonData.url_episodio}`);
  return jsonData.url_episodio;
}
async function getCookie(apiUrl) {
  const { data: html } = await axios.get(apiUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });

  const match = html.match(/toNumbers\("([0-9a-f]+)"\).*toNumbers\("([0-9a-f]+)"\).*toNumbers\("([0-9a-f]+)"\)/s);
  if (!match) throw new Error("No se pudieron extraer datos de cifrado");

  const a = toNumbers(match[1]);
  const b = toNumbers(match[2]);
  const c = toNumbers(match[3]);

  const cookieVal = toHex(slowAES.decrypt(c, 2, a, b));
  return cookieVal;
}

async function getDescription(url) {
  console.log(`[DESCRIPTION] Buscando descripción en ${url}`);
  try {
    const { data: html } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(html);

    let description = '';

    // 1️⃣ AnimeFLV
    if ($('section.WdgtCn .Description p').length) {
      description = $('section.WdgtCn .Description p').text().trim();
      console.log('[SOURCE] AnimeFLV detectado');
    }
    // 2️⃣ Tio de aquí
    else if ($('aside p.sinopsis').length) {
      description = $('aside p.sinopsis').text().trim();
      console.log('[SOURCE] Tio de aquí detectado');
    }
    // 3️⃣ YTX
    else if ($('div.entry-content[itemprop="description"] p').length) {
      description = $('div.entry-content[itemprop="description"] p').map((i, el) => $(el).text()).get().join('\n').trim();
      console.log('[SOURCE] YTX detectado');
    }
    // 4️⃣ Fallback a meta description
    else {
      description = $('meta[name="description"]').attr('content') || '';
      description = description.trim();
      console.log('[SOURCE] Meta description fallback');
    }

    return description;
  } catch (err) {
    console.error(`[DESCRIPTION] Error al obtener descripción: ${err.message}`);
    return '';
  }
}

module.exports = {
  getCookie,
  proxyImage,
  getDescription,
  streamVideo,
  downloadVideo,
  urlEpAX,
  validateVideoUrl
};