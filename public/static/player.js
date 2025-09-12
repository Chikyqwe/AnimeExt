// === Variables de Estado Globales ===
const API_BASE = "/api";
let currentConfig = {};
let currentServerList = [];
let hlsInstance = null;
let currentBlobUrl = null;
let wakeLock = null;
let currentMirror = 1;

// === IndexedDB ===
const DB_NAME = 'AnimeCacheDB';
const STORE_NAME = 'precached';
let dbPromise = null;

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
    try { hlsInstance.destroy(); } catch {}
    hlsInstance = null;
    if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }

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

  // Limpia cualquier iframe existente
  const existingIframe = document.getElementById('megaIframe') || document.getElementById('adsIframe');
  if (existingIframe) existingIframe.remove();
  video.style.display = 'block';

  if (hlsInstance) {
    try { hlsInstance.destroy(); } catch {}
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
      try { await video.play(); await requestWakeLock(); } catch {}
      precacheNextEpisode(`${currentConfig.uid}-${currentConfig.ep}`);
    });
  } else {
    video.src = url;
    video.load();
    video.addEventListener('loadedmetadata', async () => {
      loader.style.display = 'none';
      video.style.opacity = 1;
      try { await video.play(); await requestWakeLock(); } catch {}
      precacheNextEpisode(`${currentConfig.uid}-${currentConfig.ep}`);
    }, { once: true });
  }
  // Manejo de siguiente episodio al finalizar
  video.addEventListener('timeupdate', () => {
    if (!video.duration || currentConfig.ep >= currentConfig.totalEp) return;
    const remaining = video.duration - video.currentTime;
    if (remaining <= 5 && !nextEpisodeTriggered) {
      nextEpisodeTriggered = true;
      console.log('Reproduciendo siguiente episodio');
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
window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const initialEp = parseInt(urlParams.get('ep'));
    if (!isNaN(initialEp)) {
        initPlayerAndLoadEpisode(initialEp);
    } else {
        document.getElementById("anime-title").innerText = "Faltan parámetros";
        document.getElementById("loader").style.display = 'none';
    }
});

// Manejar los cambios de URL del navegador
window.addEventListener('popstate', (event) => {
    const urlParams = new URLSearchParams(window.location.search);
    const ep = parseInt(urlParams.get('ep'));
    if (ep && ep !== currentConfig.ep) {
        initPlayerAndLoadEpisode(ep);
    }
});