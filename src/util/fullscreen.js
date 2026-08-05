// API Fullscreen normalisée (préfixes webkit/moz/ms) + repli CSS pour les
// navigateurs qui ne l'exposent pas (iOS Safari < 16.4, iframes sans
// allowfullscreen, …) : l'élément cible passe en position:fixed plein écran
// via les classes .fs-css / .fs-css-active (voir style.css).
//
// `fullscreenElement()` renvoie l'élément plein écran dans LES deux modes
// (native via l'API, ou repli CSS via la classe) : les écrans (UI, resize)
// n'ont pas à savoir lequel est actif.

function requestFn(el) {
  return el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
}

function exitFn() {
  return document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
}

export function fullscreenElement() {
  const native = document.fullscreenElement
    || document.webkitFullscreenElement
    || document.mozFullScreenElement
    || document.msFullscreenElement;
  if (native) return native;
  // Repli CSS : l'élément "plein écran" est celui qui porte .fs-css-active.
  return document.querySelector('.fs-css-active') || null;
}

export function isElementFullscreen(el) {
  return fullscreenElement() === el;
}

export function onFullscreenChange(cb) {
  for (const name of ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange']) {
    document.addEventListener(name, cb);
  }
}

// Entrer en plein écran sur `target`. Retourne true si l'API native a été
// utilisée, false si le repli CSS a été appliqué.
export function requestFullscreen(target) {
  // En contexte non sécurisé (HTTP), l'API Fullscreen native est bloquée.
  // On force le repli CSS dans ce cas.
  if (typeof window !== 'undefined' && window.location && window.location.protocol !== 'https:') {
    console.warn('[Fullscreen] API native désactivée en HTTP. Utilisation du repli CSS.');
    applyCssFallback(target, true);
    return false;
  }

  const fn = requestFn(target);
  if (fn) {
    const promise = fn.call(target);
    if (promise && typeof promise.catch === 'function') {
      return promise
        .then(() => true)
        .catch(() => {
          // Si l'API échoue (ex. : permission refusée), on utilise le repli CSS.
          console.warn('[Fullscreen] API native échouée. Utilisation du repli CSS.');
          applyCssFallback(target, true);
          return false;
        });
    }
    return true;
  }
  applyCssFallback(target, true);
  return false;
}

export function exitFullscreen() {
  if (fullscreenElement()) {
    const fn = exitFn();
    if (fn) {
      const promise = fn.call(document);
      if (promise && typeof promise.catch === 'function') {
        promise.catch(() => {
          // Si la sortie échoue, on force le repli CSS.
          applyCssFallback(null, false);
        });
        return;
      }
      return;
    }
  }
  applyCssFallback(null, false);
}

export function toggleFullscreen(target) {
  const current = fullscreenElement();
  if (current === target) {
    exitFullscreen();
  } else if (current) {
    exitFullscreen();
    requestFullscreen(target);
  } else {
    requestFullscreen(target);
  }
}

function applyCssFallback(target, active) {
  const current = document.querySelector('.fs-css-active');
  if (current) current.classList.remove('fs-css-active');
  if (active && target) target.classList.add('fs-css-active');
  document.body.classList.toggle('fs-css', active);
  // Les écrans se rafraîchissent à l'écoute de 'fullscreenchange' : on en
  // émet un synthétique pour qu'ils réagissent aussi en mode repli CSS.
  document.dispatchEvent(new Event('fullscreenchange'));
}
