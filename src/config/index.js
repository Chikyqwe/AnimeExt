// src/config/index.js
const path = require('path');

const PORT = 2015;
const BROWSERLESS_ENDPOINT = 'wss://production-sfo.browserless.io?token=2Sdm6cNuYEWLaX3d759736f79160430d65612a843b12eed2d';
const BROWSERLESS_ENDPOINT_FIREFOX_PLAYWRIGHT = `wss://production-sfo.browserless.io/firefox/playwright?token=2SfvxpfKAhW7lBke81f67c8f2841facf4054e104982c1a912`;
const JSON_FOLDER = path.join(__dirname, '..', '..', 'jsons');
const JSON_PATH_TIO = path.join(JSON_FOLDER, 'anime_list.json');
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']; // Si se usaran para un validador de imágenes
const MAINTENANCE_PASSWORD = Math.random().toString(36).slice(-8); // Se genera una sola vez al iniciar la app

module.exports = {
  PORT,
  BROWSERLESS_ENDPOINT,
  BROWSERLESS_ENDPOINT_FIREFOX_PLAYWRIGHT,
  JSON_FOLDER,
  JSON_PATH_TIO,
  ALLOWED_EXTENSIONS,
  MAINTENANCE_PASSWORD,
};
