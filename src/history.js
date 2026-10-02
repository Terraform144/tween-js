import { subscribe, notify } from './state.js';
import { bumpIdCounterPastDocument, getContextFrameCount, getContextLayers } from './core/model.js';

const MAX_LEVELS = 15;

// Historique par snapshots JSON de state.doc. On ne s'accroche qu'à ça (pas
// à la sélection/l'outil courant/le défilement) : le pub/sub de state.js
// notifie pour toute mutation, y compris purement UI, donc on ne pousse une
// entrée dans la pile que si state.doc a réellement changé depuis la
// dernière fois — ça filtre naturellement le bruit sans devoir instrumenter
// chaque site de mutation dans Stage/Timeline/LibraryPanel/...
export function createHistory(state) {
  const undoStack = [];
  const redoStack = [];
  let lastSnapshot = JSON.stringify(state.doc);
  let restoring = false;

  // Multi-projets : un historique par fenêtre-projet. attach()/detach()
  // permettent de n'écouter que le projet actif — sinon les historiques de
  // tous les projets ouverts snapshotteraient les changements du projet
  // courant dans leurs piles respectives. attach() reprend la baseline du
  // doc courant (l'état de la façade au moment de l'activation).
  let unsub = null;
  const listener = () => {
    if (restoring) return;
    const current = JSON.stringify(state.doc);
    if (current === lastSnapshot) return;
    undoStack.push(lastSnapshot);
    if (undoStack.length > MAX_LEVELS) undoStack.shift();
    redoStack.length = 0;
    lastSnapshot = current;
  };
  function attach() {
    if (unsub) return;
    lastSnapshot = JSON.stringify(state.doc);
    unsub = subscribe(state, listener);
  }
  function detach() {
    if (!unsub) return;
    unsub();
    unsub = null;
  }
  attach();

  function restore(json) {
    restoring = true;
    state.doc = JSON.parse(json);
    bumpIdCounterPastDocument(state.doc);

    // Évite les références obsolètes après un saut dans le temps (élément
    // qui vient de disparaître/réapparaître, symbole édité qui n'existe
    // plus à ce point de l'historique, image hors des bornes du calque).
    state.selectedElementIds = [];
    if (state.editPath.length && !state.doc.symbols[state.editPath[state.editPath.length - 1]]) {
      state.editPath = [];
    }
    const layers = getContextLayers(state.doc, state.editPath);
    if (!layers.find((l) => l.id === state.selectedLayerId)) {
      state.selectedLayerId = layers[0].id;
    }
    const frameCount = getContextFrameCount(state.doc, state.editPath);
    state.currentFrame = Math.min(state.currentFrame, frameCount - 1);

    lastSnapshot = json;
    notify(state);
    restoring = false;
  }

  function undo() {
    if (!undoStack.length) return;
    const prev = undoStack.pop();
    redoStack.push(lastSnapshot);
    if (redoStack.length > MAX_LEVELS) redoStack.shift();
    restore(prev);
  }

  function redo() {
    if (!redoStack.length) return;
    const next = redoStack.pop();
    undoStack.push(lastSnapshot);
    if (undoStack.length > MAX_LEVELS) undoStack.shift();
    restore(next);
  }

  return {
    undo,
    redo,
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    attach,
    detach,
  };
}
