const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const { PassThrough } = require('stream');
const ffmpegPath = require('ffmpeg-static');

const {
  extractAllVideoLinks,
  getExtractor
} = require('../services/browserlessExtractors');

const {
  getJSONPath,
  getAnimeById,
  buildEpisodeUrl
} = require('../services/jsonService');

const {
  proxyImage,
  streamVideo,
  downloadVideo,
  validateVideoUrl
} = require('../utils/helpers');

const {
  parseMegaUrl,
  verificarArchivoMega
} = require('../utils/CheckMega');

const apiQueue = require('../services/queueService');

// --- Helpers ---

/**
 * Normaliza el nombre del servidor para facilitar comparaciones
 * @param {string} name 
 * @returns {string}
 */
function normalizeServerName(name) {
  if (!name) return '';
  const n = name.toLowerCase();
  if (['yourupload', 'your-up', 'yourup', 'yu'].some(sub => n.includes(sub))) return 'yu';
  return n;
}

/**
 * Valida y construye URL a partir de parámetros id y ep, devuelve error si no válido
 */
function getPageUrlOrError({ url, id, ep, mirror }) {
  if (url && typeof url === 'string') return url;

  if (!id) return { error: 'Falta parámetro url o id' };

  const anime = getAnimeById(id);
  if (!anime) return { error: `No se encontró anime con id=${id}` };

  if (!ep) return { error: 'Parámetro "ep" obligatorio' };

  const pageUrl = buildEpisodeUrl(anime, ep, mirror ? parseInt(mirror) : undefined);
  if (!pageUrl) return { error: 'No se pudo construir la URL del episodio' };

  return pageUrl;
}

/**
 * Filtra y valida servidores, incluye verificación de enlaces Mega
 * @param {Array} videos
 * @returns {Promise<Array>}
 */
async function filterValidVideos(videos) {
  const valid = [];

  for (const video of videos) {
    const servidor = normalizeServerName(video.servidor);
    const extractor = getExtractor(servidor);
    if (!extractor) continue;

    const enriched = { ...video, servidor };

    if (typeof enriched.url === 'string' && enriched.url.includes('mega.nz')) {
      try {
        const { id, key } = parseMegaUrl(enriched.url);
        const resultado = await verificarArchivoMega(id, key);
        if (resultado.disponible) {
          enriched.url = `https://mega.nz/embed/${id}#${key}`;
          valid.push(enriched);
        }
      } catch {
        // Ignorar URL Mega inválida
      }
    } else {
      valid.push(enriched);
    }
  }

  return valid;
}

// --- Routes ---

// Listado de animes JSON
router.post('/anime/list', (req, res) => {
  res.sendFile(getJSONPath('anime_list.json'));
});

// Proxy para imágenes
router.get('/image', async (req, res) => {
  const { url } = req.query;
  await proxyImage(url, res);
});

// Obtener servidores disponibles para un episodio
router.get('/api/servers', async (req, res) => {
  const { url: pageUrlParam, id: animeId, ep, mirror = 1 } = req.query;
  let pageUrl = pageUrlParam;
  let source = 'UNKNOWN';

  if (!pageUrl && animeId) {
    const anime = getAnimeById(animeId);
    if (!anime || !anime.unit_id) {
      return res.status(404).json({ error: `No se encontró anime con id=${animeId}` });
    }
    if (!ep) {
      return res.status(400).json({ error: 'Parámetro "ep" obligatorio' });
    }

    pageUrl = buildEpisodeUrl(anime, ep, parseInt(mirror));
    if (!pageUrl) {
      return res.status(400).json({ error: 'No se pudo construir la URL del episodio' });
    }

    // Detectar origen si está disponible desde el objeto anime
    if (anime.source) {
      source = anime.source;
    }
  }

  if (!pageUrl || typeof pageUrl !== 'string') {
    return res.status(400).json({ error: 'Falta parámetro "url" válido' });
  }

  // Detectar fuente si no se obtuvo del objeto anime
  if (source === 'UNKNOWN') {
    if (pageUrl.includes('tioanime')) {
      source = 'TIO';
    } else if (pageUrl.includes('animeflv')) {
      source = 'FLV';
    }
  }

  try {
    const videos = await extractAllVideoLinks(pageUrl);
    const valid = await filterValidVideos(videos);

    const enriched = valid.map(video => ({
      ...video,
      source
    }));

    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: 'Error al extraer videos: ' + e.message });
  }
});


