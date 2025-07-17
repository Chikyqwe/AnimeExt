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

  //──────────────────────────── Shared utils ───────────────────────────────
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

  //──────────────────────────── Browsers pool ──────────────────────────────
  let playwrightBrowser = null;
  let puppeteerBrowser = null;

  // Playwright (Firefox)
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

  // Puppeteer
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


  //─────────────────────── 1. Video list extractor ────────────────────────
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

    $('script').each((_, el) => {
      const scriptContent = $(el).html();
      const match =
        scriptContent && scriptContent.match(/var\s+videos\s*=\s*(\[.*?\]|\{[\s\S]*?\});/s);
      if (!match) return;

      try {
        const rawJson = match[1].replace(/\\\//g, '/');
        const parsed = JSON.parse(rawJson);

        if (parsed.SUB) {
          videos = parsed.SUB.map((v) => ({
            servidor: v.server || v[0],
            url: v.url || v.code || v[1]
          }));
        } else if (Array.isArray(parsed) && parsed[0]?.length >= 2) {
          videos = parsed.map((v) => ({ servidor: v[0], url: v[1] }));
        }
      } catch (err) {
        console.error('[EXTRACTOR] Error parseando videos:', err);
      }
    });

    console.log(`[EXTRACTOR] Videos extraídos: ${videos.length}`);
    return videos;
  }

  //─────────────────────── 2. StreamWish / Swift ──────────────────────────
  async function extractFromSW(swiftUrl) {
    const browser = await getPlaywrightBrowser();
    const context = await browser.newContext({ userAgent: UA_FIREFOX });

    // Bloquea anuncios/tracking para acelerar
    await context.route(/\.(png|jpg|gif|css|woff|woff2|ttf)$/i, (route) => route.abort());

    const page = await context.newPage();
    let masterM3u8Url;

    page.on('response', (res) => {
      const url = res.url();
      if (url.endsWith('master.m3u8')) masterM3u8Url = url;
    });

    await page.goto(swiftUrl, { waitUntil: 'domcontentloaded', timeout: 12_000 });

    // espera reactiva (máx 4s)
    await Promise.race([
      page.waitForResponse((r) => r.url().endsWith('master.m3u8'), { timeout: 4000 }),
      page.waitForTimeout(2000)
    ]);

    if (!masterM3u8Url) {
      await context.close();
      return [];
    }

    // fetch helper dentro del navegador
    async function fetchTextInPage(url) {
      return withRetries(() =>
        page.evaluate(async (u) => {
          const r = await fetch(u);
          if (!r.ok) throw new Error(r.status);
          return await r.text();
        }, url)
      );
    }

    const masterContent = await fetchTextInPage(masterM3u8Url);
    const base = new URL(masterM3u8Url);
    const childUrls = masterContent
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => (l.startsWith('http') ? l : new URL(l, base).href));

    const children = await Promise.allSettled(
      childUrls.map(async (u) => {
        const content = await fetchTextInPage(u);
        return { url: u, content };
      })
    );

    await context.close();

    return [
      { url: masterM3u8Url, content: masterContent },
      ...children.filter((r) => r.status === 'fulfilled').map((r) => r.value)
    ];
  }

  //──────────────────────── 3. Puppeteer intercept ────────────────────────
  async function interceptPuppeteer(pageUrl, fileRegex, refererMatch) {
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

      const guard = setTimeout(() =>
        done(new Error('Timeout: no file detected')), 12_000);

      page.on('request', (req) => {
        const u = req.url();
        if (fileRegex.test(u)) {
          clearTimeout(guard);
          if (u.includes('novideo.mp4')) {
            done(new Error('novideo.mp4 – sin video válido'));
          } else {
            done(null, { url: u });
          }
        }
      });

      page
        .goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 10_000 })
        .catch((e) => done(e));
    });
  }

  //──────────────────────────── 4. Voe extractor ──────────────────────────
