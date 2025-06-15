const API_BASE = "api";
const config = JSON.parse(document.getElementById("config").textContent);
const currentUrl = config.currentUrl;

const video = document.getElementById('player');
const loader = document.getElementById('loader');
const serverButtonsContainer = document.getElementById('serverButtons');

let hlsInstance = null;
let serverList = [];

async function loadServerByIndex(index) {
  if (index >= serverList.length) {
    loader.textContent = 'No se pudo cargar el video';
    video.style.opacity = 0;
    return;
  }

  highlightActiveButton(index);

  const server = serverList[index].servidor;
  const urlBuilder = `${API_BASE}?url=${encodeURIComponent(currentUrl)}&server=${encodeURIComponent(server)}`;

  loader.style.display = 'flex';
  video.style.opacity = 0;

  if (hlsInstance) {
    try { hlsInstance.destroy(); } catch (e) {}
    hlsInstance = null;
  }

  try {
    const res = await fetch(urlBuilder);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get("content-type") || "";

    if (contentType.includes("video")) {
      const streamUrl = res.url;

      video.pause();
      video.removeAttribute('src');
      video.src = streamUrl;
      video.load();

      video.addEventListener('loadedmetadata', () => {
        loader.style.display = 'none';
        video.style.opacity = 1;
        video.play().catch(err => console.warn("Play() error:", err));
      }, { once: true });

    } else {
      let streamUrl = (await res.text()).trim();
      if (!streamUrl.startsWith('http')) {
        const baseUrl = new URL(res.url);
        streamUrl = new URL(streamUrl, baseUrl).toString();
      }

      const isHls = streamUrl.includes('.m3u8');
      const finalUrl = `${streamUrl}?cb=${Date.now()}`; // evitar cache

      if (isHls && Hls.isSupported()) {
        hlsInstance = new Hls({
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          maxBufferSize: 60 * 1000 * 1000,
          liveSyncDurationCount: 3,
          enableWorker: true,
          lowLatencyMode: true
        });

        hlsInstance.loadSource(finalUrl);
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
            loadServerByIndex(index + 1);
          }
        });

      } else if (isHls && video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = finalUrl;
        video.load();

        video.addEventListener('loadedmetadata', () => {
          loader.style.display = 'none';
          video.style.opacity = 1;
          video.play().catch(err => console.warn("Play() error:", err));
        }, { once: true });

      } else {
        video.pause();
        video.removeAttribute('src');
        video.src = finalUrl;
        video.load();

        video.addEventListener('loadedmetadata', () => {
          loader.style.display = 'none';
          video.style.opacity = 1;
          video.play().catch(err => console.warn("Play() error:", err));
        }, { once: true });
      }
    }

  } catch (err) {
    console.warn("Fallo al cargar servidor:", err);
    loadServerByIndex(index + 1);
  }
}

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

async function start() {
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
  } catch (e) {
    console.error("Error al obtener servidores:", e);
    loader.textContent = 'Error al cargar servidores';
    video.style.opacity = 0;
  }
}

start();
