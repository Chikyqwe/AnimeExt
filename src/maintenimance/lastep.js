// scraper.js
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const FUENTE1_URL = 'https://www3.animeflv.net/';
const FUENTE2_URL = 'https://tioanime.com/';

const ANIME_LIST_PATH = path.join(__dirname, "..", "..", "data", "anime_list.json");
const OUT_LASTEP_PATH = path.join(__dirname, "..", "..", "data", "lastep.json");

// ------------------- UTILS -------------------

function extractEpisodeNumber(text) {
  const match = text.match(/(\d+)(?!.*\d)/);
  return match ? parseInt(match[1], 10) : 0;
}

function cleanTitle(title) {
  return title.replace(/\s+\d+$/, '').trim();
}

function toSlug(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function mergeEpisodios(lista, nuevo) {
  const key = cleanTitle(nuevo.titulo);
  if (!lista[key] || nuevo.episodioNum > lista[key].episodioNum) {
    lista[key] = nuevo;
  }
}

// Convierte URL de episodio a URL base de anime
function getBaseUrl(url) {
  if (!url) return null;

  let base = url.replace(/\/$/, '');

  // AnimeFLV: /ver/nombre-123  -> /anime/nombre
  if (base.includes("/ver/")) {
    base = base.replace(/\/ver\/([^/]+)-\d+$/, "/anime/$1");
  }

  // TioAnime: /ver/nombre-123  -> /anime/nombre
  if (base.includes("/ver/")) {
    base = base.replace(/\/ver\/([^/]+)-\d+$/, "/anime/$1");
  }

  return base;
}

// ------------------- SCRAPERS -------------------

async function scrapeAnimeFLV() {
  const episodios = {};
  try {
    const { data: html } = await axios.get(FUENTE1_URL);
    const $ = cheerio.load(html);

    $('ul.ListEpisodios.AX.Rows.A06.C04.D03 li').each((_, el) => {
      const aTag = $(el).find('a.fa-play');
      const titulo = $(el).find('strong.Title').text().trim();
      const episodioText = $(el).find('span.Capi').text().trim();
      const episodioNum = extractEpisodeNumber(episodioText);
      const url = FUENTE1_URL.replace(/\/$/, '') + aTag.attr('href');
      const imagen = FUENTE1_URL.replace(/\/$/, '') + $(el).find('img').attr('src');
      const alt = $(el).find('img').attr('alt');

      mergeEpisodios(episodios, { titulo, episodio: episodioText, episodioNum, url, imagen, alt });
    });
  } catch (err) {
    console.error('❌ Error en AnimeFLV:', err.message);
  }

  return episodios;
}

async function scrapeTioAnime() {
  const episodios = {};
  try {
    const { data: html } = await axios.get(FUENTE2_URL);
    const $ = cheerio.load(html);

    $('ul.episodes li article.episode').each((_, el) => {
      const aTag = $(el).find('a');
      const titulo = $(el).find('h3.title').text().trim();
      const episodioNum = extractEpisodeNumber(titulo);
      const url = FUENTE2_URL.replace(/\/$/, '') + aTag.attr('href');
      const imgTag = $(el).find('img');
      const imagen = FUENTE2_URL.replace(/\/$/, '') + imgTag.attr('src');
      const alt = imgTag.attr('alt');

      mergeEpisodios(episodios, { titulo, episodio: `Episodio ${episodioNum}`, episodioNum, url, imagen, alt });
    });
  } catch (err) {
    console.error('❌ Error en TioAnime:', err.message);
  }

  return episodios;
}

// ------------------- MAIN -------------------

async function last() {
  let urlToUnitIdMap = {};

  // Leer anime_list.json y crear índice url -> unit_id
  if (fs.existsSync(ANIME_LIST_PATH)) {
    try {
      const animeListRaw = JSON.parse(fs.readFileSync(ANIME_LIST_PATH, "utf8"));

      // Si tiene propiedad "animes", úsala
      const animeList = Array.isArray(animeListRaw.animes)
        ? animeListRaw.animes
        : Array.isArray(animeListRaw)
          ? animeListRaw
          : Object.values(animeListRaw);

      console.log(`[INFO] Cargados ${animeList.length} animes desde anime_list.json`);

      animeList.forEach(anime => {
        if (anime.sources) {
          Object.values(anime.sources).forEach(srcUrl => {
            if (srcUrl) {
              urlToUnitIdMap[srcUrl.replace(/\/$/, '')] = anime.unit_id;
            }
          });
        }
      });
    } catch (e) {
      console.error("[ERROR] Error leyendo anime_list.json:", e.message);
    }
  } else {
    console.warn("[WARNING] No se encontró anime_list.json");
  }

  const [animeflvData, tioanimeData] = await Promise.all([
    scrapeAnimeFLV(),
    scrapeTioAnime()
  ]);

  const combinados = { ...animeflvData };
  for (const key in tioanimeData) {
    if (!combinados[key] || tioanimeData[key].episodioNum > combinados[key].episodioNum) {
      combinados[key] = tioanimeData[key];
    }
  }

  // Filtrar episodios que tengan unit_id válido
  const finalList = Object.values(combinados)
    .map(anime => {
      const baseUrl = getBaseUrl(anime.url);
      const unit_id = urlToUnitIdMap[baseUrl] || null;

      if (!unit_id) return null; // ❌ descartar si no coincide

      return {
        ...anime,
        unit_id
      };
    })
    .filter(Boolean);

  fs.writeFileSync(OUT_LASTEP_PATH, JSON.stringify(finalList, null, 2));
  console.log(`[SUCCESS] ${finalList.length} episodios guardados en lastep.json`);
}

// Solo ejecutar si se corre directamente
if (require.main === module) {
  last();
}

// Exportar funciones
module.exports = {
  scrapeAnimeFLV,
  scrapeTioAnime,
  last
};
