// src/services/extractors.js

const axios = require('axios');
const qs = require('qs');
const cheerio = require('cheerio');
const { URL } = require('url');
const { JSDOM, VirtualConsole } = require('jsdom');
const { slowAES } = require('../utils/aes');

const UA_FIREFOX =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0';

// Axios instance reutilizable con timeout por defecto
const axiosInstance = axios.create({
  timeout: 10000,
  headers: {
    'User-Agent': UA_FIREFOX,
    'Accept-Encoding': 'gzip, deflate, br'
  },
  // no follow config aquí: axios por defecto sigue redirects
});

// util: sleep
function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

// util: reintentos con backoff exponencial y abort support
async function withRetries(fn, max = 4, base = 800) {
  let lastErr;
  for (let i = 0; i < max; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const t = base * 2 ** i;
      // backoff
      await delay(t);
    }
  }
  throw lastErr;
}

// conversores hex <-> bytes
function toNumbers(d) {
  const e = [];
  d.replace(/(..)/g, (m) => e.push(parseInt(m, 16)));
  return e;
}
function toHex(arr) {
  return arr.map(v => (v < 16 ? '0' : '') + v.toString(16)).join('').toLowerCase();
}

function transformObeywish(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('obeywish.com')) {
      u.hostname = 'asnwish.com';
      return u.toString();
    }
    return url;
  } catch {
    return url;
  }
}

// --------- Helpers axios con AbortController ----------
async function axiosGet(url, opts = {}) {
  const controller = new AbortController();
  const timeout = opts.timeout != null ? opts.timeout : axiosInstance.defaults.timeout;
  const timer = setTimeout(() => controller.abort(), timeout + 100); // un pequeño margen
  try {
    const res = await axiosInstance.get(url, { signal: controller.signal, ...opts });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function axiosPost(url, data, opts = {}) {
  const controller = new AbortController();
  const timeout = opts.timeout != null ? opts.timeout : axiosInstance.defaults.timeout;
  const timer = setTimeout(() => controller.abort(), timeout + 100);
  try {
    const res = await axiosInstance.post(url, data, { signal: controller.signal, ...opts });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Extractor principal ----------
async function extractAllVideoLinks(pageUrl) {
  console.log(`[EXTRACTOR] Extrayendo videos desde: ${pageUrl}`);
  let videos = [];

  // Variables temporales grandes que luego liberaremos
  let html = null;
  let $ = null;

  if (pageUrl.includes('animeytx')) {
    try {
      const apiUrl = `https://animeext.xo.je/get_vid_servers.php?url=${encodeURIComponent(pageUrl)}`;

      // 1) obtener HTML
      let res1 = await axiosGet(apiUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' },
        timeout: 8000
      });

      html = res1.data;

      // 2) regex
      const match = html.match(/toNumbers\("([0-9a-f]+)"\).*toNumbers\("([0-9a-f]+)"\).*toNumbers\("([0-9a-f]+)"\)/s);
      if (!match) throw new Error("No se pudieron extraer datos de cifrado");

      const a = toNumbers(match[1]);
      const b = toNumbers(match[2]);
      const c = toNumbers(match[3]);

      // liberar html temporal
      html = null;

      // 3) calcular cookie
      const cookieVal = toHex(slowAES.decrypt(c, 2, a, b));

      // limpiar arrays
      a.length = 0;
      b.length = 0;
      c.length = 0;

      // 4) segunda petición
      let res2 = await axiosGet(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Cookie': `__test=${cookieVal}`,
          'Accept': 'application/json'
        },
        timeout: 8000
      });

      const data = res2.data;

      if (data && data.success && Array.isArray(data.videos)) {
        videos = data.videos;
      }

      // liberar res2 y cookie
      res1 = null;
      res2 = null;

    } catch (err) {
      console.error('[EXTRACTOR] Error consultando API AnimeYTX:', err?.message || err);
    }
  }

  else {
    try {
      let res = await axiosGet(pageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'gzip, deflate, br' },
        timeout: 8000
      });

      html = res.data;
      res = null;

      $ = cheerio.load(html);

      if (/animeid/i.test(pageUrl)) {
        $('#partes .parte').each((_, el) => {
          let rawData = $(el).attr('data');
          if (!rawData) return;

          try {
            rawData = rawData.replace(/'/g, '"');
            const parsed = JSON.parse(rawData);

            if (parsed.v) {
              const iframeHtml = parsed.v
                .replace(/\\u003C/g, '<')
                .replace(/\\u003E/g, '>')
                .replace(/\\u002F/g, '/');

              const match = iframeHtml.match(/src="([^"]+)"/i);
              if (match) {
                const finalUrl = transformObeywish(match[1]);
                try {
                  const host = new URL(finalUrl).hostname;
                  videos.push({ servidor: host, url: finalUrl });
                } catch {}
              }
            }
          } catch (err) {
            console.error('Error parseando parte:', err?.message || err);
          }
        });
      }

      else {
        $('script').each((_, el) => {
          const scriptContent = $(el).html();
          if (!scriptContent) return;

          const match = scriptContent.match(/var\s+videos\s*=\s*(\[.*?\]|\{[\s\S]*?\});/s);
          if (!match) return;

          try {
            const rawJson = match[1].replace(/\\\//g, '/');
            const parsed = JSON.parse(rawJson);

            if (parsed?.SUB) {
              videos = parsed.SUB.map((v) => {
                const url = v.url || v.code || v[1];
                const servidor = v.server || v[0];
                return { servidor, url: transformObeywish(url) };
              });
            } else if (Array.isArray(parsed) && parsed[0]?.length >= 2) {
              videos = parsed.map((v) => ({ servidor: v[0], url: transformObeywish(v[1]) }));
            }
          } catch (err) {
            console.error('[EXTRACTOR] Error parseando videos:', err?.message || err);
          }
        });
      }

    } catch (err) {
      console.error('[EXTRACTOR] Error scraping sitio genérico:', err?.message || err);
    }
  }

  // --- LIMPIEZA DE MEMORIA ----
  html = null;
  $ = null;

  try { global.gc(); } catch {}

  console.log(`[EXTRACTOR] Videos extraídos: ${videos.length}`);
  return videos;
}


