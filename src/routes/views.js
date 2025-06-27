// src/routes/views.js
const express = require('express');
const path = require('path');
const { getUpdatingStatus } = require('../middleware/maintenanceBlock'); // Importar para chequear estado

const router = express.Router();

// Ruta para la p�gina principal
router.get('/', (req, res) => {
  console.log(`[GET /] Sirviendo index.html`);
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
});

// Ruta para el reproductor
router.get('/player', (req, res) => {
  console.log(`[GET /player] Sirviendo player.html`);
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'player.html'));
});

// Ruta de mantenimiento
router.get('/maintenance', (req, res) => {
  console.log(`[GET /maintenance] Sirviendo maintenance.html`);
  if (!getUpdatingStatus()) {
    console.log(`[MAINTENANCE] No hay mantenimiento activo, redirigiendo a /`);
    return res.redirect('/'); // Redirige a la p�gina principal si no hay mantenimiento activo
  }
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'maintenance.html'));
});

module.exports = router;
