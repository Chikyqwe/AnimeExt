// anim.js
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const PQueue = require("p-queue").default;
const vm = require("vm");
const { slowAES } = require("../utils/aes"); // asegúrate de tener esta función
const { last } = require('./lastep');

// --------------------------------------------
// Configuración general
// --------------------------------------------
const FLV_BASE_URL = "https://www3.animeflv.net";
const TIO_BASE_URL = "https://tioanime.com";
const ANIMEYTX_BASE_URL = "https://animeytx.com/ver/?page=";

const FLV_MAX_PAGES = 173;
const TIO_TOTAL_PAGES = 209;
const ANIMEYTX_TOTAL_PAGES = 34;

const CONCURRENT_REQUESTS = 50;
const CONCURRENT_ANIMEYTX = 9;

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

function normalizarTitulo(titulo) {
  return titulo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function generarUnitIDExistenteOUnico(slug, usados, existentes) {
  if (existentes[slug]) return existentes[slug];
  let nuevoID;
  do { nuevoID = Math.floor(1000 + Math.random() * 9000); } while (usados.has(nuevoID));
  usados.add(nuevoID);
  existentes[slug] = nuevoID;
  return nuevoID;
}

// --------------------------------------------
// Función para combinar todos los sources
// --------------------------------------------
function combinarJSONPorTituloV3(datosTio, datosFlv, datosAnimeYTX, outputPath, log = console.log) {
  const unitIDPath = path.join(__dirname, "..", "..", "data", "UnitID.json");
  let unitIDsExistentes = {};
  if (fs.existsSync(unitIDPath)) {
    try { unitIDsExistentes = JSON.parse(fs.readFileSync(unitIDPath, "utf-8")); } catch (err) { log(`⚠️ Error al leer UnitID.json: ${err.message}`); }
  }
  const usados = new Set(Object.values(unitIDsExistentes));
  const mapa = new Map();

  function agregarDatos(anime, fuente) {
    const clave = normalizarTitulo(anime.title || anime.titulo);
    if (mapa.has(clave)) {
      const existing = mapa.get(clave);
      existing.sources[fuente] = anime.url || null;
      if ((anime.episodes_count || 0) > (existing.episodes_count || 0)) existing.episodes_count = anime.episodes_count;
      if (anime.status && existing.status !== "En emisión") existing.status = anime.status;
      if (anime.next_episode_date) existing.next_episode_date = anime.next_episode_date;
    } else {
      const sources = { FLV: null, TIO: null, ANIMEYTX: null };
      sources[fuente] = anime.url || null;
      mapa.set(clave, {
        title: anime.title || anime.titulo,
        slug: anime.slug,
        image: anime.image,
        episodes_count: anime.episodes_count,
        status: anime.status,
        next_episode_date: anime.next_episode_date,
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
    anime.unit_id = generarUnitIDExistenteOUnico(anime.slug, usados, unitIDsExistentes);
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const resultadoFinal = { metadata: { creado_en: new Date().toISOString(), total_animes: combinado.length }, animes: combinado };
  fs.writeFileSync(outputPath, JSON.stringify(resultadoFinal, null, 2), "utf-8");
  fs.writeFileSync(unitIDPath, JSON.stringify(unitIDsExistentes, null, 2), "utf-8");

  log(`✅ JSON combinado guardado en: ${outputPath}`);
  log(`🔒 UnitID.json actualizado con ${Object.keys(unitIDsExistentes).length} slugs.`);
}

// --------------------------------------------
// AnimeYTX - Manejo de cookie y scraping
// --------------------------------------------
function toNumbers(d) { const e = []; d.replace(/(..)/g, m => e.push(parseInt(m,16))); return e; }
function toHex(arr) { return arr.map(v => (v<16?'0':'')+v.toString(16)).join('').toLowerCase(); }

async function obtenerCookieAnimeYTX(urlPagina) {
  try {
    const { data: htmlCookie } = await axios.get(`https://animeext.xo.je/get_html.php?url=${encodeURIComponent(urlPagina)}`, { headers: { 'User-Agent':'Mozilla/5.0' } });
    const match = htmlCookie.match(/toNumbers\("([0-9a-f]+)"\).*toNumbers\("([0-9a-f]+)"\).*toNumbers\("([0-9a-f]+)"\)/s);
    if (!match) return null;
    const a = toNumbers(match[1]), b = toNumbers(match[2]), c = toNumbers(match[3]);
    return toHex(slowAES.decrypt(c, 2, a, b));
  } catch (e) { registrarError("AnimeYTX","obtenerCookie",e.message,urlPagina); return null; }
}

async function obtenerHtmlConCookieAnimeYTX(urlPagina, cookieVal) {
  const headers = { 'User-Agent':'Mozilla/5.0' };
  if(cookieVal) headers['Cookie']=`__test=${cookieVal}`;
  const { data: html } = await axios.get(`https://animeext.unaux.com/get_html.php?url=${encodeURIComponent(urlPagina)}`, { headers });
  return html;
}

async function extraerAnimeYTXDePagina(page, cookieVal, log = console.log) {
  const url = `${ANIMEYTX_BASE_URL}${page}`;
  try {
    const html = await obtenerHtmlConCookieAnimeYTX(url, cookieVal);
    const $ = cheerio.load(html);
    const animes = [];

    $('.listupd article.bs').each((_, el) => {
      let titulo = $(el).find('.tt').text().trim();
      titulo = titulo.split('\t').map(t => t.trim()).filter(Boolean)[0] || '';

      const enlace = $(el).find('a').attr('href') || '';
      const slug = enlace ? enlace.split('/').filter(Boolean).pop() : '';

      const imgEl = $(el).find('img');
      const imagen = imgEl.attr('data-src') || imgEl.attr('src') || '';

      const estado = $(el).find('.status').text().trim();
      const tipo = $(el).find('.typez').text().trim();

      if (titulo && slug) {
        animes.push({ title: titulo, slug, url: enlace, image: imagen, status: estado, tipo });
      }
    });

    log(`[AnimeYTX][Página ${page}] ${animes.length} animes.`);
    return animes;
  } catch (err) {
    registrarError("AnimeYTX", `Página ${page}`, err.message, url);
    return [];
  }
}

async function scrapeAnimeYTX(cookieVal, log = console.log) {
  const queue = new PQueue({ concurrency: CONCURRENT_ANIMEYTX });
  const promesas = Array.from(
    { length: ANIMEYTX_TOTAL_PAGES },
    (_, i) => queue.add(() => extraerAnimeYTXDePagina(i + 1, cookieVal, log))
  );

  const paginas = await Promise.all(promesas);
  return paginas.flat().filter(a => a && a.title && a.slug);
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
      if(href.includes("/anime/")) {
        const slug = href.replace("/anime/","").replace(/\/$/,"");
        animes.push({ slug, titulo, url: FLV_BASE_URL+href, image: imgUrl });
      }
    });
    log(`[FLV][Página ${pagina}] ${animes.length} animes.`);
    return animes;
  } catch(err){ registrarError("FLV",`Página ${pagina}`,err.message,url); return []; }
}

async function procesarAnimeflv(anime, log = console.log) {
  try {
    const resp = await axios.get(anime.url,{timeout:10000});
    const html = resp.data;
    const episodesMatch = html.match(/var episodes\s*=\s*(\[\[.*?\]\])/s);
    const episodes_count = episodesMatch? JSON.parse(episodesMatch[1]).length:0;
    const animeInfoMatch = html.match(/var anime_info\s*=\s*(\[[^\]]+\]);/);
    let animeInfo = [];
    if(animeInfoMatch && animeInfoMatch[1]){ try{ animeInfo=vm.runInNewContext(animeInfoMatch[1]); }catch(e){log(`[FLV][${anime.titulo}] Error: ${e.message}`);}}
    let estado = "Finalizado";
    let proximo_episodio = null;
    if(animeInfo.length===4){estado="En emisión"; proximo_episodio=animeInfo[3];}
    return { title: anime.titulo, slug: anime.slug, url: anime.url, image: anime.image, episodes_count, status: estado, next_episode_date: proximo_episodio };
  } catch(err){ registrarError("FLV",`anime:${anime.titulo}`,err.message,anime.url); return null; }
}

async function scrapeAnimeFLV(log = console.log) {
  const queuePages = new PQueue({ concurrency: CONCURRENT_REQUESTS });
  const queueAnimes = new PQueue({ concurrency: CONCURRENT_REQUESTS });
  const paginas = await Promise.allSettled(Array.from({ length: FLV_MAX_PAGES }, (_, i) => queuePages.add(()=>extraerFlvDePagina(i+1,log))));
  const todos = paginas.filter(p=>p.status==="fulfilled").flatMap(p=>p.value);
  const detalles = await Promise.allSettled(todos.map(a=>queueAnimes.add(()=>procesarAnimeflv(a,log))));
  return detalles.filter(d=>d.status==="fulfilled").map(d=>d.value);
}

// --------------------------------------------
// TioAnime
// --------------------------------------------
async function extraerTioanimesDePagina(pagina, log = console.log){
  const url = `${TIO_BASE_URL}/directorio?p=${pagina}`;
  try{ const resp = await axios.get(url,{timeout:20000}); const $=cheerio.load(resp.data); const animes=[];
  $("ul.animes.list-unstyled.row article.anime").each((_,article)=>{ const href=$(article).find("a").attr("href")||""; if(href.includes("/anime/")){ const slug=href.replace("/anime/","").replace(/\/$/,""); const titulo=slug.replace(/-/g," "); animes.push({ slug, titulo }); }});
  return animes; }catch(e){ registrarError("TioAnime",`Página ${pagina}`,e.message,url); return []; }
}

async function procesarTioanime(anime, log = console.log){
  const url=`${TIO_BASE_URL}/anime/${anime.slug}`;
  try{
    const resp = await axios.get(url,{timeout:10000}); const html = resp.data; const matchEpisodes = html.match(/var episodes\s*=\s*(\[[^\]]*\])/);
    const episodes_count = matchEpisodes? JSON.parse(matchEpisodes[1]).length:0;
    return { title: anime.titulo, slug: anime.slug, url, episodes_count };
  }catch(e){ registrarError("TioAnime",`anime:${anime.titulo}`,e.message,url); return null; }
}

