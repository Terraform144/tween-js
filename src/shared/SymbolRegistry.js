/**
 * SymbolRegistry.js - Registre des symboles partagés (inspiré des .SWC de Flash/AnimateCC)
 * 
 * Ce module permet de gérer une bibliothèque de symboles partagés entre différents
 * projets TweenJS, similaire aux fichiers .SWC (Shared Object) de Flash.
 * 
 * ============================================
 * CONCEPT
 * ============================================
 * 
 * Dans Flash/AnimateCC, les fichiers .SWC contenaient des symboles compilés
 * (MovieClips, Graphics, etc.) qui pouvaient être réutilisés dans d'autres projets.
 * 
 * Avec TweenJS, un "symbole partagé" est simplement un fichier JSON qui contient :
 * - Les données du symbole (frames, layers, éléments)
 * - Ses propriétés (frameRate, dimensions)
 * - Ses sous-symboles si applicable
 * 
 * Ces symboles peuvent être :
 * - Exportés depuis TweenJS
 * - Importés dans d'autres projets
 * - Partagés via npm, GitHub, ou un serveur privé
 * 
 * ============================================
 * FORMAT D'UN SYMBOLE PARTAGÉ
 * ============================================
 * 
 * {
 *   "id": "sym_1",
 *   "name": "Button",
 *   "type": "movieclip",  // "movieclip" | "graphic"
 *   "frameRate": 24,
 *   "frameCount": 10,
 *   "width": 100,
 *   "height": 50,
 *   "layers": [...],
 *   "frameLabels": { "0": "up", "5": "over", "8": "down" },
 *   "symbols": {}  // Sous-symboles si ce symbole en contient
 * }
 * 
 */

// Registre des symboles partagés chargés
const sharedSymbols = {};

// Chemins de recherche pour les symboles
const searchPaths = [
  './shared/',
  'https://cdn.yourdomain.com/tweenjs-shared/'
];

/**
 * Enregistre un symbole partagé dans le registre
 * @param {string} id - Identifiant unique du symbole
 * @param {Object} symbolData - Données du symbole
 * @returns {Object} Le symbole enregistré
 */
export function registerSharedSymbol(id, symbolData) {
  if (!id || !symbolData) {
    throw new Error('ID et symbolData sont requis');
  }
  
  sharedSymbols[id] = {
    id,
    name: symbolData.name || id,
    type: symbolData.type || 'movieclip',
    data: symbolData,
    loaded: true
  };
  
  return sharedSymbols[id];
}

/**
 * Charge un symbole partagé depuis un fichier JSON
 * @param {string} urlOrPath - URL ou chemin du fichier JSON du symbole
 * @param {string} id - ID optionnel, sinon généré depuis le nom du fichier
 * @returns {Promise<Object>} Promesse résolue avec le symbole chargé
 */
export async function loadSharedSymbol(urlOrPath, id = null) {
  try {
    const response = await fetch(urlOrPath);
    if (!response.ok) {
      throw new Error(`Échec du chargement: ${response.status} ${response.statusText}`);
    }
    
    const symbolData = await response.json();
    const symbolId = id || symbolData.id || generateIdFromUrl(urlOrPath);
    
    return registerSharedSymbol(symbolId, symbolData);
  } catch (error) {
    console.error(`[SymbolRegistry] Erreur de chargement: ${urlOrPath}`, error);
    throw error;
  }
}

/**
 * Charge plusieurs symboles depuis un manifeste
 * @param {string} manifestUrl - URL du fichier manifeste JSON
 * @returns {Promise<Array>} Promesse résolue avec la liste des symboles chargés
 */
export async function loadSymbolManifest(manifestUrl) {
  const response = await fetch(manifestUrl);
  if (!response.ok) {
    throw new Error(`Échec du chargement du manifeste: ${response.status}`);
  }
  
  const manifest = await response.json();
  const loadedSymbols = [];
  
  // Charger chaque symbole du manifeste
  for (const symbolEntry of manifest.symbols || []) {
    const symbol = await loadSharedSymbol(symbolEntry.url, symbolEntry.id);
    loadedSymbols.push(symbol);
  }
  
  return loadedSymbols;
}

/**
 * Récupère un symbole partagé par son ID
 * @param {string} id - Identifiant du symbole
 * @returns {Object|null} Le symbole ou null s'il n'est pas trouvé
 */
export function getSharedSymbol(id) {
  return sharedSymbols[id] || null;
}

/**
 * Récupère tous les symboles partagés chargés
 * @returns {Object} Tous les symboles registrés
 */
export function getAllSharedSymbols() {
  return { ...sharedSymbols };
}

/**
 * Supprime un symbole du registre
 * @param {string} id - Identifiant du symbole
 * @returns {boolean} True si supprimé, false sinon
 */
export function unregisterSharedSymbol(id) {
  if (sharedSymbols[id]) {
    delete sharedSymbols[id];
    return true;
  }
  return false;
}

/**
 * Vérifie si un symbole est déjà chargé
 * @param {string} id - Identifiant du symbole
 * @returns {boolean}
 */
export function hasSharedSymbol(id) {
  return !!sharedSymbols[id];
}

/**
 * Ajoute un chemin de recherche pour les symboles
 * @param {string} path - Chemin ou URL à ajouter
 */
export function addSearchPath(path) {
  if (!searchPaths.includes(path)) {
    searchPaths.push(path);
  }
}

/**
 * Génère un ID depuis une URL
 * @param {string} url - URL du fichier
 * @returns {string}
 */
function generateIdFromUrl(url) {
  // Extraire le nom du fichier sans extension
  const filename = url.split('/').pop().replace('.json', '');
  return `shared_${filename.replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

/**
 * Crée un manifeste de symboles pour partager plusieurs symboles
 * @param {Array} symbolIds - Liste des IDs de symboles à inclure
 * @returns {Object} Objet manifeste
 */
export function createSymbolManifest(symbolIds) {
  const symbols = symbolIds.map(id => {
    const symbol = getSharedSymbol(id);
    if (!symbol) {
      console.warn(`[SymbolRegistry] Symbole non trouvé: ${id}`);
      return null;
    }
    return {
      id: symbol.id,
      name: symbol.name,
      url: getSymbolUrl(id)
    };
  }).filter(Boolean);
  
  return {
    format: 'tweenjs-shared-manifest',
    version: '1.0',
    symbols
  };
}

/**
 * Génère une URL pour un symbole (à surcharger selon votre infrastructure)
 * @param {string} id - ID du symbole
 * @returns {string}
 */
export function getSymbolUrl(id) {
  const symbol = getSharedSymbol(id);
  if (symbol && symbol._sourceUrl) {
    return symbol._sourceUrl;
  }
  return `${searchPaths[0]}${id}.json`;
}

// Initialisation automatique si on est dans un navigateur
if (typeof window !== 'undefined') {
  // On peut éventuellement charger un manifeste par défaut
  // loadSymbolManifest('./shared/manifest.json').catch(console.error);
}

export default {
  registerSharedSymbol,
  loadSharedSymbol,
  loadSymbolManifest,
  getSharedSymbol,
  getAllSharedSymbols,
  unregisterSharedSymbol,
  hasSharedSymbol,
  addSearchPath,
  createSymbolManifest
};
