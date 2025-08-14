// src/utils/helpers.js
const axios = require('axios');
const urlLib = require('url');
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

// Función para el stream de video
function streamVideo(videoUrl, req, res) {
  console.log(`[API STREAM] Solicitud para videoUrl: ${videoUrl}`);

  if (!videoUrl) {
    console.warn(`[API STREAM] Falta parámetro videoUrl`);
    return res.status(400).send('Falta parámetro videoUrl');
  }

  const parsedUrl = urlLib.parse(videoUrl);
  const isHttps = parsedUrl.protocol === 'https:';
  const protocol = isHttps ? https : http;

  // Detectar dominio para el Referer
  const referer = parsedUrl.hostname.includes('burstcloud.co')
    ? 'https://burstcloud.co/'
    : 'https://www.yourupload.com/';

  const headers = {
    'Referer': referer,
    'Origin': referer,
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

  console.log(`[API STREAM] Opciones de petición:`, options);

  const TIMEOUT_MS = 5000;

  const proxyReq = protocol.request(options, (proxyRes) => {
    console.log(`[API STREAM] Respuesta recibida con status: ${proxyRes.statusCode}`);

    if (proxyRes.statusCode >= 400) {
      console.warn(`[API STREAM] Código de error ${proxyRes.statusCode} desde origen`);
      return res.status(proxyRes.statusCode).send('Video no disponible');
    }

    const contentType = proxyRes.headers['content-type'] || '';
    if (!contentType.startsWith('video/')) {
      console.warn(`[API STREAM] Tipo de contenido inesperado: ${contentType}`);
      return res.status(415).send('Contenido no válido para streaming de video');
    }

    proxyRes.headers['Content-Disposition'] = 'inline; filename="video.mp4"';
    proxyRes.headers['Content-Type'] = 'video/mp4';
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.setTimeout(TIMEOUT_MS, () => {
    console.error('[API STREAM] Tiempo de espera agotado para la solicitud al origen');
    proxyReq.abort();
    if (!res.headersSent) res.status(504).send('Tiempo de espera agotado al conectar con el video');
    else res.end();
  });

  proxyReq.on('error', err => {
    console.error('[API STREAM] Error en proxy:', err);
    if (!res.headersSent) res.status(500).send('Error al obtener el video: ' + err.message);
    else res.end();
  });

  proxyReq.end();
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

    // Ignorar validación para BurstCloud
    if (videoUrl.includes('burstcloud.co')) return resolve(true);

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


async function urlEpAX(urlPagina, capNum) {
  console.log(`[URL EPAX] Buscando episodio ${capNum} en ${urlPagina}`);

  const capNumber = Number(capNum);
  if (isNaN(capNumber)) {
    console.warn(`[URL EPAX] capNum no es un número válido: ${capNum}`);
    return null;
  }

  try {
    const { data } = await axios.get(urlPagina, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Origin': urlPagina,
        'Referer': urlPagina,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      }
    });

    const $ = cheerio.load(data);
    let urlEpisodio = null;
    const elems = $('.eplister ul li').toArray();

    for (const elem of elems) {
      const numTextoRaw = $(elem).find('.epl-num').text();
      const numTexto = numTextoRaw.trim();
      const match = numTexto.match(/^(\d+)/);
      if (!match) continue;

      const numero = parseInt(match[1], 10);
      if (numero === capNumber) {
        urlEpisodio = $(elem).find('a').attr('href') || null;
        console.log(`[URL EPAX] Episodio encontrado: ${numero} URL: ${urlEpisodio}`);
        break;
      }
    }

    if (!urlEpisodio) console.warn(`[URL EPAX] No se encontró URL para episodio ${capNumber}`);
    return urlEpisodio;

  } catch (error) {
    console.error(`[URL EPAX] Error al obtener la página: ${error.message}`);
    return null;
  }
}



module.exports = {
  proxyImage,
  streamVideo,
  downloadVideo,
  urlEpAX,
  validateVideoUrl
};