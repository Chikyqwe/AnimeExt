// src/routes/views.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { randomKey } = require('../utils/token');
const { getAnimeByUnitId } = require('../services/jsonService');
const imgs = require('../controllers/imageController');

// -------------------- CACHE --------------------
// Plantillas HTML
const HTML_FILES = ['index.html', 'player.html', 'app.html', 'app_redir.html', 'privacy-policy.html'];
const htmlCache = {};

HTML_FILES.forEach(file => {
  const fullPath = path.join(__dirname, '..', '..', 'public', file);
  try {
    htmlCache[file] = fs.readFileSync(fullPath, 'utf8');
    console.log(`[CACHE] HTML cargado: ${file}`);
  } catch (e) {
    console.warn(`[CACHE] No se pudo cargar ${file}: ${e.message}`);
    htmlCache[file] = '';
  }
});

// -------------------- RUTAS --------------------

// Raíz
router.get('/', (req, res) => {
  const key1 = randomKey(8);
  const key2 = randomKey(8);

  res.cookie('_K0x1FLVTA0xAA1', key1, { httpOnly: false, path: '/', sameSite: "None", secure: true });
  res.cookie('_K0x2FLVTA0xFF2', key2, { httpOnly: false, path: '/', sameSite: "None", secure: true });

  res.setHeader('Cache-Control', 'no-store');
  console.log('Claves enviadas:', { key1, key2 });

  res.send(htmlCache['index.html']);
});
// imgs
router.get('/app/screenshots', imgs.listImages);
router.get('/app/images/:imageName', imgs.serveImage);

// Player
router.get('/player', (req, res) => {
  res.send(htmlCache['player.html']);
});

// App principal
router.get('/app', (req, res) => {
  res.send(htmlCache['app.html']);
});

// Privacy policy
router.get('/privacy-policy.html', (req, res) => {
  res.send(htmlCache['privacy-policy.html']);
});

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
