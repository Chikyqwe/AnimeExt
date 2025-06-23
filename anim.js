const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const PQueue = require("p-queue").default;
const path = require("path");

// Configs
const FLV_BASE_URL = "https://www3.animeflv.net/browse?page={page}";
const FLV_API_BASE = "https://animeflv.ahmedrangel.com/api/anime/";
const FLV_MAX_PAGES = 173;
const FLV_HEADERS = { "User-Agent": "Mozilla/5.0" };

const TIO_BASE_URL = "https://tioanime.com";
const TIO_TOTAL_PAGES = 209;

const CONCURRENT_REQUESTS = 150;

async function fetchAnimeflvData(page, log) {
  try {
    log(`[FLV][Página ${page}] Descargando...`);
    const url = FLV_BASE_URL.replace("{page}", page);
    const resp = await axios.get(url, { headers: FLV_HEADERS, timeout: 10000 });
    const $ = cheerio.load(resp.data);
    const animeList = $("ul.ListAnimes.AX.Rows.A03.C02.D02");
    const results = [];

    animeList.find("li").each((_, li) => {
      const aTag = $(li).find("a[href]");
      const imgTag = $(li).find("figure img");
      if (aTag.length && imgTag.length) {
        const animeUrl = "https://animeflv.net" + aTag.attr("href");
        const imageUrl = imgTag.attr("src") || "";
        const title = imgTag.attr("alt") || "";
        results.push({ url: animeUrl, image: imageUrl, title });
      }
    });
    log(`[FLV][Página ${page}] ${results.length} animes.`);
    return results;
  } catch (error) {
    log(`[FLV][Página ${page}] Error: ${error.message}`);
    return [];
  }
}

async function fetchFlvEpisodes(anime, log) {
  try {
    const slug = anime.url.replace(/\/$/, "").split("/").pop();
    const apiUrl = FLV_API_BASE + slug;
    log(`[FLV][${anime.title}] Consultando episodios...`);
    const resp = await axios.get(apiUrl, { timeout: 10000 });
    const data = resp.data;
    const episodesCount = data?.data?.episodes?.length || 0;
    log(`[FLV][${anime.title}] ${episodesCount} episodios.`);
    return { ...anime, episodes_count: episodesCount };
  } catch (error) {
    log(`[FLV][${anime.title}] Error: ${error.message}`);
    return { ...anime, episodes_count: 0 };
  }
}

async function fetchAllFlvEpisodes(animeflvRaw, log) {
  log("[FLV] Descargando episodios...");
  const queue = new PQueue({ concurrency: CONCURRENT_REQUESTS });

  const results = await Promise.all(animeflvRaw.map((anime, idx) =>
    queue.add(() => fetchFlvEpisodes(anime, log))
  ));
  log("[FLV] Episodios descargados.");
  return results;
}

async function extraerTioanimesDePagina(pagina, log) {
  try {
    log(`[Tio][Página ${pagina}] Descargando...`);
    const url = `${TIO_BASE_URL}/directorio?p=${pagina}`;
    const resp = await axios.get(url, { timeout: 10000 });
    const $ = cheerio.load(resp.data);
    const lista = $("ul.animes.list-unstyled.row");
    const animes = [];

    lista.find("article.anime").each((_, article) => {
      const a = $(article).find("a");
      const href = a.attr("href") || "";
      if (href.includes("/anime/")) {
        const slug = href.replace("/anime/", "").replace(/\/$/, "");
        const titulo = slug.replace(/-/g, " ");
        animes.push({ slug, titulo });
      }
    });

    log(`[Tio][Página ${pagina}] ${animes.length} animes.`);
    return animes;
  } catch (error) {
    log(`[Tio][Página ${pagina}] Error: ${error.message}`);
    return [];
  }
}

async function procesarTioanime(anime, log) {
  try {
    const url = `${TIO_BASE_URL}/anime/${anime.slug}`;
    log(`[Tio][${anime.titulo}] Consultando...`);
    const resp = await axios.get(url, { timeout: 10000 });
    const html = resp.data;

    const match = html.match(/var episodes\s*=\s*(\[[^\]]*\])/);
    let episodesCount = 0;
    if (match) {
      episodesCount = JSON.parse(match[1]).length;
    }

    const $ = cheerio.load(html);
    const titleTag = $("h1.title").first();
    const imgTag = $("aside img").first();
    const imgUrl = imgTag.length && imgTag.attr("src") ? TIO_BASE_URL + imgTag.attr("src") : "";

    log(`[Tio][${anime.titulo}] ${episodesCount} episodios.`);
    return {
      url,
      title: titleTag.text().trim() || anime.titulo,
      image: imgUrl,
      episodes_count: episodesCount,
    };
  } catch (error) {
    log(`[Tio][${anime.titulo}] Error: ${error.message}`);
    return null;
  }
}

async function unirJsonSinRepetirTitulos(datos1, datos2, salida, log) {
  const combinados = {};
  [...datos1, ...datos2].forEach(anime => {
    const titulo = anime.title;
    if (!combinados[titulo] || anime.episodes_count > combinados[titulo].episodes_count) {
      combinados[titulo] = anime;
    }
  });

  fs.writeFileSync(salida, JSON.stringify(Object.values(combinados), null, 2), "utf-8");
  log(`[Union] Archivo combinado: ${salida}`);
}

function eliminarArchivo(archivo, log) {
  try {
    fs.unlinkSync(archivo);
    log(`[Delete] Eliminado: ${archivo}`);
  } catch (err) {
    log(`[Warning] No se pudo eliminar ${archivo}: ${err.message}`);
  }
}

async function main({ log }) {
  log("🔎 Iniciando scraping AnimeFLV...");
  const flvQueue = new PQueue({ concurrency: CONCURRENT_REQUESTS });
  const flvPages = await Promise.all(
    Array.from({ length: FLV_MAX_PAGES }, (_, i) =>
      flvQueue.add(() => fetchAnimeflvData(i + 1, log))
    )
  );

  const animeflvRaw = flvPages.flat();
  log(`[FLV] Total animes: ${animeflvRaw.length}`);
  const animeflvData = await fetchAllFlvEpisodes(animeflvRaw, log);
  fs.writeFileSync("anime_list_flv.json", JSON.stringify(animeflvData, null, 2));

  log("📡 Iniciando scraping TioAnime...");
  const tioQueue = new PQueue({ concurrency: CONCURRENT_REQUESTS });
  const tioPages = await Promise.all(
    Array.from({ length: TIO_TOTAL_PAGES }, (_, i) =>
      tioQueue.add(() => extraerTioanimesDePagina(i + 1, log))
    )
  );

  const tioRaw = tioPages.flat();
  log(`[Tio] Total animes: ${tioRaw.length}`);
  const tioEpisodes = await Promise.all(
    tioRaw.map(anime => procesarTioanime(anime, log))
  );

  const tioData = tioEpisodes.filter(Boolean);
  fs.writeFileSync("anime_list_tio.json", JSON.stringify(tioData, null, 2));

  // Combinar y limpiar
  await unirJsonSinRepetirTitulos(animeflvData, tioData, "anime_list_total.json", log);
  eliminarArchivo("anime_list_flv.json", log);
  eliminarArchivo("anime_list_tio.json", log);

  log("[Sucess] Scraping completado.");
}

module.exports = { main };
