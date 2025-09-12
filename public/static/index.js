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

let currentAnime = null;
const loadedCards = new Map();
let fullAnimeList = [];

/**
 * =======================================================
 * INICIALIZACIÓN DE LA APLICACIÓN
 * =======================================================
 */
document.addEventListener('DOMContentLoaded', mainInit, false);

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
    const btnFavoritos = document.getElementById('favoritos');
    if (btnFavoritos) btnFavoritos.addEventListener('click', mostrarFavoritosEnModal);
    const mobileNavFavoritos = document.getElementById('mobileNavFavoritos');
    if (mobileNavFavoritos) mobileNavFavoritos.addEventListener('click', mostrarFavoritosEnModal);
    
    // Carga de animes en emisión y última visualización
    mainDOMContentLoadedLogic();
}

/**
 * =======================================================
 * FUNCIONES PRINCIPALES DE GESTIÓN DE PÁGINA
 * =======================================================
 */

function mainDOMContentLoadedLogic() {
    fetch("https://animeext-m5lt.onrender.com/anime/last")
        .then(res => res.json())
        .then(data => {
            const container = document.getElementById("anime-list");
            if (!Array.isArray(data) || !container) return;
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
        })
        .catch(error => console.error("Error al obtener datos de los últimos animes:", error));

    const sidebarList = document.querySelector(".sidebar-menu");
    if (!sidebarList) return;

    const checkInterval = setInterval(() => {
        if (fullAnimeList.length > 0) {
            clearInterval(checkInterval);
            const animesEnEmision = fullAnimeList.filter(anime => anime.status && anime.status.includes("emisión")).slice(0, 15);
            showContinueWatching();
            animesEnEmision.forEach(anime => {
                const li = document.createElement("li");
                li.classList.add("mb-2");
                li.style.cursor = "pointer";
                li.innerHTML = `
                        <div class="text-decoration-none d-flex align-items-center anime-link">
                            <i class="fa fa-play me-2 text-danger"></i>
                            <span class="text-truncate">${anime.title}</span>
                        </div>
                    `;
                li.addEventListener('click', () => openModal(findAnimeById(anime.id), anime.title));
                sidebarList.appendChild(li);
            });
        }
    }, 300);
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

function setActiveMenu(idActivo) {
    const mainLinks = document.querySelectorAll('nav.main-nav a.nav-item');
    const mobileLinks = document.querySelectorAll('#mobileDropdownMenu a');
    [...mainLinks, ...mobileLinks].forEach(link => {
        if (link.id === idActivo || link.id === idActivo.replace('mobile', '')) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

function mostrarInicio(e) {
    if (e && e.preventDefault) e.preventDefault();
    showLoader();
    document.getElementById("anime-section").classList.remove("d-none");
    document.getElementById("directory-section").classList.add("d-none");
    setActiveMenu('mobileNavInicio');
    document.querySelector('.sidebar').classList.remove('d-none');
    document.getElementById("pagination-controls").classList.add("d-none");
    setTimeout(() => hideLoader(), 1000);
}

function mostrarDirectorio(e) {
    if (e && e.preventDefault) e.preventDefault();
    showLoader();
    document.getElementById("anime-section").classList.add("d-none");
    document.getElementById("directory-section").classList.remove("d-none");
    setActiveMenu('mobileNavDirectorio');
    document.querySelector('.sidebar').classList.add("d-none");
    document.getElementById("pagination-controls").classList.remove("d-none");
    setTimeout(() => hideLoader(), 1000);
}

/**
 * =======================================================
 * FUNCIONES DE BÚSQUEDA Y SUGERENCIAS
 * =======================================================
 */
(function () {
    const _0x5c6b = ['split', 'length', 'from', 'charCodeAt', 'map', 'push', 'slice', 'concat', 'toString', 'padStart', 'join', 'reduce', 'cookie', 'log', 'shift', 'get'];
    const _0x1f45 = function (_0x4371e1, _0x27160e) {
        _0x4371e1 = _0x4371e1 - 0x0;
        let _0x4bcda9 = _0x5c6b[_0x4371e1];
        return _0x4bcda9;
    };

    window[_0x1f45('0xf') + 'CookieByName'] = function (_0x370a0d) {
        const _0x4928f3 = document[_0x1f45('0xc')] ? document[_0x1f45('0xc')]['split']('; ') : [];
        for (let _0x24e2b1 = 0x0; _0x24e2b1 < _0x4928f3[_0x1f45('0x1')]; _0x24e2b1++) {
            const _0x15e3a1 = _0x4928f3[_0x24e2b1][_0x1f45('0x0')]('=');
            const _0x3f0197 = _0x15e3a1[_0x1f45('0xe')]();
            const _0x1dbff1 = _0x15e3a1[_0x1f45('0xa')]('=');
            if (_0x3f0197 === _0x370a0d) return _0x1dbff1;
        }
        return null;
    };

    function _0x4ffcb8(_0x3766cd) {
        if (typeof _0x3766cd !== 'string') return [];
        return Array[_0x1f45('0x2')](_0x3766cd)[_0x1f45('0x4')](_0x38c360 => _0x38c360[_0x1f45('0x3')](0x0));
    }

    function _0x51d7c9(_0x5f35d4, _0x1685c2) {
        if (!Array['isArray'](_0x5f35d4) || !Array['isArray'](_0x1685c2)) {
            console[_0x1f45('0xd')]('XOR inputs invalid', _0x5f35d4, _0x1685c2);
            return [];
        }
        const _0x1a4e38 = Math['min'](_0x5f35d4[_0x1f45('0x1')], _0x1685c2[_0x1f45('0x1')]);
        let _0x26db97 = [];
        for (let _0x59cc3b = 0x0; _0x59cc3b < _0x1a4e38; _0x59cc3b++)_0x26db97[_0x1f45('0x5')](_0x5f35d4[_0x59cc3b] ^ _0x1685c2[_0x59cc3b]);
        return _0x26db97;
    }

    function _0x24506b(_0x175b38, _0x1d2020) {
        if (!Array['isArray'](_0x175b38)) {
            console[_0x1f45('0xd')]('rotateArray: argument is not an array:', _0x175b38);
            return [];
        }
        const _0x227863 = _0x175b38[_0x1f45('0x1')];
        if (_0x227863 === 0x0) return [];
        _0x1d2020 = _0x1d2020 % _0x227863;
        return _0x175b38[_0x1f45('0x6')](_0x1d2020)[_0x1f45('0x7')](_0x175b38[_0x1f45('0x6')](0x0, _0x1d2020));
    }

    function _0x328e7f(_0x3f406c) {
        return _0x3f406c[_0x1f45('0x4')](_0x4a1e56 => _0x4a1e56[_0x1f45('0x8')](0x10)[_0x1f45('0x9')](2, '0'))[_0x1f45('0xa')]('');
    }

    function _0x1f98a4(_0x28af81) {
        if (!Array['isArray'](_0x28af81) || _0x28af81[_0x1f45('0x1')] === 0x0) {
            console[_0x1f45('0xd')]('simpleHash: invalid or empty array', _0x28af81);
            return 0x0;
        }
        return _0x28af81[_0x1f45('0xb')]((_0x1f5514, _0x4f6a6e) => (_0x1f5514 + _0x4f6a6e) % 0x100, 0x0);
    }

    function generateToken(_0x4b91db, _0x1d2b94) {
        const _0x11f4a9 = _0x4ffcb8(_0x4b91db);
        const _0x20ec3c = _0x4ffcb8(_0x1d2b94);
        if (_0x11f4a9[_0x1f45('0x1')] === 0x0 || _0x20ec3c[_0x1f45('0x1')] === 0x0) {
            console[_0x1f45('0xd')]('Empty or invalid input strings', _0x4b91db, _0x1d2b94);
            return '';
        }
        let _0x3c0927 = _0x51d7c9(_0x11f4a9, _0x20ec3c);
        if (!Array['isArray'](_0x3c0927) || _0x3c0927[_0x1f45('0x1')] === 0x0) {
            console[_0x1f45('0xd')]('Invalid XOR result', _0x3c0927);
            return '';
        }
        const _0x24e10e = (_0x11f4a9[_0x1f45('0xb')]((_0x5e92f1, _0x56b58e) => _0x5e92f1 + _0x56b58e, 0x0) + _0x20ec3c[_0x1f45('0xb')]((_0x238a64, _0x4e313d) => _0x238a64 + _0x4e313d, 0x0)) % _0x3c0927[_0x1f45('0x1')];
        _0x3c0927 = _0x24506b(_0x3c0927, _0x24e10e);
        const _0x11a32f = _0x1f98a4(_0x3c0927);
        _0x3c0927[_0x1f45('0x5')](_0x11a32f);
        return _0x328e7f(_0x3c0927);
    }

    window['generateToken'] = generateToken;
})();

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
        const proxyUrl = `https://animeext-m5lt.onrender.com/image?url=${encodeURIComponent(anime.image)}`;
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

    const container = document.getElementById('card-container');
    const pagination = document.getElementById('pagination-controls');

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

    renderCards(filtered);
    if (pagination) pagination.innerHTML = '';
}

/**
 * =======================================================
 * FUNCIONES DE CARGA Y PAGINACIÓN
 * =======================================================
 */

async function fetchJsonList() {
    const key1 = window.getCookieByName('_K0x1FLVTA0xAA1');
    const key2 = window.getCookieByName('_K0x2FLVTA0xFF2');

    if (!key1 || !key2) {
        console.error('Faltan claves para construir el token');
        return;
    }

    const token = window.generateToken(key1, key2);
    if (!token) {
        console.error('No se pudo generar el token');
        return;
    }

    try {
        const resp = await fetch('/anime/list', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Auth-Token': token
            }
        });

        if (!resp.ok) return;

        const json = await resp.json();
        fullAnimeList = Array.isArray(json.animes) ? json.animes : [];
        console.log(`[LIST] Lista cargada con ${fullAnimeList.length} animes.`);
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
    if (screenWidth < 400) groupSize = 2;
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
        const proxyUrl = `https://animeext-m5lt.onrender.com/image?url=${encodeURIComponent(anime.image)}`;
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
        episodesList.style.height = '645px';
      }
    }
}

