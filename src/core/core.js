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
async function extractAllVideoLinks(pageUrl) {
  // 1. Generar llave única para la URL de la página
  const pageKey = crypto.createHash('md5').update(pageUrl).digest('hex');

  // 2. Verificar si ya tenemos los links de esta página en caché
  if (linksCache.exists(pageKey)) {
    console.log(`[CACHE-LINKS] Reusando lista de videos para: ${pageUrl}`);
    try {
      return JSON.parse(linksCache.load(pageKey));
    } catch (e) {
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
  const videos = [];

  // --- Lógica de extracción (animeid, animeytx, genérico) ---
  if (/animeid/i.test(pageUrl)) {
    $('#partes .parte').each((_, el) => {
      let raw = $(el).attr('data');
      if (!raw) return;
      try {
        raw = raw.replace(/'/g, '"');
        const parsed = JSON.parse(raw);
        if (!parsed?.v) return;
        const iframeHtml = parsed.v.replace(/\\u003C/g, '<').replace(/\\u003E/g, '>').replace(/\\u002F/g, '/');
        const m = iframeHtml.match(/src="([^"]+)"/i);
        if (!m) return;
        const finalUrl = transformObeywish(m[1]);
        videos.push({ servidor: new URL(finalUrl).hostname.toLowerCase(), url: finalUrl });
      } catch (e) { console.error('[EXTRACTOR] animeid error:', e.message); }
    });
  } else if (/animeytx/i.test(pageUrl)) {
    $('select.mirror option').each((_, el) => {
      const encoded = $(el).attr('value');
      if (!encoded) return;
      const decoded = safeBase64Decode(encoded);
      if (!decoded) return;
      try {
        const $dec = cheerio.load(decoded);
        const src = $dec('iframe').attr('src');
        if (!src) return;
        const finalUrl = transformObeywish(src);
        videos.push({ servidor: new URL(finalUrl).hostname.toLowerCase(), url: finalUrl });
      } catch (e) { console.error('[EXTRACTOR] animeytx error:', e.message); }
    });
  } else {
    $('script').each((_, el) => {
      const scr = $(el).html();
      if (!scr) return;
      const match = scr.match(/var\s+videos\s*=\s*(\[.*?\]|\{[\s\S]*?\});/s);
      if (!match) return;
      try {
        const parsed = JSON.parse(match[1].replace(/\\\//g, '/'));
        if (parsed?.SUB) {
          parsed.SUB.forEach(v => {
            const url = transformObeywish(v.code || v[1]);
            if (!url) return;
            videos.push({ servidor: (v.server || v[0] || '').toLowerCase(), url });
          });
        } else if (Array.isArray(parsed)) {
          parsed.forEach(v => {
            if (!v[1]) return;
            videos.push({ servidor: (v[0] || '').toLowerCase(), url: transformObeywish(v[1]) });
          });
        }
      } catch (e) { console.error('[EXTRACTOR] genérico error:', e.message); }
    });
  }

  // 3. Guardar en caché antes de retornar (Convertimos a string para TextCache)
  if (videos.length > 0) {
    linksCache.save(pageKey, JSON.stringify(videos));
  }

  console.log(`[EXTRACTOR] Videos encontrados: ${videos.length}`);
  return videos;
}

// ================== IMPORT EXTRACTORS ==================
const sw  = require('./resolvers/sw');
const voe = require('./resolvers/voe');
const bc  = require('./resolvers/bc');
const yu  = require('./resolvers/yu');
const st  = require('./resolvers/st');

// ================== NORMALIZER ==================
function normalizeExtractor(mod) {
  if (typeof mod === 'function') return mod;
  if (typeof mod?.extract === 'function') return mod.extract;
  if (typeof mod?.extractST === 'function') return mod.extractST;
  if (typeof mod?.extractVoe === 'function') return mod.extractVoe;
  if (typeof mod?.extractM3u8 === 'function') return mod.extractM3u8;
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
  stape: st
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