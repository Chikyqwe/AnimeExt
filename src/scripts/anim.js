const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const PQueue = require("p-queue").default;
const { last } = require("./lastep");

// --------------------------------------------
// Configuración
// --------------------------------------------
const CONFIG = {
  FLV_BASE_URL: "https://www4.animeflv.net",
  ONE_BASE_URL: "https://vww.animeflv.one",
  TIO_BASE_URL: "https://tioanime.com",
  FLV_MAX_PAGES: 155,
  ONE_MAX_PAGES: 295,
  TIO_TOTAL_PAGES: 209,
  JK_TOTAL_PAGES: 155,
  ANIYAE_TOTAL_PAGES: 96,
  HENTAILA_TOTAL_PAGES: 50,
  TIOHENTAI_TOTAL_PAGES: 44,
  CONCURRENT_REQUESTS: 10, // ⚡ menos concurrencia para RAM
};

const erroresReportados = [];

// --------------------------------------------
// Utils
// --------------------------------------------
const registrarError = (origen, contexto, mensaje, url = null) => {
  erroresReportados.push({ origen, contexto, mensaje, url, timestamp: new Date().toISOString() });
};

const limpiarDirectorio = (dir) => {
  try {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  } catch (err) { console.log(`❌ Error limpiando ${dir}: ${err.message}`); }
};

// --------------------------------------------
// DESCARGAR + PARSEAR CON STREAM
// --------------------------------------------
async function descargarYParsear({ totalPages, tmpDir, getPageUrl, parseFn, log, label, outputPath, concurrency, inter }) {
  fs.mkdirSync(tmpDir, { recursive: true });
  const queue = new PQueue({ concurrency: concurrency ?? CONFIG.CONCURRENT_REQUESTS, interval: inter ?? 0 });
  log(`[DOWNLOAD] Descargando ${label}...`);

  const writeStream = fs.createWriteStream(outputPath, { flags: "w" });
  writeStream.write("[\n");
  let first = true;

  for (let i = 0; i < totalPages; i++) {
    const page = i + 1;
    queue.add(async () => {
      const url = getPageUrl(page);
      const maxRetries = 3;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          // Si es reintento, usa el proxy
          const fetchUrl = attempt > 0
            ? `https://anim-ext-vc.vercel.app/api/req?url=${encodeURIComponent(url)}`
            : url;

          const { data } = await axios.get(fetchUrl, { timeout: 10000 });
          fs.writeFileSync(path.join(tmpDir, `page_${page}.html`), data);

          const $ = cheerio.load(data);
          const parsed = parseFn($, data);

          if (parsed.length > 0) {
            for (const item of parsed) {
              if (!first) writeStream.write(",\n");
              writeStream.write(JSON.stringify(item));
              first = false;
            }
          }
          
          $.root().remove(); // 🔥 Liberar Cheerio


          log(`[DOWNLOAD] [${label}] Página ${page} procesada${attempt > 0 ? " (via proxy)" : ""}`);
          break;

        } catch (err) {
          const is429 = err?.response?.status === 429;

          if (is429 && attempt < maxRetries) {
            log(`[RETRY] [${label}] Página ${page} - 429, usando proxy...`);
          } else {
            registrarError(`${label}_DOWNLOAD`, page, err.message, url);
            log(`[ERROR] [${label}] Página ${page}: ${err.message}`);
            break;
          }
        }
      }
    });
  }

  await queue.onIdle();

  // Esperar a que el stream cierre completamente antes de continuar
  await new Promise((resolve, reject) => {
    writeStream.write("\n]");
    writeStream.end();
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
  });

  limpiarDirectorio(tmpDir);
  log(`[SUCCESS] [${label}] guardado en ${outputPath}`);
}
// --------------------------------------------
// SCRAPERS
// --------------------------------------------
const scrapeFLV = async (log, outputPath) => descargarYParsear({
  totalPages: CONFIG.FLV_MAX_PAGES,
  tmpDir: path.join(__dirname, "tmp_flv"),
  label: "FLV",
  log,
  outputPath,
  getPageUrl: (p) => `${CONFIG.FLV_BASE_URL}/browse?page=${p}`,
  parseFn: ($) => {
    const arr = [];
    $("li").each((_, el) => {
      const a = $(el).find("a[href]");
      const img = $(el).find("img");
      const href = a.attr("href") || "";
      if (!href.includes("/anime/")) return;
      const slug = href.replace("/anime/", "").replace(/\/$/, "");
      arr.push({ slug, title: img.attr("alt") || "", url: CONFIG.FLV_BASE_URL + href, image: img.attr("src") });
    });
    return arr;
  }
});

