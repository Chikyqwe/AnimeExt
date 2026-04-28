"use strict";

const startServer = require('./server/server');
const startConsole = require('./server/console');
const monitorMemoria = require('./server/memoryMonitor');
const startMaintenanceScheduler = require('./server/maintenanceInterval');
const { ejecutarMantenimiento, getUltimoMantenimiento } = require('./server/maintenanceScheduler');
const { PORT } = require('./config');

const CHECK_INTERVAL = 10000;

// Función para obtener estadísticas (usada por la GUI)
const getStats = () => ({
    rss: process.memoryUsage().rss,
    heapTotal: process.memoryUsage().heapTotal,
    heapUsed: process.memoryUsage().heapUsed,
    uptime: process.uptime(),
    ultimoMantenimiento: getUltimoMantenimiento(),
    PORT
});

// Orquestador para iniciar todo el sistema (usado en modo terminal)
const startAll = () => {
    console.log('[INFO] Iniciando AnimeExt en modo Terminal...');
    startServer();
    startConsole();
    startMaintenanceScheduler();
    setInterval(monitorMemoria, CHECK_INTERVAL);
};

// Exportar todo para compatibilidad con main.js y gui/main.js
module.exports = {
    startServer,
    startConsole,
    startMaintenanceScheduler,
    monitorMemoria,
    ejecutarMantenimiento,
    getStats,
    startAll
};

// Si se ejecuta directamente o es invocado por el main original sin llamar a una función específica
if (require.main === module) {
    startAll();
}