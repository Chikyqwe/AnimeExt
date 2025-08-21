// src/services/browserlessExtractors.js

const axios = require('axios');
const qs = require('qs')
const cheerio = require('cheerio');
const { URL } = require('url');
const { JSDOM, VirtualConsole } = require('jsdom');
const { slowAES } = require('../utils/aes'); // aes.js en CommonJS

const UA_FIREFOX =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0';
const UA_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36';

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function withRetries(fn, max = 4, base = 800) {
  let lastErr;
  for (let i = 0; i < max; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const t = base * 2 ** i;
      await delay(t);
    }
  }
  throw lastErr;
}

// Funciones auxiliares
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

// Función principal
async function extractAllVideoLinks(pageUrl) {
  console.log(`[EXTRACTOR] Extrayendo videos desde: ${pageUrl}`);
  let videos = [];

  // 🎯 AnimeYTX: usar la API PHP
  if (pageUrl.includes('animeytx')) {
    try {
      // 1️⃣ Obtener HTML inicial para extraer script de cookie
      const apiUrl = `https://animeext.unaux.com/get_vid_servers.php?url=${encodeURIComponent(pageUrl)}`;
      const { data: html } = await axios.get(apiUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' },
        timeout: 8000,
      });

      // 2️⃣ Extraer a, b, c del script usando regex
      const match = html.match(/toNumbers\("([0-9a-f]+)"\).*toNumbers\("([0-9a-f]+)"\).*toNumbers\("([0-9a-f]+)"\)/s);
      if (!match) throw new Error("No se pudieron extraer datos de cifrado");

      const a = toNumbers(match[1]);
      const b = toNumbers(match[2]);
      const c = toNumbers(match[3]);

      // 3️⃣ Calcular valor de cookie
      const cookieVal = toHex(slowAES.decrypt(c, 2, a, b));

      // 4️⃣ Rehacer petición con cookie, ahora devuelve JSON con los videos
      const { data } = await axios.get(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Cookie': `__test=${cookieVal}`,
          'Accept': 'application/json'
        },
        timeout: 8000,
      });

      if (!data.success) {
        console.log(data)
        console.error('[EXTRACTOR] Error desde PHP AnimeYTX:', data.error || 'Respuesta inválida');
      } else {
        videos = data.videos;
      }

    } catch (err) {
      console.error('[EXTRACTOR] Error consultando API AnimeYTX:', err.message);
    }

  } else {
    // 🌐 Otros sitios: scraping directo
    try {
      const { data: html } = await axios.get(pageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'gzip, deflate, br' },
        timeout: 8000,
      });

      const $ = cheerio.load(html);

      if (/animeid/i.test(pageUrl)) {
        $('#partes .parte').each((_, el) => {
          let rawData = $(el).attr('data');
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
                videos.push({ servidor: new URL(finalUrl).hostname, url: finalUrl });
              }
            }
          } catch (err) {
            console.error('Error parseando parte:', err);
          }
        });
      } else {
        $('script').each((_, el) => {
          const scriptContent = $(el).html();
          const match = scriptContent && scriptContent.match(/var\s+videos\s*=\s*(\[.*?\]|\{[\s\S]*?\});/s);
          if (!match) return;

          try {
            const rawJson = match[1].replace(/\\\//g, '/');
            const parsed = JSON.parse(rawJson);

            if (parsed.SUB) {
              videos = parsed.SUB.map((v) => {
                const url = v.url || v.code || v[1];
                return { servidor: v.server || v[0], url: transformObeywish(url) };
              });
            } else if (Array.isArray(parsed) && parsed[0]?.length >= 2) {
              videos = parsed.map((v) => ({ servidor: v[0], url: transformObeywish(v[1]) }));
            }
          } catch (err) {
            console.error('[EXTRACTOR] Error parseando videos:', err);
          }
        });
      }
    } catch (err) {
      console.error('[EXTRACTOR] Error scraping sitio genérico:', err.message);
    }
  }

  console.log(`[EXTRACTOR] Videos extraídos: ${videos.length}`);
  return videos;
}
async function burstcloudExtractor(pageUrl) {
  console.log(`[BURSTCLOUD] Extrayendo video desde: ${pageUrl}`);

  try {
    // 1️⃣ Obtener el HTML de la página
    const { data: html } = await withRetries(() =>
      axios.get(pageUrl, {
        headers: {
          'Accept-Encoding': 'gzip, deflate, br',
          'User-Agent': UA_FIREFOX
        },
        decompress: true,
        timeout: 8000
      })
    );

    // 2️⃣ Extraer el data-file-id
    const $ = cheerio.load(html);
    const fileId = $('#player').attr('data-file-id');
    if (!fileId) throw new Error('No se encontró el data-file-id');

    // 3️⃣ Preparar datos POST
    const postData = qs.stringify({ fileId });

    // 4️⃣ Petición POST a Burstcloud
    const postResponse = await axios.post(
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
        withCredentials: true
      }
    );

    // 5️⃣ Devolver la URL del CDN
    const cdnUrl = postResponse.data.purchase?.cdnUrl;
    if (!cdnUrl) throw new Error('No se encontró cdnUrl en la respuesta');
    console.log(`[BURSTCLOUD] CDN URL encontrada: ${cdnUrl}`);

    return { url: cdnUrl };
  } catch (err) {
    console.error('[BURSTCLOUD] Error:', err.message);
    return [];
  }
}

