const express = require('express');
const path = require('path');
const os = require('os');
const router = express.Router();
const packageJson = require(path.join(__dirname, '../../package.json'));

// Helper para convertir bytes → MB con 2 decimales
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

// Rutas de archivos simples
const staticFiles = {
  '/robots.txt': path.join(__dirname, '..', 'robots.txt'),
  '/sitemap.xml': path.join(__dirname, '..', 'sitemap.xml'),
  '/google83049cbadfc49565.html': path.join(__dirname, '..', 'google83049cbadfc49565.html')
};

Object.entries(staticFiles).forEach(([route, filePath]) => {
  router.get(route, (req, res) => {
    if (route === '/robots.txt') {
      res.type('text/plain').send(`User-agent: *
Disallow: /admin
Allow: /
Sitemap: ${req.protocol}://${req.get('host')}/sitemap.xml`);
    } else {
      res.sendFile(filePath);
    }
  });
});

module.exports = router;