async function openVoePage(voeUrl) {
  const label = `[Voe] Duración total ${Date.now()}`;
  console.time(label);
  console.log(`[Voe] Abriendo: ${voeUrl}`);

  const browser = await getPlaywrightBrowser();
  if (!browser) throw new Error('[Voe] No se pudo obtener el navegador.');

  let context, page;

  try {
    context = await browser.newContext({ userAgent: UA_FIREFOX });
    page = await context.newPage();

    const loadPage = async () => {
      if (page) await page.close().catch(() => {});
      page = await context.newPage();
      await page.goto(voeUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      console.log('[Voe] Página cargada.');
    };

    await loadPage();

    let clickSuccess = false;
    for (let i = 0; i < 5; i++) {
      try {
        await page.click('div.spin', { timeout: 2000 });
        console.log('[Voe] Click en "div.spin" realizado.');
        clickSuccess = true;
        break;
      } catch {
        console.log(`[Voe] Intento ${i + 1}: No se pudo clicar "div.spin", esperando 1s...`);
        await page.waitForTimeout(1000);
      }
    }

    if (!clickSuccess) {
      console.warn('[Voe] Reintentando después de recargar...');
      await loadPage();
      try {
        await page.click('div.spin', { timeout: 3000 });
        console.log('[Voe] Click en "div.spin" realizado tras recarga.');
      } catch {
        throw new Error('[Voe] No se pudo clicar "div.spin" tras recargar la página.');
      }
    }

    console.log('[Voe] Esperando respuesta del .m3u8...');
    const m3u8Response = await page.waitForResponse(
      r => r.url().includes('index-v1-a1.m3u8'),
      { timeout: 15000 }
    );

    const m3u8Url = m3u8Response.url();
    const m3u8Text = await m3u8Response.text();
    const baseUrl = new URL('.', m3u8Url).href;

    const allSegments = m3u8Text
      .split('\n')
      .filter(line => line.trim().match(/\.ts(\?|$)/))
      .map(line => line.trim());

    console.log(`[Voe] Se encontraron ${allSegments.length} segmentos .ts.`);

    const absoluteUrls = allSegments.map(path =>
      path.startsWith('http') ? path : new URL(path, baseUrl).href
    );

    console.log('[Voe] Descargando todos los segmentos...');

    const segmentBuffers = [];
    const PQueue = require('p-queue').default || require('p-queue');
    const queue = new PQueue({ concurrency: 10 });

    const tasks = absoluteUrls.map(url =>
      queue.add(async () => {
        const res = await page.request.get(url);
        if (!res.ok()) {
          throw new Error(`[Voe] Error ${res.status()} al descargar: ${url}`);
        }
        const buf = await res.body();
        segmentBuffers.push({ url, buffer: buf });
      })
    );

    await Promise.all(tasks); // Espera que todas las descargas terminen

    // Ordenar segmentos
    segmentBuffers.sort((a, b) => {
      const numA = parseInt(a.url.match(/seg-(\d+)-/)?.[1] || '0', 10);
      const numB = parseInt(b.url.match(/seg-(\d+)-/)?.[1] || '0', 10);
      return numA - numB;
    });

    const allBuffer = Buffer.concat(segmentBuffers.map(seg => seg.buffer));
    console.log('[Voe] Descarga y ensamblado completo.');

    await context.close().catch(e => console.warn('[Voe] Error al cerrar contexto:', e));
    console.timeEnd(label);

    return allBuffer;

  } catch (err) {
    console.error('[Voe] Error en openVoePage:', err);
    if (context) {
      try {
        await context.close();
      } catch (e) {
        console.warn('[Voe] Error al cerrar contexto en catch:', e.message || e);
      }
    }
    console.timeEnd(label);
    throw err;
  }
}

  function pass(){
    // fucnion para pasar osea vacio
    return;
  }
  //──────────────────────────── Extractors map ────────────────────────────
  const extractors = {
    yourupload: (u) => interceptPuppeteer(u, /\.mp4$/, 'yourupload.com'),
    yu: (u) => interceptPuppeteer(u, /\.mp4$/, 'yourupload.com'),
    streamwish: extractFromSW,
    sw: extractFromSW,
    swiftplayers: extractFromSW,
    voe:pass,
    "mega.nz": pass,
    mega:pass,
  };


  function getExtractor(name) {
    return extractors[name.toLowerCase()];
  }

  //──────────────────────────── Cleanup hooks ─────────────────────────────
  process.on('exit', async () => {
    if (playwrightBrowser) await playwrightBrowser.close();
    if (puppeteerBrowser) await puppeteerBrowser.close();
  });

  //──────────────────────────── Exports ───────────────────────────────────
  module.exports = {
    extractAllVideoLinks,
    getExtractor,
    openVoePage,
  };
