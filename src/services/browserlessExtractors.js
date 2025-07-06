// src/services/browserlessExtractors.js
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer-core');
const { firefox } = require('playwright-core');
const { URL } = require('url');
const {
  BROWSERLESS_ENDPOINT,
  BROWSERLESS_ENDPOINT_FIREFOX_PLAYWRIGHT
} = require('../config');

let playwrightBrowser = null;
let puppeteerBrowser = null;

async function getPlaywrightBrowser() {
  if (!playwrightBrowser) {
    playwrightBrowser = await firefox.connect({ wsEndpoint: BROWSERLESS_ENDPOINT_FIREFOX_PLAYWRIGHT });
  }
  return playwrightBrowser;
}

async function getPuppeteerBrowser() {
  if (!puppeteerBrowser) {
    puppeteerBrowser = await puppeteer.connect({ browserWSEndpoint: BROWSERLESS_ENDPOINT, timeout: 20000 });
  }
  return puppeteerBrowser;
}

// Extrae lista de videos (de AnimeFLV, TioAnime, etc.)
async function extractAllVideoLinks(pageUrl) {
  console.log(`[EXTRACTOR] Extrayendo videos desde: ${pageUrl}`);
  const { data: html } = await axios.get(pageUrl, {
    headers: {
      'Accept-Encoding': 'gzip,deflate,br',
      'User-Agent': 'Mozilla/5.0'
    },
    decompress: true
  });
  const $ = cheerio.load(html);
  let videos = [];

  $('script').each((_, el) => {
    const scriptContent = $(el).html();
    let match = scriptContent && scriptContent.match(/var\s+videos\s*=\s*(\[.*?\]|\{[\s\S]*?\});/s);
    if (match) {
      try {
        const rawJson = match[1].replace(/\\\//g, '/');
        console.log(`[EXTRACTOR] Encontrado "videos", intentando parsear...`);
        const parsed = JSON.parse(rawJson);

        if (parsed.SUB) {
          videos = parsed.SUB.map(v => ({
            servidor: v.server || v[0],
            url: v.url || v.code || v[1]
          }));
        } else if (Array.isArray(parsed) && parsed[0]?.length >= 2) {
          videos = parsed.map(v => ({
            servidor: v[0],
            url: v[1]
          }));
        }

        console.log(`[EXTRACTOR] Videos extraídos: ${videos.length}`);
        return false; // break
      } catch (err) {
        console.error(`[EXTRACTOR] Error parseando videos:`, err);
      }
    }
  });

  console.log(`[EXTRACTOR] Extracción finalizada, total videos: ${videos.length}`);
  return videos;
}

// Extrae desde servidores SW con Playwright
async function extractFromSW(swiftUrl) {
  console.log(`[EXTRACTOR SW] Iniciando extracción SW para URL: ${swiftUrl}`);
  const browser = await getPlaywrightBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();

  let masterM3u8Url = null;

  page.on('requestfinished', request => {
    const url = request.url();
    if (url.endsWith('master.m3u8')) {
      console.log(`[EXTRACTOR SW] Detectado master.m3u8: ${url}`);
      masterM3u8Url = url;
    }
  });

  console.log(`[EXTRACTOR SW] Navegando a ${swiftUrl}`);
  await page.goto(swiftUrl, { waitUntil: 'networkidle' });

  try {
    await page.waitForResponse(
      response => response.url().endsWith('master.m3u8'),
      { timeout: 3000 }
    );
  } catch (e) {
    console.warn('[EXTRACTOR SW] No se detectó master.m3u8 en la navegación');
  }

  if (!masterM3u8Url) {
    await page.close();
    await context.close();
    return [];
  }

  async function fetchTextFromPage(url) {
    try {
      return await page.evaluate(async (u) => {
        const r = await fetch(u);
        if (!r.ok) throw new Error(r.status);
        return await r.text();
      }, url);
    } catch (e) {
      console.error(`[EXTRACTOR SW] Error fetch en página para ${url}:`, e);
      return null;
    }
  }

  const masterContent = await fetchTextFromPage(masterM3u8Url);
  if (!masterContent) {
    console.warn('[EXTRACTOR SW] No se pudo descargar master.m3u8');
    await page.close();
    await context.close();
    return [];
  }

  const baseUrl = new URL(masterM3u8Url);
  const lines = masterContent
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));

  const urls = lines.map(line => {
    try {
      new URL(line);
      return line;
    } catch {
      return new URL(line, baseUrl).href;
    }
  });

  console.log(`[EXTRACTOR SW] URLs secundarios detectados:`, urls);

  const m3u8Contents = await Promise.allSettled(
    urls.map(async url => {
      const content = await fetchTextFromPage(url);
      if (content) {
        console.log(`[EXTRACTOR SW] Descargado ${url} (longitud: ${content.length})`);
        return { url, content };
      }
      return null;
    })
  );

  await page.close();
  await context.close();

  return [{ url: masterM3u8Url, content: masterContent }, ...m3u8Contents
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value)];
}

// Intercepta archivos (como .mp4) con Puppeteer
async function interceptPuppeteer(pageUrl, fileRegex, refererMatch) {
  console.log(`[INTERCEPT] Iniciando Puppeteer para ${pageUrl}, buscando patrón: ${fileRegex} (referer: ${refererMatch})`);

  const browser = await getPuppeteerBrowser();
  const page = await browser.newPage();
  let resolved = false;

  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(async () => {
      if (!resolved) {
        resolved = true;
        console.error(`[INTERCEPT] Timeout: No se detectó archivo válido para ${pageUrl}`);
        await page.close();
        reject(new Error(`Timeout: No se detectó archivo válido para ${pageUrl}`));
      }
    }, 15000);

    page.on('request', async (req) => {
      const reqUrl = req.url();
      if (fileRegex.test(reqUrl) && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        console.log(`[INTERCEPT] Archivo válido detectado: ${reqUrl}`);
        await page.close();

        if (reqUrl.includes('novideo.mp4')) {
          console.warn(`[INTERCEPT] El servidor devolvió novideo.mp4`);
          return reject(new Error(`novideo.mp4: El servidor no tiene video válido`));
        }

        resolve({ url: reqUrl });
      }
    });

    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/117.0.0.0 Safari/537.36');
      console.log(`[INTERCEPT] Navegando a la URL: ${pageUrl}`);
      await page.goto(pageUrl, { waitUntil: 'networkidle2' });
      console.log(`[INTERCEPT] Página cargada correctamente`);
    } catch (e) {
      if (!resolved) {
        clearTimeout(timeout);
        resolved = true;
        console.error(`[INTERCEPT] Error navegando la página:`, e);
        await page.close();
        reject(e);
      }
    }
  });
}

// Mapa de extractores por servidor
const extractors = {
  'yourupload': url => interceptPuppeteer(url, /\.mp4$/, 'yourupload.com'),
  'yu': url => interceptPuppeteer(url, /\.mp4$/, 'yourupload.com'),
  'streamwish': url => extractFromSW(url),
  'swiftplayers': url => extractFromSW(url),
  'sw': url => extractFromSW(url)
};

// Devuelve la función de extractor según el nombre
function getExtractor(name) {
  console.log(`[EXTRACTOR] Buscando extractor para: ${name}`);
  return extractors[name.toLowerCase()];
}

// Cerrar browsers al salir
process.on('exit', async () => {
  if (playwrightBrowser) await playwrightBrowser.close();
  if (puppeteerBrowser) await puppeteerBrowser.close();
});

module.exports = {
  extractAllVideoLinks,
  getExtractor
};
