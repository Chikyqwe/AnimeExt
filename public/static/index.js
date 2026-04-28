/**
 * ============================================================
 * AnimeEXT — index.js
 * ============================================================
 * Arquitectura: módulos de objeto literal agrupados por
 * responsabilidad. Sin variables globales innecesarias.
 * ============================================================
 */

'use strict';

/* ============================================================
 * CONFIGURACIÓN
 * ============================================================ */
const CONFIG = {
  API: {
    LAST: '/anime/last',
    LIST: '/anime/list',
    INFO: '/api/info',
    IMAGE: '/anime/img',
    SEARCH: '/anime/search',
    IMAGE_PROXY: (url) => `/image?url=${encodeURIComponent(url)}`,
  },
  DB: {
    FAVORITES: { name: 'FavoritosDB', version: 1, store: 'favoritos' },
    CACHE: { name: 'AnimeCacheDB', version: 3, store: 'precached' },
  },
  EPISODE_SOURCES: ['FLV', 'TIO', 'ANIMEYTX'],
  PER_PAGE: 24,
  MIN_LOAD_MS: 3000,
  SEARCH_DEBOUNCE_MS: 250,
  LOGO_EASTER_EGG_CLICKS: 21,
  LOGO_EASTER_EGG_RESET_MS: 8000,
};

/* ============================================================
 * STATE  (mutable app state in one place)
 * ============================================================ */
const State = {
  fullAnimeList: [],   // [{id, unit_id, title, image, slug, sources, …}]
  loadedCards: new Map(),
  lastSearchTerm: '',
  dbCache: null,       // singleton IndexedDB connection for cache/history/progress
  currentAnime: null,
};

/* ============================================================
 * UTILS
 * ============================================================ */
const Utils = {
  /** Normalize a string for comparison (lowercase, no accents, trimmed) */
  normalize(text) {
    if (!text) return '';
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  },

  /** Return a trimmed title or empty string */
  cleanTitle: (t) => (t ? t.trim() : ''),

  /** Parse current page from URL (?page=N), defaults to 1 */
  getPageParam() {
    const raw = new URLSearchParams(window.location.search).get('page');
    return /^[1-9]\d*$/.test(raw) ? parseInt(raw, 10) : 1;
  },

  /** Slice an array for a given page */
  paginate(items, page, perPage = CONFIG.PER_PAGE) {
    const start = (page - 1) * perPage;
    return items.slice(start, start + perPage);
  },

  /** Find anime by unit_id */
  findByUId(uid) {
    return State.fullAnimeList.find((a) => a.unit_id === uid) ?? null;
  },

  /** Find anime by id */
  findById(id) {
    return State.fullAnimeList.find((a) => a.id === id) ?? null;
  },

  /** Debounce a function */
  debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  },

  /** Safely get an element by id */
  el: (id) => document.getElementById(id),

  /** Safely query a selector */
  qs: (sel, root = document) => root.querySelector(sel),

  /** Safely query all with selector */
  qsa: (sel, root = document) => Array.from(root.querySelectorAll(sel)),
};

/* ============================================================
 * THEME
 * ============================================================ */
const Theme = {
  STORAGE_KEY: 'theme',

  init() {
    const saved = localStorage.getItem(Theme.STORAGE_KEY);
    if (saved === 'light') Theme._apply('light');
  },

  toggle() {
    const isLight = document.body.classList.contains('light-theme');
    Theme._apply(isLight ? 'dark' : 'light');
  },

  _apply(mode) {
    document.body.classList.toggle('light-theme', mode === 'light');
    document.body.classList.toggle('dark-theme', mode === 'dark');
    localStorage.setItem(Theme.STORAGE_KEY, mode);

    const icon = Utils.el('themeIcon');
    if (icon) {
      icon.classList.toggle('fa-sun', mode === 'light');
      icon.classList.toggle('fa-moon', mode === 'dark');
    }

    // Update close-button icon colors
    Utils.qsa('button i.fa-xmark').forEach((ico) => {
      ico.style.color = mode === 'light' ? '#222' : '#f1f1f1';
    });
  },
};

/* ============================================================
 * LOADER
 * ============================================================ */
const Loader = {
  _el: null,

  get el() {
    return (this._el ??= Utils.el('loader'));
  },

  show() {
    const { el } = this;
    if (!el) return;
    el.classList.add('fade-once');
    el.classList.remove('fade-out');
    el.style.display = 'flex';
    void el.offsetWidth; // force reflow
    el.classList.add('fade-in');
  },

  hide() {
    const { el } = this;
    if (!el) return;
    Progress.set(100);
    setTimeout(() => {
      el.classList.remove('fade-in');
      el.classList.add('fade-out');
      setTimeout(() => {
        el.style.display = 'none';
        el.classList.remove('fade-once', 'fade-out');
        Progress.set(0);
      }, 600);
    }, 250);
  },

  /** Wait for all matching images to load or error */
  async waitForImages(selector = '.anime-card img') {
    const images = Utils.qsa(selector);

    await Promise.all(
      images.map((img) => {
        if (img.complete && img.naturalHeight !== 0) {
          return Promise.resolve(); // ya cargada
        }

        return new Promise((resolve) => {
          const done = () => {
            cleanup();
            resolve(); // SIEMPRE resolve (éxito lógico)
          };

          const cleanup = () => {
            img.onload = null;
            img.onerror = null;
            clearTimeout(timer);
          };

          img.onload = done;
          img.onerror = done;

          const timer = setTimeout(done, 3000); // 3s máximo
        });
      })
    );
  }
};

/* ============================================================
 * PROGRESS BAR  (real steps)
 * ============================================================ */
const Progress = {
  _bar: null,
  _current: 0,

  get bar() {
    return (this._bar ??= Utils.el('loaderBar'));
  },

  /** Set progress 0-100 */
  set(pct) {
    this._current = Math.min(100, Math.max(0, pct));
    if (this.bar) this.bar.style.width = `${this._current}%`;
  },

  /** Advance by N points */
  advance(n) {
    this.set(this._current + n);
  },
};

/* ============================================================
 * MOBILE MENU
 * ============================================================ */
const MobileMenu = {
  _menu: null,
  _btn: null,

  init() {
    this._menu = Utils.el('mobileDropdownMenu');
    this._btn = Utils.el('hamburgerBtn');
    if (!this._menu || !this._btn) return;

    this._btn.addEventListener('click', () => this.toggle());
    window.addEventListener('scroll', () => this.close());
    document.addEventListener('click', (e) => this._onDocClick(e));
  },

  toggle(force) {
    if (!this._menu) return;
    const open = force ?? !this._menu.classList.contains('show');
    this._menu.classList.toggle('show', open);
    this._menu.setAttribute('aria-hidden', String(!open));
  },

  close() { this.toggle(false); },

  _onDocClick(e) {
    if (!this._menu || !this._btn) return;
    if (!this._menu.contains(e.target) && !this._btn.contains(e.target)) {
      this.close();
    }
  },
};

