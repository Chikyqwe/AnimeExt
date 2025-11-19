const express = require('express');
const { getAnimeById, getAnimeByUnitId, buildEpisodeUrl } = require('../services/jsonService');
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
    // Obtener anime directamente por ID o unit_id
    const animeData = !isNaN(animeId)
      ? getAnimeById(animeId)
      : getAnimeByUnitId(uid);

    if (!animeData) return res.status(404).json({ error: "Anime no encontrado" });

    // Filtrar fuentes disponibles
    const sources = ['FLV', 'TIO', 'ANIMEYTX'].filter(src => animeData.sources?.[src]);
    
    // Obtener cantidad de episodios en paralelo
    const results = await Promise.all(
      sources.map(async src => {
        try {
          const epData = await getEpisodes(animeData.sources[src]);
          return { src, count: epData?.episodes?.length || 0 };
        } catch {
          return { src, count: 0 };
        }
      })
    );

    // Elegir mejor fuente
    const bestSource = results.reduce(
      (max, curr) => curr.count > max.count ? curr : max,
      { src: null, count: 1 }
    );

    const episodesCount = bestSource.count;

    if (ep <= 0 || ep > episodesCount) {
      return res.status(406).json({
        error: "Episodio inválido",
        redirect_url_example: !isNaN(uid)
          ? `/player?uid=${uid}&ep=1`
          : `/player?id=${animeData.id}&ep=1`,
        valid_ep: Math.min(Math.max(ep, 1), episodesCount),
        delay: 2
      });
    }

    // Generar URL de episodio usando async/await
    let verUrl = null;
    for (let mirror = 1; mirror <= 3; mirror++) {
      verUrl = await buildEpisodeUrl(animeData, ep, mirror);
      if (verUrl) break;
    }

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
