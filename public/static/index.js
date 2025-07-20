// ===== VARIABLES GLOBALES =====
const container = document.getElementById('card-container');
const mainContent = document.getElementById('main-content');
const recolectForm = document.getElementById('recolect-form');
const pageTitle = document.getElementById('page-title');
const suggestionBox = document.getElementById('search-suggestions');
const DB_NAME = 'FavoritosDB';
const DB_VERSION = 1;
const STORE_NAME = 'favoritos';

let currentAnime = null;
const loadedCards = new Map();
let fullAnimeList = [];


// ===== INICIALIZACIÓN Y EVENTOS AL CARGAR =====

// Loader y carga inicial
window.addEventListener('load', async () => {
  const loader = document.getElementById('loader');
  const MIN_LOADING_TIME = 3000;
  const startTime = performance.now();

  try {
    await fetchJsonList();

    // Esperar a que carguen las imágenes visibles
    const images = Array.from(document.querySelectorAll('.anime-card img'));
    await Promise.all(images.map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(resolve => img.onload = img.onerror = resolve);
    }));

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

// Evento para paginación con back/forward del navegador
window.addEventListener('popstate', (event) => {
  const page = getPageParam();
  const paginated = paginate(fullAnimeList, page);
  clearCards();
  for (const anime of paginated) {
    createCard(anime, anime.title);
  }
  createPagination(fullAnimeList.length, page);
});

// Ajustar paginación al cambiar tamaño ventana
window.addEventListener('resize', () => {
  const page = getPageParam();
  createPagination(fullAnimeList.length, page);
});


// ===== BARRA DE BÚSQUEDA MÓVIL =====
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


// ===== FUNCIONES UTILITARIAS =====
function cleanTitle(title) {
  return title.trim();
}

function getPageParam() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('page');
  if (!/^[1-9]\d*$/.test(raw)) return 1;
  return parseInt(raw, 10);
}

function paginate(items, page, perPage = 24) {
  const start = (page - 1) * perPage;
  return items.slice(start, start + perPage);
}

function clearCards() {
  container.innerHTML = '';
  loadedCards.clear();
}

function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function insertarCSS(css) {
  const style = document.createElement('style');
  style.type = 'text/css';
  style.appendChild(document.createTextNode(css));
  document.head.appendChild(style);
}

function showLoader() {
  const loader = document.getElementById('loader');
  loader.classList.add('fade-once');
  loader.classList.remove('fade-out');
  loader.style.display = 'flex';
  void loader.offsetWidth; // forzar reflow para animación
  loader.classList.add('fade-in');
}

function hideLoader() {
  const loader = document.getElementById('loader');
  loader.classList.remove('fade-in');
  loader.classList.add('fade-out');
  setTimeout(() => {
    loader.style.display = 'none';
    loader.classList.remove('fade-once');
  }, 1000);
}

async function waitForVisibleImages(selector = '.anime-card img') {
  const images = Array.from(document.querySelectorAll(selector));
  await Promise.all(images.map(img => {
    if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
    return new Promise(resolve => img.onload = img.onerror = resolve);
  }));
}

function toJsonFilename(animeTitle) {
  return animeTitle.trim().toLowerCase().replace(/\s+/g, '-') + '.json';
}


