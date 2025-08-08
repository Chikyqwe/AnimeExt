(function(){
  function getFullPath(){
    return window.location.pathname + window.location.search + window.location.hash;
  }

  function notifyParent(){
    if (window.parent === window) return; // no estamos en iframe
    const payload = {
      path: getFullPath(),
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
      href: window.location.href,
      title: document.title
    };
    window.parent.postMessage(payload, '*');
    console.log('[notifyParent] enviado al padre →', payload);
  }

  // notificar al cargar
  notifyParent();

  // cambios por navegación del historial
  window.addEventListener('popstate', notifyParent);
  window.addEventListener('hashchange', notifyParent);

  // interceptar pushState/replaceState (SPA)
  (function(history){
    const _push = history.pushState;
    history.pushState = function(){
      const res = _push.apply(this, arguments);
      notifyParent();
      return res;
    };
    const _replace = history.replaceState;
    history.replaceState = function(){
      const res = _replace.apply(this, arguments);
      notifyParent();
      return res;
    };
  })(window.history);
})();