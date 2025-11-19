// === Variables de Estado Globales ===
console.info(
  "%cAnime %cEXT%c\n%cDesarrollado por Chiki & Chikiqwe",
  "font-family: 'Alice', sans-serif; color: white; font-size: 1.5rem; font-weight: bold;",
  "font-family: 'Alice', sans-serif; color: #00BFFF; font-size: 1.5rem; font-weight: bold;", // celeste
  "font-family: 'Alice', sans-serif; color: white; font-size: 1.5rem; font-weight: bold;",
  "color: #888; font-size: 1rem;"
);
const API_BASE = "/api";
let currentConfig = {};
let currentServerList = [];
let hlsInstance = null;
let currentBlobUrl = null;
let wakeLock = null;
let currentMirror = 1;
let progressIntervalId = null; // ⚡ NUEVA VARIABLE para el ID del setInterval
let mainInitEjecutado = false; // bandera global
const video = document.getElementById('player');
const wrapper = document.querySelector('.video-wrapper');
let animFrame;
let cargandoFrame = false;
let lastUpdate = 0;
let blur_a = true;
// === Variables de Estado Globales para el Arrastre ===
let xOffset = 0;
let yOffset = 0;
// Referencia al contenedor que queremos mover: el .video-wrapper
const VIDEO_CONTAINER = document.querySelector('.video-wrapper');
if (VIDEO_CONTAINER && !VIDEO_CONTAINER.id) {
  VIDEO_CONTAINER.id = 'draggable-video-wrapper';
}
const VIDEO_CONTAINER_ID = 'draggable-video-wrapper'; // Usamos este ID para makeDraggable

// === IndexedDB ===
const DB_NAME = 'AnimeCacheDB';
const STORE_NAME = 'precached';
let dbPromise = null;

// ========================
//        PLYR.JS
// ========================
const player = new Plyr('#player', {
  controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'fullscreen', 'settings']
});

// Get the element and its original parent
const overlay = document.getElementById("infoOverlay");
const originalParent = overlay.parentElement; // This should be .video-wrapper

// Get the Plyr container (the target for fullscreen)
let plyrContainer;
player.on('ready', () => {
  // Get the Plyr container once it's ready
  plyrContainer = player.elements.container;

  const controls = document.querySelector('.plyr__controls');

  // --- Custom +1:20 Button Logic (Kept for completeness) ---
  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.className = 'plyr__control plyr__button plyr__button--skip120';
  skipBtn.setAttribute('aria-label', 'Avanzar 1:20');
  skipBtn.innerHTML = `<i class="bi bi-clock-history"></i>`;
  controls.insertBefore(skipBtn, controls.children[1]);
  skipBtn.addEventListener('click', () => {
    player.currentTime += 80;
  });

  // --- Time Remaining Logic (Kept for completeness) ---
  const updateTime = () => {
    const current = document.querySelector('.plyr__time--current');
    if (current && player.duration) {
      const time = player.duration - player.currentTime;
      const min = Math.floor(time / 60).toString().padStart(2, '0');
      const sec = Math.floor(time % 60).toString().padStart(2, '0');
      current.textContent = `-${min}:${sec}`;
    }
    requestAnimationFrame(updateTime);
  };
  updateTime();

  // --- Double Tap Logic (Kept for completeness) ---
  const videoWrapper = document.querySelector('.video-wrapper');
  let lastTap = 0;
  function skipVideo(xPosition, width) {
    if (xPosition < width / 2) {
      player.currentTime -= 10;
    } else {
      player.currentTime += 10;
    }
  }
  videoWrapper.addEventListener('dblclick', (e) => {
    const rect = videoWrapper.getBoundingClientRect();
    skipVideo(e.clientX - rect.left, rect.width);
  });
  videoWrapper.addEventListener('touchend', (e) => {
    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTap;
    const rect = videoWrapper.getBoundingClientRect();
    const x = e.changedTouches[0].clientX - rect.left;

    if (tapLength < 300 && tapLength > 0) {
      skipVideo(x, rect.width);
      e.preventDefault();
    }
    lastTap = currentTime;
  });
});

// --- Overlay Anime + Hora ---
const timeEl = document.getElementById("currentTimeDisplay");

// 🔄 Actualizar hora cada segundo
function updateClock() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  timeEl.textContent = `${hh}:${mm}`;
}
setInterval(updateClock, 1000);
updateClock();

// 🎬 Mostrar overlay cuando Plyr muestre/oculte controles
player.on("controlsshown", () => {
  setOverlayTitle();
  overlay.classList.add("show");
});

player.on("controlshidden", () => {
  overlay.classList.remove("show");
});
// Detectar fullscreen
player.on('enterfullscreen', () => {
  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('landscape').catch(err => {
      console.warn('No se pudo bloquear la orientación:', err);
    });
  }
});

player.on('exitfullscreen', () => {
  if (screen.orientation && screen.orientation.unlock) {
    screen.orientation.unlock();
  }
});
// ========================
//           END
// ========================
const BLUR_SCALE = 0.1;
const FRAME_INTERVAL = 1000 / 60;

const blurCanvas = document.createElement("canvas");
const blurCtx = blurCanvas.getContext("2d", { willReadFrequently: false });

let activeBuffer = 0; // alterna entre 0 y 1
let blobBuffers = ["", ""]; // doble buffer

async function generarBlurFrame() {
  const now = performance.now();
  if (
    cargandoFrame ||
    video.paused ||
    video.readyState < 2 ||
    document.hidden ||
    now - lastUpdate < FRAME_INTERVAL
  ) return;

  cargandoFrame = true;
  lastUpdate = now;

  try {
    const w = (video.videoWidth * BLUR_SCALE) | 0 || 1;
    const h = (video.videoHeight * BLUR_SCALE) | 0 || 1;

    if (blurCanvas.width !== w) blurCanvas.width = w;
    if (blurCanvas.height !== h) blurCanvas.height = h;

    // --- Captura del frame ---
    try {
      if (window.createImageBitmap) {
        const bmp = await createImageBitmap(video, { resizeWidth: w, resizeHeight: h });
        blurCtx.clearRect(0, 0, w, h);
        blurCtx.drawImage(bmp, 0, 0);
        bmp.close();
      } else {
        blurCtx.drawImage(video, 0, 0, w, h);
      }
    } catch {
      blurCtx.drawImage(video, 0, 0, w, h);
    }

    // --- Crear blob rápido ---
    const blob = blurCanvas.convertToBlob
      ? await blurCanvas.convertToBlob({ type: "image/jpeg", quality: 0.6 })
      : await new Promise(res => blurCanvas.toBlob(res, "image/jpeg", 0.6));

    if (!blob) {
      cargandoFrame = false;
      return;
    }

    const url = URL.createObjectURL(blob);

    // === PRELOAD + DOUBLE BUFFER (SIN PARPADEO) ===
    const img = new Image();
    img.decoding = "async";

    img.onload = () => {
      // Cambiar buffer activo
      activeBuffer = activeBuffer === 0 ? 1 : 0;

      // Aplicar el nuevo fondo al wrapper
      wrapper.style.setProperty("--blur-bg", `url("${url}")`);

      // Limpiar blob viejo del mismo buffer
      if (blobBuffers[activeBuffer]) {
        URL.revokeObjectURL(blobBuffers[activeBuffer]);
      }

      // Guardar el nuevo blob en este buffer
      blobBuffers[activeBuffer] = url;

      cargandoFrame = false;
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      cargandoFrame = false;
    };

    img.src = url;

  } catch (err) {
    if (!(err instanceof DOMException)) console.error("Error en blur:", err);
    cargandoFrame = false;
  }
}

function loop() {
  generarBlurFrame();
  requestAnimationFrame(loop);
}

