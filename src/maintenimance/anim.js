// ./src/maintenimance/anim.js

const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const PQueue = require("p-queue").default;
const { last } = require('./lastep');
const vm = require("vm");

const FLV_BASE_URL = "https://www3.animeflv.net";
const TIO_BASE_URL = "https://tioanime.com";
const ANIMEID_BASE_URL = "https://www.animeid.tv";
const FLV_MAX_PAGES = 173;
const TIO_TOTAL_PAGES = 209;
const ANIMEID_TOTAL_PAGES = 84;
const CONCURRENT_REQUESTS = 50;

const erroresReportados = [];

function registrarError(origen, contexto, mensaje, url = null) {
    const error = {
        origen,
        contexto,
        mensaje,
        url,
        timestamp: new Date().toISOString(),
    };
    erroresReportados.push(error);
}

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
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function generarUnitIDExistenteOUnico(slug, usados, existentes) {
    if (existentes[slug]) {
        return existentes[slug];
    }

    let nuevoID;
    do {
        nuevoID = Math.floor(1000 + Math.random() * 9000);
    } while (usados.has(nuevoID));

    usados.add(nuevoID);
    existentes[slug] = nuevoID;
    return nuevoID;
}

function combinarJSONPorTituloV3(datosTio, datosFlv, datosAnimeID, outputPath, log = console.log) {
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

    // FLV (animeflv.net)
    for (const anime of datosFlv) {
        const clave = normalizarTitulo(anime.title || anime.titulo);
        mapa.set(clave, {
            title: anime.title || anime.titulo,
            slug: anime.slug,
            image: anime.image,
            episodes_count: anime.episodes_count,
            status: anime.status,
            next_episode_date: anime.next_episode_date,
            sources: {
                FLV: anime.url || null,
                TIO: null,
                ANIMEID: null,
            },
        });
    }

    // TioAnime
    for (const anime of datosTio) {
        const clave = normalizarTitulo(anime.title || anime.titulo);
        if (mapa.has(clave)) {
            const existingAnime = mapa.get(clave);
            existingAnime.sources.TIO = anime.url || null;
            if ((anime.episodes_count || 0) > (existingAnime.episodes_count || 0)) {
                existingAnime.episodes_count = anime.episodes_count;
            }
            if (anime.status && existingAnime.status !== "En emisión") {
                existingAnime.status = anime.status;
            }
            if (anime.next_episode_date) {
                existingAnime.next_episode_date = anime.next_episode_date;
            }
        } else {
            mapa.set(clave, {
                title: anime.title || anime.titulo,
                slug: anime.slug,
                image: anime.image,
                episodes_count: anime.episodes_count,
                status: anime.status,
                next_episode_date: anime.next_episode_date,
                sources: {
                    FLV: null,
                    TIO: anime.url || null,
                    ANIMEID: null,
                },
            });
        }
    }

    // AnimeID (Nuevo extractor)
    for (const anime of datosAnimeID) {
        const clave = normalizarTitulo(anime.title || anime.titulo);
        if (mapa.has(clave)) {
            const existingAnime = mapa.get(clave);
            existingAnime.sources.ANIMEID = anime.url || null;
            if ((anime.episodes_count || 0) > (existingAnime.episodes_count || 0)) {
                existingAnime.episodes_count = anime.episodes_count;
            }
            if (anime.status) {
                existingAnime.status = anime.status;
            }
            if (anime.next_episode_date) {
                existingAnime.next_episode_date = anime.next_episode_date;
            }
        } else {
            mapa.set(clave, {
                title: anime.title || anime.titulo,
                slug: anime.slug,
                image: anime.image,
                episodes_count: anime.episodes_count,
                status: anime.status,
                next_episode_date: anime.next_episode_date,
                sources: {
                    FLV: null,
                    TIO: null,
                    ANIMEID: anime.url || null,
                },
            });
        }
    }

    const combinado = [...mapa.values()];
    combinado.forEach((anime, index) => {
        anime.id = index + 1;
        anime.unit_id = generarUnitIDExistenteOUnico(anime.slug, usados, unitIDsExistentes);
    });

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const resultadoFinal = {
        metadata: {
            creado_en: new Date().toISOString(),
            total_animes: combinado.length,
        },
        animes: combinado,
    };

    fs.writeFileSync(outputPath, JSON.stringify(resultadoFinal, null, 2), "utf-8");
    fs.writeFileSync(unitIDPath, JSON.stringify(unitIDsExistentes, null, 2), "utf-8");

    log(`✅ JSON combinado guardado en: ${outputPath}`);
    log(`🔒 UnitID.json actualizado con ${Object.keys(unitIDsExistentes).length} slugs.`);
}

