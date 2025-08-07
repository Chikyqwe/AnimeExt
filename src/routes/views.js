// src/routes/views.js
const express = require('express');
const path = require('path');
const { getUpdatingStatus, getRequestLog, clearRequestLog } = require('../middleware/maintenanceBlock'); // Importar para chequear estado

const router = express.Router();

const { randomKey } = require('../utils/token');

router.get('/', (req, res) => {
  const key1 = randomKey(8);
  const key2 = randomKey(8);

  res.cookie('_K0x1FLVTA0xAA1', key1, {
    httpOnly: false,
    path: '/',
    sameSite: 'Lax',  // importante para evitar bloqueos
    secure: false     // debe ser false si no usas HTTPS
  });
  res.cookie('_K0x2FLVTA0xFF2', key2, {
    httpOnly: false,
    path: '/',
    sameSite: 'Lax',
    secure: false
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

router.get('/anime/list', (req, res) => {
  console.log(`[GET /list]`);
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