async function scrapeTioAnime(log = console.log){
  const queuePages = new PQueue({ concurrency: CONCURRENT_REQUESTS });
  const queueAnimes = new PQueue({ concurrency: CONCURRENT_REQUESTS });
  const paginas = await Promise.allSettled(Array.from({length:TIO_TOTAL_PAGES},(_,i)=>queuePages.add(()=>extraerTioanimesDePagina(i+1,log))));
  const todos = paginas.filter(p=>p.status==="fulfilled").flatMap(p=>p.value);
  const detalles = await Promise.allSettled(todos.map(a=>queueAnimes.add(()=>procesarTioanime(a,log))));
  return detalles.filter(d=>d.status==="fulfilled").map(d=>d.value);
}

// --------------------------------------------
// Filtrado de animes válidos
// --------------------------------------------
function filtrarAnimesValidos(animes){ return animes.filter(a=>a && a.title && typeof a.title==="string" && a.title.trim()!==""); }

// --------------------------------------------
// Episodes_count desde API de AnimeYTX con cookie
// --------------------------------------------
async function obtenerEpsAnimeYTX(url, cookieVal, log = console.log) {
  try {
    const headers = { 'User-Agent': 'Mozilla/5.0' };
    if (cookieVal) headers['Cookie'] = `__test=${cookieVal}`;
    const resp = await axios.get(`https://animeext.unaux.com/get_ep_vid.php?url=${encodeURIComponent(url)}`, { timeout: 10000, headers });
    const data = resp.data;
    if (data && typeof data.episodes_count === "number") return data.episodes_count;
    return 0;
  } catch (e) {
    registrarError("AnimeYTX", "get_ep_vid", e.message, url);
    return 0;
  }
}

