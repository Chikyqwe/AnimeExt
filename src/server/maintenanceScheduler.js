"use strict";

const { iniciarMantenimiento } = require('../services/maintenanceService');
const { log, error } = require('./logger');

let ultimoMantenimiento = null;
let recordatorioInterval = null;

async function ejecutarMantenimiento() {
    log('Ejecutando mantenimiento...');

    try {
        await iniciarMantenimiento();
        ultimoMantenimiento = new Date();
        log(`Mantenimiento completado: ${ultimoMantenimiento.toISOString()}`);
    } catch (err) {
        error('Error en mantenimiento:', err);
        return;
    }

    if (recordatorioInterval) clearInterval(recordatorioInterval);

    let minutos = 0;
    recordatorioInterval = setInterval(() => {
        minutos += 10;
        log(`Han pasado ${minutos} min desde mantenimiento`);

        if (minutos >= 120) {
            clearInterval(recordatorioInterval);
            recordatorioInterval = null;
        }
    }, 10 * 60 * 1000);
}

function getUltimoMantenimiento() {
    return ultimoMantenimiento;
}

module.exports = {
    ejecutarMantenimiento,
    getUltimoMantenimiento
};