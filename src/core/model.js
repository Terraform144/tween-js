// Modèle de document — objets JSON simples (pas de classes) pour rester
// facilement sérialisable et partageable avec le runtime d'export.

let idCounter = 1;

export function nextId(prefix) {
  return `${prefix}${idCounter++}`;
}

export function resetIdCounter(value = 1) {
  idCounter = value;
}

// ---------------------------------------------------------------------------
// Document / Layer / Keyframe
// ---------------------------------------------------------------------------

export function createDocument({ name = 'Sans titre', width = 550, height = 400, frameRate = 24 } = {}) {
  return {
    id: nextId('doc'),
    name,
    width,
    height,
    frameRate,
    backgroundColor: '#ffffff',
    frameCount: 24,
    layers: [createLayer('Calque 1')],
    symbols: {}, // { [symbolId]: Symbol }
    frameLabels: {}, // { [frameIndex]: 'label' } — pour gotoAndPlay('label') à l'export
  };
}

export function createLayer(name = 'Calque') {
  return {
    id: nextId('layer'),
    name,
    visible: true,
    locked: false,
    keyframes: [createKeyframe(0)],
  };
}

export function createKeyframe(index, elements = []) {
  return { index, elements, tween: null }; // tween: { easing } | null
}

export function createSymbol(name, type = 'movieclip') {
  return {
    id: nextId('sym'),
    name,
    type, // 'movieclip' | 'graphic'
    frameCount: 24,
    layers: [createLayer('Calque 1')],
    frameLabels: {}, // { [frameIndex]: 'label' }
  };
}

// ---------------------------------------------------------------------------
// Elements: shapes & symbol instances
// ---------------------------------------------------------------------------

export function createShape(shapeType, props = {}) {
  const base = {
    kind: 'shape',
    id: nextId('shape'),
    shapeType, // 'rect' | 'ellipse' | 'line' | 'path' | 'text'
    x: 0, y: 0,
    width: 100, height: 100,
    points: [], // for 'line' / 'path': [PathPoint, ...] relative to (x,y) — see createPathPoint()
    rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
    fill: '#cb4b16',
    stroke: '#073642',
    strokeWidth: 2,
    closed: false,
    text: '', fontSize: 24, fontFamily: 'Arial',
    boneId: null, // ID du bone auquel cette forme est attachée (skinning)
  };
  return Object.assign(base, props);
}

// Un point d'ancrage de courbe Bézier. cIn/cOut sont des vecteurs de
// poignée relatifs à (x,y) (pas des positions absolues), ou null pour un
// point anguleux sans courbure de ce côté. smooth=true fait que l'outil de
// sous-sélection déplace cIn et cOut en miroir l'un de l'autre.
export function createPathPoint(x, y, { cIn = null, cOut = null, smooth = false } = {}) {
  return { x, y, cIn, cOut, smooth };
}

export function createInstance(symbolId, props = {}) {
  const base = {
    kind: 'instance',
    id: nextId('inst'),
    symbolId,
    name: '',
    x: 0, y: 0,
    rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
  };
  return Object.assign(base, props);
}

export function createBone(props = {}) {
  const base = {
    kind: 'bone',
    id: nextId('bone'),
    x: 0, y: 0,
    length: 60,
    width: 60,
    height: 12,
    rotation: 0,
    parentBoneId: null,
    color: '#4a90d9',
    strokeWidth: 2,
  };
  return Object.assign(base, props);
}

// Retourne tous les bones d'une keyframe
function getBonesFromKeyframe(kf) {
  return kf.elements.filter((el) => el.kind === 'bone');
}

// Retourne les enfants directs d'un bone dans une keyframe
export function getChildBones(kf, parentBoneId) {
  return getBonesFromKeyframe(kf).filter((bone) => bone.parentBoneId === parentBoneId);
}

// Retourne le parent d'un bone dans une keyframe
export function getParentBone(kf, boneId) {
  return getBonesFromKeyframe(kf).find((bone) => bone.id === boneId);
}

// Calcule la position/rotation globale d'un bone en tenant compte de sa hiérarchie
export function getGlobalBoneTransform(kf, bone, layers) {
  // Pour l'instant, on ne gère que le parent direct
  // Dans une version plus avancée, on parcourrait toute la hiérarchie
  const parentBone = bone.parentBoneId ? getBonesFromKeyframe(kf).find((b) => b.id === bone.parentBoneId) : null;
  
  let globalX = bone.x;
  let globalY = bone.y;
  let globalRotation = bone.rotation;
  
  if (parentBone) {
    // La position du bone enfant est relative à la queue de son parent
    const parentTailX = parentBone.x + parentBone.length * Math.cos(parentBone.rotation * Math.PI / 180);
    const parentTailY = parentBone.y + parentBone.length * Math.sin(parentBone.rotation * Math.PI / 180);
    
    // Position globale = position parent + position relative de l'enfant
    globalX = parentTailX + bone.x * Math.cos(parentBone.rotation * Math.PI / 180) - bone.y * Math.sin(parentBone.rotation * Math.PI / 180);
    globalY = parentTailY + bone.x * Math.sin(parentBone.rotation * Math.PI / 180) + bone.y * Math.cos(parentBone.rotation * Math.PI / 180);
    
    // Rotation globale = rotation parent + rotation locale
    globalRotation = parentBone.rotation + bone.rotation;
  }
  
  return { x: globalX, y: globalY, rotation: globalRotation };
}

