const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const PQueue = require("p-queue").default;

const FLV_BASE_URL = "https://www3.animeflv.net";
const TIO_BASE_URL = "https://tioanime.com";
const FLV_MAX_PAGES = 173;
const TIO_TOTAL_PAGES = 209;
const CONCURRENT_REQUESTS = 150;

function eliminarArchivo(filePath, log = console.log) {
  const fullPath = path.resolve(filePath);
  try {
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      log(`🗑️ Eliminado: ${fullPath}`);
    }
  } catch (err) {
    log(`❌ Error al eliminar ${fullPath}: ${err.message}`);
  }
}

function normalizarTitulo(titulo) {
  return titulo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function combinarJSONPorTitulo(datos1, datos2, outputPath, log = console.log) {
  const mapa = new Map();

  for (const anime of [...datos1, ...datos2]) {
    const clave = normalizarTitulo(anime.title);
    if (!mapa.has(clave)) {
      mapa.set(clave, anime);
    } else {
      const actual = mapa.get(clave);
      if ((anime.episodes_count || 0) > (actual.episodes_count || 0)) {
        mapa.set(clave, anime);
      }
    }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify([...mapa.values()], null, 2), "utf-8");
  log(`✅ JSON combinado guardado en: ${outputPath}`);
}

async function extraerTioanimesDePagina(pagina, log = console.log) {
  try {
    const url = `${TIO_BASE_URL}/directorio?p=${pagina}`;
    log(`[Tio][Página ${pagina}] Descargando...`);
    const resp = await axios.get(url, { timeout: 10000 });
    const $ = cheerio.load(resp.data);
    const animes = [];

    $("ul.animes.list-unstyled.row article.anime").each((_, article) => {
      const href = $(article).find("a").attr("href") || "";
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

async function procesarTioanime(anime, log = console.log) {
  try {
    const url = `${TIO_BASE_URL}/anime/${anime.slug}`;
    const resp = await axios.get(url, { timeout: 10000 });
    const html = resp.data;
    const match = html.match(/var episodes\s*=\s*(\[[^\]]*\])/);
    const episodesCount = match ? JSON.parse(match[1]).length : 0;

    const $ = cheerio.load(html);
    const title = $("h1.title").first().text().trim() || anime.titulo;
    const imgUrl = $("aside img").first().attr("src") || "";
    const image = imgUrl ? TIO_BASE_URL + imgUrl : "";

    log(`[Tio][${anime.titulo}] ${episodesCount} episodios.`);
    return { url, title, image, episodes_count: episodesCount };
  } catch (err) {
    log(`[Tio][${anime.titulo}] Error: ${err.message}`);
    return null;
  }
}

async function extraerFlvDePagina(pagina, log = console.log) {
  try {
    const url = `${FLV_BASE_URL}/browse?page=${pagina}`;
    log(`[FLV][Página ${pagina}] Descargando...`);
    const resp = await axios.get(url, { timeout: 10000 });
    const $ = cheerio.load(resp.data);
    const animes = [];

    $("ul.ListAnimes.AX.Rows.A03.C02.D02 li").each((_, li) => {
      const a = $(li).find("a[href]").first();
      const img = $(li).find("figure img");
      const href = a.attr("href") || "";
      const imgUrl = img.attr("src") || "";
      const titulo = img.attr("alt") || "";

      if (href.includes("/anime/")) {
        const slug = href.replace("/anime/", "").replace(/\/$/, "");
        animes.push({
          slug,
          titulo,
          url: FLV_BASE_URL + href,
          image: imgUrl
        });
      }
    });

    log(`[FLV][Página ${pagina}] ${animes.length} animes.`);
    return animes;
  } catch (err) {
    log(`[FLV][Página ${pagina}] Error: ${err.message}`);
    return [];
  }
}

async function procesarAnimeflv(anime, log = console.log) {
  try {
    const resp = await axios.get(anime.url, { timeout: 10000 });
    const html = resp.data;
    const match = html.match(/var episodes\s*=\s*(\[\[.*?\]\])/s);
    const episodes_count = match ? JSON.parse(match[1]).length : 0;

    log(`[FLV][${anime.titulo}] ${episodes_count} episodios.`);
    return {
      title: anime.titulo,
      slug: anime.slug,
      url: anime.url,
      image: anime.image,
      episodes_count
    };
  } catch (err) {
    log(`[FLV][${anime.titulo}] Error al procesar: ${err.message}`);
    return null;
  }
}

async function scrapeTioAnime(log = console.log) {
  const queuePages = new PQueue({ concurrency: CONCURRENT_REQUESTS });
  const queueAnimes = new PQueue({ concurrency: CONCURRENT_REQUESTS });

  const paginas = await Promise.all(
    Array.from({ length: TIO_TOTAL_PAGES }, (_, i) =>
      queuePages.add(() => extraerTioanimesDePagina(i + 1, log))
    )
  );
  const todos = paginas.flat();
  const detalles = await Promise.all(
    todos.map(anime => queueAnimes.add(() => procesarTioanime(anime, log)))
  );
  return detalles.filter(Boolean);
}

async function scrapeAnimeFLV(log = console.log) {
  const queuePages = new PQueue({ concurrency: CONCURRENT_REQUESTS });
  const queueAnimes = new PQueue({ concurrency: CONCURRENT_REQUESTS });

  const paginas = await Promise.all(
    Array.from({ length: FLV_MAX_PAGES }, (_, i) =>
      queuePages.add(() => extraerFlvDePagina(i + 1, log))
    )
  );
  const todos = paginas.flat();
  const detalles = await Promise.all(
    todos.map(anime => queueAnimes.add(() => procesarAnimeflv(anime, log)))
  );
  return detalles.filter(Boolean);
}

async function main({ log = console.log } = {}) {
  log("📡 Iniciando scraping...");
  const [tio, flv] = await Promise.all([
    scrapeTioAnime(log),
    scrapeAnimeFLV(log)
  ]);

  const outTio = path.join(__dirname, "anime_list_tio.json");
  const outFlv = path.join(__dirname, "anime_list_flv.json");
  const outFinal = path.join(__dirname, "jsons", "anime_list.json");

  fs.writeFileSync(outTio, JSON.stringify(tio, null, 2), "utf-8");
  fs.writeFileSync(outFlv, JSON.stringify(flv, null, 2), "utf-8");

  combinarJSONPorTitulo(tio, flv, outFinal, log);
  eliminarArchivo(outTio, log);
  eliminarArchivo(outFlv, log);

  log("✅ Scraping y combinación completados.");
}

module.exports = {
  main,
  scrapeTioAnime,
  scrapeAnimeFLV,
  combinarJSONPorTitulo,
  eliminarArchivo
};
