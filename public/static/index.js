/**
 * =======================================================
 * VARIABLES GLOBALES
 * =======================================================
 * Declaración de variables globales y constantes.
 */
const container = document.getElementById('card-container');
const mainContent = document.getElementById('main-content');
const recolectForm = document.getElementById('recolect-form');
const pageTitle = document.getElementById('page-title');
const suggestionBox = document.getElementById('search-suggestions');
const hamburgerBtn = document.getElementById('hamburgerBtn');
const mobileDropdownMenu = document.getElementById('mobileDropdownMenu');

const DB_NAME = 'FavoritosDB';
const DB_VERSION = 1;
const STORE_NAME = 'favoritos';

let currentAnime = null;
const loadedCards = new Map();
let fullAnimeList = [];


/**
 * =======================================================
 * INICIALIZACIÓN Y EVENTOS
 * =======================================================
 * Eventos principales que se ejecutan al cargar la página.
 */

document.addEventListener("DOMContentLoaded", () => {
    fetch("/anime/last")
        .then(res => res.json())
        .then(data => {
            const container = document.getElementById("anime-list");
            if (!Array.isArray(data)) return;
            data.forEach(anime => {
                const cardHtml = `
                        <div class="anime-card-init" onclick="window.location.href='/player?uid=${anime.id}&ep=${anime.episodioNum}'">
                            <img src="${anime.imagen}" alt="${anime.alt || anime.titulo}" class="card-img">
                            <div class="card-content">
                                <h4 class="card-title">${anime.titulo}</h4>
                                <p class="card-subtitle">${anime.episodio}</p>
                            </div>
                        </div>`;
                container.innerHTML += cardHtml;
            });
        })
        .catch(error => console.error("Error al obtener datos:", error));
});

// Funciones modificadas para mostrar/ocultar elementos
function mostrarInicio(e) {
    showLoader();
    e.preventDefault();

    // Mostrar sección y ocultar la otra
    document.getElementById("anime-section").classList.remove("d-none");
    document.getElementById("directory-section").classList.add("d-none");

    // Actualizar clases active en ambos menús
    setActiveMenu('mobileNavInicio');

    // Mostrar barra lateral y ocultar paginación
    document.querySelector('.sidebar').classList.remove('d-none');
    document.getElementById("pagination-controls").classList.add("d-none");

    // Esperar 1 segundo para cerrar loader
    setTimeout(() => {
        hideLoader();
    }, 1000);
}

function mostrarDirectorio(e) {
    showLoader();
    e.preventDefault();

    // Mostrar sección y ocultar la otra
    document.getElementById("anime-section").classList.add("d-none");
    document.getElementById("directory-section").classList.remove("d-none");

    // Actualizar clases active en ambos menús
    setActiveMenu('mobileNavDirectorio');

    // Ocultar barra lateral y mostrar paginación
    document.querySelector('.sidebar').classList.add('d-none');
    document.getElementById("pagination-controls").classList.remove("d-none");

    // Esperar 1 segundo para cerrar loader
    setTimeout(() => {
        hideLoader();
    }, 1000);
}
function mostrarDirectorio_S() {
    showLoader();

    // Mostrar sección y ocultar la otra
    document.getElementById("anime-section").classList.add("d-none");
    document.getElementById("directory-section").classList.remove("d-none");

    // Actualizar clases active en ambos menús
    setActiveMenu('mobileNavDirectorio');

    // Ocultar barra lateral y mostrar paginación
    document.querySelector('.sidebar').classList.add('d-none');
    document.getElementById("pagination-controls").classList.remove("d-none");

    // Esperar 1 segundo para cerrar loader
    setTimeout(() => {
        hideLoader();
    }, 1000);
}
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

function findAnimeByUId(id) {
    // Verificar si el ID es un número válido
    if (typeof id !== 'number' || id <= 0) {
        console.error("El ID proporcionado no es un número válido.");
        return null;
    }
    const animeEncontrado = fullAnimeList.find(anime => anime.id === id);

    // Retornar el anime encontrado o null si no existe
    return animeEncontrado || null;
}

