// anim.js
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const PQueue = require("p-queue").default;
const vm = require("vm");
const { slowAES } = require("../utils/aes");
const { last } = require('./lastep');

// --------------------------------------------
// Configuración general
// --------------------------------------------
const FLV_BASE_URL = "https://www3.animeflv.net";
const TIO_BASE_URL = "https://tioanime.com";
const ANIMEYTX_BASE_URL = "https://animeytx.com/tv/?page=";

const FLV_MAX_PAGES = 173;
const TIO_TOTAL_PAGES = 209;
const ANIMEYTX_TOTAL_PAGES = 34;

const CONCURRENT_REQUESTS = 50;
const CONCURRENT_ANIMEYTX = 40;

const erroresReportados = [];

// --------------------------------------------
// Utilidades
// --------------------------------------------
function registrarError(origen, contexto, mensaje, url = null) {
  erroresReportados.push({
    origen, contexto, mensaje, url,
    timestamp: new Date().toISOString(),
  });
}

function eliminarArchivo(filePath, log = console.log) {
  const fullPath = path.resolve(filePath);
  try {
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      log(`🗑️ Eliminado: ${fullPath}`);
    }
  } catch (err) { log(`❌ Error al eliminar ${fullPath}: ${err.message}`); }
}

function generarUnitIDExistenteOUnico(slug, usados, unitIDsExistentes) {
  if (unitIDsExistentes[slug]) {
    return unitIDsExistentes[slug];
  }
  let newId = Math.floor(Math.random() * 10000);
  while (usados.has(newId)) {
    newId = Math.floor(Math.random() * 10000);
  }
  usados.add(newId);
  unitIDsExistentes[slug] = newId;
  return newId;
}

function normalizarTituloConTemporada(titulo) {
  if (!titulo) return "";
  let normalizado = titulo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const match = normalizado.match(/\s*(?:temporada|season|saison|part)\s*(\d+)/) || normalizado.match(/\s*(\d+)$/);
  const numeroTemporada = match ? parseInt(match[1], 10) : 1;
  normalizado = normalizado.replace(/\s*(?:temporada|season|saison|part)\s*\d+/, "");
  normalizado = normalizado.replace(/\s*\d+$/, "");
  normalizado = normalizado.replace(/[^a-z0-9]/g, "");
  return normalizado.trim() + "-" + numeroTemporada;
}

function slugSimplificado(slugOrTitle) {
  if (!slugOrTitle) return "";
  return slugOrTitle
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
}
function normalizarAnime(anime, sourceUrl = null) {
  return {
    title: anime.title || anime.titulo || "",
    slug: anime.slug || (anime.url ? anime.url.split("/").filter(Boolean).pop() : ""),
    url: sourceUrl || anime.url || null,
    image: anime.image || null,
    episodes_count: anime.episodes_count || 0,
    status: anime.status || "En emisión",
    next_episode_date: anime.next_episode_date || null
  };
}