/* ============================================================
 * MOBILE SEARCH
 * ============================================================ */
const MobileSearch = {
  init() {
    const form = Utils.qs('.search-form');
    const toggle = Utils.el('search-toggle-btn');
    const input = Utils.el('searchInput');
    const close = Utils.el('search-close-btn');
    if (!form || !toggle || !input) return;

    toggle.addEventListener('click', () => this._open(form, input));

    if (close) {
      close.addEventListener('click', () => this._close(form, input));
    }

    document.addEventListener('click', (e) => {
      if (
        form.classList.contains('mobile-search-active') &&
        !form.contains(e.target) &&
        e.target !== toggle
      ) {
        this._close(form, input);
      }
    });
  },

  _open(form, input) {
    const closeBtn = document.getElementById('search-close-btn');
    // Quitar d-none de Bootstrap primero, luego activar modo búsqueda
    input.classList.remove('d-none', 'd-md-block');
    input.style.display = 'block';
    if (closeBtn) closeBtn.style.display = 'flex';
    form.classList.add('mobile-search-active');
    requestAnimationFrame(() => input.focus());
  },

  _close(form, input) {
    const closeBtn = document.getElementById('search-close-btn');
    form.classList.remove('mobile-search-active');
    input.style.display = '';
    input.classList.add('d-none', 'd-md-block');
    if (closeBtn) closeBtn.style.display = 'none';
    input.value = '';
    const box = document.getElementById('search-suggestions');
    if (box) { box.innerHTML = ''; box.style.display = 'none'; }
  },
};

/* ============================================================
 * NAV / LAYOUT SECTIONS
 * ============================================================ */
const Nav = {
  SECTIONS: ['anime', 'directory', 'historial', 'favoritos', 'search'],
  NAV_IDS: ['navInicio', 'navDirectorio', 'navHistorial', 'navFavoritos'],

  init() {
    const bindings = [
      ['navInicio', 'mobileNavInicio', 1],
      ['navDirectorio', 'mobileNavDirectorio', 2],
      ['navHistorial', 'mobileNavHistorial', 3],
      ['navFavoritos', 'mobileNavFavoritos', 4],
    ];

    bindings.forEach(([desktopId, mobileId, num]) => {
      Utils.el(desktopId)?.addEventListener('click', (e) => {
        e.preventDefault();
        Layout.show(num);
      });
      Utils.el(mobileId)?.addEventListener('click', (e) => {
        e.preventDefault();
        MobileMenu.close();
        Layout.show(num);
      });
    });
  },

  /** Highlight the active nav item (1-indexed matching NAV_IDS) */
  setActive(num) {
    const activeDesktopId = this.NAV_IDS[num - 1];
    const activeMobileId = 'mobile' + activeDesktopId.charAt(0).toUpperCase() + activeDesktopId.slice(1);

    Utils.qsa('nav.main-nav a.nav-item, #mobileDropdownMenu a').forEach((link) => {
      link.classList.toggle(
        'active',
        link.id === activeDesktopId || link.id === activeMobileId
      );
    });
  },
};

/* ============================================================
 * LAYOUT — sections visibility
 * ============================================================ */
const Layout = {
  _sectionIds: {
    search: 'search-section',
    anime: 'anime-section',
    directory: 'directory-section',
    historial: 'historial-section',
    favoritos: 'favoritos-section',
  },

  /** Hide all sections and sidebar/pagination */
  _hideAll() {
    Object.values(this._sectionIds).forEach((id) =>
      Utils.el(id)?.classList.add('d-none')
    );
    Utils.qs('.sidebar')?.classList.add('d-none');
    Utils.el('pagination-controls')?.classList.add('d-none');
  },

  async show(num) {
    Loader.show();
    MobileMenu.close();
    this._hideAll();
    Nav.setActive(num);

    switch (num) {
      case 1: await this._showHome(); break;
      case 2: await this._showDirectory(); break;
      case 3: await this._showHistory(); break;
      case 4: await this._showFavorites(); break;
      default: Loader.hide();
    }
  },

  async _showHome() {
    Utils.el('anime-section')?.classList.remove('d-none');
    Utils.qs('.sidebar')?.classList.remove('d-none');
    setTimeout(() => Loader.hide(), 1000);
  },

  async _showDirectory() {
    Utils.el('directory-section')?.classList.remove('d-none');
    Utils.el('pagination-controls')?.classList.remove('d-none');
    const page = Utils.getPageParam();
    const listData = await fetchAnimeList(page);
    Cards.render(listData.items, 'card-container');
    Pagination.create(listData.totalPages, page);
    setTimeout(() => Loader.hide(), 1000);
  },

  async _showHistory() {
    Utils.el('historial-section')?.classList.remove('d-none');
    const container = Utils.el('historial-container');
    if (!container) { Loader.hide(); return; }

    container.innerHTML = '<p class="text-muted">Cargando historial…</p>';

    try {
      const history = await DB.getHistory();
      if (!history.length) {
        container.innerHTML = '<p class="text-muted">No hay historial disponible.</p>';
        Loader.hide();
        return;
      }

      container.innerHTML = '';
      for (const item of history) {
        let anime = State.fullAnimeList.find((a) => a.unit_id === item.uid || a.id === item.uid);
        if (!anime) {
          // Fallback basic info if not found in cache
          anime = { unit_id: item.uid, title: item.title || 'Anime' };
        }
        const card = await Cards.createHistory(anime);
        container.appendChild(card);
      }
    } catch (err) {
      console.error('[Layout._showHistory]', err);
      container.innerHTML = '<p class="text-danger">Error al cargar historial.</p>';
    }

    setTimeout(() => Loader.hide(), 1000);
  },

  async _showFavorites() {
    Utils.el('favoritos-section')?.classList.remove('d-none');
    const container = Utils.el('favoritos-container');
    if (!container) { Loader.hide(); return; }

    container.innerHTML = '<p class="text-muted">Cargando favoritos…</p>';

    try {
      const favTitles = await Favorites.loadAll();
      const animes = State.fullAnimeList.filter((a) => favTitles.includes(a.title));

      if (!animes.length) {
        container.innerHTML = '<p class="text-muted">Aún no has agregado animes a favoritos.</p>';
        Loader.hide();
        return;
      }

      container.innerHTML = '';
      for (const anime of animes) {
        const card = await Cards.createFavorite(anime);
        container.appendChild(card);
      }
    } catch (err) {
      console.error('[Layout._showFavorites]', err);
      container.innerHTML = '<p class="text-danger">Error al mostrar favoritos.</p>';
    }

    setTimeout(() => Loader.hide(), 1000);
  },
};

/* ============================================================
 * CARDS
 * ============================================================ */
