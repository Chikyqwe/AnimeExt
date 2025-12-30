// anim.js
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const PQueue = require("p-queue").default;
const { last } = require("./lastep");

// --------------------------------------------
// Configuración general
// --------------------------------------------
const CONFIG = {
  FLV_BASE_URL: "https://www3.animeflv.net",
  TIO_BASE_URL: "https://tioanime.com",
  ANIMEYTX_BASE_URL: "https://animeytx.com/tv/?page=",
  FLV_MAX_PAGES: 173,
  TIO_TOTAL_PAGES: 209,
  ANIMEYTX_TOTAL_PAGES: 34,
  CONCURRENT_REQUESTS: 50,
  CONCURRENT_ANIMEYTX: 40,
};

const erroresReportados = [];

// --------------------------------------------
// Utilidades
// --------------------------------------------
const registrarError = (origen, contexto, mensaje, url = null) => {
  erroresReportados.push({ origen, contexto, mensaje, url, timestamp: new Date().toISOString() });
};

const eliminarArchivo = (filePath, log = console.log) => {
  const fullPath = path.resolve(filePath);
  try {
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      log(`🗑️ Eliminado: ${fullPath}`);
    }
  } catch (err) { log(`❌ Error al eliminar ${fullPath}: ${err.message}`); }
};

const generarUnitIDExistenteOUnico = (slug, usados, unitIDsExistentes) => {
  if (unitIDsExistentes[slug]) return unitIDsExistentes[slug];
  let newId = Math.floor(Math.random() * 10000);
  while (usados.has(newId)) newId = Math.floor(Math.random() * 10000);
  usados.add(newId);
  unitIDsExistentes[slug] = newId;
  return newId;
};

const normalizarTituloConTemporada = (titulo) => {
  if (!titulo) return "";
  let norm = titulo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const match = norm.match(/\s*(?:temporada|season|saison|part)\s*(\d+)/) || norm.match(/\s*(\d+)$/);
  const num = match ? parseInt(match[1], 10) : 1;
  norm = norm.replace(/\s*(?:temporada|season|saison|part)\s*\d+/, "").replace(/\s*\d+$/, "").replace(/[^a-z0-9]/g, "");
  return norm.trim() + "-" + num;
};

const slugSimplificado = (slugOrTitle) => {
  if (!slugOrTitle) return "";
  return slugOrTitle.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
};

// --------------------------------------------
// Función principal para combinar datos
// --------------------------------------------
const UnityJsonsV4 = (datosTio, datosFlv, datosAnimeYTX, outputPath, log = console.log) => {
  log("🔗 Combinando datos de directorios...");

  const unitIDPath = path.join(__dirname, "..", "..", "data", "UnitID.json");
  let unitIDsExistentes = {};
  if (fs.existsSync(unitIDPath)) {
    try { unitIDsExistentes = JSON.parse(fs.readFileSync(unitIDPath, "utf-8")); }
    catch (err) { log(`⚠️ Error al leer UnitID.json: ${err.message}`); }
  }

  const usados = new Set(Object.values(unitIDsExistentes));
  const mapa = new Map();

  const agregarDatos = (anime, fuente) => {
    const clave = normalizarTituloConTemporada(anime.title || anime.titulo);
    const claveSlug = slugSimplificado(anime.slug || anime.title || anime.titulo);
    let existingKey = null;

    for (let [k, v] of mapa.entries()) {
      if (k === clave || slugSimplificado(v.slug || v.title) === claveSlug) {
        existingKey = k;
        break;
      }
    }

    if (existingKey) {
      const existing = mapa.get(existingKey);
      existing.sources[fuente] = anime.url || null;
      if (!existing.image && anime.image) existing.image = anime.image;
      if ((anime.title?.length || 0) > (existing.title?.length || 0) || fuente === "FLV") existing.title = anime.title;
      if (fuente === "FLV" && anime.slug) existing.slug = anime.slug;
    } else {
      const sources = { FLV: null, TIO: null, ANIMEYTX: null };
      sources[fuente] = anime.url || null;
      mapa.set(clave, {
        title: anime.title || anime.titulo,
        slug: anime.slug || null,
        image: anime.image || null,
        sources,
      });
    }
  };

  [datosFlv, datosTio, datosAnimeYTX].forEach((dataset, i) => {
    const fuente = i === 0 ? "FLV" : i === 1 ? "TIO" : "ANIMEYTX";
    dataset.forEach(a => agregarDatos(a, fuente));
  });

  const combinado = [...mapa.values()];
  const idsUsados = new Set();

  combinado.forEach((anime, index) => {
    // Generar ID aleatorio único
    let newId;
    do {
      newId = Math.floor(Math.random() * 1_000_000) + 1;
    } while (idsUsados.has(newId));
    idsUsados.add(newId);
    anime.id = newId;

    // Generar unit_id persistente
    anime.unit_id = generarUnitIDExistenteOUnico(anime.slug || anime.title, idsUsados, unitIDsExistentes);
  });


  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({
    metadata: { creado_en: new Date().toISOString(), total_animes: combinado.length },
    animes: combinado
  }, null, 2), "utf-8");

  fs.writeFileSync(unitIDPath, JSON.stringify(unitIDsExistentes, null, 2), "utf-8");
  log(`✅ JSON combinado guardado en: ${outputPath}`);
  log(`🔒 UnitID.json actualizado con ${Object.keys(unitIDsExistentes).length} unit_ids.`);
};

