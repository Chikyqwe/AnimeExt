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
let dbPromise = null;
let currentAnime = null;
const loadedCards = new Map();
let fullAnimeList = [];

/**
 * =======================================================
 * INICIALIZACIÓN DE LA APLICACIÓN
 * =======================================================
 */
document.addEventListener('DOMContentLoaded', mainInit, false);

// Exponer funciones de navegación al scope global para uso en onclick HTML
window.mostrarFavoritos = mostrarFavoritos;
window.mostrarHistorial = mostrarHistorial;

function mainInit() {
    // Inicializar elementos DOM
    container = document.getElementById('card-container');
    mainContent = document.getElementById('main-content');
    recolectForm = document.getElementById('recolect-form');
    pageTitle = document.getElementById('page-title');
    suggestionBox = document.getElementById('search-suggestions');
    hamburgerBtn = document.getElementById('hamburgerBtn');
    mobileDropdownMenu = document.getElementById('mobileDropdownMenu');

    // Eventos principales que se ejecutan al cargar la página.
    window.addEventListener('load', mainWindowLoad);
    window.addEventListener('popstate', mainPopState);
    window.addEventListener('resize', mainResize);
    if (hamburgerBtn) hamburgerBtn.addEventListener('click', () => toggleMobileMenu());
    document.addEventListener('click', mainDocumentClick);
    window.addEventListener('scroll', () => toggleMobileMenu(false));

    // Eventos de barra de búsqueda móvil
    mobileSearchInit();

    // Eventos de búsqueda
    const searchInputEl = document.getElementById('searchInput');
    if (searchInputEl) {
        searchInputEl.addEventListener('submit', searchAnime);
        searchInputEl.addEventListener('input', searchSuggestionsInput);
    }
    document.addEventListener('click', searchSuggestionsClick);

    // Eventos para abrir modales
    const mobileNavInicio = document.getElementById('mobileNavInicio');
    if (mobileNavInicio) mobileNavInicio.addEventListener('click', mostrarInicio);
    const mobileNavDirectorio = document.getElementById('mobileNavDirectorio');
    if (mobileNavDirectorio) mobileNavDirectorio.addEventListener('click', mostrarDirectorio);

    
    // Carga de animes en emisión y última visualización
    mainDOMContentLoadedLogic();
}

/**
 * =======================================================
 * FUNCIONES PRINCIPALES DE GESTIÓN DE PÁGINA
 * =======================================================
 */

