const PREFIX = 'tweenjs:';

// Distingue "jamais réglé" de "réglé explicitement à false" — sert à
// n'appliquer un défaut intelligent (ex. replié par défaut sur mobile) que
// tant que l'utilisateur n'a jamais touché au réglage lui-même.
export function hasPref(key) {
  try {
    return localStorage.getItem(PREFIX + key) !== null;
  } catch {
    return false;
  }
}

export function getPref(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function setPref(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // stockage indisponible (navigation privée, quota...) — on ignore, ce
    // n'est qu'une préférence de confort, pas une donnée du document.
  }
}