const Cards = {
  /** Render a list of animes into a container by id */
  async render(animes, containerId) {
    const container = Utils.el(containerId);
    if (!container) return;

    container.innerHTML = '';
    State.loadedCards.clear();

    animes.forEach(async (anime) => {
      const card = await this._createBasic(anime);
      container.appendChild(card);
      State.loadedCards.set(anime.title, card);
    });
  },

  /** Basic card for directory / search */
  async _createBasic(anime) {
    const card = document.createElement('div');
    card.className = 'anime-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    // post a img binary
    const res = await fetch(CONFIG.API.IMAGE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: "cover", uid: anime.unit_id }),
    });

    const blob = await res.blob();
    const imgUrl = URL.createObjectURL(blob);
    card.innerHTML = `
      <img src="${imgUrl}"
           alt="${Utils.cleanTitle(anime.title)}"
           class="anime-image" loading="lazy" />
      <div class="anime-title">${Utils.cleanTitle(anime.title)}</div>
    `;
    card.addEventListener('click', () => Modal.open(anime.unit_id));
    return card;
  },

  /** Card for the history section (with remove / playlist buttons) */
  async createHistory(anime) {
    const card = document.createElement('div');
    card.className = 'anime-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');

    try {
      const res = await fetch(CONFIG.API.IMAGE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: "cover", uid: anime.unit_id || anime.id }),
      });
      const blob = await res.blob();
      const imgUrl = URL.createObjectURL(blob);
      card.innerHTML = `
        <img src="${imgUrl}"
             alt="${Utils.cleanTitle(anime.title)}"
             class="anime-image" loading="lazy" />
        <div class="anime-title">${Utils.cleanTitle(anime.title)}</div>
        <div class="anime-overlay">
          <button class="btn-remove"><i class="bi bi-trash"></i> Quitar del historial</button>
          <button class="btn-playlist"><i class="bi bi-plus-circle"></i> Añadir a playlist</button>
        </div>
      `;
    } catch {
      card.innerHTML = `
        <img src="static/default-poster.jpg"
             alt="${Utils.cleanTitle(anime.title)}"
             class="anime-image" loading="lazy" />
        <div class="anime-title">${Utils.cleanTitle(anime.title)}</div>
        <div class="anime-overlay">
          <button class="btn-remove"><i class="bi bi-trash"></i> Quitar del historial</button>
          <button class="btn-playlist"><i class="bi bi-plus-circle"></i> Añadir a playlist</button>
        </div>
      `;
    }

    // Click → open info (unless in overlay mode)
    card.addEventListener('click', () => {
      if (!card.classList.contains('show-options')) Modal.open(anime.unit_id);
    });

    // Long-press on touch to reveal overlay
    let pressTimer;
    card.addEventListener('touchstart', () => {
      pressTimer = setTimeout(() => card.classList.add('show-options'), 500);
    }, { passive: true });
    card.addEventListener('touchend', () => clearTimeout(pressTimer));

    // Right-click on desktop
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      card.classList.toggle('show-options');
    });

    // Close overlay when clicking outside
    document.addEventListener('click', (e) => {
      if (!card.contains(e.target)) card.classList.remove('show-options');
    });

    // Remove button
    card.querySelector('.btn-remove').addEventListener('click', async (e) => {
      e.stopPropagation();
      card.classList.add('removing');
      card.addEventListener('animationend', async () => {
        await DB.removeHistory(anime.unit_id ?? anime.id);
        card.remove();
      }, { once: true });
    });

    // Playlist button
    card.querySelector('.btn-playlist').addEventListener('click', (e) => {
      e.stopPropagation();
      alert(`(Próximamente) Añadir ${Utils.cleanTitle(anime.title)} a playlist`);
    });

    return card;
  },

  /** Card for the favorites section */
  async createFavorite(anime) {
    const card = document.createElement('div');
    card.className = 'anime-card';
    card.dataset.anime = anime.title ?? '';
    if (anime.unit_id) card.dataset.uid = anime.unit_id;
    if (anime.id) card.dataset.id = anime.id;

    try {
      const res = await fetch(CONFIG.API.IMAGE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: "cover", uid: anime.unit_id || anime.id }),
      });
      const blob = await res.blob();
      const imgUrl = URL.createObjectURL(blob);
      card.innerHTML = `
        <img src="${imgUrl}"
             alt="${Utils.cleanTitle(anime.title)}"
             class="anime-image" loading="lazy" />
        <div class="anime-title">${Utils.cleanTitle(anime.title)}</div>
      `;
    } catch {
      card.innerHTML = `
        <img src="static/default-poster.jpg"
             alt="${Utils.cleanTitle(anime.title)}"
             class="anime-image" loading="lazy" />
        <div class="anime-title">${Utils.cleanTitle(anime.title)}</div>
      `;
    }
    card.addEventListener('click', () => Modal.open(anime.unit_id));
    return card;
  },

  /** Card with long-press used in the "last episodes" home feed */
  createHome(anime) {
    const card = document.createElement('div');
    card.className = 'anime-card-init';

    let holdTimer, longPress = false, progressBar = null;

    const showBar = () => {
      progressBar = document.createElement('div');
      progressBar.className = 'longpress-bar';
      progressBar.style.cssText = 'width:0%;transition:none;';
      card.appendChild(progressBar);
      void progressBar.offsetWidth;
      progressBar.style.cssText = 'width:100%;transition:width 1.5s linear;';
    };

    const clearBar = () => { progressBar?.remove(); progressBar = null; };

    const startHold = () => {
      longPress = false;
      showBar();
      holdTimer = setTimeout(() => {
        longPress = true;
        Modal.open(anime.id);
        clearBar();
      }, 1500);
    };

    const cancelHold = () => {
      clearTimeout(holdTimer);
      clearBar();
    };

    ['mousedown', 'touchstart'].forEach((ev) =>
      card.addEventListener(ev, startHold, { passive: true })
    );
    ['mouseup', 'mouseleave', 'touchend', 'touchmove'].forEach((ev) =>
      card.addEventListener(ev, cancelHold, { passive: true })
    );

    card.addEventListener('click', () => {
      if (longPress) return;
      window.location.href = `./player?uid=${anime.id}&ep=${anime.episodioNum}`;
    });

    card.innerHTML = `
      <img src="${anime.imagen}" alt="${anime.alt ?? anime.titulo}" class="card-img" loading="lazy" />
      <div class="card-content">
        <h4 class="card-title">${anime.titulo}</h4>
        <p class="card-subtitle">${anime.episodio}</p>
      </div>
    `;

    return card;
  },
};

/* ============================================================
 * PAGINATION
 * ============================================================ */