const scrapeONE = async (log, outputPath) => descargarYParsear({
  totalPages: CONFIG.ONE_MAX_PAGES,
  tmpDir: path.join(__dirname, "tmp_one"),
  label: "ONE",
  log,
  outputPath,
  getPageUrl: (p) => `${CONFIG.ONE_BASE_URL}/animes?pag=${p}`,
  parseFn: ($) => {
    const arr = [];
    $("article.li").each((_, el) => {
      const a = $(el).find("figure a");
      const h3 = $(el).find("h3 a");
      const img = $(el).find("img");
      const href = a.attr("href") || "";
      if (!href.includes("/anime/")) return;
      const slug = href.replace("./anime/", "").replace("/anime/", "").replace(/\/$/, "");
      arr.push({ slug, title: h3.text().trim(), url: CONFIG.ONE_BASE_URL + "/anime/" + slug, image: img.attr("data-src") || img.attr("src") });
    });
    return arr;
  }
});

const scrapeTioAnime = async (log, outputPath) => descargarYParsear({
  totalPages: CONFIG.TIO_TOTAL_PAGES,
  tmpDir: path.join(__dirname, "tmp_tio"),
  label: "TIO",
  log,
  outputPath,
  getPageUrl: (p) => `${CONFIG.TIO_BASE_URL}/directorio?p=${p}`,
  parseFn: ($) => {
    const arr = [];
    $("article.anime").each((_, el) => {
      const link = $(el).find("a");
      const href = link.attr("href") || "";
      if (!href.includes("/anime/")) return;
      let img = link.find("img").attr("src") || "";
      if (img && !img.startsWith("http")) img = CONFIG.TIO_BASE_URL + img;
      arr.push({ slug: href.replace("/anime/", "").replace(/\/$/, ""), title: link.find("h3.title").text().trim(), url: CONFIG.TIO_BASE_URL + href, image: img });
    });
    return arr;
  }
});

const scrapeJKAnime = async (log, outputPath) => descargarYParsear({
  totalPages: CONFIG.JK_TOTAL_PAGES,
  tmpDir: path.join(__dirname, "tmp_jk"),
  label: "JK",
  log,
  outputPath,
  concurrency: 3, // 👈 limita solo JK
  inter: 1000,
  getPageUrl: (p) => `https://jkanime.net/directorio?p=${p}`,
  parseFn: ($, html) => {
    const arr = [];
    try {
      const match = html.match(/var\s+animes\s*=\s*(\{.*?\});/s);
      if (!match) return arr;
      const data = JSON.parse(match[1]);
      if (!data?.data) return arr;
      for (const anime of data.data) {
        if ((anime.estado || "").toLowerCase().includes("estrenar")) continue;
        arr.push({ slug: anime.slug, title: anime.title, url: anime.url, image: anime.image, status: anime.estado, type: anime.tipo });
      }
    } catch (err) { log(`[FAIL] Error parseando JSON JK: ${err.message}`); }
    return arr;
  }
});

