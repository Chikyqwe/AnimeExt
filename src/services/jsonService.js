// src/services/jsonService.js
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const { JSON_FOLDER, ANIME_FILE } = require('../config');

// Importamos las nuevas clases de caché
const { KeyCache, MemoryCache } = require('../core/cache/cache');

/**
 * Modernización: 
 * Usamos MemoryCache para el JSON bruto (acceso ultra rápido).
 * Usamos KeyCache para los animes individuales por ID (persisten comprimidos).
 */
const rawCache = new MemoryCache({ maxEntries: 10 });
const itemCache = new KeyCache({ ttlMs: 10 * 60 * 1000 }); // 10 min persistentes

if (!fs.existsSync(JSON_FOLDER)) fs.mkdirSync(JSON_FOLDER, { recursive: true });

/**
 * Lee el JSON completo y lo cachea en RAM
 */
function readRawJson() {
  const cacheKey = 'rawJson';
  let data = rawCache.load(cacheKey);
  if (data) return data;

  try {
    if (!fs.existsSync(ANIME_FILE)) {
      data = { metadata: {}, animes: [] };
    } else {
      data = JSON.parse(fs.readFileSync(ANIME_FILE, 'utf8'));
    }
    // Guardamos en RAM por 5 segundos para no saturar el disco en peticiones concurrentes
    rawCache.save(cacheKey, data, 5000);
    return data;
  } catch (err) {
    console.error('[JSON SERVICE] Error leyendo JSON:', err);
    return { metadata: {}, animes: [] };
  }
}

/**
 * Devuelve metadata
 */
function getMetadata() {
  return readRawJson().metadata || {};
}

/**
 * Devuelve lista de animes
 */
function readAnimeList() {
  return readRawJson().animes || [];
}

/**
 * Busca anime por ID, usa KeyCache (Disco + Gzip)
 */
function getAnimeById(id) {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return null;

  const cacheKey = `animeId:${numId}`;
  let anime = itemCache.load(cacheKey);
  if (anime) return anime;

  anime = readAnimeList().find(a => a.id === numId) || null;
  if (anime) itemCache.save(cacheKey, anime);
  return anime;
}

/**
 * Busca anime por unit_id, usa KeyCache (Disco + Gzip)
 */
function getAnimeByUnitId(unitId) {
  const numId = parseInt(unitId, 10);
  if (isNaN(numId)) return null;

  const cacheKey = `animeUnitId:${numId}`;
  let anime = itemCache.load(cacheKey);
  if (anime) return anime;

  anime = readAnimeList().find(a => a.unit_id === numId) || null;
  if (anime) itemCache.save(cacheKey, anime);
  return anime;
}

/**
 * Construye URL de episodio según mirror
 */
async function extractAniyae(url, ep) {

}
async function buildEpisodeUrl(anime, ep, mirror = 1) {
  const m = parseInt(mirror, 10);
  const e = parseInt(ep, 10);

  console.log(`[buildEpisodeUrl] Procesando: Mirror ${m}, Ep ${e}`);

  if (!anime?.sources) {
    console.log('[buildEpisodeUrl] Error: El objeto anime no tiene sources');
    return null;
  }

  switch (m) {
    // 🔵 FLV
    case 1:
      if (anime.sources.FLV) {
        return anime.sources.FLV.replace('/anime/', '/ver/') + `-${e}`;
      }
      break;
    case 2:
      if (anime.sources.ONE) {
        return anime.sources.ONE.replace('/anime/', '/ver/') + `-${e}`;
      }
      break;
    // 🟣 TIOANIME / TIOHENTAI
    case 3:
      if (anime.sources.TIO) {
        let url = anime.sources.TIO;

        if (url.includes('tioanime.com')) {
          return url.replace('/anime/', '/ver/') + `-${e}`;
        } else if (url.includes('tiohentai.com')) {
          // ⚠️ ya viene con número al final
          return url.replace(/-\d+$/, `-${e}`);
        }
      }
      break;

    // 🟡 JKANIME
    case 4:
      if (anime.sources.JK) {
        return anime.sources.JK + `${e}/`;
      }
      break;

    // 🔴 ANIYAE
    case 5:
      if (anime.sources.ANIYAE) {
        const { data: html } = await axios.get(anime.sources.ANIYAE);
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
        // 6️⃣ API EPISODIOS
        // ===============================
        const api = `https://open.aniyae.net/wp-json/kiranime/v1/anime/${animeId}/episodes?page=1&per_page=999999999&order=asc`;

        const res = await axios.get(api);
        const epsArray = res.data.episodes || [];
        // ===============================
        // 9️⃣ RESULTADO FINAL
        // ===============================
        return epsArray[e - 1].url;
      }
      break;

    // 🟠 HENTAILA
    case 6:
      if (anime.sources.HENTAILA) {
        return anime.sources.HENTAILA + `/${e}`;
      }
      break;

    // ⚫ TIOHENTAI directo
    case 7:
      if (anime.sources.TIOHENTAI) {
        return anime.sources.TIOHENTAI.replace('/hentai/', '/ver/') + `-${e}`;
      }
      break;
  }

  console.log(`[buildEpisodeUrl] No se encontró coincidencia para mirror ${m}`);
  return null;
}

/**
 * Lista archivos JSON en el folder
 */
function getJsonFiles() {
  try {
    return fs.readdirSync(JSON_FOLDER).filter(f => f.endsWith('.json'));
  } catch (err) {
    console.error('[JSON SERVICE] Error leyendo directorio JSON:', err);
    return [];
  }
}

/**
 * Ruta completa de un JSON
 */
function getJSONPath(filename) {
  return path.join(JSON_FOLDER, filename);
}

module.exports = {
  readRawJson,
  getMetadata,
  readAnimeList,
  getAnimeById,
  getAnimeByUnitId,
  buildEpisodeUrl,
  getJsonFiles,
  getJSONPath
};