// === Configuración inicial ===
const API_BASE = "api";
const config = JSON.parse(document.getElementById("config").textContent);
const slug = `${config.id}-${config.ep}`;
let currentUrl = slug;

const video = document.getElementById('player');
const loader = document.getElementById('loader');
const serverButtonsContainer = document.getElementById('serverButtons');

let hlsInstance = null;
let serverList = [];
let currentBlobUrl = null;
let wakeLock = null;

// === IndexedDB ===
const DB_NAME = 'AnimeCacheDB';
const STORE_NAME = 'precached';
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'url' });
      }
    };
  });
  return dbPromise;
}

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
  const buttons = serverButtonsContainer.querySelectorAll("button");
  buttons.forEach((btn, i) => {
    btn.classList.toggle("active", i === activeIndex);
  });
}

// === Precarga del próximo episodio ===
async function precacheNextEpisode(slug, triedYU = false) {
  const nextSlug = getNextEpisodeSlug(slug);
  if (!nextSlug) return;

  const cached = await loadPrecached(nextSlug);
  if (cached && cached.url === nextSlug) return;

  try {
    await delay(10000);
    const res = await fetch(`${API_BASE}/servers?id=${config.id}&ep=${parseInt(config.ep) + 1}`);
    if (!res.ok) throw new Error("Error al precargar servidores");

    const servers = await res.json();
    const preferred = servers.find(s => s.servidor.toLowerCase() === "sw") ||
                      servers.find(s => s.servidor.toLowerCase() === "yu") ||
                      servers[0];
    if (!preferred) return;

    let streamUrl = "", m3u8Content = null;

    if (preferred.servidor.toLowerCase() === "sw") {
      const resM3u8 = await fetch(`/api/m3u8?id=${config.id}&ep=${parseInt(config.ep) + 1}`);
      if (!resM3u8.ok) throw new Error(`SW error: ${resM3u8.status}`);
      m3u8Content = await resM3u8.text();
      streamUrl = nextSlug;
    } else {
      const resAlt = await fetch(`${API_BASE}?id=${config.id}&ep=${parseInt(config.ep) + 1}&server=${preferred.servidor}`);
      if (!resAlt.ok) throw new Error(`${preferred.servidor} error: ${resAlt.status}`);
      streamUrl = (await resAlt.text()).trim();
    }

    await savePrecached(nextSlug, {
      url: nextSlug,
      server: preferred.servidor,
      stream: streamUrl,
      m3u8Content,
      timestamp: Date.now()
    });

  } catch (err) {
    console.warn("Precache failed:", err);
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

// === Reproducción ===
async function loadStreamDirect(url, m3u8Content = null) {
  if (hlsInstance) {
    try {
      hlsInstance.destroy();
      if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
    } catch {}
    hlsInstance = null;
    currentBlobUrl = null;
  }

  const isM3U8 = url.endsWith(".m3u8") || m3u8Content;
  const isMP4 = url.endsWith(".mp4");

  if (isMP4) {
    video.src = url;
    video.load();
    video.addEventListener('loadedmetadata', async () => {
      loader.style.display = 'none';
      video.style.opacity = 1;
      video.muted = true;
      try {
        await video.play();
        await requestWakeLock();
      } catch {}
      await delay(10000);
      precacheNextEpisode(slug);
      video.muted = false;
    }, { once: true });
    return;
  }

  if (Hls.isSupported() && isM3U8) {
    hlsInstance = new Hls();
    if (m3u8Content) {
      const fixed = fixM3u8(m3u8Content, url);
      const blob = new Blob([fixed], { type: 'application/vnd.apple.mpegurl' });
      currentBlobUrl = URL.createObjectURL(blob);
      hlsInstance.loadSource(currentBlobUrl);
    } else {
      hlsInstance.loadSource(url);
    }
    hlsInstance.attachMedia(video);
    hlsInstance.on(Hls.Events.MANIFEST_PARSED, async () => {
      loader.style.display = 'none';
      video.style.opacity = 1;
      video.muted = true;
      try {
        await video.play();
        await requestWakeLock();
      } catch {}
      await delay(10000);
      precacheNextEpisode(slug);
      video.muted = false;
    });
    return;
  }

  video.src = url;
  video.load();
  video.addEventListener('loadedmetadata', async () => {
    loader.style.display = 'none';
    video.style.opacity = 1;
    video.muted = true;
    try {
      await video.play();
      await requestWakeLock();
    } catch {}
    await delay(10000);
    precacheNextEpisode(slug);
    video.muted = false;
  }, { once: true });
}

// === Cargar servidor por índice ===
async function loadServerByIndex(index) {
  if (index >= serverList.length) return;

  highlightActiveButton(index);
  const server = serverList[index].servidor.toLowerCase();
  loader.style.display = 'flex';
  video.style.opacity = 0;

  try {
    if (server === "sw") {
      const res = await fetch(`/api/m3u8?id=${config.id}&ep=${config.ep}`);
      const m3u8Text = await res.text();
      loadStreamDirect(currentUrl, m3u8Text);
      await savePrecached(currentUrl, {
        url: currentUrl,
        server: "sw",
        stream: currentUrl,
        m3u8Content: m3u8Text,
        timestamp: Date.now()
      });
      return;
    }

    if (server === "yu" || server === "YourUpload" || server === "yourupload") {
      const res = await fetch(`${API_BASE}?id=${config.id}&ep=${config.ep}&server=yu`);
      const json = await res.json();
      const streamUrl = `/api/stream?videoUrl=${encodeURIComponent(json.url)}`;
      loadStreamDirect(streamUrl);
      await savePrecached(currentUrl, {
        url: currentUrl,
        server: "yu",
        stream: streamUrl,
        m3u8Content: null,
        timestamp: Date.now()
      });
      return;
    }

    const res = await fetch(`${API_BASE}?id=${config.id}&ep=${config.ep}&server=${server}`);
    const streamUrl = (await res.text()).trim();
    loadStreamDirect(streamUrl);
    await savePrecached(currentUrl, {
      url: currentUrl,
      server,
      stream: streamUrl,
      m3u8Content: null,
      timestamp: Date.now()
    });

  } catch (err) {
    console.warn("Fallo servidor:", err);
    loadServerByIndex(index + 1);
  }
}

// === Wake Lock ===
async function requestWakeLock() {
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => console.log("🔓 Wake Lock liberado"));
    console.log("🔒 Wake Lock activado");
  } catch (err) {
    console.warn("No Wake Lock:", err.message);
  }
}

// === Inicio ===
async function start() {
  const cached = await loadPrecached(currentUrl);
  if (cached && cached.url === currentUrl) {
    console.log("Usando cache:", cached);
    loadStreamDirect(cached.stream, cached.m3u8Content || null);
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/servers?id=${config.id}&ep=${config.ep}`);
    serverList = await res.json();
    if (serverList.length === 0) throw new Error("No hay servidores disponibles");
    loadServerByIndex(0);
  } catch (err) {
    loader.textContent = 'Error al cargar servidores';
    video.style.opacity = 0;
    console.error(err);
  }
}

// === Iniciar ===
start();
