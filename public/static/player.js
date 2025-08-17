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

function setLoaderText(text) {
  const loaderSpan = document.getElementById('loaderText');
  if (loaderSpan) {
    loaderSpan.innerText = text;
  }
}

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
async function precacheNextEpisode(slug, triedServers = []) {
  const nextSlug = getNextEpisodeSlug(slug);
  if (!nextSlug) return;

  const cached = await loadPrecached(nextSlug);
  if (cached && cached.url === nextSlug) return;

  try {
    await delay(10000);
    const res = await fetch(`${API_BASE}/servers?id=${config.id}&ep=${parseInt(config.ep) + 1}`);
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
        const resM3u8 = await fetch(`/api?id=${config.id}&ep=${parseInt(config.ep) + 1}&server=sw`);
        if (!resM3u8.ok) throw new Error(`SW error: ${resM3u8.status}`);
        m3u8Content = await resM3u8.text();
        if (!m3u8Content || m3u8Content.includes("error")) throw new Error("M3U8 vacío o inválido");
        streamUrl = nextSlug;
      } else if (server === "yu" || server === "yourupload") {
        const resAlt = await fetch(`${API_BASE}?id=${config.id}&ep=${parseInt(config.ep) + 1}&server=yu`);
        if (!resAlt.ok) throw new Error(`YU error: ${resAlt.status}`);
        const json = await resAlt.json();
        if (!json.url) throw new Error("YU: URL no encontrada");
        streamUrl = `/api/stream?videoUrl=${encodeURIComponent(json.url)}`;
      } else {
        const resAlt = await fetch(`${API_BASE}?id=${config.id}&ep=${parseInt(config.ep) + 1}&server=${server}`);
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
    console.info(url)
    video.load();
    video.addEventListener('loadedmetadata', async () => {
      loader.style.display = 'none';
      video.style.opacity = 1;
      video.muted = false;
      try {
        await video.play();
        await requestWakeLock();
      } catch {}
      await delay(10000);
      precacheNextEpisode(slug);
  
    }, { once: true });
    return;
  }

  if (Hls.isSupported() && isM3U8) {
    hlsInstance = new Hls();
    if (m3u8Content) {
      const fixed = fixM3u8(m3u8Content, url);
      const blob = new Blob([fixed], { type: 'application/vnd.apple.mpegurl' });
      currentBlobUrl = URL.createObjectURL(blob);
      console.info(currentBlobUrl)
      hlsInstance.loadSource(currentBlobUrl);
    } else {
      hlsInstance.loadSource(url);
    }
    hlsInstance.attachMedia(video);
    hlsInstance.on(Hls.Events.MANIFEST_PARSED, async () => {
      loader.style.display = 'none';
      video.style.opacity = 1;
      video.muted = false;
      try {
        await video.play();
        await requestWakeLock();
      } catch {}
      await delay(10000);
      precacheNextEpisode(slug);
  
    });
    return;
  }

  video.src = url;
  console.info(url)
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

  }, { once: true });
}


// === Cargar servidor por índice ===
let currentMirror = 1;

