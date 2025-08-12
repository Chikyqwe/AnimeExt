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

async function getPuppeteerBrowser() {
  try {
    const isDisconnected =
      !puppeteerBrowser ||
      (typeof puppeteerBrowser.isConnected === 'function' && !puppeteerBrowser.isConnected?.());

    if (isDisconnected) {
      console.log('[Puppeteer] Conectando a Browserless Chromium…');
      puppeteerBrowser = await puppeteer.connect({
        browserWSEndpoint: BROWSERLESS_ENDPOINT,
        timeout: 20_000
      });
    }
    return puppeteerBrowser;
  } catch (err) {
    console.error('[Puppeteer] Error al conectar:', err.message);
    puppeteerBrowser = null;
    throw err;
  }
}

async function extractAllVideoLinks(pageUrl) {
  console.log(`[EXTRACTOR] Extrayendo videos desde: ${pageUrl}`);

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

  const $ = cheerio.load(html);
  let videos = [];

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

  if (/animeid/i.test(pageUrl)) {
    // Método especial para AnimeID
    $('#partes .parte').each((_, el) => {
      let rawData = $(el).attr('data');

      try {
        rawData = rawData.replace(/'/g, '"'); // comillas simples a dobles
        const parsed = JSON.parse(rawData);

        if (parsed.v) {
          const iframeHtml = parsed.v
            .replace(/\\u003C/g, '<')
            .replace(/\\u003E/g, '>')
            .replace(/\\u002F/g, '/');
          const match = iframeHtml.match(/src="([^"]+)"/i);
          if (match) {
            const finalUrl = transformObeywish(match[1]);
            videos.push({
              servidor: new URL(finalUrl).hostname,
              url: finalUrl
            });
          }
        }
      } catch (err) {
        console.error('Error parseando parte:', err);
      }
    });
  } else {
    // Método genérico original
    $('script').each((_, el) => {
      const scriptContent = $(el).html();
      const match =
        scriptContent &&
        scriptContent.match(/var\s+videos\s*=\s*(\[.*?\]|\{[\s\S]*?\});/s);
      if (!match) return;

      try {
        const rawJson = match[1].replace(/\\\//g, '/');
        const parsed = JSON.parse(rawJson);

        if (parsed.SUB) {
          videos = parsed.SUB.map((v) => {
            const url = v.url || v.code || v[1];
            const finalUrl = transformObeywish(url);
            return {
              servidor: v.server || v[0],
              url: finalUrl
            };
          });
        } else if (Array.isArray(parsed) && parsed[0]?.length >= 2) {
          videos = parsed.map((v) => {
            const finalUrl = transformObeywish(v[1]);
            return {
              servidor: v[0],
              url: finalUrl
            };
          });
        }
      } catch (err) {
        console.error('[EXTRACTOR] Error parseando videos:', err);
      }
    });
  }

  console.log(`[EXTRACTOR] Videos extraídos: ${videos.length}`);
  return videos;
}

async function extractM3u8(m3u8Url, maxBrowserRetries = 3) {
  const maxTabs = 3;

  for (let browserAttempt = 1; browserAttempt <= maxBrowserRetries; browserAttempt++) {
    let browser;
    try {
      console.log(`Intento de navegador ${browserAttempt} de ${maxBrowserRetries}`);
      browser = await getPlaywrightBrowser();
      const context = await browser.newContext({ userAgent: UA_FIREFOX });
      await context.route(/\.(png|jpg|gif|css|woff|woff2|ttf)$/i, route => route.abort());

      let indexM3u8Url;
      let pageWithContent;

      // 1. Primer intento en la pestaña inicial
      const initialPage = await context.newPage();
      initialPage.on('response', (res) => {
        const url = res.url();
        console.log(url);
        if (/index-[^/]+\.m3u8$/i.test(url)) {
          console.log("Found index m3u8:", url);
          indexM3u8Url = url;
        }
      });
      await initialPage.goto(m3u8Url, { waitUntil: 'networkidle', timeout: 20000 });

      const timeout = 6000;
      const pollingInterval = 250;
      const start = Date.now();
      while (!indexM3u8Url && Date.now() - start < timeout) {
        await initialPage.waitForTimeout(pollingInterval);
      }

      // Si se encuentra el m3u8 en la primera pestaña, se salta el resto de la lógica
      if (indexM3u8Url) {
        pageWithContent = initialPage;
      } else {
        console.warn("No se encontró index.m3u8 en el primer intento. Abriendo nuevas pestañas.");
        await initialPage.close();

        // 2. Lógica para abrir múltiples pestañas si el primer intento falla
        for (let tabAttempt = 1; tabAttempt <= maxTabs; tabAttempt++) {
          console.log(`Abriendo pestaña ${tabAttempt} de ${maxTabs}`);
          const page = await context.newPage();
          page.on('response', (res) => {
            const url = res.url();
            console.log(url);
            if (/index-[^/]+\.m3u8$/i.test(url)) {
              console.log("Found index m3u8:", url);
              indexM3u8Url = url;
            }
          });

          await page.goto(m3u8Url, { waitUntil: 'networkidle', timeout: 20000 });
          await page.waitForTimeout(timeout); // Esperar un tiempo para ver si aparece el m3u8

          if (indexM3u8Url) {
            console.log(`¡Index m3u8 encontrado en la pestaña ${tabAttempt}!`);
            pageWithContent = page;
            break; // Salir del bucle de pestañas
          } else {
            console.warn(`No se encontró index.m3u8 en la pestaña ${tabAttempt}.`);
            await page.close();
          }
        }
      }

      if (!pageWithContent) {
        console.warn(`No se pudo encontrar index.m3u8 en ninguna de las ${maxTabs} pestañas. Intentando con una nueva instancia del navegador.`);
        await browser.close();
        continue; // Pasar al siguiente intento del bucle de navegadores
      }
      
      // Si se encontró el m3u8 en cualquier intento, se procede a descargar el contenido
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
        try {
          await browser.close();
        } catch (_) {}
      }
      if (browserAttempt === maxBrowserRetries) {
        console.error('Se agotaron los intentos de navegador.');
        return [];
      }
    }
  }
}

async function interceptPuppeteer(pageUrl, fileRegex) {
  const browser = await getPuppeteerBrowser();
  const page = await browser.newPage();
  await page.setUserAgent(UA_CHROME);

  return new Promise((resolve, reject) => {
    let settled = false;
    const done = async (err, data) => {
      if (settled) return;
      settled = true;
      await page.close();
      err ? reject(err) : resolve(data);
    };

    const guard = setTimeout(() => done(new Error('Timeout')), 12000);

    page.on('request', (req) => {
      const u = req.url();
      if (fileRegex.test(u)) {
        clearTimeout(guard);
        done(null, { url: u });
      }
    });

    page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch((e) => done(e));
  });
}

function pass() {
  return;
}

const extractors = {
  yourupload: (u) => interceptPuppeteer(u, /\.mp4$/),
  yu: (u) => interceptPuppeteer(u, /\.mp4$/),
  streamwish: extractM3u8,
  sw: extractM3u8,
  swiftplayers: extractM3u8,
  'mega.nz': pass,
  mega: pass,
  obeywish: extractM3u8
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
