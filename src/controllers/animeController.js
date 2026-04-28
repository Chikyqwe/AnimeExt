// src/controllers/animeController.js
const path = require('path');
const asyncHandler = require('../middlewares/asyncHandler');
const { MemoryCache } = require('../core/cache/cache');

const descriptionCache = new MemoryCache({ maxEntries: 500, maxStringLength: 10000 });
const LRU_DESCRIPTION_TTL = 60_000 * 5;

const {
  getJSONPath,
  getAnimeByUnitId,
  getAllAnimes,         // nueva helper — ver nota abajo
  readAnimeList
} = require('../services/jsonService');

const {
  getDescription,
  getEpisodes,
  getEpisodeImage,     // nueva helper opcional
} = require('../utils/helpers');

const { proxyImage } = require('../utils/helpers');

const MIRRORS = ['FLV', 'ONE', 'TIO', 'JK', 'ANIYAE', 'HENTAILA', 'TIOHENTAI'];
const PER_PAGE = 24; // ítems por página en /anime/list

// ─────────────────────────────────────────────
// GET /anime/list?p={page|all}
// p omitido → p=1
// ─────────────────────────────────────────────
exports.list = asyncHandler(async (req, res) => {
  const p = req.query.p;

  if (p === 'all') {
    // Devuelve el JSON completo tal como está en disco
    return res.sendFile(getJSONPath('anime_list.json'));
  }

  // Paginación
  const page = Math.max(1, parseInt(p) || 1);
  const all = readAnimeList(); // array de objetos { title, slug, unit_id, … }

  const total = all.length;
  const start = (page - 1) * PER_PAGE;
  const items = all.slice(start, start + PER_PAGE).map(a => ({
    title: a.title,
    slug: a.slug,
    unit_id: a.unit_id,
  }));

  res.json({
    page,
    total,
    totalpages: Math.ceil(total / PER_PAGE),
    items,
  });
});

// ─────────────────────────────────────────────
// GET /anime/last
// ─────────────────────────────────────────────
exports.last = (req, res) => res.sendFile(getJSONPath('lastep.json'));

// ─────────────────────────────────────────────
// GET /api/info?uid=
// Unifica: descripción + episodios + metadata del anime
// Diagrama: user → anime → /api/info?uid=2932 → /player/uid/ep
// ─────────────────────────────────────────────
exports.info = asyncHandler(async (req, res) => {
  const uid = parseInt(req.query.uid);
  if (!uid) return res.status(400).json({ error: 'Falta parámetro uid' });

  const anime = getAnimeByUnitId(uid);
  if (!anime) return res.status(404).json({ error: `No se encontró anime con uid=${uid}` });

  // ── Descripción (con caché) ──────────────────
  const cacheKey = `desc:${uid}`;
  let description = descriptionCache.load(cacheKey) || '';

  if (!description) {
    const sources = anime.sources || {};
    for (const url of Object.values(sources)) {
      if (!url) continue;
      try {
        description = await getDescription(url);
        if (description) break;
      } catch (err) {
        console.warn(`[info/desc] Error en fuente ${url}: ${err.message}`);
      }
    }
    if (description) descriptionCache.save(cacheKey, description, LRU_DESCRIPTION_TTL);
  }

  // ── Episodios ────────────────────────────────
  let episodes = [];
  let status = null;
  let isEnd = false;
  let source = null;

  for (const mirrorKey of MIRRORS) {
    const sourceUrl = anime.sources?.[mirrorKey];
    if (!sourceUrl) continue;
    try {
      const raw = await getEpisodes(sourceUrl);
      if (!raw?.episodes?.length) continue;

      isEnd = Boolean(raw.isEnd);
      source = mirrorKey;
      status = isEnd ? 'Finalizado' : 'En emisión';

      episodes = raw.episodes.map(ep => ({
        num: Number(ep.number),
        url: `/player/${uid}/${ep.number}`,
      }));
      break;
    } catch (err) {
      console.warn(`[info/eps] Error mirror ${mirrorKey}: ${err.message}`);
    }
  }

  res.json({
    type: 'anime',
    title: anime.title,
    slug: anime.slug,
    category: anime.category || 'anime',
    eps: episodes.length,
    desc: description || '',
    tags: anime.tags || [],
    status: status || 'Desconocido',
    episodes,
    uid,
    image: anime.image || '',
    source: source || '',
  });
});

// ─────────────────────────────────────────────
// POST /anime/img
// Body case 1: { Did, uid, type: "cover" }
// Body case 2: { Did, uid, type: "ep", ep: 2 }
// Devuelve binary (imagen)
// ─────────────────────────────────────────────
exports.img = asyncHandler(async (req, res) => {
  const { uid, type, ep } = req.body;
  if (!uid) return res.status(400).json({ error: 'Falta uid' });
  if (!type) return res.status(400).json({ error: 'Falta type (cover | ep)' });

  const anime = getAnimeByUnitId(parseInt(uid));
  if (!anime) return res.status(404).json({ error: `Anime uid=${uid} no encontrado` });

  if (type === 'cover') {
    const imageUrl = anime.image || anime.cover;
    if (!imageUrl) return res.status(404).json({ error: 'Sin imagen de portada' });
    return proxyImage(imageUrl, res);
  }

  if (type === 'ep') {
    const epNum = parseInt(ep);
    if (!epNum) return res.status(400).json({ error: 'Falta ep' });

    // Intentamos obtener el thumbnail del episodio desde las fuentes
    for (const mirrorKey of MIRRORS) {
      const sourceUrl = anime.sources?.[mirrorKey];
      if (!sourceUrl) continue;
      try {
        const raw = await getEpisodes(sourceUrl);
        const found = raw?.episodes?.find(e => Number(e.number) === epNum);
        if (found?.img) return proxyImage(found.img, res);
      } catch { /* siguiente mirror */ }
    }

    // Fallback: portada del anime
    const fallback = anime.image || anime.cover;
    if (fallback) return proxyImage(fallback, res);
    return res.status(404).json({ error: 'Imagen de episodio no encontrada' });
  }

  return res.status(400).json({ error: `type inválido: ${type}` });
});

// ─────────────────────────────────────────────
// POST /anime/search
// Body: { Did, query }
// ─────────────────────────────────────────────
exports.search = asyncHandler(async (req, res) => {
  const { query } = req.body;
  if (!query || !query.trim()) return res.status(400).json({ error: 'Falta query' });

  const all = readAnimeList();
  const term = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  const results = all
    .filter(a => {
      const title = (a.title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return title.includes(term);
    })
    .slice(0, 20)
    .map(a => ({ title: a.title, uid: a.unit_id, unit_id: a.unit_id, image: a.image }));

  res.json(results);
});

exports.initmjs = asyncHandler(async (req, res) => {
  res.json({
    "mjs": "This is the AnimeExt API, please return to the main page.",
    "web": "https://animeext-m5lt.onrender.com/",
    "date": new Date().toISOString()
  })
})