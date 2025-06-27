// src/routes/maintenance.js
const express = require('express');
const { iniciarMantenimiento } = require('../services/maintenanceService');
const { MAINTENANCE_PASSWORD } = require('../config');

const router = express.Router();

router.get('/up', async (req, res) => {
  const { pass } = req.query;
  console.log(`[UP] Solicitud de mantenimiento con pass: `);
  if (pass !== MAINTENANCE_PASSWORD) {
    console.warn(`[UP] Contrase�a incorrecta o ausente`);
    return res.status(401).send('? Acceso no autorizado. Par�metro "pass" requerido.');
  }

  res.send('? Iniciando mantenimiento. Intenta nuevamente en unos minutos...');
  iniciarMantenimiento();
});

module.exports = router;
