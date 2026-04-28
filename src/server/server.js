"use strict";

const app = require('../app');
const { PORT } = require('../config');
const { log, error } = require('./logger');

function startServer() {
    const server = app.listen(PORT, '0.0.0.0', () => {
        log(`Servidor en http://localhost:${PORT}`);
    });

    server.on('error', (err) => {
        error('Error en servidor:', err);
        process.exit(1);
    });

    return server;
}

module.exports = startServer;