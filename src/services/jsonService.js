// src/services/jsonService.js
const fs = require('fs');
const path = require('path');
const cache = require('./cacheService');
const { JSON_FOLDER, ANIME_FILE } = require('../config');

if (!fs.existsSync(JSON_FOLDER)) fs.mkdirSync(JSON_FOLDER, { recursive: true });

/**
 * Lee el JSON completo y lo cachea
 */
function readRawJson() {
  const cacheKey = 'rawJson';
  let data = cache.get(cacheKey);
  if (data) return data;

  try {
    if (!fs.existsSync(ANIME_FILE)) {
      data = { metadata: {}, animes: [] };
    } else {
      // Leer y parsear solo una vez
      data = JSON.parse(fs.readFileSync(ANIME_FILE, 'utf8'));
    }
    cache.set(cacheKey, data, 5000); // TTL 5s
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
 * Devuelve lista de animes (sin duplicar objetos)
 */
function readAnimeList() {
  return readRawJson().animes || [];
}

/**
 * Busca anime por ID, cache individual por ID
 */
function getAnimeById(id) {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return null;

  const cacheKey = `animeId:${numId}`;
  let anime = cache.get(cacheKey);
  if (anime) return anime;

  anime = readAnimeList().find(a => a.id === numId) || null;
  if (anime) cache.set(cacheKey, anime, 5000);
  return anime;
}

/**
 * Busca anime por unit_id, cache individual
 */
function getAnimeByUnitId(unitId) {
  const numId = parseInt(unitId, 10);
  if (isNaN(numId)) return null;

  const cacheKey = `animeUnitId:${numId}`;
  let anime = cache.get(cacheKey);
  if (anime) return anime;

  anime = readAnimeList().find(a => a.unit_id === numId) || null;
  if (anime) cache.set(cacheKey, anime, 5000);
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
          .replace(/\/$/, '') // elimina / final
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
