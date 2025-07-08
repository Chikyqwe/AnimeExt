// src/routes/maintenance.js
const express = require('express');
const { iniciarMantenimiento } = require('../services/maintenanceService');
const { MAINTENANCE_PASSWORD } = require('../config');

const router = express.Router();

router.get('/up', async (req, res) => {
  const { pass } = req.query;
  console.log(`[UP] Solicitud de mantenimiento con pass: ${pass || 'ausente'}`);
  if (pass !== MAINTENANCE_PASSWORD) {
    console.warn(`[UP] Contraseña incorrecta o ausente`);
    return res.status(401).send('[UP] Contraseña incorrecta o ausente');
  }

  res.redirect('/maintenance');
  console.log(`[UP] Mantenimiento iniciado, redirigiendo a /maintenance`);
  iniciarMantenimiento();
});

module.exports = router;
