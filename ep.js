const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const FUENTE1_URL = 'https://www3.animeflv.net/';
const FUENTE2_URL = 'https://tioanime.com/';
const UNITID_PATH = path.join(__dirname, 'jsons', 'UnitID.json');

// 🧠 Función para extraer número de episodio
function extractEpisodeNumber(text) {
  const match = text.match(/(\d+)(?!.*\d)/);
  return match ? parseInt(match[1], 10) : 0;
}

// 🧠 Limpiar el título (quitar número final)
function cleanTitle(title) {
  return title.replace(/\s+\d+$/, '').trim();
}

// 🧠 Convertir título a slug
function toSlug(text) {
  return text
    .toLowerCase()
    .normalize('NFD')               // separa letras con acentos
    .replace(/[\u0300-\u036f]/g, '') // elimina los acentos
    .replace(/[^a-z0-9]+/g, '-')     // todo lo que no es letra o número → guión
    .replace(/^-+|-+$/g, '');        // elimina guiones al inicio/final
}

// 🧠 Unir episodios sin duplicados
function mergeEpisodios(lista, nuevo) {
  const key = cleanTitle(nuevo.titulo);
  if (!lista[key] || nuevo.episodioNum > lista[key].episodioNum) {
    lista[key] = nuevo;
  }
}

// 🟦 Scraping de AnimeFLV
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

// 🟨 Scraping de TioAnime
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

// 🧩 Integración principal
async function main() {
  // Leer UnitID.json
  let unitIdMap = {};
  if (fs.existsSync(UNITID_PATH)) {
    try {
      unitIdMap = JSON.parse(fs.readFileSync(UNITID_PATH, 'utf8'));
    } catch (e) {
      console.error('❌ Error leyendo UnitID.json:', e.message);
    }
  } else {
    console.warn('⚠️ No se encontró UnitID.json');
  }

  // Scraping
  const [animeflvData, tioanimeData] = await Promise.all([
    scrapeAnimeFLV(),
    scrapeTioAnime()
  ]);

  // Unir resultados
  const combinados = { ...animeflvData };
  for (const key in tioanimeData) {
    if (!combinados[key] || tioanimeData[key].episodioNum > combinados[key].episodioNum) {
      combinados[key] = tioanimeData[key];
    }
  }

  // Procesar con slug e id
  const finalList = Object.values(combinados).map(anime => {
    const tituloLimpio = cleanTitle(anime.titulo);
    const slug = toSlug(tituloLimpio);
    const id = unitIdMap[slug] || null;

    return {
      ...anime,
      slug,
      id
    };
  });

  // Guardar archivo
  fs.writeFileSync('lastep.json', JSON.stringify(finalList, null, 2));
  console.log(`✅ ${finalList.length} episodios guardados en lastep.json`);
}

// Ejecutar
main();
