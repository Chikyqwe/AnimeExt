/**
 * =======================================================
 * VARIABLES GLOBALES
 * =======================================================
 * Declaración de variables globales y constantes.
 */
let container, mainContent, recolectForm, pageTitle, suggestionBox, hamburgerBtn, mobileDropdownMenu;

const DB_NAME = 'FavoritosDB';
const DB_VERSION = 1;
const STORE_NAME = 'favoritos';
const DB_NAME_F = 'AnimeCacheDB';
const STORE_NAME_F = 'precached';
let mainInitEjecutado = false; // bandera global
let dbPromise = null;
let currentAnime = null;
const loadedCards = new Map();
let fullAnimeList = [];

/**
 * =======================================================
 * INICIALIZACIÓN DE LA APLICACIÓN
 * =======================================================
 */
(() => {
  const modalHTML = `
    <div id="chikiModal" style="
      display:none; 
      position:fixed; 
      top:0; left:0; right:0; bottom:0; 
      background-color: rgba(0,0,0,0.6); 
      z-index:1000; 
      justify-content:center; 
      align-items:center;
    ">
      <div style="
        background:#222; 
        color:#fff; 
        padding:30px 40px; 
        border-radius:8px; 
        text-align:center; 
        font-family: Arial, sans-serif;
        max-width: 300px;
      ">
        <p style="font-size:18px; margin-bottom:20px;">
          From <strong>Chikyqwe</strong><br>for Anime community <i class="fa-solid fa-heart" style="color:#E94560;"></i>
        </p>
        <button id="closeModalBtn" style="
          padding:8px 20px; 
          background:#3C873A; 
          border:none; 
          border-radius:5px; 
          color:#fff; 
          font-weight:bold; 
          cursor:pointer;
        ">
          Cerrar
        </button>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
  const logo = document.querySelector('a.logo');
  const modal = document.getElementById('chikiModal');
  const closeBtn = document.getElementById('closeModalBtn');
  let clickCount = 0;
  const maxClicks = 21;
  const resetTime = 8000; // 10 segundos
  let resetTimeout;
  logo.addEventListener('click', (e) => {
    e.preventDefault();
    clickCount++;
    console.info(`0x${clickCount.toString(16).toUpperCase()}`);
    if (clickCount === maxClicks) {
      modal.style.display = 'flex';
      clickCount = 0;
      clearTimeout(resetTimeout);
    } else {
      clearTimeout(resetTimeout);
      resetTimeout = setTimeout(() => {
        clickCount = 0;
      }, resetTime);
    }
  });
  closeBtn.addEventListener('click', () => {
    modal.style.display = 'none';
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  });
})();
function themebuttons() {
  const botones = document.querySelectorAll('button i.fa-xmark');
  const isLight = document.body.classList.contains('light-theme');
  botones.forEach(icon => {
    icon.style.color = isLight ? '#222' : '#f1f1f1';
    icon.style.transition = 'color 0.3s ease';
  });
}

function toggleTheme() {
  document.body.classList.toggle('light-theme');
  document.body.classList.toggle('dark-theme');

  const icon = document.querySelector('#themeIcon');

  if (document.body.classList.contains('light-theme')) {
    icon.classList.replace('fa-moon', 'fa-sun');
  } else {
    icon.classList.replace('fa-sun', 'fa-moon');
  }
  localStorage.setItem('theme', document.body.classList.contains('light-theme') ? 'light' : 'dark');

  themebuttons();
}


function restoreTheme() {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
    const icon = document.querySelector('#themeIcon');

    if (document.body.classList.contains('light-theme')) {
      icon.classList.replace('fa-moon', 'fa-sun');
    } else {
      icon.classList.replace('fa-sun', 'fa-moon');
    }
  }
}

function initPolicyModal() {
  const overlay = document.getElementById('policyOverlay');
  const acceptBtn = document.getElementById('policyAcceptBtn');
  const iframe = document.getElementById('policyIframe');

  if (!overlay || !acceptBtn || !iframe) return;

  iframe.src = `./app_policy`;
  overlay.classList.remove('d-none');

  acceptBtn.addEventListener('click', () => {
    localStorage.setItem('policyAccepted', 'true');
    overlay.classList.add('d-none');
    initAdsModal();
  });
}

function monitorPolicyIntegrity() {
  setInterval(() => {
    const overlay = document.getElementById('policyOverlay');
    const iframe = document.getElementById('policyIframe');

    if (!localStorage.getItem('policyAccepted') && (!overlay || !iframe)) {
      console.warn('[POLICY] Restaurando...');

      document.body.insertAdjacentHTML('beforeend', `
          <div id="policyOverlay" class="policy-overlay">
            <div class="policy-modal">
              <div class="policy-header">
                <h5 class="m-0">Política de Privacidad</h5>
              </div>
              <iframe id="policyIframe" class="policy-iframe" loading="lazy" title="Política de privacidad"></iframe>
              <div class="policy-footer text-end">
                <button id="policyAcceptBtn" class="btn btn-success fw-semibold px-4">Aceptar</button>
              </div>
            </div>
          </div>
        `);

      initPolicyModal();
    }
  }, 1000);
}

function setAdsPreference(useAds) {
  localStorage.setItem('ads', useAds ? 'true' : 'false');
  const overlay = document.getElementById('adsOverlay');
  if (overlay) overlay.classList.add('d-none');
}

function initAdsModal() {
  const adsPref = localStorage.getItem('ads');
  if (adsPref === null) {
    const overlay = document.getElementById('adsOverlay');
    if (overlay) overlay.classList.remove('d-none');
  }
}

function setupScrollBar() {
  const bottomBar = document.querySelector('.bottom-bar');
  window.addEventListener('scroll', () => {
    const scrollTop = window.scrollY;
    const windowHeight = window.innerHeight;
    const fullHeight = document.documentElement.scrollHeight;
    if (bottomBar) {
      if (scrollTop + windowHeight >= fullHeight - 20) {
        bottomBar.classList.add('visible');
      } else {
        bottomBar.classList.remove('visible');
      }
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  restoreTheme();
  setupScrollBar();
  themebuttons();

  if (!localStorage.getItem('policyAccepted')) {
    initPolicyModal();
    monitorPolicyIntegrity();
  }
  if (!localStorage.getItem('ads') && localStorage.getItem('policyAccepted')) {
    initAdsModal();
  }
});

function scrollToBottom() {
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

function mainInit() {
    // Inicializar elementos DOM
    container = document.getElementById('card-container');
    mainContent = document.getElementById('main-content');
    recolectForm = document.getElementById('recolect-form');
    pageTitle = document.getElementById('page-title');
    suggestionBox = document.getElementById('search-suggestions');
    hamburgerBtn = document.getElementById('hamburgerBtn');
    mobileDropdownMenu = document.getElementById('mobileDropdownMenu');

    // Eventos principales
    mainWindowLoad();
    window.addEventListener('popstate', mainPopState);
    window.addEventListener('resize', mainResize);
    if (hamburgerBtn) hamburgerBtn.addEventListener('click', () => toggleMobileMenu());
    document.addEventListener('click', mainDocumentClick);
    window.addEventListener('scroll', () => toggleMobileMenu(false));

    // Eventos de barra de busqueda móvil
    mobileSearchInit();

    // Eventos de búsqueda
    const searchInputEl = document.getElementById('searchInput');
    if (searchInputEl) {
        searchInputEl.addEventListener('submit', searchAnime);
        searchInputEl.addEventListener('input', searchSuggestionsInput);
    }
    document.addEventListener('click', SSC);

    // Eventos para abrir modales
    const mobileNavInicio = document.getElementById('mobileNavInicio');
    if (mobileNavInicio) mobileNavInicio.addEventListener('click', mostrarInicio);
    const mobileNavDirectorio = document.getElementById('mobileNavDirectorio');
    if (mobileNavDirectorio) mobileNavDirectorio.addEventListener('click', mostrarDirectorio);


    // Carga principal
    mainDOMContentLoadedLogic();
}

function mainDOMContentLoadedLogic() {
    fetch("/anime/last")
        .then(res => res.json())
        .then(data => {
            const container = document.getElementById("anime-list");
            const sidebarList = document.querySelector(".sidebar-menu");

            if (!Array.isArray(data) || !container || !sidebarList) return;

            data.forEach(anime => {
                const card = document.createElement('div');
                card.className = "anime-card-init";
                card.onclick = () => window.location.href = `./player?uid=${anime.id}&ep=${anime.episodioNum}`;
                card.innerHTML = `
                    <img src="${anime.imagen}" alt="${anime.alt || anime.titulo}" class="card-img">
                    <div class="card-content">
                        <h4 class="card-title">${anime.titulo}</h4>
                        <p class="card-subtitle">${anime.episodio}</p>
                    </div>`;
                container.appendChild(card);
            });

            // Pendejo arreglalo no funciona 0_0
            data.slice(0, 15).forEach(anime => {
                const li = document.createElement("li");
                li.classList.add("mb-2");
                li.style.cursor = "pointer";
                li.innerHTML = `
                    <div class="text-decoration-none d-flex align-items-center anime-link">
                        <i class="fa fa-play me-2 text-danger"></i>
                        <span class="text-truncate">${anime.titulo}</span>
                    </div>
                `;
                li.addEventListener('click', () => animeInfo(anime.id)); // YA
                sidebarList.appendChild(li);
            });
        })
        .catch(error => console.error("Error al obtener datos de los últimos animes:", error));
}

async function mainWindowLoad() {
    const loader = document.getElementById('loader');
    console.log("[LOAD] Cargando datos...");
    const MIN_LOADING_TIME = 3000;
    const startTime = performance.now();
    try {
        await fetchJsonList();
        const urlParams = new URLSearchParams(window.location.search);
        const searchTerm = urlParams.get('s');
        const searchInput = document.getElementById('searchInput');
        if (searchTerm && searchInput) {
            searchInput.value = searchTerm;
            searchAnime(null, searchTerm);
        } else {
            const page = getPageParam();
            const paginated = paginate(fullAnimeList, page);
            renderCards(paginated);
            createPagination(fullAnimeList.length, page);
        }
        await waitForVisibleImages('.anime-card img');
    } catch (e) {
        console.error("Error al cargar los datos:", e);
    } finally {
        console.log("[LOAD] Datos cargados.");
        const elapsed = performance.now() - startTime;
        const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
        setTimeout(() => hideLoader(), remainingTime);
    }
}

function mainPopState() {
    const page = getPageParam();
    const paginated = paginate(fullAnimeList, page);
    renderCards(paginated);
    createPagination(fullAnimeList.length, page);
}

function mainResize() {
    const page = getPageParam();
    createPagination(fullAnimeList.length, page);
}

function mainDocumentClick(e) {
    if (!mobileDropdownMenu || !hamburgerBtn) return;
    if (!mobileDropdownMenu.contains(e.target) && !hamburgerBtn.contains(e.target)) {
        toggleMobileMenu(false);
    }
}

function toggleMobileMenu(show) {
    if (!mobileDropdownMenu) return;
    if (show === undefined) {
        show = !mobileDropdownMenu.classList.contains('show');
    }
    mobileDropdownMenu.classList.toggle('show', show);
    mobileDropdownMenu.setAttribute('aria-hidden', !show);
}
function setActiveMenu(num) {
    if (![1, 2, 3, 4].includes(num)) return;
    const ids = ['navInicio', 'navDirectorio', 'navHistorial', 'navFavoritos'];
    const idActivo = ids[num - 1];
    const mobileIdActivo = 'mobile' + idActivo.charAt(0).toUpperCase() + idActivo.slice(1);
    const mainLinks = document.querySelectorAll('nav.main-nav a.nav-item');
    const mobileLinks = document.querySelectorAll('#mobileDropdownMenu a');
    [...mainLinks, ...mobileLinks].forEach(link => {
        if (link.id === idActivo || link.id === mobileIdActivo) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}


function mostrarInicio(e) {
    if (e && e.preventDefault) e.preventDefault();
    showLoader();
    document.getElementById("search-section").classList.add("d-none");
    document.getElementById("anime-section").classList.remove("d-none");
    document.getElementById("directory-section").classList.add("d-none");
    document.getElementById("historial-section").classList.add("d-none");
    document.getElementById("favoritos-section").classList.add("d-none");
    setActiveMenu(1);
    document.querySelector('.sidebar').classList.remove('d-none');
    document.getElementById("pagination-controls").classList.add("d-none");
    setTimeout(() => hideLoader(), 1000);
}

function mostrarDirectorio(e) {
    if (e && e.preventDefault) e.preventDefault();
    showLoader();
    document.getElementById("search-section").classList.add("d-none");
    document.getElementById("anime-section").classList.add("d-none");
    document.getElementById("directory-section").classList.remove("d-none");
    document.getElementById("historial-section").classList.add("d-none");
    document.getElementById("favoritos-section").classList.add("d-none");
    setActiveMenu(2);
    document.querySelector('.sidebar').classList.add("d-none");
    document.getElementById("pagination-controls").classList.remove("d-none");
    const page = getPageParam();
    const paginated = paginate(fullAnimeList, page);
    renderCards(paginated);
    createPagination(fullAnimeList.length, page);

    setTimeout(() => hideLoader(), 1000);
}

async function mostrarHistorial(e) {
    if (e && e.preventDefault) e.preventDefault();
    showLoader();
    document.getElementById("anime-section").classList.add("d-none");
    document.getElementById("directory-section").classList.add("d-none");
    document.getElementById("historial-section").classList.remove("d-none");
    document.getElementById("favoritos-section").classList.add("d-none");
    document.getElementById("search-section").classList.add("d-none");
    setActiveMenu(3);
    document.querySelector('.sidebar').classList.add("d-none");
    document.getElementById("pagination-controls").classList.add("d-none");

    const container = document.getElementById('historial-container');
    if (!container) return;
    container.innerHTML = '<div class="text-white-50">Cargando historial...</div>';
    try {
        const history = await getHistory();
        if (!history.length) {
            container.innerHTML = '<p class="text-white-50">No hay historial disponible.</p>';
            hideLoader();
            return;
        }
        container.innerHTML = '';
        history.forEach(item => {
            const anime = fullAnimeList.find(a => a.unit_id === item.uid || a.id === item.uid);
            if (!anime) return;

            const card = document.createElement('div');
            card.className = 'anime-card';
            card.tabIndex = 0;
            card.setAttribute('role', 'button');
            const proxyUrl = `/image?url=${encodeURIComponent(anime.image)}`;
            card.innerHTML = `
                <img src="${proxyUrl}" alt="Imagen de ${cleanTitle(anime.title)}" class="anime-image" />
                <div class="anime-title">${cleanTitle(anime.title)}</div>
                <div class="anime-overlay">
                    <button class="btn-remove">
                        <i class="bi bi-trash"></i> 
                        Quitar del historial
                    </button>
                    <button class="btn-playlist">
                        <i class="bi bi-plus-circle"></i> Añadir a playlist
                    </button>   
                </div>
            `;

            card.addEventListener('click', () => {
                if (!card.classList.contains('show-options')) {
                    animeInfo(anime.unit_id);
                }
            });

            let pressTimer;
            card.addEventListener('touchstart', () => {
                pressTimer = setTimeout(() => {
                    card.classList.add('show-options');
                }, 500);
            });
            card.addEventListener('touchend', () => clearTimeout(pressTimer));

            card.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                card.classList.toggle('show-options');
            });

            card.querySelector('.btn-remove').addEventListener('click', async (ev) => {
                ev.stopPropagation();
                card.classList.add('removing');

                card.addEventListener('animationend', async () => {
                    await removeFromHistory(anime.unit_id || anime.id);
                    card.remove();
                }, { once: true });
            });

            card.querySelector('.btn-playlist').addEventListener('click', (ev) => {
                ev.stopPropagation();
                alert(`(Próximamente) Añadir ${cleanTitle(anime.title)} a playlist`);
            });

            document.addEventListener('click', (e) => {
                if (!card.contains(e.target)) {
                    card.classList.remove('show-options');
                }
            });

            container.appendChild(card);
        });

    } catch (err) {
        container.innerHTML = '<p class="text-danger">Error al cargar historial.</p>';
    }
    setTimeout(() => hideLoader(), 1000);
}
function showContextMenu(e, anime) {
    const menu = document.getElementById('historial-menu');
    menu.classList.remove('d-none');
    menu.style.top = `${e.pageY}px`;
    menu.style.left = `${e.pageX}px`;

    const removeBtn = document.getElementById('remove-from-history');
    removeBtn.onclick = async () => {
        await removeFromHistory(anime.unit_id || anime.id);
        menu.classList.add('d-none');
        mostrarHistorial(); // recargar historial
    };
}

// Ocultar menú si se hace clic fuera
document.addEventListener('click', () => {
    const menu = document.getElementById('historial-menu');
    if (menu) menu.classList.add('d-none');
});

/**
 * =======================================================
 * FAVORITOS
 * =======================================================
 */
function createFavoriteCard(anime) {
    const card = document.createElement('div');
    card.className = 'anime-card';
    card.style.cursor = 'pointer';
    card.style.width = '150px';
    card.dataset.anime = anime.title || '';
    if (anime.unit_id) card.dataset.uid = anime.unit_id;
    if (anime.id) card.dataset.id = anime.id;

    const proxyUrl = `/image?url=${encodeURIComponent(anime.image)}`;
    card.innerHTML = `
        <img src="${proxyUrl}" alt="Imagen de ${cleanTitle(anime.title)}" class="anime-image" style="width: 100%; border-radius: 4px;" />
        <div class="anime-title" style="text-align:center; font-size: 0.9rem; margin-top: 5px;">${cleanTitle(anime.title)}</div>
    `;
    card.addEventListener('click', () => animeInfo(anime.unit_id));
    return card;
}

async function mostrarFavoritos(e) {
    if (e && e.preventDefault) e.preventDefault();
    showLoader();
    document.getElementById("anime-section").classList.add("d-none");
    document.getElementById("directory-section").classList.add("d-none");
    document.getElementById("historial-section").classList.add("d-none");
    document.getElementById("favoritos-section").classList.remove("d-none");
    document.getElementById("search-section").classList.add("d-none");
    setActiveMenu(4);
    document.querySelector('.sidebar').classList.add("d-none");
    document.getElementById("pagination-controls").classList.add("d-none");

    const container = document.getElementById('favoritos-container');
    if (!container) return;
    container.innerHTML = '<div class="text-white-50">Cargando favoritos...</div>';
    try {
        const favs = await cargarFavoritosIndexed();
        const favoritosData = fullAnimeList.filter(anime => favs.includes(anime.title));
        if (!favoritosData.length) {
            container.innerHTML = '<p class="text-white-50">Aún no has agregado animes a favoritos.</p>';
            hideLoader();
            return;
        }
        container.innerHTML = '';
        favoritosData.forEach(anime => {
            const card = createFavoriteCard(anime);
            container.appendChild(card);
        });
    } catch (err) {
        container.innerHTML = '<p class="text-danger">Error mostrando favoritos.</p>';
    }
    setTimeout(() => hideLoader(), 1000);
}

/**
 * =======================================================
 * FUNCIONES DE BÚSQUEDA Y SUGERENCIAS
 * =======================================================
 */

function mobileSearchInit() {
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

function renderSuggestions(list) {
    const searchInput = document.getElementById('searchInput');
    const value = normalizeText(searchInput.value);

    // Si no hay texto escrito, no renderizamos nada
    if (!value) {
        suggestionBox.innerHTML = '';
        suggestionBox.style.display = 'none';
        return;
    }

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


function SSC(e) {
    const searchInput = document.getElementById('searchInput');
    if (!suggestionBox) suggestionBox = document.getElementById('search-suggestions');
    if (!suggestionBox.contains(e.target) && e.target !== searchInput) {
        suggestionBox.innerHTML = '';
        suggestionBox.style.display = 'none';
    }
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

/**
 * =======================================================
 * FUNCIONES DE CARGA Y PAGINACIÓN
 * =======================================================
 */

async function fetchJsonList() {
    try {
        const resp = await fetch('/anime/list');
        if (!resp.ok) {
            throw new Error('Error al cargar la lista de animes');
        }
        const json = await resp.json();
        fullAnimeList = Array.isArray(json.animes) ? json.animes : [];
        showContinueWatching();
    } catch (err) {
        console.error("Error cargando lista:", err);
    }
}

async function changePage(page) {
    showLoader();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const params = new URLSearchParams(window.location.search);
    params.set('page', page);
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.pushState({ page }, '', newUrl);

    const paginated = paginate(fullAnimeList, page);
    renderCards(paginated);
    createPagination(fullAnimeList.length, page);
    await waitForVisibleImages();
    hideLoader();
}

function createPagination(totalItems, currentPage) {
    const paginationContainer = document.getElementById('pagination-controls');
    if (!paginationContainer) return;
    paginationContainer.innerHTML = '';

    const totalPages = Math.ceil(totalItems / 24);
    if (totalPages <= 1) return;

    let groupSize;
    const screenWidth = window.innerWidth;
    if (screenWidth < 400) groupSize = 3;
    else if (screenWidth < 650) groupSize = 5;
    else if (screenWidth < 800) groupSize = 7;
    else groupSize = 10;

    const currentGroupStart = Math.floor((currentPage - 1) / groupSize) * groupSize + 1;
    const currentGroupEnd = Math.min(currentGroupStart + groupSize - 1, totalPages);

    const pagination = document.createElement('div');
    pagination.id = 'pagination';

    const createButton = (page, label, isNav = false) => {
        const btn = document.createElement('button');
        btn.textContent = label || page;
        btn.className = `pagination-btn ${isNav ? 'nav' : ''} ${page === currentPage ? 'active' : ''}`;
        btn.addEventListener('click', () => changePage(page));
        return btn;
    };

    if (currentGroupStart > 1) {
        pagination.appendChild(createButton(currentPage - 1, '«', true));
    }
    for (let i = currentGroupStart; i <= currentGroupEnd; i++) {
        pagination.appendChild(createButton(i));
    }
    if (currentGroupEnd < totalPages) {
        pagination.appendChild(createButton(currentPage + 1, '»', true));
    }
    paginationContainer.appendChild(pagination);
}

function renderCards(animes) {
    clearCards();
    const container = document.getElementById('card-container');
    if (!container) return;
    animes.forEach(anime => {
        const card = document.createElement('div');
        card.className = 'anime-card';
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        const proxyUrl = `/image?url=${encodeURIComponent(anime.image)}`;
        card.innerHTML = `
            <img src="${proxyUrl}" alt="Imagen de ${cleanTitle(anime.title)}" class="anime-image" />
            <div class="anime-title">${cleanTitle(anime.title)}</div>
        `;
        card.addEventListener('click', () => animeInfo(anime.unit_id));
        container.appendChild(card);
        loadedCards.set(anime.title, card);
    });
}

function clearCards() {
    const container = document.getElementById('card-container');
    if (container) {
        container.innerHTML = '';
    }
    loadedCards.clear();
}

/**
 * =======================================================
 * MODAL Y FAVORITOS
 * =======================================================
 */

function ajustarAlturaEpisodesList(eps) {
    var episodesList = document.getElementById('episodes-list');
    if (episodesList) {
        if (eps > 0 && eps < 12) {
            episodesList.style.height = 'auto';
        } else {
            episodesList.style.height = '645px';
        }
    }
}

function renderStarsBox(rating) {
    const scoreEl = document.getElementById('ratingScore');
    const starsEl = document.getElementById('ratingStars');
    if (!scoreEl || !starsEl) return;

    const rating10 = (rating / 10).toFixed(1);
    scoreEl.textContent = rating10;

    starsEl.innerHTML = '';

    let starsValue = (rating / 100) * 10;
    starsValue = Math.round(starsValue * 2) / 2;

    const fullStars = Math.floor(starsValue);
    const hasHalf = starsValue % 1 !== 0;
    const emptyStars = 10 - fullStars - (hasHalf ? 1 : 0);

    for (let i = 0; i < fullStars; i++) {
        starsEl.innerHTML += `<i class="fa fa-star"></i>`;
    }
    if (hasHalf) {
        starsEl.innerHTML += `<i class="fa fa-star-half-alt"></i>`;
    }
    for (let i = 0; i < emptyStars; i++) {
        starsEl.innerHTML += `<i class="fa fa-star inactive"></i>`;
    }
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
  const modal = bootstrap.Modal.getInstance(animeModalEl) || new bootstrap.Modal(animeModalEl);
  modal.hide();
}

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

    document.querySelectorAll('.share-option').forEach(btn => {
        btn.onclick = e => {
            e.preventDefault();
            const clase = btn.querySelector('div').classList[1];

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

/**
 * =======================================================
 * FUNCIONES DE UTILIDAD
 * =======================================================
 */
function abrirMenuOpciones() {
    const overlay = document.getElementById('menuOverlay');
    overlay.classList.remove('d-none');
    setTimeout(() => overlay.classList.add('show'), 10);
}

function cerrarOverlay(id) {
    const overlay = document.getElementById(id);
    overlay.classList.remove('show');
    setTimeout(() => overlay.classList.add('d-none'), 300);
}

function verPolitica() {
    cerrarOverlay('menuOverlay');
    initPolicyModal();
}

function verAds() {
    cerrarOverlay('menuOverlay');
    document.getElementById('adsOverlay').classList.remove('d-none');
}

function getLastEpisode() {
    const data = localStorage.getItem("lasted");
    return data ? JSON.parse(data) : null;
}
function showContinueWatching() {
    const data = getLastEpisode();
    const dataAnime = data ? findAnimeByUId(data.uid) : null;
    if (dataAnime) {
        document.getElementById('continue-watching-title').textContent = `${dataAnime.title} - Episodio ${data.ep}`;
        document.getElementById('continue-watching-img').src = dataAnime.image || "static/default-poster.jpg";
        document.getElementById('continue-watching-btn').onclick = function () {
            window.location.href = `player?uid=${data.uid}&ep=${data.ep}`;
        };
        const modal = new bootstrap.Modal(document.getElementById('continueWatchingModal'));
        modal.show();
    }
}
function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME_F, 3);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME_F)) {
                db.createObjectStore(STORE_NAME_F, { keyPath: 'url' });
            }
            if (!db.objectStoreNames.contains("progress")) {
                db.createObjectStore("progress", { keyPath: "slug" });
            }
            if (!db.objectStoreNames.contains("history")) {
                db.createObjectStore("history", { keyPath: "uid" });
            }
        };
    });
    return dbPromise;
}
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
async function removeFromHistory(uid) {
    const history = await getHistory();
    const updated = history.filter(h => h.uid !== uid);
    localStorage.setItem('history', JSON.stringify(updated));
}

function findAnimeById(id) {
    if (typeof id !== 'number' || id <= 0) {
        console.error("El ID proporcionado no es un número válido.");
        return null;
    }
    const animeEncontrado = fullAnimeList.find(anime => anime.id === id);
    return animeEncontrado || null;
}
function findAnimeByUId(id) {
    if (typeof id !== 'number' || id <= 0) {
        console.error("El UID proporcionado no es un número válido." + id);
        return null;
    }
    const animeEncontrado = fullAnimeList.find(anime => anime.unit_id === id);
    return animeEncontrado || null;
}

function cleanTitle(title) {
    return title ? title.trim() : '';
}

function getPageParam() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('page');
    return /^[1-9]\d*$/.test(raw) ? parseInt(raw, 10) : 1;
}

function paginate(items, page, perPage = 24) {
    const start = (page - 1) * perPage;
    return items.slice(start, start + perPage);
}

function normalizeText(text) {
    if (!text) return '';
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function showLoader() {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.classList.add('fade-once');
        loader.classList.remove('fade-out');
        loader.style.display = 'flex';
        void loader.offsetWidth;
        loader.classList.add('fade-in');
    }
}

function hideLoader() {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.classList.remove('fade-in');
        loader.classList.add('fade-out');
        setTimeout(() => {
            loader.style.display = 'none';
            loader.classList.remove('fade-once');
        }, 600);
    }
}

async function waitForVisibleImages(selector = '.anime-card img') {
    const images = Array.from(document.querySelectorAll(selector));
    await Promise.all(images.map(img => {
        if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
        return new Promise(resolve => img.onload = img.onerror = resolve);
    }));

}

function abrirDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject('Error al abrir DB');
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'title' });
            }
        };
    });
}

async function agregarFavoritoIndexed(animeTitle) {
    const db = await abrirDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.add({ title: animeTitle });
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject('Error agregando favorito');
    });
}

async function eliminarFavoritoIndexed(animeTitle) {
    const db = await abrirDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete(animeTitle);
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject('Error eliminando favorito');
    });
}

async function cargarFavoritosIndexed() {
    const db = await abrirDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result.map(item => item.title));
        request.onerror = () => reject('Error cargando favoritos');
    });
}

async function esFavoritoIndexed(animeTitle) {
    const db = await abrirDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(animeTitle);
        request.onsuccess = () => resolve(!!request.result);
        request.onerror = () => reject('Error verificando favorito');
    });
}

async function toggleFavoritoIndexed(animeTitle, btn) {
    try {
        const favorito = await esFavoritoIndexed(animeTitle);
        if (favorito) {
            // eliminar de IndexedDB
            await eliminarFavoritoIndexed(animeTitle);

            // ⚡ quitar la card del DOM si existe en la sección favoritos
            const favContainer = document.getElementById('favoritos-container');
            if (favContainer) {
                const cards = Array.from(favContainer.querySelectorAll('[data-anime]'));
                const card = cards.find(c => c.dataset.anime === animeTitle);
                if (card) {
                    card.remove();
                } else {
                    // fallback: si no encontramos la card, opcionalmente recargar la vista completa
                    // mostrarFavoritos(); // <-- descomenta si quieres fallback automático
                }
            }
        } else {
            // agregar a IndexedDB
            await agregarFavoritoIndexed(animeTitle);

            // si el usuario está viendo la sección FAVORITOS, añadimos la card al instante (opcional)
            const favContainer = document.getElementById('favoritos-container');
            if (favContainer && !favContainer.classList.contains('d-none')) {
                const animeObj = fullAnimeList.find(a => a.title === animeTitle);
                if (animeObj) {
                    favContainer.appendChild(createFavoriteCard(animeObj));
                }
            }
        }

        // actualizar visual del botón que se pasó como parámetro
        const nuevoFavorito = !favorito;
        if (btn) {
            btn.innerHTML = nuevoFavorito
                ? '<i class="fa fa-heart"></i> Quitar de Favoritos'
                : '<i class="fa fa-heart"></i> Agregar a Favoritos';
            btn.classList.toggle('btn-dark', nuevoFavorito);
            btn.classList.toggle('btn-outline-light', !nuevoFavorito);
        }
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

        const shareUrl = `/app/share?uid=${encodeURIComponent(UID)}`;

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
document.addEventListener('DOMContentLoaded', () => {mainInit();});

// =======================================================  