// src/services/jsonService.js
const fs = require('fs');
const path = require('path');
const { JSON_FOLDER, JSON_PATH_TIO } = require('../config');

// Aseg�rate de que la carpeta de JSONs existe
if (!fs.existsSync(JSON_FOLDER)) {
  fs.mkdirSync(JSON_FOLDER, { recursive: true });
}

function readAnimeList() {
  try {
    if (!fs.existsSync(JSON_PATH_TIO)) {
      console.warn(`[JSON SERVICE] El archivo  no existe. Devolviendo lista vacia.`);
      return [];
    }
    const data = fs.readFileSync(JSON_PATH_TIO, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`[JSON SERVICE] Error al leer la lista de animes en :`, err);
    return [];
  }
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
  getJsonFiles,
  getJSONPath: (filename) => path.join(JSON_FOLDER, filename)
};