function setLoaderText(text) {
  const loaderSpan = document.getElementById('loaderText');
  if (loaderSpan) {
    loaderSpan.innerText = text;
  }
}

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 3); // ⚡ subimos versión a 3
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'url' });
      }
      if (!db.objectStoreNames.contains("progress")) {
        db.createObjectStore("progress", { keyPath: "slug" });
      }
      if (!db.objectStoreNames.contains("history")) {
        db.createObjectStore("history", { keyPath: "uid" }); // ⚡ solo uid
      }
    };
  });
  return dbPromise;
}
const titleEl = document.getElementById("animeTitleDisplay");
// 🟢 Poner título desde tu <h1 id="anime-title">
function setOverlayTitle() {
  const animeTitle = currentConfig.title;
  const ep = currentConfig.ep;
  titleEl.textContent = `${animeTitle} - ${ep}`;
}
setOverlayTitle();
// History

// Guardar uid en history
async function addToHistory(uid) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("history", "readwrite");
    const store = tx.objectStore("history");
    const req = store.put({ uid, addedAt: Date.now() }); // guarda uid y fecha
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Obtener todo el historial
async function getHistory() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("history", "readonly");
    const store = tx.objectStore("history");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// Borrar un anime del historial
async function removeFromHistory(uid) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("history", "readwrite");
    const store = tx.objectStore("history");
    const req = store.delete(uid);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// History end