async function getRedirectUrl(pageUrl) {
    try {
        const deobfuscatedScript = `
            const dmca = ["hgplaycdn.com", "habetar.com", "yuguaab.com", "guxhag.com", "auvexiug.com", "xenolyzb.com"];
            const main = ["kravaxxa.com", "davioad.com", "haxloppd.com", "tryzendm.com", "dumbalag.com"];
            const rules = ["dhcplay.com", "hglink.to", "test.hglink.to", "wish-redirect.aiavh.com"];
            
            const url = new URL("${pageUrl}");
            let destination;
            
            if (rules.includes(url.hostname)) {
                destination = main[Math.floor(Math.random() * main.length)];
            } else {
                destination = dmca[Math.floor(Math.random() * dmca.length)];
            }
            
            const finalURL = "https://" + destination + url.pathname + url.search;
            return finalURL;
        `;

        const scriptFunction = new Function(deobfuscatedScript);
        const finalUrl = scriptFunction();

        return finalUrl;

    } catch (error) {
        console.error('Error al ejecutar el script de redirección:', error.message);
        return null;
    }
}
const vm = require('vm');

async function extractM3u8(pageUrl, maxRetries = 2) {
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const redir = await getRedirectUrl(pageUrl);
            const { data: html } = await axios.get(redir, { timeout: 10000 });

            let masterM3u8Url = null;

            // 1️⃣ Crear sandbox mínimo
            const sandbox = {
                jwplayer: () => ({
                    setup: function(config) {
                        if (config.sources?.[0]?.file) {
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
                }),
                console: { log: () => {}, warn: () => {} }
            };

            // 2️⃣ Ejecutar solo scripts que contengan el .m3u8
            const scriptRegex = /<script[^>]*>([\s\S]*?\.m3u8[\s\S]*?)<\/script>/gi;
            let match;
            while ((match = scriptRegex.exec(html)) !== null) {
                const code = match[1];
                try {
                    vm.runInNewContext(code, sandbox, { timeout: 2000 });
                } catch {}
                if (masterM3u8Url) break;
            }

            if (!masterM3u8Url) throw new Error('No se pudo obtener URL m3u8');

            // 3️⃣ Descargar master playlist
            const masterContent = await retryAxiosGet(masterM3u8Url, maxRetries, 'master');

            // 4️⃣ Analizar y escoger mejor resolución
            const lines = masterContent.split('\n');
            let maxRes = 0;
            let bestUrl = null;
            const baseUrl = masterM3u8Url.substring(0, masterM3u8Url.lastIndexOf('/') + 1);

            for (let i = 0; i < lines.length; i++) {
                const match = /RESOLUTION=(\d+)x(\d+)/.exec(lines[i]);
                if (match && lines[i + 1] && !lines[i + 1].startsWith('#')) {
                    const totalRes = parseInt(match[1], 10) * parseInt(match[2], 10);
                    if (totalRes > maxRes) {
                        maxRes = totalRes;
                        bestUrl = lines[i + 1].startsWith('/')
                            ? new URL(lines[i + 1], baseUrl).href
                            : lines[i + 1];
                    }
                }
            }

            const finalUrl = bestUrl || masterM3u8Url;
            const finalContent = bestUrl
                ? await retryAxiosGet(bestUrl, maxRetries, 'mejor resolución')
                : masterContent;

            // 5️⃣ Liberar memoria
            masterContent = null;

            return [{ url: finalUrl, content: finalContent }];
        } catch (err) {
            console.warn(`Intento ${attempt} fallido: ${err.message}`);
            lastError = err;
            await new Promise(r => setTimeout(r, 500 * attempt));
        }
    }

    console.error('Todos los intentos fallaron', lastError);
    return [];
}


// Función auxiliar para reintentos de Axios
async function retryAxiosGet(url, retries, label) {
    let lastError = null;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const { data } = await axios.get(url, { timeout: 10000 });
            return data;
        } catch (err) {
            console.warn(`Intento ${attempt} fallido al descargar ${label}: ${err.message}`);
            lastError = err;
            await new Promise(r => setTimeout(r, 200 * attempt));
        }
    }
    return null;
}


async function getJWPlayerFile(pageUrl) {
  try {
    const { data: html } = await axios.get(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
      },
      timeout: 10000
    });

    // Busca la línea que contiene "file: '...'"
    const match = html.match(/file:\s*['"]([^'"]+\.mp4[^'"]*)['"]/i);

    if (match && match[1]) {
      const videoUrl = match[1];

      // Comprueba si es "novideo.mp4"
      if (videoUrl.toLowerCase().includes('novideo.mp4')) {
        throw new Error('El video no existe');
      }

      return { url: videoUrl };
    }

    throw new Error('No se encontró URL del archivo MP4');
  } catch (err) {
    console.error('[getJWPlayerFile] Error:', err.message);
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

process.on('exit', async () => {
  if (playwrightBrowser) await playwrightBrowser.close();
  if (puppeteerBrowser) await puppeteerBrowser.close();
});

module.exports = {
  extractAllVideoLinks,
  getExtractor
};