// ===== FUNCIONES DE CARGA Y PÁGINAS =====
async function fetchJsonList() {
  try {
    const resp = await fetch('/jsons/anime_list.json', { cache: 'no-store' });
    if (!resp.ok) return;

    fullAnimeList = await resp.json();

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

function createPagination(totalItems, currentPage) {
  const paginationContainer = document.getElementById('pagination-controls');
  if (!paginationContainer) return;

  paginationContainer.innerHTML = '';

  const pagination = document.createElement('div');
  pagination.id = 'pagination';
  pagination.className = 'pagination mt-4 justify-content-center flex-wrap';

  const totalPages = Math.ceil(totalItems / 24);

  let groupSize;
  const screenWidth = window.innerWidth;
  if (screenWidth < 400) {
    groupSize = 3;
  } else if (screenWidth < 600) {
    groupSize = 5;
  } else if (screenWidth < 800) {
    groupSize = 7;
  } else {
    groupSize = 10;
  }

  const currentGroupStart = Math.floor((currentPage - 1) / groupSize) * groupSize + 1;
  const currentGroupEnd = Math.min(currentGroupStart + groupSize - 1, totalPages);

  function createPageButton(page, label = null, customClass = '') {
    const btn = document.createElement('button');
    btn.textContent = label || page;
    btn.className = `btn btn-sm mx-1 ${page === currentPage ? 'btn-primary' : 'btn-outline-primary'} ${customClass}`;
    btn.addEventListener('click', () => {
      changePage(page);
    });
    return btn;
  }

  if (currentGroupStart > 1) {
    pagination.appendChild(createPageButton(currentGroupStart - 1, '«', 'btn-outline-secondary'));
  }

  for (let i = currentGroupStart; i <= currentGroupEnd; i++) {
    pagination.appendChild(createPageButton(i));
  }

  if (currentGroupEnd < totalPages) {
    pagination.appendChild(createPageButton(currentGroupEnd + 1, '»', 'btn-outline-secondary'));
  }

  paginationContainer.appendChild(pagination);
}

function createCard(data, animeTitle) {
  const card = document.createElement('div');
  card.className = 'anime-card';
  card.tabIndex = 0;
  card.setAttribute('role', 'button');

  const proxyUrl = `/proxy-image?url=${encodeURIComponent(data.image)}`;

  card.innerHTML = `
    <img src="${proxyUrl}" alt="Imagen de ${cleanTitle(animeTitle)}" class="anime-image" loading="all" />
    <div class="anime-title">${cleanTitle(animeTitle)}</div>
  `;

  card.addEventListener('click', () => openModal(data, animeTitle));
  container.appendChild(card);
  loadedCards.set(animeTitle, card);
}


// ===== FUNCIONES DE BÚSQUEDA =====
function searchAnime(event) {
  if (event.preventDefault) event.preventDefault();

  const input = document.getElementById('searchInput').value;
  const inputNormalized = normalizeText(input);

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

document.getElementById('searchInput').addEventListener('submit', searchAnime);

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
    const proxyUrl = `/proxy-image?url=${encodeURIComponent(anime.image)}`;
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

document.addEventListener('click', e => {
  const searchInput = document.getElementById('searchInput');
  if (!suggestionBox.contains(e.target) && e.target !== searchInput) {
    suggestionBox.innerHTML = '';
    suggestionBox.style.display = 'none';
  }
});


// ===== MODAL DE ANIME =====
async function openModal(data, animeTitle) {
  currentAnime = data;

  const modalImage = document.getElementById('modalImage');
  const modalTitle = document.getElementById('modalTitle');
  const episodesList = document.getElementById('episodes-list');

  const proxyUrl = `/proxy-image?url=${encodeURIComponent(data.image)}`;

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


// ===== FAVORITOS: IndexedDB =====
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
    request.onsuccess = () => {
      const results = request.result.map(item => item.title);
      resolve(results);
    };
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

    // Obtener contenedor para tarjetas
    const favContainer = modalEl.querySelector('#favoritosContainer');
    favContainer.innerHTML = ''; // limpiar

    // Buscar datos completos para favoritos
    const favoritosData = favs.map(title => fullAnimeList.find(a => a.title === title)).filter(Boolean);

    // Crear tarjetas para favoritos
    favoritosData.forEach(anime => {
      const card = document.createElement('div');
      card.className = 'anime-card';
      card.style.cursor = 'pointer';
      card.style.width = '150px';

      const proxyUrl = `/proxy-image?url=${encodeURIComponent(anime.image)}`;

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

    // Mostrar modal con Bootstrap 5
    const modal = new bootstrap.Modal(modalEl);
    modal.show();

  } catch (err) {
    console.error('Error mostrando favoritos en modal:', err);
  }
}