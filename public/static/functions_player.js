  async function initPlayerPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');
    const ep = parseInt(urlParams.get('ep'));

    if (!id || isNaN(ep)) {
      document.getElementById("anime-title").innerText = "Faltan parámetros";
      setTimeout(() => {
        location.href = '/';
      }, 1000);
      return;
    }

    try {
      const res = await fetch(`/api/player?id=${encodeURIComponent(id)}&ep=${ep}`);
      const data = await res.json();

      if (data.error) {
        document.getElementById("anime-title").innerText = "Error: " + data.error;
        if (data.error.includes("Episodio inválido")) {
          const validEp = data.valid_ep || 1;
          setTimeout(() => {
            location.href = `/player?id=${encodeURIComponent(id)}&ep=${validEp}`;
          }, 500);
        }
        return;
      }

      document.getElementById("anime-title").innerText = data.anime_title;
      // titulo de la pagina
      document.title = `${data.anime_title}`;

      document.getElementById("config").textContent = JSON.stringify({
        id: id,
        ep: ep,
        nextUrl: (ep < data.episodes_count) ? `/player?id=${encodeURIComponent(id)}&ep=${ep + 1}` : null,
        title: data.anime_title
      });

      const navButtons = document.getElementById("nav-buttons");

      if (ep > 1) {
        const btnPrev = document.createElement("button");
        btnPrev.title = "Anterior";
        btnPrev.innerHTML = '<i class="bi bi-arrow-left"></i>';
        btnPrev.onclick = () => location.href = `/player?id=${encodeURIComponent(id)}&ep=${ep - 1}`;
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
        btnNext.onclick = () => location.href = `/player?id=${encodeURIComponent(id)}&ep=${ep + 1}`;
        navButtons.appendChild(btnNext);
      }

      const infoSpan = document.createElement("span");
      infoSpan.innerText = ` Episodio ${ep} / ${data.episodes_count} `;
      navButtons.appendChild(infoSpan);

      // Tema
      const themeBtn = document.createElement("button");
      themeBtn.id = "theme-toggle";
      themeBtn.title = "Cambiar tema";
      themeBtn.innerHTML = '<i class="bi bi-moon-stars-fill"></i>';
      themeBtn.style.width = "48px";
      themeBtn.style.height = "48px";
      themeBtn.style.borderRadius = "50%";
      themeBtn.style.fontSize = "1.2rem";
      themeBtn.style.backgroundColor = "#00bfa5";
      themeBtn.style.color = "#fff";
      themeBtn.style.border = "none";
      themeBtn.style.display = "flex";
      themeBtn.style.alignItems = "center";
      themeBtn.style.justifyContent = "center";
      themeBtn.style.marginLeft = "10px";
      themeBtn.style.transition = "background-color 0.3s";
      themeBtn.onmouseover = () => themeBtn.style.backgroundColor = "#009e87";
      themeBtn.onmouseout = () => themeBtn.style.backgroundColor = "#00bfa5";
      navButtons.appendChild(themeBtn);

      // Lista de episodios
      const episodeList = document.getElementById("episode-list");
      const episodesPerPage = 12;
      let currentGroup = Math.floor((ep - 1) / episodesPerPage);

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
          const btn = document.createElement("a");
          btn.href = `/player?id=${encodeURIComponent(id)}&ep=${i}`;
          btn.className = "btn episode-btn" + (i === ep ? " active" : "");
          btn.textContent = i;
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

      const script = document.createElement("script");
      script.src = "/static/player.js";
      document.body.appendChild(script);

      script.onload = () => {
        const config = JSON.parse(document.getElementById("config").textContent);
        const video = document.getElementById("player");
        let autoNextTriggered = false;

        video.addEventListener('timeupdate', () => {
          if (!video.duration) return;
          const remaining = video.duration - video.currentTime;
          if (remaining <= 5 && !autoNextTriggered) {
            autoNextTriggered = true;
            const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
            if (config.nextUrl) {
              if (isFullscreen) localStorage.setItem("keepFullscreen", "1");
              window.location.href = config.nextUrl;
            }
          }
        });

        video.addEventListener('loadedmetadata', () => {
          document.getElementById("loader").style.display = "none";
          video.style.opacity = 1;

          if (localStorage.getItem("keepFullscreen") === "1") {
            localStorage.removeItem("keepFullscreen");
            const wrapper = video.parentElement;
            if (wrapper.requestFullscreen) wrapper.requestFullscreen();
          }
        });

        const toggleButton = document.getElementById("theme-toggle");

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
      };
    } catch (e) {
      document.getElementById("anime-title").innerText = "Error de carga.";
      console.error(e);
    }
  }

  window.addEventListener('DOMContentLoaded', initPlayerPage);