function mainDOMContentLoadedLogic() {
    fetch("/anime/last")
        .then(res => res.json())
        .then(data => {
            const container = document.getElementById("anime-list");
            const sidebarList = document.querySelector(".sidebar-menu");

            if (!Array.isArray(data) || !container || !sidebarList) return;

            // Llenar la lista principal
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

            // Llenar la sidebar con la misma info y ejecutar función al hacer clic
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
                li.addEventListener('click', () => openModal(findAnimeByUId(anime.id), anime.titulo)); // <-- Aquí ejecuta la función
                sidebarList.appendChild(li);
            });

            showContinueWatching(); // Si quieres mostrar algo extra
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
        const sharedParam = urlParams.get('shared'); // obtenemos el parámetro 'shared'

        // Acción a realizar si existe el parámetro 'shared'
        if (sharedParam) {
            const sharedId = Number(sharedParam); // <-- Convertimos a número
            if (!isNaN(sharedId)) {                // <-- Comprobamos que sea un número válido
                const anim = findAnimeByUId(sharedId);

                openModal(anim, anim.title);
            } else {
                console.warn("El parámetro 'shared' no es un número válido:", sharedParam);
            }
        }

        if (searchTerm) {
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.value = searchTerm;
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

/**
 * =======================================================
 * NAVEGACIÓN Y MENÚ
 * =======================================================
 */

function toggleMobileMenu(show) {
    if (!mobileDropdownMenu) return;
    if (show === undefined) {
        show = !mobileDropdownMenu.classList.contains('show');
    }
    mobileDropdownMenu.classList.toggle('show', show);
    mobileDropdownMenu.setAttribute('aria-hidden', !show);
}

function setActiveMenu(num) {
    // Acepta solo números válidos (1 a 4)
    if (![1, 2, 3, 4].includes(num)) return;

    // IDs de los enlaces del menú principal
    const ids = ['navInicio', 'navDirectorio', 'navHistorial', 'navFavoritos'];
    const idActivo = ids[num - 1];
    const mobileIdActivo = 'mobile' + idActivo.charAt(0).toUpperCase() + idActivo.slice(1);

    // Obtener todos los enlaces de ambos menús
    const mainLinks = document.querySelectorAll('nav.main-nav a.nav-item');
    const mobileLinks = document.querySelectorAll('#mobileDropdownMenu a');

    // Aplicar la clase active al que corresponde
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

    // 🔥 Renderizar lista de cards para directorio
    const page = getPageParam();
    const paginated = paginate(fullAnimeList, page);
    renderCards(paginated);
    createPagination(fullAnimeList.length, page);

    setTimeout(() => hideLoader(), 1000);
}

/**
 * =======================================================
 * HISTORIAL
 * =======================================================
 */
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
            const proxyUrl = `https://animeext-m5lt.onrender.com/image?url=${encodeURIComponent(anime.image)}`;
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

            // Abrir anime normalmente
            card.addEventListener('click', () => {
                if (!card.classList.contains('show-options')) {
                    openModal(anime, anime.title);
                }
            });

            // Mantener presionado (móvil)
            let pressTimer;
            card.addEventListener('touchstart', () => {
                pressTimer = setTimeout(() => {
                    card.classList.add('show-options');
                }, 500); // medio segundo
            });
            card.addEventListener('touchend', () => clearTimeout(pressTimer));

            // Clic derecho (PC)
            card.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                card.classList.toggle('show-options');
            });

            // Botones
            card.querySelector('.btn-remove').addEventListener('click', async (ev) => {
                ev.stopPropagation();
                card.classList.add('removing'); // 👈 activamos la animación

                // Esperamos que termine la animación antes de eliminar
                card.addEventListener('animationend', async () => {
                    await removeFromHistory(anime.unit_id || anime.id);
                    card.remove();
                }, { once: true });
            });

            card.querySelector('.btn-playlist').addEventListener('click', (ev) => {
                ev.stopPropagation();
                alert(`(Próximamente) Añadir ${cleanTitle(anime.title)} a playlist`);
            });

            // Cerrar si se toca fuera
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
    // guardamos identificadores para poder localizar la card después
    card.dataset.anime = anime.title || '';
    if (anime.unit_id) card.dataset.uid = anime.unit_id;
    if (anime.id) card.dataset.id = anime.id;

    const proxyUrl = `/image?url=${encodeURIComponent(anime.image)}`;
    card.innerHTML = `
        <img src="${proxyUrl}" alt="Imagen de ${cleanTitle(anime.title)}" class="anime-image" style="width: 100%; border-radius: 4px;" />
        <div class="anime-title" style="text-align:center; font-size: 0.9rem; margin-top: 5px;">${cleanTitle(anime.title)}</div>
    `;
    card.addEventListener('click', () => openModal(anime, anime.title));
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

function searchSuggestionsInput() {
    const searchInput = document.getElementById('searchInput');
    const value = normalizeText(searchInput.value);
    if (!suggestionBox) suggestionBox = document.getElementById('search-suggestions');
    suggestionBox.innerHTML = '';
    if (!value || !fullAnimeList.length) {
        suggestionBox.style.display = 'none';
        return;
    }
    const results = fullAnimeList.filter(anime => normalizeText(anime.title).includes(value)).slice(0, 4);
    results.forEach(anime => {
        const item = document.createElement('li');
        const proxyUrl = `/image?url=${encodeURIComponent(anime.image)}`;
        item.innerHTML = `<img src="${proxyUrl}" alt="${anime.title}" /><span>${anime.title}</span>`;
        item.addEventListener('click', () => {
            openModal(anime, anime.title);
            suggestionBox.innerHTML = '';
            suggestionBox.style.display = 'none';
        });
        suggestionBox.appendChild(item);
    });
    suggestionBox.style.display = results.length ? 'block' : 'none';
}

function searchSuggestionsClick(e) {
    const searchInput = document.getElementById('searchInput');
    if (!suggestionBox) suggestionBox = document.getElementById('search-suggestions');
    if (!suggestionBox.contains(e.target) && e.target !== searchInput) {
        suggestionBox.innerHTML = '';
        suggestionBox.style.display = 'none';
    }
}

function searchAnime(event = null, term = null) {
    if (event && event.preventDefault) {
        event.preventDefault();
        mostrarDirectorio(event);
    } else if (term) {
        mostrarDirectorio(); // Llama a la versión sin evento para actualizar la vista
    }

    const input = term || document.getElementById('searchInput').value;
    const inputNormalized = normalizeText(input);

    const url = new URL(window.location);
    if (inputNormalized) {
        url.searchParams.set('s', inputNormalized);
    } else {
        url.searchParams.delete('s');
    }

    if (!term) {
        window.history.pushState({}, '', url);
    }
    if (!inputNormalized) {
        const page = getPageParam();
        const paginated = paginate(fullAnimeList, page);
        renderCards(paginated);
        createPagination(fullAnimeList.length, page);
        return;
    }
    const terms = inputNormalized.split(' ').filter(Boolean);
    const filtered = fullAnimeList.filter(anime => {
        const titleNormalized = normalizeText(anime.title);
        return terms.every(term => titleNormalized.includes(term));
    });

    search_selecion(filtered, inputNormalized)
}

