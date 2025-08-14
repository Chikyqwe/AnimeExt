// src/services/browserlessExtractors.js

const axios = require('axios');
const qs = require('qs')
const cheerio = require('cheerio');
const puppeteer = require('puppeteer-core');
const { firefox } = require('playwright-core');
const { URL } = require('url');
const {
  BROWSERLESS_ENDPOINT,
  BROWSERLESS_ENDPOINT_FIREFOX_PLAYWRIGHT
} = require('../config');
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

let playwrightBrowser = null;
let puppeteerBrowser = null;

async function getPlaywrightBrowser() {
  try {
    const isDisconnected =
      !playwrightBrowser ||
      (typeof playwrightBrowser.isConnected === 'function' && !playwrightBrowser.isConnected());

    if (isDisconnected) {
      console.log('[Playwright] Conectando a Browserless Firefox…');
      playwrightBrowser = await firefox.connect({
        wsEndpoint: BROWSERLESS_ENDPOINT_FIREFOX_PLAYWRIGHT,
        timeout: 20_000
      });
    }
    return playwrightBrowser;
  } catch (err) {
    console.error('[Playwright] Error al conectar:', err.message);
    playwrightBrowser = null;
    throw err;
  }
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
      const apiUrl = `https://animeext.xo.je/get_vid_severs.php?url=${encodeURIComponent(pageUrl)}`;
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
async function extractM3u8(m3u8Url, maxBrowserRetries = 3) {
  const maxTabs = 3;

  for (let browserAttempt = 1; browserAttempt <= maxBrowserRetries; browserAttempt++) {
    let browser;
    try {
      console.log(`Intento de navegador ${browserAttempt} de ${maxBrowserRetries}`);
      browser = await getPlaywrightBrowser();
      const context = await browser.newContext({ userAgent: UA_FIREFOX });

      // Bloquear recursos innecesarios
      await context.route(/\.(png|jpg|gif|css|woff|woff2|ttf)$/i, route => route.abort());

      let indexM3u8Url;
      let pageWithContent;

      // 1️⃣ Primer intento en la pestaña inicial
      const initialPage = await context.newPage();
      initialPage.on('response', (res) => {
        const url = res.url();
        if (/index-[^/]+\.m3u8$/i.test(url)) {
          console.log("Found index m3u8:", url);
          indexM3u8Url = url;
        }
      });

      await initialPage.goto(m3u8Url, { waitUntil: 'networkidle', timeout: 20000 });

      // 🔍 Detectar si aparece el player en blanco
      const hasBlankPlayer = await initialPage.$('img[src*="player_blank.jpg"]');
      if (hasBlankPlayer) {
        console.warn("Se detectó player_blank.jpg en el primer intento. Marcando como perdido.");
        await context.close();
        await browser.close();
        return []; // No seguir intentando
      }

      // ⏳ Esperar hasta encontrar el m3u8
      const timeout = 6000;
      const pollingInterval = 250;
      const start = Date.now();
      while (!indexM3u8Url && Date.now() - start < timeout) {
        await initialPage.waitForTimeout(pollingInterval);
      }

      // ✅ Si lo encontramos en el primer intento
      if (indexM3u8Url) {
        pageWithContent = initialPage;
      } else {
        console.warn("No se encontró index.m3u8 en el primer intento. Abriendo nuevas pestañas.");
        await initialPage.close();

        // 2️⃣ Abrir pestañas adicionales
        for (let tabAttempt = 1; tabAttempt <= maxTabs; tabAttempt++) {
          console.log(`Abriendo pestaña ${tabAttempt} de ${maxTabs}`);
          const page = await context.newPage();
          page.on('response', (res) => {
            const url = res.url();
            if (/index-[^/]+\.m3u8$/i.test(url)) {
              console.log("Found index m3u8:", url);
              indexM3u8Url = url;
            }
          });

          await page.goto(m3u8Url, { waitUntil: 'networkidle', timeout: 20000 });
          await page.waitForTimeout(timeout);

          if (indexM3u8Url) {
            console.log(`¡Index m3u8 encontrado en la pestaña ${tabAttempt}!`);
            pageWithContent = page;
            break;
          } else {
            console.warn(`No se encontró index.m3u8 en la pestaña ${tabAttempt}.`);
            await page.close();
          }
        }
      }

      // ❌ Si no se encontró en ninguna pestaña
      if (!pageWithContent) {
        console.warn(`No se pudo encontrar index.m3u8 en ninguna de las ${maxTabs} pestañas.`);
        await browser.close();
        continue;
      }

      // 📥 Descargar el contenido del m3u8
      async function fetchTextInPage(url) {
        return withRetries(() =>
          pageWithContent.evaluate(async (u) => {
            const r = await fetch(u);
            if (!r.ok) throw new Error(r.status);
            return await r.text();
          }, url)
        );
      }

      const indexContent = await fetchTextInPage(indexM3u8Url);

      await context.close();
      await browser.close();

      return [{ url: indexM3u8Url, content: indexContent }];

    } catch (error) {
      console.error(`Error en intento de navegador ${browserAttempt}:`, error);
      if (browser) {
        try { await browser.close(); } catch (_) {}
      }
      if (browserAttempt === maxBrowserRetries) {
        console.error('Se agotaron los intentos de navegador.');
        return [];
      }
    }
  }
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
      return { url: match[1] };
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
