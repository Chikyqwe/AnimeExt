// src/server.js
const app = require('./app');
const { PORT, MAINTENANCE_PASSWORD } = require('./config');
const { iniciarMantenimiento } = require('./services/maintenanceService');

console.log(`[INFO] Contraseña para mantenimiento (/up):${MAINTENANCE_PASSWORD} `);

// =================== AUTO MANTENIMIENTO ===================
console.log(`[AUTO MANTENIMIENTO] Se configuro auto mantenimiento cada 24 horas`);
setInterval(iniciarMantenimiento, 24 * 60 * 60 * 1000);

// =================== SERVIDOR INICIADO ===================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SUCCES] Servidor corriendo en http://localhost:${PORT}`);
});