async function openModal(data, animeTitle) {
    currentAnime = data;
    ajustarAlturaEpisodesList(currentAnime.episodes_count);
    const modalImage = document.getElementById('modalImage');
    const modalTitle = document.getElementById('modalTitle');
    const episodesList = document.getElementById('episodes-list');
    const statusBtn = document.getElementById('modal-status-btn');
    let favBtn = document.getElementById('modal-fav-btn');

    const proxyUrl = `https://animeext-m5lt.onrender.com/image?url=${encodeURIComponent(data.image)}`;

    if (modalImage) modalImage.src = proxyUrl;
    if (modalTitle) modalTitle.textContent = cleanTitle(animeTitle);
    if (episodesList) episodesList.innerHTML = '';
    initFavoriteButton(animeTitle);
    initShareButton(animeTitle);

    // Configurar botón de FAVORITO
    if (favBtn) {
        const isFavorite = await esFavoritoIndexed(animeTitle);
        favBtn.textContent = isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos';
        favBtn.classList.toggle('btn-warning', isFavorite);
        favBtn.classList.toggle('btn-outline-warning', !isFavorite);
        favBtn.onclick = (e) => {
            e.stopPropagation();
            toggleFavoritoIndexed(animeTitle, favBtn);
        };
    }

    // Generar lista de episodios
    if (episodesList) {
        const div = document.createElement('div');
        div.className = 'status-indicator';

        const estado = (data.status || "Desconocido").toLowerCase();
        let texto = "Desconocido";
        let color = "#343a40";

        if (estado.includes("emisión") || estado.includes("emision") || estado.includes("ongoing")) {
            texto = `Próxima emisión: ${data.next_episode_date || "Desconocida"}`;
            color = "#28a745";
        } else if (estado.includes("finalizado") || estado.includes("finished") || estado.includes("completed")) {
            texto = data.status;
            color = "#fb3447"; // rojo personalizado
        }

        div.innerHTML = `
        <button type="button" class="episode-status status" 
                style="background-color:${color} !important; cursor: default; font-weight:600; color:#fff;">
            ${texto}
        </button>
        `;

        episodesList.appendChild(div);
        for (let i = 1; i <= data.episodes_count; i++) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'episode-button';
            btn.textContent = `Episodio ${i}`;
            btn.addEventListener('click', () => {
                window.location.href = `./player?id=${encodeURIComponent(data.id)}&ep=${i}`;
            });
            episodesList.appendChild(btn);
        }
    }

    // Mostrar modal
    const animeModalEl = document.getElementById('animeModal');
    if (animeModalEl) {
        const modal = new bootstrap.Modal(animeModalEl);
        modal.show();
    }
}

