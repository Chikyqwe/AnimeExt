// src/routes/api.js
const express = require('express');
const { getJsonFiles, getJSONPath } = require('../services/jsonService');
const { extractAllVideoLinks, getExtractor } = require('../services/browserlessExtractors');
const apiQueue = require('../services/queueService');
const { proxyImage, streamVideo, downloadVideo } = require('../utils/helpers');

const router = express.Router();

router.get('/json-list', (req, res) => {
  console.log(`[JSON LIST] Listando archivos JSON`);
  try {
    const files = getJsonFiles();
    console.log(`[JSON LIST] Archivos encontrados:`, files);
    res.json(files);
  } catch (err) {
    console.error(`[JSON LIST] Error leyendo directorio:`, err);
    res.status(500).send('Error al leer directorio de JSONs');
  }
});

router.get('/jsons/:filename', (req, res) => {
  const filename = req.params.filename;
  console.log(`[JSON FILE] Solicitando archivo JSON: ${filename}`);
  res.sendFile(getJSONPath(filename));
});

router.get('/proxy-image', async (req, res) => {
  const { url } = req.query;
  await proxyImage(url, res);
});

router.get('/api/servers', async (req, res) => {
  const pageUrl = req.query.url;
  console.log(`[API SERVERS] Solicitud para url:`, pageUrl);

  if (!pageUrl || typeof pageUrl !== 'string') {
    console.warn(`[API SERVERS] Falta o URL inválida`);
    return res.status(400).json({ error: 'Falta parámetro url válido' });
  }

  try {
    const videos = await extractAllVideoLinks(pageUrl);
    console.log(`[API SERVERS] Videos extraídos:`, videos);
    const valid = videos.filter(v => getExtractor(v.servidor));
    console.log(`[API SERVERS] Videos con extractores válidos:`, valid);
    res.json(valid);
  } catch (e) {
    console.error(`[API SERVERS] Error:`, e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/api', async (req, res) => {
  const pageUrl = req.query.url;
  const serverRequested = req.query.server;
  console.log(`[API] (EN COLA) url=${pageUrl}, server=${serverRequested}`);

  apiQueue.add(async () => {
    if (!pageUrl || typeof pageUrl !== 'string') {
      console.warn(`[API] Falta o URL inválida`);
      return { status: 400, message: 'Falta parámetro url válido' };
    }

    try {
      const videos = await extractAllVideoLinks(pageUrl);
      console.log(`[API] Videos extraídos:`, videos);
      const valid = videos.filter(v => getExtractor(v.servidor));

      if (!valid.length) {
        console.warn(`[API] No hay servidores válidos`);
        return { status: 404, message: 'No hay servidores válidos' };
      }

      let selected = valid[0];
      if (serverRequested) {
        const found = valid.find(v => v.servidor.toLowerCase() === serverRequested.toLowerCase());
        if (!found) {
          console.warn(`[API] Servidor solicitado no soportado: ${serverRequested}`);
          return { status: 404, message: `Servidor '${serverRequested}' no soportado` };
        }
        selected = found;
      }

      console.log(`[API] Servidor seleccionado: ${selected.servidor}`);
      const extractor = getExtractor(selected.servidor);
      const result = await extractor(selected.url);

      console.log(`[API] Resultado del extractor:`, result);

      if (Array.isArray(result) && result[0]?.content) {
        console.log(`[API] Respondiendo con lista de archivos m3u8`);
        res.json({ count: result.length, files: result, firstUrl: result[0].url });
      } else if (result?.url) {
        console.log(`[API] Devolviendo URL directa: ${result.url}`);
        res.json({ url: result.url }); // 👈 ya no redirige
      } else {
        throw new Error('Formato de extractor no reconocido');
      }
    } catch (e) {
      console.error(`[API] Error interno (en cola):`, e);
      return { status: 500, message: 'Error interno del servidor: ' + e.message };
    }
  })
    .then(queueResult => {
      if (queueResult && queueResult.status) {
        res.status(queueResult.status).send(queueResult.message);
      }
    })
    .catch(error => {
      console.error(`[API] Error al procesar cola:`, error);
      if (!res.headersSent) {
        res.status(500).send('Error al procesar la solicitud de la cola: ' + error.message);
      }
    });
});

router.get('/api/m3u8', async (req, res) => {
  const { url } = req.query;
  console.log(`[API M3U8] (EN COLA) url=${url}`);

  apiQueue.add(async () => {
    if (!url || typeof url !== 'string') {
      console.warn(`[API M3U8] Falta parámetro url`);
      return { status: 400, message: '#EXTM3U\n#EXT-X-ENDLIST\n' };
    }

    try {
      const videos = await extractAllVideoLinks(url);
      const valid = videos.filter(v => getExtractor(v.servidor));
      const swVideo = valid.find(v => v.servidor.toLowerCase() === 'sw' || v.servidor.toLowerCase().includes('swift'));

      if (!swVideo) {
        console.warn(`[API M3U8] No se encontró servidor SW en los videos`);
        return { status: 404, message: '#EXTM3U\n#EXT-X-ENDLIST\n' };
      }

      const extractor = getExtractor(swVideo.servidor);
      const swResult = await extractor(swVideo.url);
      const files = Array.isArray(swResult) ? swResult : [];

      console.log(`[API M3U8] Archivos SW extraídos:`, files.length);
      const best = files.find(f => f.url.includes('index-f2')) || files[0];

      if (!best || !best.content) {
        console.warn(`[API M3U8] No se encontró contenido m3u8 válido`);
        return { status: 404, message: '#EXTM3U\n#EXT-X-ENDLIST\n' };
      }

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      console.log(`[API M3U8] Enviando contenido m3u8`);
      res.send(best.content);
    } catch (e) {
      console.error(`[API M3U8] Error interno:`, e);
      return { status: 500, message: '#EXTM3U\n#EXT-X-ENDLIST\n' };
    }
  })
    .then(queueResult => {
      if (queueResult && queueResult.status) {
        res.status(queueResult.status).send(queueResult.message);
      }
    })
    .catch(error => {
      console.error(`[API M3U8] Error al procesar cola:`, error);
      if (!res.headersSent) {
        res.status(500).send('#EXTM3U\n#EXT-X-ENDLIST\n');
      }
    });
});

router.get('/api/stream', (req, res) => {
  const videoUrl = req.query.videoUrl;
  console.log(`[API STREAM] Solicitando stream para: ${videoUrl}`);
  streamVideo(videoUrl, req, res);
});
router.get('/api/stream/download', (req, res) => {
  const videoUrl = req.query.videoUrl;
  console.log(`[API DOWNLOAD] Solicitando descarga para: ${videoUrl}`);
  downloadVideo(req, res);
});

//actualiza el estado de la cola
router.get('/api/queue/status', (req, res) => {
  const pendingCount = apiQueue.getPendingCount();
  const currentTask = apiQueue.getCurrentTask();
  console.log(`[API QUEUE STATUS] Pendientes: ${pendingCount}, Tarea actual:`, currentTask);
  
  res.json({
    pendingCount,
    currentTask: currentTask ? {
      name: currentTask.meta.name,
      startedAt: currentTask.startedAt,
      meta: currentTask.meta
    } : null
  });
});

module.exports = router;