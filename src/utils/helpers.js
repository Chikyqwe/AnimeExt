// src/utils/helpers.js
const axios = require('axios');
const urlLib = require('url');
const { http, https } = require('follow-redirects');

// Funci�n para el proxy de im�genes
async function proxyImage(url, res) {
  console.log(`[PROXY IMAGE] Solicitud de imagen para URL: ${url} `);

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
    
    console.log(`[PROXY IMAGE] Imagen obtenida con status: ${response.status}`);
    response.data.pipe(res);
  } catch (err) {
    console.error(`[PROXY IMAGE] Error al obtener imagen: ${err.message}`);
    res.status(500).send(`Error al obtener imagen: ${err.message}`);
  }
}

// Funci�n para el stream de video
function streamVideo(videoUrl, req, res) {
  console.log(`[API STREAM] Solicitud para videoUrl${videoUrl}`);

  if (!videoUrl) {
    console.warn(`[API STREAM] Falta par�metro videoUrl`);
    return res.status(400).send('Falta par�metro videoUrl');
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

  console.log(`[API STREAM] Opciones de petici�n:`, {
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
}

module.exports = {
  proxyImage,
  streamVideo
};