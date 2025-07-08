// src/routes/player.js
const express = require('express');
const { readAnimeList } = require('../services/jsonService');

const router = express.Router();

router.get('/api/player', (req, res) => {
  const url_original = req.query.url;
  const ep = parseInt(req.query.ep, 10);

  console.log(`[API PLAYER] Solicitud con parámetros url=${url_original}, ep=${ep}`);

  if (!url_original || isNaN(ep)) {
    console.warn(`[API PLAYER] Parámetros inválidos: url=${url_original}, ep=${req.query.ep}`);
    return res.status(400).json({ error: "Faltan parámetros url o ep o son inválidos" });
  }

  try {
    console.log(`[API PLAYER] Leyendo lista de animes...`);
    const anime_list = readAnimeList();
    const anime_data = anime_list.find(a => a.url === url_original);

    if (!anime_data) {
      console.warn(`[API PLAYER] Anime no encontrado para url: ${url_original}`);
      return res.status(404).json({ error: "Anime no encontrado" });
    }

    const episodes_count = anime_data.episodes_count || 1;
    if (ep <= 0 || ep > episodes_count) {
      console.warn(`[API PLAYER] Episodio inválido ${ep}, rango permitido 1-${episodes_count}`);
      return res.status(406).json({
        error: "Episodio inválido",
        redirect_url_example: `/player?url=${encodeURIComponent(url_original)}&ep=1`,
        valid_ep: Math.min(Math.max(ep, 1), episodes_count),
        delay: 2
      });
    }

    const base_url = url_original.replace('/anime/', '/ver/');
    const current_url = { base_url };
    const prev_ep = ep > 1 ? ep - 1 : 1;
    const next_ep = ep < episodes_count ? ep + 1 : episodes_count;

    console.log(`[API PLAYER] Respondiendo con URLs: current=${base_url}, prev=${prev_ep}, next=${next_ep}, total=${episodes_count}`);
    res.json({
      current_url,
      url_original,
      ep_actual: ep,
      prev_ep,
      next_ep,
      episodes_count,
      anime_title: anime_data.title || ''
    });
  } catch (err) {
    console.error(`[API PLAYER] Error interno:`, err);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
