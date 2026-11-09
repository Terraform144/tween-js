// Archives EN LIGNE : sauvegardes de projets écrites dans le dossier
// ./Archives à la racine du serveur (dev-server.py, endpoints /api/archives,
// protégés par la clé ?adm=4321 — voir util/adminMode.js).
//
// Le fichier écrit est le JSON du document (serializeDocument) tel quel :
// on peut donc le recharger directement avec deserializeDocument.
//
// Fallback : sur un hébergement 100 % statique (pas d'API côté serveur),
// saveRemoteArchive() télécharge le JSON localement au lieu d'écrire en ligne.

import { withAdm } from './adminMode.js';
import { downloadTextFile } from './download.js';

const API = '/api/archives';

/**
 * Liste les sauvegardes en ligne.
 * @returns {Promise<Array<{name: string, size: number, mtime: number}>>}
 *          triées du plus récent au plus ancien. Lève une erreur si l'API
 *          n'existe pas (serveur statique) ou si la clé est refusée (403).
 */
export async function listRemoteArchives() {
  const r = await fetch(withAdm(API));
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

/**
 * Sauvegarde un projet en ligne dans ./Archives.
 * @param {string} name - nom du projet (sert à nommer le fichier)
 * @param {string} jsonText - document sérialisé (serializeDocument)
 * @returns {Promise<{ok: boolean, file?: string, fallback?: boolean, error?: any}>}
 *          ok=true + file = écrit en ligne ; ok=false + fallback=true =
 *          API indisponible, le JSON a été téléchargé localement.
 */
export async function saveRemoteArchive(name, jsonText) {
  try {
    const r = await fetch(withAdm(API), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, data: jsonText }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const body = await r.json();
    return { ok: true, file: body.file };
  } catch (error) {
    // Pas d'API (hébergement statique) ou clé refusée : repli téléchargement.
    const safe = (name || 'document').replace(/[^a-z0-9_\-]+/gi, '_');
    downloadTextFile(jsonText, safe + '.json', 'application/json');
    return { ok: false, fallback: true, error };
  }
}

/**
 * Récupère le contenu JSON d'une sauvegarde en ligne.
 * @param {string} fileName - nom du fichier dans ./Archives
 * @returns {Promise<string>} le JSON du document
 */
export async function loadRemoteArchive(fileName) {
  const r = await fetch(withAdm(`${API}/${encodeURIComponent(fileName)}`));
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}

/**
 * Supprime une sauvegarde en ligne.
 * @param {string} fileName - nom du fichier dans ./Archives
 * @returns {Promise<{ok: boolean}>}
 */
export async function deleteRemoteArchive(fileName) {
  const r = await fetch(withAdm(`${API}/${encodeURIComponent(fileName)}`), { method: 'DELETE' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
