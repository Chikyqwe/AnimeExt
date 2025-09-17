console.log('[INFO] Iniciando servidor AnimeExt...');
const app = require('./app');
const { PORT, MAINTENANCE_PASSWORD } = require('./config');
const { iniciarMantenimiento } = require('./services/maintenanceService');
const readline = require('readline');

// =================== VARIABLES GLOBALES ===================
let ultimoMantenimiento = null;

// =================== FUNCION DE MANTENIMIENTO ===================
async function ejecutarMantenimiento() {
  console.log(`[AUTO MANTENIMIENTO] Ejecutando mantenimiento programado...`);
  try {
    await iniciarMantenimiento();
    ultimoMantenimiento = new Date();
  } catch (err) {
    console.error('[AUTO MANTENIMIENTO] Error durante el mantenimiento:', err);
  }

  // Recordatorio cada 10 min durante 2h
  let minutos = 0;
  const recordatorio = setInterval(() => {
    minutos += 10;
    console.log(`[AUTO MANTENIMIENTO] Han pasado ${minutos} min desde el último mantenimiento`);
    if (minutos >= 120) clearInterval(recordatorio);
  }, 10 * 60 * 1000);
}

// =================== PROGRAMAR MANTENIMIENTO CADA 45 MIN ===================
const INTERVALO = 45 * 60 * 1000; // 45 minutos en ms
setInterval(ejecutarMantenimiento, INTERVALO);

// Ejecutar una vez al inicio
ejecutarMantenimiento();
// =================== ENDPOINT DE MANTENIMIENTO ===================
app.get('/mantenimiento', (req, res) => {
  const ahora = new Date();
  const diffMs = ultimoMantenimiento ? ahora - ultimoMantenimiento : null;
  const minutos = diffMs ? Math.floor(diffMs / (1000*60)) : null;

  res.json({
    ahora: ahora.toISOString(),
    ultimoMantenimiento: ultimoMantenimiento ? ultimoMantenimiento.toISOString() : null,
    minutosDesdeUltimo: minutos
  });
});
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

const originalLog = console.log;
console.log = (...args) => {
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  originalLog(...args);
  rl.prompt(true);
};

console.log('[CONSOLE] Comandos disponibles: up | clear | pass | exit');
rl.prompt();

rl.on('line', (line) => {
  const command = line.trim().toLowerCase();

  switch (command) {
    case 'up':
      console.log('[CONSOLE] Ejecutando mantenimiento manual...');
      ejecutarMantenimiento();
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
