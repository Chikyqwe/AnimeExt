"use strict";

const SendEmail = require('../services/emailService');
const { warn, error } = require('./logger');

const MEM_LIMIT_GC = 360 * 1024 * 1024;
const MEM_LIMIT_RESTART = 430 * 1024 * 1024;

let reportando = false;

async function monitorMemoria() {
    const { rss } = process.memoryUsage();
    const rssMB = (rss / 1024 / 1024).toFixed(2);

    if (rss > MEM_LIMIT_RESTART && !reportando) {
        reportando = true;

        error(`Memoria crítica: ${rssMB} MB → Reinicio`);

        try {
            const email = process.env.ReportEmail;
            if (email) {
                await SendEmail(email, `Reinicio automático (${rssMB} MB)`, true);
            }
        } catch (e) {
            error('Error enviando email:', e);
        }

        process.exit(1);
    }

    if (rss > MEM_LIMIT_GC) {
        if (global.gc) {
            warn(`Memoria alta (${rssMB} MB). Ejecutando GC...`);
            global.gc();
        } else {
            warn(`Memoria alta (${rssMB} MB). Usa --expose-gc`);
        }
    }
}

module.exports = monitorMemoria;