document.addEventListener("DOMContentLoaded", () => {
    const sidebarList = document.querySelector(".sidebar-menu");

    const checkInterval = setInterval(() => {
        if (Array.isArray(fullAnimeList) && fullAnimeList.length > 0) {
            clearInterval(checkInterval); // Ya cargó, dejamos de checar

            const animesEnEmision = fullAnimeList.filter(anime => anime.status === "En emisión").slice(0, 15); // Limita a 15 animes

            animesEnEmision.forEach(anime => {
                const li = document.createElement("li");
                li.classList.add("mb-2");
                li.style.cursor = "pointer";

                li.innerHTML = `
                        <div class="text-white text-decoration-none d-flex align-items-center anime-link">
                            <i class="fa fa-play me-2 text-danger"></i>
                            <span class="text-truncate">${anime.title}</span>
                        </div>
                    `;

                li.addEventListener('click', () => {
                    console.log(anime.id)
                    const dataAnime = findAnimeByUId(anime.id); // usa el id (1, 2, etc.)
                    console.log(dataAnime)
                    openModal(dataAnime, anime.title);
                });

                sidebarList.appendChild(li);
            });
        }
    }, 300); // Intenta cada 300 ms
});
window.addEventListener('load', async () => {
    const loader = document.getElementById('loader');
    const MIN_LOADING_TIME = 3000;
    const startTime = performance.now();

    try {
        await fetchJsonList(); // Espera a que se cargue la lista completa

        const urlParams = new URLSearchParams(window.location.search);
        const searchTerm = urlParams.get('s');

        // Si existe el parámetro 's', ejecuta la búsqueda.
        if (searchTerm) {
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.value = searchTerm;
            }
            searchAnime(null, searchTerm);
        } else {
            // Si no hay parámetro 's', muestra la paginación normal.
            const page = getPageParam();
            const paginated = paginate(fullAnimeList, page);
            clearCards();
            for (const anime of paginated) {
                createCard(anime, anime.title);
            }
            createPagination(fullAnimeList.length, page);
        }

        // Espera a que las imágenes sean visibles (esto es crucial).
        await waitForVisibleImages('.anime-card img');
        
    } catch (e) {
        console.error("Error al cargar los datos:", e);
    } finally {
        const elapsed = performance.now() - startTime;
        const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
        setTimeout(() => {
            loader.classList.add('fade-out');
            setTimeout(() => loader.style.display = 'none', 600);
        }, remainingTime);
    }
});


// Evento para el historial de navegación (back/forward)
window.addEventListener('popstate', () => {
    const page = getPageParam();
    const paginated = paginate(fullAnimeList, page);
    clearCards();
    for (const anime of paginated) {
        createCard(anime, anime.title);
    }
    createPagination(fullAnimeList.length, page);
});

// Evento de redimensionamiento de la ventana
window.addEventListener('resize', () => {
    const page = getPageParam();
    createPagination(fullAnimeList.length, page);
});

// Eventos del DOM (DOMContentLoaded) para la barra de búsqueda móvil
document.addEventListener('DOMContentLoaded', () => {
    const searchForm = document.querySelector('.search-form');
    const searchToggleBtn = document.getElementById('search-toggle-btn');
    const searchInput = document.getElementById('searchInput');

    const closeBtn = document.createElement('button');
    closeBtn.id = 'search-close-btn';
    closeBtn.type = 'button';
    closeBtn.innerHTML = '<i class="fa fa-times"></i>';
    searchForm.appendChild(closeBtn);

    function openMobileSearch() {
        searchForm.classList.add('mobile-search-active');
        searchInput.classList.remove('hiding');
        searchInput.classList.add('showing');
        searchInput.style.display = 'block';
        searchInput.focus();
        document.querySelector('.topbar img').style.display = 'none';
    }

    function closeMobileSearch() {
        searchInput.classList.remove('showing');
        searchInput.classList.add('hiding');
        searchForm.classList.add('hiding');
        setTimeout(() => {
            searchForm.classList.remove('mobile-search-active', 'hiding');
            searchInput.classList.remove('hiding');
            searchInput.style.display = 'none';
            document.querySelector('.topbar img').style.display = '';
        }, 300);
    }

    searchToggleBtn.addEventListener('click', openMobileSearch);
    closeBtn.addEventListener('click', closeMobileSearch);

    searchForm.addEventListener('submit', e => {
        if (searchForm.classList.contains('mobile-search-active')) {
            e.preventDefault();
            closeMobileSearch();
        }
    });

    document.addEventListener('click', e => {
        if (
            searchForm.classList.contains('mobile-search-active') &&
            !searchForm.contains(e.target) &&
            e.target !== searchToggleBtn
        ) {
            closeMobileSearch();
        }
    });
});