// ---------- burstcloud extractor ----------
async function burstcloudExtractor(pageUrl) {
  console.log(`[BURSTCLOUD] Extrayendo video desde: ${pageUrl}`);
  try {
    const { data: html } = await withRetries(() =>
      axiosGet(pageUrl, {
        headers: { 'User-Agent': UA_FIREFOX },
        timeout: 8000
      })
    );

    const $ = cheerio.load(html);
    const fileId = $('#player').attr('data-file-id');
    if (!fileId) throw new Error('No se encontró el data-file-id');

    const postData = qs.stringify({ fileId });
    const postResponse = await axiosPost(
      'https://www.burstcloud.co/file/play-request/',
      postData,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Origin': 'https://www.burstcloud.co',
          'Referer': pageUrl,
          'X-Requested-With': 'XMLHttpRequest'
        },
        timeout: 8000
      }
    );

    const cdnUrl = postResponse.data?.purchase?.cdnUrl;
    if (!cdnUrl) throw new Error('No se encontró cdnUrl en la respuesta');

    console.log(`[BURSTCLOUD] CDN URL encontrada: ${cdnUrl}`);
    return { url: cdnUrl };
  } catch (err) {
    console.error('[BURSTCLOUD] Error:', err && err.message ? err.message : err);
    return [];
  }
}

// ---------- getRedirectUrl (mantengo la lógica, pero sin new Function) ----------
async function getRedirectUrl(pageUrl) {
  try {
    const dmca = ["hgplaycdn.com", "habetar.com", "yuguaab.com", "guxhag.com", "auvexiug.com", "xenolyzb.com"];
    const main = ["kravaxxa.com", "davioad.com", "haxloppd.com", "tryzendm.com", "dumbalag.com"];
    const rules = ["dhcplay.com", "hglink.to", "test.hglink.to", "wish-redirect.aiavh.com"];

    const url = new URL(pageUrl);
    const destination = rules.includes(url.hostname)
      ? main[Math.floor(Math.random() * main.length)]
      : dmca[Math.floor(Math.random() * dmca.length)];

    const finalURL = "https://" + destination + url.pathname + url.search;
    return finalURL;
  } catch (error) {
    console.error('Error al generar redirectUrl:', error && error.message ? error.message : error);
    return pageUrl;
  }
}