const Pagination = {
  create(totalPages, currentPage) {
    const container = Utils.el('pagination-controls');
    if (!container) return;
    container.innerHTML = '';

    console.log('[Pagination.create] totalPages:', totalPages);
    if (totalPages <= 1) return;

    const groupSize = this._groupSize();
    const groupStart = Math.floor((currentPage - 1) / groupSize) * groupSize + 1;
    const groupEnd = Math.min(groupStart + groupSize - 1, totalPages);

    const wrap = document.createElement('div');
    wrap.id = 'pagination';

    const btn = (page, label, isNav = false) => {
      const b = document.createElement('button');
      b.textContent = label ?? String(page);
      b.className = `pagination-btn${isNav ? ' nav' : ''}${page === currentPage ? ' active' : ''}`;
      b.addEventListener('click', () => this._changePage(page));
      return b;
    };

    if (groupStart > 1) wrap.appendChild(btn(currentPage - 1, '«', true));
    for (let i = groupStart; i <= groupEnd; i++) wrap.appendChild(btn(i));
    if (groupEnd < totalPages) wrap.appendChild(btn(currentPage + 1, '»', true));

    container.appendChild(wrap);
  },

  _groupSize() {
    const w = window.innerWidth;
    if (w < 400) return 3;
    if (w < 650) return 5;
    if (w < 800) return 7;
    return 10;
  },

  async _changePage(page) {
    Loader.show();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const params = new URLSearchParams(window.location.search);
    params.set('page', page);
    window.history.pushState({ page }, '', `${window.location.pathname}?${params}`);

    const listData = await fetchAnimeList(page);
    Cards.render(listData.items, 'card-container');
    this.create(listData.totalPages, page);

    await Loader.waitForImages();
    localStorage.setItem('lastPage', page);
    Loader.hide();
  },
};

/* ============================================================
 * SEARCH
 * ============================================================ */
const Search = {
  init() {
    const input = Utils.el('searchInput');
    if (!input) return;

    input.addEventListener(
      'input',
      Utils.debounce(() => Search.suggest(), CONFIG.SEARCH_DEBOUNCE_MS)
    );

    // Close suggestions when clicking outside
    document.addEventListener('click', (e) => {
      const box = Utils.el('search-suggestions');
      if (box && !box.contains(e.target) && e.target !== input) {
        box.style.display = 'none';
        box.innerHTML = '';
      }
    });
  },

  /** Triggered from the form onsubmit */
  async run(event = null, term = null) {
    event?.preventDefault();

    const raw = term ?? Utils.el('searchInput')?.value ?? '';
    const normalized = Utils.normalize(raw);

    // Update URL
    const url = new URL(window.location.href);
    normalized ? url.searchParams.set('s', normalized) : url.searchParams.delete('s');
    if (!term) window.history.pushState({}, '', url);

    if (!normalized) {
      const page = Utils.getPageParam();
      Cards.render(Utils.paginate(State.fullAnimeList, page), 'card-container');
      Pagination.create(State.fullAnimeList.length, page);
      return;
    }

    const terms = normalized.split(' ').filter(Boolean);

    // Llamada a la API de búsqueda del backend
    let merged = [];
    try {
      const res = await fetch(CONFIG.API.SEARCH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: normalized })
      });
      const apiResults = await res.json();

      // Registramos los resultados en la lista global para que el modal los encuentre
      apiResults.forEach(item => {
        if (!State.fullAnimeList.find(a => a.unit_id === item.unit_id)) {
          State.fullAnimeList.push({ ...item, image: item.image || '' });
        }
      });

      merged = apiResults;
    } catch (err) {
      console.error('[Search API Error]', err);
      // Fallback a búsqueda local si falla la API
      merged = this._filterLocal(terms);
    }

    this._renderResults(merged, normalized);
  },

  _filterLocal(terms) {
    return State.fullAnimeList.filter((anime) =>
      terms.every((t) => Utils.normalize(anime.title).includes(t))
    );
  },

  async _fetchKitsu(query, terms) {
    try {
      const res = await fetch(`https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(query)}`);
      const json = await res.json();

      return json.data
        .filter((item) => {
          const titles = [
            item.attributes.canonicalTitle,
            item.attributes.titles?.en,
            item.attributes.titles?.en_jp,
            item.attributes.titles?.ja_jp,
          ].filter(Boolean).map(Utils.normalize);
          return terms.every((t) => titles.some((title) => title.includes(t)));
        })
        .map((item) => {
          const apiTitles = [
            item.attributes.canonicalTitle,
            item.attributes.titles?.en,
            item.attributes.titles?.en_jp,
            item.attributes.titles?.ja_jp,
          ].filter(Boolean).map(Utils.normalize);

          return State.fullAnimeList.find((a) =>
            [a.title, a.en_jp, a.ja_jp].filter(Boolean).map(Utils.normalize)
              .some((t) => apiTitles.includes(t))
          );
        })
        .filter(Boolean);
    } catch (err) {
      console.error('[Kitsu search]', err);
      return [];
    }
  },

  _renderResults(results, term) {
    Loader.show();

    // Hide all sections except search
    ['anime-section', 'directory-section', 'historial-section', 'favoritos-section'].forEach((id) =>
      Utils.el(id)?.classList.add('d-none')
    );
    Utils.el('search-section')?.classList.remove('d-none');
    Utils.qs('.sidebar')?.classList.add('d-none');
    Utils.el('pagination-controls')?.classList.add('d-none');

    const titleEl = Utils.el('search-title');
    if (titleEl) titleEl.textContent = `Resultados para: ${term}`;

    const container = Utils.el('search-container');
    if (!container) { Loader.hide(); return; }

    if (!results.length) {
      container.innerHTML = '<p class="text-muted">Sin resultados. Intenta con otro término.</p>';
      Loader.hide();
      return;
    }

    container.innerHTML = '';
    results.forEach(async (anime) => container.appendChild(await Cards._createBasic(anime)));
    setTimeout(() => Loader.hide(), 1000);
  },

  /** Live suggestions dropdown */
  async suggest() {
    const input = Utils.el('searchInput');
    const box = Utils.el('search-suggestions');
    if (!input || !box) return;

    const value = Utils.normalize(input.value);
    box.innerHTML = '';

    if (!value || !State.fullAnimeList.length) {
      box.style.display = 'none';
      return;
    }

    State.lastSearchTerm = value;

    try {
      const res = await fetch(CONFIG.API.SEARCH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: value })
      });
      const results = await res.json();
      if (State.lastSearchTerm !== value) return;

      // Registramos resultados para el Modal
      results.forEach(item => {
        if (!State.fullAnimeList.find(a => a.unit_id === item.unit_id)) {
          State.fullAnimeList.push(item);
        }
      });

      this._renderSuggestions(results.slice(0, 5), box);
    } catch (err) {
      // Fallback local
      const terms = value.split(' ').filter(Boolean);
      let local = State.fullAnimeList
        .filter((a) => {
          const titles = [a.title, a.en_jp, a.ja_jp].filter(Boolean).map(Utils.normalize);
          return titles.some((t) => terms.every((term) => t.includes(term)));
        })
        .slice(0, 4);
      this._renderSuggestions(local, box);
    }
  },

  _renderSuggestions(list, box) {
    const input = Utils.el('searchInput');
    if (!input?.value?.trim()) { box.style.display = 'none'; return; }

    box.innerHTML = '';
    list.forEach((anime) => {
      const item = document.createElement('li');
      item.innerHTML = `
        <img src="${CONFIG.API.IMAGE_PROXY(anime.image)}" alt="${anime.title}" loading="lazy" />
        <span>${anime.title}</span>
      `;
      item.addEventListener('click', () => {
        Modal.open(anime.unit_id);
        box.innerHTML = '';
        box.style.display = 'none';
      });
      box.appendChild(item);
    });
    box.style.display = list.length ? 'block' : 'none';
  },
};

