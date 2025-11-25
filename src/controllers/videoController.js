// src/controllers/videoController.js
const asyncHandler = require('../middlewares/asyncHandler');
const cache = require('../services/cacheService');
const apiQueue = require('../core/queueService');
const { default: axios } = require('axios');

const {
  extractAllVideoLinks,
  getExtractor
} = require('../core/extractors');

const {
  getJSONPath,
  getAnimeById,
  buildEpisodeUrl,
  getAnimeByUnitId
} = require('../services/jsonService');

const {
  proxyImage,
  streamVideo,
  downloadVideo,
  validateVideoUrl,
  getCookie
} = require('../utils/helpers');

const {
  parseMegaUrl,
  verificarArchivoMega
} = require('../utils/CheckMega');
const { stat } = require('fs-extra');

/* ---------- Helpers locales ---------- */

function normalizeServerName(name) {
  if (!name) return '';
  const n = name.toLowerCase();
  if (['yourupload', 'your-up', 'yourup', 'yu'].some(sub => n.includes(sub))) return 'yu';
  if (['burstcloud.co', 'burstcloud'].some(sub => n.includes(sub))) return 'bc';
  if (['asnwish','obeywish'].some(sub => n.includes(sub))) return 'sw';
  return n;
}

/**
 * Filtra y valida servidores (optimizado: evita hacer verificaciones MEGA en paralelo excesivo).
 * Devuelve array de servidores válidos (sin resultados pesados guardados).
 */
async function filterValidVideos(videos) {
  const valid = [];
  for (const video of videos) {
    const servidor = normalizeServerName(video.servidor);
    if (!getExtractor(servidor)) continue;

    // clon ligero para no arrastrar objetos grandes
    const item = { servidor, label: video.label, name: video.name, url: video.url };

    if (typeof item.url === 'string' && item.url.includes('mega.nz')) {
      try {
        const { id, key } = parseMegaUrl(item.url);
        const resultado = await verificarArchivoMega(id, key);
        if (resultado?.disponible) {
          item.url = `https://mega.nz/embed/${id}#${key}`;
          valid.push(item);
        }
      } catch (e) {
        // ignoramos MEGA inválida
      }
    } else {
      valid.push(item);
    }
  }
  return valid;
}

/* ---------- Rutas / handlers ---------- */

// GET /api/servers
exports.servers = asyncHandler(async (req, res) => {
  const { url: pageUrlParam, id: animeId, ep, mirror = 1 } = req.query;
  let pageUrl = pageUrlParam;
  let source = 'UNKNOWN';

  if (!pageUrl && animeId) {
    const anime = getAnimeById(animeId);
    if (!anime || !anime.unit_id) return res.status(404).json({ error: `No se encontró anime con id=${animeId}` });
    if (!ep) return res.status(400).json({ error: 'Parámetro "ep" obligatorio' });

    pageUrl = await buildEpisodeUrl(anime, ep, parseInt(mirror));
    if (!pageUrl) return res.status(400).json({ error: 'No se pudo construir la URL del episodio' });
    if (anime.source) source = anime.source;
  }

  // heurística simple para detectar fuente
  if (source === 'UNKNOWN' && pageUrl) {
    if (pageUrl.includes('tioanime')) source = 'TIO';
    else if (pageUrl.includes('animeflv')) source = 'FLV';
    else if (pageUrl.includes('animeid')) source = 'AID';
    else if (pageUrl.includes('animeytx')) source = 'AYTX';
  }

  try {
    const videos = await extractAllVideoLinks(pageUrl);
    const valid = await filterValidVideos(videos);
    const enriched = valid.map(v => ({ ...v, source }));
    res.json(enriched);
  } catch (e) {
    console.error('[servers] error:', e);
    res.status(500).json({ error: 'Error al extraer videos: ' + e.message });
  }
});