async function loadServerByIndex(index) {
  function buildApiUrl(baseUrl) {
    if (currentMirror === 2) return `${baseUrl}&mirror=2`;
    if (currentMirror === 3) return `${baseUrl}&mirror=3`;
    return baseUrl; // mirror 1 por defecto
  }

  if (index >= serverList.length) {
    // Cambiar mirror solo si no es el último mirror (3)
    if (currentMirror < 3) {
      currentMirror++; // Avanza al siguiente mirror

      try {
        const res = await fetch(`/api/servers?id=${config.id}&ep=${config.ep}&mirror=${currentMirror}`);
        if (!res.ok) throw new Error(`No se pudo cargar el mirror ${currentMirror}`);

        const newList = await res.json();
        if (!Array.isArray(newList) || newList.length === 0) {
          throw new Error(`Mirror ${currentMirror} sin servidores`);
        }

        serverList = newList;
        console.log(`[Player] Cambiado a mirror=${currentMirror} con ${serverList.length} servidores`);
        await loadServerByIndex(0);
        return;

      } catch (err) {
        console.error(`[Player] Falló la carga del mirror ${currentMirror}:`, err.message);
        loader.style.display = 'none';
        return;
      }
    }

    // Si ya agotaste todos los mirrors
    console.error('Todos los mirrors fallaron');
    loader.style.display = 'none';
    return;
  }

  const server = serverList[index].servidor.toLowerCase();
  highlightActiveButton(index);
  loader.style.display = 'flex';
  video.style.opacity = 0;

  let success = false;
  const swUrls = [
    `/api?id=${config.id}&ep=${config.ep}&server=sw&mirror=1`,
    `/api?id=${config.id}&ep=${config.ep}&server=sw&mirror=2`, 
    `/api?id=${config.id}&ep=${config.ep}&server=sw&mirror=3`,
    `/api?id=${config.id}&ep=${config.ep}&server=sw&mirror=4`  
  ];
  const yuUrls = [
    `/api?id=${config.id}&ep=${config.ep}&server=yu&mirror=1`,
    `/api?id=${config.id}&ep=${config.ep}&server=yu&mirror=2`,
    `/api?id=${config.id}&ep=${config.ep}&server=yu&mirror=3`,
    `/api?id=${config.id}&ep=${config.ep}&server=yu&mirror=4`
  ];
  const bcUrls = [
    `/api?id=${config.id}&ep=${config.ep}&server=bc&mirror=1`,
    `/api?id=${config.id}&ep=${config.ep}&server=bc&mirror=2`,
    `/api?id=${config.id}&ep=${config.ep}&server=bc&mirror=3`,
    `/api?id=${config.id}&ep=${config.ep}&server=bc&mirror=4`
  ];
  try {
    if (server === "yu" || server === "yourupload") {
      setLoaderText(`Servidor YU ${currentMirror}`);
      let lastError;

      for (const url of yuUrls) { // Asume que existe un array 'yuUrls'
        try {
          const res = await fetch(buildApiUrl(url));
          if (!res.ok) throw new Error("YU: respuesta no OK");
          
          const json = await res.json();
          if (!json.url) throw new Error("YU: URL vacía");

          const streamUrl = `/api/stream?videoUrl=${encodeURIComponent(json.url)}`;
          loadStreamDirect(streamUrl);
          await savePrecached(currentUrl, {
            url: currentUrl,
            server: "yu",
            stream: streamUrl,
            m3u8Content: null,
            timestamp: Date.now()
          });

          success = true;
          break; // Si tiene éxito, sale del bucle
        } catch (error) {
          console.error(`Intento fallido con la URL: ${url}`, error);
          lastError = error;
        }
      }

      if (!success) {
        throw new Error(`YU: todos los intentos fallaron. Último error: ${lastError.message}`);
      }
    } else if (server === "bc" || server === "burcloud") {
      let lastError;
      setLoaderText(`Servidor BC ${currentMirror}`);
      for (const url of bcUrls) { // Asume que existe un array 'bcUrls'
        try {
          const res = await fetch(buildApiUrl(url));
          if (!res.ok) throw new Error("BC: respuesta no OK");
          
          const json = await res.json();
          if (!json.url) throw new Error("BC: URL vacía");

          const streamUrl = `/api/stream?videoUrl=${encodeURIComponent(json.url)}`;
          loadStreamDirect(streamUrl);
          await savePrecached(currentUrl, {
            url: currentUrl,
            server: "bc",
            stream: streamUrl,
            m3u8Content: null,
            timestamp: Date.now()
          });

          success = true;
          break; // Si tiene éxito, sale del bucle
        } catch (error) {
          console.error(`Intento fallido con la URL: ${url}`, error);
          lastError = error;
        }
      }

      if (!success) {
        throw new Error(`BC: todos los intentos fallaron. Último error: ${lastError.message}`);
      }
    } else if (server === "sw") {
      let lastError;
      setLoaderText(`Servidor SW ${currentMirror}`);
      for (const url of swUrls) {
        try {
          const res = await fetch(buildApiUrl(url));
          if (!res.ok) throw new Error("SW: respuesta no OK");
          
          const m3u8Text = await res.text();
          if (!m3u8Text || m3u8Text.includes("error")) throw new Error("SW: m3u8 inválido");

          loadStreamDirect(currentUrl, m3u8Text);
          await savePrecached(currentUrl, {
            url: currentUrl,
            server: "sw",
            stream: currentUrl,
            m3u8Content: m3u8Text,
            timestamp: Date.now()
          });

          success = true;
          break; // Si tiene éxito, sale del bucle
        } catch (error) {
          console.error(`Intento fallido con la URL: ${url}`, error);
          lastError = error;
        }
      }

      if (!success) {
        throw new Error(`SW: todos los intentos fallaron. Último error: ${lastError.message}`);
      }
    } 
    // --- MEGA ---
    else if (server === "mega") {
      setLoaderText(`Servidor MEGA, cargando Iframe`);
      const megaUrl = serverList[index].url || "";
      if (!megaUrl) throw new Error("MEGA: URL no encontrada");

      if (hlsInstance) {
        try {
          hlsInstance.destroy();
          if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
        } catch {}
        hlsInstance = null;
        currentBlobUrl = null;
      }

      video.pause();
      video.style.display = 'none';

      const existingIframe = document.getElementById('megaIframe');
      if (existingIframe) existingIframe.remove();

      const iframe = document.createElement('iframe');
      iframe.src = megaUrl.replace('/file/', '/embed/');
      iframe.allowFullscreen = true;
      iframe.id = 'megaIframe';

      iframe.style.width = '100%';
      iframe.style.height = '200px';
      iframe.style.border = 'none';
      iframe.style.display = 'block';
      iframe.className = video.className;
      iframe.style.borderRadius = '1rem';

      video.parentElement.insertBefore(iframe, video.nextSibling);
      loader.style.display = 'none';

      success = true;
    }
    // --- CUALQUIER OTRO ---
    else {
      setLoaderText(`Servidor ${server.toUpperCase()}, cargando...`);
      const res = await fetch(buildApiUrl(`${API_BASE}?id=${config.id}&ep=${config.ep}&server=${server}`));
      if (!res.ok) throw new Error(`${server}: respuesta no OK`);
      const streamUrl = (await res.text()).trim();
      if (!streamUrl) throw new Error(`${server}: stream URL vacía`);

      loadStreamDirect(streamUrl);
      await savePrecached(currentUrl, {
        url: currentUrl,
        server,
        stream: streamUrl,
        m3u8Content: null,
        timestamp: Date.now()
      });

      success = true;
    }
  } catch (err) {
    console.warn(`Fallo servidor "${server}":`, err.message || err);
  }

  if (!success) {
    await loadServerByIndex(index + 1);
  } else {
    loader.style.display = 'none';
    video.style.opacity = 1;
  }
}


