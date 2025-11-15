// src/routes/maintenance.js
const express = require('express');
const path = require('path');
const { iniciarMantenimiento } = require('../services/maintenanceService');
const { MAINTENANCE_PASSWORD } = require('../config');
const { getUpdatingStatus, setUpdatingStatus } = require('../middlewares/maintenanceBlock');

const router = express.Router();

router.get('/up', async (req, res) => {
  const { pass } = req.query;
  console.log(`[UP] Solicitud de mantenimiento con pass: ${pass || 'ausente'}`);

  if (pass !== MAINTENANCE_PASSWORD) {
    console.warn(`[UP] Contraseña incorrecta o ausente`);
    return res.status(401).sendFile(path.join(__dirname,'..','..', 'public/pass.html'));
  }

  // Evita lanzar mantenimiento si ya está en ejecución
  if (getUpdatingStatus()) {
    console.log(`[UP] Mantenimiento ya en ejecución, ignorando solicitud`);
    return res.redirect('/');
  }

  // Marca como en mantenimiento antes de iniciar
  setUpdatingStatus(true);
  console.log(`[UP] Mantenimiento iniciado, redirigiendo a /`);
  res.redirect('/');

  // Inicia worker en background
  iniciarMantenimiento().finally(() => {
    setUpdatingStatus(false);
    console.log(`[UP] Mantenimiento finalizado`);
  });
});

module.exports = router;