// --------------------------------------------
// Funciones de scraping
// --------------------------------------------
const extraerPagina = async (url, selector, mapFn, log, timeout = 10000) => {
  try {
    const { data } = await axios.get(url, { timeout });
    const $ = cheerio.load(data);
    const resultados = $(selector).map((_, el) => mapFn($(el))).get();
    $.root().remove();
    return resultados;
  } catch (err) {
    registrarError("Scraper", url, err.message, url);
    return [];
  }
};

const scrapeAnimeYTX = async (log = console.log) => {
  const queue = new PQueue({ concurrency: CONFIG.CONCURRENT_ANIMEYTX });
  const pages = Array.from({ length: CONFIG.ANIMEYTX_TOTAL_PAGES }, (_, i) =>
    queue.add(async () => {
      const url = `${CONFIG.ANIMEYTX_BASE_URL}${i + 1}`;
      log(`[AnimeYTX] Procesando página ${i + 1}`);
      return extraerPagina(url, '.listupd article.bs', el => {
        const titulo = el.find('.tt').text().trim().split('\t').map(t => t.trim()).filter(Boolean)[0] || '';
        const enlace = el.find('a').attr('href') || '';
        const slug = enlace ? enlace.split('/').filter(Boolean).pop() : '';
        const imagen = el.find('img').attr('data-src') || el.find('img').attr('src') || '';
        return titulo && slug ? { title: titulo, slug, url: enlace, image: imagen } : null;
      }, log);
    })
  );
  const resultados = await Promise.allSettled(pages);
  return resultados.filter(p => p.status === "fulfilled").flatMap(p => p.value).filter(Boolean);
};

const scrapeAnimeFLV = async (log = console.log) => {
  const queue = new PQueue({ concurrency: CONFIG.CONCURRENT_REQUESTS });
  const pages = Array.from({ length: CONFIG.FLV_MAX_PAGES }, (_, i) =>
    queue.add(async () => {
      const url = `${CONFIG.FLV_BASE_URL}/browse?page=${i + 1}`;
      log(`[FLV] Procesando página ${i + 1}`);
      return extraerPagina(url, "ul.ListAnimes.AX.Rows.A03.C02.D02 li", el => {
        const a = el.find("a[href]").first();
        const img = el.find("figure img");
        const href = a.attr("href") || "";
        const imgUrl = img.attr("src") || "";
        const titulo = img.attr("alt") || "";
        if (href.includes("/anime/")) {
          const slug = href.replace("/anime/", "").replace(/\/$/, "");
          return { slug, titulo, url: CONFIG.FLV_BASE_URL + href, image: imgUrl };
        }
        return null;
      }, log);
    })
  );
  const resultados = await Promise.allSettled(pages);
  return resultados.filter(p => p.status === "fulfilled").flatMap(p => p.value).filter(Boolean);
};

const scrapeTioAnime = async (log = console.log) => {
  const queue = new PQueue({ concurrency: CONFIG.CONCURRENT_REQUESTS });
  const pages = Array.from({ length: CONFIG.TIO_TOTAL_PAGES }, (_, i) =>
    queue.add(async () => {
      const url = `${CONFIG.TIO_BASE_URL}/directorio?p=${i + 1}`;
      log(`[TioAnime] Procesando página ${i + 1}`);
      return extraerPagina(url, "ul.animes.list-unstyled.row article.anime", el => {
        const link = el.find("a");
        const href = link.attr("href") || "";
        if (!href.includes("/anime/")) return null;
        const slug = href.replace("/anime/", "").replace(/\/$/, "");
        let img = link.find("img").attr("src") || "";
        if (img && !img.startsWith("http")) img = CONFIG.TIO_BASE_URL + img;
        const titulo = link.find("h3.title").text().trim();
        return { slug, titulo, image: img, url: CONFIG.TIO_BASE_URL + href };
      }, log);
    })
  );
  const resultados = await Promise.allSettled(pages);
  return resultados.filter(p => p.status === "fulfilled").flatMap(p => p.value).filter(Boolean);
};

// --------------------------------------------
// Filtrado
// --------------------------------------------
const filtrarAnimesValidos = (animes) => animes.filter(a => a && (a.title || a.titulo));

// --------------------------------------------
// Main
// --------------------------------------------
const main = async ({ log = console.log } = {}) => {
  log("📡 Iniciando scraping...");

  const outputPath = path.join(__dirname, "..", "..", "data", "anime_list.json");

  const tio = await scrapeTioAnime(log);
  log(`TioAnime: obtenidos ${tio.length} animes.`);

  const flv = await scrapeAnimeFLV(log);
  log(`AnimeFLV: obtenidos ${flv.length} animes.`);

  const animeYTXRaw = await scrapeAnimeYTX(log);
  const animeYTX = filtrarAnimesValidos(animeYTXRaw);
  log(`AnimeYTX: obtenidos ${animeYTX.length} animes.`);

  UnityJsonsV4(tio, flv, animeYTX, outputPath, log);

  const outReporte = path.join(__dirname, "..", "..", "data", "report_error.json");
  if (erroresReportados.length > 0) {
    fs.writeFileSync(outReporte, JSON.stringify(erroresReportados, null, 2), "utf-8");
    log(`⚠️ Errores registrados en: ${outReporte}`);
  } else {
    eliminarArchivo(outReporte, log);
  }

  await last();
  log("✅ Scraping y combinación completados.");
  process.exit(0);
};

module.exports = { main };
