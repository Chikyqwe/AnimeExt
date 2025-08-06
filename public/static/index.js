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
(function(){
  const _0x5c6b = ['split', 'length', 'from', 'charCodeAt', 'map', 'push', 'slice', 'concat', 'toString', 'padStart', 'join', 'reduce', 'cookie', 'log', 'shift', 'get'];
  const _0x1f45 = function(_0x4371e1, _0x27160e) {
    _0x4371e1 = _0x4371e1 - 0x0;
    let _0x4bcda9 = _0x5c6b[_0x4371e1];
    return _0x4bcda9;
  };

  window[_0x1f45('0xf') + 'CookieByName'] = function(_0x370a0d) {
    const _0x4928f3 = document[_0x1f45('0xc')] ? document[_0x1f45('0xc')]['split']('; ') : [];
    for (let _0x24e2b1 = 0x0; _0x24e2b1 < _0x4928f3[_0x1f45('0x1')]; _0x24e2b1++) {
      const _0x15e3a1 = _0x4928f3[_0x24e2b1][_0x1f45('0x0')]('=');
      const _0x3f0197 = _0x15e3a1[_0x1f45('0xe')]();
      const _0x1dbff1 = _0x15e3a1[_0x1f45('0xa')]('=');
      if (_0x3f0197 === _0x370a0d) return _0x1dbff1;
    }
    return null;
  };

  function _0x4ffcb8(_0x3766cd){
    if(typeof _0x3766cd!=='string') return[];
    return Array[_0x1f45('0x2')](_0x3766cd)[_0x1f45('0x4')](_0x38c360=>_0x38c360[_0x1f45('0x3')](0x0));
  }

  function _0x51d7c9(_0x5f35d4,_0x1685c2){
    if(!Array['isArray'](_0x5f35d4)||!Array['isArray'](_0x1685c2)){
      console[_0x1f45('0xd')]('XOR inputs invalid',_0x5f35d4,_0x1685c2);
      return[];
    }
    const _0x1a4e38=Math['min'](_0x5f35d4[_0x1f45('0x1')],_0x1685c2[_0x1f45('0x1')]);
    let _0x26db97=[];
    for(let _0x59cc3b=0x0;_0x59cc3b<_0x1a4e38;_0x59cc3b++)_0x26db97[_0x1f45('0x5')](_0x5f35d4[_0x59cc3b]^_0x1685c2[_0x59cc3b]);
    return _0x26db97;
  }

  function _0x24506b(_0x175b38,_0x1d2020){
    if(!Array['isArray'](_0x175b38)){
      console[_0x1f45('0xd')]('rotateArray: argument is not an array:',_0x175b38);
      return[];
    }
    const _0x227863=_0x175b38[_0x1f45('0x1')];
    if(_0x227863===0x0) return[];
    _0x1d2020=_0x1d2020%_0x227863;
    return _0x175b38[_0x1f45('0x6')](_0x1d2020)[_0x1f45('0x7')](_0x175b38[_0x1f45('0x6')](0x0,_0x1d2020));
  }

  function _0x328e7f(_0x3f406c){
    return _0x3f406c[_0x1f45('0x4')](_0x4a1e56=>_0x4a1e56[_0x1f45('0x8')](0x10)[_0x1f45('0x9')](2,'0'))[_0x1f45('0xa')]('');
  }

  function _0x1f98a4(_0x28af81){
    if(!Array['isArray'](_0x28af81)||_0x28af81[_0x1f45('0x1')]===0x0){
      console[_0x1f45('0xd')]('simpleHash: invalid or empty array',_0x28af81);
      return 0x0;
    }
    return _0x28af81[_0x1f45('0xb')]((_0x1f5514,_0x4f6a6e)=>(_0x1f5514+_0x4f6a6e)%0x100,0x0);
  }

  function generateToken(_0x4b91db,_0x1d2b94){
    const _0x11f4a9=_0x4ffcb8(_0x4b91db);
    const _0x20ec3c=_0x4ffcb8(_0x1d2b94);
    if(_0x11f4a9[_0x1f45('0x1')]===0x0||_0x20ec3c[_0x1f45('0x1')]===0x0){
      console[_0x1f45('0xd')]('Empty or invalid input strings',_0x4b91db,_0x1d2b94);
      return'';
    }
    let _0x3c0927=_0x51d7c9(_0x11f4a9,_0x20ec3c);
    if(!Array['isArray'](_0x3c0927)||_0x3c0927[_0x1f45('0x1')]===0x0){
      console[_0x1f45('0xd')]('Invalid XOR result',_0x3c0927);
      return'';
    }
    const _0x24e10e=(_0x11f4a9[_0x1f45('0xb')]((_0x5e92f1,_0x56b58e)=>_0x5e92f1+_0x56b58e,0x0)+_0x20ec3c[_0x1f45('0xb')]((_0x238a64,_0x4e313d)=>_0x238a64+_0x4e313d,0x0))%_0x3c0927[_0x1f45('0x1')];
    _0x3c0927=_0x24506b(_0x3c0927,_0x24e10e);
    const _0x11a32f=_0x1f98a4(_0x3c0927);
    _0x3c0927[_0x1f45('0x5')](_0x11a32f);
    return _0x328e7f(_0x3c0927);
  }

  window['generateToken']=generateToken;

})();



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

    // Mostrar modal con Bootstrap 5
    const modal = new bootstrap.Modal(modalEl);
    modal.show();

  } catch (err) {
    console.error('Error mostrando favoritos en modal:', err);
  }
}