const express = require('express');
const { readAnimeList } = require('../services/jsonService');

const router = express.Router();

// Helper para construir la URL del episodio
function buildEpisodeUrl(anime, ep) {
  if (!anime?.url || !ep) return null;

  let baseUrl = '';
  let slug = '';

  if (anime.url.includes('animeflv')) {
    baseUrl = 'https://www3.animeflv.net';
    slug = anime.slug;
  } else if (anime.url.includes('tioanime')) {
    baseUrl = 'https://tioanime.com';
    const parts = anime.url.split('/');
    slug = parts[parts.length - 1];
  } else {
    return null;
  }

  if (!slug) return null;

  return `${baseUrl}/ver/${slug}-${ep}`;
}

router.get('/api/player', (req, res) => {
  const url_original = req.query.url;
  const animeId = parseInt(req.query.id, 10);
  const ep = parseInt(req.query.ep, 10);

  console.log(`[API PLAYER] Solicitud con parámetros url=${url_original}, id=${animeId}, ep=${ep}`);

  if ((!url_original && isNaN(animeId)) || isNaN(ep)) {
    console.warn(`[API PLAYER] Parámetros inválidos`);
    return res.status(400).json({ error: "Faltan parámetros id/url o ep o son inválidos" });
  }

  try {
    const anime_list = readAnimeList();
    let anime_data;

    if (url_original) {
      anime_data = anime_list.find(a => a.url === url_original);
    } else if (!isNaN(animeId)) {
      anime_data = anime_list.find(a => a.id === animeId);
    }

    if (!anime_data) {
      return res.status(404).json({ error: "Anime no encontrado" });
    }

    const episodes_count = anime_data.episodes_count || 1;
    if (ep <= 0 || ep > episodes_count) {
      return res.status(406).json({
        error: "Episodio inválido",
        redirect_url_example: url_original
          ? `/player?url=${encodeURIComponent(url_original)}&ep=1`
          : `/player?id=${anime_data.id}&ep=1`,
        valid_ep: Math.min(Math.max(ep, 1), episodes_count),
        delay: 2
      });
    }

    const ver_url = buildEpisodeUrl(anime_data, ep);
    if (!ver_url) {
      return res.status(500).json({ error: 'No se pudo construir la URL del episodio' });
    }

    const current_url = { base_url: ver_url };
    const prev_ep = ep > 1 ? ep - 1 : 1;
    const next_ep = ep < episodes_count ? ep + 1 : episodes_count;

    res.json({
      current_url,
      url_original: anime_data.url,
      ep_actual: ep,
      prev_ep,
      next_ep,
      episodes_count,
      anime_title: anime_data.title || ''
    });
  } catch (err) {
    console.error(`[API PLAYER] Error interno:`, err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
