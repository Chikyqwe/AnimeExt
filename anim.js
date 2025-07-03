const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const PQueue = require("p-queue").default;


const FLV_BASE_URL = "https://www3.animeflv.net";
const TIO_BASE_URL = "https://tioanime.com";
const FLV_MAX_PAGES = 173; // ajusta si hay más
const TIO_TOTAL_PAGES = 209;
const CONCURRENT_REQUESTS = 150;

function eliminarArchivos(filePaths) {
  for (const filePath of filePaths) {
    const fullPath = path.resolve(filePath);

    try {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        console.log(`🗑️ Eliminado: ${fullPath}`);
      } else {
        console.warn(`⚠️ Archivo no encontrado: ${fullPath}`);
      }
    } catch (error) {
      console.error(`❌ Error al eliminar ${fullPath}: ${error.message}`);
    }
  }
}

// Json combinados
function combinarJSONPorTitulo(file1Path, file2Path, outputPath) {
  try {
    const data1 = JSON.parse(fs.readFileSync(file1Path, 'utf8'));
    const data2 = JSON.parse(fs.readFileSync(file2Path, 'utf8'));

    const combinado = [...data1, ...data2];

    const sinDuplicados = [];
    const titulosVistos = new Set();

    for (const anime of combinado) {
      const tituloNormalizado = anime.title.trim().toLowerCase();
      if (!titulosVistos.has(tituloNormalizado)) {
        titulosVistos.add(tituloNormalizado);
        sinDuplicados.push(anime);
      }
    }

    fs.writeFileSync(outputPath, JSON.stringify(sinDuplicados, null, 2), 'utf8');
    console.log(`✅ Combinación sin duplicados por título completada. Guardado en ${outputPath}`);
    eliminarArchivos(['anime_list_flv.json','anime_list_tio.json']);

  } catch (error) {
    console.error('❌ Error al combinar archivos JSON:', error.message);
  }
}

// Extrae lista de animes de una página del directorio de TioAnime
async function extraerTioanimesDePagina(pagina, log = console.log) {
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

// Procesa un anime para obtener url, título, imagen y cantidad de episodios
async function procesarTioanime(anime, log = console.log) {
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

async function extraerFlvDePagina(pagina, log = console.log) {
  try {
    log(`[FLV][Página ${pagina}] Descargando...`);
    const url = `${FLV_BASE_URL}/browse?page=${pagina}`;
    const resp = await axios.get(url, { timeout: 10000 });
    const $ = cheerio.load(resp.data);
    const lista = $("ul.ListAnimes.AX.Rows.A03.C02.D02");
    const animes = [];

    lista.find("li").each((_, li) => {
      const a = $(li).find("a[href]").first();
      const img = $(li).find("figure img");
      const href = a.attr("href") || "";
      const imgUrl = img.attr("src") || "";
      const titulo = img.attr("alt") || "";

      if (href.includes("/anime/")) {
        const slug = href.replace("/anime/", "").replace(/\/$/, "");
        const urlAnime = FLV_BASE_URL + href;
        animes.push({ slug, titulo, url: urlAnime, img: imgUrl });
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

    // Buscar var episodes = [...]
    const match = html.match(/var episodes\s*=\s*(\[\[.*?\]\])/s);
    let episodes_count = 0;
    if (match) {
      const array = JSON.parse(match[1]);
      episodes_count = array.length;
    }

    log(`[FLV][${anime.titulo}] ${episodes_count} episodios.`);
    return {
      title: anime.titulo,
      slug: anime.slug,
      url: anime.url,
      image: anime.img,
      episodes_count,
    };
  } catch (err) {
    log(`[FLV][${anime.titulo}] Error al procesar: ${err.message}`);
    return null;
  }
}

async function fetchAnimeflvDesdeBrowse(log = console.log) {
  const queuePages = new PQueue({ concurrency: 100 });
  const queueAnimes = new PQueue({ concurrency: 100 });

  log("[FLV] Iniciando extracción de páginas...");

  const paginas = await Promise.all(
    Array.from({ length: FLV_MAX_PAGES }, (_, i) =>
      queuePages.add(() => extraerFlvDePagina(i + 1, log))
    )
  );

  const animes = paginas.flat();
  log(`[FLV] Total animes encontrados: ${animes.length}`);

  log("[FLV] Procesando episodios...");

  const detalles = await Promise.all(
    animes.map(anime =>
      queueAnimes.add(() => procesarAnimeflv(anime, log))
    )
  );

  const filtrados = detalles.filter(Boolean);
  const outputPath = path.join(__dirname, "anime_list_flv.json");
  fs.writeFileSync(outputPath, JSON.stringify(filtrados, null, 2), "utf-8");
  log(`[FLV] Datos guardados en ${outputPath}`);
}


async function main() {
  const log = console.log;
  const queuePages = new PQueue({ concurrency: CONCURRENT_REQUESTS });
  const queueAnimes = new PQueue({ concurrency: CONCURRENT_REQUESTS });

  // Descargar todas las páginas en paralelo con límite de concurrencia
  const promPages = Array.from({ length: TIO_TOTAL_PAGES }, (_, i) =>
    queuePages.add(() => extraerTioanimesDePagina(i + 1, log))
  );

  const paginas = await Promise.all(promPages);
  const todosAnimes = paginas.flat();

  log(`[Tio] Total animes extraídos: ${todosAnimes.length}`);

  // Procesar animes en paralelo con límite de concurrencia
  const promAnimes = todosAnimes.map(anime =>
    queueAnimes.add(() => procesarTioanime(anime, log))
  );

  const detalles = (await Promise.all(promAnimes)).filter(Boolean);

  // Guardar resultado en JSON
  const outputPath = path.join(__dirname, "anime_list_tio.json");
  fs.writeFileSync(outputPath, JSON.stringify(detalles, null, 2), "utf-8");
  log(`[Tio] Datos guardados en ${outputPath}`);
  await fetchAnimeflvDesdeBrowse(log);
  combinarJSONPorTitulo(
    path.join(__dirname, 'anime_list_flv.json'),
    path.join(__dirname, 'anime_list_tio.json'),
    path.join('./jsons/', 'anime_list.json')
  );

}

if (require.main === module) {
  main().catch(e => {
    console.error("Error en ejecución:", e);
    process.exit(1);
  });
}
