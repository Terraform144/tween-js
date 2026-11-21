// prompt() natif est MUET sous Electron (non supporté : retourne null sans
// rien afficher). Helper partagé web/desktop :
// - sous Electron (pont window.animatejs exposé par electron/preload.cjs),
//   passe par une fenêtre modale native (IPC 'animatejs:prompt-text') ;
// - sinon, retombe sur window.prompt du navigateur.
// Retour : Promise<string|null> (null = annulé).
export async function promptText(message, defaultValue = '') {
  if (typeof window !== 'undefined' && window.animatejs && typeof window.animatejs.promptText === 'function') {
    return await window.animatejs.promptText(message, defaultValue);
  }
  return window.prompt(message, defaultValue);
}
