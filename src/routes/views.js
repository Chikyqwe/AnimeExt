// src/routes/views.js
const express = require('express');
const path = require('path');
const { getUpdatingStatus, getRequestLog, clearRequestLog } = require('../middleware/maintenanceBlock'); // Importar para chequear estado

const router = express.Router();

// Ruta para la página principal
router.get('/', (req, res) => {
  console.log(`[GET /] Sirviendo index.html`);
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
});

// Ruta para el reproductor
router.get('/player', (req, res) => {
  console.log(`[GET /player] Sirviendo player.html`);
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'player.html'));
});

router.get('/anime/list', (req, res) => {
  console.log(`[GET /player] Sirviendo player.html`);
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'list.html'));
});

// Ruta de mantenimiento
router.get('/maintenance', (req, res) => {
  console.log(`[GET /maintenance] Sirviendo maintenance.html`);
  if (!getUpdatingStatus()) {
    console.log(`[MAINTENANCE] No hay mantenimiento activo, redirigiendo a /`);
    return res.redirect('/'); // Redirige a la página principal si no hay mantenimiento activo
  }
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'maintenance.html'));
});

router.get('/reqs', (req, res) => {
  try {
    const logs = getRequestLog(100);
    res.json({ count: logs.length, logs });
  } catch (error) {
    console.error('Error al obtener logs:', error);
    res.status(500).json({ error: 'Error interno al obtener logs' });
  }
});

router.get('/reqs/DELETE', (req, res) => {
  try {
    clearRequestLog();
    res.json({ message: 'Registro de solicitudes limpiado correctamente.' });
  } catch (error) {
    console.error('Error al limpiar logs:', error);
    res.status(500).json({ error: 'Error interno al limpiar logs' });
  }
});

module.exports = router;
