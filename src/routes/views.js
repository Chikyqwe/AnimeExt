const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { randomKey } = require('../utils/token');
const { getAnimeByUnitId } = require('../services/jsonService');
const imgs = require('../controllers/imageController');

// -------------------- CACHE HTML --------------------
const HTML_FILES = ['index.html', 'player.html', 'app.html', 'app_redir.html', 'privacy-policy.html'];
const htmlCache = {};

HTML_FILES.forEach(file => {
  const fullPath = path.join(__dirname, '..', '..', 'public', file);
  try {
    htmlCache[file] = fs.readFileSync(fullPath, 'utf8');
    // Solo log inicial, no en cada request
    console.log(`[CACHE] HTML cargado: ${file}`);
  } catch (err) {
    console.warn(`[CACHE] No se pudo cargar ${file}: ${err.message}`);
    htmlCache[file] = '';
  }
});

// -------------------- HELPERS --------------------
function sendHtml(res, filename) {
  const html = htmlCache[filename] || '';
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}

function setRandomCookies(res) {
  const key1 = randomKey(8);
  const key2 = randomKey(8);
  res.cookie('_K0x1FLVTA0xAA1', key1, { httpOnly: false, path: '/', sameSite: "None", secure: true });
  res.cookie('_K0x2FLVTA0xFF2', key2, { httpOnly: false, path: '/', sameSite: "None", secure: true });
  res.setHeader('Cache-Control', 'no-store');
}

// -------------------- RUTAS --------------------

// Raíz
router.get('/', (req, res) => {
  setRandomCookies(res);
  sendHtml(res, 'index.html');
});

// Screenshots / Images
router.get('/app/screenshots', imgs.listImages);
router.get('/app/images/:imageName', imgs.serveImage);

// Player y App
router.get('/player', (req, res) => sendHtml(res, 'player.html'));
router.get('/app', (req, res) => sendHtml(res, 'app.html'));

// Privacy policy
router.get('/privacy-policy.html', (req, res) => sendHtml(res, 'privacy-policy.html'));

// App share con meta tags dinámicos
router.get('/app/share', async (req, res) => {
  try {
    const animeData = await getAnimeByUnitId(req.query.uid);

    const title = animeData?.title || 'Anime EXT';
    const desc = 'Disfruta de los mejores animes online';
    const image = animeData?.image || '';
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    const metaTags = `
      <meta property="og:title" content="${title}">
      <meta property="og:description" content="${desc}">
      <meta property="og:image" content="${image}">
      <meta property="og:url" content="${url}">
      <meta name="twitter:card" content="summary">  
      <meta property="og:image:width" content="260">
      <meta property="og:image:height" content="370">
    `;

    const html = htmlCache['app_redir.html'].replace('</head>', `${metaTags}\n</head>`);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    console.error('[ERROR] /app/share:', err.message);
    res.status(500).send('Error interno');
  }
});

module.exports = router;
