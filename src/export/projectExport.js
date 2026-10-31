// Export "projet vers dossier" : éclate le document en une arborescence de
// fichiers réels sur le disque (File System Access API, Chromium) ou en ZIP
// (fallback) — pour éditer les scripts dans VS Code et manipuler les assets
// dans l'explorateur :
//
//   <dossier>/
//     projet.json            ← doc complet, metas de workflow (scriptFile) retirées,
//                              assets référencés par src: "assets/<fichier>" (dataUrl retiré)
//     assets/<fichier>       ← binaires extraits des dataUrl (images, sons...)
//     scripts/*.js           ← scripts nommés, scripts de symbole, scripts d'image
//
// projet.json porte { tjsFormat: "folder-project", tjsVersion: 1 } pour être
// identifiable (une v2 pourra relire le dossier — "Ouvrir un dossier…").
//
// buildProjectTree(doc) est PURE (testable Node) : elle rend la liste des
// fichiers { path, data: Uint8Array, text? } sans toucher au disque.
import { makeZip } from '../util/zip.js';
import { downloadBlobFile } from '../util/download.js';

const EXT_BY_MIME = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
  'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/bmp': 'bmp',
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg', 'audio/webm': 'weba', 'video/webm': 'webm',
};

function sanitizeFileName(name) {
  return (name || 'file').replace(/[^a-z0-9_\-]+/gi, '_').replace(/^_+|_+$/g, '') || 'file';
}

