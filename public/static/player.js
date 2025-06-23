const API_BASE = "api";
const config = JSON.parse(document.getElementById("config").textContent);
let currentUrl = config.currentUrl;

const video = document.getElementById('player');
const loader = document.getElementById('loader');
const serverButtonsContainer = document.getElementById('serverButtons');

let hlsInstance = null;
let serverList = [];
let precargado = null;
let currentBlobUrl = null;

// 🔁 Obtener siguiente URL
function getNextEpisodeUrl(url) {
  const match = url.match(/-(\d+)$/);
  if (!match) return null;
  const currentEp = parseInt(match[1], 10);
  return url.replace(/-\d+$/, `-${currentEp + 1}`);
}

// ✅ Guardar precarga en sessionStorage
function guardarPrecargado() {
  if (precargado) {
    sessionStorage.setItem('precargado', JSON.stringify(precargado));
  }
}

// ✅ Restaurar precarga si existe
function restaurarPrecargado() {
  const data = sessionStorage.getItem('precargado');
  if (data) {
    try {
      const parsed = JSON.parse(data);
      if (parsed.url && parsed.stream) {
        precargado = parsed;
        console.log("🔁 Precargado restaurado de sessionStorage:", precargado);
      }
    } catch (e) {
      console.warn("❌ Fallo al restaurar precargado:", e);
    }
  }
}

// ✅ Precargar siguiente episodio
async function precargarSiguienteEpisodio(urlActual) {
  const siguienteUrl = getNextEpisodeUrl(urlActual);
  if (!siguienteUrl) return;

  try {
    const res = await fetch(`${API_BASE}/servers?url=${encodeURIComponent(siguienteUrl)}`);
    const servidores = await res.json();

    const preferido = servidores.find(s => s.servidor.toLowerCase() === "sw") ||
                      servidores.find(s => s.servidor.toLowerCase() === "stape") ||
                      servidores[0];

    if (!preferido) return;

    let streamUrl = "";
    let m3u8Content = null;

    if (preferido.servidor.toLowerCase() === "sw") {
      const resM3u8 = await fetch(`/api/m3u8?url=${encodeURIComponent(siguienteUrl)}`);
      if (!resM3u8.ok) throw new Error(`SW no respondió: ${resM3u8.status}`);
      m3u8Content = await resM3u8.text();
      streamUrl = siguienteUrl;
    } else {
      const resAlt = await fetch(`${API_BASE}?url=${encodeURIComponent(siguienteUrl)}&server=${encodeURIComponent(preferido.servidor)}`);
      if (!resAlt.ok) throw new Error(`Servidor no respondió: ${resAlt.status}`);
      streamUrl = (await resAlt.text()).trim();
    }

    precargado = {
      url: siguienteUrl,
      servidor: preferido.servidor,
      stream: streamUrl,
      m3u8Content: m3u8Content
    };

    guardarPrecargado();
    console.log("✅ Episodio siguiente precargado correctamente:", precargado);
  } catch (err) {
    console.warn("❌ Falló la precarga del siguiente episodio:", err);
    precargado = null;
    sessionStorage.removeItem('precargado');
  }
}

// ▶️ Reproducir siguiente episodio precargado
function reproducirSiguienteEpisodio() {
  if (precargado && precargado.url === getNextEpisodeUrl(currentUrl)) {
    console.log("▶ Reproduciendo precargado:", precargado);
    currentUrl = precargado.url;
    cargarStreamDirecto(precargado.stream, precargado.m3u8Content || null);
    precargado = null;
    sessionStorage.removeItem('precargado');
    precargarSiguienteEpisodio(currentUrl);
  } else {
    const nextUrl = getNextEpisodeUrl(currentUrl);
    if (nextUrl) {
      window.location.href = `/player?url=${encodeURIComponent(nextUrl)}`;
    }
  }
}

// 🔁 Convertir rutas relativas a absolutas
function absolutizarM3u8(content, baseUrl) {
  return content.replace(/^(?!#)([^:\n][^\n]*)$/gm, line => {
    try {
      return new URL(line, baseUrl).href;
    } catch {
      return line;
    }
  });
}