async function idbPut(entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(url) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(url);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function saveLastEpisode(uid, ep) {
  const data = { uid, ep };
  localStorage.setItem("lasted", JSON.stringify(data));
}

// === Progreso de videos ===
async function saveProgress(slug, currentTime) {
  console.log("[Progress] Saving", slug, currentTime);
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("progress", "readwrite");
    const store = tx.objectStore("progress");
    const req = store.put({ slug, currentTime, updatedAt: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function loadProgress(slug) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("progress", "readonly");
    const store = tx.objectStore("progress");
    const req = store.get(slug);
    req.onsuccess = () => resolve(req.result ? req.result.currentTime : 0);
    req.onerror = () => reject(req.error);
  });
}

// === Utilidades ===
function getNextEpisodeSlug(slug) {
  const match = slug.match(/-(\d+)$/);
  if (!match) return null;
  const nextEp = parseInt(match[1], 10) + 1;
  return slug.replace(/-\d+$/, `-${nextEp}`);
}

function fixM3u8(content, baseUrl) {
  return content.replace(/^(?!#)([^:\n][^\n]*)$/gm, line => {
    try {
      return new URL(line, baseUrl).href;
    } catch {
      return line;
    }
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function highlightActiveButton(activeIndex) {
  const buttons = document.getElementById("serverButtons").querySelectorAll("button");
  buttons.forEach((btn, i) => {
    btn.classList.toggle("active", i === activeIndex);
  });
}

// === Precarga del próximo episodio ===
async function precacheNextEpisode(slug, triedServers = []) {
  const nextSlug = getNextEpisodeSlug(slug);
  if (!nextSlug) return;

  const cached = await loadPrecached(nextSlug);
  if (cached && cached.url === nextSlug) return;

  try {
    await delay(10000);
    const res = await fetch(`${API_BASE}/servers?id=${currentConfig.id}&ep=${currentConfig.ep + 1}`);
    if (!res.ok) throw new Error("Error al obtener lista de servidores");

    const servers = await res.json();

    const remaining = servers.filter(s =>
      !triedServers.includes(s.servidor.toLowerCase())
    );

    if (!remaining.length) {
      console.warn("Todos los servidores fallaron al precachear.");
      return;
    }

    const preferred = remaining.find(s => s.servidor.toLowerCase() === "sw") ||
      remaining.find(s => s.servidor.toLowerCase() === "yu") ||
      remaining.find(s => s.servidor.toLowerCase() === "mega") ||
      remaining[0];

    let streamUrl = "", m3u8Content = null;
    const server = preferred.servidor.toLowerCase();

    try {
      if (server === "sw") {
        const resM3u8 = await fetch(`/api?id=${currentConfig.id}&ep=${currentConfig.ep + 1}&server=sw`);
        if (!resM3u8.ok) throw new Error(`SW error: ${resM3u8.status}`);
        m3u8Content = await resM3u8.text();
        if (!m3u8Content || m3u8Content.includes("error")) throw new Error("M3U8 vacío o inválido");
        streamUrl = nextSlug;
      } else if (server === "yu" || server === "yourupload") {
        const resAlt = await fetch(`${API_BASE}?id=${currentConfig.id}&ep=${currentConfig.ep + 1}&server=yu`);
        if (!resAlt.ok) throw new Error(`YU error: ${resAlt.status}`);
        const json = await resAlt.json();
        if (!json.url) throw new Error("YU: URL no encontrada");
        streamUrl = `/api/stream?videoUrl=${encodeURIComponent(json.url)}`;
      } else {
        const resAlt = await fetch(`${API_BASE}?id=${currentConfig.id}&ep=${currentConfig.ep + 1}&server=${server}`);
        if (!resAlt.ok) throw new Error(`${server} error: ${resAlt.status}`);
        const stream = await resAlt.text();
        streamUrl = stream.trim();
        if (!streamUrl) throw new Error(`${server}: stream URL vacío`);
      }

      await savePrecached(nextSlug, {
        url: nextSlug,
        server: server,
        stream: streamUrl,
        m3u8Content,
        timestamp: Date.now()
      });

    } catch (innerErr) {
      console.warn(`Falló precache con ${server}:`, innerErr.message || innerErr);
      triedServers.push(server);
      await precacheNextEpisode(slug, triedServers);
    }

  } catch (err) {
    console.warn("Precache global error:", err.message || err);
  }
}

function isCacheValid(entry) {
  return entry && Date.now() - entry.timestamp < 12 * 60 * 60 * 1000;
}

async function loadPrecached(url) {
  try {
    const entry = await idbGet(url);
    return isCacheValid(entry) ? entry : null;
  } catch {
    return null;
  }
}

async function savePrecached(url, data) {
  try {
    await idbPut({ ...data, url });
  } catch (e) {
    console.error("Error guardando en cache:", e);
  }
}

// === Lógica principal del reproductor ===
async function initPlayerAndLoadEpisode(epNumber) {
  document.getElementById("loader").style.display = 'flex';
  document.getElementById('player').style.opacity = 0;
  document.getElementById('nav-buttons').innerHTML = '';
  document.getElementById('episode-list').innerHTML = '';
  const serverButtonsContainer = document.getElementById('serverButtons');
  if (serverButtonsContainer) serverButtonsContainer.innerHTML = '';

  // Si hay un iframe de mega o ads, lo limpiamos
  const existingIframe = document.getElementById('megaIframe') || document.getElementById('adsIframe');
  if (existingIframe) existingIframe.remove();
  document.getElementById('player').style.display = 'block';

  const urlParams = new URLSearchParams(window.location.search);
  const id = urlParams.get('id');
  const uid = urlParams.get('uid');

  if ((!id && !uid) || isNaN(epNumber)) {
    document.getElementById("anime-title").innerText = "Faltan parámetros";
    return;
  }

  try {
    let res;
    if (id) {
      res = await fetch(`${API_BASE}/player?id=${encodeURIComponent(id)}&ep=${epNumber}`);
    } else {
      res = await fetch(`${API_BASE}/player?uid=${encodeURIComponent(uid)}&ep=${epNumber}`);
    }
    const data = await res.json();

    if (data.error) {
      document.getElementById("anime-title").innerText = "Error: " + data.error;
      return;
    }

    // Actualizamos el estado global de la configuración
    currentConfig = {
      id: data.id,
      uid: data.uid_data,
      totalEp: data.episodes_count,
      ep: epNumber,
      title: data.anime_title
    };

    // Actualizamos la URL del navegador sin recargar
    const newUrl = `?${id ? `id=${encodeURIComponent(data.id)}` : `uid=${encodeURIComponent(data.uid_data)}`}&ep=${epNumber}`;
    window.history.pushState(currentConfig, data.anime_title, newUrl);
    document.title = `${data.anime_title}`;

    // Llamamos a las funciones de renderizado y carga
    renderPlayerUI(data);
    startEpisodeLoad();

  } catch (e) {
    document.getElementById("anime-title").innerText = "Error de carga.";
    console.error(e);
  }
}

function renderPlayerUI(data) {
  const navButtons = document.getElementById("nav-buttons");
  const episodeList = document.getElementById("episode-list");
  const ep = currentConfig.ep;
  const episodesPerPage = 12;
  let currentGroup = Math.floor((ep - 1) / episodesPerPage);
  navButtons.innerHTML = '';
  // Título del anime
  document.getElementById("anime-title").innerText = data.anime_title;

  // Botones de navegación
  if (ep > 1) {
    const btnPrev = document.createElement("button");
    btnPrev.title = "Anterior";
    btnPrev.innerHTML = '<i class="bi bi-arrow-left"></i>';
    btnPrev.onclick = () => initPlayerAndLoadEpisode(ep - 1);
    navButtons.appendChild(btnPrev);
  }

  const btnHome = document.createElement("button");
  btnHome.title = "Inicio";
  btnHome.innerHTML = '<i class="bi bi-house-door-fill"></i>';
  btnHome.onclick = () => location.href = '/';
  navButtons.appendChild(btnHome);

  if (ep < data.episodes_count) {
    const btnNext = document.createElement("button");
    btnNext.title = "Siguiente";
    btnNext.innerHTML = '<i class="bi bi-arrow-right"></i>';
    btnNext.onclick = () => initPlayerAndLoadEpisode(ep + 1);
    navButtons.appendChild(btnNext);
  }

  const infoSpan = document.createElement("span");
  infoSpan.innerText = ` Episodio ${ep} / ${data.episodes_count} `;
  navButtons.appendChild(infoSpan);

  // Botón de tema
  const themeBtn = document.createElement("button");
  themeBtn.id = "theme-toggle";
  themeBtn.title = "Cambiar tema";
  themeBtn.innerHTML = '<i class="bi bi-moon-stars-fill"></i>';
  navButtons.appendChild(themeBtn);
  setupThemeToggle(themeBtn);

  // Lista de episodios
  function renderEpisodeGroup() {
    episodeList.innerHTML = "";

    const totalGroups = Math.ceil(data.episodes_count / episodesPerPage);
    const start = currentGroup * episodesPerPage + 1;
    const end = Math.min(start + episodesPerPage - 1, data.episodes_count);

    if (currentGroup > 0) {
      const prevGroupBtn = document.createElement("button");
      prevGroupBtn.className = "btn episode-btn";
      prevGroupBtn.textContent = "◀";
      prevGroupBtn.onclick = () => {
        currentGroup--;
        renderEpisodeGroup();
      };
      episodeList.appendChild(prevGroupBtn);
    }

    for (let i = start; i <= end; i++) {
      const btn = document.createElement("button");
      btn.className = "btn episode-btn" + (i === ep ? " active" : "");
      btn.textContent = i;
      btn.onclick = () => initPlayerAndLoadEpisode(i);
      episodeList.appendChild(btn);
    }

    if (currentGroup < totalGroups - 1) {
      const nextGroupBtn = document.createElement("button");
      nextGroupBtn.className = "btn episode-btn";
      nextGroupBtn.textContent = "▶";
      nextGroupBtn.onclick = () => {
        currentGroup++;
        renderEpisodeGroup();
      };
      episodeList.appendChild(nextGroupBtn);
    }
  }
  renderEpisodeGroup();
}

function setupThemeToggle(toggleButton) {
  function setTheme(theme) {
    if (theme === "light") {
      document.body.classList.add("light-theme");
      toggleButton.innerHTML = '<i class="bi bi-brightness-high-fill"></i>';
    } else {
      document.body.classList.remove("light-theme");
      toggleButton.innerHTML = '<i class="bi bi-moon-stars-fill"></i>';
    }
    localStorage.setItem("theme", theme);
  }

  toggleButton.addEventListener("click", () => {
    const currentTheme = document.body.classList.contains("light-theme") ? "light" : "dark";
    setTheme(currentTheme === "light" ? "dark" : "light");
  });

  setTheme(localStorage.getItem("theme") || "dark");
}

/**
 * ⚡ FUNCIÓN DE LIMPIEZA DE LISTENERS DE PROGRESO
 * Detiene el intervalo de guardado de progreso del episodio anterior.
 */
function cleanupProgressListeners() {
  if (progressIntervalId !== null) {
    clearInterval(progressIntervalId);
    progressIntervalId = null;
    console.log("[PROGRESS] Intervalo de progreso anterior limpiado.");
  }
}

// === Lógica de carga y reproducción de stream ===
async function startEpisodeLoad(mirrorNumber = 1) {
  const video = document.getElementById('player');
  const loader = document.getElementById('loader');
  const serverButtonsContainer = document.getElementById('serverButtons');
  const slug = `${currentConfig.uid}-${currentConfig.ep}`;
  saveLastEpisode(currentConfig.uid, currentConfig.ep);
  addToHistory(currentConfig.uid);
  currentMirror = mirrorNumber;

  if (hlsInstance) {
    try { hlsInstance.destroy(); } catch { }
    hlsInstance = null;
    if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }

  // 🔴 LIMPIAMOS EL INTERVALO DE PROGRESO DEL EPISODIO ANTERIOR
  cleanupProgressListeners();

  setLoaderText("Cargando servidores...");
  video.src = '';
  video.pause();

  const ads = localStorage.getItem("ads") === "true";

  if (ads) {
    console.log("[INFO] Modo ADS activado");
    // Lógica de carga de servidores con anuncios (ejemplo simple)
    try {
      const res = await fetch(`${API_BASE}/servers?id=${currentConfig.id}&ep=${currentConfig.ep}&mirror=${currentMirror}`);
      const servers = await res.json();
      currentServerList = servers.map(s => ({
        ...s,
        servidor: s.servidor.toLowerCase()
      }));

      const orden = ["yu", "mega", "sw", "voe"];
      currentServerList.sort((a, b) => {
        const ia = orden.indexOf(a.servidor);
        const ib = orden.indexOf(b.servidor);
        if (ia === -1 && ib === -1) return 0;
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });

      createServerButtons(currentServerList, (server) => loadStreamWithAds(server, serverButtonsContainer));
      const firstServer = currentServerList[0];
      if (firstServer) loadStreamWithAds(firstServer, serverButtonsContainer);
    } catch (err) {
      console.error("Error al cargar servidores en modo ADS:", err);
      loader.style.display = 'none';
      setLoaderText("Error al cargar servidores");
    }
    return;
  }

  // Lógica para modo sin anuncios
  try {
    const cached = await loadPrecached(slug);
    if (cached) {
      console.log("[CACHE] Episodio encontrado en cache:", cached);
      await loadStreamDirect(cached.stream, cached.m3u8Content);
      precacheNextEpisode(slug);
      return;
    } else {
      console.log("[CACHE] Episodio no encontrado en cache, buscando en servidores...");
      const res = await fetch(`${API_BASE}/servers?id=${currentConfig.id}&ep=${currentConfig.ep}&mirror=${currentMirror}`);
      currentServerList = await res.json();
      if (!currentServerList || currentServerList.length === 0) throw new Error("No hay servidores disponibles");

      currentServerList.sort((a, b) => {
        if (a.servidor === 'mega' || a.servidor === 'mega.nz') return 1;
        if (b.servidor === 'mega' || b.servidor === 'mega.nz') return -1;
        return 0;
      });

      createServerButtons(currentServerList, (server, index) => loadServerByIndex(index));
      await loadServerByIndex(0);
    }
  } catch (err) {
    if (mirrorNumber < 4) {
      console.warn(`🔁 Reintentando con mirror=${mirrorNumber + 1}...`);
      setLoaderText(`Cargando servidor ${mirrorNumber + 1}...`);
      return startEpisodeLoad(mirrorNumber + 1);
    }
    console.error("Error fatal en startEpisodeLoad:", err);
    setLoaderText("Error de carga. Intente de nuevo.");
    loader.style.display = 'none';
  }
}

// === Funciones auxiliares para la carga de streams ===
// === Funciones auxiliares para la carga de streams ===
async function loadStreamDirect(url, m3u8Content = null) {
  const video = document.getElementById('player');
  const loader = document.getElementById('loader');
  const slug = `${currentConfig.uid}-${currentConfig.ep}`;

  // 🔴 VUELVE A LIMPIAR POR SI ACASO se llamó directamente o por reintento
  cleanupProgressListeners();

  // Limpia cualquier iframe existente
  const existingIframe = document.getElementById('megaIframe') || document.getElementById('adsIframe');
  if (existingIframe) existingIframe.remove();
  video.style.display = 'block';

  if (hlsInstance) {
    try { hlsInstance.destroy(); } catch { }
    hlsInstance = null;
    if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }

  const isM3U8 = url.endsWith(".m3u8") || m3u8Content;
  const isMP4 = url.endsWith(".mp4");

  // ✅ Variable local para el autoplay del siguiente episodio
  let nextEpisodeTriggered = false;

  if (Hls.isSupported() && isM3U8) {
    hlsInstance = new Hls();
    const source = m3u8Content ? URL.createObjectURL(new Blob([fixM3u8(m3u8Content, url)], { type: 'application/vnd.apple.mpegurl' })) : url;
    if (m3u8Content) currentBlobUrl = source;

    hlsInstance.loadSource(source);
    hlsInstance.attachMedia(video);
    hlsInstance.on(Hls.Events.MANIFEST_PARSED, async () => {
      loader.style.display = 'none';
      video.style.opacity = 1;
      try { await video.play(); await requestWakeLock(); } catch { }
      precacheNextEpisode(`${currentConfig.uid}-${currentConfig.ep}`);
    });
  } else {
    video.src = url;
    video.load();
    video.addEventListener('loadedmetadata', async () => {
      loader.style.display = 'none';
      video.style.opacity = 1;
      try { await video.play(); await requestWakeLock(); } catch { }
      precacheNextEpisode(`${currentConfig.uid}-${currentConfig.ep}`);
    }, { once: true });
  }

  // 🔹 Restaurar progreso guardado
  const savedTime = await loadProgress(slug);
  if (savedTime > 0) {
    video.currentTime = savedTime;
    console.log(`[PROGRESS] Reanudado desde ${savedTime}s`);
  }

  // 🔹 Guardar cada 10s
  progressIntervalId = setInterval(() => { // ⚡ Usamos la variable global
    if (!isNaN(video.currentTime) && video.currentTime > 0) {
      saveProgress(slug, Math.floor(video.currentTime));
    }
  }, 10000);

  // 🔹 Guardar al pausar o cerrar
  // NOTA: Estos listeners no se limpian automáticamente. El bug principal era el setInterval.
  video.addEventListener("pause", () => saveProgress(slug, video.currentTime));
  window.addEventListener("beforeunload", () => saveProgress(slug, video.currentTime));

  video.addEventListener('timeupdate', async () => {
    if (!video.duration || currentConfig.ep >= currentConfig.totalEp) return;
    const remaining = video.duration - video.currentTime;
    if (remaining <= 5 && !nextEpisodeTriggered) {
      nextEpisodeTriggered = true;
      // Reiniciamos el progreso del episodio actual ANTES de cambiar
      await saveProgress(slug, 0);
      console.log('Guardado progreso 0 para el episodio actual antes de avanzar.');
      console.log('Reproduciendo siguiente episodio');
      // 🔴 IMPORTANTE: Limpiar el intervalo justo antes de iniciar la carga del nuevo ep
      cleanupProgressListeners();
      initPlayerAndLoadEpisode(currentConfig.ep + 1);
    }
  });
}

async function loadServerByIndex(index) {
  const server = currentServerList[index];
  if (!server) {
    if (currentMirror < 4) {
      console.warn(`🔁 Reintentando con mirror=${currentMirror + 1}...`);
      return startEpisodeLoad(currentMirror + 1);
    }
    console.error('Todos los mirrors fallaron');
    setLoaderText("Error: No se pudo cargar ningún servidor.");
    document.getElementById('loader').style.display = 'none';
    return;
  }

  highlightActiveButton(index);
  setLoaderText(`Cargando ${server.servidor.toUpperCase()}...`);
  const video = document.getElementById('player');
  const loader = document.getElementById('loader');
  video.style.opacity = 0;
  loader.style.display = 'flex';

  try {
    let streamUrl, m3u8Content = null;
    let success = false;

    if (['yu', 'yourupload', 'bc', 'burcloud', 'sw'].includes(server.servidor)) {
      const serverNames = {
        'yu': 'yu',
        'yourupload': 'yu',
        'bc': 'bc',
        'burcloud': 'bc',
        'sw': 'sw'
      };

      const serverParam = serverNames[server.servidor];
      const url = `${API_BASE}?id=${currentConfig.id}&ep=${currentConfig.ep}&server=${serverParam}&mirror=${currentMirror}`;

      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Respuesta no OK");

        if (serverParam === 'sw') {
          m3u8Content = await res.text();
          if (!m3u8Content || m3u8Content.includes("error")) throw new Error("M3U8 inválido");
          streamUrl = url;
        } else {
          const json = await res.json();
          if (!json.url) throw new Error("URL vacía");
          streamUrl = `/api/stream?videoUrl=${encodeURIComponent(json.url)}`;
        }
        success = true;
      } catch (error) {
        console.error(`Intento fallido con la URL: ${url}`, error);
        throw error; // Propagar el error para que pase al siguiente servidor
      }

    } else if (server.servidor === 'mega') {
      const megaUrl = server.url || "";
      if (!megaUrl) throw new Error("URL de MEGA no encontrada");
      loader.style.display = 'none';
      video.style.display = 'none';
      const existingIframe = document.getElementById('megaIframe');
      if (existingIframe) existingIframe.remove();
      const iframe = document.createElement('iframe');
      iframe.src = megaUrl.replace('/file/', '/embed/');
      iframe.allowFullscreen = true;
      iframe.id = 'megaIframe';
      iframe.className = video.className;
      video.parentElement.insertBefore(iframe, video);
      success = true;
    } else {
      const res = await fetch(`${API_BASE}?id=${currentConfig.id}&ep=${currentConfig.ep}&server=${server.servidor}&mirror=${currentMirror}`);
      if (!res.ok) throw new Error("Respuesta no OK");
      streamUrl = (await res.text()).trim();
      if (!streamUrl) throw new Error("URL vacía");
      success = true;
    }

    if (success && ['mega'].includes(server.servidor)) return;

    await loadStreamDirect(streamUrl, m3u8Content);
    await savePrecached(`${currentConfig.uid}-${currentConfig.ep}`, {
      url: `${currentConfig.uid}-${currentConfig.ep}`,
      server: server.servidor,
      stream: streamUrl,
      m3u8Content,
      timestamp: Date.now()
    });

  } catch (err) {
    console.warn(`Fallo servidor "${server.servidor}" en mirror ${currentMirror}:`, err.message || err);
    await loadServerByIndex(index + 1);
  }
}
// WakeLock
async function requestWakeLock() {
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => console.log("🔓 Wake Lock liberado"));
    console.info("[WAKE] Wake Lock activado");
  } catch (err) {
    console.warn("No Wake Lock:", err.message);
  }
}
// === Funciones para la UI de servidores ===
function createServerButtons(servers, onClickCallback) {
  let serverButtonsContainer = document.getElementById('serverButtons');
  if (!serverButtonsContainer) {
    serverButtonsContainer = document.createElement('div');
    serverButtonsContainer.id = 'serverButtons';
    serverButtonsContainer.className = 'server-buttons';
    document.getElementById('player').parentElement.insertBefore(serverButtonsContainer, document.getElementById('player').nextSibling);
  }
  serverButtonsContainer.innerHTML = '';

  servers.forEach((server, index) => {
    const btn = document.createElement('button');
    btn.textContent = server.servidor.toUpperCase();
    btn.dataset.servidor = server.servidor;
    btn.className = 'btn server-btn';
    btn.onclick = () => onClickCallback(server, index);
    serverButtonsContainer.appendChild(btn);
  });
}

function loadStreamWithAds(server, container) {
  // Implementa la lógica de carga de un iframe con anuncios
  const video = document.getElementById('player');
  video.pause();
  video.style.display = 'none';

  // 🔴 LIMPIAR en modo ADS también
  cleanupProgressListeners();

  const existingIframe = document.getElementById('adsIframe');
  if (existingIframe) existingIframe.remove();

  const iframe = document.createElement('iframe');
  iframe.src = server.url.replace('/file/', '/embed/');
  iframe.id = 'adsIframe';
  iframe.className = video.className;
  iframe.allowFullscreen = true;
  container.parentElement.insertBefore(iframe, container.nextSibling);

  container.querySelectorAll('button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.servidor === server.servidor);
  });
  document.getElementById('loader').style.display = 'none';
}

