const express = require('express');
const path = require('path');
const os = require('os');
const router = express.Router();
const packageJson = require(path.join(__dirname, '../../package.json'));
router.get('/status', (req, res) => {
  const timestamp = new Date().toISOString();
  const uptime = process.uptime();

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
    uptime: `${Math.floor(uptime)} seconds`,
    server_start_time: new Date(Date.now() - uptime * 1000).toISOString(),
    memory: process.memoryUsage(),
    node_version: process.version,
    platform: process.platform,
    arch: process.arch,
    cpus: os.cpus().length,
    load_average: os.loadavg(),
    hostname: os.hostname(),
    license: packageJson.license,
    timestamp,
    dependencies: packageJson.dependencies || {},  // <-- Aquí las dependencias
    message: '🎉Server is running and ready to handle requests.',
  });
});
router.get("/robots.txt", (req, res) => {
  res.type("text/plain");
  res.send(`User-agent: *
Disallow: /admin
Allow: /
Sitemap: ` + req.protocol + '://' + req.get('host') + '/sitemap.xml');
});
router.get('/sitemap.xml', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'sitemap.xml'));
});
router.get('/google83049cbadfc49565.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'google83049cbadfc49565.html'));
});
module.exports = router;
