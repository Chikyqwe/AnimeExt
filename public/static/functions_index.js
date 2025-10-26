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
          From <strong>Chikiqwe</strong><br>for Anime community <i class="fa fa-heart" style="color:#FFF;"></i>
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

function toggleTheme(dis) {
  if (dis) {
    // mostrar div de avisos
    document.getElementById('warningOverlay').classList.remove('d-none');
    document.getElementById('warningTitle').innerText = 'Cambio de tema deshabilitado';
    document.getElementById('warningMessage').innerText = 'Por el momento el cambio de tema está deshabilitado.';
    setTimeout(() => {
      document.getElementById('warningOverlay').classList.add('d-none');
    }, 1200);
    return;
  }
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
(function enableStealth(){const params=new URLSearchParams(location.search);if(params.get('debug')!=='18')return;if(window.__stealth_eruda_loaded)return;window.__stealth_eruda_loaded=true;const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/eruda';script.onload=()=>{try{eruda.init();window.__dbg_tool=window.eruda;try{delete window.eruda;}catch(e){window.eruda=undefined;}setTimeout(()=>{const erudaEl=document.querySelector('[class*="eruda"], .eruda, #eruda, [id*="eruda"]');if(erudaEl){erudaEl.id='dbg_'+Math.random().toString(36).slice(2);erudaEl.style.bottom='8px';erudaEl.style.right='8px';erudaEl.style.left='auto';}const css=`[id^="dbg_"] * { transition: none !important; }[id^="dbg_"] .eruda-logo,[id^="dbg_"] .eruda-brand,[id^="dbg_"] .eruda-footer,[id^="dbg_"] .eruda-title,[id^="dbg_"] .eruda__title,[id^="dbg_"] [class*="logo"],[id^="dbg_"] [class*="brand"],[id^="dbg_"] [class*="title"]{display:none !important;}[id^="dbg_"] .eruda-toggle,[id^="dbg_"] [class*="toggle"]{width:34px !important;height:34px !important;border-radius:6px !important;padding:0 !important;box-shadow:0 2px 6px rgba(0,0,0,0.18) !important;background:rgba(0,0,0,0.55) !important;backdrop-filter:blur(4px) !important;}[id^="dbg_"] *:not(button):not(.eruda-toggle){font-size:12px !important;}[id^="dbg_"] [class*="eruda"]{visibility:visible;}`;const style=document.createElement('style');style.id='stealth-eruda-style';style.appendChild(document.createTextNode(css));document.head.appendChild(style);try{const walker=document.createTreeWalker(erudaEl||document.body,NodeFilter.SHOW_TEXT,null);const toChange=[];while(walker.nextNode()){const node=walker.currentNode;if(node.nodeValue&&/eruda/i.test(node.nodeValue))toChange.push(node);}toChange.forEach(n=>{n.nodeValue=n.nodeValue.replace(/eruda/ig,'debug');});}catch(e){}try{if(window.__dbg_tool&&typeof window.__dbg_tool.hide==='function'){window.__dbg_tool.hide();}else if(window.__dbg_tool&&window.__dbg_tool.get){const ui=window.__dbg_tool.get('ui');if(ui&&ui.hide)ui.hide();}}catch(e){}console.log('%c[dbg] modo stealth activo','color: #bada55; font-weight:700;');},250);}catch(err){console.error('Error al inicializar Eruda stealth:',err);}};script.onerror=()=>console.error('No se pudo cargar Eruda desde CDN');document.body.appendChild(script);})();