function UnityJsonsV4(datosTio, datosFlv, datosAnimeYTX, outputPath, log = console.log) {
  console.log("🔗 Combinando datos de múltiples fuentes...");
  console.log(`TioAnime: ${datosTio.length} animes, AnimeFLV: ${datosFlv.length} animes, AnimeYTX: ${datosAnimeYTX.length} animes.`);
  const unitIDPath = path.join(__dirname, "..", "..", "data", "UnitID.json");
  let unitIDsExistentes = {};
  if (fs.existsSync(unitIDPath)) {
    try {
      unitIDsExistentes = JSON.parse(fs.readFileSync(unitIDPath, "utf-8"));
    } catch (err) {
      log(`⚠️ Error al leer UnitID.json: ${err.message}`);
    }
  }
  const usados = new Set(Object.values(unitIDsExistentes));
  const mapa = new Map();

  function agregarDatos(anime, fuente) {
    let clave = normalizarTituloConTemporada(anime.title || anime.titulo);
    const claveSlug = slugSimplificado(anime.slug || anime.title || anime.titulo);
    let existingKey = null;
    for (let [k, v] of mapa.entries()) {
      const existingSlug = slugSimplificado(v.slug || v.title);
      if (k === clave || existingSlug === claveSlug) {
        existingKey = k;
        break;
      }
    }

    if (existingKey) {
      const existing = mapa.get(existingKey);
      existing.sources[fuente] = anime.url || null;
      existing.episodes_count = Math.max(existing.episodes_count || 0, anime.episodes_count || 0);
      if (anime.status && (!existing.status || (existing.status === "En emisión" && anime.status === "Finalizado"))) {
        existing.status = anime.status;
      }
      if (anime.next_episode_date) {
        existing.next_episode_date = anime.next_episode_date;
      }
      if (!existing.image && anime.image) {
        existing.image = anime.image;
      } else if (fuente === "FLV" && anime.image) {
        existing.image = anime.image;
      }
      if ((anime.title?.length || 0) > (existing.title?.length || 0) || (fuente === "FLV" && anime.title)) {
        existing.title = anime.title;
      }
      if (fuente === "FLV" && anime.slug) {
        existing.slug = anime.slug;
      }
    } else {
      const sources = { FLV: null, TIO: null, ANIMEYTX: null };
      sources[fuente] = anime.url || null;
      mapa.set(clave, {
        title: anime.title || anime.titulo,
        slug: anime.slug || null,
        image: anime.image || null,
        episodes_count: anime.episodes_count || 0,
        status: anime.status || null,
        next_episode_date: anime.next_episode_date || null,
        sources,
      });
    }
  }

  datosFlv.forEach(a => agregarDatos(a, "FLV"));
  datosTio.forEach(a => agregarDatos(a, "TIO"));
  datosAnimeYTX.forEach(a => agregarDatos(a, "ANIMEYTX"));

  const combinado = [...mapa.values()];
  combinado.forEach((anime, index) => {
    anime.id = index + 1;
    anime.unit_id = generarUnitIDExistenteOUnico(anime.slug || anime.title, usados, unitIDsExistentes);
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const resultadoFinal = {
    metadata: { creado_en: new Date().toISOString(), total_animes: combinado.length },
    animes: combinado
  };
  fs.writeFileSync(outputPath, JSON.stringify(resultadoFinal, null, 2), "utf-8");
  fs.writeFileSync(unitIDPath, JSON.stringify(unitIDsExistentes, null, 2), "utf-8");
  log(`✅ JSON combinado guardado en: ${outputPath}`);
  log(`🔒 UnitID.json actualizado con ${Object.keys(unitIDsExistentes).length} slugs.`);
}

// --------------------------------------------
// AnimeYTX
// --------------------------------------------
async function extraerAnimeYTXDePagina(page, log = console.log) {
  const url = `${ANIMEYTX_BASE_URL}${page}`;
  try {
    const { data: html } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    console.log(`[AnimeYTX] Procesando página ${page}`);
    const $ = cheerio.load(html);
    const animes = [];
    $('.listupd article.bs').each((_, el) => {
      let titulo = $(el).find('.tt').text().trim();
      titulo = titulo.split('\t').map(t => t.trim()).filter(Boolean)[0] || '';
      const enlace = $(el).find('a').attr('href') || '';
      const slug = enlace ? enlace.split('/').filter(Boolean).pop() : '';
      const imgEl = $(el).find('img');
      const imagen = imgEl.attr('data-src') || imgEl.attr('src') || '';
      if (titulo && slug) {
        animes.push({ title: titulo, slug, url: enlace, image: imagen });
      }
    });
    log(`[AnimeYTX][Página ${page}] ${animes.length} animes.`);
    return animes;
  } catch (err) {
    registrarError("AnimeYTX", `Página ${page}`, err.message, url);
    return [];
  }
}

async function procesarAnimeYTX(anime, log = console.log) {
  const url = anime.url;
  try {
    const { data: html } = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(html);
    const episodes_count = $('.episodios li').length;
    const status = $('.infox .status').text().includes('Finalizado') ? 'Finalizado' : 'En emisión';
    return {
      title: anime.title,
      slug: anime.slug,
      url,
      image: anime.image,
      episodes_count,
      status,
      next_episode_date: null
    };
  } catch (err) {
    registrarError("AnimeYTX", `anime:${anime.title}`, err.message, url);
    return null;
  }
}

async function scrapeAnimeYTX(log = console.log, existingAnimes = {}) {
  const queuePages = new PQueue({ concurrency: CONCURRENT_ANIMEYTX });
  const queueAnimes = new PQueue({ concurrency: 8 });

  const paginas = await Promise.allSettled(
    Array.from({ length: ANIMEYTX_TOTAL_PAGES }, (_, i) => queuePages.add(() => extraerAnimeYTXDePagina(i + 1, log)))
  );

  const todos = paginas.filter(p => p.status === "fulfilled").flatMap(p => p.value);

  const promesas = todos.map(anime => {
    const existing = existingAnimes[anime.slug];
    if (existing && existing.status === "Finalizado") {
      log(`[AnimeYTX] ⏩ Saltando anime finalizado: ${anime.title}`);
      return Promise.resolve(normalizarAnime({
        ...existing,
        url: anime.url
      }));
    } else {
      return queueAnimes.add(async () => {
        const proc = await procesarAnimeYTX(anime, log);
        return normalizarAnime(proc);
      });
    }
  });

  const detalles = await Promise.allSettled(promesas);
  return detalles.filter(d => d.status === "fulfilled" && d.value).map(d => d.value);
}

// --------------------------------------------
// AnimeFLV
// --------------------------------------------
async function extraerFlvDePagina(pagina, log = console.log) {
  const url = `${FLV_BASE_URL}/browse?page=${pagina}`;
  try {
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
        animes.push({ slug, titulo, url: FLV_BASE_URL + href, image: imgUrl });
      }
    });
    log(`[FLV][Página ${pagina}] ${animes.length} animes.`);
    return animes;
  } catch (err) { registrarError("FLV", `Página ${pagina}`, err.message, url); return []; }
}

