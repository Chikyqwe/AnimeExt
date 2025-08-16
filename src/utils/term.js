// terminal.js
const express = require('express');
const session = require('express-session');
const WebSocket = require('ws');
const { spawn } = require('child_process');

console.log('[TERMINAL] Inicializando terminal remoto...');
const router = express.Router();

// Configuración
const username = 'chiky';
const password = 'AGLS12@1';
const sessionSecret = 'mi_clave_secreta';
const route = '/term';

console.log('[TERMINAL] Ruta generada:', route);

// --- Sesión ---
const sessionParser = session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: true
});

router.use(sessionParser);
router.use(express.urlencoded({ extended: true }));

// --- Página de login ---
router.get('/login', (req, res) => {
  res.send(`
    <style>
      body { font-family: Arial, sans-serif; background: #1e1e1e; color: #fff; display:flex; justify-content:center; align-items:center; height:100vh; margin:0; }
      form { background:#2c2c2c; padding:20px; border-radius:8px; box-shadow:0 0 10px #000; }
      input { display:block; margin:10px 0; padding:8px; width:100%; border-radius:4px; border:none; }
      button { padding:8px 16px; border:none; border-radius:4px; background:#4caf50; color:#fff; cursor:pointer; }
      button:hover { background:#45a049; }
    </style>
    <form method="POST">
      <h2 style="text-align:center;">Login Terminal</h2>
      <input name="username" placeholder="Username" />
      <input name="password" placeholder="Password" type="password" />
      <button>Entrar</button>
    </form>
  `);
});

router.post('/login', (req, res) => {
  const { username: u, password: p } = req.body;
  if (u === username && p === password) {
    req.session.auth = true;
    res.redirect(route);
  } else {
    res.send('Usuario o contraseña incorrectos. <a href="/login">Volver</a>');
  }
});

// --- Middleware de autenticación ---
function auth(req, res, next) {
  if (req.session.auth) next();
  else res.redirect('/login');
}

// --- Página del terminal ---
router.get(route, auth, (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Terminal Remoto</title>
      <link rel="stylesheet" href="https://unpkg.com/xterm/css/xterm.css" />
      <style>
        body { margin:0; height:100vh; display:flex; flex-direction:column; background:#1e1e1e; color:#fff; }
        #terminal { flex:1; }
      </style>
    </head>
    <body>
      <div id="terminal"></div>
      <script src="https://unpkg.com/xterm/lib/xterm.js"></script>
      <script>
        const term = new Terminal({ cursorBlink:true, scrollback:1000 });
        term.open(document.getElementById('terminal'));
        term.focus();

        const ws = new WebSocket('ws://' + location.host + '${route}/ws');

        ws.onopen = () => term.write('\\x1b[32mConectado al servidor\\x1b[0m\\r\\n');
        ws.onmessage = e => { term.write(e.data); term.scrollToBottom(); };
        ws.onclose = () => term.write('\\r\\n\\x1b[31mConexión cerrada\\x1b[0m\\r\\n');

        let buffer = '';
        term.onData(data => {
          switch(data) {
            case '\\x03': // Ctrl+C
              ws.send('\\x03');          // enviar SIGINT
              term.write('^C\\r\\n');     // mostrar en terminal
              buffer = '';               // limpiar buffer
              break;
            case '\\x04': // Ctrl+D
              ws.send('\\x04');          // cerrar stdin
              term.write('^D\\r\\n');
              buffer = '';
              break;
            case '\\r':  // Enter
              ws.send(buffer);
              buffer = '';
              term.write('\\r\\n');
              break;
            default:
              if (data.charCodeAt(0) === 127) { // Backspace
                if (buffer.length > 0) {
                  buffer = buffer.slice(0, -1);
                  term.write('\\b \\b');
                }
              } else {
                buffer += data;
                term.write(data);
              }
              break;
          }
        });
      </script>
    </body>
    </html>
  `);
});

// --- Inicializar WebSocket ---
function initRemoteTerminal(server) {
  const wss = new WebSocket.Server({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (!req.url.startsWith(route + '/ws')) {
      socket.destroy();
      return;
    }

    const fakeRes = { writeHead: () => {}, end: () => {} };
    sessionParser(req, fakeRes, () => {
      if (!req.session.auth) {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, ws => {
        wss.emit('connection', ws, req);
      });
    });
  });

  wss.on('connection', ws => {
    console.log('[TERMINAL] Nueva conexión WebSocket');

    const shell = spawn(process.platform === 'win32' ? 'cmd.exe' : 'bash', [], { stdio:'pipe' });

    shell.on('error', err => ws.send('Error en shell: ' + err.message + '\n'));
    shell.stdin.write(process.platform === 'win32' ? 'echo Terminal listo\r\n' : 'echo "Terminal listo"\n');

    shell.stdout.on('data', data => ws.send(data.toString()));
    shell.stderr.on('data', data => ws.send(data.toString()));

    ws.on('message', msg => {
      if (msg === '\x03') { // Ctrl+C
        shell.kill('SIGINT');
      } else if (msg === '\x04') { // Ctrl+D
        shell.stdin.end();
      } else {
        shell.stdin.write(process.platform === 'win32' ? msg + '\r\n' : msg + '\n');
      }
    });

    ws.on('close', () => {
      shell.kill();
      console.log('[TERMINAL] Conexión cerrada');
    });
  });

  return { route };
}

module.exports = { router, initRemoteTerminal };
