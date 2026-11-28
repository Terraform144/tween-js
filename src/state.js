// État central de l'éditeur — un objet mutable simple + pub/sub.
// Toute mutation doit être suivie d'un appel à notify(state).

import { defaultOnionSkin } from './core/onionSkin.js';
import { defaultGrid } from './core/grid.js';

export function createEditorState(doc) {
  return {
    doc,
    editPath: [],              // [] = scène racine, [symbolId,...] = édition isolée d'un symbole
    currentFrame: 0,
    selectedLayerId: doc.layers[0].id,
    selectedElementIds: [],
    selectedKeyframe: null,    // { layerId, index } pour la sélection sur la timeline
    focusFrameScript: null,    // { layerId, frameIndex } — demande ponctuelle du panneau Scripts d'ouvrir ce script d'image (posée par Timeline, consommée puis effacée par ScriptsPanel)
    currentTool: 'select',
    playing: false,
    fillColor: '#cb4b16',
    strokeColor: '#073642',
    strokeWidth: 2,
    brushSize: 5,
    brushPattern: 'round', // Patterns: round, flat, calligraphy, taper, pencil, marker, airbrush, drybrush, chalk, copic, ink, pastel, spray, highlighter, glow, hatch, double, bristles
    brushJitter: 0,         // variation déterministe de largeur à chaque point, 0..100 %
    brushSymmetry: 'none',  // symétrie du tracé : none | h | v | hv | radial (miroir autour du centre de la bbox)
    brushPressure: false,  // sensibilité à la pression du stylet (PointerEvent.pressure) — off par défaut (souris = 0.5)
    brushPressureSens: 80, // sensibilité de la pression, 0..100 %
    brushTextureAssetId: null, // asset image utilisé comme texture de remplissage des traits (null = couleur unie)
    brushSpatter: false,       // éclaboussures autour du tracé
    brushSpatterIntensity: 40, // intensité des éclaboussures, 0..100 %
    zoom: 1,
    onionSkin: defaultOnionSkin(), // peau d'oignon : fantômes bleus (passé) / rouges (futur) — réglage d'interface global, persisté via prefs (voir main.js / Timeline.js)
    audioAssetId: null, // dernier asset audio importé/sélectionné pour la piste audio (réglage d'interface global)
    editThroughCamera: false, // édition à travers la caméra : applique le transform caméra même hors lecture
    grid: defaultGrid(), // grille + snap + règles de la scène (persisté via prefs 'gridPrefs', voir main.js / Timeline.js)
    listeners: new Set(),
  };
}

export function subscribe(state, fn) {
  state.listeners.add(fn);
  return () => state.listeners.delete(fn);
}

export function notify(state) {
  state.listeners.forEach((fn) => fn());
}