async function extraerTioanimesDePagina(pagina, log = console.log) {
    const url = `${TIO_BASE_URL}/directorio?p=${pagina}`;
    try {
        log(`[Tio][Página ${pagina}] Descargando...`);
        const resp = await axios.get(url, { timeout: 20000 });
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
        registrarError("TioAnime", `Página ${pagina}`, error.message, url);
        return [];
    }
}

async function procesarTioanime(anime, log = console.log) {
    const url = `${TIO_BASE_URL}/anime/${anime.slug}`;
    try {
        const resp = await axios.get(url, { timeout: 10000 });
        const html = resp.data;

        // Extracción del conteo de episodios
        const matchEpisodes = html.match(/var episodes\s*=\s*(\[[^\]]*\])/);
        const episodesCount = matchEpisodes ? JSON.parse(matchEpisodes[1]).length : 0;

        const $ = cheerio.load(html);
        const title = $("h1.title").first().text().trim() || anime.titulo;
        const imgUrl = $("aside img").first().attr("src") || "";
        const image = imgUrl ? TIO_BASE_URL + imgUrl : "";

        // Extracción y análisis de la variable 'anime_info' (TioAnime)
        const animeInfoMatch = html.match(/var anime_info\s*=\s*(\[[^\]]+\]);/);
        let animeInfo = [];
        if (animeInfoMatch && animeInfoMatch[1]) {
            try {
                animeInfo = vm.runInNewContext(animeInfoMatch[1]);
            } catch (e) {
                log(`[Tio][${anime.titulo}] Error al parsear anime_info: ${e.message}`);
            }
        }

        let estado = "Finalizado";
        let proximo_episodio = null;

        if (animeInfo.length === 4) {
            estado = "En emisión";
            proximo_episodio = animeInfo[3];
        }

        log(`[Tio][${anime.titulo}] ${episodesCount} episodios. Estado: ${estado}. Próximo episodio: ${proximo_episodio || "N/A"}`);

        return {
            url,
            title,
            image,
            episodes_count: episodesCount,
            slug: anime.slug,
            status: estado,
            next_episode_date: proximo_episodio,
        };
    } catch (err) {
        log(`[Tio][${anime.titulo}] Error: ${err.message}`);
        registrarError("TioAnime", `anime: ${anime.titulo}`, err.message, url);
        return null;
    }
}

async function extraerFlvDePagina(pagina, log = console.log) {
    const url = `${FLV_BASE_URL}/browse?page=${pagina}`;
    try {
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
                    image: imgUrl,
                });
            }
        });

        log(`[FLV][Página ${pagina}] ${animes.length} animes.`);
        return animes;
    } catch (err) {
        log(`[FLV][Página ${pagina}] Error: ${err.message}`);
        registrarError("FLV", `Página ${pagina}`, err.message, url);
        return [];
    }
}