// Expose globally for the HTML onsubmit attribute
window.searchAnime = (e) => Search.run(e);

/* ============================================================
 * DATABASE  (IndexedDB helpers)
 * ============================================================ */
const DB = {
  /* ---- Favorites DB ---- */
  _openFavorites() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(CONFIG.DB.FAVORITES.name, CONFIG.DB.FAVORITES.version);
      req.onerror = () => reject('Error abriendo FavoritosDB');
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(CONFIG.DB.FAVORITES.store)) {
          db.createObjectStore(CONFIG.DB.FAVORITES.store, { keyPath: 'title' });
        }
      };
    });
  },

  async _favTx(mode) {
    const db = await this._openFavorites();
    const tx = db.transaction(CONFIG.DB.FAVORITES.store, mode);
    const store = tx.objectStore(CONFIG.DB.FAVORITES.store);
    return store;
  },

  async favoriteAdd(title) {
    const store = await this._favTx('readwrite');
    return new Promise((res, rej) => {
      const r = store.add({ title });
      r.onsuccess = () => res(true);
      r.onerror = () => rej('Error al agregar favorito');
    });
  },

  async favoriteRemove(title) {
    const store = await this._favTx('readwrite');
    return new Promise((res, rej) => {
      const r = store.delete(title);
      r.onsuccess = () => res(true);
      r.onerror = () => rej('Error al eliminar favorito');
    });
  },

  async favoriteExists(title) {
    const store = await this._favTx('readonly');
    return new Promise((res, rej) => {
      const r = store.get(title);
      r.onsuccess = () => res(!!r.result);
      r.onerror = () => rej('Error al verificar favorito');
    });
  },

  async favoriteLoadAll() {
    const store = await this._favTx('readonly');
    return new Promise((res, rej) => {
      const r = store.getAll();
      r.onsuccess = () => res(r.result.map((i) => i.title));
      r.onerror = () => rej('Error al cargar favoritos');
    });
  },

  /* ---- Cache / History / Progress DB ---- */
  _openCache() {
    if (State.dbCache) return Promise.resolve(State.dbCache);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(CONFIG.DB.CACHE.name, CONFIG.DB.CACHE.version);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => { State.dbCache = req.result; resolve(req.result); };
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        for (const store of [CONFIG.DB.CACHE.store, 'progress', 'history']) {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store, { keyPath: store === 'history' ? 'uid' : store === 'progress' ? 'slug' : 'url' });
          }
        }
      };
    });
  },

  async getHistory() {
    const db = await this._openCache();
    return new Promise((res, rej) => {
      const r = db.transaction('history', 'readonly').objectStore('history').getAll();
      r.onsuccess = () => res(r.result ?? []);
      r.onerror = () => rej(r.error);
    });
  },

  async removeHistory(uid) {
    const history = await this.getHistory();
    const updated = history.filter((h) => h.uid !== uid);
    localStorage.setItem('history', JSON.stringify(updated));
  },
};

/* ============================================================
 * FAVORITES  (facade over DB)
 * ============================================================ */
const Favorites = {
  loadAll: () => DB.favoriteLoadAll(),
  exists: (title) => DB.favoriteExists(title),
  add: (title) => DB.favoriteAdd(title),
  remove: (title) => DB.favoriteRemove(title),

  async toggle(title, btn) {
    try {
      const isFav = await this.exists(title);
      isFav ? await this.remove(title) : await this.add(title);
      const nowFav = !isFav;

      // Sync DOM card in favorites list if visible
      const favContainer = Utils.el('favoritos-container');
      if (favContainer) {
        if (!nowFav) {
          favContainer.querySelector(`[data-anime="${CSS.escape(title)}"]`)?.remove();
        } else if (!favContainer.classList.contains('d-none')) {
          const anime = State.fullAnimeList.find((a) => a.title === title);
          if (anime) favContainer.appendChild(Cards.createFavorite(anime));
        }
      }

      if (btn) {
        btn.innerHTML = `<i class="fa fa-heart me-1"></i> ${nowFav ? 'Quitar de Favoritos' : 'Agregar a Favoritos'}`;
        btn.classList.toggle('btn-dark', nowFav);
        btn.classList.toggle('btn-outline-light', !nowFav);
      }
    } catch (err) {
      console.error('[Favorites.toggle]', err);
    }
  },
};

/* ============================================================
 * MODAL  (anime info)
 * ============================================================ */
