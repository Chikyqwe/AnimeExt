// src/routes/index.js
const express = require('express');
const router = express.Router();
const animeController = require('../controllers/animeController');
const imageController = require('../controllers/imageController');

router.get('/anime/list', animeController.list);
router.get('/anime/list/ext/beta/cordova/beta/anime/app/chikyqwe', animeController.list);

router.get('/image', imageController.imageProxy);
router.get('/anime/last', animeController.last);

module.exports = router;
