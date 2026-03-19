// src/utils/helpers.js
// ============================================================================
// DEPENDENCIAS
// ============================================================================
const axios = require('axios');
const urlLib = require('url');
const cheerio = require('cheerio');
const vm = require('vm');
const { http, https } = require('follow-redirects');
const httpNative = require('http');
const httpsNative = require('https');

// ============================================================================
// MÓDULO: HTTP / AXIOS
// ============================================================================
const HttpModule = (() => {
  const httpAgent = new httpNative.Agent({ keepAlive: true, maxSockets: 50 });
  const httpsAgent = new httpsNative.Agent({ keepAlive: true, maxSockets: 50 });

  const axiosInstance = axios.create({
    httpAgent,
    httpsAgent,
    timeout: 20000,
    headers: {
      'Accept-Encoding': 'gzip, deflate, br',
      'User-Agent': 'Mozilla/5.0'
    }
  });

  return { axiosInstance };
})();

// ============================================================================
// MÓDULO: REGEX + EVAL SEGURO
// ============================================================================
const ParseModule = (() => {
  const ANIME_INFO = /var\s+anime_info\s*=\s*(\[[^\]]+\])/;
  const EPISODES   = /var\s+episodes\s*=\s*(\[[\s\S]*?\]);/;
  const safeEval   = code => vm.runInNewContext(code, {}, { timeout: 100 });
  return { ANIME_INFO, EPISODES, safeEval };
})();

// ============================================================================
// MÓDULO: PATRONES (CACHE)
// ============================================================================
const PatternModule = (() => {
  const cache = { animeflv: { data: null, ts: 0 }, tio: { data: null, ts: 0 } };
  const TTL = 60 * 60 * 1000;

  async function getAnimeFLVPattern() {
    if (cache.animeflv.data && Date.now() - cache.animeflv.ts < TTL) return cache.animeflv.data;
    cache.animeflv.data = { thumbnail: (id, ep) => `https://cdn.animeflv.net/screenshots/${id}/${ep}/th_3.jpg` };
    cache.animeflv.ts = Date.now();
    return cache.animeflv.data;
  }

  async function getTioPattern() {
    if (cache.tio.data && Date.now() - cache.tio.ts < TTL) return cache.tio.data;
    cache.tio.data = {
      episode:   (slug, ep) => `https://tioanime.com/ver/${slug}-${ep}`,
      thumbnail: id => `https://tioanime.com/uploads/thumbs/${id}.jpg`
    };
    cache.tio.ts = Date.now();
    return cache.tio.data;
  }

  return { getAnimeFLVPattern, getTioPattern };
})();

// ============================================================================
// MÓDULO: SCRAPERS
// ============================================================================
const ScraperModule = (() => {
  async function extractAnimeFLV(data) {
    const info = data.match(ParseModule.ANIME_INFO);
    const eps  = data.match(ParseModule.EPISODES);
    if (!info || !eps) return null;

    const anime_info  = ParseModule.safeEval(info[1]);
    const episodesRaw = ParseModule.safeEval(eps[1]);
    const pattern     = await PatternModule.getAnimeFLVPattern();

    const episodes = episodesRaw.map(e => {
      const num = Array.isArray(e) ? e[0] : e;
      return { number: num, img: pattern.thumbnail(anime_info[0], num) };
    });

    return {
      source: 'AnimeFLV', title: anime_info[2], slug: anime_info[1],
      animeId: anime_info[0], isNewEP: anime_info[3],
      isEnd: anime_info.length === 3, episodes_count: episodes.length, episodes
    };
  }

  async function extractTio(data) {
    const info = data.match(ParseModule.ANIME_INFO);
    const eps  = data.match(ParseModule.EPISODES);
    if (!info || !eps) return null;

    const anime_info  = ParseModule.safeEval(info[1]);
    const episodesRaw = ParseModule.safeEval(eps[1]);
    const pattern     = await PatternModule.getTioPattern();

    const episodes = episodesRaw.map(e => {
      const num = Array.isArray(e) ? e[0] : e;
      return { number: num, url: pattern.episode(anime_info[1], num), img: pattern.thumbnail(anime_info[0]) };
    });

    return {
      source: 'TIO', title: anime_info[2], slug: anime_info[1],
      animeId: anime_info[0], isNewEP: anime_info[3],
      isEnd: anime_info.length === 3, episodes_count: episodes.length, episodes
    };
  }

  function extractAnimeYTX(data) {
    try {
      const $ = cheerio.load(data);
      const eps = [];
      $('li[data-index]').each((_, el) => {
        const n = parseInt($(el).find('.epl-num').text(), 10);
        if (!isNaN(n)) eps.push({ number: n });
      });
      if (!eps.length) return null;
      return {
        source: 'AnimeYTX',
        title: $('title').text().replace(' - AnimeYT', '').trim(),
        isEnd: false, episodes_count: eps.length, episodes: eps
      };
    } catch { return null; }
  }

  return { extractAnimeFLV, extractTio, extractAnimeYTX };
})();