const Modal = {
  _bsInstance: null,

  async open(uid) {
    let anime = Utils.findByUId(uid);

    if (!anime) {
      anime = { unit_id: uid, title: 'Cargando...', image: '' };
    }

    const el = Utils.el('animeModal');
    if (!el) return;

    this._bsInstance = bootstrap.Modal.getOrCreateInstance(el);
    this._bsInstance.show();
    this._setImage("https://placehold.co/260x370")
    this._initFavoriteBtn(anime.title);
    this._initShareBtn(uid);

    // Imagen inicial rápida
    try {
      const res = await fetch(CONFIG.API.IMAGE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: anime.unit_id, type: 'cover' }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const imageUrl = URL.createObjectURL(blob);
        this._setImage(imageUrl);
      }
    } catch (e) {
      console.warn('[Modal.open image]', e);
    }

    await this._loadInfo(anime);
  },

  async _loadInfo(anime) {
    const titleEl = Utils.el('modalTitle');
    const descEl = Utils.el('modalDescription');
    const containerEl = Utils.el('episodes-list');

    if (titleEl) titleEl.textContent = anime.title;

    let dots = 0;
    const interval = setInterval(() => {
      if (descEl) {
        descEl.textContent = `Cargando${'.'.repeat((dots++ % 5) + 1)}`;
      }
    }, 400);

    try {
      const res = await fetch(
        `${CONFIG.API.INFO}?uid=${encodeURIComponent(anime.unit_id)}`
      );

      const data = await res.json();
      clearInterval(interval);

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Error en /api/info');
      }

      if (titleEl) titleEl.textContent = data.title;

      this._initFavoriteBtn(data.title);

      if (descEl) {
        descEl.textContent = data.desc || 'Sin descripción disponible.';
      }

      // STATUS
      const statusEl = Utils.el('modalStatus');
      if (statusEl) {
        const isOngoing = /emisi[oó]n|ongoing/i.test(data.status ?? '');
        const isFinished = /finaliz|finished|completed/i.test(data.status ?? '');

        statusEl.textContent = data.status || 'Desconocido';
        statusEl.style.background =
          isOngoing ? '#28a745' :
            isFinished ? '#fb3447' :
              '#343a40';
      }

      // TAGS
      const tagsEl = Utils.el('modalTags');
      if (tagsEl && data.tags?.length) {
        tagsEl.innerHTML = data.tags
          .map(t => `<span class="badge bg-secondary me-1">${t}</span>`)
          .join('');
      }

      this._renderEpisodes(data, containerEl);

      await this._loadRatingAndImage(data, anime.image);

    } catch (err) {
      clearInterval(interval);
      console.error('[Modal._loadInfo]', err);
      if (descEl) descEl.textContent = 'Error al cargar la información.';
    }
  },

  _renderEpisodes(data, container) {
    if (!container) return;
    container.innerHTML = '';

    const isOngoing = /emisi[oó]n|ongoing/i.test(data.status ?? '');
    const isFinished = /finaliz|finished|completed/i.test(data.status ?? '');

    const badgeColor = isOngoing
      ? '#28a745'
      : isFinished
        ? '#fb3447'
        : '#343a40';

    const badgeText = isOngoing
      ? `Próxima emisión: ${data.isNewEP ?? 'Desconocida'}`
      : (data.status ?? 'Desconocido');

    const statusDiv = document.createElement('div');
    statusDiv.className = 'episode-card';
    statusDiv.innerHTML = `
      <div style="display:flex;align-items:center;width:100%;gap:10px;">
        <button type="button" class="episode-status" style="
          flex:1;
          background-color:${badgeColor} !important;
          cursor:default;
          font-weight:600;
          color:#fff;
        ">${badgeText}</button>
      </div>
    `;

    container.appendChild(statusDiv);

    if (!data.episodes?.length) return;

    const list = data.episodes.length < 50
      ? [...data.episodes].reverse()
      : data.episodes;

    list.forEach(ep => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'episode-card';

      btn.innerHTML = `
        <div class="ep-thumb">
          <img
            src="https://placehold.co/240x135"
            data-uid="${data.uid}"
            data-ep="${ep.num}"
            alt="Ep. ${ep.num}"
            loading="lazy"
          />
          <span class="ep-number">Ep. ${ep.num}</span>
        </div>
      `;

      const img = btn.querySelector('img');

      const observer = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();

        const uid = data.unit_id ?? data.uid;
        this._loadEpThumb(img, uid, ep.num);
      }, { rootMargin: '100px' });

      observer.observe(img);

      btn.addEventListener('click', () => {
        window.location.href = ep.url;
      });

      container.appendChild(btn);
    });
  },

  async _loadEpThumb(imgEl, uid, epNum) {
    try {
      const res = await fetch(CONFIG.API.IMAGE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, type: 'ep', ep: epNum }),
      });

      if (!res.ok) return;

      const blob = await res.blob();
      imgEl.src = URL.createObjectURL(blob);
    } catch {
      // fallback silencioso
    }
  },

  close() {
    const el = Utils.el('animeModal');
    if (!el) return;

    (bootstrap.Modal.getInstance(el) ?? new bootstrap.Modal(el)).hide();
  },

  _setImage(url) {
    const img = Utils.el('modalImage');
    const wrapper = Utils.el('modalImgWrapper');

    if (!img) return;

    img.src = url;

    img.onload = () => {
      wrapper?.style.setProperty('--blur-bg', `url(${url})`);
    };
  },

  async _initFavoriteBtn(title) {
    const btn = Utils.el('favoriteBtn');
    if (!btn) return;

    const isFav = await Favorites.exists(title);

    btn.innerHTML = `
      <i class="fa fa-heart me-1"></i>
      ${isFav ? 'Quitar de Favoritos' : 'Agregar a Favoritos'}
    `;

    btn.classList.toggle('btn-dark', isFav);
    btn.classList.toggle('btn-outline-light', !isFav);

    btn.onclick = (e) => {
      e.stopPropagation();
      Favorites.toggle(title, btn);
    };
  },

  _initShareBtn(uid) {
    const btn = Utils.el('shareBtn');
    if (!btn) return;

    btn.onclick = async (e) => {
      e.stopPropagation();

      const url = `/app/share?uid=${encodeURIComponent(uid)}`;
      const anime = Utils.findByUId(uid);

      if (navigator.share) {
        try {
          await navigator.share({
            title: anime?.title,
            url
          });
        } catch { }
      } else {
        Share.open('', url);
      }
    };
  },

  async _loadRatingAndImage(anime, fallbackUrl) {
    try {
      const res = await fetch(
        `https://kitsu.app/api/edge/anime?filter%5Btext%5D=${anime.slug}`
      );

      const json = await res.json();
      if (!json.data?.length) return;

      const attrs = json.data[0].attributes;

      let rating = attrs.averageRating;

      if (rating == null) {
        const freqs = attrs.ratingFrequencies ?? {};
        let total = 0, count = 0;

        for (const [r, f] of Object.entries(freqs)) {
          total += parseInt(r, 10) * parseInt(f, 10);
          count += parseInt(f, 10);
        }

        if (count > 0) {
          const max = Math.max(...Object.keys(freqs).map(Number));
          rating = Math.round(((total / count) / max) * 100) / 10;
        }
      }

      this._renderStars(rating);

      const isBlack = await this._isImageBlack(fallbackUrl);

      if (isBlack && attrs.posterImage) {
        const betterUrl =
          attrs.posterImage.original ||
          attrs.posterImage.large ||
          fallbackUrl;

        this._setImage(betterUrl);
      }

    } catch (err) {
      console.warn('[Modal._loadRatingAndImage]', err);
    }
  },

  _renderStars(rating) {
    const scoreEl = Utils.el('ratingScore');
    const starsEl = Utils.el('ratingStars');

    if (!scoreEl || !starsEl) return;

    const score = parseFloat(rating);

    scoreEl.textContent = isNaN(score)
      ? '—'
      : (score / 10).toFixed(1);

    if (isNaN(score)) {
      starsEl.innerHTML = '';
      return;
    }

    const value = Math.round((score / 100) * 10 * 2) / 2;
    const full = Math.floor(value);
    const half = value % 1 !== 0;
    const empty = 10 - full - (half ? 1 : 0);

    starsEl.innerHTML =
      '<i class="fa fa-star"></i>'.repeat(full) +
      (half ? '<i class="fa fa-star-half-alt"></i>' : '') +
      '<i class="fa fa-star inactive"></i>'.repeat(empty);
  },

  _isImageBlack(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        const scale = Math.min(100 / img.width, 100 / img.height);

        const canvas = Object.assign(document.createElement('canvas'), {
          width: img.width * scale,
          height: img.height * scale,
        });

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        let data;
        try {
          data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        } catch {
          return resolve(false);
        }

        let dark = 0, total = 0;

        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 10) continue;

          const lum =
            0.2126 * data[i] +
            0.7152 * data[i + 1] +
            0.0722 * data[i + 2];

          if (lum < 45) dark++;
          total++;
        }

        resolve(dark / total > 0.9);
      };

      img.onerror = () => resolve(false);
      img.src = url;
    });
  },
};
/* ============================================================
 * SHARE MODAL
 * ============================================================ */