// dataUrl -> { mime, bytes }. atob côté navigateur, Buffer côté Node (harnais).
function dataUrlToBytes(dataUrl) {
  const m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(dataUrl || '');
  if (!m) return { mime: 'application/octet-stream', bytes: new TextEncoder().encode(String(dataUrl || '')) };
  const mime = m[1] || 'application/octet-stream';
  if (m[2]) {
    if (typeof atob === 'function') {
      const bin = atob(m[3]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return { mime, bytes };
    }
    // Node (harnais de test uniquement — branche morte dans le navigateur)
    return { mime, bytes: new Uint8Array(Buffer.from(m[3], 'base64')) };
  }
  return { mime, bytes: new TextEncoder().encode(decodeURIComponent(m[3])) };
}

function extFor(mime) {
  if (EXT_BY_MIME[mime]) return EXT_BY_MIME[mime];
  const sub = (mime.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '');
  return sub || 'bin';
}

// Retire les metas de workflow (scriptFile : lien vivant local, jamais exporté)
// d'une copie profonde du doc.
function stripWorkflowMeta(doc) {
  const clean = JSON.parse(JSON.stringify(doc));
  for (const symId in clean.symbols || {}) {
    delete clean.symbols[symId].scriptFile;
    for (const layer of clean.symbols[symId].layers || []) {
      for (const kf of layer.keyframes || []) delete kf.scriptFile;
    }
  }
  for (const layer of clean.layers || []) {
    for (const kf of layer.keyframes || []) delete kf.scriptFile;
  }
  return clean;
}

// Construit l'arborescence complète du projet.
// Retourne { files: [{ path, data: Uint8Array, text }], assets: {assetId: path}, jsonText }.
export function buildProjectTree(doc) {
  const enc = new TextEncoder();
  const files = [];
  const out = stripWorkflowMeta(doc);
  const usedNames = new Set();
  const assetPath = {}; // assetId -> 'assets/<fichier>'

  // --- assets/ : un fichier binaire par asset, dataUrl retiré du JSON ---
  const assets = out.assets || {};
  for (const id in assets) {
    const a = assets[id];
    const { mime, bytes } = dataUrlToBytes(a.dataUrl);
    let base = sanitizeFileName(a.name || id);
    let file = base + '.' + extFor(a.type || mime);
    let n = 2;
    while (usedNames.has('assets/' + file)) { file = base + '_' + n++ + '.' + extFor(a.type || mime); }
    const path = 'assets/' + file;
    usedNames.add(path);
    files.push({ path, data: bytes });
    assetPath[id] = path;
    a.src = path;          // référence relative
    delete a.dataUrl;      // allège le JSON
  }

  // --- scripts/ : scripts nommés, de symbole, d'image (scène + symboles) ---
  const pushScript = (pathBase, code) => {
    let path = pathBase + '.js';
    let n = 2;
    while (usedNames.has(path)) { path = pathBase + '_' + n++ + '.js'; }
    usedNames.add(path);
    files.push({ path, data: enc.encode(code), text: code });
  };
  for (const sc of out.scripts || []) {
    if (!sc.code || !sc.code.trim()) continue;
    pushScript('scripts/' + sanitizeFileName(sc.name || 'script'), sc.code);
  }
  const collectLayers = (layers, prefix) => {
    for (const layer of layers || []) {
      for (const kf of layer.keyframes || []) {
        if (kf.script && kf.script.trim()) {
          pushScript(`scripts/${prefix}_f${(kf.index | 0) + 1}_${sanitizeFileName(layer.name || 'calque')}`, kf.script);
        }
      }
    }
  };
  collectLayers(out.layers, 'scene');
  for (const symId in out.symbols || {}) {
    const sym = out.symbols[symId];
    const base = sanitizeFileName(sym.name || symId);
    if (sym.script && sym.script.trim()) pushScript(`scripts/${base}_class`, sym.script);
    collectLayers(sym.layers, base);
  }

  // --- projet.json ---
  out.tjsFormat = 'folder-project';
  out.tjsVersion = 1;
  const jsonText = JSON.stringify(out, null, 2);
  files.unshift({ path: 'projet.json', data: enc.encode(jsonText), text: jsonText });

  return { files, assets: assetPath, jsonText };
}

// --- File System Access API (Chromium) ---

export function supportsDirectoryExport() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

// Écrit l'arborescence dans un FileSystemDirectoryHandle (dossier choisi par l'utilisateur).
export async function writeTreeToDirectory(dirHandle, files) {
  const dirs = new Map(); // 'assets' -> handle
  const dirFor = async (name) => {
    if (!dirs.has(name)) dirs.set(name, await dirHandle.getDirectoryHandle(name, { create: true }));
    return dirs.get(name);
  };
  for (const f of files) {
    const slash = f.path.indexOf('/');
    const handle = slash < 0
      ? await dirHandle.getFileHandle(f.path, { create: true })
      : await (await dirFor(f.path.slice(0, slash))).getFileHandle(f.path.slice(slash + 1), { create: true });
    const w = await handle.createWritable();
    await w.write(f.data);
    await w.close();
  }
}

// Choisit un dossier (geste utilisateur) et y écrit le projet. Retourne le nom du dossier.
export async function exportProjectToDirectory(doc) {
  const [dirHandle] = await window.showDirectoryPicker({ mode: 'readwrite' });
  const tree = buildProjectTree(doc);
  await writeTreeToDirectory(dirHandle, tree.files);
  return dirHandle.name;
}

// Fallback hors Chromium : même arborescence, empaquetée en ZIP.
export function exportProjectToZip(doc) {
  const tree = buildProjectTree(doc);
  const blob = makeZip(tree.files.map((f) => ({ name: f.path, data: f.data }))); // Blob application/zip
  const name = sanitizeFileName(doc.name || 'projet');
  downloadBlobFile(blob, name + '.zip');
  return blob;
}

// Point d'entrée : dossier FSA si dispo, ZIP sinon. Retourne { mode: 'dir'|'zip', name }.
export async function downloadProjectFolder(doc) {
  if (supportsDirectoryExport()) {
    const name = await exportProjectToDirectory(doc);
    return { mode: 'dir', name };
  }
  exportProjectToZip(doc);
  return { mode: 'zip', name: sanitizeFileName(doc.name || 'projet') + '.zip' };
}
