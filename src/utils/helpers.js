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
    : 'https://www.yourupload.com/';

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
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0'
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
      if (proxyRes.statusCode >= 400) return res.status(proxyRes.statusCode).send('Video no disponible');

      if (!res.headersSent) {
        const headersToSend = {
          'Content-Type': proxyRes.headers['content-type'] || 'video/mp4',
          'Accept-Ranges': 'bytes',
          'Content-Length': proxyRes.headers['content-length'],
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
  const videoUrl = req.query.videoUrl;
  console.log(`[API DOWNLOAD] Solicitud para videoUrl: ${videoUrl}`);

  if (!videoUrl) {
    console.warn(`[API DOWNLOAD] Falta parámetro videoUrl`);
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

  console.log(`[API DOWNLOAD] Opciones de petición:`, {
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
    console.log(`[API DOWNLOAD] Respuesta recibida con status: ${proxyRes.statusCode}`);
    proxyRes.headers['Content-Disposition'] = 'attachment; filename="video.mp4"';
    proxyRes.headers['Content-Type'] = 'video/mp4';
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', err => {
    console.error(`[API DOWNLOAD] Error en proxy:`, err);
    if (!res.headersSent) {
      res.status(500).send('Error al obtener el video: ' + err.message);
    } else {
      res.end();
    }
  });

  proxyReq.end();
}

function validateVideoUrl(videoUrl, timeoutMs = 5000) {
  return new Promise((resolve) => {
    if (!videoUrl) return resolve(false);

    const parsedUrl = urlLib.parse(videoUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const protocol = isHttps ? https : http;

    const options = {
      method: 'HEAD',
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.path + (parsedUrl.search || ''),
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://www.yourupload.com/',
        'Origin': 'https://www.yourupload.com'
      },
      timeout: timeoutMs,
      rejectUnauthorized: false
    };

    const req = protocol.request(options, (res) => {
      const isValidStatus = [200, 206].includes(res.statusCode);
      const contentType = res.headers['content-type'] || '';
      resolve(isValidStatus && contentType.startsWith('video/'));
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
  console.log(`[URL EPAX] Buscando episodio ${capNum} usando aes.js`);

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
    console.warn(`[URL EPAX] Error desde API: ${jsonData.error || 'Respuesta inválida'}`);
    return null;
  }

  console.log(`[URL EPAX] Episodio encontrado: ${jsonData.capitulo} URL: ${jsonData.url_episodio}`);
  return jsonData.url_episodio;
}

module.exports = {
  proxyImage,
  streamVideo,
  downloadVideo,
  urlEpAX,
  validateVideoUrl
};