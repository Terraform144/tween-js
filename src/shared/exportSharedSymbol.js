/**
 * exportSharedSymbol.js - Utilitaire pour exporter des symboles depuis TweenJS
 * vers le format de symbole partagé (.SWC-like)
 * 
 * Usage :
 *   import { exportSymbolToSharedFormat } from './exportSharedSymbol.js';
 *   
 *   // Depuis l'éditeur TweenJS
 *   const sharedSymbol = exportSymbolToSharedFormat(state.doc.symbols['sym_1']);
 *   
 *   // Sauvegarder dans un fichier
 *   const jsonStr = JSON.stringify(sharedSymbol, null, 2);
 *   download(jsonStr, 'MySymbol.json', 'application/json');
 */

import { createDocument, createSymbol, createLayer, createKeyframe } from '../core/model.js';

/**
 * Exporte un symbole TweenJS vers le format de symbole partagé
 * @param {Object} symbol - Symbole à exporter (depuis state.doc.symbols)
 * @param {Object} options - Options d'export
 * @param {string} options.author - Auteur du symbole
 * @param {string} options.version - Version
 * @param {string} options.description - Description
 * @returns {Object} Symbole au format partagé
 */
export function exportSymbolToSharedFormat(symbol, options = {}) {
  const {
    author = 'Unknown',
    version = '1.0',
    description = symbol.name || 'No description'
  } = options;

  // Cloner le symbole pour éviter de modifier l'original
  const exportedSymbol = JSON.parse(JSON.stringify(symbol));

  // Ajouter les métadonnées pour le format partagé
  exportedSymbol._shared = {
    format: 'tweenjs-shared-symbol',
    version,
    author,
    description,
    exportDate: new Date().toISOString().split('T')[0]
  };

  return exportedSymbol;
}

/**
 * Exporte plusieurs symboles vers un manifeste
 * @param {Object} symbols - Objet { [id]: Symbol }
 * @param {Object} options - Options
 * @returns {Object} Manifeste
 */
export function exportSymbolsToManifest(symbols, options = {}) {
  const {
    name = 'Shared Symbols',
    author = 'Unknown',
    version = '1.0',
    description = 'Collection of shared symbols'
  } = options;

  const symbolEntries = [];
  const categories = {};

  for (const [id, symbol] of Object.entries(symbols)) {
    // Catégoriser automatiquement
    let category = 'other';
    if (symbol.name && symbol.name.toLowerCase().includes('button')) {
      category = 'ui';
    } else if (symbol.name && symbol.name.toLowerCase().includes('character')) {
      category = 'characters';
    } else if (symbol.name && symbol.name.toLowerCase().includes('enemy')) {
      category = 'enemies';
    } else if (symbol.name && symbol.name.toLowerCase().includes('effect')) {
      category = 'effects';
    }

    if (!categories[category]) {
      categories[category] = {
        name: category.charAt(0).toUpperCase() + category.slice(1),
        symbols: []
      };
    }
    categories[category].symbols.push(id);

    symbolEntries.push({
      id,
      name: symbol.name || id,
      description: symbol.description || `Symbol: ${symbol.name || id}`,
      url: `${id}.json`,
      tags: getTagsFromName(symbol.name || id),
      frameCount: symbol.frameCount,
      width: symbol.width,
      height: symbol.height
    });
  }

  return {
    format: 'tweenjs-shared-manifest',
    version,
    name,
    author,
    description,
    exportDate: new Date().toISOString().split('T')[0],
    symbols: symbolEntries,
    categories
  };
}

/**
 * Génère des tags à partir du nom du symbole
 * @param {string} name - Nom du symbole
 * @returns {Array}
 */
function getTagsFromName(name) {
  const tags = [];
  const lowerName = name.toLowerCase();

  if (lowerName.includes('button')) tags.push('ui', 'button');
  if (lowerName.includes('menu')) tags.push('ui', 'menu');
  if (lowerName.includes('character') || lowerName.includes('player')) tags.push('character');
  if (lowerName.includes('enemy')) tags.push('enemy');
  if (lowerName.includes('effect') || lowerName.includes('particle')) tags.push('effect');
  if (lowerName.includes('background') || lowerName.includes('bg')) tags.push('background');
  if (lowerName.includes('animation') || lowerName.includes('animated')) tags.push('animation');
  if (lowerName.includes('static') || lowerName.includes('graphic')) tags.push('static');

  return tags.length > 0 ? tags : ['other'];
}

/**
 * Crée un package complet de symboles partagés
 * @param {Object} symbols - Objet { [id]: Symbol }
 * @param {Object} options - Options
 * @returns {Object} Package complet avec manifeste et symboles
 */
export function createSharedSymbolPackage(symbols, options = {}) {
  const {
    name = 'Shared Symbols Package',
    author = 'Unknown',
    version = '1.0',
    description = 'Package of shared TweenJS symbols'
  } = options;

  const manifest = exportSymbolsToManifest(symbols, { name, author, version, description });
  const symbolFiles = {};

  for (const [id, symbol] of Object.entries(symbols)) {
    symbolFiles[`${id}.json`] = exportSymbolToSharedFormat(symbol);
  }

  return {
    manifest,
    symbolFiles,
    files: {
      'manifest.json': manifest,
      ...symbolFiles
    }
  };
}

/**
 * Valide un symbole partagé
 * @param {Object} symbol - Symbole à valider
 * @returns {Object} Résultat de validation
 */
export function validateSharedSymbol(symbol) {
  const errors = [];
  const warnings = [];

  // Vérifications requises
  if (!symbol.id) {
    errors.push('Missing required field: id');
  }

  if (!symbol.name) {
    warnings.push('Missing recommended field: name');
  }

  if (!symbol.type) {
    warnings.push('Missing recommended field: type');
  } else if (symbol.type !== 'movieclip' && symbol.type !== 'graphic') {
    errors.push(`Invalid type: ${symbol.type}. Must be 'movieclip' or 'graphic'`);
  }

  if (!symbol.layers || !Array.isArray(symbol.layers)) {
    errors.push('Missing or invalid layers array');
  }

  if (!symbol.frameCount) {
    warnings.push('Missing recommended field: frameCount');
  }

  if (symbol.frameCount && (symbol.frameCount < 1 || symbol.frameCount > 10000)) {
    warnings.push('frameCount seems unusually high or low');
  }

  // Vérifier les layers
  for (const layer of symbol.layers || []) {
    if (!layer.id) {
      errors.push(`Layer missing id`);
    }
    if (!layer.keyframes || !Array.isArray(layer.keyframes)) {
      errors.push(`Layer ${layer.id || 'unknown'} missing keyframes`);
    }
  }

  // Vérifier la format version
  if (symbol._shared && symbol._shared.format !== 'tweenjs-shared-symbol') {
    warnings.push('Unexpected shared format version');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export default {
  exportSymbolToSharedFormat,
  exportSymbolsToManifest,
  createSharedSymbolPackage,
  validateSharedSymbol
};
