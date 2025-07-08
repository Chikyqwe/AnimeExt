// src/app.js
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const favicon = require('serve-favicon');

const { maintenanceBlock } = require('./middleware/maintenanceBlock');
const viewsRoutes = require('./routes/views');
const maintenanceRoutes = require('./routes/maintenance');
const playerRoutes = require('./routes/player');
const apiRoutes = require('./routes/api');

const app = express();

console.log('[INFO] Iniciando aplicación AnimeExt...');

// =================== MIDDLEWARE ===================

app.use(maintenanceBlock); // Primero el middleware de bloqueo
// Ruta al favicon
app.use(favicon(path.join('./public', 'img', 'logo.png')));
app.use(cors());
app.use(cookieParser());
app.use(express.json());
// Servir archivos estáticos desde la carpeta 'public'
app.use(express.static(path.join(__dirname, '..', 'public')));

console.log('[INFO] Middleware configurado correctamente');


// =================== RUTAS ===================
app.use('/', viewsRoutes);
app.use('/', maintenanceRoutes); // Las rutas /up y /maintenance
app.use('/', playerRoutes); // La ruta /api/player
app.use('/', apiRoutes); // Las rutas /json-list, /jsons/:filename, /proxy-image, /api, /api/servers, /api/m3u8, /api/stream, /queue-status

// Manejo de rutas no encontradas (404)
app.use((req, res, next) => {
  res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'));
});

module.exports = app;