// === Inicio de la Aplicación ===
function mainInit() {
  const urlParams = new URLSearchParams(window.location.search);
  const initialEp = parseInt(urlParams.get('ep'));
  if (!isNaN(initialEp)) {
    initPlayerAndLoadEpisode(initialEp);
  } else {
    document.getElementById("anime-title").innerText = "Faltan parámetros";
    document.getElementById("loader").style.display = 'none';
  }
};
async function verificarConexion() {
  console.log("[Status] Verificando conexión...");
  try {
    // Petición a un servidor confiable
    const resp = await fetch('https://httpbin.org/get?utm=AnimeExtWEB', {
      method: 'GET',
      cache: 'no-store'
    });

    if (resp.ok) {
      document.getElementById('mainContent').style.display = 'block';
      document.getElementById('offlineOverlay').classList.add('hidden');

      // Solo ejecuta mainInit una vez
      if (!mainInitEjecutado && typeof mainInit === 'function') {
        console.log("[Status] Conexión establecida. Iniciando reproductor...");
        mainInit();
        mainInitEjecutado = true;
      }

      setTimeout(verificarConexion, 5000);
    } else {
      mostrarOffline();
    }
  } catch (error) {
    mostrarOffline();
  }
}

function mostrarOffline() {
  const video = document.getElementById('player');
  if (video) {
    // Pausar el video
    video.pause();
    console.warn("[Offline] Conexión perdida. Video pausado.");
  }

  document.getElementById('mainContent').style.display = 'none';
  document.getElementById('offlineOverlay').classList.remove('hidden');
  setTimeout(verificarConexion, 5000);
}