async function search_selecion(s,t) {
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
            card.addEventListener('click', () => openModal(item, item.title));
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
        const resp = await fetch('/anime/list/ext/beta/cordova/beta/anime/app/chikyqwe');
        if (!resp.ok) {
            throw new Error('Error al cargar la lista de animes');
        }
        const json = await resp.json();
        fullAnimeList = Array.isArray(json.animes) ? json.animes : [];
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
        card.addEventListener('click', () => openModal(anime, anime.title));
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
      console.log("Número de episodios encontrados:", eps);
      if (eps > 0 && eps < 12) {
        console.log("Ajustando altura de episodes-list para menos de 12 episodios");
        episodesList.style.height = 'auto';
      } else {
        console.log("Ajustando altura de episodes-list para 12 o más episodios");
        episodesList.style.height = '380px';
      }
    }
}
async function openModal(data, animeTitle) {
    currentAnime = data;

    const modalImage = document.getElementById('modalImage');
    const modalTitle = document.getElementById('modalTitle');
    const episodesList = document.getElementById('episodes-list');
    const modalDescription = document.getElementById('modalDescription');
    const favBtn = document.getElementById('favoriteBtn');
    const shareBtn = document.getElementById('shareBtn');

    // Imagen y título
    const proxyUrl = `/image?url=${encodeURIComponent(data.image)}`;
    if (modalImage) modalImage.src = proxyUrl;
    if (modalTitle) modalTitle.textContent = cleanTitle(animeTitle);
    if (episodesList) episodesList.innerHTML = '';

    // Mostrar modal **inmediatamente**
    const animeModalEl = document.getElementById('animeModal');
    let modal;
    if (animeModalEl) {
        modal = new bootstrap.Modal(animeModalEl);
        modal.show();
    }

    // Inicializar botones
    initFavoriteButton(animeTitle);
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

    // Mostrar "Cargando descripción..."
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

    // --- FETCH DE DESCRIPCIÓN ---
    (async () => {
        try {
            const response = await fetch('/anime/description', {
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
    })();

    // --- FETCH DE EPISODIOS ---
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
                        console.log(`[API PLAYER] date de emisión próxima: ${PFP}`);
                        console.log(`[API PLAYER] Estado del anime: ${status}`);
                        if (result.episodes && Array.isArray(result.episodes.episodes) && result.episodes.episodes.length > 0) {
                            episodes = result.episodes.episodes;
                            selectedSource = src;
                            console.log(`[API PLAYER] Fuente seleccionada: ${src} con ${episodes.length} episodios`);
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
        // Mostrar estado mientras se cargan episodios
        if (episodesList) {
            const div = document.createElement('div');
            div.className = 'status-indicator';
            const estado = status.toLowerCase();
            console.log(`[API PLAYER] Estado procesado: ${estado}`);
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
        // Renderizar episodios cuando estén listos
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
    })();

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
    const request = indexedDB.open(DB_NAME_F, 3); // ⚡ subimos versión a 3
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
        db.createObjectStore("history", { keyPath: "uid" }); // ⚡ solo uid
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
        console.error("El ID proporcionado no es un número válido.");
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


/**
 * =======================================================
 * INDEXEDDB FAVORITOS
 * =======================================================
 */

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

        const shareUrl = `https://animeext-m5lt.onrender.com/app/share?uid=${encodeURIComponent(UID)}`;

        try {
            if (navigator.share) {
                await navigator.share({
                    title: findAnimeByUId(UID)?.title || 'Anime',
                    text: `Mira este anime: ${findAnimeByUId(UID)?.title || 'Anime'}`,
                    url: shareUrl
                });
            } else {
                await navigator.clipboard.writeText(shareUrl);
                const originalText = btn.textContent;
                btn.textContent = 'Copiado al portapapeles';
                setTimeout(() => {
                    // añadir antes <i class="fa fa-share-alt"></i>
                    btn.innerHTML = `<i class="fa fa-share-alt"></i> ${originalText}`;
                }, 2000);
            }
        } catch (err) {
            console.error('Error compartiendo:', err);
        }
    };
}