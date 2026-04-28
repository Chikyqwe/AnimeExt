"use strict";

const { ejecutarMantenimiento } = require('./maintenanceScheduler');

function startMaintenanceScheduler() {
    const INTERVALO = 45 * 60 * 1000;

    return setInterval(() => {
        ejecutarMantenimiento();
    }, INTERVALO);
}

module.exports = startMaintenanceScheduler;