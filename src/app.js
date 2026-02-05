// src/app.js
console.log('[INFO] Iniciando aplicación AnimeExt...');

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const favicon = require('serve-favicon');

// Servicios y Utilidades
const { isMetadataStale } = require('./utils/CheckAnimeList');
const { iniciarMantenimiento } = require('./services/maintenanceService');
const { startEpisodeWorker } = require('./jobs/fcmWorker');

// Inicialización de Express y WebSocket
const app = express();
require('express-ws')(app);
console.log('[INFO] WebSocket configurado');

// Middleware Global
app.use(favicon(path.join(__dirname, '..', 'public', 'img', 'favicon.png')));
app.use(cors({ origin: (o, cb) => cb(null, true), credentials: true }));
app.use(cookieParser());
app.use(express.json());

// Configuración de Archivos Estáticos
const staticPaths = [
    { route: '/static', folder: 'static' },
    { route: '/img', folder: 'img' }
];

staticPaths.forEach(({ route, folder }) => {
    app.use(route, express.static(path.join(__dirname, '..', 'public', folder)));
});

// ===================================================
// SISTEMA DE CARGA AUTOMÁTICA DE RUTAS
// ===================================================


/**
 * Escanea un directorio de forma recursiva buscando archivos de rutas
 */
function loadRoutes(directory) {
    if (!fs.existsSync(directory)) return;

    fs.readdirSync(directory).forEach(file => {
        const fullPath = path.join(directory, file);

        // 1. Si es una carpeta, entrar (Recursividad total)
        if (fs.statSync(fullPath).isDirectory()) {
            return loadRoutes(fullPath);
        }

        // 2. Solo archivos JS y que no sea este mismo archivo (app.js)
        if (!file.endsWith('.js') || fullPath === __filename) return;

        try {
            // 3. Leemos el archivo ANTES de cargarlo para decidir qué hacer
            const fileContent = fs.readFileSync(fullPath, 'utf8');
            const hasWsSupport = fileContent.includes('// ws.support=true');
            
            // Si el archivo no menciona "express" o "Router" y no tiene la etiqueta de WS, 
            // probablemente no es una ruta y lo saltamos para evitar errores.
            if (!fileContent.includes('express') && !hasWsSupport) {
                return; 
            }

            const routeModule = require(fullPath);
            console.log('[R]: '+fullPath)
            let router = null;

            // 4. Lógica de carga según el tipo
            if (hasWsSupport && typeof routeModule === 'function') {
                // Caso WS: Ejecutamos pasando la app
                router = routeModule(app);
                console.log(`[WS-ROUTE] Detectado y cargado: ${file}`);
            } else if (typeof routeModule === 'function' && routeModule.length === 1) {
                // Caso: Exporta función de un solo argumento (asumimos que es app)
                router = routeModule(app);
                console.log(`[FUNC-ROUTE] Cargado mediante inyección: ${file}`);
            } else if (routeModule && (Object.getPrototypeOf(routeModule) === express.Router || routeModule.stack)) {
                // Caso: Es un Router estándar exportado directamente
                router = routeModule;
                console.log(`[ROUTE] Cargado estándar: ${file}`);
            }

            // 5. Montaje final
            if (router) {
                app.use('/', router);
            }

        } catch (err) {
            // Si falla un archivo que no era una ruta, lo ignoramos silenciosamente
            // Si parece una ruta pero tiene error de sintaxis, lo avisamos
            if (err.message.includes('not a function') || err.message.includes('callback')) {
                console.error(`[DEBUG] Salto en ${file}: ${err.message}`);
            } else {
                console.error(`[DEBUG] Salto en ${file}: ${err.message}`);
            }
        }
    });
}

// 🔥 IMPORTANTE: Solo escaneamos la carpeta 'routes' para evitar conflictos
console.log('[INFO] Registrando rutas...');
loadRoutes(path.join(__dirname));

// ===================================================
// INICIALIZACIÓN DE SERVICIOS
// ===================================================

startEpisodeWorker();

if (isMetadataStale()) {
    console.log('[MANTENIMIENTO] Metadata expirada, iniciando...');
    iniciarMantenimiento();
} else {
    console.log('[MANTENIMIENTO] Metadata vigente.');
}

// Manejo de errores 404
app.use((req, res) => {
    console.warn(`[ERROR 404] Ruta no encontrada: ${req.originalUrl}`);
    res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'));
});

console.log('[INFO] App lista para recibir conexiones.');

module.exports = app;