async function procesarAnimeflv(anime, log = console.log) {
    try {
        const resp = await axios.get(anime.url, { timeout: 10000 });
        const html = resp.data;

        // Extracción del conteo de episodios
        const episodesMatch = html.match(/var episodes\s*=\s*(\[\[.*?\]\])/s);
        const episodes_count = episodesMatch ? JSON.parse(episodesMatch[1]).length : 0;

        // Extracción y análisis de la variable 'anime_info'
        const animeInfoMatch = html.match(/var anime_info\s*=\s*(\[[^\]]+\]);/);
        let animeInfo = [];
        if (animeInfoMatch && animeInfoMatch[1]) {
            try {
                animeInfo = vm.runInNewContext(animeInfoMatch[1]);
            } catch (e) {
                log(`[FLV][${anime.titulo}] Error al parsear anime_info: ${e.message}`);
            }
        }

        let estado = "Finalizado";
        let proximo_episodio = null;

        if (animeInfo.length === 4) {
            estado = "En emisión";
            proximo_episodio = animeInfo[3];
        }

        log(`[FLV][${anime.titulo}] ${episodes_count} episodios. Estado: ${estado}. Próximo episodio: ${proximo_episodio || "N/A"}`);

        return {
            title: anime.titulo,
            slug: anime.slug,
            url: anime.url,
            image: anime.image,
            episodes_count,
            status: estado,
            next_episode_date: proximo_episodio,
        };
    } catch (err) {
        log(`[FLV][${anime.titulo}] Error al procesar: ${err.message}`);
        registrarError("FLV", `anime: ${anime.titulo}`, err.message, anime.url);
        return null;
    }
}

