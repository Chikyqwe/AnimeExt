// src/utils/helpers.js
const axios = require('axios');
const urlLib = require('url');
const { slowAES } = require('./aes'); // aes.js adaptado a CommonJS
const cheerio = require('cheerio');
const { http, https } = require('follow-redirects');
const httpNative = require('http');
const httpsNative = require('https');

// ----------------------
// Configuración de axios
// ----------------------
// Por seguridad contra acumulación de sockets, por defecto usamos keepAlive: false.
// Si en tu entorno quieres performance y controlas pool de conexiones, cambia a true.
const defaultHttpAgent = new httpNative.Agent({ keepAlive: false });
const defaultHttpsAgent = new httpsNative.Agent({ keepAlive: false });

const axiosInstance = axios.create({
  httpAgent: defaultHttpAgent,
  httpsAgent: defaultHttpsAgent,
  headers: { "Accept-Encoding": "gzip, deflate, br" },
  timeout: 20000 // timeout por defecto para evitar requests colgados
});

// Helper para convertir bytes a MB (string)
function toMB(bytes) {
  return (bytes / 1024 / 1024).toFixed(2);
}

// ----------------------
// proxyImage optimizado
// ----------------------
async function proxyImage(url, res) {
  if (!url) {
    console.warn('[PROXY IMAGE] Parámetro url faltante');
    return res.status(400).send('URL faltante');
  }

  const controller = new AbortController();
  const signal = controller.signal;
  let sourceStream = null;

  // Si el cliente cierra, abortamos la petición externa y limpiamos
  const onClientClose = () => {
    try { controller.abort(); } catch (e) {}
    if (sourceStream && typeof sourceStream.destroy === 'function') {
      try { sourceStream.destroy(); } catch (e) {}
    }
  };
  res.on('close', onClientClose);

  try {
    const response = await axiosInstance.get(url, { responseType: 'stream', signal });
    sourceStream = response.data;

    // cabeceras
    res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store');

    // manejar errores del stream remoto
    const onSourceError = (err) => {
      console.error(`[PROXY IMAGE] Error stream fuente: ${err?.message || err}`);
      try { res.status(500).end('Error al obtener imagen'); } catch (e) {}
    };
    sourceStream.on('error', onSourceError);

    // pipe y limpieza cuando termine
    sourceStream.pipe(res);
    sourceStream.on('end', () => {
      res.end();
      // limpiar listeners
      sourceStream.removeListener('error', onSourceError);
      res.removeListener('close', onClientClose);
    });

  } catch (err) {
    // si fue abortado por close, no logueamos como error ruidoso
    if (err && err.name === 'CanceledError') {
      // petición abortada por el cliente
      return;
    }
    console.error(`[PROXY IMAGE] Error al obtener imagen: ${err.message || err}`);
    try { res.status(500).send(`Error al obtener imagen: ${err.message || 'unknown'}`); } catch (e) {}
    res.removeListener('close', onClientClose);
  }
}

