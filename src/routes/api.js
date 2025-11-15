// src/routes/index.js
const express = require('express');
const router = express.Router();

const asyncHandler = require('../middlewares/asyncHandler');
const validateToken = require('../middlewares/validateToken');

const animeController = require('../controllers/animeController');
const videoController = require('../controllers/videoController');

// Anime
router.post('/anime/list', validateToken, animeController.list);
router.post('/anime/description', animeController.description);
router.post('/api/episodes', animeController.episodes);

// Legacy / small routes
router.get('/anime/list/ext/beta/cordova/beta/anime/app/chikyqwe', videoController.legacyList);
router.get('/anime/last', videoController.last);

// Image proxy
router.get('/image', videoController.imageProxy);

// Servers & API
router.get('/api/servers', videoController.servers);
router.get('/api', videoController.api);
router.get('/api/stream', videoController.stream);
router.get('/api/req', videoController.reqProxy);
router.get('/api/stream/download', videoController.download);
router.get('/api/queue/status', videoController.queueStatus);

// App
router.get('/app/v', videoController.appV);

module.exports = router;
