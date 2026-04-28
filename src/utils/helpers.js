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
  const safeEval = code => vm.runInNewContext(code, {}, { timeout: 100 });
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
  function slugify(text) {
    return text
      .toString()
      .normalize("NFD")                   // separar acentos
      .replace(/[\u0300-\u036f]/g, "")    // quitar acentos
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")        // reemplazar todo lo raro por "-"
      .replace(/^-+|-+$/g, "")            // quitar "-" al inicio/final
      .replace(/-{2,}/g, "-");            // evitar "--"
  }
  async function extractAnimeFLV(data) {
    const info = data.match(ParseModule.ANIME_INFO);
    const eps = data.match(ParseModule.EPISODES);
    if (!info || !eps) return null;

    const anime_info = ParseModule.safeEval(info[1]);
    const episodesRaw = ParseModule.safeEval(eps[1]);
    const pattern = await PatternModule.getAnimeFLVPattern();

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
    const eps = data.match(ParseModule.EPISODES);
    if (!info || !eps) return null;

    const anime_info = ParseModule.safeEval(info[1]);
    const episodesRaw = ParseModule.safeEval(eps[1]);
    const pattern = await PatternModule.getTioPattern();

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
  async function extractone(data) {
    const $ = cheerio.load(data);

    // 1️⃣ Detectar si el anime está finalizado
    const statusText = $('.st.c-f span').text().trim();
    const isEnd = statusText.toLowerCase() === 'finalizado';

    // 2️⃣ Extraer la variable eps del <script>
    const scriptText = $('script')
      .map((i, el) => $(el).html())
      .get()
      .find(t => t.includes('var eps ='));

    let episodes = [];
    const animeId = $('#r .info-r').attr('data-ai'); // ID para thumbnails
    const title = $('.info-l figure img').attr('alt') || '';
    const slug = slugify(title);
    if (scriptText) {
      const match = scriptText.match(/var eps = (\[.*?\]);/s);
      if (match) {
        const epsArray = JSON.parse(match[1]);
        episodes = epsArray.map(e => ({
          number: e[0],
          url: `https://vww.animeflv.one/ver/${slug}-${e[0]}`, // puedes cambiar a la URL real del episodio
          img: `https://vww.animeflv.one/cdn/img/episodios/${animeId}-${e[0]}.webp?t=0.1`
        }));
      }
    }

    // 3️⃣ Extraer título, portada y slug


    // 4️⃣ Extraer fecha del próximo episodio si existe
    let isNewEP = null;
    const nextEpEl = $('ul.ep.prox li div span strong');
    if (nextEpEl.length) {
      isNewEP = nextEpEl.text().trim();
    }

    // 5️⃣ Devolver JSON completo
    return {
      source: "one",
      title,
      slug,
      isNewEP,
      isEnd,
      episodes_count: episodes.length,
      episodes
    };
  }

  async function extractJK(url) {
    const client = axios.create({
      withCredentials: true,
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    // 1️⃣ GET inicial
    const { data: html, headers } = await client.get(url);
    const $ = cheerio.load(html);

    const token = $('meta[name="csrf-token"]').attr("content");
    const cookies = headers["set-cookie"]?.join("; ") || "";

    const ogUrl = $('meta[property="og:url"]').attr("content") || url;
    const slug = ogUrl.split("/").filter(Boolean).pop();

    const animeId = $("#guardar-anime").attr("data-anime");

    const thumbnail =
      $(".anime_pic img").attr("src") ||
      $('meta[property="og:image"]').attr("content") ||
      null;

    const statusText = $(".enemision").text().trim().toLowerCase();
    const isEnd = statusText.includes("concluido") || statusText.includes("finalizado");
    const isNewEP = statusText.includes("emision") ? true : null;

    // 🔥 2️⃣ PRIMERA REQUEST (para saber cuántas páginas hay)
    const { data: firstRes } = await client.post(
      `https://jkanime.net/ajax/episodes/${animeId}/1`,
      new URLSearchParams({ _token: token }),
      {
        headers: {
          "Cookie": cookies,
          "Referer": url,
          "Origin": "https://jkanime.net",
          "X-Requested-With": "XMLHttpRequest"
        }
      }
    );

    const totalPages = firstRes.last_page;
    console.log(totalPages);

    // 🔥 3️⃣ CREAR TODAS LAS REQUESTS EN PARALELO
    const requests = [];

    for (let page = 1; page <= totalPages; page++) {
      requests.push(
        client.post(
          `https://jkanime.net/ajax/episodes/${animeId}/${page}`,
          new URLSearchParams({ _token: token }),
          {
            headers: {
              "Cookie": cookies,
              "Referer": url,
              "Origin": "https://jkanime.net",
              "X-Requested-With": "XMLHttpRequest"
            }
          }
        )
      );
    }

    const responses = await Promise.all(requests);

    // 🔥 4️⃣ MAPEAR TODO
    const allEpisodes = responses.flatMap(r =>
      r.data.data.map(ep => ({
        number: ep.number,
        url: `https://jkanime.net/${slug}/${ep.number}/`,
        img: ep.image
          ? `https://cdn.jkdesa.com/assets/images/animes/video/image_thumb/${ep.image}`
          : thumbnail
      }))
    );

    // ordenar
    allEpisodes.sort((a, b) => a.number - b.number);

    const title = $('.anime_info h3').first().text();

    return {
      source: "jk",
      title,
      slug,
      isNewEP,
      isEnd,
      episodes_count: allEpisodes.length,
      episodes: allEpisodes
    };
  }

  async function extractAniyae(html) {
    const $ = cheerio.load(html);

    // ===============================
    // 1️⃣ EXTRAER animeId DESDE SCRIPT
    // ===============================
    let animeId = null;

    $('script').each((i, el) => {
      const text = $(el).html();
      if (!text) return;

      const match = text.match(/animeId\s*=\s*(\d+)/);
      if (match) {
        animeId = match[1];
      }
    });

    if (!animeId) throw new Error("❌ No se encontró animeId");

    // ===============================
    // 2️⃣ TITLE
    // ===============================
    const title = $('.stack span').first().text().trim();

    // ===============================
    // 3️⃣ SLUG
    // ===============================
    const slug = slugify(title);

    // ===============================
    // 4️⃣ STATUS
    // ===============================
    const statusText = $('body').text().toLowerCase();
    const isEnd = statusText.includes("finalizado");

    // ===============================
    // 5️⃣ THUMBNAIL
    // ===============================
    const thumbnail = $('img').first().attr('src') || '';

    // ===============================
    // 6️⃣ API EPISODIOS
    // ===============================
    const api = `https://open.aniyae.net/wp-json/kiranime/v1/anime/${animeId}/episodes?page=1&per_page=999999999&order=asc`;

    const res = await axios.get(api);
    const epsArray = res.data.episodes || [];

    // ===============================
    // 7️⃣ MAPEAR EPISODIOS
    // ===============================
    const episodes = epsArray.map(ep => ({
      number: Number(ep.number),
      url: ep.url,
      img: ep.image || thumbnail
    }));

    // ===============================
    // 8️⃣ NUEVO EP
    // ===============================
    let isNewEP = null;
    if (!isEnd && episodes.length) {
      isNewEP = episodes[episodes.length - 1].number;
    }

    // ===============================
    // 9️⃣ RESULTADO FINAL
    // ===============================
    console.log({
      source: "aniyae",
      title,
      slug,
      isNewEP,
      isEnd,
      episodes_count: episodes.length,
      episodes
    })
    return {
      source: "aniyae",
      title,
      slug,
      isNewEP,
      isEnd,
      episodes_count: episodes.length,
      episodes
    };
  }
  async function extractTioHentai(html) {
    const $ = cheerio.load(html);

    // ===============================
    // 1️⃣ TITLE
    // ===============================
    const title = $('h1.title').first().text().trim();

    // ===============================
    // 2️⃣ SLUG + ID (desde JS)
    // ===============================
    const animeInfoMatch = html.match(/var\s+anime_info\s*=\s*(\[[^\]]+\])/);

    let animeID = null;
    let slug = null;

    if (animeInfoMatch) {
      try {
        const animeInfo = JSON.parse(animeInfoMatch[1]);
        animeID = animeInfo[0];
        slug = animeInfo[1];
      } catch { }
    }

    // ===============================
    // 3️⃣ ESTADO
    // ===============================
    const statusText = $('.status').text().toLowerCase();

    const isEnd = statusText.includes('finalizado');

    // ===============================
    // 4️⃣ IMAGEN (fallback para episodios)
    // ===============================
    let cover = $('.thumb img').attr('src');

    if (cover && cover.startsWith('/')) {
      cover = 'https://tiohentai.com' + cover;
    }

    // ===============================
    // 5️⃣ EPISODIOS (desde JS)
    // ===============================
    const episodesMatch = html.match(/var\s+episodes\s*=\s*(\[[^\]]+\])/);

    let episodes = [];

    if (episodesMatch) {
      try {
        const epsArray = JSON.parse(episodesMatch[1]);

        episodes = epsArray.map(num => ({
          number: num,
          url: `/ver/${slug}/${num}`,
          img: cover // 👈 fallback
        }));
      } catch { }
    }

    // ordenar (por si vienen invertidos)
    episodes.sort((a, b) => a.number - b.number);

    // ===============================
    // 6️⃣ NUEVO EP
    // ===============================
    let isNewEP = null;

    if (!isEnd && episodes.length) {
      isNewEP = episodes[episodes.length - 1].number;
    }

    // ===============================
    // 7️⃣ RESULTADO
    // ===============================
    return {
      source: "tiohentai",
      title,
      slug,
      isEnd,
      isNewEP,
      episodes_count: episodes.length,
      episodes
    };
  }
  async function extractHentaila(html) {
    const $ = cheerio.load(html);

    // ===============================
    // 1️⃣ TITLE (desde sr-only)
    // ===============================
    const rawTitle = $('article a span.sr-only').first().text().trim();

    // Ej: "Ver Showtime! Uta no Onee-san Datte Shitai 2 1"
    const title = $('h1.text-lead').first().text().trim();
    const slug = slugify(title);

    // ===============================
    // 2️⃣ ESTADO (Finalizado / En emisión)
    // ===============================
    const metaText = $('.flex.flex-wrap.items-center').text().toLowerCase();

    const isEnd = metaText.includes('finalizado');

    // ===============================
    // 3️⃣ EPISODIOS
    // ===============================
    const episodes = [];

    $('article.group\\/item').each((i, el) => {
      const ep = $(el);

      // número
      const number = Number(
        ep.find('.text-lead').text().trim()
      );

      // url
      const url = "https://hentaila.com" + ep.find('a').attr('href');

      // imagen
      const img = ep.find('img').attr('src');

      episodes.push({
        number,
        url,
        img
      });
    });

    // ===============================
    // 4️⃣ NUEVO EP
    // ===============================
    let isNewEP = null;
    if (!isEnd && episodes.length) {
      isNewEP = episodes[episodes.length - 1].number;
    }

    // ===============================
    // 5️⃣ RESULTADO FINAL
    // ===============================
    return {
      source: "hentaila",
      title,
      slug,
      isNewEP,
      isEnd,
      episodes_count: episodes.length,
      episodes
    };
  }
  return { extractAnimeFLV, extractTio, extractone, extractJK, extractAniyae, extractTioHentai, extractHentaila };
})();

