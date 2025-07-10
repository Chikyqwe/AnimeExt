const fs = require('fs');
const path = require('path');
const { JSON_FOLDER, JSON_PATH_TIO } = require('../config');

// Asegúrate de que la carpeta de JSONs existe
if (!fs.existsSync(JSON_FOLDER)) {
  fs.mkdirSync(JSON_FOLDER, { recursive: true });
}

function readAnimeList() {
  try {
    if (!fs.existsSync(JSON_PATH_TIO)) {
      console.warn(`[JSON SERVICE] El archivo no existe. Devolviendo lista vacía.`);
      return [];
    }
    const data = fs.readFileSync(JSON_PATH_TIO, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`[JSON SERVICE] Error al leer la lista de animes:`, err);
    return [];
  }
}

function getAnimeById(id) {
  const list = readAnimeList();
  return list.find(anime => anime.id === parseInt(id, 10));
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
  getAnimeById,
  getJsonFiles,
  getJSONPath: (filename) => path.join(JSON_FOLDER, filename)
};
