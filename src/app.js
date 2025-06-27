// src/app.js
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

const { maintenanceBlock } = require('./middleware/maintenanceBlock');
const viewsRoutes = require('./routes/views');
const maintenanceRoutes = require('./routes/maintenance');
const playerRoutes = require('./routes/player');
const apiRoutes = require('./routes/api');

const app = express();

console.log('?? Inicio del servidor y carga de m�dulos completada');

// =================== MIDDLEWARE ===================
app.use(maintenanceBlock); // Primero el middleware de bloqueo
app.use(cors());
app.use(cookieParser());
app.use(express.json());
// Servir archivos est�ticos desde la carpeta 'public'
app.use(express.static(path.join(__dirname, '..', 'public')));

console.log('?? Middlewares aplicados: CORS, cookieParser, JSON, Static Files');

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