const Share = {
  PLATFORMS: {
    whatsapp: (text, url) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
    facebook: (_, url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    telegram: (text, url) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    correo: (text, url) => `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(url)}`,
    pinterest: (text, url) => `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(url)}&description=${encodeURIComponent(text)}`,
    x: (text, url) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${text} ${url}`)}`,
    reddit: (text, url) => `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`,
  },

  open(text = '', url = window.location.href) {
    const modal = Utils.el('modalShare');
    const input = Utils.el('shareLink');
    const copyBtn = Utils.el('copyBtn');
    const closeBtn = Utils.el('closeModal');
    const options = Utils.el('shareOptions');
    const scrollBtn = Utils.el('scrollRight');
    if (!modal || !input) return;

    input.value = url;
    modal.classList.add('active');

    const close = () => modal.classList.remove('active');
    closeBtn.onclick = close;
    modal.onclick = (e) => { if (e.target === modal) close(); };

    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(url);
        copyBtn.textContent = '¡Copiado!';
        setTimeout(() => (copyBtn.textContent = 'Copiar'), 2000);
      } catch {
        input.select();
        document.execCommand('copy');
      }
    };

    // Scroll button
    const updateScrollBtn = () => {
      const maxScroll = options.scrollWidth - options.clientWidth;
      scrollBtn?.classList.toggle('hidden', options.scrollLeft >= maxScroll - 10);
    };
    scrollBtn.onclick = () => { options.scrollBy({ left: 150, behavior: 'smooth' }); setTimeout(updateScrollBtn, 400); };
    options.addEventListener('scroll', updateScrollBtn);
    updateScrollBtn();

    // Platform buttons
    Utils.qsa('.share-option', modal).forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        const platform = btn.querySelector('div')?.classList[1];
        const builder = this.PLATFORMS[platform];
        if (builder) window.open(builder(text, url), '_blank');
      };
    });
  },
};

/* ============================================================
 * SETTINGS / OVERLAYS
 * ============================================================ */
const Settings = {
  openMenu() {
    const el = Utils.el('menuOverlay');
    el?.classList.remove('d-none');
    setTimeout(() => el?.classList.add('show'), 10);
  },

  closeOverlay(id) {
    const el = Utils.el(id);
    el?.classList.remove('show');
    setTimeout(() => el?.classList.add('d-none'), 300);
  },

  showPolicy() {
    this.closeOverlay('menuOverlay');
    Policy.init();
  },

  showAds() {
    this.closeOverlay('menuOverlay');
    Utils.el('adsOverlay')?.classList.remove('d-none');
  },
};

// Expose globally (used by HTML onclick attributes)
window.cerrarOverlay = (id) => Settings.closeOverlay(id);
window.abrirMenuOpciones = () => Settings.openMenu();
window.verPolitica = () => Settings.showPolicy();
window.verAds = () => Settings.showAds();
window.toggleTheme = () => Theme.toggle();
window.setAdsPreference = (v) => {
  localStorage.setItem('ads', v ? 'true' : 'false');
  Utils.el('adsOverlay')?.classList.add('d-none');
};

/* ============================================================
 * POLICY MODAL
 * ============================================================ */
const Policy = {
  STORAGE_KEY: 'policyAccepted',

  init() {
    let overlay = Utils.el('policyOverlay');
    if (!overlay) {
      document.body.insertAdjacentHTML('beforeend', Policy._html());
      overlay = Utils.el('policyOverlay');
    }
    const iframe = Utils.el('policyIframe');
    const acceptBtn = Utils.el('policyAcceptBtn');
    if (!overlay || !iframe || !acceptBtn) return;

    iframe.src = './app_policy';
    overlay.classList.remove('d-none');

    acceptBtn.addEventListener('click', () => {
      localStorage.setItem(Policy.STORAGE_KEY, 'true');
      overlay.classList.add('d-none');
      Ads.init();
    }, { once: true });
  },

  isAccepted: () => !!localStorage.getItem(Policy.STORAGE_KEY),

  _html: () => `
    <div id="policyOverlay" class="policy-overlay">
      <div class="policy-modal">
        <div class="policy-header"><h5 class="m-0">Política de Privacidad</h5></div>
        <iframe id="policyIframe" class="policy-iframe" loading="lazy" title="Política de privacidad"></iframe>
        <div class="policy-footer text-end">
          <button id="policyAcceptBtn" class="btn btn-success fw-semibold px-4">Aceptar</button>
        </div>
      </div>
    </div>
  `,

  /** Watch for DOM removal and restore if necessary */
  monitor() {
    setInterval(() => {
      if (!Policy.isAccepted() && !Utils.el('policyOverlay')) {
        console.warn('[Policy] Overlay eliminado del DOM, restaurando…');
        Policy.init();
      }
    }, 1000);
  },
};

/* ============================================================
 * ADS
 * ============================================================ */
const Ads = {
  init() {
    if (localStorage.getItem('ads') === null) {
      Utils.el('adsOverlay')?.classList.remove('d-none');
    }
  },
};

/* ============================================================
 * CONTINUE WATCHING
 * ============================================================ */

const ContinueWatching = {

  _getLast() {
    try { return JSON.parse(localStorage.getItem('lasted')); }
    catch { return null; }
  },

  show: async () => {
    const data = ContinueWatching._getLast();
    if (!data) return;
    const anime = Utils.findByUId(data.uid);
    if (!anime) return;

    const titleEl = Utils.el('continue-watching-title');
    const imgEl = Utils.el('continue-watching-img');
    const btnEl = Utils.el('continue-watching-btn');
    if (!titleEl || !imgEl || !btnEl) return;

    titleEl.textContent = `${anime.title} — Episodio ${data.ep}`;
    try {
      const res = await fetch(CONFIG.API.IMAGE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: anime.unit_id, type: 'cover' }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const imageUrl = URL.createObjectURL(blob);
        imgEl.src = imageUrl;
      } else {
        imgEl.src = anime.image || 'static/default-poster.jpg';
      }
    } catch (e) {
      console.error(e);
      imgEl.src = 'static/default-poster.jpg';
    }
    btnEl.onclick = () => { window.location.href = `player?uid=${data.uid}&ep=${data.ep}`; };

    new bootstrap.Modal(Utils.el('continueWatchingModal')).show();
  },
};