// ----------------------
// streamVideo optimizado
// ----------------------
function streamVideo(videoUrl, req, res) {
  if (!videoUrl) return res.status(400).send('Falta parámetro videoUrl');

  // CORS / políticas
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length');

  const parsedUrl = urlLib.parse(videoUrl);
  const isHttps = parsedUrl.protocol === 'https:';
  const protocol = isHttps ? https : http;

  const referer = parsedUrl.hostname && parsedUrl.hostname.includes
    ? (parsedUrl.hostname.includes('burstcloud.co')
        ? 'https://burstcloud.co/'
        : parsedUrl.hostname.includes('vidcache.net')
          ? 'https://www.yourupload.com/'
          : 'https://www.mp4upload.com/')
    : 'https://www.mp4upload.com/';

  let start = 0;
  const rangeHeader = req.headers.range;
  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-/);
    if (match) start = parseInt(match[1], 10);
  }

  // límites para reconexiones (evita loop infinito)
  const MAX_RECONNECTS = 3;
  let reconnectAttempts = 0;
  let activeReq = null;
  let destroyed = false;

  function cleanupListeners() {
    if (activeReq && typeof activeReq.destroy === 'function') {
      try { activeReq.destroy(); } catch (e) {}
    }
  }

  // si el cliente cierra la conexión, abortamos totalmente
  req.on('close', () => {
    destroyed = true;
    cleanupListeners();
  });

  function requestChunk(from) {
    if (destroyed) return;

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
      rejectUnauthorized: false,
      maxRedirects: 3
    };

    reconnectAttempts++;
    activeReq = protocol.request(options, (proxyRes) => {
      reconnectAttempts = 0; // éxito, reset
      if (proxyRes.statusCode >= 400) {
        try { res.status(proxyRes.statusCode).send('Video no disponible: ' + proxyRes.statusMessage); } catch (e) {}
        return;
      }

      if (!res.headersSent) {
        const headersToSend = {
          'Content-Type': proxyRes.headers['content-type'] || 'video/mp4',
          'Accept-Ranges': 'bytes',
          'Content-Length': proxyRes.headers['content-length'] || undefined,
          'Content-Disposition': 'inline'
        };
        if (proxyRes.headers['content-range']) headersToSend['Content-Range'] = proxyRes.headers['content-range'];
        res.writeHead(proxyRes.statusCode, headersToSend);
      }

      // Escuchar datos y pasar al cliente
      const onData = chunk => {
        start += chunk.length;
        try { res.write(chunk); } catch (e) {}
      };

      const onEnd = () => {
        try { res.end(); } catch (e) {}
        proxyRes.removeListener('data', onData);
        proxyRes.removeListener('end', onEnd);
        proxyRes.removeListener('error', onError);
      };

      const onError = (err) => {
        proxyRes.removeListener('data', onData);
        proxyRes.removeListener('end', onEnd);
        proxyRes.removeListener('error', onError);

        if (destroyed) return;

        if (reconnectAttempts < MAX_RECONNECTS) {
          // Intentar reconexión con backoff pequeño
          setTimeout(() => requestChunk(start), 500 * reconnectAttempts);
        } else {
          try { res.status(502).end('Error streaming video'); } catch (e) {}
        }
      };

      proxyRes.on('data', onData);
      proxyRes.on('end', onEnd);
      proxyRes.on('error', onError);

      // cuando el cliente cierra, destruir la respuesta remota
      res.on('close', () => {
        try { proxyRes.destroy(); } catch (e) {}
      });
    });

    activeReq.on('timeout', () => {
      try { activeReq.abort(); } catch (e) {}
      if (!destroyed && reconnectAttempts < MAX_RECONNECTS) setTimeout(() => requestChunk(start), 500 * reconnectAttempts);
    });

    activeReq.on('error', (err) => {
      if (destroyed) return;
      if (reconnectAttempts < MAX_RECONNECTS) {
        setTimeout(() => requestChunk(start), 500 * reconnectAttempts);
      } else {
        try { res.status(502).end('Error en conexión al origen'); } catch (e) {}
      }
    });

    activeReq.setTimeout(20000);
    activeReq.end();
  }

  requestChunk(start);
}

// --------------------------------
// validateVideoUrl (con cleanup)
// --------------------------------
function validateVideoUrl(videoUrl, timeoutMs = 5000) {
  console.log(`[VALIDATE VIDEO URL] Validando URL: ${videoUrl}`);
  return new Promise((resolve) => {
    if (!videoUrl) return resolve(false);

    const parsedUrl = urlLib.parse(videoUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const protocol = isHttps ? https : http;

    const referer = parsedUrl.hostname && parsedUrl.hostname.includes
      ? (parsedUrl.hostname.includes('burstcloud.co')
          ? 'https://burstcloud.co/'
          : parsedUrl.hostname.includes('vidcache.net')
            ? 'https://www.yourupload.com/'
            : 'https://www.mp4upload.com/')
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
      // limpiar listeners y cerrar socket
      res.on('end', () => {
        try { req.destroy(); } catch (e) {}
      });
      resolve(isValidStatus && byContent);
    });

    req.on('timeout', () => {
      try { req.destroy(); } catch (e) {}
      resolve(false);
    });

    req.on('error', () => {
      try { req.destroy(); } catch (e) {}
      resolve(false);
    });

    req.end();
  });
}

// ----------------------
// util crypto helpers
// ----------------------
function toNumbers(d) {
  const e = [];
  d.replace(/(..)/g, (m) => e.push(parseInt(m, 16)));
  return e;
}

function toHex(arr) {
  return arr.map(v => (v < 16 ? '0' : '') + v.toString(16)).join('').toLowerCase();
}