// ---------- extractM3u8 (mejor manejo de JSDOM y limpieza) ----------
async function extractM3u8(pageUrl, maxRetries = 2) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let dom = null;
    let window = null;
    let virtualConsole = null;

    try {
      const redir = await getRedirectUrl(pageUrl);

      const { data: html } = await axiosGet(redir, { timeout: 10000 });

      // crear VirtualConsole local para capturar errores pero sin filtrar global
      virtualConsole = new VirtualConsole();
      virtualConsole.on("jsdomError", () => {}); // silencia errores de jsdom

      dom = new JSDOM(html, {
        runScripts: "dangerously",
        resources: "usable",
        virtualConsole
      });
      window = dom.window;

      // stub jwplayer de manera segura (local al window)
      let masterM3u8Url = null;
      window.jwplayer = function() {
        return {
          setup: function(config) {
            if (config && config.sources && config.sources[0] && config.sources[0].file) {
              const file = config.sources[0].file;
              masterM3u8Url = file.startsWith('/')
                ? new URL(file, redir).href
                : file;
            }
            return this;
          },
          on: () => {},
          play: () => {},
          getPlaylistItem: () => {}
        };
      };

      // Esperar un corto periodo a que los scripts se ejecuten (no infinito)
      await new Promise(r => setTimeout(r, 1800));

      if (!masterM3u8Url) throw new Error('No se pudo obtener la URL del master m3u8');

      // descargar master playlist (reintentos incorporados)
      const masterContent = await retryAxiosGet(masterM3u8Url, maxRetries, 'master');
      if (!masterContent) throw new Error('No se pudo descargar master m3u8');

      const lines = masterContent.split('\n').map(l => l.trim());
      let maxRes = 0;
      let bestUrl = null;
      const baseUrl = masterM3u8Url.substring(0, masterM3u8Url.lastIndexOf('/') + 1);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = /RESOLUTION=(\d+)x(\d+)/.exec(line);
        if (match) {
          const width = parseInt(match[1], 10);
          const height = parseInt(match[2], 10);
          const nextLine = lines[i + 1];
          if (nextLine && !nextLine.startsWith('#')) {
            const totalRes = width * height;
            const candidate = nextLine.startsWith('/')
              ? new URL(nextLine, baseUrl).href
              : new URL(nextLine, baseUrl).href;
            if (totalRes > maxRes) {
              maxRes = totalRes;
              bestUrl = candidate;
            }
          }
        }
      }

      // cleanup JSDOM (liberar window)
      try {
        if (window && typeof window.close === 'function') window.close();
      } catch (e) { /* ignore */ }
      dom = null;
      window = null;
      if (virtualConsole && typeof virtualConsole.removeAllListeners === 'function') {
        try { virtualConsole.removeAllListeners(); } catch(e){ }
      }
      virtualConsole = null;

      if (!bestUrl) {
        return [{ url: masterM3u8Url, content: masterContent }];
      }

      const bestContent = await retryAxiosGet(bestUrl, maxRetries, 'mejor resolución');
      if (!bestContent) throw new Error('No se pudo descargar playlist de mejor resolución');

      return [{ url: bestUrl, content: bestContent }];
    } catch (err) {
      lastError = err;
      console.warn(`Intento ${attempt} fallido: ${err && err.message ? err.message : err}`);
      // asegurar cierre
      try { if (window && typeof window.close === 'function') window.close(); } catch {}
      dom = null;
      window = null;
      await delay(500 * attempt);
    }
  }

  console.error('Todos los intentos fallaron', lastError && lastError.message ? lastError.message : lastError);
  return [];
}

// ---------- retry axios get ----------
async function retryAxiosGet(url, retries, label) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { data } = await axiosGet(url, { timeout: 10000, headers: { 'Accept': '*/*' } });
      return data;
    } catch (err) {
      lastError = err;
      console.warn(`Intento ${attempt} fallido al descargar ${label}: ${err && err.message ? err.message : err}`);
      await delay(200 * attempt);
    }
  }
  if (lastError) console.error(`[retryAxiosGet] Todos los intentos fallaron: ${lastError && lastError.message ? lastError.message : lastError}`);
  return null;
}

// ---------- JWPlayer MP4 extractor ----------
async function getJWPlayerFile(pageUrl) {
  try {
    const { data: html } = await axiosGet(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
      },
      timeout: 10000
    });

    const match = html.match(/file:\s*['"]([^'"]+\.mp4[^'"]*)['"]/i);

    if (match && match[1]) {
      const videoUrl = match[1];
      if (videoUrl.toLowerCase().includes('novideo.mp4')) {
        throw new Error('El video no existe');
      }
      return { url: videoUrl };
    }

    throw new Error('No se encontró URL del archivo MP4');
  } catch (err) {
    console.error('[getJWPlayerFile] Error:', err && err.message ? err.message : err);
    return null;
  }
}

function pass() {
  return;
}

const mp4 = (u) => getJWPlayerFile(u);

const extractors = {
  yourupload: mp4,
  yu: mp4,
  streamwish: extractM3u8,
  sw: extractM3u8,
  swiftplayers: extractM3u8,
  obeywish: extractM3u8,
  'mega.nz': pass,
  mega: pass,
  'burstcloud.co': burstcloudExtractor,
  bc: burstcloudExtractor
};

function getExtractor(name) {
  return extractors[name.toLowerCase()];
}

module.exports = {
  extractAllVideoLinks,
  getExtractor
};
