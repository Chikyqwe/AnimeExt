// src/controllers/animeController.js
const path = require('path');
const asyncHandler = require('../middlewares/asyncHandler');
const cache = require('../services/cacheService');

const {
  getJSONPath,
  getAnimeById,
  getAnimeByUnitId,
  buildEpisodeUrl
} = require('../services/jsonService');

const {
  getDescription,
  getEpisodes
} = require('../utils/helpers');

const LRU_DESCRIPTION_TTL = 60_000 * 5; // 5 minutos

// /anime/list  (protegida por middleware de token)
exports.list = asyncHandler(async (req, res) => {
  // Envía archivo JSON directamente (rápido y sin parsear)
  res.sendFile(getJSONPath('anime_list.json'));
});
// GET /anime/last (simple)
exports.last = (req, res) => res.sendFile(getJSONPath('lastep.json'));

// /anime/description
exports.description = asyncHandler(async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'Falta parámetro id' });

  const anime = getAnimeById(id);
  if (!anime) return res.status(404).json({ error: `No se encontró anime con id=${id}` });

  const cacheKey = `desc:${id}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ description: cached, cached: true });

  const sources = anime.sources || {};
  const keys = Object.keys(sources);

  let description = '';
  for (const key of keys) {
    const url = sources[key];
    if (!url) continue;

    try {
      description = await getDescription(url);
      if (description) break;
    } catch (err) {
      // no romper la ejecución por una fuente mala
      console.warn(`[DESCRIPTION] Error en fuente ${url}: ${err.message}`);
    }
  }

  if (!description) {
    return res.status(400).json({ error: 'No se pudo obtener la descripción de ninguna fuente' });
  }

  cache.set(cacheKey, description, LRU_DESCRIPTION_TTL);
  res.json({ description });
});

// /api/episodes
exports.episodes = asyncHandler(async (req, res) => {
  const { Uid, src } = req.body;
  if (Uid === undefined) return res.status(400).json({ error: 'Falta parámetro Uid' });

  const anime = getAnimeByUnitId(Uid);
  if (!anime) return res.status(404).json({ error: `No se encontró anime con id=${Uid}` });

  if (!anime.sources || !anime.sources[src]) {
    return res.status(400).json({ error: `No hay fuente para '${src}'` });
  }

  try {
    const episodes = await getEpisodes(anime.sources[src]);
    res.json({ episodes });
  } catch (err) {
    console.error('[ERROR] getEpisodes:', err);
    res.status(500).json({ error: 'Error obteniendo episodios' });
  }
});
