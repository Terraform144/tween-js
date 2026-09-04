// État central de l'éditeur — un objet mutable simple + pub/sub.
// Toute mutation doit être suivie d'un appel à notify(state).

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
    zoom: 1,
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