const scrapeAniyae = async (log, outputPath) => descargarYParsear({
  totalPages: CONFIG.ANIYAE_TOTAL_PAGES,
  tmpDir: path.join(__dirname, "tmp_aniyae"),
  label: "ANIYAE",
  log,
  outputPath,
  getPageUrl: (p) => `https://open.aniyae.net/directorio/page/${p}`,
  parseFn: ($) => {
    const arr = [];
    $(".grid-card").each((_, el) => {
      const card = $(el);
      const href = card.find('a[href*="/ah/"]').attr("href") || "";
      if (!href) return;
      const title = card.find(".stack span").first().text().trim();
      let img = card.find("img").attr("src") || null;
      const slug = href.replace("https://open.aniyae.net/ah/", "").replace(/\/$/, "");
      const tipo = card.find(".absolute.top-0.right-0 div").first().text().trim().toLowerCase();
      const rawText = card.text().toLowerCase();
      if (rawText.includes("not yet aired")) return;
      arr.push({ slug, title, url: href, image: img, type: tipo, status: rawText });
    });
    return arr;
  }
});

const scrapeHentaila = async (log, outputPath) => descargarYParsear({
  totalPages: CONFIG.HENTAILA_TOTAL_PAGES,
  tmpDir: path.join(__dirname, "tmp_hentaila"),
  label: "HENTAILA",
  log,
  outputPath,
  getPageUrl: (p) => `https://hentaila.com/catalogo?page=${p}`,
  parseFn: ($) => {
    const arr = [];
    $("article.group\\/item").each((_, el) => {
      const card = $(el);
      const a = card.find("a[href]").first();
      const href = a.attr("href") || "";
      if (!href.includes("/media/")) return;
      const slug = href.replace("/media/", "").replace(/\/$/, "");
      const title = card.find("h3").text().trim() || a.attr("title") || "";
      let image = card.find("img").attr("data-src") || card.find("img").attr("src") || null;
      const type = card.find(".text-xs").first().text().trim().toLowerCase();
      arr.push({ slug, title, url: "https://hentaila.com" + href, image, type, isHentai: true });
    });
    return arr;
  }
});

const scrapeTioHentai = async (log, outputPath) => descargarYParsear({
  totalPages: CONFIG.TIOHENTAI_TOTAL_PAGES,
  tmpDir: path.join(__dirname, "tmp_tiohentai"),
  label: "TIOHENTAI",
  log,
  outputPath,
  getPageUrl: (p) => `https://tiohentai.com/directorio?p=${p}`,
  parseFn: ($) => {
    const arr = [];
    $("ul.animes li article.anime").each((_, el) => {
      const card = $(el);
      const a = card.find("a").first();
      const href = a.attr("href") || "";
      if (!href.startsWith("/hentai/")) return;
      const title = card.find("h3.title").text().trim();
      let image = card.find("img").attr("src") || null;
      if (image?.startsWith("/")) image = "https://tiohentai.com" + image;
      const slug = href.replace("/hentai/", "").replace(/\/$/, "");
      arr.push({ slug, title, url: "https://tiohentai.com" + href, image, source: "tiohentai", isHentai: true });
    });
    return arr;
  }
});

