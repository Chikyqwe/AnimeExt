// src/routes/maintenance.js
const express = require('express');
const path = require('path');
const { iniciarMantenimiento } = require('../services/maintenanceService');

const { getUpdatingStatus, setUpdatingStatus } = require('../middlewares/maintenanceBlock');

const router = express.Router();

router.get('/up', async (req, res) => {
  console.log(`[UP] Solicitud de mantenimiento`);


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
