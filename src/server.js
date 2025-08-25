console.log('[INFO] Iniciando servidor AnimeExt...');
const app = require('./app');
const { PORT, MAINTENANCE_PASSWORD } = require('./config');
const { iniciarMantenimiento } = require('./services/maintenanceService');
const readline = require('readline');

// =================== VARIABLES GLOBALES ===================
const mantenimientoData = {
  '1:0': { proximo: null, ultimo: null },
  '12:0': { proximo: null, ultimo: null }
};

// =================== FUNCION DE MANTENIMIENTO ===================
async function programarMantenimiento(hora, minuto) {
  const ahora = new Date();
  const proxima = new Date();

  proxima.setHours(hora);
  proxima.setMinutes(minuto);
  proxima.setSeconds(0);
  proxima.setMilliseconds(0);

  if (proxima <= ahora) proxima.setDate(proxima.getDate() + 1);

  const key = `${hora}:${minuto}`;
  mantenimientoData[key].proximo = proxima;

  const delay = proxima - ahora;
  console.log(`[AUTO MANTENIMIENTO] Próxima ejecución a ${hora}:${minuto} en ${Math.round(delay / 60000)} min`);

  setTimeout(async () => {
    console.log(`[AUTO MANTENIMIENTO] Ejecutando mantenimiento programado (${hora}:${minuto})...`);
    try {
      await iniciarMantenimiento();
      mantenimientoData[key].ultimo = new Date(); // guardamos la fecha de ejecución
    } catch (err) {
      console.error('[AUTO MANTENIMIENTO] Error durante el mantenimiento:', err);
    }

    // Recordatorio cada 10 min durante 2h
    let minutos = 0;
    const recordatorio = setInterval(() => {
      minutos += 10;
      console.log(`[AUTO MANTENIMIENTO] Han pasado ${minutos} min desde el último mantenimiento (${hora}:${minuto})`);
      if (minutos >= 120) clearInterval(recordatorio);
    }, 10 * 60 * 1000);

    programarMantenimiento(hora, minuto); // reprogramamos
  }, delay);
}

// =================== PROGRAMAR MANTENIMIENTOS ===================
programarMantenimiento(1, 0);
programarMantenimiento(12, 0);

// =================== SERVIDOR INICIADO ===================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SUCCESS] Servidor corriendo en http://localhost:${PORT}`);
  console.log(`[INFO] Contraseña para mantenimiento (/up): ${MAINTENANCE_PASSWORD}`);
});

// =================== ENDPOINT DE MANTENIMIENTO ===================
app.get('/mantenimiento', (req, res) => {
  const ahora = new Date();

  const data = Object.entries(mantenimientoData).map(([key, val]) => {
    if (!val.proximo) return null;

    let diffMs = val.proximo - ahora;
    if (diffMs < 0) diffMs = 0;

    const dias = Math.floor(diffMs / (1000*60*60*24));
    const horas = Math.floor((diffMs % (1000*60*60*24)) / (1000*60*60));
    const minutos = Math.floor((diffMs % (1000*60*60)) / (1000*60));

    return {
      horario: key,
      faltan: { dias, horas, minutos },
      ultimo: val.ultimo ? val.ultimo.toISOString() : null
    };
  }).filter(Boolean);

  res.json({
    ahora: ahora.toISOString(),
    mantenimientos: data
  });
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