async function procesarAnimeflv(anime, log = console.log) {
  try {
    const resp = await axios.get(anime.url, { timeout: 10000 });
    const html = resp.data;
    const episodesMatch = html.match(/var episodes\s*=\s*(\[\[.*?\]\])/s);
    const episodes_count = episodesMatch ? JSON.parse(episodesMatch[1]).length : 0;
    const animeInfoMatch = html.match(/var anime_info\s*=\s*(\[[^\]]+\]);/);
    let animeInfo = [];
    if (animeInfoMatch && animeInfoMatch[1]) { try { animeInfo = vm.runInNewContext(animeInfoMatch[1]); } catch (e) { log(`[FLV][${anime.titulo}] Error: ${e.message}`); } }
    let estado = "Finalizado";
    let proximo_episodio = null;
    if (animeInfo.length === 4) { estado = "En emisión"; proximo_episodio = animeInfo[3]; }
    return { title: anime.titulo, slug: anime.slug, url: anime.url, image: anime.image, episodes_count, status: estado, next_episode_date: proximo_episodio };
  } catch (err) { registrarError("FLV", `anime:${anime.titulo}`, err.message, anime.url); return null; }
}

async function scrapeAnimeFLV(log = console.log, existingAnimes = {}) {
  const queuePages = new PQueue({ concurrency: CONCURRENT_REQUESTS });
  const queueAnimes = new PQueue({ concurrency: CONCURRENT_REQUESTS });

  const paginas = await Promise.allSettled(
    Array.from({ length: FLV_MAX_PAGES }, (_, i) => queuePages.add(() => extraerFlvDePagina(i + 1, log)))
  );

  const todos = paginas.filter(p => p.status === "fulfilled").flatMap(p => p.value);

  const promesas = todos.map(anime => {
    const existing = existingAnimes[anime.slug];
    if (existing && existing.status === "Finalizado") {
      log(`[FLV] ⏩ Saltando anime finalizado: ${anime.titulo}`);
      return Promise.resolve(normalizarAnime({
        ...existing,
        url: anime.url
      }));
    } else {
      return queueAnimes.add(async () => {
        const proc = await procesarAnimeflv(anime, log);
        return normalizarAnime(proc);
      });
    }
  });

  const detalles = await Promise.allSettled(promesas);
  return detalles.filter(d => d.status === "fulfilled" && d.value).map(d => d.value);
}


// --------------------------------------------
// TioAnime
// --------------------------------------------
async function extraerTioanimesDePagina(pagina, log = console.log) {
  const url = `${TIO_BASE_URL}/directorio?p=${pagina}`;
  console.log(`[TioAnime] Extrayendo página ${pagina}`);
  try {
    const resp = await axios.get(url, { timeout: 20000 });
    const $ = cheerio.load(resp.data);
    const animes = [];
    $("ul.animes.list-unstyled.row article.anime").each((_, article) => {
      const link = $(article).find("a");
      const href = link.attr("href") || "";
      if (href.includes("/anime/")) {
        const slug = href.replace("/anime/", "").replace(/\/$/, "");
        const titulo = link.find("h3.title").text().trim();
        let img = link.find("img").attr("src") || "";
        if (img && !img.startsWith("http")) img = TIO_BASE_URL + img;
        animes.push({ slug, titulo, image: img, url: TIO_BASE_URL + href });
      }
    });
    return animes;
  } catch (e) {
    registrarError("TioAnime", `Página ${pagina}`, e.message, url);
    return [];
  }
}

