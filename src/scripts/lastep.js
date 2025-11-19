// scraper-safe.js
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

function getBaseUrl(url) {
  if (!url) return null;
  let base = url.replace(/\/$/, '');

  // Normalización AnimeFLV
  if (base.includes("/ver/")) {
    base = base.replace(/\/ver\/([^/]+)-\d+$/, "/anime/$1");
  }

  // Normalización genérica: quitar episodios tipo "-12"
  base = base.replace(/-\d+$/, '');

  return base;
}

function mergeEpisodio(lista, nuevo) {
  const key = cleanTitle(nuevo.titulo);
  if (!lista[key] || nuevo.episodioNum > lista[key].episodioNum) {
    lista[key] = nuevo;
  }
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

      mergeEpisodio(episodios, {
        titulo,
        episodio: episodioText,
        episodioNum,
        url,
        imagen
      });
    });

    $.root().remove();
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

      mergeEpisodio(episodios, {
        titulo,
        episodio: `Episodio ${episodioNum}`,
        episodioNum,
        url,
        imagen
      });
    });

    $.root().remove();
  } catch (err) {
    console.error('❌ Error en TioAnime:', err.message);
  }
  return episodios;
}

// ------------------- MAIN SAFE -------------------
async function last() {
  const urlToUnitIdMap = new Map();

  // Cargar unit_ids
  if (fs.existsSync(ANIME_LIST_PATH)) {
    try {
      const animeListRaw = JSON.parse(fs.readFileSync(ANIME_LIST_PATH, "utf8"));
      const animeList = Array.isArray(animeListRaw.animes) ? animeListRaw.animes : [];

      animeList.forEach(anime => {
        if (anime.sources) {
          Object.values(anime.sources).forEach(srcUrl => {
            if (srcUrl) {
              const normalized = srcUrl.replace(/\/$/, '');
              urlToUnitIdMap.set(normalized, anime.unit_id);
            }
          });
        }
      });

      console.log(`🔗 ${urlToUnitIdMap.size} URLs cargadas desde anime_list.json`);
    } catch (e) {
      console.error("[ERROR] Leyendo anime_list.json:", e.message);
    }
  }

  const [animeflvData, tioanimeData] = await Promise.all([
    scrapeAnimeFLV(),
    scrapeTioAnime()
  ]);

  const writeStream = fs.createWriteStream(OUT_LASTEP_PATH, { encoding: 'utf8' });
  writeStream.write('[\n');

  let first = true;
  const keys = new Set([...Object.keys(animeflvData), ...Object.keys(tioanimeData)]);

  for (const key of keys) {
    let anime = animeflvData[key];
    if (tioanimeData[key] && (!anime || tioanimeData[key].episodioNum > anime.episodioNum)) {
      anime = tioanimeData[key];
    }

    const baseUrl = getBaseUrl(anime.url);
    const unit_id = urlToUnitIdMap.get(baseUrl);

    if (!unit_id) {
      console.log(`⚠ No unit_id →`, anime.titulo, "| URL:", anime.url, "| Base:", baseUrl);
      continue;
    }

    const finalObj = { ...anime, id: unit_id };

    if (!first) writeStream.write(',\n');
    writeStream.write(JSON.stringify(finalObj));
    first = false;
  }

  // Cerrar stream correctamente
  await new Promise(resolve => writeStream.end('\n]', resolve));

  console.log(`\n✅ Archivo reescrito correctamente → ${OUT_LASTEP_PATH}`);
}

// Ejecutar solo si se corre directamente
if (require.main === module) last();

// Exportar
module.exports = { scrapeAnimeFLV, scrapeTioAnime, last };
