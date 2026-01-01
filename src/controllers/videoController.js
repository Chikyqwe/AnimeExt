// src/controllers/videoController.js
const http = require('http');
const https = require('https');
const { URL } = require('url');
const asyncHandler = require('../middlewares/asyncHandler');
const cache = require('../services/cacheService');
const apiQueue = require('../core/queueService');
const supabase = require("../services/supabaseService"); // ajusta tu ruta
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
  const { url: pageUrlParam, uid: animeId, ep, mirror = 1, debug: debugParam } = req.query;
  const debugMode = debugParam === "true";

  let pageUrl = pageUrlParam;
  let source = 'UNKNOWN';
  let anime = null;

  const sendResponse = (error, data = []) => {
    // si no se pidió debug → respuesta original
    if (!debugMode) {
      if (error) return res.json({ error });
      return res.json(data);
    }

    // modo debug con info completa
    return res.json({
      error,
      data,
      debug: {
        pageUrl,
        animeId,
        ep,
        mirror,
        source,
        anime
      }
    });
  };

  try {
    // si no viene pageUrl, intenta construirla
    if (!pageUrl && animeId) {
      anime = getAnimeByUnitId(animeId);

      if (!anime || !anime.unit_id) {
        return sendResponse(`No se encontró anime con id=${animeId}`);
      }

      if (!ep) {
        return sendResponse('Parámetro "ep" obligatorio');
      }

      pageUrl = await buildEpisodeUrl(anime, ep, parseInt(mirror));
      if (!pageUrl) {
        return sendResponse('No se pudo construir la URL del episodio');
      }

      if (anime.source) source = anime.source;
    }

    // detectar fuente si no viene
    if (source === 'UNKNOWN' && pageUrl) {
      if (pageUrl.includes('tioanime')) source = 'TIO';
      else if (pageUrl.includes('animeflv')) source = 'FLV';
      else if (pageUrl.includes('animeid')) source = 'AID';
      else if (pageUrl.includes('animeytx')) source = 'AYTX';
    }

    console.log("[SERVERS] PageUrl:", pageUrl);

    const videos = await extractAllVideoLinks(pageUrl);
    const valid = await filterValidVideos(videos);

    if (!valid || valid.length === 0) {
      return sendResponse('No se encontraron videos válidos');
    }

    const enriched = valid.map(v => ({ ...v, source }));
    return sendResponse(null, enriched);

  } catch (e) {
    console.error('[servers] error:', e);
    return sendResponse('Error al extraer videos: ' + e.message);
  }
});


