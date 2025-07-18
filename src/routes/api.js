const { extractAllVideoLinks, getExtractor, openVoePage } = require('../services/browserlessExtractors');
const { getJsonFiles, getJSONPath, getAnimeById, buildEpisodeUrl } = require('../services/jsonService');
const { proxyImage, streamVideo, downloadVideo } = require('../utils/helpers');
const { parseMegaUrl, verificarArchivoMega } = require('../utils/CheckMega');
const apiQueue = require('../services/queueService');
const ffmpegPath = require('ffmpeg-static');
const { spawn } = require('child_process');
const { PassThrough } = require('stream');
const express = require('express');
const router = express.Router();

// === JSON LIST ===
router.get('/json-list', (req, res) => {
  try {
    const files = getJsonFiles();
    res.json(files);
  } catch (err) {
    res.status(500).send('Error al leer directorio de JSONs');
  }
});

router.get('/jsons/:filename', (req, res) => {
  const filename = req.params.filename;
  res.sendFile(getJSONPath(filename));
});

// === IMAGE PROXY ===
router.get('/proxy-image', async (req, res) => {
  const { url } = req.query;
  await proxyImage(url, res);
});

// === NORMALIZE SERVER NAME ===
function normalizeServerName(name) {
  if (!name) return '';
  const n = name.toLowerCase();
  if (n.includes('yourupload') || n.includes('your-up') || n.includes('yourup') || n.includes('yu')) return 'yu';
  return n;
}

