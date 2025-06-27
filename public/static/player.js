const API_BASE = "api";
const config = JSON.parse(document.getElementById("config").textContent);
let currentUrl = config.currentUrl;
const video = document.getElementById('player');
const loader = document.getElementById('loader');
const serverButtonsContainer = document.getElementById('serverButtons');

let hlsInstance = null;
let serverList = [];
let currentBlobUrl = null;
let wakeLock = null;

// --- IndexedDB setup ---
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

// --- Helpers y funciones previas ---

function getStorageKey(url) {
  const match = url.match(/ver\/([^\/?#]+)/);
  return match ? `precached-${match[1]}` : 'precached-unknown';
}

function isCacheValid(entry) {
  if (!entry?.timestamp) return false;
  return Date.now() - entry.timestamp < 12 * 60 * 60 * 1000;
}

async function savePrecached(url, data) {
  const entry = { ...data, url };
  try {
    await idbPut(entry);
  } catch (e) {
    console.error('Error guardando en IndexedDB:', e);
  }
}

async function loadPrecached(url) {
  try {
    const entry = await idbGet(url);
    if (!entry) return null;
    return isCacheValid(entry) ? entry : null;
  } catch (e) {
    console.error('Error leyendo de IndexedDB:', e);
    return null;
  }
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

function getNextEpisodeUrl(url) {
  const match = url.match(/-(\d+)$/);
  if (!match) return null;
  const currentEp = parseInt(match[1], 10);
  return url.replace(/-\d+$/, `-${currentEp + 1}`);
}

function highlightActiveButton(activeIndex) {
  const buttons = serverButtonsContainer.querySelectorAll("button");
  buttons.forEach((btn, i) => {
    btn.classList.toggle("active", i === activeIndex);
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Funciones principales ---

async function precacheNextEpisode(url, retry = true) {
  const nextUrl = getNextEpisodeUrl(url);
  if (!nextUrl) return;

  const cached = await loadPrecached(nextUrl);
  if (cached && cached.url === nextUrl) {
    console.log("🟡 Next episode already cached, skipping precache.");
    return;
  }

  try {
    console.log(`⏳ Waiting 10 seconds before precaching next episode: ${nextUrl}`);
    await delay(10000);

    console.log(`🔍 Fetching servers for ${nextUrl}`);
    const res = await fetch(`${API_BASE}/servers?url=${encodeURIComponent(nextUrl)}`);
    if (!res.ok) throw new Error(`Error fetching servers: ${res.status}`);

    const servers = await res.json();
    const preferred = servers.find(s => s.servidor.toLowerCase() === "sw") ||
                      servers.find(s => s.servidor.toLowerCase() === "yu") ||
                      servers[0];
    if (!preferred) return;

    let streamUrl = "", m3u8Content = null;

    if (preferred.servidor.toLowerCase() === "sw") {
      console.log("📥 Fetching m3u8 content from SW server");
      const resM3u8 = await fetch(`/api/m3u8?url=${encodeURIComponent(nextUrl)}`);
      if (!resM3u8.ok) throw new Error(`SW error: ${resM3u8.status}`);
      m3u8Content = await resM3u8.text();
      streamUrl = nextUrl;
    } else {
      console.log(`📥 Fetching stream URL from server ${preferred.servidor}`);
      const resAlt = await fetch(`${API_BASE}?url=${encodeURIComponent(nextUrl)}&server=${preferred.servidor}`);
      if (!resAlt.ok) throw new Error(`Alt error: ${resAlt.status}`);
      streamUrl = (await resAlt.text()).trim();
    }

    const entry = {
      url: nextUrl,
      server: preferred.servidor,
      stream: streamUrl,
      m3u8Content,
      timestamp: Date.now()
    };

    await savePrecached(nextUrl, entry);
    console.log("✅ Next episode precached:", entry);

  } catch (err) {
    console.warn("❌ Failed to precache:", err);
    if (retry) {
      console.log("🔄 Retrying precache in 5 seconds...");
      await delay(5000);
      await precacheNextEpisode(url, false);
    }
  }
}

async function loadStreamDirect(url, m3u8Content = null) {
  if (hlsInstance) {
    try {
      hlsInstance.destroy();
      if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
    } catch {}
    hlsInstance = null;
    currentBlobUrl = null;
  }

  if (Hls.isSupported()) {
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
      } catch (err) {
        console.warn("Play() error:", err);
      }

      await delay(10000);
      precacheNextEpisode(currentUrl);
      video.muted = false;
    });

    hlsInstance.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        console.warn("HLS Fatal Error:", data);
        hlsInstance.destroy();
      }
    });

  } else {
    video.src = url;
    video.load();
    video.addEventListener('loadedmetadata', async () => {
      loader.style.display = 'none';
      video.style.opacity = 1;
      video.muted = true;
      try {
        await video.play();
        await requestWakeLock();
      } catch (err) {
        console.warn("Play() error:", err);
      }

      await delay(10000);
      precacheNextEpisode(currentUrl);
      video.muted = false;
    }, { once: true });
  }
}

// Solicitar Wake Lock
async function requestWakeLock() {
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    console.log("🔒 Wake Lock activado");

    wakeLock.addEventListener('release', () => {
      console.log('🔓 Wake Lock liberado');
    });
  } catch (err) {
    console.error(`${err.name}, no se pudo mantener la pantalla activa:`, err.message);
  }
}