// Al cargar la página, ocultamos todo y verificamos conexión
document.addEventListener('DOMContentLoaded', () => {
  verificarConexion();
});
// Manejar los cambios de URL del navegador
window.addEventListener('popstate', (event) => {
  const urlParams = new URLSearchParams(window.location.search);
  const ep = parseInt(urlParams.get('ep'));
  if (ep && ep !== currentConfig.ep) {
    initPlayerAndLoadEpisode(ep);
  }
});

// ======================================================
//                    GENRAL AND UI
// ======================================================

let suggestionBox = document.getElementById('search-suggestions');
const DB_VERSION = 1;
const DB_NAME_I = 'FavoritosDB';
const STORE_NAME_I = 'favoritos';

let currentAnime = null;

async function fetchJsonList() {
  try {
    const resp = await fetch('/anime/list/', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!resp.ok) return;

    const json = await resp.json();
    fullAnimeList = Array.isArray(json.animes) ? json.animes : [];
  } catch (err) {
    console.error("Error cargando lista:", err);
  }
}
function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function cleanTitle(title) {
  return title ? title.trim() : '';
}
// Eventos de barra de búsqueda móvil
mobileSearchInit();

// Eventos de búsqueda
const searchInputEl = document.getElementById('searchInput');
if (searchInputEl) {
  searchInputEl.addEventListener('submit', searchAnime);
  searchInputEl.addEventListener('input', searchSuggestionsInput);
}
document.addEventListener('click', searchSuggestionsClick);

function mobileSearchInit() {
  const top = document.getElementById('topbar');
  const searchForm = document.querySelector('.search-form');
  const searchToggleBtn = document.getElementById('search-toggle-btn');
  const searchInput = document.getElementById('searchInput');
  if (!searchForm || !searchToggleBtn || !searchInput) return;

  const closeBtn = document.createElement('button');
  closeBtn.id = 'search-close-btn';
  closeBtn.type = 'button';
  closeBtn.innerHTML = '<i class="fa fa-times"></i>';
  searchForm.appendChild(closeBtn);

  const openMobileSearch = () => {
    searchForm.classList.add('mobile-search-active');
    searchInput.classList.remove('hiding');
    searchInput.classList.add('showing');
    searchInput.style.display = 'block';
    searchInput.focus();
  };

  const closeMobileSearch = () => {
    top.style.zIndex = '0';
    searchInput.classList.remove('showing');
    searchInput.classList.add('hiding');
    searchForm.classList.add('hiding');
    setTimeout(() => {
      searchForm.classList.remove('mobile-search-active', 'hiding');
      searchInput.classList.remove('hiding');
      searchInput.style.display = 'none';
    }, 300);
  };

  searchToggleBtn.addEventListener('click', openMobileSearch);
  closeBtn.addEventListener('click', closeMobileSearch);
  searchForm.addEventListener('submit', e => {
    if (searchForm.classList.contains('mobile-search-active')) {
      e.preventDefault();
      closeMobileSearch();
    }
  });
  document.addEventListener('click', e => {
    if (searchForm.classList.contains('mobile-search-active') && !searchForm.contains(e.target) && e.target !== searchToggleBtn) {
      closeMobileSearch();
    }
  });
}