// ----------------------
// urlEpAX optimizado
// ----------------------
// ----------------------
// getCookie optimizado
// ----------------------
async function getCookie(apiUrl) {
  let html = null;
  try {
    const resp = await axiosInstance.get(apiUrl, {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    html = resp.data;
  } catch (err) {
    throw new Error('No se pudo obtener HTML para cookie: ' + (err?.message || err));
  }

  try {
    const match = html.match(/toNumbers\("([0-9a-f]+)"\).*toNumbers\("([0-9a-f]+)"\).*toNumbers\("([0-9a-f]+)"\)/s);
    if (!match) throw new Error("No se pudieron extraer datos de cifrado");

    const a = toNumbers(match[1]);
    const b = toNumbers(match[2]);
    const c = toNumbers(match[3]);
    const cookieVal = toHex(slowAES.decrypt(c, 2, a, b));

    // limpieza
    html = null;
    a.length = 0;
    b.length = 0;
    c.length = 0;
    console.log('[GET COOKIE] Cookie obtenida:', cookieVal);
    return cookieVal;
  } catch (err) {
    throw err;
  }
}

// ----------------------
// getDescription optimizado
// ----------------------
async function getDescription(url) {
  console.log(`[DESCRIPTION] Buscando descripción en ${url}`);
  let html = null;
  let $ = null;
  try {
    const resp = await axiosInstance.get(url, { timeout: 15000 });
    html = resp.data;
    $ = cheerio.load(html);

    let description = '';

    if ($('section.WdgtCn .Description p').length) {
      description = $('section.WdgtCn .Description p').text().trim();
      console.log('[SOURCE] AnimeFLV detectado');
    } else if ($('aside p.sinopsis').length) {
      description = $('aside p.sinopsis').text().trim();
      console.log('[SOURCE] Tio de aquí detectado');
    } else if ($('div.entry-content[itemprop="description"] p').length) {
      description = $('div.entry-content[itemprop="description"] p').map((i, el) => $(el).text()).get().join('\n').trim();
      console.log('[SOURCE] YTX detectado');
    } else {
      description = $('meta[name="description"]').attr('content') || '';
      description = description.trim();
      console.log('[SOURCE] Meta description fallback');
    }

    // limpiar cheerio / html para facilitar GC
    try { $.root().empty(); } catch (e) {}
    html = null;
    $ = null;

    return description;
  } catch (err) {
    console.error(`[DESCRIPTION] Error al obtener descripción: ${err.message || err}`);
    // limpiar antes de salir
    try { $.root().empty(); } catch (e) {}
    html = null;
    $ = null;
    return '';
  }
}

// ----------------------
// getEpisodes optimizado
// ----------------------
async function getEpisodes(url) {
  let data = null;
  try {
    const response = await axiosInstance.get(url, { timeout: 15000 });
    data = response.data;
  } catch (error) {
    if (error.response) {
      console.info(`[Axios] HTTP ${error.response.status} al obtener ${url}`);
    } else if (error.request) {
      console.info(`[Axios] No hubo respuesta al intentar ${url}`);
    } else {
      console.infos(`[Axios] Error al hacer request a ${url}:`, error.message);
    }
    return { success: false };
  }

  // CASO 1/2: anime_info + episodes en <script>
  const animeInfoMatch = (typeof data === 'string') ? data.match(/var\s+anime_info\s*=\s*(\[[^\]]+\])/) : null;
  const episodesMatch = (typeof data === 'string') ? data.match(/var\s+episodes\s*=\s*(\[[\s\S]*?\]);/) : null;

  if (animeInfoMatch && episodesMatch) {
    let anime_info;
    let episodesRaw;
    try {
      anime_info = Function(`return ${animeInfoMatch[1]}`)();
      episodesRaw = Function(`return ${episodesMatch[1]}`)();
    } catch (err) {
      console.error('[getEpisodes] Error ejecutando script:', err?.message || err);
      return { success: false };
    }

    const episodes =
      Array.isArray(episodesRaw[0])
        ? episodesRaw.map(e => ({ number: e[0], id: e[1] }))
        : episodesRaw.map(num => ({ number: num }));

    // limpiar referencias grandes
    data = null;
    episodesRaw = null;

    return {
      raw: anime_info,
      source: "AnimeFLV",
      title: anime_info[2],
      slug: anime_info[1],
      isNewEP: anime_info[3],
      isEnd: anime_info.length === 3,
      episodes_count: episodes.length,
      episodes
    };
  }

  // CASO 3: AnimeYTX con <li>
  try {
    const $ = cheerio.load(data);
    const eps = [];

    $("li[data-index]").each((i, el) => {
      const num = parseInt($(el).find(".epl-num").text().trim(), 10);
      if (!Number.isNaN(num)) eps.push({ number: num });
    });

    // limpiar cheerio
    try { $.root().empty(); } catch (e) {}

    if (eps.length > 0) {
      const title = $("title").text().replace(" - AnimeYT", "").trim();
      data = null;
      return {
        source: "AnimeYTX",
        title,
        isEnd: false,
        episodes_count: eps.length,
        episodes: eps
      };
    }
  } catch (err) {
    console.error('[getEpisodes] Error parseando HTML:', err?.message || err);
  }

  data = null;
  return { success: false };
}

// función placeholder para downloadVideo 
function downloadVideo(req, res) {
  // implementación segura pendiente
  return false;
}

module.exports = {
  getCookie,
  getEpisodes,
  proxyImage,
  getDescription,
  streamVideo,
  downloadVideo,
  validateVideoUrl
};