// === SERVERS ===
router.get('/api/servers', async (req, res) => {
  let pageUrl = req.query.url;
  const animeId = req.query.id;

  if (!pageUrl && animeId) {
    const ep = req.query.ep;
    const anime = getAnimeById(animeId);
    if (!anime || !anime.url) {
      return res.status(404).json({ error: `No se encontró anime con id=${animeId}` });
    }
    if (!ep) {
      return res.status(400).json({ error: 'Parámetro "ep" obligatorio' });
    }

    pageUrl = buildEpisodeUrl(anime, ep);
    if (!pageUrl) {
      return res.status(400).json({ error: 'No se pudo construir la URL del episodio' });
    }
  }

  if (!pageUrl || typeof pageUrl !== 'string') {
    return res.status(400).json({ error: 'Falta parámetro url válido' });
  }

  try {
    const videos = await extractAllVideoLinks(pageUrl);

    const rawValid = videos
      .map(v => ({ ...v, servidor: normalizeServerName(v.servidor) }))
      .filter(v => getExtractor(v.servidor));

    const valid = [];

    for (const video of rawValid) {
      if (typeof video.url === 'string' && video.url.includes('mega.nz')) {
        try {
          const { id, key } = parseMegaUrl(video.url);
          const resultado = await verificarArchivoMega(id, key);

          if (resultado.disponible) {
            video.url = `https://mega.nz/embed/${id}#${key}`;
            valid.push(video); // ✅ Solo lo agregamos si está disponible
          }
          // ❌ No se agrega si no está disponible
        } catch (e) {
          // ❌ No se agrega si falla el parseo
        }
      } else {
        // Otros servidores se agregan sin verificación
        valid.push(video);
      }
    }

    res.json(valid);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// === MAIN API ===
router.get('/api', async (req, res) => {
  let pageUrl = req.query.url;
  const animeId = req.query.id;
  const serverRequested = normalizeServerName(req.query.server);

  if (!pageUrl && animeId) {
    const ep = req.query.ep;
    const anime = getAnimeById(animeId);
    if (!anime || !anime.url) {
      return res.status(404).json({ error: `No se encontró anime con id=${animeId}` });
    }
    if (!ep) {
      return res.status(400).json({ error: 'Parámetro "ep" obligatorio' });
    }

    pageUrl = buildEpisodeUrl(anime, ep);
    if (!pageUrl) {
      return res.status(400).json({ error: 'No se pudo construir la URL del episodio' });
    }
  }

  apiQueue.add(async () => {
    if (!pageUrl || typeof pageUrl !== 'string') {
      return { status: 400, message: 'URL no válida' };
    }

    try {
      const videos = await extractAllVideoLinks(pageUrl);

      const valid = videos
        .map(v => ({ ...v, servidor: normalizeServerName(v.servidor) }))
        .filter(v => getExtractor(v.servidor));

      if (!valid.length) {
        return { status: 404, message: 'No hay servidores válidos' };
      }

      let selected = valid[0];
      if (serverRequested) {
        const found = valid.find(v => normalizeServerName(v.servidor) === serverRequested);
        if (!found) {
          return { status: 404, message: `Servidor '${serverRequested}' no soportado` };
        }
        selected = found;
      }

      const extractor = getExtractor(selected.servidor);
      const result = await extractor(selected.url);

      if (Array.isArray(result) && result[0]?.content) {
        res.json({ count: result.length, files: result, firstUrl: result[0].url });
      } else if (result?.url) {
        res.json({ url: result.url });
      } else {
        throw new Error('Formato de extractor no reconocido');
      }
    } catch (e) {
      return { status: 500, message: 'Error interno del servidor: ' + e.message };
    }
  }).then(queueResult => {
    if (queueResult && queueResult.status) {
      res.status(queueResult.status).send(queueResult.message);
    }
  }).catch(error => {
    if (!res.headersSent) {
      res.status(500).send('Error al procesar la solicitud de la cola: ' + error.message);
    }
  });
});

// === Voe ===
router.get('/api/voe', async (req, res) => {
  const animeId = parseInt(req.query.id);
  const ep = parseInt(req.query.ep);

  if (isNaN(animeId) || isNaN(ep)) {
    return res.status(400).json({ error: 'Parámetros inválidos' });
  }

  const anime = getAnimeById(animeId);
  if (!anime || !anime.url) {
    return res.status(404).json({ error: 'Anime no encontrado' });
  }

  try {
    const pageUrl = buildEpisodeUrl(anime, ep);
    const allLinks = await extractAllVideoLinks(pageUrl);

    const voe = allLinks.find(v => v.servidor.toLowerCase().includes('voe'));
    if (!voe) {
      return res.status(404).json({ error: 'No se encontró enlace VOE' });
    }

    const buffer = await openVoePage(voe.url); // buffer con ts

    if (!buffer) return res.status(204).end();

    // Creamos un stream para enviar buffer a ffmpeg
    const inputStream = new PassThrough();
    inputStream.end(buffer);

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `inline; filename="anime-${animeId}-ep-${ep}.mp4"`);

    // Args para ffmpeg para leer TS desde stdin y output MP4 a stdout
    const ffmpegArgs = [
      '-i', 'pipe:0',       // entrada por stdin
      '-c:v', 'copy',       // copiar video sin recodificar (si compatible)
      '-c:a', 'aac',        // audio compatible mp4
      '-f', 'mp4',          // formato mp4
      '-movflags', 'frag_keyframe+empty_moov', // para streaming progresivo
      'pipe:1'              // salida por stdout
    ];

    const ffmpegProc = spawn(ffmpegPath, ffmpegArgs);

    // Pipe input stream al stdin de ffmpeg
    inputStream.pipe(ffmpegProc.stdin);

    // Pipe salida de ffmpeg al response
    ffmpegProc.stdout.pipe(res);

    ffmpegProc.stderr.on('data', data => {
      // Opcional: para debuguear ffmpeg
      // console.error(`FFmpeg stderr: ${data}`);
    });

    ffmpegProc.on('error', err => {
      console.error('[FFmpeg error]', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error en conversión de video' });
      }
    });

    ffmpegProc.on('close', code => {
      if (code !== 0) {
        console.error(`[FFmpeg] proceso terminó con código ${code}`);
      }
      res.end();
    });

  } catch (err) {
    console.error('[VOE Stream Error]', err);
    res.status(500).json({ error: 'Error al procesar stream' });
  }
});

// === M3U8 ===
router.get('/api/m3u8', async (req, res) => {
  let pageUrl = req.query.url;
  const animeId = req.query.id;

  if (!pageUrl && animeId) {
    const ep = req.query.ep;
    const anime = getAnimeById(animeId);
    if (!anime || !anime.url) {
      return res.status(404).send('#EXTM3U\n#EXT-X-ENDLIST\n');
    }
    if (!ep) {
      return res.status(400).send('#EXTM3U\n#EXT-X-ENDLIST\n');
    }

    pageUrl = buildEpisodeUrl(anime, ep);
    if (!pageUrl) {
      return res.status(400).send('#EXTM3U\n#EXT-X-ENDLIST\n');
    }
  }

  apiQueue.add(async () => {
    if (!pageUrl || typeof pageUrl !== 'string') {
      return { status: 400, message: '#EXTM3U\n#EXT-X-ENDLIST\n' };
    }

    try {
      const videos = await extractAllVideoLinks(pageUrl);
      const valid = videos.filter(v => getExtractor(v.servidor));
      const swVideo = valid.find(v => v.servidor.toLowerCase() === 'sw' || v.servidor.toLowerCase().includes('swift'));

      if (!swVideo) {
        return { status: 404, message: '#EXTM3U\n#EXT-X-ENDLIST\n' };
      }

      const extractor = getExtractor(swVideo.servidor);
      const swResult = await extractor(swVideo.url);
      const files = Array.isArray(swResult) ? swResult : [];
      const best = files.find(f => f.url.includes('index-f2')) || files[0];

      if (!best || !best.content) {
        return { status: 404, message: '#EXTM3U\n#EXT-X-ENDLIST\n' };
      }

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.send(best.content);
    } catch (e) {
      return { status: 500, message: '#EXTM3U\n#EXT-X-ENDLIST\n' };
    }
  }).then(queueResult => {
    if (queueResult && queueResult.status) {
      res.status(queueResult.status).send(queueResult.message);
    }
  }).catch(error => {
    if (!res.headersSent) {
      res.status(500).send('#EXTM3U\n#EXT-X-ENDLIST\n');
    }
  });
});

// === STREAM & DOWNLOAD ===
router.get('/api/stream', (req, res) => {
  const videoUrl = req.query.videoUrl;

  if (!videoUrl) {
    return res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Falta videoUrl</title>
        <style>
          body {
            font-family: 'Segoe UI', sans-serif;
            background: #111;
            color: #f9f9f9;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
          }
          .container {
            background: #1e1e1e;
            padding: 2rem;
            border-radius: 16px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
            max-width: 90%;
            width: 400px;
            text-align: center;
          }
          h1 {
            font-size: 1.3rem;
            margin-bottom: 1rem;
          }
          p {
            color: #ccc;
            margin-bottom: 1.2rem;
          }
          input {
            width: 100%;
            padding: 0.7rem;
            border: none;
            border-radius: 8px;
            font-size: 1rem;
            margin-bottom: 1.5rem;
            background: #2c2c2c;
            color: #f9f9f9;
            box-sizing: border-box;
          }
          input::placeholder {
            color: #888;
          }
          button {
            background: #4caf50;
            color: white;
            padding: 0.6rem 1.5rem;
            border: none;
            border-radius: 8px;
            font-size: 1rem;
            cursor: pointer;
            transition: background 0.3s ease;
          }
          button:hover {
            background: #43a047;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Falta el parámetro <code>videoUrl</code></h1>
          <p>Introduce la URL del video para continuar:</p>
          <input type="text" id="videoUrl" placeholder="https://example.com/video.mp4" />
          <button onclick="redirectToStream()">Ver video</button>
        </div>

        <script>
          function redirectToStream() {
            const url = document.getElementById('videoUrl').value.trim();
            if (!url) {
              alert("Por favor escribe una URL válida.");
              return;
            }
            window.location.href = '/api/stream?videoUrl=' + encodeURIComponent(url);
          }
        </script>
      </body>
      </html>
    `);
  }

  streamVideo(videoUrl, req, res);
});


router.get('/api/stream/download', (req, res) => {
  downloadVideo(req, res);
});

// === QUEUE STATUS ===
router.get('/api/queue/status', (req, res) => {
  const pendingCount = apiQueue.getPendingCount();
  const currentTask = apiQueue.getCurrentTask();

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