let lastSearchTerm = '';
function abrirCompartir(texto = '', enlace = window.location.href) {
  const modal = document.getElementById('modalShare');
  const input = document.getElementById('shareLink');
  const copyBtn = document.getElementById('copyBtn');
  const close = document.getElementById('closeModal');
  const shareOptions = document.getElementById('shareOptions');
  const scrollBtn = document.getElementById('scrollRight');

  input.value = enlace;
  modal.classList.add('active');

  close.onclick = () => modal.classList.remove('active');
  modal.onclick = e => { if (e.target === modal) modal.classList.remove('active'); };

  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(input.value);
      copyBtn.textContent = '¡Copiado!';
      setTimeout(() => copyBtn.textContent = 'Copiar', 2000);
    } catch {
      input.select();
      document.execCommand('copy');
    }
  };

  // Scroll lateral
  const updateScrollBtn = () => {
    const maxScroll = shareOptions.scrollWidth - shareOptions.clientWidth;
    scrollBtn.classList.toggle('hidden', shareOptions.scrollLeft >= maxScroll - 10);
  };

  scrollBtn.onclick = () => {
    shareOptions.scrollBy({ left: 150, behavior: 'smooth' });
    setTimeout(updateScrollBtn, 400);
  };

  shareOptions.addEventListener('scroll', updateScrollBtn);
  updateScrollBtn();

  // Funcionalidad de botones
  document.querySelectorAll('.share-option').forEach(btn => {
    btn.onclick = e => {
      e.preventDefault();
      const clase = btn.querySelector('div').classList[1]; // clase principal: whatsapp, facebook, etc.

      let url = '';
      switch (clase) {
        case 'whatsapp':
          url = `https://wa.me/?text=${encodeURIComponent(texto + ' ' + enlace)}`;
          break;
        case 'facebook':
          url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(enlace)}`;
          break;
        case 'telegram':
          url = `https://t.me/share/url?url=${encodeURIComponent(enlace)}&text=${encodeURIComponent(texto)}`;
          break;
        case 'correo':
          url = `mailto:?subject=${encodeURIComponent(texto)}&body=${encodeURIComponent(enlace)}`;
          break;
        case 'pinterest':
          url = `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(enlace)}&description=${encodeURIComponent(texto)}`;
          break;
        case 'x':
          url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(texto + ' ' + enlace)}`;
          break;
        case 'reddit':
          url = `https://www.reddit.com/submit?url=${encodeURIComponent(enlace)}&title=${encodeURIComponent(texto)}`;
          break;
      }

      if (url) window.open(url, '_blank');
    }
  });
}

function renderSuggestions(list) {
  const searchInput = document.getElementById('searchInput');
  const value = normalizeText(searchInput.value);
  const top = document.getElementById('topbar');

  // Si no hay texto escrito, no renderizamos nada
  if (!value) {
    suggestionBox.innerHTML = '';
    suggestionBox.style.display = 'none';
    top.style.zIndex = '0';
    return;
  }
  top.style.zIndex = '1';
  suggestionBox.innerHTML = '';
  list.forEach(anime => {
    const item = document.createElement('li');
    const proxyUrl = `/image?url=${encodeURIComponent(anime.image)}`;
    item.innerHTML = `<img src="${proxyUrl}" alt="${anime.title}" /><span>${anime.title}</span>`;
    item.addEventListener('click', () => {
      animeInfo(anime.unit_id);
      suggestionBox.innerHTML = '';
      suggestionBox.style.display = 'none';
    });
    suggestionBox.appendChild(item);
  });
  suggestionBox.style.display = list.length ? 'block' : 'none';
}

function searchSuggestionsClick(e) {
  const top = document.getElementById('topbar');
  const searchInput = document.getElementById('searchInput');
  if (!suggestionBox) suggestionBox = document.getElementById('search-suggestions');
  if (!suggestionBox.contains(e.target) && e.target !== searchInput) {
    suggestionBox.innerHTML = '';
    suggestionBox.style.display = 'none';
    top.style.zIndex = '0';
  }
}

async function searchSuggestionsInput() {
  const searchInput = document.getElementById('searchInput');
  const value = normalizeText(searchInput.value);
  if (!suggestionBox) suggestionBox = document.getElementById('search-suggestions');
  suggestionBox.innerHTML = '';

  if (!value || !fullAnimeList.length) {
    suggestionBox.style.display = 'none';
    return;
  }

  lastSearchTerm = value;
  const terms = value.split(' ').filter(Boolean);

  let localFiltered = fullAnimeList.filter(anime => {
    const allTitles = [anime.title, anime.en_jp, anime.ja_jp].filter(Boolean).map(normalizeText);
    return allTitles.some(t => terms.every(term => t.includes(term)));
  });

  localFiltered = [...new Set(localFiltered)].slice(0, 4);
  if (localFiltered.length) renderSuggestions(localFiltered);
  renderSuggestions(localFiltered);
}

async function searchAnime(event = null, term = null) {
  if (event && event.preventDefault) event.preventDefault();

  const input = term || document.getElementById('searchInput').value;
  const inputNormalized = normalizeText(input);

  // Actualizar URL
  const url = new URL(window.location);
  if (inputNormalized) url.searchParams.set('s', inputNormalized);
  else url.searchParams.delete('s');
  if (!term) window.history.pushState({}, '', url);

  // Si no hay término → lista completa
  if (!inputNormalized) {
    const page = getPageParam();
    const paginated = paginate(fullAnimeList, page);
    renderCards(paginated);
    createPagination(fullAnimeList.length, page);
    return;
  }

  const terms = inputNormalized.split(' ').filter(Boolean);

  const localResults = fullAnimeList
    .filter(anime => terms.every(term => normalizeText(anime.title).includes(term)))
    .map(a => ({
      title: a.title,
      canonicalTitle: a.canonicalTitle || a.title,
      from: "local",
      ...a
    }));
  search_selecion(localResults, inputNormalized);
}