async function procesarTioanime(anime, log = console.log) {
  const url = `${TIO_BASE_URL}/anime/${anime.slug}`;
  console.log(`[TioAnime] Procesando anime: ${anime.titulo}`);
  try {
    const resp = await axios.get(url, { timeout: 10000 });
    const html = resp.data;
    const matchEpisodes = html.match(/var episodes\s*=\s*(\[[^\]]*\])/);
    const episodes_count = matchEpisodes ? JSON.parse(matchEpisodes[1]).length : 0;
    const animeInfoMatch = html.match(/var anime_info\s*=\s*(\[[^\]]*\]);/);
    let estado = "Finalizado";
    let proximo_episodio = null;
    if (animeInfoMatch && animeInfoMatch[1]) {
      try {
        const animeInfo = vm.runInNewContext(animeInfoMatch[1]);
        if (animeInfo.length === 4) {
          estado = "En emisión";
          proximo_episodio = animeInfo[3];
        }
      } catch (e) { log(`[TioAnime][${anime.titulo}] Error anime_info: ${e.message}`); }
    }
    return {
      title: anime.titulo,
      slug: anime.slug,
      url,
      image: anime.image || null,
      episodes_count,
      status: estado,
      next_episode_date: proximo_episodio
    };
  } catch (e) {
    registrarError("TioAnime", `anime:${anime.titulo}`, e.message, url);
    return null;
  }
}

async function scrapeTioAnime(log = console.log, existingAnimes = {}) {
  const queuePages = new PQueue({ concurrency: CONCURRENT_REQUESTS });
  const queueAnimes = new PQueue({ concurrency: CONCURRENT_REQUESTS });

  const paginas = await Promise.allSettled(
    Array.from({ length: TIO_TOTAL_PAGES }, (_, i) => queuePages.add(() => extraerTioanimesDePagina(i + 1, log)))
  );

  const todos = paginas.filter(p => p.status === "fulfilled").flatMap(p => p.value);

  const promesas = todos.map(anime => {
    const existing = existingAnimes[anime.slug];
    if (existing && existing.status === "Finalizado") {
      log(`[TioAnime] ⏩ Saltando anime finalizado: ${anime.titulo}`);
      return Promise.resolve(normalizarAnime({
        ...existing,
        url: `${TIO_BASE_URL}/anime/${anime.slug}`
      }));
    } else {
      return queueAnimes.add(async () => {
        const proc = await procesarTioanime(anime, log);
        return normalizarAnime(proc);
      });
    }
  });

  const detalles = await Promise.allSettled(promesas);
  return detalles.filter(d => d.status === "fulfilled" && d.value).map(d => d.value);
}


// --------------------------------------------
// Filtrado de animes válidos
// --------------------------------------------
function filtrarAnimesValidos(animes) { return animes.filter(a => a && a.title && typeof a.title === "string" && a.title.trim() !== ""); }

// --------------------------------------------
// Main
// --------------------------------------------
async function main({ log = console.log } = {}) {
  log("📡 Iniciando scraping...");
  const outputPath = path.join(__dirname, "..", "..", "data", "anime_list.json");
  let existingAnimes = {};
  try {
    if (fs.existsSync(outputPath)) {
      const data = fs.readFileSync(outputPath, "utf-8");
      const json = JSON.parse(data);
      if (json.animes) {
        json.animes.forEach(anime => {
          if (anime.slug) {
            existingAnimes[anime.slug] = anime;
          }
        });
      }
    }
  } catch (e) {
    log(`⚠️ Error al cargar JSON existente: ${e.message}`);
  }
  // ----------------------------
  // Scraping TioAnime
  // ----------------------------
  log(">> Iniciando TioAnime...");
  const tioRaw = await scrapeTioAnime(log, existingAnimes);
  const tio = filtrarAnimesValidos(tioRaw);
  log(`TioAnime: obtenidos ${tio.length} animes.`);

  // ----------------------------
  // Scraping AnimeFLV
  // ----------------------------
  log(">> Iniciando AnimeFLV...");
  const flvRaw = await scrapeAnimeFLV(log, existingAnimes);
  const flv = filtrarAnimesValidos(flvRaw);
  log(`AnimeFLV: obtenidos ${flv.length} animes.`);

  // ----------------------------
  // Scraping AnimeYTX
  // ----------------------------
  log(">> Iniciando AnimeYTX...");
  const animeYTXRaw = await scrapeAnimeYTX(log, existingAnimes);
  const animeYTX = filtrarAnimesValidos(animeYTXRaw);
  log(`AnimeYTX: obtenidos ${animeYTX.length} animes.`);

  // ----------------------------
  // Generar JSON combinado
  // ----------------------------
  UnityJsonsV4(tio, flv, animeYTX, outputPath, log);
  log(`✅ JSON combinado generado en: ${outputPath}`);

  // ----------------------------
  // Ejecutar última función y reportar errores
  // ----------------------------
  await last();

  const outReporte = path.join(__dirname, "..", "..", "data", "report_error.json");
  if (erroresReportados.length > 0) {
    fs.writeFileSync(outReporte, JSON.stringify(erroresReportados, null, 2), "utf-8");
    log(`⚠️ Errores registrados en: ${outReporte}`);
  } else {
    eliminarArchivo(outReporte, log);
  }

  log("✅ Scraping y combinación completados.");
  process.exit(0);
}

main();