// src/app.js
console.log('[INFO] Iniciando aplicación AnimeExt...');

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const favicon = require('serve-favicon');

console.log('[INFO] Librerías cargadas.');

// =================== IMPORTACIÓN DE MIDDLEWARE Y RUTAS ===================

let maintenanceBlock, viewsRoutes, maintenanceRoutes, playerRoutes, apiRoutes, WakeUP;

try {
  maintenanceBlock = require('./middleware/maintenanceBlock').maintenanceBlock;
  console.log('[MIDDLEWARE] maintenanceBlock importado correctamente.');
} catch (err) {
  console.error('[ERROR] No se pudo cargar maintenanceBlock:', err.message);
}

try {
  viewsRoutes = require('./routes/views');
  console.log('[ROUTE] viewsRoutes cargado correctamente.');
} catch (err) {
  console.error('[ERROR] No se pudo cargar viewsRoutes:', err.message);
}

try {
  maintenanceRoutes = require('./routes/maintenance');
  console.log('[ROUTE] maintenanceRoutes cargado correctamente.');
} catch (err) {
  console.error('[ERROR] No se pudo cargar maintenanceRoutes:', err.message);
}

try {
  playerRoutes = require('./routes/player');
  console.log('[ROUTE] playerRoutes cargado correctamente.');
} catch (err) {
  console.error('[ERROR] No se pudo cargar playerRoutes:', err.message);
}

try {
  apiRoutes = require('./routes/api');
  console.log('[ROUTE] apiRoutes cargado correctamente.');
} catch (err) {
  console.error('[ERROR] No se pudo cargar apiRoutes:', err.message);
}

try {
  WakeUP = require('./utils/wakeUp');
  console.log('[UTILS] WakeUP cargado correctamente.');
} catch (err) {
  console.error('[ERROR] No se pudo cargar WakeUP:', err.message);
}

const app = express();

// =================== MIDDLEWARE ===================

console.log('[INFO] Configurando middleware...');

if (maintenanceBlock) {
  app.use(maintenanceBlock);
  console.log('[MIDDLEWARE] maintenanceBlock aplicado.');
}

app.use(favicon(path.join('./public', 'img', 'favicon.png')));
console.log('[MIDDLEWARE] Favicon configurado.');

app.use(cors());
console.log('[MIDDLEWARE] CORS habilitado.');

app.use(cookieParser());
console.log('[MIDDLEWARE] cookieParser habilitado.');

app.use(express.json());
console.log('[MIDDLEWARE] express.json habilitado.');

app.use(express.static(path.join(__dirname, '..', 'public')));
console.log('[MIDDLEWARE] Archivos estáticos servidos desde /public.');

console.log('[INFO] Middleware configurado correctamente.');

// =================== RUTAS ===================
console.log('[INFO] Montando rutas...');

if (viewsRoutes) {
  app.use('/', viewsRoutes);
  console.log('[ROUTE] / → viewsRoutes montado.');
}

if (maintenanceRoutes) {
  app.use('/', maintenanceRoutes);
  console.log('[ROUTE] / → maintenanceRoutes montado.');
}

if (playerRoutes) {
  app.use('/', playerRoutes);
  console.log('[ROUTE] / → playerRoutes montado.');
}

if (apiRoutes) {
  app.use('/', apiRoutes);
  console.log('[ROUTE] / → apiRoutes montado.');
}

if (WakeUP) {
  app.use('/', WakeUP);
  console.log('[ROUTE] / → WakeUP montado.');
}

// =================== RUTA 404 ===================
app.use((req, res, next) => {
  console.warn(`[ERROR 404] Ruta no encontrada: ${req.originalUrl}`);
  res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'));
});

console.log('[INFO] Configuración finalizada.');

module.exports = app;
