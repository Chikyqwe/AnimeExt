'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');
const crypto = require('crypto'); // Para el hash de la URL
const { TextCache } = require('./cache/cache'); // Importamos tu clase de caché

// Configuramos un caché para las listas de videos (10 minutos de vida)
const linksCache = new TextCache({ ttlMs: 10 * 60 * 1000 });

// ================== AXIOS ==================
const UA_FIREFOX =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0';

const axiosInstance = axios.create({
  timeout: 10000,
  headers: {
    'User-Agent': UA_FIREFOX,
    'Accept-Encoding': 'gzip, deflate, br'
  }
});

async function axiosGet(url, opts = {}) {
  const controller = new AbortController();
  const timeout = opts.timeout ?? 10000;
  const t = setTimeout(() => controller.abort(), timeout + 100);

  try {
    return await axiosInstance.get(url, {
      ...opts,
      signal: controller.signal
    });
  } finally {
    clearTimeout(t);
  }
}

// ================== HELPERS ==================
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

function safeBase64Decode(str) {
  try {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4 !== 0) str += '=';
    return Buffer.from(str, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

// ================== PAGE VIDEO EXTRACTOR ==================
// -----------------------------
// Extractor AY
// ------------------------------
function decodeBase64(str) {
  try {
    return Buffer.from(str, 'base64').toString('utf-8');
  } catch {
    return null;
  }
}
function getServerInfo(url) {
  try {
    const hostname = new URL(url).hostname;
    const clean = hostname.replace('www.', '').split('.')[0];

    return {
      host: hostname,      // uqload.io
      servidor: clean      // uqload
    };
  } catch {
    return {
      host: null,
      servidor: 'unknown'
    };
  }
}
async function extractAniyae($) {
  const videos = [];

  try {
    const scripts = $('script').map((_, el) => $(el).html()).get();
    const targetScript = scripts.find(s => s && s.includes('episodeId'));

    if (!targetScript) {
      console.log('[ANIYAE] ❌ No se encontró episodeId');
      return videos;
    }

    const match = targetScript.match(/episodeId\s*=\s*(\d+)/i);

    if (!match) {
      console.log('[ANIYAE] ❌ No se pudo extraer episodeId');
      return videos;
    }

    const episodeId = match[1];

    const apiUrl = `https://open.aniyae.net/wp-json/kiranime/v1/episode/players?id=${episodeId}`;
    console.log(apiUrl)
    const res = await axios.get(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    const players = res.data?.players;

    if (!Array.isArray(players)) {
      console.log('[ANIYAE] ⚠️ players inválido');
      return videos;
    }

    players.forEach(v => {
      if (!v?.url) return;

      const decodedUrl = decodeBase64(v.url);

      if (!decodedUrl || !decodedUrl.startsWith('http')) return;

      videos.push({
        servidor: getServerInfo(decodedUrl).servidor,
        url: decodedUrl
      });
    });

  } catch (e) {
    console.error('[ANIYAE] ❌ Error:', e.message);
  }

  return videos;
}

// ------------------------------
// Extractor HL
// ------------------------------
async function extractHL($) {
  const videos = [];

  try {
    // Buscar el script que contiene "kit.start"
    const scripts = $('script').map((_, el) => $(el).html()).get();

    const targetScript = scripts.find(s => s && s.includes('kit.start'));

    if (!targetScript) {
      console.log('[SUB] ❌ No se encontró el script con kit.start');
      return videos;
    }

    // Extraer el bloque donde está "embeds"
    const embedsMatch = targetScript.match(/embeds:\s*(\{[\s\S]*?\})\s*,\s*downloads:/);

    if (!embedsMatch) {
      console.log('[SUB] ❌ No se encontró embeds');
      return videos;
    }

    let embeds;

    try {
      embeds = eval('(' + embedsMatch[1] + ')'); // parseo rápido tipo objeto JS
    } catch (e) {
      console.log('[SUB] ❌ Error parseando embeds:', e.message);
      return videos;
    }

    if (!embeds.SUB || !Array.isArray(embeds.SUB)) {
      console.log('[SUB] ⚠️ No hay SUB');
      return videos;
    }

    embeds.SUB.forEach(v => {
      if (!v.url) return;

      videos.push({
        servidor: v.server.toLowerCase(),
        url: v.url
      });
    });

  } catch (e) {
    console.error('[SUB] ❌ Error general:', e.message);
  }

  return videos;
}

// ------------------------------
// Extractor ONE
// ------------------------------
function hex2a(hex) {
  let str = '';
  for (let i = 0; i < hex.length; i += 2) {
    str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
  }
  return str;
}

function getServerName(url) {
  try {
    const host = new URL(url).hostname.replace('www.', '');
    const parts = host.split('.');
    return parts[parts.length - 2] || host;
  } catch {
    return 'unknown';
  }
}
async function extractONE($, pageUrl) {
  console.log("extractONE", pageUrl);
  const videos = [];

  const enc = $('.opt').first().data('encrypt') || $('.opt').attr('data-encrypt');
  if (!enc) {
    console.log('[ONE] ❌ No se encontró data-encrypt');
    return videos;
  }

  try {
    const origin = new URL(pageUrl).origin;
    const endpoint = `${origin}/flv`;

    const res = await axios.post(
      endpoint,
      new URLSearchParams({ acc: 'opt', i: enc }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': pageUrl,
          'Origin': origin,
          'User-Agent': 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0',
          'Accept': '*/*',
          'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
        },
        responseType: 'text',
        timeout: 10000
      }
    );

    const html = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);

    if (!html || html.trim() === '') {
      console.log('[ONE] ⚠️ Respuesta vacía');
      return videos;
    }

    const $$ = cheerio.load(html);

    $$('li[encrypt]').each((_, el) => {
      const encrypt = $$(el).attr('encrypt');
      if (!encrypt) return;

      let url;
      try {
        url = hex2a(encrypt);
      } catch (e) {
        console.warn('[ONE] hex2a falló:', e.message);
        return;
      }

      if (!url || !url.startsWith('http')) {
        console.warn('[ONE] URL inválida:', url);
        return;
      }

      const servidor = $$(el).attr('title')?.replace('Opción ', '').toLowerCase()
        || getServerName(url);

      videos.push({ servidor, url });
    });

  } catch (e) {
    console.error('[ONE] ❌ Error:', e.message);
    if (e.response) {
      console.error('[ONE] Status:', e.response.status);
      console.error('[ONE] Body:', String(e.response.data).slice(0, 300));
    }
  }

  return videos;
}
// ------------------------------
// Extractor FLV/TIO/TIOH
// ------------------------------
function extractGeneric($, pageUrl) {
  console.log("extractGeneric", pageUrl);
  const videos = [];

  $('script').each((_, el) => {
    const scr = $(el).html();
    if (!scr) return;

    const match = scr.match(/var\s+videos\s*=\s*(\[.*?\]|\{[\s\S]*?\});/s);
    if (!match) return;

    try {
      const parsed = JSON.parse(match[1].replace(/\\\//g, '/'));

      // Formato tipo { SUB: [...] }
      if (parsed?.SUB) {
        parsed.SUB.forEach(v => {
          const url = transformObeywish(v.code || v[1]);
          if (!url) return;

          videos.push({
            servidor: (v.server || v[0] || '').toLowerCase(),
            url
          });
        });
      }

      // Formato array simple
      else if (Array.isArray(parsed)) {
        parsed.forEach(v => {
          if (!v[1]) return;

          videos.push({
            servidor: (v[0] || '').toLowerCase(),
            url: transformObeywish(v[1])
          });
        });
      }

    } catch (e) {
      console.error('[GENERIC] error:', e.message);
    }
  });

  return videos;
}
// ------------------------------
// JK
// ------------------------------
async function extractJK($) {
  const videos = [];

  try {
    // 1. Obtener todos los scripts
    const scripts = $('script').map((_, el) => $(el).html()).get();

    // 2. Buscar el script que contiene "var servers"
    const targetScript = scripts.find(s => s && s.includes('var servers'));

    if (!targetScript) {
      console.log('[JK] ❌ No se encontró el script');
      return videos;
    }

    // =========================
    // 🔹 EXTRAER SERVERS (BASE64)
    // =========================
    const serversMatch = targetScript.match(/var\s+servers\s*=\s*(\[[\s\S]*?\]);/);

    if (serversMatch) {
      let servers;

      try {
        servers = eval(serversMatch[1]);
      } catch (e) {
        console.log('[JK] ❌ Error parseando servers:', e.message);
        servers = [];
      }

      servers.forEach(s => {
        if (!s.remote) return;

        let url = '';

        try {
          url = Buffer.from(s.remote, 'base64').toString('utf-8').trim();
        } catch { }

        if (!url) return;

        videos.push({
          servidor: (s.server || 'unknown').toLowerCase(),
          url
        });
      });
    }

    // =========================
    // 🔹 EXTRAER IFRAMES (video[])
    // =========================
    const videoMatches = [...targetScript.matchAll(/video\[\d+\]\s*=\s*'(.*?)';/g)];

    videoMatches.forEach(match => {
      const iframe = match[1];

      const srcMatch = iframe.match(/src="(.*?)"/);

      if (!srcMatch) return;

      let url = srcMatch[1];

      // corregir rutas relativas
      if (url.startsWith('/')) {
        url = 'https://jkanime.net' + url;
      }

      videos.push({
        servidor: getServerName(url),
        url
      });
    });

  } catch (e) {
    console.error('[JK] ❌ Error general:', e.message);
  }

  return videos;
}
// ------------------------------
// MAIN
// ------------------------------
async function extractAllVideoLinks(pageUrl) {
  const pageKey = crypto.createHash('md5').update(pageUrl).digest('hex');

  // Cache
  if (linksCache.exists(pageKey)) {
    console.log(`[CACHE-LINKS] Reusando lista de videos para: ${pageUrl}`);
    try {
      return JSON.parse(linksCache.load(pageKey));
    } catch {
      console.error("[CACHE-LINKS] Error parseando caché, re-extrayendo...");
    }
  }

  console.log(`[EXTRACTOR] Extrayendo videos desde: ${pageUrl}`);

  let html;
  try {
    const res = await axiosGet(pageUrl, { timeout: 8000 });
    html = res.data;
  } catch (e) {
    console.error('[EXTRACTOR] Error descargando página:', e.message);
    return { status: 700, mjs: e.message };
  }

  const $ = cheerio.load(html);
  let videos = [];
  // Selección de extractor
  if (/hentaila.com/i.test(pageUrl)) {
    videos = await extractHL($, pageUrl);
  }
  else if (/open.aniyae.net/i.test(pageUrl)) {
    videos = await extractAniyae($, pageUrl);
  }
  else if (/animeflv.one/i.test(pageUrl)) {
    videos = await extractONE($, pageUrl);
  }
  else if (/jkanime.net/i.test(pageUrl)) {
    videos = await extractJK($, pageUrl);
  }
  else {
    videos = await extractGeneric($, pageUrl);
  }

  // Guardar cache
  if (videos.length > 0) {
    linksCache.save(pageKey, JSON.stringify(videos));
  }

  console.log(`[EXTRACTOR] Videos encontrados: ${videos.length}`);
  return videos;
}

// ================== IMPORT EXTRACTORS ==================
const sw = require('./models/sw');
const voe = require('./models/voe');
const bc = require('./models/bc');
const yu = require('./models/yu');
const st = require('./models/st');
const uq = require('./models/uq');
const mp4 = require('./models/mp4');
const jkum = require('./models/jkum');

// ================== NORMALIZER ==================
function normalizeExtractor(mod) {
  if (typeof mod === 'function') return mod;
  if (typeof mod?.extract === 'function') return mod.extract;
  if (typeof mod?.extractST === 'function') return mod.extractST;
  if (typeof mod?.extractVoe === 'function') return mod.extractVoe;
  if (typeof mod?.extractM3u8 === 'function') return mod.extractM3u8;
  if (typeof mod?.uq === 'function') return mod.uq;
  if (typeof mod?.mp4 === 'function') return mod.mp4;
  if (typeof mod?.jkum === 'function') return mod.jkum;
  throw new Error('Extractor inválido');
}

// ================== ROUTER ==================
const extractorMap = {
  streamwish: sw,
  swiftplayers: sw,
  obeywish: sw,
  sw: sw,
  voe: voe,
  burstcloud: bc,
  bc: bc,
  yourupload: yu,
  yu: yu,
  stape: st,
  uqload: uq,
  mp4upload: mp4,
  jkum: jkum,
};

function getExtractor(name) {
  const mod = extractorMap[name?.toLowerCase()];
  if (!mod) return null;
  const fn = normalizeExtractor(mod);
  return async function wrappedExtractor(url) {
    return await fn(url);
  };
}

module.exports = {
  axiosGet,
  cheerio,
  extractAllVideoLinks,
  transformObeywish,
  getExtractor
};