// ============================================================================
// MÓDULO: STREAMING / PROXY
// ============================================================================
const StreamModule = (() => {

  function getRefererForHost(host) {
    if (!host) return 'https://www.mp4upload.com/';
    if (host.includes('burstcloud')) return 'https://burstcloud.co/';
    if (host.includes('vidcache'))   return 'https://www.yourupload.com/';
    return 'https://www.mp4upload.com/';
  }

  function validateVideoUrl(videoUrl, timeoutMs = 5000) {
    return new Promise((resolve) => {
      let redirects = 0;
      const maxRedirects = 5;
      let resolved = false;
      const logs = [];

      const pushLog = (type, data) => logs.push({ time: new Date().toISOString(), type, data });
      const finish  = (data) => { if (resolved) return; resolved = true; resolve({ ...data, log: logs }); };

      const doRequest = (currentUrl, method = 'HEAD') => {
        pushLog('request', { url: currentUrl, method });
        const u = urlLib.parse(currentUrl);
        const isHttps = u.protocol === 'https:';
        const agent = isHttps
          ? new https.Agent({ keepAlive: true, servername: u.hostname, rejectUnauthorized: false })
          : undefined;

        const options = {
          method, hostname: u.hostname,
          port: u.port || (isHttps ? 443 : 80),
          path: (u.pathname || '/') + (u.search || ''),
          headers: {
            Referer: 'https://www.yourupload.com/', 'User-Agent': 'Mozilla/5.0',
            ...(method === 'GET' ? { Range: 'bytes=0-1023' } : {})
          },
          agent, timeout: timeoutMs
        };

        const proto = isHttps ? https : http;
        const req = proto.request(options, (res) => {
          pushLog('response', { statusCode: res.statusCode, headers: res.headers });

          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
            if (++redirects > maxRedirects) return finish({ ok: false, reason: 'too_many_redirects' });
            const nextUrl = urlLib.resolve(currentUrl, res.headers.location);
            return doRequest(nextUrl, method);
          }

          const contentType   = res.headers['content-type'] || '';
          const contentLength = Number(res.headers['content-length'] || 0);
          const isVideo = contentType.startsWith('video/') || contentType.includes('octet-stream');

          let reason;
          if (![200, 206].includes(res.statusCode)) reason = 'bad_status_code';
          else if (!isVideo)                         reason = 'not_video_mime';
          else if (contentLength <= 0)               reason = 'empty_or_unknown_size';
          else                                       reason = 'ok';

          finish({ ok: reason === 'ok', statusCode: res.statusCode, contentType, contentLength, finalUrl: currentUrl, reason });
        });

        req.on('error', (err) => {
          pushLog('error', { method, message: err.message, code: err.code });
          if (method === 'HEAD') return doRequest(currentUrl, 'GET');
          finish({ ok: false, reason: 'request_error' });
        });

        req.on('timeout', () => {
          req.destroy();
          finish({ ok: false, reason: 'timeout' });
        });

        req.end();
      };

      doRequest(videoUrl);
    });
  }

  async function proxyImage(url, res) {
    const controller = new AbortController();
    try {
      const r = await HttpModule.axiosInstance.get(url, { responseType: 'stream', signal: controller.signal });
      res.setHeader('Content-Type', r.headers['content-type'] || 'image/jpeg');
      const stream = r.data;
      const cleanup = () => { controller.abort(); stream.destroy(); };
      res.on('close', cleanup);
      res.on('error', cleanup);
      stream.on('error', cleanup);
      stream.pipe(res);
    } catch {
      res.headersSent ? res.end() : res.status(500).end();
    }
  }

  // ============================================================================
  // streamVideo
  //
  // PROBLEMA RAÍZ anterior: cada llamada a originRes.pipe(res) registraba
  // ~5 listeners internos (close, finish, drain, error, unpipe) en `res`.
  // Con reconexiones, esos listeners se acumulaban → MaxListenersExceededWarning
  // y memory leaks.
  //
  // SOLUCIÓN: escribir manualmente con originRes.on('data') + res.write(),
  // manejando back-pressure con pause/resume. Cero listeners extra en `res`.
  // ============================================================================
  function streamVideo(videoUrl, req, res) {
    if (!videoUrl) return res.status(400).send('Falta parámetro videoUrl');

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length');

    const parsedUrl = urlLib.parse(videoUrl);
    const isHttps   = parsedUrl.protocol === 'https:';
    const protocol  = isHttps ? https : http;
    const referer   = getRefererForHost(parsedUrl.hostname);

    // Offset inicial desde el header Range del cliente
    let byteOffset = 0;
    const rangeHeader = req.headers.range;
    if (rangeHeader) {
      const m = rangeHeader.match(/bytes=(\d+)-/);
      if (m) byteOffset = parseInt(m[1], 10);
    }

    // ---- Ciclo de vida ----
    let done    = false;
    let retries = 0;
    const MAX_RETRIES   = 3;
    const RETRY_BASE_MS = 800;

    // Termina definitivamente. Solo se ejecuta una vez.
    function terminate(code, msg) {
      if (done) return;
      done = true;
      if (!res.headersSent) {
        res.status(code).end(msg ?? undefined);
      } else if (!res.writableEnded) {
        res.end();
      }
    }

    // Si el cliente cierra la pestaña, paramos sin reintentar
    req.once('close', () => { done = true; });

    // ---- Conexión al origen ----
    function connect(fromByte) {
      if (done) return;

      const reqHeaders = {
        'Referer':    referer,
        'Origin':     referer,
        'User-Agent': 'Mozilla/5.0',
      };
      if (fromByte > 0) reqHeaders['Range'] = `bytes=${fromByte}-`;

      const options = {
        hostname: parsedUrl.hostname,
        port:     parsedUrl.port || (isHttps ? 443 : 80),
        path:     (parsedUrl.pathname || '/') + (parsedUrl.search || ''),
        method:   'GET',
        headers:  reqHeaders,
        rejectUnauthorized: false,
      };

      const originReq = protocol.request(options, (originRes) => {
        // Si el cliente ya cerró, drenar y salir
        if (done) { originRes.resume(); return; }

        retries = 0; // respuesta exitosa → resetear

        // El servidor rechazó la petición
        if (originRes.statusCode >= 400) {
          originRes.resume();
          return terminate(originRes.statusCode, 'Video no disponible');
        }

        // Enviar cabeceras al cliente (solo la primera vez)
        if (!res.headersSent) {
          const outHeaders = {
            'Content-Type':        originRes.headers['content-type'] || 'video/mp4',
            'Accept-Ranges':       'bytes',
            'Content-Disposition': 'inline',
          };
          if (originRes.headers['content-length'])
            outHeaders['Content-Length'] = originRes.headers['content-length'];
          if (originRes.headers['content-range'])
            outHeaders['Content-Range'] = originRes.headers['content-range'];

          res.writeHead(originRes.statusCode === 206 ? 206 : 200, outHeaders);
        }

        // ---- Escritura manual (sin .pipe) ----
        // .pipe() registra listeners permanentes en `res` que se acumulan
        // con cada reconexión. Escribimos chunk a chunk y manejamos
        // back-pressure manualmente.
        originRes.on('data', (chunk) => {
          if (done) { originRes.destroy(); return; }

          byteOffset += chunk.length;

          const ok = res.write(chunk);
          if (!ok) {
            // El buffer de salida está lleno: pausar el origen
            originRes.pause();
            res.once('drain', () => {
              if (!done) originRes.resume();
            });
          }
        });

        originRes.once('end', () => {
          terminate(200, null);
        });

        originRes.once('error', (err) => {
          if (done) return;
          // 'aborted' puede ser: (a) cliente cerró, (b) servidor cortó
          // Solo reintentamos si el cliente sigue conectado
          retry(byteOffset, `originRes: ${err.message}`);
        });
      });

      originReq.setTimeout(25000, () => {
        originReq.destroy(new Error('timeout'));
      });

      originReq.once('error', (err) => {
        if (done) return;
        retry(byteOffset, `originReq: ${err.message}`);
      });

      originReq.end();
    }

    function retry(fromByte, reason) {
      if (done) return;

      retries++;
      if (retries > MAX_RETRIES) {
        console.error(`[streamVideo] sin más reintentos — ${reason}`);
        return terminate(502, 'Error al conectar con el origen del video');
      }

      const delay = RETRY_BASE_MS * retries;
      console.warn(`[streamVideo] reintento ${retries}/${MAX_RETRIES} en ${delay}ms — ${reason}`);
      setTimeout(() => connect(fromByte), delay);
    }

    connect(byteOffset);
  }

  return { validateVideoUrl, proxyImage, streamVideo };
})();

// ============================================================================
// FUNCIONES PÚBLICAS
// ============================================================================
async function getEpisodes(url) {
  const { data } = await HttpModule.axiosInstance.get(url);
  if (url.includes('animeflv')) return ScraperModule.extractAnimeFLV(data);
  if (url.includes('tioanime')) return ScraperModule.extractTio(data);
  return ScraperModule.extractAnimeYTX(data) || { success: false };
}

async function getDescription(url) {
  try {
    const { data } = await HttpModule.axiosInstance.get(url);
    const $ = cheerio.load(data);
    return (
      $('section.WdgtCn .Description p').text().trim() ||
      $('aside p.sinopsis').text().trim() ||
      $('meta[name="description"]').attr('content') ||
      ''
    );
  } catch { return ''; }
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
  getEpisodes,
  getDescription,
  proxyImage:       StreamModule.proxyImage,
  streamVideo:      StreamModule.streamVideo,
  validateVideoUrl: StreamModule.validateVideoUrl,
  downloadVideo:    () => false
};