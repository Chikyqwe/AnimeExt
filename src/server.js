// src/server.js
console.log('[INFO] Iniciando servidor AnimeExt...');
const app = require('./app');
const { PORT, MAINTENANCE_PASSWORD } = require('./config');
const { iniciarMantenimiento } = require('./services/maintenanceService');

// =================== AUTO MANTENIMIENTO ===================
console.log(`[AUTO MANTENIMIENTO] Se configuro auto mantenimiento cada 24 horas`);
setInterval(iniciarMantenimiento, 24 * 60 * 60 * 1000); // cada 24h

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
console.log('[CONSOLE] Comandos disponibles: up | exit');
rl.prompt();

rl.on('line', (line) => {
  const command = line.trim().toLowerCase();

  switch (command) {
    case 'up':
      console.log('[CONSOLE] Ejecutando mantenimiento manual...');
      iniciarMantenimiento();
      break;
    case 'clear':
      console.clear()
      break
    case 'pass':
      console.log(`[PASSWORD] ${MAINTENANCE_PASSWORD}`)
      break 
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
