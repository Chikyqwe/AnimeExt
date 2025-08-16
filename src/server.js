// src/server.js
console.log('[INFO] Iniciando servidor AnimeExt...');
const app = require('./app');
const { PORT, MAINTENANCE_PASSWORD } = require('./config');
const { iniciarMantenimiento } = require('./services/maintenanceService');

// =================== AUTO MANTENIMIENTO (1am y 12pm) ===================
async function programarMantenimiento(hora, minuto) {
  const ahora = new Date();
  const proxima = new Date();

  proxima.setHours(hora);
  proxima.setMinutes(minuto);
  proxima.setSeconds(0);
  proxima.setMilliseconds(0);

  // Si la hora ya pasó hoy, programar para mañana
  if (proxima <= ahora) {
    proxima.setDate(proxima.getDate() + 1);
  }

  const delay = proxima - ahora;

  const horaStr = hora.toString().padStart(2, '0');
  const minStr = minuto.toString().padStart(2, '0');
  console.log(`[AUTO MANTENIMIENTO] Próxima ejecución a las ${horaStr}:${minStr} en ${Math.round(delay / 1000 / 60)} min`);

  setTimeout(async () => {
    console.log(`[AUTO MANTENIMIENTO] Ejecutando mantenimiento programado (${horaStr}:${minStr})...`);
    try {
      await iniciarMantenimiento(); // por si es async
    } catch (err) {
      console.error('[AUTO MANTENIMIENTO] Error durante el mantenimiento:', err);
    }

    // ===== Recordatorio cada 10 minutos después del mantenimiento =====
    let minutos = 0;
    const recordatorio = setInterval(() => {
      minutos += 10;
      console.log(`[AUTO MANTENIMIENTO] Han pasado ${minutos} min desde el último mantenimiento (${horaStr}:${minStr})`);
      // Opcional: si quieres que se detenga a las 2h, por ejemplo:
      if (minutos >= 120) {
        clearInterval(recordatorio);
      }
    }, 10 * 60 * 1000);

    // Reprogramar para el próximo día
    programarMantenimiento(hora, minuto);
  }, delay);
}

// Programar para 1:00 AM y 12:00 PM
programarMantenimiento(1, 0);
programarMantenimiento(12, 0);

// =================== SERVIDOR INICIADO ===================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SUCCES] Servidor corriendo en http://localhost:${PORT}`);
});

console.log(`[INFO] Contraseña para mantenimiento (/up): ${MAINTENANCE_PASSWORD}`);

// =================== ENTRADA INTERACTIVA DESDE CONSOLA ===================
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '> '
});

// 🔧 Parchear console.log para no interrumpir el input del usuario
const originalLog = console.log;

console.log = (...args) => {
  readline.clearLine(process.stdout, 0);    // Limpia línea
  readline.cursorTo(process.stdout, 0);     // Mueve el cursor al inicio
  originalLog(...args);                     // Muestra el log
  rl.prompt(true);                          // Redibuja el prompt
};

// 🖥️ Comandos disponibles
console.log('[CONSOLE] Comandos disponibles: up | clear | pass | exit');
rl.prompt();

rl.on('line', (line) => {
  const command = line.trim().toLowerCase();

  switch (command) {
    case 'up':
      console.log('[CONSOLE] Ejecutando mantenimiento manual...');
      iniciarMantenimiento();
      break;
    case 'clear':
      console.clear();
      break;
    case 'pass':
      console.log(`[PASSWORD] ${MAINTENANCE_PASSWORD}`);
      break;
    case 'exit':
      console.log('[CONSOLE] Cerrando servidor...');
      rl.close();
      process.exit(0);
      break;
    default:
      console.log(`[CONSOLE] Comando desconocido: "${command}"`);
  }

  rl.prompt();
});
