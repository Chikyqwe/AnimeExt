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

function generarUnitIDExistenteOUnico(slug, usados, unitIDsExistentes) {
  // Esta es una versión simplificada, se debe mantener la lógica original de tu proyecto
  // para la generación y gestión de IDs únicos.
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

/**
 * Normaliza el título de un anime para su comparación, incluyendo la temporada.
 * Esto asegura que cada temporada tenga una clave única, evitando la unión incorrecta de datos.
 * @param {string} titulo El título a normalizar.
 * @returns {string} El título normalizado con el número de temporada (ej. "karakaijouzunotakagisan-3").
 */
function normalizarTituloConTemporada(titulo) {
    if (!titulo) return "";
    let normalizado = titulo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Busca número de temporada en varias formas
    const match = normalizado.match(/\s*(?:temporada|season|saison|part)\s*(\d+)/) 
               || normalizado.match(/\s*(\d+)$/);
    const numeroTemporada = match ? parseInt(match[1], 10) : 1;

    // Quita "temporada/season/..." con número
    normalizado = normalizado.replace(/\s*(?:temporada|season|saison|part)\s*\d+/, "");

    // Quita número suelto al final (para casos tipo "Takagi-san 3")
    normalizado = normalizado.replace(/\s*\d+$/, "");

    // Limpia caracteres no alfanuméricos
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

function UnityJsonsV4(datosTio, datosFlv, datosAnimeYTX, outputPath, log = console.log) {
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
        // 🔑 Clave principal normalizada con temporada
        let clave = normalizarTituloConTemporada(anime.title || anime.titulo);

        // 🔑 Clave secundaria por slug simplificado (para fusionar similares)
        const claveSlug = slugSimplificado(anime.slug || anime.title || anime.titulo);

        // Busca si ya existe un anime con misma clave o mismo slug simplificado
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

            // Actualiza las fuentes
            existing.sources[fuente] = anime.url || null;

            // Episodes_count → mayor
            existing.episodes_count = Math.max(existing.episodes_count || 0, anime.episodes_count || 0);

            // Status → "Finalizado" gana
            if (anime.status && (!existing.status || (existing.status === "En emisión" && anime.status === "Finalizado"))) {
                existing.status = anime.status;
            }

            // Fecha próxima → si existe
            if (anime.next_episode_date) {
                existing.next_episode_date = anime.next_episode_date;
            }

            // Imagen → FLV gana prioridad
            if (!existing.image && anime.image) {
                existing.image = anime.image;
            } else if (fuente === "FLV" && anime.image) {
                existing.image = anime.image;
            }

            // Título → FLV o más largo
            if ((anime.title?.length || 0) > (existing.title?.length || 0) || (fuente === "FLV" && anime.title)) {
                existing.title = anime.title;
            }

            // Slug → FLV siempre
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

    // Orden de prioridad
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
async function obtenerEpsAnimeYTX(url, cookieVal, log = console.log, maxRetries = 2) {
  const headers = { 'User-Agent': 'Mozilla/5.0' }; 
  if (cookieVal) headers['Cookie'] = `__test=${cookieVal}`;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const { data } = await axios.get(`https://animeext.unaux.com/get_ep_vid.php?url=${encodeURIComponent(url)}`, { timeout: 10000, headers });
      if (data && typeof data.episodes_count === "number" && data.episodes_count > 0) return data.episodes_count;
    } catch (e) { registrarError("AnimeYTX", "get_ep_vid", e.message, url); }
  }
  return 0;
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

  // ----------------------------
  // Scraping TioAnime
  // ----------------------------
  log(">> Iniciando TioAnime...");
  const tioRaw = await scrapeTioAnime(log);
  const tio = filtrarAnimesValidos(tioRaw);
  log(`TioAnime: obtenidos ${tio.length} animes.`);

  // ----------------------------
  // Scraping AnimeFLV
  // ----------------------------
  log(">> Iniciando AnimeFLV...");
  const flvRaw = await scrapeAnimeFLV(log);
  const flv = filtrarAnimesValidos(flvRaw);
  log(`AnimeFLV: obtenidos ${flv.length} animes.`);

  // ----------------------------
  // Scraping AnimeYTX
  // ----------------------------
  log(">> Iniciando AnimeYTX...");
  const cookieVal = await obtenerCookieAnimeYTX(`${ANIMEYTX_BASE_URL}1`);
  log(cookieVal ? "🔑 Cookie única AnimeYTX obtenida" : "🔑 No se necesita cookie AnimeYTX");
  const animeYTXRaw = await scrapeAnimeYTX(cookieVal, log);
  const animeYTX = filtrarAnimesValidos(animeYTXRaw);
  log(`AnimeYTX: obtenidos ${animeYTX.length} animes.`);

  // ----------------------------
  // Generar JSON combinado
  // ----------------------------
  const outputPath = path.join(__dirname, "..", "..", "data", "anime_list.json");
  UnityJsonsV4(tio, flv, animeYTX, outputPath, log);
  log(`✅ JSON combinado generado en: ${outputPath}`);

  // ----------------------------
  // Completar episodes_count de AnimeYTX
  // ----------------------------
  let jsonCombinado = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
  await completarEpsAnimeYTX(jsonCombinado.animes, cookieVal, log);
  fs.writeFileSync(outputPath, JSON.stringify(jsonCombinado, null, 2), "utf-8");
  log(`✅ Episodes_count de AnimeYTX completados y guardados en: ${outputPath}`);

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