async function extraerAnimeIDDePagina(pagina, log = console.log) {
    const url = `${ANIMEID_BASE_URL}/series?pag=${pagina}`;
    try {
        log(`[AnimeID][Página ${pagina}] Descargando...`);
        const resp = await axios.get(url, { timeout: 20000 });
        const $ = cheerio.load(resp.data);
        const animes = [];

        $("section#result article.item").each((_, article) => {
            const a = $(article).find("a").first();
            const header = $(article).find("header").first();
            const img = $(article).find("figure img").first();

            const href = a.attr("href") || "";
            const imgUrl = img.attr("src") || "";
            const titulo = header.text().replace(/"/g, '').trim() || "";
            const slug = href.replace(/^\//, "").replace(/\/$/, "");

            if (href && titulo && imgUrl) {
                animes.push({
                    slug,
                    titulo,
                    url: ANIMEID_BASE_URL + href,
                    image: imgUrl,
                });
            }
        });

        log(`[AnimeID][Página ${pagina}] ${animes.length} animes.`);
        return animes;
    } catch (error) {
        log(`[AnimeID][Página ${pagina}] Error: ${error.message}`);
        registrarError("AnimeID", `Página ${pagina}`, error.message, url);
        return [];
    }
}

async function procesarAnimeID(anime, log = console.log) {
    const url = anime.url;
    try {
        const resp = await axios.get(url, { timeout: 10000 });
        const $ = cheerio.load(resp.data);

        const title = $("article#anime h1").first().text().trim() || anime.titulo;
        const image = $("article#anime figure img").first().attr("src") || anime.image;
        
        const statusText = $("strong.t:contains('Estado:')").next("span.c").text().trim() || "Desconocido";
        const estado = statusText.replace(/\s+/g, ' ');

        const episodes_count = $("#listado li").length;

        const nextEpisodeMatch = $("#procap a").text().match(/(\d+\s+de\s+[a-zA-Z]+\s+del\s+\d{4})/);
        const next_episode_date = nextEpisodeMatch ? nextEpisodeMatch[1] : null;

        log(`[AnimeID][${anime.titulo}] ${episodes_count} episodios. Estado: ${estado}. Próximo episodio: ${next_episode_date || "N/A"}`);
        
        return {
            title,
            slug: anime.slug,
            url,
            image,
            episodes_count,
            status: estado,
            next_episode_date,
        };
    } catch (err) {
        log(`[AnimeID][${anime.titulo}] Error al procesar: ${err.message}`);
        registrarError("AnimeID", `anime: ${anime.titulo}`, err.message, url);
        return null;
    }
}

async function scrapeTioAnime(log = console.log) {
    const queuePages = new PQueue({ concurrency: CONCURRENT_REQUESTS });
    const queueAnimes = new PQueue({ concurrency: CONCURRENT_REQUESTS });

    const paginas = await Promise.allSettled(
        Array.from({ length: TIO_TOTAL_PAGES }, (_, i) =>
            queuePages.add(() => extraerTioanimesDePagina(i + 1, log))
        )
    );

    const todos = paginas
        .filter((p) => p.status === "fulfilled")
        .flatMap((p) => p.value);

    const detalles = await Promise.allSettled(
        todos.map((anime) => queueAnimes.add(() => procesarTioanime(anime, log)))
    );

    return detalles.filter((d) => d.status === "fulfilled").map((d) => d.value);
}

async function scrapeAnimeFLV(log = console.log) {
    const queuePages = new PQueue({ concurrency: CONCURRENT_REQUESTS });
    const queueAnimes = new PQueue({ concurrency: CONCURRENT_REQUESTS });

    const paginas = await Promise.allSettled(
        Array.from({ length: FLV_MAX_PAGES }, (_, i) =>
            queuePages.add(() => extraerFlvDePagina(i + 1, log))
        )
    );

    const todos = paginas
        .filter((p) => p.status === "fulfilled")
        .flatMap((p) => p.value);

    const detalles = await Promise.allSettled(
        todos.map((anime) => queueAnimes.add(() => procesarAnimeflv(anime, log)))
    );

    return detalles.filter((d) => d.status === "fulfilled").map((d) => d.value);
}

async function scrapeAnimeID(log = console.log) {
    const queuePages = new PQueue({ concurrency: CONCURRENT_REQUESTS });
    const queueAnimes = new PQueue({ concurrency: CONCURRENT_REQUESTS });

    const paginas = await Promise.allSettled(
        Array.from({ length: ANIMEID_TOTAL_PAGES }, (_, i) =>
            queuePages.add(() => extraerAnimeIDDePagina(i + 1, log))
        )
    );

    const todos = paginas
        .filter((p) => p.status === "fulfilled")
        .flatMap((p) => p.value);

    const detalles = await Promise.allSettled(
        todos.map((anime) => queueAnimes.add(() => procesarAnimeID(anime, log)))
    );

    return detalles.filter((d) => d.status === "fulfilled").map((d) => d.value);
}

function filtrarAnimesValidos(animes) {
    return animes.filter(a => a && a.title && typeof a.title === "string" && a.title.trim() !== "");
}

async function main({ log = console.log } = {}) {
    log("📡 Iniciando scraping...");

    log(">> Iniciando TioAnime...");
    const tioRaw = await scrapeTioAnime(log);
    const tio = filtrarAnimesValidos(tioRaw);
    log(`TioAnime: obtenidos ${tio.length} animes después de limpieza.`);

    log(">> Iniciando AnimeFLV...");
    const flvRaw = await scrapeAnimeFLV(log);
    const flv = filtrarAnimesValidos(flvRaw);
    log(`AnimeFLV: obtenidos ${flv.length} animes después de limpieza.`);

    log(">> Iniciando AnimeID...");
    const animeIDRaw = await scrapeAnimeID(log);
    const animeID = filtrarAnimesValidos(animeIDRaw);
    log(`AnimeID: obtenidos ${animeID.length} animes después de limpieza.`);

    const outTio = path.join(__dirname, "anime_list_tio.json");
    const outFlv = path.join(__dirname, "anime_list_flv.json");
    const outAnimeID = path.join(__dirname, "anime_list_animeid.json");
    const outFinal = path.join(__dirname, "..", "..", "data", "anime_list.json");
    const outReporte = path.join(__dirname, "..", "..", "data", "report_error.json");

    fs.writeFileSync(outTio, JSON.stringify(tio, null, 2), "utf-8");
    fs.writeFileSync(outFlv, JSON.stringify(flv, null, 2), "utf-8");
    fs.writeFileSync(outAnimeID, JSON.stringify(animeID, null, 2), "utf-8");

    combinarJSONPorTituloV3(tio, flv, animeID, outFinal, log);

    eliminarArchivo(outTio, log);
    eliminarArchivo(outFlv, log);
    eliminarArchivo(outAnimeID, log);
    await last();

    if (erroresReportados.length > 0) {
        fs.writeFileSync(outReporte, JSON.stringify(erroresReportados, null, 2), "utf-8");
        log(`⚠️ Errores registrados en: ${outReporte}`);
    } else {
        eliminarArchivo(outReporte, log);
    }
    
    log("✅ Scraping y combinación completados.");
    process.exit(0);
}

module.exports = {
    main,
    scrapeTioAnime,
    scrapeAnimeFLV,
    scrapeAnimeID,
    combinarJSONPorTituloV3,
    eliminarArchivo,
    registrarError,
};