async function search_selecion(s, t) {
  showLoader();
  document.getElementById("anime-section").classList.add("d-none");
  document.getElementById("directory-section").classList.add("d-none");
  document.getElementById("historial-section").classList.add("d-none");
  document.getElementById("favoritos-section").classList.add("d-none");
  document.getElementById("search-section").classList.remove("d-none");
  setActiveMenu('mobileNavDirectorio');
  document.querySelector('.sidebar').classList.add("d-none");
  document.getElementById("pagination-controls").classList.add("d-none");

  const container = document.getElementById('search-container');
  const search_title = document.getElementById('search-title');
  search_title.textContent = `Resultados para: ${t}`;
  if (!container) return;
  container.innerHTML = '<div class="text-white-50">Buscando...</div>';

  try {
    const search = s;
    if (!search.length) {
      container.innerHTML = '<p class="text-white-50">No hay Resultados de la búsqueda, estamos trabajando para tener más opciones.</p>';
      hideLoader();
      return;
    }
    container.innerHTML = '';
    console.log(search);

    search.forEach(item => {
      const card = document.createElement('div');
      card.className = 'anime-card';
      card.tabIndex = 0;
      card.setAttribute('role', 'button');

      const proxyUrl = `/image?url=${encodeURIComponent(item.image)}`;

      card.innerHTML = `
                <img src="${proxyUrl}" alt="Imagen de ${cleanTitle(item.title)}" class="anime-image" />
                <div class="anime-title">${cleanTitle(item.title)}</div>
            `;
      card.addEventListener('click', () => animeInfo(item.unit_id));
      container.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p class="text-danger">Error al Buscar.</p>';
  }

  setTimeout(() => hideLoader(), 1000);
}

function ajustarAlturaEpisodesList(eps) {
  var episodesList = document.getElementById('episodes-list');
  if (episodesList) {
    console.log("Número de episodios encontrados:", eps);
    if (eps > 0 && eps < 12) {
      console.log("Ajustando altura de episodes-list para menos de 12 episodios");
      episodesList.style.height = 'auto';
    } else {
      console.log("Ajustando altura de episodes-list para 12 o más episodios");
      episodesList.style.height = '645px';
    }
  }
}

function renderStarsBox(rating) {
  const scoreEl = document.getElementById('ratingScore');
  const starsEl = document.getElementById('ratingStars');
  if (!scoreEl || !starsEl) return;

  // Nota en escala 0–100 → 0–10
  const rating10 = (rating / 10).toFixed(1);
  scoreEl.textContent = rating10;

  starsEl.innerHTML = '';

  // Convertir a estrellas de 10
  let starsValue = (rating / 100) * 10;
  starsValue = Math.round(starsValue * 2) / 2; // redondear al 0.5

  const fullStars = Math.floor(starsValue);
  const hasHalf = starsValue % 1 !== 0;
  const emptyStars = 10 - fullStars - (hasHalf ? 1 : 0);

  // Llenas
  for (let i = 0; i < fullStars; i++) {
    starsEl.innerHTML += `<i class="fa fa-star"></i>`;
  }
  // Media
  if (hasHalf) {
    starsEl.innerHTML += `<i class="fa fa-star-half-alt"></i>`;
  }
  // Vacías
  for (let i = 0; i < emptyStars; i++) {
    starsEl.innerHTML += `<i class="fa fa-star inactive"></i>`;
  }
}
function findAnimeByUId(id) {
  if (typeof id !== 'number' || id <= 0) {
    console.error("El UID proporcionado no es un número válido." + id);
    return null;
  }
  const animeEncontrado = fullAnimeList.find(anime => anime.unit_id === id);
  return animeEncontrado || null;
}
function setImageInfo(url) {
  const modalImage = document.getElementById("modalImage");
  const modalImgWrapper = document.getElementById("modalImgWrapper");
  modalImage.src = url;

  modalImage.onload = () => {
    modalImgWrapper.style.setProperty("--blur-bg", `url(${url})`);
  };
}

async function animeInfo(uid) {
  let data = findAnimeByUId(uid)
  console.log(data);
  if (!data) {
    console.error(`[WARNING] Anime con UID ${uid} no encontrado.`);
    return;
  }
  let animeTitle = data.title
  currentAnime = data;
  const modalTitle = document.getElementById('modalTitle');
  const episodesList = document.getElementById('episodes-list');
  const modalDescription = document.getElementById('modalDescription');
  const favBtn = document.getElementById('favoriteBtn');
  const shareBtn = document.getElementById('shareBtn');

  async function ein(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = url;

      img.onload = () => {
        const maxDim = 100;
        const scale = Math.min(maxDim / img.width, maxDim / img.height);
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        let data;
        try {
          data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        } catch {
          return resolve(false);
        }

        let negros = 0, total = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 10) continue;
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          if (lum < 45) negros++;
          total++;
        }

        resolve(negros / total > 0.9);
      };

      img.onerror = () => resolve(false);
    });
  }


  const proxyUrl = `/image?url=${encodeURIComponent(data.image)}`;
  let finalImage = proxyUrl;

  if (modalTitle) modalTitle.textContent = cleanTitle(animeTitle);
  if (episodesList) episodesList.innerHTML = '';

  const animeModalEl = document.getElementById('animeModal');
  let modal;
  if (animeModalEl) {
    modal = new bootstrap.Modal(animeModalEl);
    modal.show();
  }

  initFavoriteButton(animeTitle);
  console.log(data.unit_id);
  initShareButton(data.unit_id);

  if (favBtn) {
    const isFavorite = await esFavoritoIndexed(animeTitle);
    favBtn.textContent = isFavorite ? 'Quitar de Favoritos' : 'Agregar a Favoritos';
    favBtn.classList.toggle('btn-warning', isFavorite);
    favBtn.classList.toggle('btn-outline-light', !isFavorite);
    favBtn.onclick = (e) => {
      e.stopPropagation();
      toggleFavoritoIndexed(animeTitle, favBtn);
    };
  }

  let loadingCounter = 1;
  let loadingInterval;
  if (modalDescription) {
    modalDescription.textContent = 'Cargando descripción';
    loadingInterval = setInterval(() => {
      let dots = '.'.repeat(loadingCounter);
      modalDescription.textContent = `Cargando descripción${dots}`;
      loadingCounter++;
      if (loadingCounter > 5) loadingCounter = 1;
    }, 500);
  }

  (async () => {
    try {
      const response = await fetch('/api/description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: data.id })
      });
      if (response.ok) {
        const result = await response.json();
        if (modalDescription) modalDescription.textContent = result.description || 'Sin descripción disponible.';
      } else {
        if (modalDescription) modalDescription.textContent = 'No se pudo cargar la descripción.';
      }
    } catch (err) {
      if (modalDescription) modalDescription.textContent = 'Error al cargar la descripción.';
      console.error(err);
    } finally {
      clearInterval(loadingInterval);
    }
  })().catch(err => console.error('[SYNOP] Error inesperado:', err));

  (async () => {
    try {
      const mal = await fetch('https://kitsu.app/api/edge/anime?filter%5Btext%5D=' + data.slug, {});
      const malJson = await mal.json();
      if (malJson.data && malJson.data.length > 0) {
        const anime = malJson.data[0];
        let averageRating = anime.attributes.averageRating;

        if (averageRating === null || averageRating === undefined) {
          const freqs = anime.attributes.ratingFrequencies;
          let total = 0;
          let count = 0;

          for (const [rating, freq] of Object.entries(freqs)) {
            const r = parseInt(rating, 10);
            const f = parseInt(freq, 10);
            total += r * f;
            count += f;
          }

          if (count > 0) {
            averageRating = total / count;
            const maxRating = Math.max(...Object.keys(freqs).map(r => parseInt(r, 10)));
            averageRating = (averageRating / maxRating) * 10;
            averageRating = Math.round(averageRating * 10) / 10;
          } else {
            averageRating = null;
          }
        }

        console.log("Rating promedio:", averageRating);
        renderStarsBox(averageRating);
        try {
          const esNegra = await ein(proxyUrl);
          if (esNegra && malJson.data[0] && malJson.data[0].attributes.posterImage) {
            finalImage = malJson.data[0].attributes.posterImage.original || malJson.data[0].attributes.posterImage.large;
          } else {
            console.log(`[IMG] Imagen válida: ${finalImage}`);
          }
        } catch (err) {
          console.warn('[IMG] No se pudo verificar si es negra:', err);
        }
        setImageInfo(finalImage);
      } else {
        console.log("No se encontró el anime");
      }

    } catch (err) {
      console.log("[MAL] Error inesperado: " + err);
    }
  })().catch(err => console.error('[MAL] Error inesperado:', err));

  (async () => {
    let episodes = [];
    let selectedSource = null;
    let status = null;
    let PFP = null;
    const sources = ['FLV', 'TIO', 'ANIMEYTX'];

    for (const src of sources) {
      if (data.sources && data.sources[src]) {
        try {
          const epResponse = await fetch(`/api/episodes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ src, Uid: data.unit_id })
          });
          if (epResponse.ok) {
            const result = await epResponse.json();
            status = result.episodes.isEnd ? "Finalizado" : "En emisión";
            PFP = result.episodes.isNewEP;
            if (result.episodes && Array.isArray(result.episodes.episodes) && result.episodes.episodes.length > 0) {
              episodes = result.episodes.episodes;
              selectedSource = src;
              break;
            }
          } else {
            console.warn(`No se pudieron cargar episodios de ${src}`);
          }
        } catch (err) {
          console.error(`Error obteniendo episodios de ${src}:`, err);
        }
      }
    }

    if (episodesList) {
      const div = document.createElement('div');
      div.className = 'status-indicator';
      const estado = status ? status.toLowerCase() : "desconocido";
      let texto = "Desconocido";
      let color = "#343a40";
      if (estado.includes("emisión") || estado.includes("emision") || estado.includes("ongoing")) {
        texto = `Próxima emisión: ${PFP || "Desconocida"}`;
        color = "#28a745";
      } else if (estado.includes("finalizado") || estado.includes("finished") || estado.includes("completed")) {
        texto = status;
        color = "#fb3447";
      }
      div.innerHTML = `
            <button type="button" class="episode-status status" 
                    style="background-color:${color} !important; cursor: default; font-weight:600; color:#fff;">
                ${texto}
            </button>
            `;
      episodesList.appendChild(div);
    }

    ajustarAlturaEpisodesList(episodes.length);

    if (episodesList && episodes.length > 0) {
      episodes.forEach(ep => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'episode-button';
        btn.textContent = `Episodio ${ep.number}`;
        btn.addEventListener('click', () => {
          window.location.href = `./player?id=${encodeURIComponent(data.id)}&ep=${ep.number}`;
        });
        episodesList.appendChild(btn);
      });
    }
  })().catch(err => console.error('[API PLAYER] Error inesperado:', err));

}
function cerrarModalAnime() {
  const animeModalEl = document.getElementById('animeModal');
  if (!animeModalEl) return;

  // Obtener la instancia del modal (si ya existe)
  const modal = bootstrap.Modal.getInstance(animeModalEl) || new bootstrap.Modal(animeModalEl);

  modal.hide(); // 🔹 Cierra el modal
}

/**
 * =======================================================
 * INDEXEDDB FAVORITOS
 * =======================================================
 */

function abrirDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME_I, DB_VERSION);
    request.onerror = () => reject('Error al abrir DB');
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME_I)) {
        db.createObjectStore(STORE_NAME_I, { keyPath: 'title' });
      }
    };
  });
}

async function agregarFavoritoIndexed(animeTitle) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME_I, 'readwrite');
    const store = tx.objectStore(STORE_NAME_I);
    const request = store.add({ title: animeTitle });
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject('Error agregando favorito');
  });
}

async function eliminarFavoritoIndexed(animeTitle) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME_I, 'readwrite');
    const store = tx.objectStore(STORE_NAME_I);
    const request = store.delete(animeTitle);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject('Error eliminando favorito');
  });
}

async function cargarFavoritosIndexed() {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME_I, 'readonly');
    const store = tx.objectStore(STORE_NAME_I);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result.map(item => item.title));
    request.onerror = () => reject('Error cargando favoritos');
  });
}

async function esFavoritoIndexed(animeTitle) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME_I, 'readonly');
    const store = tx.objectStore(STORE_NAME_I);
    const request = store.get(animeTitle);
    request.onsuccess = () => resolve(!!request.result);
    request.onerror = () => reject('Error verificando favorito');
  });
}

async function toggleFavoritoIndexed(animeTitle, btn) {
  try {
    const favorito = await esFavoritoIndexed(animeTitle);
    if (favorito) {
      await eliminarFavoritoIndexed(animeTitle);
    } else {
      await agregarFavoritoIndexed(animeTitle);
    }
    // actualizar visual
    const nuevoFavorito = !favorito;
    btn.innerHTML = nuevoFavorito
      ? '<i class="fa fa-heart"></i> Quitar de Favoritos'
      : '<i class="fa fa-heart"></i> Agregar a Favoritos';
    btn.classList.toggle('btn-dark', nuevoFavorito);
    btn.classList.toggle('btn-outline-light', !nuevoFavorito);
  } catch (err) {
    console.error('Error toggling favorito:', err);
  }
}

/**
 * =======================================================
 * BOTONES DEL MODAL
 * =======================================================
 */

// Inicializar el botón de favoritos en el modal
async function initFavoriteButton(animeTitle) {
  const btn = document.getElementById('favoriteBtn');
  if (!btn) return;

  const favorito = await esFavoritoIndexed(animeTitle);

  // Estado inicial
  btn.innerHTML = favorito
    ? '<i class="fa fa-heart"></i> Quitar de Favoritos'
    : '<i class="fa fa-heart"></i> Agregar a Favoritos';

  btn.classList.toggle('btn-dark', favorito);
  btn.classList.toggle('btn-outline-light', !favorito);

  // Listener click
  btn.onclick = (e) => {
    e.stopPropagation();
    toggleFavoritoIndexed(animeTitle, btn);
  };
}

// Inicializar el botón de compartir
function initShareButton(UID) {
  const btn = document.getElementById('shareBtn');
  if (!btn) return;

  btn.onclick = async (e) => {
    e.stopPropagation();

    const shareUrl = `https://animeext-m5lt.onrender.com/app/share?uid=${encodeURIComponent(UID)}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: findAnimeByUId(UID).title,
          url: shareUrl
        });
      } else {
        abrirCompartir('', shareUrl);
      }
    } catch (err) {
      console.error('Error compartiendo:', err);
    }
  };
}
/**
 * 🖱️ FUNCIÓN PRINCIPAL PARA HACER UN ELEMENTO ARRASTRABLE
 * (Version revisada para usar variables globales de offset)
 */
