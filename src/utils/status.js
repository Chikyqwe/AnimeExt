// ws.support=true
const path = require('path');
const os = require('os');
const packageJson = require('../../package.json');
const express = require('express');

module.exports = (app) => {
  // ⚡ EXPLICACIÓN: Para que el router soporte .ws, 
  // debemos usar la extensión que express-ws añade a la app.
  const expressWs = require('express-ws')(app); 
  const router = express.Router();
  
  // Aplicar el handler de websockets al router
  expressWs.applyTo(router);

  const toMB = (bytes) => (bytes / 1024 / 1024).toFixed(2);

  router.get('/status', (req, res) => {
    const timestamp = new Date().toISOString();
    const uptimeSec = process.uptime();

    const memory = process.memoryUsage();
    const memoryMB = {
      rss: toMB(memory.rss),
      heapTotal: toMB(memory.heapTotal),
      heapUsed: toMB(memory.heapUsed),
      external: toMB(memory.external),
      arrayBuffers: toMB(memory.arrayBuffers),
    };

    res.status(200).json({
      HELLO: 'HI',
      status: 'Status ping received successfully.',
      application: packageJson.name || 'Anime EXT',
      version: `v${packageJson.version || '1.0.0'}`,
      github_url: 'https://github.com/Chikyqwe/AnimeExt',
      author: packageJson.author,
      websites: [
        'https://animeext.infy.uk',
        'https://animeext-m5lt.onrender.com'
      ],
      express_version: packageJson.dependencies?.express || 'not installed',
      uptime: `${Math.floor(uptimeSec)} seconds`,
      server_start_time: new Date(Date.now() - uptimeSec * 1000).toISOString(),
      memory: memoryMB,
      node_version: process.version,
      platform: process.platform,
      arch: process.arch,
      cpus: os.cpus().length,
      load_average: os.loadavg(),
      hostname: os.hostname(),
      license: packageJson.license,
      timestamp,
      dependencies: packageJson.dependencies || {},
      message: '🎉 Server is running and ready to handle requests.',
    });
  });

  router.ws('/status', (ws, req) => {
    const interval = setInterval(() => {
      const mem = process.memoryUsage();

      const payload = {
        timestamp: new Date().toISOString(),

        memory: {
          rss: toMB(mem.rss),
          heapTotal: toMB(mem.heapTotal),
          heapUsed: toMB(mem.heapUsed),
          external: toMB(mem.external),
          arrayBuffers: toMB(mem.arrayBuffers)
        },

        system_memory: {
          total: toMB(os.totalmem()),
          free: toMB(os.freemem()),
          used: toMB(os.totalmem() - os.freemem()),
          usage_percent: (
            ((os.totalmem() - os.freemem()) / os.totalmem()) *
            100
          ).toFixed(2)
        },

        cpus: os.cpus().map((cpu, index) => ({
          cpu: index,
          model: cpu.model,
          speed: cpu.speed,
          times: cpu.times
        })),

        load_avg: os.loadavg(),

        node: {
          pid: process.pid,
          uptime_sec: process.uptime(),
          version: process.version,
          platform: process.platform,
          arch: process.arch
        },

        hostname: os.hostname()
      };

      try {
        ws.send(JSON.stringify(payload));
      } catch (err) {
        console.log('Error enviando WS:', err);
      }

    }, 1000);

    ws.on('close', () => {
      clearInterval(interval);
    });
  });

  return router;
};