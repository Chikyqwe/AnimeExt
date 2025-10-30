// src/routes/views.js
const express = require('express');
const path = require('path');
const router = express.Router();
const fs = require('fs');
const { randomKey } = require('../utils/token');
const { getAnimeByUnitId } = require('../services/jsonService');

router.get('/', (req, res) => {
  const key1 = randomKey(8);
  const key2 = randomKey(8);

  res.cookie('_K0x1FLVTA0xAA1', key1, {
    httpOnly: false,
    path: '/',
    sameSite: "None",
    secure: true
  });
  res.cookie('_K0x2FLVTA0xFF2', key2, {
    httpOnly: false,
    path: '/',
    sameSite: "None",
    secure: true
  });

  // Desactiva cache para esta respuesta
  res.setHeader('Cache-Control', 'no-store');

  console.log('Claves enviadas:', { key1, key2 });

  res.sendFile(path.join(__dirname, '..','..', 'public', 'index.html'));
});

// Ruta para el reproductor
router.get('/player', (req, res) => {
  console.log(`[GET /player] Sirviendo player.html`);
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'player.html'));
});

router.get('/app/share', (req, res) => {
  console.log('[GET /app/share] Sirviendo app_redir.html');

  const filePath = path.join(__dirname, '..', '..', 'public', 'app_redir.html');

  // Leer el HTML original
  fs.readFile(filePath, 'utf8', async (err, html) => {
    if (err) {
      console.error('Error al leer app_redir.html:', err);
      return res.status(500).send('Error interno');
    }
    const animeData = await getAnimeByUnitId(req.query.uid);
    // Datos dinámicos — puedes ponerlos según query params
    const title = animeData.title || 'Anime EXT';
    const desc = 'Disfruta de los mejores animes online';
    const image = animeData.image;
    const url = req.protocol + '://' + req.get('host') + req.originalUrl;

    // Inyectar meta tags dentro del <head>
    const metaTags = `
      <meta property="og:title" content="${title}">
      <meta property="og:description" content="${desc}">
      <meta property="og:image" content="${image}">
      <meta property="og:url" content="${url}">
      <meta name="twitter:card" content="summary_large_image">
    `;

    // Insertar antes de </head>
    const newHtml = html.replace('</head>', `${metaTags}\n</head>`);

    res.setHeader('Content-Type', 'text/html');
    res.send(newHtml);
  });
});
// Ruta para el reproductor
router.get('/privacy-policy.html', (req, res) => {
  console.log(`[GET /privacy-policy] Sirviendo privacy-policy.html`);
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'privacy-policy.html'));
});

router.get('/app', (req, res) => {
  console.log(`[GET /app] Sirviendo app.html`);
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'app.html'));
});

module.exports = router;
