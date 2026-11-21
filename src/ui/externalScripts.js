// Workflow « éditeur de code externe » (façon classe AS3 / Animate CC) :
// chaque script (scène principale ou MovieClip) peut être importé depuis /
// exporté vers un fichier .js, et ouvert directement dans VS Code via le
// protocole vscode://. Fonctionne dans TOUS les navigateurs :
// - Import : <input type="file"> (universel) — le contenu est copié dans le
//   script ; après édition dans VS Code, on re-importe pour actualiser.
// - Export : téléchargement d'un fichier .js (universel).
// - VS Code : lien vscode://file/... (universel, confirmation navigateur).
// - Lien vivant (Chromium/Edge/Vivaldi uniquement, File System Access API) :
//   le fichier est « lié » une fois via un picker ; son handle est persisté
//   en IndexedDB et le contenu est RELU automatiquement au focus de la
//   fenêtre — sauvegarde dans VS Code, retour dans l'app, c'est à jour.
import { downloadTextFile } from '../util/download.js';
import { promptText } from '../util/promptText.js';

// ---------------------------------------------------------------------------
// Noms de fichiers

export function sanitizeFileName(name) {
  return (name || 'script').replace(/[^a-z0-9_\-]+/gi, '_').replace(/^_+|_+$/g, '') || 'script';
}

// ---------------------------------------------------------------------------
// Import / export universels (tous navigateurs)

// Ouvre un picker de fichier .js et résout le texte lu (null si annulé).
export function pickJsFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.js,text/javascript';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, text: String(reader.result || '') });
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
      input.remove();
    });
    // Firefox ne déclenche pas change quand on annule ; le picker se ferme
    // sans événement fiable — on laisse l'input mort (GC) dans ce cas.
    document.body.appendChild(input);
    input.click();
  });
}

export function exportJsFile(code, fileName) {
  downloadTextFile(code, fileName, 'text/javascript');
}

// ---------------------------------------------------------------------------
// Ouvrir dans VS Code (protocole vscode:// — universel)

const VSCODE_FOLDER_KEY = 'tweenjs.vscodeFolder';

export function getVscodeFolder() {
  try { return localStorage.getItem(VSCODE_FOLDER_KEY) || ''; } catch (e) { return ''; }
}

export function setVscodeFolder(path) {
  try { localStorage.setItem(VSCODE_FOLDER_KEY, path); } catch (e) { /* mode privé */ }
}

// Ouvre VS Code sur <dossier configuré>/<fileName>. Le dossier est demandé
// une seule fois (localStorage) — l'utilisateur pointe vers l'endroit où il
// range ses scripts .js sur son poste de travail.
export async function openInVsCode(fileName) {
  let folder = getVscodeFolder();
  if (!folder) {
    folder = await promptText(
      'Dossier des scripts sur ce poste (une seule fois), ex :\n' +
      'Windows : C:\\projets\\tweenjs\\scripts\n' +
      'Linux : /home/user/projets/scripts',
      ''
    );
    if (!folder) return;
    setVscodeFolder(folder);
  }
  const normalized = folder.replace(/\\/g, '/').replace(/\/+$/, '');
  const url = 'vscode://file/' + encodeURI(normalized).replace(/#/g, '%23') + '/' + encodeURIComponent(fileName);
  window.open(url, '_self');
}

// ---------------------------------------------------------------------------
// Lien vivant (File System Access API — Chromium uniquement)

export function supportsLinkedFiles() {
  return typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';
}

const DB_NAME = 'tweenjs-linked-scripts';
const STORE = 'handles';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbOp(mode, key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const req = key === undefined && value === undefined ? store.getAllKeys()
      : mode === 'readonly' ? store.get(key)
      : value === undefined ? store.delete(key)
      : store.put(value, key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

// Lie un fichier .js au script identifié par `key` (ex : 'doc:sym12').
// Retourne le nom du fichier lié, ou null si annulé.
export async function linkFile(key) {
  if (!supportsLinkedFiles()) return null;
  const [handle] = await window.showOpenFilePicker({
    types: [{ description: 'Script JavaScript', accept: { 'text/javascript': ['.js'] } }],
    multiple: false,
  });
  await idbOp('readwrite', key, handle);
  return handle.name;
}

export async function unlinkFile(key) {
  try { await idbOp('readwrite', key); } catch (e) { /* base absente = rien à effacer */ }
}

// Relit le fichier lié à `key`. Retourne { name, text } | null (pas de lien,
// permission refusée après rechargement, fichier disparu...).
export async function readLinkedFile(key) {
  if (!supportsLinkedFiles()) return null;
  let handle;
  try { handle = await idbOp('readonly', key); } catch (e) { return null; }
  if (!handle) return null;
  try {
    if (handle.queryPermission && (await handle.queryPermission({ mode: 'read' })) !== 'granted') {
      // Après un rechargement de page, un geste utilisateur est requis pour
      // ré-obtenir la permission : on ignore silencieusement (le lien reste
      // en place, la relecture reprendra après le prochain clic utilisateur
      // qui passe par linkFile/reLink).
      return null;
    }
    const file = await handle.getFile();
    return { name: file.name, text: await file.text() };
  } catch (err) {
    console.warn('[externalScripts] lecture du fichier lié impossible :', err);
    return null;
  }
}

// Redemande la permission d'un handle lié (à appeler depuis un geste
// utilisateur, ex. le clic sur le bouton « Recharger »).
export async function requestLinkedPermission(key) {
  if (!supportsLinkedFiles()) return false;
  try {
    const handle = await idbOp('readonly', key);
    if (!handle) return false;
    if (handle.queryPermission && (await handle.queryPermission({ mode: 'read' })) === 'granted') return true;
    return (await handle.requestPermission({ mode: 'read' })) === 'granted';
  } catch (e) {
    return false;
  }
}
