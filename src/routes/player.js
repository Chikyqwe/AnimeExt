const express = require('express');
const { readAnimeList, buildEpisodeUrl} = require('../services/jsonService');
const { getEpisodes } = require('../utils/helpers');
const router = express.Router();

router.get('/api/player', async (req, res) => {
  const uid = parseInt(req.query.uid, 10);
  const animeId = parseInt(req.query.id, 10);
  const ep = parseInt(req.query.ep, 10);

  console.log(`[API PLAYER] Solicitud con parámetros id=${animeId}, uid=${uid}, ep=${ep}`);

  if ((isNaN(animeId) && isNaN(uid)) || isNaN(ep)) {
    console.warn(`[API PLAYER] Parámetros inválidos`);
    return res.status(400).json({ error: "Faltan parámetros id/uid o ep o son inválidos" });
  }

  try {
    const anime_list = readAnimeList();
    let anime_data;

    if (!isNaN(animeId)) {
      anime_data = anime_list.find(a => a.id === animeId);
    } else if (!isNaN(uid)) {
      anime_data = anime_list.find(a => a.unit_id === uid);
    }

    if (!anime_data) {
      return res.status(404).json({ error: "Anime no encontrado" });
    }
    let maxEpisodes = 1;      // default mínimo 1
    let selectedSource = null;
  for (const source of ['FLV', 'TIO', 'ANIMEYTX']) {
      if (anime_data.sources && anime_data.sources[source]) {
          console.log(`[API PLAYER] Obteniendo episodios desde fuente: ${source}`);
          
          try {
              const epData = await getEpisodes(anime_data.sources[source]);

              if (epData.episodes && epData.episodes.length > maxEpisodes) {
                  maxEpisodes = epData.episodes.length;
                  selectedSource = source;
              }
          } catch (error) {
              console.warn(`[API PLAYER] Error obteniendo episodios de ${source}:`, error.message || error);
              // continúa con la siguiente fuente
          }
      }
  }

    console.log(`[API PLAYER] Fuente seleccionada: ${selectedSource} con ${maxEpisodes} episodios`);

    const episodes_count = maxEpisodes;

    if (ep <= 0 || ep > episodes_count) {
      return res.status(406).json({
        error: "Episodio inválido",
        redirect_url_example: !isNaN(uid)
          ? `/player?uid=${encodeURIComponent(uid)}&ep=1`
          : `/player?id=${anime_data.id}&ep=1`,
        valid_ep: Math.min(Math.max(ep, 1), episodes_count),
        delay: 2
      });
    }

    let ver_url = buildEpisodeUrl(anime_data, ep);
    if (!ver_url) {
      ver_url = buildEpisodeUrl(anime_data, ep, 2);
    }

    const prev_ep = ep > 1 ? ep - 1 : 1;
    const next_ep = ep < episodes_count ? ep + 1 : episodes_count;
    const id = anime_data.id;
    const uid_data = anime_data.unit_id;

    res.json({
      ep_actual: ep,
      prev_ep,
      next_ep,
      episodes_count,
      id,
      uid_data,
      anime_title: anime_data.title || ''
    });
  } catch (err) {
    console.error(`[API PLAYER] Error interno:`, err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