document.addEventListener('visibilitychange', () => {
  if (wakeLock !== null && document.visibilityState === 'visible') {
    requestWakeLock();
  }
});

async function loadServerByIndex(index) {
  if (index >= serverList.length) {
    loader.textContent = 'Failed to load stream';
    video.style.opacity = 0;
    return;
  }

  highlightActiveButton(index);
  const server = serverList[index].servidor;
  const serverName = server.toLowerCase();
  const serverUrl = `${API_BASE}?url=${encodeURIComponent(currentUrl)}&server=${server}`;

  loader.style.display = 'flex';
  video.style.opacity = 0;

  if (hlsInstance) {
    try {
      hlsInstance.destroy();
      if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
    } catch {}
    hlsInstance = null;
    currentBlobUrl = null;
  }

  try {
    if (serverName === "sw") {
      const res = await fetch(`/api/m3u8?url=${encodeURIComponent(currentUrl)}`);
      if (!res.ok) throw new Error(`SW server error: ${res.status}`);
      const m3u8Text = await res.text();
      loadStreamDirect(currentUrl, m3u8Text);

      const entry = {
        url: currentUrl,
        server: "sw",
        stream: currentUrl,
        m3u8Content: m3u8Text,
        timestamp: Date.now()
      };
      await savePrecached(currentUrl, entry);
      return;
    }

    const res = await fetch(serverUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let streamUrl = (await res.text()).trim();
    if (!streamUrl.startsWith("http")) {
      const baseUrl = new URL(res.url);
      streamUrl = new URL(streamUrl, baseUrl).toString();
    }

    loadStreamDirect(streamUrl);

    const entry = {
      url: currentUrl,
      server,
      stream: streamUrl,
      m3u8Content: null,
      timestamp: Date.now()
    };
    await savePrecached(currentUrl, entry);

  } catch (err) {
    console.warn("Server failed:", err);
    loadServerByIndex(index + 1);
  }
}

async function start() {
  const cached = await loadPrecached(currentUrl);
  if (cached && cached.url === currentUrl) {
    console.log("▶️ Using cached stream:", cached);
    loadStreamDirect(cached.stream, cached.m3u8Content || null);
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/servers?url=${encodeURIComponent(currentUrl)}`);
    serverList = await res.json();
    if (serverList.length === 0) {
      loader.textContent = 'No servers found';
      video.style.opacity = 0;
      return;
    }

    loadServerByIndex(0);

  } catch (err) {
    console.error("Failed to load servers:", err);
    loader.textContent = 'Error loading servers';
    video.style.opacity = 0;
  }
}

start();
