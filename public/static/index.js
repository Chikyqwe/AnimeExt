window.addEventListener('load', async () => {
  const loader = document.getElementById('loader');
  const MIN_LOADING_TIME = 3000;
  const startTime = performance.now();

  try {
    await fetchJsonList(); // Carga las tarjetas visibles

    // Esperar a que se carguen todas las imágenes visibles
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

  searchToggleBtn.addEventListener('click', () => openMobileSearch());
  closeBtn.addEventListener('click', () => closeMobileSearch());
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

const container = document.getElementById('card-container');
const mainContent = document.getElementById('main-content');
const recolectForm = document.getElementById('recolect-form');
const pageTitle = document.getElementById('page-title');
let currentAnime = null;
const loadedCards = new Map();
let fullAnimeList = [];

function cleanTitle(title) {
  return title.trim();
}

function getPageParam() {
  const params = new URLSearchParams(window.location.search);
  const page = parseInt(params.get('page')) || 1;
  return page;
}

function paginate(items, page, perPage = 24) {
  const start = (page - 1) * perPage;
  return items.slice(start, start + perPage);
}

function clearCards() {
  container.innerHTML = '';
  loadedCards.clear();
}

async function fetchJsonList() {
  try {
    const resp = await fetch('/jsons/anime_list.json', { cache: 'no-store' });
    if (!resp.ok) return;

    fullAnimeList = await resp.json();
    const page = getPageParam();
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

function createCard(data, animeTitle) {
  const card = document.createElement('div');
  card.className = 'anime-card';
  card.tabIndex = 0;
  card.setAttribute('role', 'button');

  const proxyUrl = `/proxy-image?url=${encodeURIComponent(data.image)}`;

  card.innerHTML = `
    <img src="${proxyUrl}" alt="Imagen de ${cleanTitle(animeTitle)}" class="anime-image" loading="lazy" />
    <div class="anime-title">${cleanTitle(animeTitle)}</div>
  `;

  card.addEventListener('click', () => openModal(data, animeTitle));
  container.appendChild(card);
  loadedCards.set(animeTitle, card);
}

async function waitForVisibleImages(selector = '.anime-card img') {
  const images = Array.from(document.querySelectorAll(selector));
  await Promise.all(images.map(img => {
    if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
    return new Promise(resolve => img.onload = img.onerror = resolve);
  }));
}

window.addEventListener('popstate', (event) => {
  const page = getPageParam();
  const paginated = paginate(fullAnimeList, page);
  clearCards();
  for (const anime of paginated) {
    createCard(anime, anime.title);
  }
  createPagination(fullAnimeList.length, page);
});

async function changePage(page) {
  showLoader();
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
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function createPagination(totalItems, currentPage) {
  const paginationContainer = document.getElementById('pagination-controls');
  if (!paginationContainer) return;

  paginationContainer.innerHTML = ''; // Limpiar antes de insertar nuevo contenido

  const pagination = document.createElement('div');
  pagination.id = 'pagination';
  pagination.className = 'pagination mt-4 justify-content-center flex-wrap';

  const totalPages = Math.ceil(totalItems / 24);

  // 📱 Adaptar número de botones al tamaño de pantalla
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



function searchAnime(event) {
  event.preventDefault();
  const input = document.getElementById('searchInput').value.trim().toLowerCase();

  if (!input) {
    const page = getPageParam();
    const paginated = paginate(fullAnimeList, page);
    clearCards();
    for (const anime of paginated) {
      createCard(anime, anime.title);
    }
    createPagination(fullAnimeList.length, page);
    return;
  }

  const filtered = fullAnimeList.filter(anime =>
    anime.title.toLowerCase().includes(input)
  );

  clearCards();
  filtered.forEach(anime => createCard(anime, anime.title));
  const pagination = document.getElementById('pagination');
  if (pagination) pagination.innerHTML = '';
}

function toJsonFilename(animeTitle) {
  return animeTitle
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-') + '.json';
}

function openModal(data, animeTitle) {
  currentAnime = data;

  const modalImage = document.getElementById('modalImage');
  const modalTitle = document.getElementById('modalTitle');
  const episodesList = document.getElementById('episodes-list');
  const downloadBtn = document.getElementById('downloadImageBtn');

  const proxyUrl = `/proxy-image?url=${encodeURIComponent(data.image)}`;

  modalImage.src = proxyUrl;
  modalTitle.textContent = cleanTitle(animeTitle);
  episodesList.innerHTML = '';

  for (let i = 1; i <= data.episodes_count; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'episode-button';
    btn.textContent = `Episodio ${i}`;
    btn.addEventListener('click', () => {
      const url = `/player?url=${encodeURIComponent(data.url)}&ep=${i}`;
      window.location.href = url;
    });
    episodesList.appendChild(btn);
  }

  downloadBtn.onclick = () => {
    const a = document.createElement('a');
    a.href = proxyUrl;
    a.download = `${cleanTitle(animeTitle)}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const animeModalEl = document.getElementById('animeModal');
  const modal = new bootstrap.Modal(animeModalEl);
  modal.show();
}

document.getElementById('searchInput').addEventListener('submit', searchAnime);

window.addEventListener('load', async () => {
  const loader = document.getElementById('loader');
  const MIN_LOADING_TIME = 3000;
  const startTime = performance.now();

  try {
    await fetchJsonList();
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

function showLoader() {
  const loader = document.getElementById('loader');
  loader.classList.add('fade-once');
  loader.classList.remove('fade-out');
  loader.style.display = 'flex';
  void loader.offsetWidth;
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

function insertarCSS(css) {
  const style = document.createElement('style');
  style.type = 'text/css';
  style.appendChild(document.createTextNode(css));
  document.head.appendChild(style);
}

window.addEventListener('resize', () => {
  const page = getPageParam();
  createPagination(fullAnimeList.length, page);
});