function makeDraggable(elementId) {
  const element = document.getElementById(elementId);
  if (!element) return;

  let isDragging = false;
  let initialX;
  let initialY;

  // NOTA: xOffset y yOffset deben estar declaradas globalmente

  // --- EVENTOS DE RATÓN Y TÁCTILES ---
  // Usamos el contenedor para iniciar el arrastre
  element.addEventListener("mousedown", dragStart, false);
  element.addEventListener("touchstart", dragStart, false);

  // Los eventos de movimiento y fin se añaden al documento para que no se pierdan
  document.addEventListener("mouseup", dragEnd, false);
  document.addEventListener("touchend", dragEnd, false);

  document.addEventListener("mousemove", drag, false);
  document.addEventListener("touchmove", drag, false);


  function getCoordinates(e) {
    return e.type.includes('touch') ? e.touches[0] : e;
  }

  function dragStart(e) {
    // 🚨 CRUCIAL: Solo iniciar el arrastre si está en modo mini-reproductor
    if (!element.classList.contains('draggable-mode')) return;

    const coords = getCoordinates(e);

    // Almacena la posición inicial del cursor/toque ajustada por el offset actual
    initialX = coords.clientX - xOffset;
    initialY = coords.clientY - yOffset;

    isDragging = true;
    element.classList.add('dragging');
  }

  function dragEnd() {
    if (isDragging) {
      // Guarda la posición final del arrastre
      isDragging = false;
      element.classList.remove('dragging');
      // NO TOCAMOS initialX/Y. El nuevo arrastre usará el xOffset/yOffset actualizados.
    }
  }

  function drag(e) {
    if (!isDragging) return;

    e.preventDefault();
    const coords = getCoordinates(e);

    // Calcula el nuevo offset (distancia recorrida desde el inicio)
    const currentX = coords.clientX - initialX;
    const currentY = coords.clientY - initialY;

    // Actualiza las posiciones de desplazamiento GLOBALMENTE
    xOffset = currentX;
    yOffset = currentY;

    setTranslate(xOffset, yOffset, element);
  }

  function setTranslate(xPos, yPos, el) {
    // Usa transform: translate3d para un movimiento más suave (aceleración de hardware)
    el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
  }
}

// Función para activar el modo mini-reproductor
function enableDraggablePlayer() {
  const videoWrapper = VIDEO_CONTAINER;
  if (videoWrapper) {
    videoWrapper.classList.add('draggable-mode');
  }
}

// Función para desactivar el modo mini-reproductor
function disableDraggablePlayer() {
  const videoWrapper = VIDEO_CONTAINER;
  if (videoWrapper) {
    videoWrapper.classList.remove('draggable-mode');
    // Opcional: restablece la posición si quieres que vuelva a su sitio
    videoWrapper.style.transform = 'translate3d(0, 0, 0)';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Inicializa la capacidad de arrastre al inicio
  if (VIDEO_CONTAINER) {
    // Usamos el ID temporal que le asignamos al inicio
    makeDraggable(VIDEO_CONTAINER_ID);
  }
  fetchJsonList()
  const modalElement = document.getElementById('animeModal');

  if (modalElement) {
    // Cuando el modal se empieza a mostrar (apertura)
    //modalElement.addEventListener('show.bs.modal', enableDraggablePlayer);

    // Cuando el modal se oculta (cierre)
    //modalElement.addEventListener('hide.bs.modal', disableDraggablePlayer);
  }
  if (blur_a) {
    video.addEventListener('play', () => {
      cancelAnimationFrame(animFrame);
      loop();
    });

    video.addEventListener('pause', () => cancelAnimationFrame(animFrame));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) cancelAnimationFrame(animFrame);
      else if (!video.paused) loop();
    });
  }
}) 