// 🔁 Reproducir URL directa o con m3u8 string
function cargarStreamDirecto(url, m3u8Content = null) {
  if (hlsInstance) {
    try {
      hlsInstance.destroy();
      if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
    } catch (e) {}
    hlsInstance = null;
    currentBlobUrl = null;
  }

  if (Hls.isSupported()) {
    hlsInstance = new Hls();

    if (m3u8Content) {
      const fixedContent = absolutizarM3u8(m3u8Content, url);
      const blob = new Blob([fixedContent], { type: 'application/vnd.apple.mpegurl' });
      currentBlobUrl = URL.createObjectURL(blob);
      hlsInstance.loadSource(currentBlobUrl);
    } else {
      hlsInstance.loadSource(url);
    }

    hlsInstance.attachMedia(video);

    hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
      loader.style.display = 'none';
      video.style.opacity = 1;
      video.play().catch(err => console.warn("Play() error:", err));
    });

    hlsInstance.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        console.warn("HLS Fatal:", data);
        hlsInstance.destroy();
      }
    });

  } else {
    video.src = url;
    video.load();
    video.addEventListener('loadedmetadata', () => {
      loader.style.display = 'none';
      video.style.opacity = 1;
      video.play().catch(err => console.warn("Play() error:", err));
    }, { once: true });
  }
}

// 🔁 Cargar servidor
async function loadServerByIndex(index) {
  if (index >= serverList.length) {
    loader.textContent = 'No se pudo cargar el video';
    video.style.opacity = 0;
    return;
  }

  highlightActiveButton(index);
  const server = serverList[index].servidor;
  const serverName = server.toLowerCase();
  const urlBuilder = `${API_BASE}?url=${encodeURIComponent(currentUrl)}&server=${encodeURIComponent(server)}`;

  loader.style.display = 'flex';
  video.style.opacity = 0;

  if (hlsInstance) {
    try {
      hlsInstance.destroy();
      if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
    } catch (e) {}
    hlsInstance = null;
    currentBlobUrl = null;
  }

  try {
    if (serverName === 'sw') {
      const res = await fetch(`/api/m3u8?url=${encodeURIComponent(currentUrl)}`);
      if (!res.ok) throw new Error(`SW no respondió: ${res.status}`);
      const m3u8Text = await res.text();
      cargarStreamDirecto(currentUrl, m3u8Text);
      return;
    }

    const res = await fetch(urlBuilder);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let streamUrl = (await res.text()).trim();

    if (!streamUrl.startsWith('http')) {
      const baseUrl = new URL(res.url);
      streamUrl = new URL(streamUrl, baseUrl).toString();
    }

    cargarStreamDirecto(streamUrl);
  } catch (err) {
    console.warn("Fallo al cargar servidor:", err);
    loadServerByIndex(index + 1);
  }
}

// UI
function highlightActiveButton(activeIndex) {
  const buttons = serverButtonsContainer.querySelectorAll("button");
  buttons.forEach((btn, i) => {
    btn.classList.toggle("active", i === activeIndex);
  });
}

function renderServerButtons() {
  serverButtonsContainer.innerHTML = "";
  serverList.forEach((srv, index) => {
    const btn = document.createElement("button");
    btn.textContent = srv.servidor;
    btn.onclick = () => loadServerByIndex(index);
    serverButtonsContainer.appendChild(btn);
  });
}

// ▶️ Inicio
async function start() {
  restaurarPrecargado();

  if (precargado && precargado.url === currentUrl) {
    console.log("▶️ Usando stream precargado para este episodio:", precargado);
    cargarStreamDirecto(precargado.stream, precargado.m3u8Content || null);
    precargado = null;
    sessionStorage.removeItem('precargado');
    precargarSiguienteEpisodio(currentUrl);
    return;
  }

  if (precargado && precargado.url !== currentUrl) {
    console.log("🧹 Precarga no corresponde a este episodio, se elimina");
    precargado = null;
    sessionStorage.removeItem('precargado');
  }

  try {
    const res = await fetch(`${API_BASE}/servers?url=${encodeURIComponent(currentUrl)}`);
    serverList = await res.json();

    if (serverList.length === 0) {
      loader.textContent = 'No hay servidores disponibles';
      video.style.opacity = 0;
      return;
    }

    renderServerButtons();
    loadServerByIndex(0);

    setTimeout(() => {
      precargarSiguienteEpisodio(currentUrl);
    }, 20000);
  } catch (e) {
    console.error("Error al obtener servidores:", e);
    loader.textContent = 'Error al cargar servidores';
    video.style.opacity = 0;
  }
}

start();
