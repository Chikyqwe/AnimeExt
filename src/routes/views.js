// src/routes/views.js
const express = require('express');
const path = require('path');
const router = express.Router();

const { randomKey } = require('../utils/token');

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

// Ruta para el reproductor
router.get('/privacy-policy.html', (req, res) => {
  console.log(`[GET /privacy-policy] Sirviendo privacy-policy.html`);
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'privacy-policy.html'));
});

module.exports = router;