// --------------------------------------------
// COMBINAR DESDE JSONS
// --------------------------------------------
const UnityJsonsV4 = (sourcesPaths, outputPath, log = console.log) => {
  const mapa = new Map();
  const unitIDPath = path.join(__dirname, "..", "..", "data", "UnitID.json");
  let unitIDsExistentes = {};
  if (fs.existsSync(unitIDPath)) {
    try { unitIDsExistentes = JSON.parse(fs.readFileSync(unitIDPath, "utf-8")); }
    catch { log("[WARNING] Error leyendo UnitID.json"); }
  }
  const usados = new Set(Object.values(unitIDsExistentes));

  const generarUnitID = (slug) => {
    if (unitIDsExistentes[slug]) return unitIDsExistentes[slug];
    let id;
    do { id = Math.floor(Math.random() * 1_000_000) + 1; } while (usados.has(id));
    usados.add(id);
    unitIDsExistentes[slug] = id;
    return id;
  };

  const normalizarTitulo = (title) => title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");

  const add = (anime, src) => {
    if (!anime?.title) return;
    const key = normalizarTitulo(anime.title);
    if (!mapa.has(key)) mapa.set(key, { title: anime.title, slug: anime.slug || null, image: anime.image || null, sources: { FLV: null, ONE: null, TIO: null, JK: null, ANIYAE: null, HENTAILA: null, TIOHENTAI: null } });
    const existing = mapa.get(key);
    if (anime.url) existing.sources[src] = anime.url;
    if ((anime.title?.length || 0) > (existing.title?.length || 0)) existing.title = anime.title;
    if (!existing.image && anime.image) existing.image = anime.image;
    if (!existing.slug && anime.slug) existing.slug = anime.slug;
  };

  for (const { path: p, src } of sourcesPaths) {
    if (!fs.existsSync(p)) continue;

    // ✅ Agrega esta validación
    const content = fs.readFileSync(p, "utf-8").trim();
    if (!content || content === "[]" || content.length < 3) {
      log(`[WARNING] Archivo vacío o inválido, omitiendo: ${p}`);
      continue;
    }

    try {
      const data = JSON.parse(content);
      for (const anime of data) add(anime, src);
      // 🔥 Liberar memoria
      data.length = 0;
    } catch (err) {
      log(`[FAIL] Error parseando ${p}: ${err.message}`);
    }
  }

  const out = [...mapa.values()];
  mapa.clear(); // 🔥 Liberar mapa


  const idsUsados = new Set();
  for (const anime of out) {
    let randomId;
    do { randomId = Math.floor(Math.random() * 1_000_000) + 1; } while (idsUsados.has(randomId));
    idsUsados.add(randomId);
    anime.id = randomId;
    const base = anime.slug || anime.title;
    anime.unit_id = generarUnitID(base);
  }

  try {
    fs.writeFileSync(outputPath, JSON.stringify({ metadata: { creado_en: new Date().toISOString(), total_animes: out.length }, animes: out }, null, 2));
    fs.writeFileSync(unitIDPath, JSON.stringify(unitIDsExistentes, null, 2));
    log(`[SAVE] Guardado en ${outputPath} | Total animes: ${out.length}`);
  } catch (err) { log("[FAIL] Error guardando archivo final:", err); }
};

// --------------------------------------------
// MAIN
// --------------------------------------------
const main = async ({ log = console.log } = {}) => {
  log("🚀 Iniciando scraping...");

  const dataDir = path.join(__dirname, "..", "..", "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const sources = [
    { func: scrapeFLV, path: path.join(dataDir, "tmp_flv.json"), src: "FLV" },
    { func: scrapeONE, path: path.join(dataDir, "tmp_one.json"), src: "ONE" },
    { func: scrapeTioAnime, path: path.join(dataDir, "tmp_tio.json"), src: "TIO" },
    { func: scrapeJKAnime, path: path.join(dataDir, "tmp_jk.json"), src: "JK" },
    { func: scrapeAniyae, path: path.join(dataDir, "tmp_aniyae.json"), src: "ANIYAE" },
    { func: scrapeHentaila, path: path.join(dataDir, "tmp_hentaila.json"), src: "HENTAILA" },
    { func: scrapeTioHentai, path: path.join(dataDir, "tmp_tiohentai.json"), src: "TIOHENTAI" }
  ];

  for (const s of sources) await s.func(log, s.path);

  const sourcesPaths = sources.map(s => ({ path: s.path, src: s.src }));
  const outputPath = path.join(dataDir, "anime_list.json");

  UnityJsonsV4(sourcesPaths, outputPath, log);
  for (const s of sources) {
    if (fs.existsSync(s.path)) {
      fs.unlinkSync(s.path);
      log(`🗑️ Eliminado: ${s.path}`);
    }
  }
  await last();
  log("[SUCCESS] Todo completado");

  // 🔥 Limpiar globales
  erroresReportados.length = 0;
  
  if (global.gc) global.gc();
};


module.exports = { main };
if (require.main === module) main();