/**
 * Script de conversion depuis l'éditeur TweenJS
 * 
 * Ce script permet de convertir un document exporté depuis l'éditeur
 * TweenJS en données de jeu pour IIB.
 * 
 * Usage:
 * 1. Dans l'éditeur, exportez votre document (via Menu > Exporter > Document JSON)
 * 2. Copiez le JSON dans un fichier
 * 3. Exécutez: node convert-from-editor.js input.json output.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Convertit un document de l'éditeur en données de jeu
 */
function convertEditorDocument(editorDoc) {
  const gameData = {
    stage: {
      width: editorDoc.width || 550,
      height: editorDoc.height || 400,
      frameRate: editorDoc.frameRate || 24,
      backgroundColor: editorDoc.backgroundColor || '#ffffff',
      frameCount: editorDoc.frameCount || 24,
      frameLabels: invertFrameLabels(editorDoc.frameLabels || {}),
    },
    
    symbols: {},
    
    mainTimeline: {
      layers: editorDoc.layers || [],
    },
  };

  // Convertir les symboles
  for (const [symbolId, symbol] of Object.entries(editorDoc.symbols || {})) {
    gameData.symbols[symbolId] = {
      type: symbol.type || 'movieclip',
      name: symbol.name || symbolId,
      frameCount: symbol.frameCount || 24,
      frameLabels: invertFrameLabels(symbol.frameLabels || {}),
      layers: symbol.layers || [],
    };
  }

  return gameData;
}

/**
 * Inverse les frameLabels: { frameIndex: 'label' } -> { label: frameIndex }
 */
function invertFrameLabels(labels) {
  const out = {};
  for (const [index, label] of Object.entries(labels || {})) {
    if (label) {
      out[label] = parseInt(index, 10);
    }
  }
  return out;
}

/**
 * Génère le code JavaScript pour iib-data.js
 */
function generateJSCode(gameData) {
  return `/**
 * Données du jeu converties depuis l'éditeur TweenJS
 * Généré automatiquement - ne pas modifier manuellement
 */

export const gameData = ${JSON.stringify(gameData, null, 2)};

// Fonctions utilitaires
export function createInstance(symbolId, props = {}) {
  const symbol = gameData.symbols[symbolId];
  if (!symbol) {
    console.warn(\`Symbole introuvable: \${symbolId}\`);
    return null;
  }
  
  return {
    kind: 'instance',
    id: \`inst_\${symbolId}_\${Math.random().toString(36).substr(2, 9)}\`,
    symbolId,
    x: props.x || 0,
    y: props.y || 0,
    rotation: props.rotation || 0,
    scaleX: props.scaleX != null ? props.scaleX : 1,
    scaleY: props.scaleY != null ? props.scaleY : 1,
    opacity: props.opacity != null ? props.opacity : 1,
  };
}

export function getMovieClipData(symbolId) {
  const symbol = gameData.symbols[symbolId];
  if (!symbol) return null;
  
  return {
    frameRate: gameData.stage.frameRate,
    frameCount: symbol.frameCount,
    layers: symbol.layers,
    frameLabels: symbol.frameLabels,
    symbols: gameData.symbols,
    width: gameData.stage.width,
    height: gameData.stage.height,
  };
}
`;
}

/**
 * Point d'entrée principal
 */
function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: node convert-from-editor.js <input.json> <output.js>');
    console.log('');
    console.log('Exemple:');
    console.log('  node convert-from-editor.js document-export.json iib-data.js');
    process.exit(1);
  }
  
  const inputPath = args[0];
  const outputPath = args[1];
  
  try {
    // Lire le fichier d'entrée
    const fileContent = readFileSync(inputPath, 'utf-8');
    const editorDoc = JSON.parse(fileContent);
    
    // Convertir
    const gameData = convertEditorDocument(editorDoc);
    
    // Générer le code
    const jsCode = generateJSCode(gameData);
    
    // Écrire le fichier de sortie
    writeFileSync(outputPath, jsCode);
    
    console.log(`Conversion terminée: ${inputPath} -> ${outputPath}`);
    console.log(`Symboles convertis: ${Object.keys(gameData.symbols || {}).length}`);
    console.log(`Layers dans la scène principale: ${gameData.mainTimeline.layers.length}`);
  } catch (error) {
    console.error('Erreur lors de la conversion:', error.message);
    process.exit(1);
  }
}

// Exécuter si le script est lancé directement
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { convertEditorDocument, generateJSCode, invertFrameLabels };