async function mostrarFavoritosEnModal() {
    try {
        const favs = await cargarFavoritosIndexed();
        let modalEl = document.getElementById('modalFavoritos');

        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = 'modalFavoritos';
            modalEl.className = 'modal fade';
            modalEl.tabIndex = -1;
            modalEl.setAttribute('aria-labelledby', 'modalFavoritosLabel');
            modalEl.setAttribute('aria-hidden', 'true');
            modalEl.innerHTML = `
                <div class="modal-dialog modal-lg modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="modalFavoritosLabel">Favoritos</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
                        </div>
                        <div class="modal-body">
                            <div id="favoritosContainer" class="d-flex flex-wrap justify-content-start gap-3"></div>
                        </div>
                    </div>
                </div>`;
            document.body.appendChild(modalEl);
        }

        const favContainer = modalEl.querySelector('#favoritosContainer');
        if (!favContainer) return;

        favContainer.innerHTML = '';
        const favoritosData = fullAnimeList.filter(anime => favs.includes(anime.title));

        if (favoritosData.length === 0) {
            favContainer.innerHTML = '<p class="text-white-50">Aún no has agregado animes a favoritos.</p>';
        } else {
            favoritosData.forEach(anime => {
                const card = document.createElement('div');
                card.className = 'anime-card';
                card.style.cursor = 'pointer';
                card.style.width = '150px';
                const proxyUrl = `https://animeext-m5lt.onrender.com/image?url=${encodeURIComponent(anime.image)}`;
                card.innerHTML = `
                    <img src="${proxyUrl}" alt="Imagen de ${cleanTitle(anime.title)}" class="anime-image"  style="width: 100%; border-radius: 4px;" />
                    <div class="anime-title" style="text-align:center; font-size: 0.9rem; margin-top: 5px;">${cleanTitle(anime.title)}</div>
                `;
                card.addEventListener('click', () => {
                    openModal(anime, anime.title);
                    const modalFavoritos = bootstrap.Modal.getInstance(modalEl);
                    if (modalFavoritos) modalFavoritos.hide();
                });
                favContainer.appendChild(card);
            });
        }

        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    } catch (err) {
        console.error('Error mostrando favoritos en modal:', err);
    }
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
    const data = null;
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
function initShareButton(animeTitle) {
    const btn = document.getElementById('shareBtn');
    if (!btn) return;

    btn.onclick = async (e) => {
        e.stopPropagation();

        const shareUrl = `${window.location.origin}/?anime=${encodeURIComponent(animeTitle)}`;

        try {
            if (navigator.share) {
                await navigator.share({
                    title: animeTitle,
                    text: `Mira este anime: ${animeTitle}`,
                    url: shareUrl
                });
            } else {
                await navigator.clipboard.writeText(shareUrl);
                alert('Link copiado al portapapeles ✅');
            }
        } catch (err) {
            console.error('Error compartiendo:', err);
        }
    };
}