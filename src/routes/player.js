const express = require('express');
const { getAnimeById, getAnimeByUnitId, buildEpisodeUrl } = require('../services/jsonService');
const { getEpisodes } = require('../utils/helpers');

const router = express.Router();

const MIRRORS = ["FLV", "ONE", "TIO", "JK", "ANIYAE", "HENTAILA", "TIOHENTAI"];

function normalizeResult(data) {
  if (!data) return null;

  return {
    success: true,
    source: (data.source || "").toLowerCase(),
    episodes: data.episodes || [],
    episodes_count: data.episodes?.length || 0,
    isEnd: Boolean(data.isEnd),
    isNewEP: data.isNewEP ?? null
  };
}

router.get('/api/player', async (req, res) => {
  const uid = parseInt(req.query.uid, 10);
  const animeId = parseInt(req.query.id, 10);
  const ep = parseInt(req.query.ep, 10);

  console.log("[API PLAYER]", !isNaN(animeId) ? `id=${animeId}` : `uid=${uid}`, "ep=", ep);

  if ((isNaN(animeId) && isNaN(uid)) || isNaN(ep)) {
    return res.status(400).json({ error: "Parámetros id/uid o ep inválidos" });
  }

  try {
    const animeData = !isNaN(animeId)
      ? getAnimeById(animeId)
      : getAnimeByUnitId(uid);
    console.log(animeData);
    if (!animeData) {
      return res.status(404).json({ error: "Anime no encontrado" });
    }

    // 🔥 Probar TODOS los mirrors disponibles
    const results = await Promise.all(
      MIRRORS.map(async (key, index) => {
        const url = animeData.sources?.[key];
        if (!url) return null;

        try {
          const raw = await getEpisodes(url);
          const data = normalizeResult(raw);

          return {
            key,
            mirror: index + 1,
            count: data?.episodes_count || 0,
            data
          };
        } catch {
          return null;
        }
      })
    );

    // Filtrar válidos
    const valid = results.filter(r => r && r.count > 0);

    if (!valid.length) {
      return res.status(404).json({ error: "No hay episodios disponibles en ningún mirror" });
    }

    // 🔥 Elegir el mejor (más episodios)
    const best = valid.reduce((max, curr) =>
      curr.count > max.count ? curr : max
    );

    const episodesCount = best.count;

    // Validar episodio
    if (ep <= 0 || ep > episodesCount) {
      return res.status(406).json({
        error: "Episodio inválido",
        valid_ep: Math.min(Math.max(ep, 1), episodesCount),
        redirect_url_example: !isNaN(uid)
          ? `/player?uid=${uid}&ep=1`
          : `/player?id=${animeData.id}&ep=1`
      });
    }

    // 🔥 Generar URL probando mirrors
    let verUrl = null;
    let mirrorUsed = null;

    for (let i = 0; i < MIRRORS.length; i++) {
      try {
        const url = await buildEpisodeUrl(animeData, ep, i + 1);
        if (url) {
          verUrl = url;
          mirrorUsed = i + 1;
          break;
        }
      } catch { }
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

      // 🔥 info útil
      source: best.key,
      mirror_used: mirrorUsed,
      mirrors_tested: valid.length
    });

  } catch (err) {
    console.error("[API PLAYER ERROR]", err);

    res.status(500).json({
      error: "Error interno del servidor"
    });
  }
});

module.exports = router;