// Résout l'IK pour une chaîne de bones (max 2 bones pour l'instant)
// Si on déplace la queue d'un bone enfant, recalcule la rotation du parent
export function solveIK(kf, movedBoneId, newTailX, newTailY) {
  const bones = getBonesFromKeyframe(kf);
  const movedBone = bones.find((b) => b.id === movedBoneId);
  if (!movedBone) return;
  
  // Cas 1 : le bone déplacé a un parent (chaîne de 2 bones)
  if (movedBone.parentBoneId) {
    const parentBone = bones.find((b) => b.id === movedBone.parentBoneId);
    if (!parentBone) return;
    
    // Calculer la nouvelle rotation du parent pour que sa queue soit à la position désirée
    const dx = newTailX - parentBone.x;
    const dy = newTailY - parentBone.y;
    const newParentRotation = Math.atan2(dy, dx) * 180 / Math.PI;
    
    // Mettre à jour la rotation du parent
    parentBone.rotation = newParentRotation;
    
    // Recalculer la position et rotation de l'enfant
    const parentTailX = parentBone.x + parentBone.length * Math.cos(parentBone.rotation * Math.PI / 180);
    const parentTailY = parentBone.y + parentBone.length * Math.sin(parentBone.rotation * Math.PI / 180);
    
    // La queue du parent doit être à la position de la tête de l'enfant
    // Donc la tête de l'enfant reste à (parentTailX, parentTailY)
    movedBone.x = parentTailX;
    movedBone.y = parentTailY;
    
    // La rotation de l'enfant : de la tête à la queue (newTailX, newTailY)
    const childDx = newTailX - movedBone.x;
    const childDy = newTailY - movedBone.y;
    movedBone.rotation = Math.atan2(childDy, childDx) * 180 / Math.PI;
    
    // Mettre à jour la longueur de l'enfant si nécessaire
    movedBone.length = Math.sqrt(childDx * childDx + childDy * childDy);
  }
}

export function cloneElement(el, withNewId = false) {
  const copy = JSON.parse(JSON.stringify(el));
  if (withNewId) copy.id = nextId(el.kind === 'shape' ? 'shape' : 'inst');
  return copy;
}

// ---------------------------------------------------------------------------
// Keyframe helpers
// ---------------------------------------------------------------------------

export function sortKeyframes(layer) {
  layer.keyframes.sort((a, b) => a.index - b.index);
}

export function getActiveKeyframe(layer, frameIndex) {
  let active = layer.keyframes[0];
  for (const kf of layer.keyframes) {
    if (kf.index <= frameIndex) active = kf;
    else break;
  }
  return active;
}

export function getNextKeyframe(layer, kf) {
  const idx = layer.keyframes.indexOf(kf);
  return layer.keyframes[idx + 1] || null;
}

export function getKeyframeAt(layer, index) {
  return layer.keyframes.find((k) => k.index === index) || null;
}

// Insert a real keyframe at `index`, cloning the content of the currently
// active keyframe (like Animate's F6 "Insert Keyframe").
export function insertKeyframe(layer, index) {
  const existing = getKeyframeAt(layer, index);
  if (existing) return existing;
  const active = getActiveKeyframe(layer, index);
  let elements = [];
  if (active && active.index < index) {
    elements = active.elements.map((el) => cloneElement(el, false));
  }
  const kf = createKeyframe(index, elements);
  layer.keyframes.push(kf);
  sortKeyframes(layer);
  return kf;
}

// Insert an empty keyframe at `index` (Animate's F7 "Insert Blank Keyframe").
export function insertBlankKeyframe(layer, index) {
  const existing = getKeyframeAt(layer, index);
  if (existing) {
    existing.elements = [];
    existing.tween = null;
    return existing;
  }
  const kf = createKeyframe(index, []);
  layer.keyframes.push(kf);
  sortKeyframes(layer);
  return kf;
}

export function removeKeyframe(layer, kf) {
  if (layer.keyframes.length <= 1) return false;
  const idx = layer.keyframes.indexOf(kf);
  if (idx === -1) return false;
  layer.keyframes.splice(idx, 1);
  return true;
}

