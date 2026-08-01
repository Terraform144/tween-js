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
    currentTool: 'select',
    playing: false,
    fillColor: '#cb4b16',
    strokeColor: '#073642',
    strokeWidth: 2,
    zoom: 1,
    // Onion Skinning
    onionSkinEnabled: true,
    onionSkinPreviousFrames: 2,  // Nombre de frames précédentes à afficher
    onionSkinNextFrames: 1,     // Nombre de frames suivantes à afficher
    onionSkinPrevOpacity: 0.3,  // Opacité des frames précédentes
    onionSkinNextOpacity: 0.3,  // Opacité des frames suivantes
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