// ============================================================================
// MÓDULO: STREAMING / PROXY
// ============================================================================
const StreamModule = (() => {

  function getRefererForHost(host) {
    if (!host) return 'https://www.mp4upload.com/';
    if (host.includes('burstcloud')) return 'https://burstcloud.co/';
    if (host.includes('vidcache')) return 'https://www.yourupload.com/';
    if (host.includes('mp4upload')) return 'https://www.mp4upload.com/';
    return 'https://www.mp4upload.com/';
  }

  function validateVideoUrl(videoUrl, timeoutMs = 5000) {
    return new Promise((resolve) => {
      let redirects = 0;
      const maxRedirects = 5;
      let resolved = false;
      const logs = [];

      const pushLog = (type, data) => logs.push({ time: new Date().toISOString(), type, data });
      const finish = (data) => { if (resolved) return; resolved = true; resolve({ ...data, log: logs }); };

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

          const contentType = res.headers['content-type'] || '';
          const contentLength = Number(res.headers['content-length'] || 0);
          const isVideo = contentType.startsWith('video/') || contentType.includes('octet-stream');

          let reason;
          if (![200, 206].includes(res.statusCode)) reason = 'bad_status_code';
          else if (!isVideo) reason = 'not_video_mime';
          else if (contentLength <= 0) reason = 'empty_or_unknown_size';
          else reason = 'ok';

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
    const isHttps = parsedUrl.protocol === 'https:';
    const protocol = isHttps ? https : http;
    const referer = getRefererForHost(parsedUrl.hostname);

    // Offset inicial desde el header Range del cliente
    let byteOffset = 0;
    const rangeHeader = req.headers.range;
    if (rangeHeader) {
      const m = rangeHeader.match(/bytes=(\d+)-/);
      if (m) byteOffset = parseInt(m[1], 10);
    }

    // ---- Ciclo de vida ----
    let done = false;
    let retries = 0;
    const MAX_RETRIES = 3;
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
        'Referer': referer,
        'Origin': referer,
        'User-Agent': 'Mozilla/5.0',
      };
      if (fromByte > 0) reqHeaders['Range'] = `bytes=${fromByte}-`;

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: (parsedUrl.pathname || '/') + (parsedUrl.search || ''),
        method: 'GET',
        headers: reqHeaders,
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
            'Content-Type': 'video/mp4',
            'Accept-Ranges': 'bytes',
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
  if (!url) {
    return { success: false, error: 'URL vacía' };
  }

  console.log('[getEpisodes] URL:', url);

  try {
    const { data } = await HttpModule.axiosInstance.get(url);
    const host = new URL(url).hostname;

    // 🔥 Regex exactos (sin colisiones)

    if (/animeflv\.one$/.test(host)) {
      return ScraperModule.extractone(data);
    }

    if (/animeflv\.net$/.test(host)) {
      return ScraperModule.extractAnimeFLV(data);
    }

    if (/tioanime\./.test(host)) {
      return ScraperModule.extractTio(data);
    }

    if (/hentaila\./.test(host)) {
      return ScraperModule.extractHentaila(data);
    }

    if (/jkanime\./.test(host)) {
      console.log("[JKAnime]");
      return ScraperModule.extractJK(url);
    }

    if (/aniyae\./.test(host)) {
      console.log("[Aniyae]");
      return ScraperModule.extractAniyae(data);
    }

    if (/tiohentai\./.test(host)) {
      console.log("[TioHentai]");
      return ScraperModule.extractTioHentai(data);
    }

    return {
      success: false,
      error: `No hay extractor para host: ${host}`
    };

  } catch (err) {
    console.error('[getEpisodes ERROR]', err.message);

    return {
      success: false,
      error: 'Error haciendo fetch o parsing',
      detail: err.message
    };
  }
}
async function getDescription(url) {
  try {
    const { data } = await HttpModule.axiosInstance.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9",
      },
      timeout: 10000
    });

    const $ = cheerio.load(data);
    $('script, style, noscript').remove();

    const esBasura = (t) =>
      t.length < 80 ||
      ['ningún vídeo', 'alojado', 'nuestros servidores', 'correo',
        'plataforma', 'indexer', 'menores de edad', "ver online"].some(w => t.toLowerCase().includes(w));

    return (
      $('section.WdgtCn .Description p').first().text().trim() ||  // FLV
      $('aside p.sinopsis').first().text().trim() ||  // TIO, TIOHENTAI
      $('[class*="sinopsis"] p').first().text().trim() ||
      $('[class*="sinopsis"]').first().text().trim() ||
      $('div.border-l-2.pl-4').first().text().trim() ||  // ANIYAE
      $('div.entry p').first().text().trim() ||  // HENTAILA ✅
      $('p').map((_, el) => $(el).text().trim()).get().find(t => !esBasura(t)) ||  // JK, fallback
      ''
    );

  } catch (e) {
    return '';
  }
}
// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
  getEpisodes,
  getDescription,
  proxyImage: StreamModule.proxyImage,
  streamVideo: StreamModule.streamVideo,
  validateVideoUrl: StreamModule.validateVideoUrl,
  downloadVideo: () => false
};