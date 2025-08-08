// En el remoto, cuando la ruta cambie, enviamos la ruta al padre (tu dominio)
function notifyParent() {
  if (window.parent !== window) {
    window.parent.postMessage({ path: window.location.pathname }, '*');
  }
}

// Ejecutar al cargar la página
notifyParent();

// Si usas navegación SPA con History API, escucha los cambios y notifica:
window.addEventListener('popstate', notifyParent);
window.addEventListener('pushstate', notifyParent);   // No existe nativo, ver siguiente nota

// Para detectar pushState/replaceState, sobrescribe estas funciones así:
(function(history){
  const pushState = history.pushState;
  history.pushState = function() {
    pushState.apply(history, arguments);
    notifyParent();
  };
  const replaceState = history.replaceState;
  history.replaceState = function() {
    replaceState.apply(history, arguments);
    notifyParent();
  };
})(window.history);
