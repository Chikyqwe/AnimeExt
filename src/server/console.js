"use strict";

const readline = require('readline');
const { ejecutarMantenimiento, getUltimoMantenimiento } = require('./maintenanceScheduler');

function startConsole() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: '> '
    });

    console.log('Comandos: up | stats | clear | exit');
    rl.prompt();

    rl.on('line', async (line) => {
        const cmd = line.trim().toLowerCase();

        switch (cmd) {
            case 'up':
                console.log('Mantenimiento manual...');
                await ejecutarMantenimiento();
                break;

            case 'stats':
                console.log({
                    memoria: process.memoryUsage(),
                    uptime: process.uptime(),
                    ultimoMantenimiento: getUltimoMantenimiento()
                });
                break;

            case 'clear':
                console.clear();
                break;

            case 'exit':
                console.log('Cerrando...');
                process.exit(0);
                break;

            default:
                console.log(`Comando desconocido: ${cmd}`);
        }

        rl.prompt();
    });
}

module.exports = startConsole;