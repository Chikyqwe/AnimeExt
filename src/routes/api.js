// src/routes/index.js  — ejemplo de router Express adaptado a plan.rest
// ============================================================

const express = require('express');
const router = express.Router();

const video = require('../controllers/videoController');
const anime = require('../controllers/animeController');
const image = require('../controllers/imageController');
const asyncHandler = require('../middlewares/asyncHandler');

// ──────────────────────────────────────────────
//  VIDEO / STREAM
// ──────────────────────────────────────────────

// POST /api/play  ← NUEVO (fusiona /api/servers + /api/video)
router.post('/api/play', video.play);

// GET  /api/getMedia/:p  ← NUEVO (renombra /api/get/hls/:uuid)
router.get('/api/getMedia/:p', video.getMedia);

// GET  /api/stream?gid=  ← renombrado desde ?videoUrl= (retrocompat mantenida)
router.get('/api/stream', video.stream);

// GET  /api/req?u=&h=  ← renombrado desde /api/req?url= , agrega header support
router.get('/api/req', video.reqProxy);

// GET  /api/proxy?url=&ref=  ← renombrado desde /api/hlsProxy
router.get('/api/hls', video.proxy);

// GET  /api/queue
router.get('/api/queue', video.queueStatus);

// GET  /app/v
router.get('/app/v', video.appV);

// GET  /api/download
router.get('/api/download', video.download);

// ──────────────────────────────────────────────
//  ANIME
// ──────────────────────────────────────────────

// GET  /api/info?uid=  ← NUEVO (unifica /api/description + /api/episodes)
router.get('/api/info', anime.info);

// GET  /anime/list?p=  ← ACTUALIZADO (agrega paginación, p=all para todo)
router.get('/anime/list', anime.list);

// GET  /anime/last
router.get('/anime/last', anime.last);

// POST /anime/search  ← NUEVO
router.post('/anime/search', anime.search);

// POST /anime/img  ← NUEVO (cover + ep thumbnail)
router.post('/anime/img', anime.img);

router.get('/api', anime.initmjs)

router.get('/api/basic/info', anime.basicInfo)
// ──────────────────────────────────────────────
//  IMAGES
// ──────────────────────────────────────────────

// GET  /image?url=
router.get('/image', image.imageProxy);

// GET  /images/app/
router.get('/images/app', image.listImages);
router.get('/images/app/:imageName', image.serveImage);

module.exports = router;
// dev
const fs = require('fs');
const path = require('path');
const { getHeapSnapshot } = require('v8');

router.get('/dev/snapshot', asyncHandler(async (req, res) => {
  console.log("[INFO] DUMPING HEAP SNAPSHOT at", Date.now(), "FROM", req.ip);
  const filename = `snapshot-${Date.now()}.heapsnapshot`;
  const filepath = path.join(process.cwd(), filename);

  const snapshotStream = getHeapSnapshot();
  const fileStream = fs.createWriteStream(filepath);
  snapshotStream.pipe(fileStream);

  fileStream.on('finish', () => {
    res.download(filepath, filename, (err) => {
      fs.unlink(filepath, () => { }); // Borrar después de enviar
      if (err) console.error('Error enviando snapshot:', err);
    });
  });
}));
router.get('/dev/cache/dump', asyncHandler(async (req, res) => {
  console.log("[INFO] DUMPING CACHE at", Date.now(), "FROM", req.ip);
  const data = dumpAllCache();

  res.json({
    ok: true,
    total: Object.keys(data).length,
    cache: data
  });
}));


module.exports = router;
