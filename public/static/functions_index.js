(() => {
  // Crear el HTML del modal como string
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
          From <strong>Chikiqwe</strong><br>for Anime community ❤️
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

  // Insertar el modal al final del body
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
function adaptarBotonesCerrar() {
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

  // Cambia el icono sin usar dos toggles
  if (document.body.classList.contains('light-theme')) {
    icon.classList.replace('fa-moon', 'fa-sun');
  } else {
    icon.classList.replace('fa-sun', 'fa-moon');
  }

  // Guarda el estado
  localStorage.setItem('theme', document.body.classList.contains('light-theme') ? 'light' : 'dark');

  // Tu función extra
  adaptarBotonesCerrar();
}


function restoreTheme() {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
    const icon = document.querySelector('#themeIcon');

    // Cambia el icono sin usar dos toggles
    if (document.body.classList.contains('light-theme')) {
      icon.classList.replace('fa-moon', 'fa-sun');
    } else {
      icon.classList.replace('fa-sun', 'fa-moon');
    }
  }
}

// ----------- POLÍTICA DE PRIVACIDAD -----------
function initPolicyModal() {
  const overlay = document.getElementById('policyOverlay');
  const acceptBtn = document.getElementById('policyAcceptBtn');
  const iframe = document.getElementById('policyIframe');

  if (!overlay || !acceptBtn || !iframe) return;

  iframe.src = `${window.location.origin}/privacy-policy.html`;
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
      console.warn('[POLICY] Se detectó eliminación del modal. Restaurando...');

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

// ----------- MODAL DE ANUNCIOS -----------
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

// ----------- BARRA INFERIOR SCROLL -----------
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

// ----------- INIT GENERAL -----------
window.addEventListener('DOMContentLoaded', () => {
  restoreTheme();
  setupScrollBar();
  adaptarBotonesCerrar();

  if (!localStorage.getItem('policyAccepted')) {
    initPolicyModal();
    monitorPolicyIntegrity();
  }
  if (!localStorage.getItem('ads') && localStorage.getItem('policyAccepted')) {
    initAdsModal();
  }
});

// ----------- SCROLL TO BOTTOM BUTTON -----------
function scrollToBottom() {
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}
