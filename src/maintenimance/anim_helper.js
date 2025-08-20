const axios = require("axios");
const cheerio = require("cheerio");
const PQueue = require("p-queue").default;

const BASE_URL = "https://vww.animeflv.one";
const IMAGE_BASE = `${BASE_URL}/cdn/img/anime`;

const DEFAULTS = {
  maxPages: 277,
  listConcurrency: 30,
  detailWorkers: 50,
  detailConcurrency: 1200,
};

function crearScraper(options = {}) {
  const {
    maxPages,
    listConcurrency,
    detailWorkers,
    detailConcurrency,
  } = { ...DEFAULTS, ...options };

  const listQueue = new PQueue({ concurrency: listConcurrency });
  const errores = [];

  async function fetchPage(page) {
    const url = `${BASE_URL}/animes?pag=${page}`;
    try {
      const { data: html } = await axios.get(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 15000,
      });
      const $ = cheerio.load(html);
      const data = [];

      $(".ul.x6 article.li").each((i, el) => {
        const title = $(el).find("h3.h a").text().trim();

        let relativeUrl = $(el).find("h3.h a").attr("href") || "";
        if (relativeUrl.startsWith("./")) relativeUrl = relativeUrl.replace("./", "/");
        const fullUrl = BASE_URL + relativeUrl;

        const slug = relativeUrl.split("/").pop();

        let image = $(el).find("a > img").attr("src") || "";
        if (image.startsWith("./")) image = BASE_URL + image.replace("./", "/");
        else if (image.startsWith("/")) image = BASE_URL + image;

        if (!image || image === `${BASE_URL}/cdn/img/anime.png` || !image.endsWith(".webp")) {
          image = `${IMAGE_BASE}/${slug}.webp`;
        }

        const alt = $(el).find("a > img").attr("alt") || title;

        data.push({ title, url: fullUrl, image, alt });
      });

      return data;
    } catch (err) {
      errores.push({
        tipo: "fetchPage",
        pagina: page,
        mensaje: err.message,
        timestamp: new Date().toISOString(),
      });
      return [];
    }
  }

  async function fetchEpisodes(anime) {
    try {
      const { data: html } = await axios.get(anime.url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 15000,
      });
      const $ = cheerio.load(html);

      let epsScript = "";
      $(".info-r.episodes script").each((i, el) => {
        const scriptText = $(el).html();
        if (scriptText.includes("var eps =")) {
          epsScript = scriptText;
        }
      });

      let episodes = 0;

      if (epsScript) {
        const match = epsScript.match(/var eps = (\[.*?\]);/s);
        if (match && match[1]) {
          try {
            const epsArray = JSON.parse(match[1]);
            epsArray.sort((a, b) => Number(a[0]) - Number(b[0]));
            episodes = epsArray.length > 0 ? Number(epsArray[epsArray.length - 1][0]) : 0;
          } catch (e) {
            errores.push({
              tipo: "parseEpisodes",
              anime: anime.title,
              url: anime.url,
              mensaje: "Error parseando JSON eps",
              timestamp: new Date().toISOString(),
            });
          }
        }
      } else {
        errores.push({
          tipo: "noEpisodesFound",
          anime: anime.title,
          url: anime.url,
          mensaje: "No se encontró lista de episodios",
          timestamp: new Date().toISOString(),
        });
      }

      return { ...anime, episodes };
    } catch (err) {
      errores.push({
        tipo: "fetchEpisodes",
        anime: anime.title,
        url: anime.url,
        mensaje: err.message,
        timestamp: new Date().toISOString(),
      });
      return { ...anime, episodes: 0 };
    }
  }

  async function runScraper() {
    console.log(`[eafo] Iniciando scraping de ${maxPages} páginas...`);

    const pageTasks = [];
    for (let i = 1; i <= maxPages; i++) {
      pageTasks.push(listQueue.add(() => fetchPage(i)));
    }

    const pagesResults = await Promise.all(pageTasks);
    const allAnimes = pagesResults.flat();

    console.log(`[eafo] Se obtuvieron ${allAnimes.length} animes.`);

    const detailedAnimes = [];
    let processedCount = 0;
    let currentIndex = 0;

    const detailWorkersArr = [];
    for (let w = 0; w < detailWorkers; w++) {
      detailWorkersArr.push((async () => {
        while (true) {
          let anime;
          if (currentIndex < allAnimes.length) {
            anime = allAnimes[currentIndex];
            currentIndex++;
          } else {
            break;
          }
          try {
            const det = await fetchEpisodes(anime);
            if (det) {
              detailedAnimes.push(det);
              processedCount++;
              console.log(`[eafo] [${processedCount}/${allAnimes.length}] ${det.title || "sin título"} - ${det.episodes} episodios.`);
            } else {
              processedCount++;
              console.log(`[eafo] [${processedCount}/${allAnimes.length}] Anime sin datos (null).`);
            }
          } catch (e) {
            errores.push({
              tipo: "workerError",
              mensaje: e.message,
              timestamp: new Date().toISOString(),
              anime: anime?.title || "unknown",
            });
          }
        }
      })());
    }

    await Promise.all(detailWorkersArr);

    console.log("[eafo] Scraping terminado.");

    return detailedAnimes;
  }

  return {
    runScraper,
    errores,
  };
}

module.exports = { crearScraper };
