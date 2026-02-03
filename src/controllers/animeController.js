// src/controllers/animeController.js
const path = require('path');
const asyncHandler = require('../middlewares/asyncHandler');

// Importamos las nuevas clases
const { MemoryCache, DiskCache } = require('../core/cache/cache');

/**
 * Modernización: Usamos MemoryCache para descripciones (Ultra rápido)
 * Si prefieres que persista en disco tras reiniciar, usa: new DiskCache()
 */
const descriptionCache = new MemoryCache({ 
    maxEntries: 500, 
    maxStringLength: 10000 
});

const {
  getJSONPath,
  getAnimeByUnitId,
} = require('../services/jsonService');

const {
  getDescription,
  getEpisodes
} = require('../utils/helpers');

const LRU_DESCRIPTION_TTL = 60_000 * 5; // 5 minutos

// /anime/list
exports.list = asyncHandler(async (req, res) => {
  res.sendFile(getJSONPath('anime_list.json'));
});

// GET /anime/last
exports.last = (req, res) => res.sendFile(getJSONPath('lastep.json'));

// /anime/description
exports.description = asyncHandler(async (req, res) => {
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ error: 'Falta parámetro uid' });

  const anime = getAnimeByUnitId(uid);
  if (!anime) return res.status(404).json({ error: `No se encontró anime con uid=${uid}` });

  const cacheKey = `desc:${uid}`;
  
  // MODERNIZACIÓN: Uso de descriptionCache.load (antes cache.get)
  const cached = descriptionCache.load(cacheKey);
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
      console.warn(`[DESCRIPTION] Error en fuente ${url}: ${err.message}`);
    }
  }

  if (!description) {
    return res.status(400).json({ error: 'No se pudo obtener la descripción de ninguna fuente' });
  }

  // MODERNIZACIÓN: Uso de descriptionCache.save (antes cache.set)
  descriptionCache.save(cacheKey, description, LRU_DESCRIPTION_TTL);

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