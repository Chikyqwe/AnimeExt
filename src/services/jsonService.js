const fs = require('fs');
const path = require('path');
const { JSON_FOLDER, ANIME_FILE } = require('../config');

if (!fs.existsSync(JSON_FOLDER)) {
  fs.mkdirSync(JSON_FOLDER, { recursive: true });
}

// Lee el JSON completo (metadata + animes)
function readRawJson() {
  try {
    if (!fs.existsSync(ANIME_FILE)) {
      console.warn(`[JSON SERVICE] El archivo no existe. Devolviendo objeto vacío.`);
      return { metadata: {}, animes: [] };
    }
    const data = fs.readFileSync(ANIME_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`[JSON SERVICE] Error al leer el archivo JSON:`, err);
    return { metadata: {}, animes: [] };
  }
}

// Devuelve solo la lista de animes
function readAnimeList() {
  return readRawJson().animes || [];
}

function getAnimeById(id) {
  return readAnimeList().find(anime => anime.id === parseInt(id, 10));
}

function getAnimeByUnitId(unitId) {
  return readAnimeList().find(anime => anime.unit_id === parseInt(unitId, 10));
}

function buildEpisodeUrl(anime, ep, mirror = 1) {
  if (!anime?.sources || !ep) return null;

  let baseUrl = '';
  if (mirror === 1 && anime.sources.FLV) {
    baseUrl = anime.sources.FLV.replace('/anime/', '/ver/') + `-${ep}`;
  } else if (mirror === 2 && anime.sources.TIO) {
    baseUrl = anime.sources.TIO.replace('/anime/', '/ver/') + `-${ep}`;
  } else {
    return null;
  }

  return baseUrl;
}

function getJsonFiles() {
  try {
    return fs.readdirSync(JSON_FOLDER).filter(f => f.endsWith('.json'));
  } catch (err) {
    console.error(`[JSON SERVICE] Error al leer el directorio de JSONs:`, err);
    throw new Error('Error al leer el directorio de JSONs');
  }
}

module.exports = {
  readAnimeList,
  readRawJson,
  getAnimeById,
  getAnimeByUnitId,
  buildEpisodeUrl,
  getJsonFiles,
  getJSONPath: (filename) => path.join(JSON_FOLDER, filename)
};