// === Wake Lock ===
async function requestWakeLock() {
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => console.log("🔓 Wake Lock liberado"));
    console.info("[WAKE] Wake Lock activado");
  } catch (err) {
    console.warn("No Wake Lock:", err.message);
  }
}

// === Iniciar ===
async function start(mirrorNumber = 1) {
  const ads = localStorage.getItem("ads") === "true";
  console.info("[INFO] Anuncios:", ads ? "Activados" : "Desactivados");
  setLoaderText("Cargando servidores...");

  try {
    const mirrorParam = mirrorNumber > 1 ? `&mirror=${mirrorNumber}` : "";
    const res = await fetch(`${API_BASE}/servers?id=${config.id}&ep=${config.ep}${mirrorParam}`);
    let servers = await res.json();

    if (!servers || servers.length === 0) throw new Error("No hay servidores disponibles");

    // Normaliza nombres de servidor
    serverList = servers.map(s => ({
      ...s,
      servidor: s.servidor.toLowerCase(),
    }));

    // Contenedor botones, creamos si no existe
    let serverButtonsContainer = document.getElementById('serverButtons');
    if (!serverButtonsContainer) {
      serverButtonsContainer = document.createElement('div');
      serverButtonsContainer.id = 'serverButtons';
      serverButtonsContainer.style.display = 'flex';
      serverButtonsContainer.style.gap = '10px';
      serverButtonsContainer.style.flexWrap = 'wrap';
      serverButtonsContainer.style.justifyContent = 'center';
      serverButtonsContainer.style.margin = '1rem 0';
      video.parentElement.insertBefore(serverButtonsContainer, video);
    }

    function limpiarIframeYVideo() {
      const existingIframe = document.getElementById('adsIframe');
      if (existingIframe) existingIframe.remove();

      video.pause();
      video.style.display = 'none';
    }

    function cargarServidor(server) {
      limpiarIframeYVideo();

      let url = server.url;
      if (server.servidor === 'mega') {
        url = url.replace('/file/', '/embed/');
      }

      const iframe = document.createElement('iframe');
      iframe.src = url;
      iframe.id = "adsIframe";
      iframe.allowFullscreen = true;
      iframe.style.width = '100%';
      iframe.style.height = window.innerWidth > 500 ? '485px' : '185px';
      iframe.style.border = 'none';
      iframe.style.display = 'block';
      iframe.style.borderRadius = '1rem';
      iframe.style.opacity = 1;

      video.parentElement.insertBefore(iframe, video.nextSibling);
      loader.style.display = 'none';

      // Actualiza estilos de botones para activo/inactivo
      document.querySelectorAll('#serverButtons button').forEach(btn => {
        if (btn.dataset.servidor === server.servidor) {
          btn.classList.add('active');
          btn.style.background = 'linear-gradient(135deg, #4ade80, #22c55e)';
          btn.style.boxShadow = '0 6px 14px rgba(34, 197, 94, 0.6)';
        } else {
          btn.classList.remove('active');
          btn.style.background = 'linear-gradient(135deg, #3b82f6, #2563eb)';
          btn.style.boxShadow = '0 6px 10px rgba(37, 99, 235, 0.4)';
        }
      });
    }

    function crearBotones(servers) {
      serverButtonsContainer.innerHTML = '';

      servers.forEach(server => {
        const btn = document.createElement('button');
        btn.textContent = server.servidor;
        btn.dataset.servidor = server.servidor;

        btn.style.cursor = 'pointer';
        btn.style.padding = '10px 18px';
        btn.style.borderRadius = '12px';
        btn.style.border = 'none';
        btn.style.background = 'linear-gradient(135deg, #3b82f6, #2563eb)';
        btn.style.color = 'white';
        btn.style.fontWeight = '600';
        btn.style.fontFamily = 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif';
        btn.style.boxShadow = '0 6px 10px rgba(37, 99, 235, 0.4)';
        btn.style.transition = 'transform 0.15s ease, box-shadow 0.15s ease';
        btn.style.minWidth = '90px';
        btn.style.textTransform = 'capitalize';

        btn.onmouseenter = () => {
          btn.style.transform = 'scale(1.08)';
          btn.style.boxShadow = btn.classList.contains('active')
            ? '0 10px 20px rgba(34, 197, 94, 0.8)'
            : '0 10px 18px rgba(37, 99, 235, 0.7)';
        };
        btn.onmouseleave = () => {
          btn.style.transform = 'scale(1)';
          btn.style.boxShadow = btn.classList.contains('active')
            ? '0 6px 14px rgba(34, 197, 94, 0.6)'
            : '0 6px 10px rgba(37, 99, 235, 0.4)';
        };
        btn.onmousedown = () => {
          btn.style.transform = 'scale(0.96)';
          btn.style.boxShadow = btn.classList.contains('active')
            ? '0 4px 8px rgba(34, 197, 94, 0.5)'
            : '0 4px 6px rgba(37, 99, 235, 0.5)';
        };
        btn.onmouseup = () => {
          btn.style.transform = 'scale(1.08)';
          btn.style.boxShadow = btn.classList.contains('active')
            ? '0 10px 20px rgba(34, 197, 94, 0.8)'
            : '0 10px 18px rgba(37, 99, 235, 0.7)';
        };

        btn.onclick = () => cargarServidor(server);

        serverButtonsContainer.appendChild(btn);
      });
    }

    if (ads) {
      const orden = ["yu", "mega", "sw", "voe"];
      serverList.sort((a, b) => {
        const ia = orden.indexOf(a.servidor);
        const ib = orden.indexOf(b.servidor);
        if (ia === -1 && ib === -1) return 0;
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });

      crearBotones(serverList);

      const firstServer = serverList.find(s =>
        orden.includes(s.servidor) || orden.some(name => s.servidor.includes(name))
      ) || serverList[0];

      if (firstServer) {
        cargarServidor(firstServer);
      } else {
        loader.textContent = "No se encontró ningún servidor disponible";
      }

      return;
    }

    // Aquí el orden para no ads
    serverList.sort((a, b) => {
      if (a.servidor === 'mega' || a.servidor === 'mega.nz') return 1;
      if (b.servidor === 'mega' || b.servidor === 'mega.nz') return -1;
      return 0;
    });

    await loadServerByIndex(0);

  } catch (err) {
    if (mirrorNumber < 4) {
      console.warn(`🔁 Reintentando con mirror=${mirrorNumber + 1}...`);
      setLoaderText(`Cargando servidor ${mirrorNumber + 1}...`);
      return start(mirrorNumber + 1); // 🔁 Retry con siguiente mirror
    }

    video.style.opacity = 0;
    console.error("🚨 start() error:", err);
  }
}

// === Iniciar ===
start();
