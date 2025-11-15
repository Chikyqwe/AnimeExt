const express = require('express');
const { readAnimeList, buildEpisodeUrl } = require('../services/jsonService');
const { getEpisodes } = require('../utils/helpers');
const router = express.Router();

router.get('/api/player', async (req, res) => {
  const uid = parseInt(req.query.uid, 10);
  const animeId = parseInt(req.query.id, 10);
  const ep = parseInt(req.query.ep, 10);

  if ((isNaN(animeId) && isNaN(uid)) || isNaN(ep)) {
    return res.status(400).json({ error: "Parámetros id/uid o ep faltantes o inválidos" });
  }

  try {
    const animeList = readAnimeList();
    const animeData = !isNaN(animeId)
      ? animeList.find(a => a.id === animeId)
      : animeList.find(a => a.unit_id === uid);

    if (!animeData) return res.status(404).json({ error: "Anime no encontrado" });

    // Obtener la fuente con más episodios en paralelo
    const sources = ['FLV', 'TIO', 'ANIMEYTX'].filter(src => animeData.sources?.[src]);
    const sourcePromises = sources.map(async src => {
      try {
        const epData = await getEpisodes(animeData.sources[src]);
        return { src, count: epData.episodes?.length || 0 };
      } catch {
        return { src, count: 0 };
      }
    });

    const results = await Promise.all(sourcePromises);
    const bestSource = results.reduce((max, curr) => curr.count > max.count ? curr : max, { src: null, count: 1 });

    const episodesCount = bestSource.count;
    if (ep <= 0 || ep > episodesCount) {
      return res.status(406).json({
        error: "Episodio inválido",
        redirect_url_example: !isNaN(uid)
          ? `/player?uid=${encodeURIComponent(uid)}&ep=1`
          : `/player?id=${animeData.id}&ep=1`,
        valid_ep: Math.min(Math.max(ep, 1), episodesCount),
        delay: 2
      });
    }

    // Generar URL de episodio (intenta mirrors)
    let verUrl = buildEpisodeUrl(animeData, ep, 1) || buildEpisodeUrl(animeData, ep, 2) || buildEpisodeUrl(animeData, ep, 3);

    res.json({
      ep_actual: ep,
      prev_ep: Math.max(ep - 1, 1),
      next_ep: Math.min(ep + 1, episodesCount),
      episodes_count: episodesCount,
      id: animeData.id,
      uid_data: animeData.unit_id,
      anime_title: animeData.title || '',
      episode_url: verUrl,
      source: bestSource.src
    });

  } catch (err) {
    console.error("[API PLAYER] Error interno:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

module.exports = router;