// Move an existing keyframe to a different frame index (glisser-déposer sur
// la timeline). Un tween n'est jamais stocké comme un lien explicite vers
// "l'autre" keyframe : c'est juste kf.tween + l'ordre du tableau (voir
// getNextKeyframe/toggleTween) — le déplacement est donc refusé s'il
// sauterait par-dessus une keyframe voisine (ce qui changerait l'ordre
// relatif). En restant strictement entre ses deux voisines actuelles, tout
// tween dont cette keyframe fait partie (comme départ ou comme arrivée)
// reste automatiquement intact, seule la durée du tween change.
export function moveKeyframe(layer, kf, targetIndex) {
  if (targetIndex === kf.index) return true;
  if (targetIndex < 0) return false;
  if (getKeyframeAt(layer, targetIndex)) return false; // index déjà occupé
  const idx = layer.keyframes.indexOf(kf);
  const prev = layer.keyframes[idx - 1];
  const next = layer.keyframes[idx + 1];
  if (prev && targetIndex <= prev.index) return false;
  if (next && targetIndex >= next.index) return false;
  kf.index = targetIndex;
  sortKeyframes(layer);
  return true;
}

export function toggleTween(layer, kf) {
  const next = getNextKeyframe(layer, kf);
  if (!next) { kf.tween = null; return; }
  kf.tween = kf.tween ? null : { easing: 'linear' };
}

// ---------------------------------------------------------------------------
// Editing context: root document timeline vs. a symbol's own timeline
// editPath is an array of symbol ids, e.g. [] = stage root, ['sym3'] = editing
// symbol sym3 in isolation, ['sym3','sym7'] = editing sym7 nested inside sym3.
// ---------------------------------------------------------------------------

export function getContextLayers(doc, editPath) {
  if (!editPath.length) return doc.layers;
  const sym = doc.symbols[editPath[editPath.length - 1]];
  return sym.layers;
}

export function getContextFrameCount(doc, editPath) {
  if (!editPath.length) return doc.frameCount;
  const sym = doc.symbols[editPath[editPath.length - 1]];
  return sym.frameCount;
}

export function setContextFrameCount(doc, editPath, value) {
  const v = Math.max(1, value | 0);
  if (!editPath.length) doc.frameCount = v;
  else doc.symbols[editPath[editPath.length - 1]].frameCount = v;
}

function getContextOwner(doc, editPath) {
  return editPath.length ? doc.symbols[editPath[editPath.length - 1]] : doc;
}

export function getFrameLabels(doc, editPath) {
  return getContextOwner(doc, editPath).frameLabels;
}

export function getFrameLabel(doc, editPath, frameIndex) {
  return getContextOwner(doc, editPath).frameLabels[frameIndex] || '';
}

export function setFrameLabel(doc, editPath, frameIndex, label) {
  const labels = getContextOwner(doc, editPath).frameLabels;
  const trimmed = (label || '').trim();
  if (trimmed) labels[frameIndex] = trimmed;
  else delete labels[frameIndex];
}

// { [frameIndex]: 'label' } (édition) -> { [label]: frameIndex } (lookup
// O(1) pour gotoAndPlay('label') dans les runtimes d'export).
export function invertFrameLabels(labels) {
  const out = {};
  for (const index in labels || {}) out[labels[index]] = parseInt(index, 10);
  return out;
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export function serializeDocument(doc) {
  return JSON.stringify(doc, null, 2);
}

export function deserializeDocument(jsonStr) {
  const doc = JSON.parse(jsonStr);
  bumpIdCounterPastDocument(doc);
  return doc;
}

export function bumpIdCounterPastDocument(doc) {
  let maxNum = 0;
  const scan = (id) => {
    const m = /(\d+)$/.exec(id || '');
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  };
  const scanLayers = (layers) => {
    for (const layer of layers) {
      scan(layer.id);
      for (const kf of layer.keyframes) {
        for (const el of kf.elements) scan(el.id);
      }
    }
  };
  scan(doc.id);
  scanLayers(doc.layers);
  for (const symId in doc.symbols) {
    scan(symId);
    scanLayers(doc.symbols[symId].layers);
  }
  resetIdCounter(maxNum + 1);
}

// ---------------------------------------------------------------------------
// Lookup utilities
// ---------------------------------------------------------------------------

export function findElementInLayers(layers, frameIndex, elementId) {
  for (const layer of layers) {
    const kf = getActiveKeyframe(layer, frameIndex);
    if (!kf) continue;
    const el = kf.elements.find((e) => e.id === elementId);
    if (el) return { layer, keyframe: kf, element: el };
  }
  return null;
}

export function symbolUsesSymbol(doc, hostSymbolId, candidateSymbolId) {
  // Prevents creating cyclic symbol nesting (a symbol containing itself).
  if (hostSymbolId === candidateSymbolId) return true;
  const visited = new Set();
  const stack = [hostSymbolId];
  while (stack.length) {
    const id = stack.pop();
    if (visited.has(id)) continue;
    visited.add(id);
    const sym = doc.symbols[id];
    if (!sym) continue;
    for (const layer of sym.layers) {
      for (const kf of layer.keyframes) {
        for (const el of kf.elements) {
          if (el.kind === 'instance') {
            if (el.symbolId === candidateSymbolId) return true;
            stack.push(el.symbolId);
          }
        }
      }
    }
  }
  return false;
}