/* ============================================================
 * SCROLL — show/hide bottom bar
 * ============================================================ */
const BottomBar = {
  init() {
    const bar = Utils.qs('.bottom-bar');
    if (!bar) return;
    window.addEventListener('scroll', () => {
      const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 20;
      bar.classList.toggle('visible', atBottom);
    }, { passive: true });
  },
};

/* ============================================================
 * EASTER EGG — logo click counter
 * ============================================================ */
const EasterEgg = {
  _count: 0,
  _timer: null,

  init() {
    const logo = Utils.qs('a.logo');
    if (!logo) return;

    // Create the hidden modal
    document.body.insertAdjacentHTML('beforeend', `
      <div id="chikiModal" style="
        display:none; position:fixed; inset:0;
        background:rgba(0,0,0,0.6); z-index:9999;
        justify-content:center; align-items:center;
      ">
        <div style="
          background:var(--bg-2,#222); color:var(--text-primary,#fff);
          padding:30px 40px; border-radius:12px;
          text-align:center; font-family:var(--font-body,sans-serif);
          max-width:300px; border:1px solid rgba(255,255,255,0.1);
        ">
          <p style="font-size:1.1rem; margin-bottom:1.2rem;">
            From <strong>Chikyqwe</strong><br>for the anime community
            <i class="fa-solid fa-heart" style="color:#E94560;"></i>
          </p>
          <button id="chikiModalClose" style="
            padding:8px 22px; background:var(--accent,#00d9c0);
            border:none; border-radius:999px; color:var(--bg-0,#080c10);
            font-weight:700; cursor:pointer;
          ">Cerrar</button>
        </div>
      </div>
    `);

    const modal = Utils.el('chikiModal');
    const closeBtn = Utils.el('chikiModalClose');

    logo.addEventListener('click', (e) => {
      e.preventDefault();
      this._count++;
      console.info(`Logo clicks: 0x${this._count.toString(16).toUpperCase()}`);

      if (this._count >= CONFIG.LOGO_EASTER_EGG_CLICKS) {
        modal.style.display = 'flex';
        this._count = 0;
        clearTimeout(this._timer);
      } else {
        clearTimeout(this._timer);
        this._timer = setTimeout(() => { this._count = 0; }, CONFIG.LOGO_EASTER_EGG_RESET_MS);
      }
    });

    closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
  },
};

/* ============================================================
 * HOME FEED  (last episodes)
 * ============================================================ */
const HomeFeed = {
  async load() {
    try {
      const res = await fetch(CONFIG.API.LAST);
      const data = await res.json();
      if (!Array.isArray(data)) return;

      const list = Utils.el('anime-list');
      const sidebar = Utils.qs('.sidebar-menu');
      if (!list || !sidebar) return;

      data.forEach((anime) => list.appendChild(Cards.createHome(anime)));

      data.slice(0, 15).forEach((anime) => {
        const li = document.createElement('li');
        li.classList.add('mb-1');
        li.innerHTML = `
          <div class="text-decoration-none d-flex align-items-center anime-link" style="cursor:pointer;">
            <i class="fa fa-play me-2" style="color:var(--accent);font-size:.75rem;"></i>
            <span class="text-truncate" style="font-size:.85rem;">${anime.titulo}</span>
          </div>
        `;
        li.addEventListener('click', () => Modal.open(anime.id));
        sidebar.appendChild(li);
      });
    } catch (err) {
      console.error('[HomeFeed.load]', err);
    }
  },
};

/**
 * Carga la lista de animes desde el servidor usando paginación.
 */
async function fetchAnimeList(page = 1) {
  try {
    const res = await fetch(`${CONFIG.API.LIST}?p=${page}`);
    if (!res.ok) throw new Error('Error al cargar lista de animes');
    const data = await res.json();

    // Sincronizamos State.fullAnimeList para que Utils.findByUId funcione
    if (data.items) {
      data.items.forEach(item => {
        if (!State.fullAnimeList.find(a => a.unit_id === item.unit_id)) {
          State.fullAnimeList.push(item);
        }
      });
    }

    return {
      items: data.items || [],
      totalPages: data.totalpages || 0
    };
  } catch (err) {
    console.error('[fetchAnimeList]', err);
    return { items: [], totalPages: 0 };
  }
}

/* ============================================================
 * MAIN INIT
 * ============================================================ */
async function main() {
  Theme.init();
  BottomBar.init();
  MobileMenu.init();
  MobileSearch.init();
  Nav.init();
  Search.init();
  EasterEgg.init();

  if (!Policy.isAccepted()) {
    Policy.init();
    Policy.monitor();
  } else if (localStorage.getItem('ads') === null) {
    Ads.init();
  }

  const startTime = performance.now();
  Progress.set(10);

  const [,] = await Promise.allSettled([
    (async () => {
      try {
        Progress.set(20);
        const page = Utils.getPageParam();

        // ← Nuevo: usa fetchAnimeList con paginación
        const listData = await fetchAnimeList(page);
        Progress.set(45);

        // State.fullAnimeList ya fue seteado dentro de fetchAnimeList
        Progress.set(55);
        ContinueWatching.show();

        const searchTerm = new URLSearchParams(window.location.search).get('s');
        const searchInput = Utils.el('searchInput');

        if (searchTerm && searchInput) {
          searchInput.value = searchTerm;
          await Search.run(null, searchTerm);
        } else {
          Cards.render(listData.items, 'card-container');
          Pagination.create(listData.totalPages, page);
        }

        Progress.set(70);
        await Loader.waitForImages('.anime-card img');
        Progress.set(88);
      } catch (err) {
        console.error('[main fetchList]', err);
        Progress.set(88);
      }
    })(),
    (async () => {
      await HomeFeed.load();
      Progress.advance(5);
    })(),
  ]);

  const elapsed = performance.now() - startTime;
  const remaining = Math.max(0, CONFIG.MIN_LOAD_MS - elapsed);
  setTimeout(() => Loader.hide(), remaining);

  window.addEventListener('popstate', async () => {
    const page = Utils.getPageParam();
    const listData = await fetchAnimeList(page);
    Cards.render(listData.items, 'card-container');
    Pagination.create(listData.totalPages, page);
  });

  window.addEventListener('resize', () => {
    // Nota: Aquí Pagination.create necesita totalPages, pero resize no lo tiene fácil.
    // Podríamos guardar lastTotalPages en State si fuera necesario.
    // Por ahora, asumimos que no cambia en resize o lo ignoramos.
  });
}

document.addEventListener('DOMContentLoaded', main);

// Run after DOM is ready
document.addEventListener('DOMContentLoaded', main);