// Mode administrateur : débloqué par la clé ?adm=4321 dans l'URL.
// Sert à afficher la section « archives en ligne » (dossier ./Archives)
// dans le menu Archives. Sans la clé, la section n'existe pas.

export const ADM_KEY = '4321';

/** Valeur du paramètre adm de l'URL courante (null si absent). */
export function admParam() {
  try {
    return new URLSearchParams(window.location.search).get('adm');
  } catch {
    return null;
  }
}

/** true si l'URL courante contient la clé admin (?adm=4321). */
export function isAdminMode() {
  return admParam() === ADM_KEY;
}

/** Ajoute la clé admin à une URL d'API (?adm=4321 ou &adm=4321). */
export function withAdm(path) {
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}adm=${encodeURIComponent(ADM_KEY)}`;
}