// GET /api  <-- endpoint principal (ahora delegamos y devolvemos respuestas limpias)
exports.api = asyncHandler(async (req, res) => {
  const animeId = req.query.id ? parseInt(req.query.id) : undefined;
  const ep = req.query.ep ? parseInt(req.query.ep) : undefined;
  const mirror = req.query.mirror ? parseInt(req.query.mirror) : 1;
  const serverRequested = normalizeServerName(req.query.server || '');
  let pageUrl = req.query.url;

  if (!pageUrl && animeId) {
    const anime = getAnimeById(animeId);
    if (!anime || !anime.unit_id) return res.status(404).json({ error: 'Anime no encontrado o sin unit_id', id: animeId });
    if (!ep) return res.status(400).json({ error: 'Parámetro "ep" obligatorio' });

    pageUrl = await buildEpisodeUrl(anime, ep, mirror);
    if (!pageUrl) return res.status(400).json({ error: 'No se pudo construir la URL del episodio' });
  }

  // Encolamos el procesamiento para limitar concurrencia y proteger extractores
  apiQueue.add(async () => {
    if (!pageUrl || typeof pageUrl !== 'string') {
      // retornamos un objeto especial que el .then() del queue manejará
      return { status: 400, message: 'URL no válida' };
    }

    const videos = await extractAllVideoLinks(pageUrl);
    const valid = videos
      .map(v => ({ ...v, servidor: normalizeServerName(v.servidor) }))
      .filter(v => getExtractor(v.servidor));

    if (valid.length === 0) return { status: 404, message: 'No hay servidores validos' };

    // M3U8 SWIFT (caso especial)
    if (serverRequested === 'sw') {
      const swVideo = valid.find(v => v.servidor === 'sw' || v.servidor.includes('swift'));
      if (!swVideo) return { status: 404, message: '#EXTM3U\n#EXT-X-ENDLIST\n' };

      const extractor = getExtractor(swVideo.servidor);
      const swResult = await extractor(swVideo.url);
      const files = Array.isArray(swResult) ? swResult : [];
      const best = files.find(f => f.url.includes('index-f2')) || files[0];

      if (!best || !best.content) return { status: 404, message: '#EXTM3U\n#EXT-X-ENDLIST\n' };

      // Enviamos directamente el m3u8 (no lo adicionamos al historial)
      return { stream: true, contentType: 'application/vnd.apple.mpegurl', body: best.content };
    }

    // Selección de servidor demandado por query
    let selected = valid[0];
    if (serverRequested) {
      const found = valid.find(v => v.servidor === serverRequested);
      if (!found) return { status: 404, message: `Servidor '${serverRequested}' no soportado` };
      selected = found;
    }

    const extractor = getExtractor(selected.servidor);
    const result = await extractor(selected.url);

    // Si el extractor devolvió lista (varios archivos)
    if (Array.isArray(result) && result[0]?.content) {
      // Validamos las URLs externas (sin guardar objetos pesados en el historial)
      const validatedResults = [];
      for (const r of result) {
        try {
          const isValid = await validateVideoUrl(r.url);
          if (isValid) {
            validatedResults.push({
              url: r.url,
              userUrl: `${req.protocol}://${req.get('host')}/api/stream?videoUrl=${encodeURIComponent(r.url)}`,
              label: r.label || r.name || '',
            });
          }
        } catch (err) {
          // ignorar fallo en una URL
        }
      }

      if (validatedResults.length === 0) {
        return { status: 404, message: 'No se encontró ninguna URL de video válida' };
      }

      return { json: { count: validatedResults.length, files: validatedResults, firstUrl: validatedResults[0].url, firstUserUrl: validatedResults[0].userUrl } };
    }

    // Si el extractor devolvió objeto simple con url
    if (result?.url) {
      const isValid = await validateVideoUrl(result.url);
      if (!isValid) return { status: 404, message: 'La URI No paso la validacion', uri: result.url };

      return { json: { url: result.url, userUrl: `${req.protocol}://${req.get('host')}/api/stream?videoUrl=${encodeURIComponent(result.url)}`, baseUrl: selected.url, valid: isValid, id: animeId } };
    }

    // Formato no reconocido
    return { status: 500, message: 'Formato de extractor no reconocido' };

  }).then(queueResult => {
    // Si no se envió respuesta antes, manejamos la respuesta aquí
    if (!queueResult) {
      if (!res.headersSent) res.status(500).send('No hay resultado de la cola');
      return;
    }

    if (queueResult.status && !res.headersSent) {
      res.status(queueResult.status).send(queueResult.message);
      return;
    }

    if (queueResult.stream && !res.headersSent) {
      res.setHeader('Content-Type', queueResult.contentType || 'application/vnd.apple.mpegurl');
      res.send(queueResult.body);
      return;
    }

    if (queueResult.json && !res.headersSent) {
      res.json(queueResult.json);
      return;
    }

    if (queueResult && !res.headersSent) {
      res.json(queueResult);
      return;
    }
  }).catch(error => {
    console.error('[api] error:', error);
    if (!res.headersSent) res.status(500).send('Error al procesar la solicitud: ' + error.message);
  });
});

// GET /api/stream (form + streaming)
exports.stream = asyncHandler(async (req, res) => {
  const videoUrl = req.query.videoUrl;
  if (!videoUrl) {
    return res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head><meta charset="UTF-8"/><title>Falta videoUrl</title></head>
      <body>
        <form method="GET">
          <input name="videoUrl" placeholder="https://..." style="width:80%"/>
          <button>Ver</button>
        </form>
      </body>
      </html>
    `);
  }

  // delegamos la lógica de streaming a streamVideo (tu helper)
  streamVideo(videoUrl, req, res);
});

// GET /api/req
exports.reqProxy = asyncHandler(async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'Falta parámetro url' });

  try {
    const { data } = await axios.get(url, { timeout: 10_000 });
    res.json(data);
  } catch (err) {
    console.error('[req] error:', err.message);
    res.status(500).json({ error: 'Error interno al realizar la solicitud' });
  }
});

// GET /api/stream/download
exports.download = (req, res) => downloadVideo(req, res);

// GET /api/queue/status
exports.queueStatus = (req, res) => {
  try {
    const pendingCount = apiQueue.getPendingCount();
    const currentTask = apiQueue.getCurrentTask();
    res.json({
      pendingCount,
      currentTask: currentTask ? { name: currentTask.meta.name, startedAt: currentTask.startedAt, meta: currentTask.meta } : null
    });
  } catch (err) {
    console.error('[queue/status] error:', err);
    res.status(500).json({ error: 'Error interno al obtener estado de la cola' });
  }
};

// GET /app/v
exports.appV = asyncHandler(async (req, res) => {
/**

  const apiUrl = 'https://animeext.xo.je/app/beta/dw.php';
  try {
    const cookieVal = await getCookie(apiUrl);
    console.log('[app/v] cookie obtenida:', cookieVal);
    const { data } = await axios.get(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Cookie': `__test=${cookieVal}`
      },
      timeout: 8000
    });

    // Aquí ya tienes el JSON con "actual", "anterior" y "anteriores"
    res.json(data);
  } catch (err) {
    console.error('[app/v] error:', err.message);
    res.status(500).json({ error: 'Error interno al obtener datos de la API' });
  }
 */  res.status(200).json({ status: 'No implementado' });
});