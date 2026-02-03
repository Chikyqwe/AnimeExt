// src/services/jsonService.js
const fs = require('fs');
const path = require('path');
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
async function buildEpisodeUrl(anime, ep, mirror = 1) {
  if (!anime?.sources || !ep) return null;

  switch (mirror) {
    case 1:
      return anime.sources.FLV?.replace('/anime/', '/ver/') + `-${ep}` || null;
    case 2:
      return anime.sources.TIO?.replace('/anime/', '/ver/') + `-${ep}` || null;
    case 3:
      if (anime.sources.ANIMEYTX) {
        return anime.sources.ANIMEYTX
          .replace('/tv/', '/anime/')
          .replace(/\/$/, '') 
          + '-capitulo-' + ep;
      }
      break;
  }
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