// --------------------------------------------
// Paso para completar episodes_count de AnimeYTX
// --------------------------------------------
async function completarEpsAnimeYTX(animes, cookieVal, log = console.log) {
  const queue = new PQueue({ concurrency: 8 });
  const promesas = animes.map(anime => queue.add(async () => {
    if (anime.sources.ANIMEYTX && !anime.sources.FLV && !anime.sources.TIO) {
      const eps = await obtenerEpsAnimeYTX(anime.sources.ANIMEYTX, cookieVal, log);
      anime.episodes_count = eps;
      log(`[AnimeYTX] ${anime.title}: episodes_count = ${eps}`);
    }
  }));
  await Promise.all(promesas);
}

// --------------------------------------------
// Main
// --------------------------------------------
async function main({ log = console.log } = {}) {
  log("📡 Iniciando scraping...");

  log(">> Iniciando TioAnime...");
  const tioRaw = await scrapeTioAnime(log);
  const tio = filtrarAnimesValidos(tioRaw);
  log(`TioAnime: obtenidos ${tio.length} animes.`);

  log(">> Iniciando AnimeFLV...");
  const flvRaw = await scrapeAnimeFLV(log);
  const flv = filtrarAnimesValidos(flvRaw);
  log(`AnimeFLV: obtenidos ${flv.length} animes.`);

  log(">> Iniciando AnimeYTX...");
  const cookieVal = await obtenerCookieAnimeYTX(`${ANIMEYTX_BASE_URL}1`);
  log(cookieVal ? "🔑 Cookie única AnimeYTX obtenida" : "🔑 No se necesita cookie AnimeYTX");
  const animeYTXRaw = await scrapeAnimeYTX(cookieVal, log);
  const animeYTX = filtrarAnimesValidos(animeYTXRaw);
  log(`AnimeYTX: obtenidos ${animeYTX.length} animes.`);

  const outFinal = path.join(__dirname, "..", "..", "data", "anime_list.json");
  combinarJSONPorTituloV3(tio, flv, animeYTX, outFinal, log);

  // Leer JSON combinado y completar episodes_count
  let jsonCombinado = JSON.parse(fs.readFileSync(outFinal, "utf-8"));
  await completarEpsAnimeYTX(jsonCombinado.animes, cookieVal, log);
  fs.writeFileSync(outFinal, JSON.stringify(jsonCombinado, null, 2), "utf-8");
  log(`✅ Episodes_count de AnimeYTX completados y guardados.`);

  await last();
  const outReporte = path.join(__dirname, "..", "..", "data", "report_error.json");
  if (erroresReportados.length>0) {
    fs.writeFileSync(outReporte,JSON.stringify(erroresReportados,null,2),"utf-8");
    log(`⚠️ Errores registrados en: ${outReporte}`);
  } else {
    eliminarArchivo(outReporte,log);
  }

  log("✅ Scraping y combinación completados.");
  process.exit(0);
}

main();
