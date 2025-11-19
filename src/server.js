console.log('[INFO] Iniciando servidor AnimeExt...');
const app = require('./app');
const { PORT, MAINTENANCE_PASSWORD } = require('./config');
const { iniciarMantenimiento } = require('./services/maintenanceService');
const readline = require('readline');

// =================== VARIABLES GLOBALES ===================
let ultimoMantenimiento = null;
let mantenimientoInterval = null;
let recordatorioInterval = null;

// =================== FUNCION DE MANTENIMIENTO ===================
async function ejecutarMantenimiento() {
  console.log(`[AUTO MANTENIMIENTO] Ejecutando mantenimiento programado...`);
  try {
    await iniciarMantenimiento();
    ultimoMantenimiento = new Date();
    console.log(`[AUTO MANTENIMIENTO] Mantenimiento completado: ${ultimoMantenimiento.toISOString()}`);
  } catch (err) {
    console.error('[AUTO MANTENIMIENTO] Error durante el mantenimiento:', err);
  }

  // Limpiar intervalos anteriores de recordatorio
  if (recordatorioInterval) clearInterval(recordatorioInterval);

  let minutos = 0;
  recordatorioInterval = setInterval(() => {
    minutos += 10;
    console.log(`[AUTO MANTENIMIENTO] Han pasado ${minutos} min desde el último mantenimiento`);
    if (minutos >= 120) clearInterval(recordatorioInterval);
  }, 10 * 60 * 1000);
}

// =================== PROGRAMAR MANTENIMIENTO CADA 45 MIN ===================
const INTERVALO = 45 * 60 * 1000;
mantenimientoInterval = setInterval(ejecutarMantenimiento, INTERVALO);

// =================== SERVIDOR INICIADO ===================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SUCCESS] Servidor corriendo en http://localhost:${PORT}`);
  console.log(`[INFO] Contraseña para mantenimiento (/up): ${MAINTENANCE_PASSWORD}`);
});

// =================== CONSOLA INTERACTIVA ===================
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '> '
});

// Sobrescribe console.log para mantener prompt limpio
const originalLog = console.log;
console.log = (...args) => {
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  originalLog(...args);
  rl.prompt(true);
};

console.log('[CONSOLE] Comandos disponibles: up | clear | pass | exit');
rl.prompt();

rl.on('line', async (line) => {
  const command = line.trim().toLowerCase();

  switch (command) {
    case 'up':
      console.log('[CONSOLE] Ejecutando mantenimiento manual...');
      await ejecutarMantenimiento();
      break;
    case 'clear':
      console.clear();
      break;
    case 'pass':
      console.log(`[PASSWORD] ${MAINTENANCE_PASSWORD}`);
      break;
    case 'exit':
      console.log('[CONSOLE] Cerrando servidor...');
      // Limpiar intervalos antes de salir
      if (mantenimientoInterval) clearInterval(mantenimientoInterval);
      if (recordatorioInterval) clearInterval(recordatorioInterval);
      rl.close();
      process.exit(0);
      break;
    default:
      console.log(`[CONSOLE] Comando desconocido: "${command}"`);
  }

  rl.prompt();
});