/**
 * =======================================================
 * MENU HAMBURGUESA
 * =======================================================
 */
function toggleMobileMenu(show) {
    if (show === undefined) {
        // toggle
        const isVisible = mobileDropdownMenu.classList.contains('show');
        mobileDropdownMenu.classList.toggle('show', !isVisible);
        mobileDropdownMenu.setAttribute('aria-hidden', isVisible ? 'true' : 'false');
    } else if (show) {
        mobileDropdownMenu.classList.add('show');
        mobileDropdownMenu.setAttribute('aria-hidden', 'false');
    } else {
        mobileDropdownMenu.classList.remove('show');
        mobileDropdownMenu.setAttribute('aria-hidden', 'true');
    }
}

hamburgerBtn.addEventListener('click', () => {
    toggleMobileMenu();
});

// Cerrar menú si haces click fuera
document.addEventListener('click', (e) => {
    if (!mobileDropdownMenu.contains(e.target) && !hamburgerBtn.contains(e.target)) {
        toggleMobileMenu(false);
    }
});

// Cerrar menú al hacer scroll
window.addEventListener('scroll', () => {
    toggleMobileMenu(false);
});

// Función para establecer la clase active en ambos menús
function setActiveMenu(idActivo) {
    // Menú principal
    const mainLinks = document.querySelectorAll('nav.main-nav a.nav-item');
    mainLinks.forEach(link => {
        if (link.id === idActivo.replace('mobile', '')) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    // Menú móvil
    const mobileLinks = document.querySelectorAll('#mobileDropdownMenu a');
    mobileLinks.forEach(link => {
        if (link.id === idActivo) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

/**
 * =======================================================
 * FUNCIONES DE CARGA Y PAGINACIÓN
 * =======================================================
 * Funciones relacionadas con la carga inicial de datos,
 * paginación y creación de tarjetas.
 */

/**
 * Función para cargar la lista de animes desde el servidor.
 * Utiliza un token de autenticación generado dinámicamente.
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

        const totalPages = Math.ceil(fullAnimeList.length / 24);
        let page = getPageParam();

        if (page > totalPages) {
            page = totalPages;
            const params = new URLSearchParams(window.location.search);
            params.set('page', page);
            window.history.replaceState({ page }, '', `${window.location.pathname}?${params.toString()}`);
        }

        const paginated = paginate(fullAnimeList, page);

        clearCards();
        for (const anime of paginated) {
            createCard(anime, anime.title);
        }

        createPagination(fullAnimeList.length, page);

    } catch (err) {
        console.error("Error cargando lista:", err);
    }
}

/**
 * Cambia la página actual de la lista de animes.
 * @param {number} page - El número de la página a la que se desea ir.
 */
async function changePage(page) {
    showLoader();
    window.scrollTo({ top: 0, behavior: 'auto' });
    const params = new URLSearchParams(window.location.search);
    params.set('page', page);
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.pushState({ page }, '', newUrl);

    const paginated = paginate(fullAnimeList, page);
    clearCards();
    for (const anime of paginated) {
        createCard(anime, anime.title);
    }
    createPagination(fullAnimeList.length, page);
    await waitForVisibleImages();
    hideLoader();
}

/**
 * Crea y muestra los controles de paginación.
 * @param {number} totalItems - El número total de elementos.
 * @param {number} currentPage - La página actual.
 */
function createPagination(totalItems, currentPage) {
    const paginationContainer = document.getElementById('pagination-controls');
    if (!paginationContainer) return;

    paginationContainer.innerHTML = '';

    // Inyectar estilos solo una vez
    if (!document.getElementById('pagination-styles')) {
        const style = document.createElement('style');
        style.id = 'pagination-styles';
        style.textContent = `
            #pagination {
                display: flex;
                flex-wrap: wrap;
                justify-content: center;
                gap: 8px;
                margin: 24px 0 20px 0;
            }
            .pagination-btn {
                padding: 6px 14px;
                margin: 4px;
                border-radius: 999px;
                font-weight: 600;
                font-size: 14px;
                border: 2px solid aquamarine;
                background-color: transparent;
                color: aquamarine;
                cursor: pointer;
                transition: all 0.2s ease-in-out;
                box-shadow: 0 0 0 transparent;
            }
            .pagination-btn:hover {
                transform: translateY(-3px);
                box-shadow: 0 4px 8px rgba(127, 255, 212, 0.3);
            }
            .pagination-btn.active {
                background-color: aquamarine;
                color: #111;
            }
            .pagination-btn.nav {
                border-color: #ccc;
                color: #ccc;
            }
            .pagination-btn.nav:hover {
                background-color: #ccc;
                color: black;
                transform: translateY(-3px);
            }
            @media (max-width: 480px) {
                .pagination-btn {
                    padding: 4px 10px;
                    font-size: 12px;
                    margin: 2px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    const pagination = document.createElement('div');
    pagination.id = 'pagination';

    const totalPages = Math.ceil(totalItems / 24);

    let groupSize;
    const screenWidth = window.innerWidth;
    if (screenWidth < 400) groupSize = 2;
    else if (screenWidth < 650) groupSize = 5;
    else if (screenWidth < 800) groupSize = 7;
    else groupSize = 10;

    const currentGroupStart = Math.floor((currentPage - 1) / groupSize) * groupSize + 1;
    const currentGroupEnd = Math.min(currentGroupStart + groupSize - 1, totalPages);

    function createPageButton(page, label = null, isNav = false) {
        const btn = document.createElement('button');
        btn.textContent = label || page;
        btn.className = 'pagination-btn';
        if (isNav) btn.classList.add('nav');
        if (page === currentPage) btn.classList.add('active');
        btn.addEventListener('click', () => {
            changePage(page);
        });
        return btn;
    }

    if (currentGroupStart > 1) {
        pagination.appendChild(createPageButton(currentPage - 1, '«', true));
    }

    for (let i = currentGroupStart; i <= currentGroupEnd; i++) {
        pagination.appendChild(createPageButton(i));
    }

    if (currentGroupEnd < totalPages) {
        pagination.appendChild(createPageButton(currentPage + 1, '»', true));
    }

    paginationContainer.appendChild(pagination);
}

/**
 * Crea una tarjeta (card) de anime y la añade al contenedor.
 * @param {object} data - Los datos del anime.
 * @param {string} animeTitle - El título del anime.
 */
function createCard(data, animeTitle) {
    const card = document.createElement('div');
    card.className = 'anime-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');

    const proxyUrl = `/image?url=${encodeURIComponent(data.image)}`;

    card.innerHTML = `
        <img src="${proxyUrl}" alt="Imagen de ${cleanTitle(animeTitle)}" class="anime-image" loading="all" />
        <div class="anime-title">${cleanTitle(animeTitle)}</div>
    `;

    card.addEventListener('click', () => openModal(data, animeTitle));
    container.appendChild(card);
    loadedCards.set(animeTitle, card);
}


/**
 * =======================================================
 * FUNCIONES DE BÚSQUEDA
 * =======================================================
 * Lógica relacionada con la búsqueda y sugerencias de animes.
 */

// Evento de escucha para la búsqueda al presionar "Enter"
document.getElementById('searchInput').addEventListener('submit', searchAnime);

// Evento para mostrar sugerencias mientras se escribe
document.getElementById('searchInput').addEventListener('input', () => {
    const searchInput = document.getElementById('searchInput');
    const value = normalizeText(searchInput.value);
    suggestionBox.innerHTML = '';

    if (!value || !fullAnimeList.length) {
        suggestionBox.style.display = 'none';
        return;
    }

    const results = fullAnimeList
        .filter(anime => normalizeText(anime.title).includes(value))
        .slice(0, 4);

    results.forEach(anime => {
        const item = document.createElement('li');
        const proxyUrl = `/image?url=${encodeURIComponent(anime.image)}`;
        item.innerHTML = `
            <img src="${proxyUrl}" alt="${anime.title}" />
            <span>${anime.title}</span>
        `;
        item.addEventListener('click', () => {
            openModal(anime, anime.title);
            suggestionBox.innerHTML = '';
            suggestionBox.style.display = 'none';
        });
        suggestionBox.appendChild(item);
    });

    suggestionBox.style.display = results.length ? 'block' : 'none';
});

// Evento para cerrar sugerencias al hacer clic fuera
document.addEventListener('click', e => {
    const searchInput = document.getElementById('searchInput');
    if (!suggestionBox.contains(e.target) && e.target !== searchInput) {
        suggestionBox.innerHTML = '';
        suggestionBox.style.display = 'none';
    }
});


/**
 * Filtra y muestra los animes basándose en la búsqueda del usuario.
 * @param {Event | null} event - El evento del formulario (puede ser nulo si se llama desde la carga).
 * @param {string} [term=null] - El término de búsqueda opcional para usar en lugar del input.
 */
function searchAnime(event = null, term = null) {
    if (event && event.preventDefault) {
        event.preventDefault();
        mostrarDirectorio(event);
    }
    if (term) {mostrarDirectorio_S();}
    const input = term || document.getElementById('searchInput').value;
    const inputNormalized = normalizeText(input);

    const url = new URL(window.location);

    // Si hay una búsqueda, agrega el parámetro 's' a la URL.
    // Si no hay búsqueda, lo elimina.
    if (inputNormalized) {
        url.searchParams.set('s', inputNormalized);
    } else {
        url.searchParams.delete('s');
    }

    // Actualiza la URL sin recargar la página si no hay término inicial.
    // Si la función se llama desde la carga, no es necesario hacer pushState.
    if (!term) {
        window.history.pushState({}, '', url);
    }

    if (!inputNormalized) {
        const page = getPageParam();
        const paginated = paginate(fullAnimeList, page);
        clearCards();
        for (const anime of paginated) {
            createCard(anime, anime.title);
        }
        createPagination(fullAnimeList.length, page);
        return;
    }

    const terms = inputNormalized.split(' ').filter(Boolean);

    const filtered = fullAnimeList.filter(anime => {
        const titleNormalized = normalizeText(anime.title);
        return terms.every(term => titleNormalized.includes(term));
    });

    clearCards();
    filtered.forEach(anime => createCard(anime, anime.title));

    const pagination = document.getElementById('pagination');
    if (pagination) pagination.innerHTML = '';
}
/**
 * =======================================================
 * MODAL Y FAVORITOS
 * =======================================================
 * Lógica para mostrar los detalles del anime en un modal
 * y gestionar la funcionalidad de favoritos con IndexedDB.
 */

/**
 * Abre el modal con los detalles de un anime específico.
 * @param {object} data - Los datos del anime.
 * @param {string} animeTitle - El título del anime.
 */
async function openModal(data, animeTitle) {
    currentAnime = data;

    const modalImage = document.getElementById('modalImage');
    const modalTitle = document.getElementById('modalTitle');
    const episodesList = document.getElementById('episodes-list');

    const proxyUrl = `/image?url=${encodeURIComponent(data.image)}`;

    modalImage.src = proxyUrl;
    modalTitle.textContent = cleanTitle(animeTitle);
    episodesList.innerHTML = '';

    // Botón favorito dinámico
    let favBtn = document.getElementById('modal-fav-btn');
    if (!favBtn) {
        favBtn = document.createElement('button');
        favBtn.id = 'modal-fav-btn';
        favBtn.type = 'button';
        favBtn.className = 'btn btn-sm mx-1';
        favBtn.style.marginTop = '5px';
        modalTitle.insertAdjacentElement('afterend', favBtn);
    }

    // Reemplazar botón para evitar listeners viejos
    const newFavBtn = favBtn.cloneNode(true);
    favBtn.replaceWith(newFavBtn);
    favBtn = newFavBtn;

    favBtn.addEventListener('click', e => {
        e.stopPropagation();
        toggleFavoritoIndexed(animeTitle, favBtn);
    });

    // Actualizar texto y clase según favorito
    const favoritos = await cargarFavoritosIndexed();
    if (favoritos.includes(animeTitle)) {
        favBtn.textContent = 'Quitar de favoritos';
        favBtn.classList.remove('btn-outline-warning');
        favBtn.classList.add('btn-warning');
    } else {
        favBtn.textContent = 'Agregar a favoritos';
        favBtn.classList.remove('btn-warning');
        favBtn.classList.add('btn-outline-warning');
    }

    // Lista de episodios
    for (let i = 1; i <= data.episodes_count; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'episode-button';
        btn.textContent = `Episodio ${i}`;
        btn.addEventListener('click', () => {
            const url = `/player?id=${encodeURIComponent(data.id)}&ep=${i}`;
            window.location.href = url;
        });
        episodesList.appendChild(btn);
    }

    const animeModalEl = document.getElementById('animeModal');
    const modal = new bootstrap.Modal(animeModalEl);
    modal.show();
}

/**
 * Muestra los animes marcados como favoritos en un modal.
 */
async function mostrarFavoritosEnModal() {
    try {
        const favs = await cargarFavoritosIndexed();

        // Crear modal si no existe
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
        favContainer.innerHTML = '';

        const favoritosData = favs.map(title => fullAnimeList.find(a => a.title === title)).filter(Boolean);

        favoritosData.forEach(anime => {
            const card = document.createElement('div');
            card.className = 'anime-card';
            card.style.cursor = 'pointer';
            card.style.width = '150px';

            const proxyUrl = `/image?url=${encodeURIComponent(anime.image)}`;

            card.innerHTML = `
                <img src="${proxyUrl}" alt="Imagen de ${cleanTitle(anime.title)}" class="anime-image" loading="lazy" style="width: 100%; border-radius: 4px;" />
                <div class="anime-title" style="text-align:center; font-size: 0.9rem; margin-top: 5px;">${cleanTitle(anime.title)}</div>
            `;

            card.addEventListener('click', () => {
                openModal(anime, anime.title);
                const modalFavoritos = bootstrap.Modal.getInstance(modalEl);
                modalFavoritos.hide();
            });

            favContainer.appendChild(card);
        });

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
 * Funciones generales y utilitarias que no pertenecen a una
 * sección específica, pero son usadas por varias partes del código.
 */

/**
 * Limpia y normaliza un título.
 * @param {string} title - El título a limpiar.
 * @returns {string} El título limpio.
 */
function cleanTitle(title) {
    return title.trim();
}

/**
 * Obtiene el parámetro de página de la URL.
 * @returns {number} El número de página, por defecto 1.
 */
function getPageParam() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('page');
    if (!/^[1-9]\d*$/.test(raw)) return 1;
    return parseInt(raw, 10);
}

/**
 * Pagina una lista de elementos.
 * @param {Array} items - La lista de elementos a paginar.
 * @param {number} page - La página actual.
 * @param {number} perPage - Elementos por página.
 * @returns {Array} Los elementos de la página solicitada.
 */
function paginate(items, page, perPage = 24) {
    const start = (page - 1) * perPage;
    return items.slice(start, start + perPage);
}

/**
 * Limpia el contenedor de tarjetas y el mapa de tarjetas cargadas.
 */
function clearCards() {
    container.innerHTML = '';
    loadedCards.clear();
}

/**
 * Normaliza un texto para la búsqueda (minúsculas, sin acentos).
 * @param {string} text - El texto a normalizar.
 * @returns {string} El texto normalizado.
 */
function normalizeText(text) {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Muestra el loader con una animación de fade-in.
 */
function showLoader() {
    const loader = document.getElementById('loader');
    loader.classList.add('fade-once');
    loader.classList.remove('fade-out');
    loader.style.display = 'flex';
    void loader.offsetWidth;
    loader.classList.add('fade-in');
}

/**
 * Oculta el loader con una animación de fade-out.
 */
function hideLoader() {
    const loader = document.getElementById('loader');
    loader.classList.remove('fade-in');
    loader.classList.add('fade-out');
    setTimeout(() => {
        loader.style.display = 'none';
        loader.classList.remove('fade-once');
    }, 1000);
}

/**
 * Espera a que las imágenes de un selector específico estén cargadas.
 * @param {string} selector - Selector CSS para las imágenes.
 * @returns {Promise<void>} Una promesa que se resuelve cuando todas las imágenes están cargadas.
 */
async function waitForVisibleImages(selector = '.anime-card img') {
    const images = Array.from(document.querySelectorAll(selector));
    await Promise.all(images.map(img => {
        if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
        return new Promise(resolve => img.onload = img.onerror = resolve);
    }));
}

/**
 * Transforma un título de anime a un nombre de archivo JSON.
 * @param {string} animeTitle - El título del anime.
 * @returns {string} El nombre de archivo JSON.
 */
function toJsonFilename(animeTitle) {
    return animeTitle.trim().toLowerCase().replace(/\s+/g, '-') + '.json';
}


/**
 * =======================================================
 * INDEXEDDB FAVORITOS
 * =======================================================
 * Funciones para interactuar con IndexedDB y gestionar
 * los animes favoritos.
 */

/**
 * Abre una conexión a la base de datos de favoritos.
 * @returns {Promise<IDBDatabase>} Una promesa que se resuelve con la conexión a la DB.
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

/**
 * Agrega un anime a la base de datos de favoritos.
 * @param {string} animeTitle - El título del anime.
 * @returns {Promise<boolean>} Promesa que indica si la operación fue exitosa.
 */
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

/**
 * Elimina un anime de la base de datos de favoritos.
 * @param {string} animeTitle - El título del anime.
 * @returns {Promise<boolean>} Promesa que indica si la operación fue exitosa.
 */
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

/**
 * Carga todos los títulos de animes favoritos.
 * @returns {Promise<string[]>} Una promesa con un array de títulos de animes favoritos.
 */
async function cargarFavoritosIndexed() {
    const db = await abrirDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => {
            const results = request.result.map(item => item.title);
            resolve(results);
        };
        request.onerror = () => reject('Error cargando favoritos');
    });
}

/**
 * Verifica si un anime es favorito.
 * @param {string} animeTitle - El título del anime.
 * @returns {Promise<boolean>} Una promesa que se resuelve en `true` si es favorito, `false` si no.
 */
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

/**
 * Alterna el estado de favorito de un anime y actualiza el botón.
 * @param {string} animeTitle - El título del anime.
 * @param {HTMLElement} btn - El botón a actualizar.
 */
async function toggleFavoritoIndexed(animeTitle, btn) {
    try {
        const favorito = await esFavoritoIndexed(animeTitle);
        if (favorito) {
            await eliminarFavoritoIndexed(animeTitle);
            btn.textContent = 'Agregar a favoritos';
            btn.classList.remove('btn-warning');
            btn.classList.add('btn-outline-warning');
        } else {
            await agregarFavoritoIndexed(animeTitle);
            btn.textContent = 'Quitar de favoritos';
            btn.classList.remove('btn-outline-warning');
            btn.classList.add('btn-warning');
        }
    } catch (err) {
        console.error('Error toggling favorito:', err);
    }
}

/**
 * Agrega un botón de favorito a todas las tarjetas de anime cargadas.
 */
async function agregarBotonFavoritoEnCardsIndexed() {
    const favoritos = await cargarFavoritosIndexed();
    loadedCards.forEach((card, animeTitle) => {
        if (card.querySelector('.fav-btn')) return;

        const favBtn = document.createElement('button');
        favBtn.type = 'button';
        favBtn.className = 'fav-btn btn btn-sm mx-1';
        favBtn.style.marginTop = '5px';

        if (favoritos.includes(animeTitle)) {
            favBtn.textContent = 'Quitar de favoritos';
            favBtn.classList.add('btn-warning');
        } else {
            favBtn.textContent = 'Agregar a favoritos';
            favBtn.classList.add('btn-outline-warning');
        }

        favBtn.addEventListener('click', e => {
            e.stopPropagation();
            toggleFavoritoIndexed(animeTitle, favBtn);
        });

        card.appendChild(favBtn);
    });
}


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