// API principal para obtener enlace de video según servidor
router.get('/api', async (req, res) => {
  const animeId = parseInt(req.query.id);
  const ep = parseInt(req.query.ep);
  const mirror = parseInt(req.query.mirror) || 1; // <-- ✅ aquí lo convertimos
  const serverRequested = normalizeServerName(req.query.server);
  let pageUrl = req.query.url;

  if (!pageUrl && animeId) {
    const anime = getAnimeById(animeId);
    if (!anime || !anime.unit_id) {
      return res.status(404).json({ error: 'Anime no encontrado o sin unit_id' });
    }
    if (!ep) {
      return res.status(400).json({ error: 'Parámetro "ep" obligatorio' });
    }

    pageUrl = buildEpisodeUrl(anime, ep, mirror);
    console.log(pageUrl);
    if (!pageUrl) {
      return res.status(400).json({ error: 'No se pudo construir la URL del episodio' });
    }
  }

  apiQueue.add(async () => {
    if (!pageUrl || typeof pageUrl !== 'string') {
      return { status: 400, message: 'URL no válida' };
    }

    const videos = await extractAllVideoLinks(pageUrl);
    const valid = videos
      .map(v => ({ ...v, servidor: normalizeServerName(v.servidor) }))
      .filter(v => getExtractor(v.servidor));

    if (!valid.length) {
      return { status: 404, message: 'No hay servidores válidos' };
    }

    // 🔁 --- M3U8 SWIFT ---
    if (serverRequested === 'sw') {
      const swVideo = valid.find(v => v.servidor === 'sw' || v.servidor.includes('swift'));
      if (!swVideo) return { status: 404, message: '#EXTM3U\n#EXT-X-ENDLIST\n' };

      const extractor = getExtractor(swVideo.servidor);
      const swResult = await extractor(swVideo.url);
      const files = Array.isArray(swResult) ? swResult : [];
      const best = files.find(f => f.url.includes('index-f2')) || files[0];

      if (!best || !best.content) {
        return { status: 404, message: '#EXTM3U\n#EXT-X-ENDLIST\n' };
      }

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.send(best.content);
      return;
    }

    // 🎬 --- GENERAL ---
    let selected = valid[0];
    if (serverRequested) {
      const found = valid.find(v => v.servidor === serverRequested);
      if (!found) return { status: 404, message: `Servidor '${serverRequested}' no soportado` };
      selected = found;
    }

    const extractor = getExtractor(selected.servidor);
    const result = await extractor(selected.url);

if (Array.isArray(result) && result[0]?.content) {
  const validatedResults = await Promise.all(result.map(async (r) => ({
    ...r,
    isValid: await validateVideoUrl(r.url)
  })));

  const validFiles = validatedResults.filter(r => r.isValid);

  if (!validFiles.length) {
    return { status: 404, message: 'No se encontró ninguna URL de video válida' };
  }

  res.json({ count: validFiles.length, files: validFiles, firstUrl: validFiles[0].url });
} else if (result?.url) {
  const isValid = await validateVideoUrl(result.url);
  if (!isValid) {
    return { status: 404, message: 'La URL del video no es válida o está caída' };
  }

  res.json({ url: result.url });
} else {
  throw new Error('Formato de extractor no reconocido');
}

  }).then(queueResult => {
    if (queueResult && queueResult.status && !res.headersSent) {
      res.status(queueResult.status).send(queueResult.message);
    }
  }).catch(error => {
    if (!res.headersSent) {
      res.status(500).send('Error al procesar la solicitud: ' + error.message);
    }
  });
});

// Streaming video con formulario para cuando falta videoUrl
router.get('/api/stream', (req, res) => {
  const videoUrl = req.query.videoUrl;

  if (!videoUrl) {
    // Página HTML para introducir URL
    return res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
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

// Descargar video
router.get('/api/stream/download', (req, res) => {
  downloadVideo(req, res);
});

// Estado de la cola de procesamiento
router.get('/api/queue/status', (req, res) => {
  try {
    const pendingCount = apiQueue.getPendingCount();
    const currentTask = apiQueue.getCurrentTask();

    res.json({
      pendingCount,
      currentTask: currentTask
        ? {
            name: currentTask.meta.name,
            startedAt: currentTask.startedAt,
            meta: currentTask.meta,
          }
        : null,
    });
  } catch (error) {
    console.error('Error obteniendo estado de la cola:', error);
    res.status(500).json({ error: 'Error interno al obtener estado de la cola' });
  }
});

module.exports = router;
