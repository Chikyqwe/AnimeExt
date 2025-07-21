  // ----------- TEMA LIGHT/DARK -----------
  function toggleTheme() {
    document.body.classList.toggle('light-theme');
    const icon = document.getElementById('bottomThemeIcon');
    icon.classList.toggle('fa-moon');
    icon.classList.toggle('fa-sun');
    localStorage.setItem('theme', document.body.classList.contains('light-theme') ? 'light' : 'dark');
adaptarBotonCerrarTema()
  }

  function restoreTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      document.body.classList.add('light-theme');
      const icon = document.getElementById('bottomThemeIcon');
      if (icon) {
        icon.classList.remove('fa-moon');
        icon.classList.add('fa-sun');
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
