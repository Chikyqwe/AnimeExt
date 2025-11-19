// src/app.js
console.log('[INFO] Iniciando aplicación AnimeExt...');

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const favicon = require('serve-favicon');
const { isMetadataStale } = require('./utils/CheckAnimeList');
const { iniciarMantenimiento } = require('./services/maintenanceService');
const { startEpisodeWorker } = require('./jobs/fcmWorker');

console.log('[INFO] Librerías cargadas.');

// =================== FUNCIONES AUXILIARES ===================
const safeRequire = (modulePath, label) => {
  try {
    const mod = require(modulePath);
    console.log(`[OK] ${label} cargado correctamente.`);
    return mod;
  } catch (err) {
    console.error(`[ERROR] No se pudo cargar ${label}:`, err.message);
    return null;
  }
};

// =================== IMPORTACIÓN DE MIDDLEWARE Y RUTAS ===================
const maintenanceBlock = safeRequire('./middlewares/maintenanceBlock', 'maintenanceBlock');
const viewsRoutes      = safeRequire('./routes/views', 'viewsRoutes');
const maintenanceRoutes = safeRequire('./routes/maintenance', 'maintenanceRoutes');
const playerRoutes      = safeRequire('./routes/player', 'playerRoutes');
const apiRoutes         = safeRequire('./routes/api', 'apiRoutes');
const WakeUP            = safeRequire('./utils/wakeUp', 'WakeUP');
const notification      = safeRequire('./routes/notificationRoute', 'notificationRoutes');
const animeRoutes        = safeRequire('./routes/index', 'animeRoutes');

const app = express();

// =================== MIDDLEWARE ===================
console.log('[INFO] Configurando middleware...');

app.use(favicon(path.join('./public', 'img', 'favicon.png')));
app.use(cors({ origin: (origin, callback) => callback(null, true), credentials: true }));
app.use(cookieParser());
app.use(express.json());

// Middleware estático
[['/static', 'static'], ['/img', 'img']].forEach(([route, folder]) => {
  app.use(route, express.static(path.join(__dirname, '..', 'public', folder)));
});

console.log('[INFO] Middleware configurado correctamente.');

// ================== Notifications Worker ==================
console.log('[INFO] Iniciando worker de notificaciones...');
startEpisodeWorker();
// ===========================================================

// =================== RUTAS ===================
console.log('[INFO] Montando rutas...');

[viewsRoutes, maintenanceRoutes, playerRoutes, apiRoutes, WakeUP, notification, animeRoutes]
  .filter(Boolean)
  .forEach((routeModule, idx) => {
    app.use('/', routeModule);
    console.log(`[ROUTE] / → módulo ${idx + 1} montado.`);
  });

// =================== MANTENIMIENTO ===================
if (isMetadataStale()) {
  console.log('[MANTENIMIENTO] Metadata expirada. Iniciando mantenimiento...');
  iniciarMantenimiento();
} else {
  console.log('[MANTENIMIENTO] Metadata vigente. No se requiere mantenimiento.');
}

// =================== RUTA 404 ===================
app.use((req, res) => {
  console.warn(`[ERROR 404] Ruta no encontrada: ${req.originalUrl}`);
  res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'));
});

console.log('[INFO] Configuración finalizada.');

module.exports = app;
