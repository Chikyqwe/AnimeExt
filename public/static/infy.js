const suggestionBox = document.getElementById('search-suggestions');
const DB_NAME_I = 'FavoritosDB';
const DB_VERSION_I = 1;
const STORE_NAME_I = 'favoritos';

let currentAnime = null;

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
    } catch (err) {
        console.error("Error cargando lista:", err);
    }
}
function normalizeText(text) {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
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
    }

    function closeMobileSearch() {
        searchInput.classList.remove('showing');
        searchInput.classList.add('hiding');
        searchForm.classList.add('hiding');
        setTimeout(() => {
            searchForm.classList.remove('mobile-search-active', 'hiding');
            searchInput.classList.remove('hiding');
            searchInput.style.display = 'none';
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
document.addEventListener('click', e => {
    const searchInput = document.getElementById('searchInput');
    if (!suggestionBox.contains(e.target) && e.target !== searchInput) {
        suggestionBox.innerHTML = '';
        suggestionBox.style.display = 'none';
    }
});
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
    initShareButton(animeTitle);

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

    if (shareBtn) {
        shareBtn.onclick = (e) => {
            e.stopPropagation();
            shareAnime(animeTitle, data.id);
        };
    }

    // Mostrar estado mientras se cargan episodios
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

        // Renderizar episodios cuando estén listos
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

function cleanTitle(title) {
    return title.trim();
}
async function cargarFavoritosIndexed() {
    const db = await abrirDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME_I, 'readonly');
        const store = tx.objectStore(STORE_NAME_I);
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
fetchJsonList()