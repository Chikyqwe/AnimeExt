require('dotenv').config({ quiet: true });
const path = require('path');

const PORT = process.env.PORT || 4991;
const JSON_FOLDER = path.isAbsolute(process.env.JSON_FOLDER) ? process.env.JSON_FOLDER : path.join(__dirname, '..', '..', process.env.JSON_FOLDER);
const ANIME_FILE = path.join(JSON_FOLDER, 'anime_list.json');
const CACHE = true;
const HTTPS = false;

module.exports = {
  PORT,
  JSON_FOLDER,
  ANIME_FILE,
  CACHE,
  HTTPS
};

