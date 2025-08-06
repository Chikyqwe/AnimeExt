require('dotenv').config();
const path = require('path');
console.log('JSON_FOLDER =', process.env.JSON_FOLDER);

const PORT = process.env.PORT;
const BROWSERLESS_ENDPOINT = process.env.BROWSERLESS_ENDPOINT;
const BROWSERLESS_ENDPOINT_FIREFOX_PLAYWRIGHT = process.env.BROWSERLESS_ENDPOINT_FIREFOX_PLAYWRIGHT;
const JSON_FOLDER = path.isAbsolute(process.env.JSON_FOLDER) ? process.env.JSON_FOLDER : path.join(__dirname, '..', '..', process.env.JSON_FOLDER);
const ANIME_FILE = path.join(JSON_FOLDER, 'anime_list.json');
const ALLOWED_EXTENSIONS = process.env.ALLOWED_EXTENSIONS ? process.env.ALLOWED_EXTENSIONS.split(',') : undefined;
const MAINTENANCE_PASSWORD = Math.random().toString(36).slice(-8); // Igual puedes dejarlo aquí si quieres que cambie en cada inicio

module.exports = {
  PORT,
  BROWSERLESS_ENDPOINT,
  BROWSERLESS_ENDPOINT_FIREFOX_PLAYWRIGHT,
  JSON_FOLDER,
  ANIME_FILE,
  ALLOWED_EXTENSIONS,
  MAINTENANCE_PASSWORD,
};
