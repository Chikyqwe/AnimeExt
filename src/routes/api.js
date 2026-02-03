// src/routes/index.js
const express = require('express');
const router = express.Router();

const asyncHandler = require('../middlewares/asyncHandler');
const validateToken = require('../middlewares/validateToken');

const animeController = require('../controllers/animeController');
const videoController = require('../controllers/videoController');

// Anime
router.post('/api/description', animeController.description);
router.post('/api/episodes', animeController.episodes);

// Servers & API
router.get('/api/servers', videoController.servers);
router.get('/api', videoController.api);
router.get('/api/stream', videoController.stream);
router.get('/api/req', videoController.reqProxy);
router.get('/api/stream/download', videoController.download);
router.get('/api/queue/status', videoController.queueStatus);
router.get('/proxy/hls', videoController.hlsProxy);
router.get('/api/get/hls/:uuid', videoController.gethls)

// App
router.get('/app/v', videoController.appV);
// dev
const fs = require('fs');
const path = require('path');
const { getHeapSnapshot } = require('v8');

router.get('/dev/snapshot', asyncHandler(async (req, res) => {
  const filename = `snapshot-${Date.now()}.heapsnapshot`;
  const filepath = path.join(process.cwd(), filename);

  const snapshotStream = getHeapSnapshot();
  const fileStream = fs.createWriteStream(filepath);
  snapshotStream.pipe(fileStream);

  fileStream.on('finish', () => {
    res.download(filepath, filename, (err) => {
      fs.unlink(filepath, () => {}); // Borrar después de enviar
      if (err) console.error('Error enviando snapshot:', err);
    });
  });
}));

module.exports = router;
