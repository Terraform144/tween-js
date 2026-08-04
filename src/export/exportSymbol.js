// Export d'un symbole (Graphic ou MovieClip) en classe JS réutilisable comme
// objet de jeu : deux fichiers sont téléchargés — tween-runtime.js (le
// moteur partagé, identique à src/export/tweenRuntime.js) et
// <NomDuSymbole>.js (une petite classe `extends MovieClip` qui embarque les
// données du symbole et de tout ce dont il dépend).
import runtimeSource from './tweenRuntime.js?raw';
import { downloadTextFile } from '../util/download.js';
import { invertFrameLabels as invertLabels } from '../core/model.js';

// Parcourt récursivement les instances imbriquées pour ne garder que les
// symboles réellement utilisés par ce symbole (racine incluse), ainsi que les
// assets bitmap référencés par leurs calques.
function collectSymbolClosure(doc, rootSymbolId) {
  const collected = {};
  const assets = {};
  const stack = [rootSymbolId];
  const visited = new Set();
  while (stack.length) {
    const id = stack.pop();
    if (visited.has(id)) continue;
    visited.add(id);
    const sym = doc.symbols[id];
    if (!sym) continue;
    collected[id] = {
      type: sym.type,
      frameCount: sym.frameCount,
      layers: sym.layers,
      frameLabels: invertLabels(sym.frameLabels),
    };
    for (const layer of sym.layers) {
      for (const kf of layer.keyframes) {
        for (const el of kf.elements) {
          if (el.kind === 'instance' && !visited.has(el.symbolId)) stack.push(el.symbolId);
          if (el.kind === 'bitmap' && el.assetId && doc.assets && doc.assets[el.assetId]) {
            assets[el.assetId] = doc.assets[el.assetId];
          }
        }
      }
    }
  }
  return { collected, assets };
}

export function buildSymbolExportData(doc, rootSymbolId) {
  const { collected, assets } = collectSymbolClosure(doc, rootSymbolId);
  const root = collected[rootSymbolId];
  return {
    frameRate: doc.frameRate,
    frameCount: root.frameCount,
    layers: root.layers,
    frameLabels: root.frameLabels,
    assets,
    symbols: collected,
  };
}

function toClassName(name) {
  const cleaned = (name || 'Symbole').replace(/[^a-zA-Z0-9]+/g, ' ').trim();
  const parts = cleaned.split(' ').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1));
  const joined = parts.join('') || 'Symbole';
  return /^[0-9]/.test(joined) ? '_' + joined : joined;
}

export function buildSymbolClassSource(doc, symbol) {
  const data = buildSymbolExportData(doc, symbol.id);
  const className = toClassName(symbol.name) + 'Clip';
  const labelNames = Object.keys(data.frameLabels);
  return `// Généré par TweenJS — symbole "${symbol.name}" (${symbol.type}).
// Nécessite tween-runtime.js dans le même dossier (import relatif ci-dessous).
import { MovieClip } from './tween-runtime.js';

const DATA = ${JSON.stringify(data)};

export class ${className} extends MovieClip {
  constructor(props) {
    super(DATA, props);
  }
}
${labelNames.length ? `\n// Labels disponibles pour gotoAndPlay()/gotoAndStop() : ${labelNames.map((l) => `"${l}"`).join(', ')}\n` : ''}
export default ${className};
`;
}

function safeFileName(name) {
  return (name || 'Symbole').replace(/[^a-z0-9_\-]+/gi, '_');
}

export function downloadSymbolAsGameObject(doc, symbolId) {
  const symbol = doc.symbols[symbolId];
  if (!symbol) return;
  const classSource = buildSymbolClassSource(doc, symbol);
  downloadTextFile(runtimeSource, 'tween-runtime.js', 'text/javascript');
  setTimeout(() => {
    downloadTextFile(classSource, safeFileName(symbol.name) + '.js', 'text/javascript');
  }, 150);
}