// GET /api  <-- endpoint principal (ahora delegamos y devolvemos respuestas limpias)
exports.api = asyncHandler(async (req, res) => {
  try {
    const animeId = req.query.uid ? parseInt(req.query.uid) : undefined;
    const ep = req.query.ep ? parseInt(req.query.ep) : undefined;
    const mirror = req.query.mirror ? parseInt(req.query.mirror) : 1;
    const serverRequested = normalizeServerName(req.query.server || '');
    let pageUrl = req.query.url;
    const ignoreVerify = req.query.ignoreVerify === 'true';

    // =============================
    // VALIDACIONES INICIALES
    // =============================
    if (!pageUrl && animeId) {
      const anime = getAnimeByUnitId(animeId);
      if (!anime?.unit_id) return res.status(404).json({ error: 'Anime no encontrado o sin unit_id', id: animeId });
      if (!ep) return res.status(400).json({ error: 'Parámetro "ep" obligatorio' });

      pageUrl = await buildEpisodeUrl(anime, ep, mirror);
      if (!pageUrl) return res.status(400).json({ error: 'No se pudo construir la URL del episodio' });
    }

    if (!pageUrl || typeof pageUrl !== 'string') return res.status(400).json({ error: 'URL no válida' });

    // =============================
    // EXTRACCIÓN DE VIDEOS
    // =============================
    let videos = [];
    if (!pageUrl && serverRequested) {
      videos = serverRequested ? [{ servidor: serverRequested, url: pageUrl }] : [];
    } else {
      videos = await extractAllVideoLinks(pageUrl);
    }
    const validVideos = videos.map(v => ({ ...v, servidor: normalizeServerName(v.servidor) }));

    if (!validVideos.length) return res.status(404).json({ error: 'No hay servidores válidos' });
     
    // =============================
    // CASO ESPECIAL SW / SWIFT
    // =============================
    if (serverRequested === 'sw') {
      const swVideo = validVideos.find(v => v.servidor === 'sw' || v.servidor.includes('swift'));
      if (!swVideo) return res.status(404).send('#EXTM3U\n#EXT-X-ENDLIST\n');
   
      const extractor = getExtractor(swVideo.servidor);
      const result = await extractor(swVideo.url);
      const best = Array.isArray(result) ? result[0] : result;

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('X-HLS-Source', best.url || '');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(best.content || '');
    }
    if (serverRequested === 'voe') {
      const voeVideo = validVideos.find(v => v.servidor === 'voe');
      if (!voeVideo) return res.status(404).send('#EXTM3U\n#EXT-X-ENDLIST\n');

      const extractor = getExtractor(voeVideo.servidor);
      const result = await extractor(voeVideo.url);
      console.log('VOE result:', result);
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('X-HLS-Source', result.hls.url || '');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(result.hls.content || '');
    }
    // =============================
    // SELECCIÓN DE SERVIDOR
    // =============================
    let selectedVideo = validVideos[0];
    if (serverRequested) {
      const found = validVideos.find(v => v.servidor === serverRequested);
      if (!found) return res.status(404).json({ error: `Servidor '${serverRequested}' no soportado` });
      selectedVideo = found;
    }

    const extractor = getExtractor(selectedVideo.servidor);
    const result = await extractor(selectedVideo.url);

    // =============================
    // RESULTADO SIMPLE SIN VERIFICACIONES
    // =============================
    if (Array.isArray(result)) {
      await Promise.all(result.map(async (item) => {
        if (item?.url) {
          await validateVideoUrl(item.url);
        }
      }));
      return res.json(result);
    }

    if (result?.url) {
      await validateVideoUrl(result.url);
      if (!result.ok) return res.status(400).json({ error: 'URL de video no válida' });
      return res.json({
        url: result.url,
        userUrl: `${req.protocol}://${req.get('host')}/api/stream?videoUrl=${encodeURIComponent(result.url)}`,
        baseUrl: selectedVideo.url,
        id: animeId
      });
    }

    return res.status(500).json({ error: 'Formato de extractor no reconocido', format: result });

  } catch (err) {
    console.error('[api] error:', err);
    if (!res.headersSent) return res.status(500).send('Error interno: ' + err.message);
  }
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
  const requestedVersionCode = req.query.version ?? null;

  // 1. Leer archivos del bucket
  const { data: files, error } = await supabase
    .storage
    .from("AnimeExtApp")
    .list("", { limit: 200 });

  if (error) throw error;

  // 2. Filtrar archivos APK con regex del estilo AnimeExt-6.0.2.apk
  const apkList = files
    .filter(f => /^AnimeExt-(\d+(?:\.\d+)*)\.apk$/.test(f.name))
    .map(f => {
      const match = f.name.match(/^AnimeExt-(\d+(?:\.\d+)*)\.apk$/);
      const version = match[1];
      const code = version.replace(/\./g, ""); // "6.0.2" → "602"
      return {
        nombre: f.name,
        version,
        code,
      };
    });

  // 3. Si se solicita descarga por version code
  if (requestedVersionCode) {
    const apk = apkList.find(a => a.code === requestedVersionCode);

    if (!apk) {
      return res.status(404).json({ error: "Versión no encontrada" });
    }

    // 3.1 obtener URL firmada para descargar
    const { data: signedUrlData, error: signedUrlError } = await supabase
      .storage
      .from("AnimeExtApp")
      .createSignedUrl(apk.nombre, 60); // 60 seg de validez

    if (signedUrlError) throw signedUrlError;

    return res.json({
      url: signedUrlData.signedUrl,
      nombre: apk.nombre,
    });
  }

  // 4. Ordenar versiones (igual que PHP)
  apkList.sort((a, b) => {
    return require("semver").rcompare(a.version, b.version);
  });

  // 5. Respuesta como en el PHP original
  const response = {
    actual: apkList[0] || null,
    anterior: apkList[1] || null,
    anteriores: apkList.slice(2),
  };

  res.json(response);
});

exports.hlsProxy = asyncHandler(async (req, res) => {
  const targetUrl = req.query.url;
  const ref = req.query.ref;

  if (!targetUrl) {
    return res.status(400).json({ error: 'Falta parámetro url' });
  }

  const parsed = new URL(targetUrl);
  const client = parsed.protocol === 'https:' ? https : http;

  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': '*/*',
      'Connection': 'keep-alive',
      ...(ref && { Referer: ref })
    }
  };

  const proxyReq = client.get(targetUrl, options, (proxyRes) => {
    // Pasar status y headers originales
    res.writeHead(proxyRes.statusCode, {
      'Content-Type': proxyRes.headers['content-type'] || 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    });

    // STREAM DIRECTO SIN BUFFER
    proxyRes.pipe(res, { end: true });

    proxyRes.on('end', () => res.end());
  });

  // 🔥 Timeout alto (stream)
  proxyReq.setTimeout(60000, () => {
    proxyReq.destroy();
  });

  proxyReq.on('error', (err) => {
    console.error('[hlsProxy]', err.message);
    if (!res.headersSent) {
      res.status(502).end('Error HLS');
    }
  });

  req.on('close', () => {
    proxyReq.destroy();
  });
});
