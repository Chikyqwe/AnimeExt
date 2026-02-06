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
  const EPISODES = /var\s+episodes\s*=\s*(\[[\s\S]*?\]);/;

  const safeEval = code =>
    vm.runInNewContext(code, {}, { timeout: 100 });

  return { ANIME_INFO, EPISODES, safeEval };
})();

// ============================================================================
// MÓDULO: PATRONES (CACHE)
// ============================================================================
const PatternModule = (() => {
  const cache = {
    animeflv: { data: null, ts: 0 },
    tio: { data: null, ts: 0 }
  };
  const TTL = 60 * 60 * 1000;

  async function getAnimeFLVPattern() {
    if (cache.animeflv.data && Date.now() - cache.animeflv.ts < TTL)
      return cache.animeflv.data;

    cache.animeflv.data = {
      thumbnail: (id, ep) =>
        `https://cdn.animeflv.net/screenshots/${id}/${ep}/th_3.jpg`
    };

    cache.animeflv.ts = Date.now();
    return cache.animeflv.data;
  }

  async function getTioPattern() {
    if (cache.tio.data && Date.now() - cache.tio.ts < TTL)
      return cache.tio.data;

    cache.tio.data = {
      episode: (slug, ep) => `https://tioanime.com/ver/${slug}-${ep}`,
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
    const eps = data.match(ParseModule.EPISODES);
    if (!info || !eps) return null;

    const anime_info = ParseModule.safeEval(info[1]);
    const episodesRaw = ParseModule.safeEval(eps[1]);
    const pattern = await PatternModule.getAnimeFLVPattern();

    const episodes = episodesRaw.map(e => {
      const num = Array.isArray(e) ? e[0] : e;
      return {
        number: num,
        img: pattern.thumbnail(anime_info[0], num)
      };
    });

    return {
      source: 'AnimeFLV',
      title: anime_info[2],
      slug: anime_info[1],
      animeId: anime_info[0],
      isNewEP: anime_info[3],
      isEnd: anime_info.length === 3,
      episodes_count: episodes.length,
      episodes
    };
  }

  async function extractTio(data) {
    const info = data.match(ParseModule.ANIME_INFO);
    const eps = data.match(ParseModule.EPISODES);
    if (!info || !eps) return null;

    const anime_info = ParseModule.safeEval(info[1]);
    const episodesRaw = ParseModule.safeEval(eps[1]);
    const pattern = await PatternModule.getTioPattern();

    const episodes = episodesRaw.map(e => {
      const num = Array.isArray(e) ? e[0] : e;
      return {
        number: num,
        url: pattern.episode(anime_info[1], num),
        img: pattern.thumbnail(anime_info[0])
      };
    });

    return {
      source: 'TIO',
      title: anime_info[2],
      slug: anime_info[1],
      animeId: anime_info[0],
      isNewEP: anime_info[3],
      isEnd: anime_info.length === 3,
      episodes_count: episodes.length,
      episodes
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
        isEnd: false,
        episodes_count: eps.length,
        episodes: eps
      };
    } catch {
      return null;
    }
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
    if (host.includes('vidcache')) return 'https://www.yourupload.com/';
    return 'https://www.mp4upload.com/';
  }

  function validateVideoUrl(videoUrl, timeoutMs = 5000) {
    return new Promise((resolve) => {
      let redirects = 0;
      const maxRedirects = 5;
      let resolved = false;

      const logs = [];

      const pushLog = (type, data) => {
        logs.push({
          time: new Date().toISOString(),
          type,
          data
        });
      };

      const finish = (data) => {
        if (resolved) return;
        resolved = true;
        resolve({
          ...data,
          log: logs
        });
      };

      const doRequest = (currentUrl, method = 'HEAD') => {
        pushLog('request', {
          url: currentUrl,
          method
        });

        const u = urlLib.parse(currentUrl);
        const isHttps = u.protocol === 'https:';

        const agent = isHttps
          ? new https.Agent({
              keepAlive: true,
              servername: u.hostname,
              rejectUnauthorized: false
            })
          : undefined;

        const options = {
          method,
          hostname: u.hostname,
          port: u.port || (isHttps ? 443 : 80),
          path: (u.pathname || '/') + (u.search || ''),
          headers: {
            Referer: 'https://www.yourupload.com/',
            'User-Agent': 'Mozilla/5.0',
            ...(method === 'GET' ? { Range: 'bytes=0-1023' } : {})
          },
          agent,
          timeout: timeoutMs
        };

        pushLog('options', {
          method: options.method,
          hostname: options.hostname,
          port: options.port,
          path: options.path,
          timeout: options.timeout,
          headers: options.headers
        });

        const proto = isHttps ? https : http;

        const req = proto.request(options, (res) => {
          pushLog('response', {
            statusCode: res.statusCode,
            headers: res.headers
          });

          // 🔁 Redirecciones
          if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
            if (++redirects > maxRedirects) {
              return finish({
                ok: false,
                reason: 'too_many_redirects'
              });
            }

            const nextUrl = urlLib.resolve(currentUrl, res.headers.location);
            pushLog('redirect', {
              from: currentUrl,
              to: nextUrl
            });

            return doRequest(nextUrl, method);
          }

          const contentType = res.headers['content-type'] || '';
          const contentLength = Number(res.headers['content-length'] || 0);

          pushLog('content_info', {
            contentType,
            contentLength
          });

          const isVideo =
            contentType.startsWith('video/') ||
            contentType.includes('octet-stream');

          let reason = null;

          switch (true) {
            case ![200, 206].includes(res.statusCode):
              reason = 'bad_status_code';
              break;

            case !isVideo:
              reason = 'not_video_mime';
              break;

            case contentLength <= 0:
              reason = 'empty_or_unknown_size';
              break;

            default:
              reason = 'ok';
          }

          const ok = reason === 'ok';

          finish({
            ok,
            statusCode: res.statusCode,
            contentType,
            contentLength,
            finalUrl: currentUrl,
            reason
          });

        });

        req.on('error', (err) => {
          pushLog('error', {
            method,
            message: err.message,
            code: err.code
          });

          if (method === 'HEAD') return doRequest(currentUrl, 'GET');

          finish({
            ok: false,
            reason: 'request_error'
          });
        });

        req.on('timeout', () => {
          pushLog('timeout', {
            method,
            timeoutMs
          });
          req.destroy();

          finish({
            ok: false,
            reason: 'timeout'
          });
        });

        req.end();
      };

      doRequest(videoUrl);
    });
  }


  async function proxyImage(url, res) {
    const controller = new AbortController();

    try {
      const r = await HttpModule.axiosInstance.get(url, {
        responseType: 'stream',
        signal: controller.signal,
      });

      res.setHeader('Content-Type', r.headers['content-type'] || 'image/jpeg');

      const stream = r.data;

      const cleanup = () => {
        controller.abort();
        stream.destroy();
      };

      res.on('close', cleanup);
      res.on('error', cleanup);
      stream.on('error', cleanup);

      stream.pipe(res);

    } catch (err) {
      res.headersSent ? res.end() : res.status(500).end();
    }
  }

function streamVideo(videoUrl, req, res) {
  if (!videoUrl) {
    return res.status(400).send("Falta parámetro videoUrl");
  }

  // Aumentamos el límite de listeners para evitar warnings
  res.setMaxListeners(20);

  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.setHeader("Access-Control-Expose-Headers", "Content-Range, Content-Length");

  const parsedUrl = urlLib.parse(videoUrl);
  const isHttps = parsedUrl.protocol === "https:";
  const protocol = isHttps ? https : http;
  const referer = getRefererForHost(parsedUrl.hostname);

  let start = 0;
  const rangeHeader = req.headers.range;

  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-/);
    if (match) start = parseInt(match[1], 10);
  }

  const MAX_RECONNECTS = 3;
  let reconnectAttempts = 0;
  let destroyed = false;
  let activeReq = null;

  // Usamos once para evitar múltiples listeners
  req.once("close", () => {
    destroyed = true;
    activeReq?.destroy?.();
  });

  function requestChunk(from) {
    if (destroyed) return;

    const headers = {
      "Referer": referer,
      "Origin": referer,
      "User-Agent": "Mozilla/5.0"
    };

    if (from > 0) headers["Range"] = `bytes=${from}-`;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.path + (parsedUrl.search || ""),
      method: "GET",
      headers,
      rejectUnauthorized: false
    };

    reconnectAttempts++;
    activeReq = protocol.request(options, (proxyRes) => {
      reconnectAttempts = 0;

      if (proxyRes.statusCode >= 400) {
        if (!res.headersSent) {
          res.status(proxyRes.statusCode).send("Video no disponible");
        }
        return;
      }

      if (!res.headersSent) {
        const headersToSend = {
          "Content-Type": proxyRes.headers["content-type"] || "video/mp4",
          "Accept-Ranges": "bytes",
          "Content-Length": proxyRes.headers["content-length"],
          "Content-Disposition": "inline",
        };

        if (proxyRes.headers["content-range"]) {
          headersToSend["Content-Range"] = proxyRes.headers["content-range"];
        }

        res.writeHead(proxyRes.statusCode, headersToSend);
      }

      // Usamos once en vez de on donde solo necesitamos un disparo
      proxyRes.once("end", () => {
        if (!res.writableEnded) res.end();
      });

      proxyRes.once("error", () => {
        if (destroyed) return;
        if (reconnectAttempts < MAX_RECONNECTS) {
          setTimeout(() => requestChunk(start), reconnectAttempts * 500);
        } else if (!res.headersSent) {
          res.status(502).end("Error streaming video");
        }
      });

      proxyRes.on("data", c => start += c.length);

      // Destruimos proxyRes si res se cierra
      res.once("close", () => proxyRes.destroy());

      proxyRes.pipe(res);
    });

    activeReq.setTimeout(20000);

    activeReq.once("timeout", () => {
      activeReq.abort();
      if (!destroyed && reconnectAttempts < MAX_RECONNECTS) {
        setTimeout(() => requestChunk(start), reconnectAttempts * 500);
      }
    });

    activeReq.once("error", () => {
      if (destroyed) return;
      if (reconnectAttempts < MAX_RECONNECTS) {
        setTimeout(() => requestChunk(start), reconnectAttempts * 500);
      } else if (!res.headersSent) {
        res.status(502).end("Error en conexión al origen");
      }
    });

    activeReq.end();
  }

  requestChunk(start);
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
  } catch {
    return '';
  }
}

// ============================================================================
// EXPORTS (SIN CAMBIOS)
// ============================================================================
module.exports = {
  getEpisodes,
  getDescription,
  proxyImage: StreamModule.proxyImage,
  streamVideo: StreamModule.streamVideo,
  validateVideoUrl: StreamModule.validateVideoUrl,
  downloadVideo: () => false
};