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
    assets: {}, // { [assetId]: Asset } — images bitmap embarquées (dataUrl base64)
    scripts: [createScript('Script 1', '// Code exécuté avec Scene (alias Game)\n// Exemple :\nScene.log(\"Bonjour\", Scene.width, \"x\", Scene.height);\nScene.play();\n// Les objets nommés (Nom d\'instance dans les propriétés) sont accessibles\n// directement, comme des movieclips : nom.x += 1; // bouge de 1 px\nScene.onEnterFrame(() => {\n  // ... boucle de jeu, appelée à chaque image pendant la lecture\n});')],
  };
}

export function createScript(name = 'Script', code = '') {
  return { id: nextId('script'), name, code };
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
    name: '',
    shapeType, // 'rect' | 'ellipse' | 'line' | 'path' | 'text'
    x: 0, y: 0,
    width: 100, height: 100,
    points: [], // for 'line' / 'path': [PathPoint, ...] relative to (x,y) — see createPathPoint()
    rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
    fill: '#cb4b16',
    stroke: '#073642',
    strokeWidth: 2,
    closed: false,
    text: '', fontSize: 24, fontFamily: 'Arial', align: 'center', lineHeight: 1.2,
    skeletonId: null, // ID du squelette qui influence cette forme
    boneId: null, // Gardé pour rétrocompatibilité, mais skeletonId est prioritaire
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

// ---------------------------------------------------------------------------
// Bitmap & assets (images PNG/JPG/GIF/WebP embarquées en dataUrl base64)
// ---------------------------------------------------------------------------

// Une image importée est stockée une seule fois dans doc.assets et référencée
// par ses éléments bitmap (plusieurs placements de la même image ne copient
// pas les pixels) — façon bibliothèque d'Adobe Animate. Le dataUrl base64
// reste sérialisable en JSON, donc survit à l'annulation (snapshots), au
// save/open et aux exports.
export function createAsset({ name = 'image', type = 'image/png', dataUrl = '', width = 0, height = 0 } = {}) {
  return {
    id: nextId('asset'),
    name,
    type,
    dataUrl,
    width,
    height,
  };
}

export function addAsset(doc, asset) {
  doc.assets = doc.assets || {};
  doc.assets[asset.id] = asset;
  return asset;
}

export function getAsset(doc, id) {
  return (doc.assets || {})[id] || null;
}

// Un élément bitmap référence une image de la bibliothèque (assetId). width/
// height = taille d'affichage (celle de l'image naturelle au moment de
// l'import, redimensionnable ensuite via le Transformer ou les propriétés).
export function createBitmap(assetId, props = {}) {
  const base = {
    kind: 'bitmap',
    id: nextId('bitmap'),
    name: '',
    assetId,
    x: 0, y: 0,
    width: 100, height: 100,
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
    skeletonId: null, // ID du squelette auquel ce bone appartient (null = bone isolé)
    color: '#4a90d9',
    strokeWidth: 2,
    influenceRadius: 80, // Rayon d'influence en pixels
  };
  return Object.assign(base, props);
}

// Génère un ID unique pour un squelette
export function nextSkeletonId() {
  return `skel${idCounter++}`;
}

// Retourne tous les bones d'une keyframe
function getBonesFromKeyframe(kf) {
  return kf.elements.filter((el) => el.kind === 'bone');
}

// Retourne les enfants directs d'un bone dans une keyframe
export function getChildBones(kf, parentBoneId) {
  return getBonesFromKeyframe(kf).filter((bone) => bone.parentBoneId === parentBoneId);
}

// Retourne tous les descendants d'un bone dans une keyframe (r�cursif)
export function getAllChildBones(kf, parentBoneId) {
  const allChildren = [];
  const children = getChildBones(kf, parentBoneId);
  for (const child of children) {
    allChildren.push(child);
    // Ajouter r�cursivement les enfants des enfants
    allChildren.push(...getAllChildBones(kf, child.id));
  }
  return allChildren;
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
// R�sout l'IK pour une cha�ne de bones en utilisant l'algorithme CCD (Cyclic Coordinate Descent)
// G�re des cha�nes de bones de n'importe quelle longueur
export function solveIK(kf, movedBoneId, newTailX, newTailY, iterations = 10) {
  const bones = getBonesFromKeyframe(kf);
  const movedBone = bones.find((b) => b.id === movedBoneId);
  if (!movedBone) return;
  
  // Obtenir toute la cha�ne de bones du parent jusqu'� l'enfant d�plac�
  const chain = [];
  let current = movedBone;
  while (current) {
    chain.unshift(current); // Ajouter au d�but pour avoir parent -> enfant
    current = bones.find((b) => b.id === current.parentBoneId);
  }
  
  // Si cha�ne de 1 bone : simplement le redimensionner
  if (chain.length === 1) {
    const dx = newTailX - chain[0].x;
    const dy = newTailY - chain[0].y;
    chain[0].length = Math.sqrt(dx * dx + dy * dy);
    chain[0].rotation = Math.atan2(dy, dx) * 180 / Math.PI;
    return;
  }
  
  // CCD : it�rer pour ajuster chaque articulation
  for (let iter = 0; iter < iterations; iter++) {
    // De l'enfant vers le parent (sauf le premier)
    for (let i = chain.length - 1; i >= 1; i--) {
      const bone = chain[i];
      const parent = chain[i - 1];
      
      // Position de la queue du parent = t�te de l'enfant
      const parentTailX = parent.x + parent.length * Math.cos(parent.rotation * Math.PI / 180);
      const parentTailY = parent.y + parent.length * Math.sin(parent.rotation * Math.PI / 180);
      
      // Calculer la rotation pour aligner bone vers la cible (ou vers la queue de l'enfant suivant)
      const targetX = i === chain.length - 1 ? newTailX : 
        bone.x + bone.length * Math.cos(bone.rotation * Math.PI / 180);
      const targetY = i === chain.length - 1 ? newTailY : 
        bone.y + bone.length * Math.sin(bone.rotation * Math.PI / 180);
      
      const dx = targetX - parentTailX;
      const dy = targetY - parentTailY;
      
      if (dx === 0 && dy === 0) continue;
      
      const newRotation = Math.atan2(dy, dx) * 180 / Math.PI;
      
      // Mettre � jour la rotation du bone
      bone.rotation = newRotation;
      
      // Repositionner la t�te du bone � la queue du parent
      bone.x = parentTailX;
      bone.y = parentTailY;
    }
    
    // Du parent vers l'enfant (sauf le dernier)
    for (let i = 0; i < chain.length - 1; i++) {
      const bone = chain[i];
      const child = chain[i + 1];
      
      // Position de la queue du bone
      const tailX = bone.x + bone.length * Math.cos(bone.rotation * Math.PI / 180);
      const tailY = bone.y + bone.length * Math.sin(bone.rotation * Math.PI / 180);
      
      // Mettre � jour la t�te de l'enfant
      child.x = tailX;
      child.y = tailY;
    }
  }
  
  // Apr�s les it�rations, s'assurer que la queue du dernier bone est � la position cible
  const lastBone = chain[chain.length - 1];
  const lastTailX = lastBone.x + lastBone.length * Math.cos(lastBone.rotation * Math.PI / 180);
  const lastTailY = lastBone.y + lastBone.length * Math.sin(lastBone.rotation * Math.PI / 180);
  
  const dx = newTailX - lastTailX;
  const dy = newTailY - lastTailY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  // Si la distance est significative, ajuster la longueur du dernier bone
  if (dist > 1 && chain.length > 1) {
    lastBone.length = Math.sqrt(dx * dx + dy * dy);
    lastBone.rotation = Math.atan2(dy, dx) * 180 / Math.PI;
  }
}


// Calcule la distance perpendiculaire d'un point à une ligne (bone)
// Retourne la distance signée (négative d'un côté, positive de l'autre)
function perpendicularDistance(px, py, x1, y1, x2, y2) {
  // Vecteur de la ligne
  const dx = x2 - x1;
  const dy = y2 - y1;
  
  // Éviter la division par zéro
  const lineLengthSq = dx * dx + dy * dy;
  if (lineLengthSq === 0) {
    // La ligne est un point, distance simple
    return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  }
  
  // Calcul du paramètre t (projection du point sur la ligne)
  const t = ((px - x1) * dx + (py - y1) * dy) / lineLengthSq;
  
  // Point de projection sur la ligne
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  
  // Distance du point à sa projection
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

// Retourne tous les bones d'un squelette dans une keyframe
export function getSkeletonBones(kf, skeletonId) {
  return getBonesFromKeyframe(kf).filter((bone) => bone.skeletonId === skeletonId);
}

// Retourne la liste des squelettes présents dans une keyframe, déduits des
// skeletonId des bones (un squelette = l'ensemble des bones qui le partagent).
export function getSkeletonsFromKeyframe(kf) {
  const ids = [...new Set(getBonesFromKeyframe(kf).map((b) => b.skeletonId).filter(Boolean))];
  return ids.map((id, i) => ({ id, name: `Squelette ${i + 1}` }));
}

// Calcule les poids d'influence de tous les bones sur un point
// Retourne un tableau de { boneId, weight }
export function calculateBoneWeightsForPoint(point, bones) {
  const weights = [];
  
  for (const bone of bones) {
    // Coordonnées de la tête et de la queue du bone
    const headX = bone.x;
    const headY = bone.y;
    const tailX = bone.x + bone.length * Math.cos(bone.rotation * Math.PI / 180);
    const tailY = bone.y + bone.length * Math.sin(bone.rotation * Math.PI / 180);
    
    // Distance perpendiculaire du point à la ligne du bone
    const dist = perpendicularDistance(point.x, point.y, headX, headY, tailX, tailY);
    
    // Si la distance est supérieure au rayon d'influence, poids = 0
    if (dist > bone.influenceRadius) continue;
    
    // Calcul du poids : plus proche = plus fort
    // Utilisation d'une falloff quadratique pour un effet plus doux
    const normalizedDist = dist / bone.influenceRadius;
    const weight = 1 - normalizedDist * normalizedDist; // Falloff quadratique
    
    if (weight > 0) {
      weights.push({ boneId: bone.id, weight });
    }
  }
  
  // Normaliser les poids pour que leur somme = 1
  if (weights.length === 0) return [];
  
  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
  if (totalWeight > 0) {
    for (const w of weights) {
      w.weight /= totalWeight;
    }
  }
  
  return weights;
}

// Applique la transformation des bones à un point avec des poids
export function applyBoneTransformToPoint(point, bones, weights) {
  if (weights.length === 0) return { x: point.x, y: point.y };
  
  let finalX = 0, finalY = 0;
  
  for (const w of weights) {
    const bone = bones.find((b) => b.id === w.boneId);
    if (!bone) continue;
    
    // Calculer la matrice de transformation du bone (position + rotation)
    const angleRad = bone.rotation * Math.PI / 180;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);
    
    // Position locale du point par rapport au bone (tête du bone = origine)
    // Pour l'instant, on utilise la position absolue du point
    // Dans une version plus avancée, on stocke la position locale
    
    // Appliquer la transformation du bone
    // Rotation : (x * cos - y * sin, x * sin + y * cos)
    // Translation : + bone.x, bone.y
    const transformedX = bone.x + point.x * cosA - point.y * sinA;
    const transformedY = bone.y + point.x * sinA + point.y * cosA;
    
    // Pondérer par le poids
    finalX += transformedX * w.weight;
    finalY += transformedY * w.weight;
  }
  
  return { x: finalX, y: finalY };
}

export function cloneElement(el, withNewId = false) {
  const copy = JSON.parse(JSON.stringify(el));
  if (withNewId) copy.id = nextId(el.kind === 'shape' ? 'shape' : el.kind === 'bitmap' ? 'bitmap' : 'inst');
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
  for (const assetId in doc.assets || {}) scan(assetId);
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

// Éléments du contexte courant portant un Nom d'instance (el.name), indexés
// par nom — utilisés par le runtime de scripts pour exposer `nom` comme une
// variable directement manipulable (`nom.x += 1`). Si deux éléments partagent
// le même nom, le dernier (calque supérieur) gagne, comme dans Flash.
export function getNamedElements(doc, editPath, frameIndex) {
  const layers = getContextLayers(doc, editPath);
  const out = {};
  for (const layer of layers) {
    const kf = getActiveKeyframe(layer, frameIndex);
    if (!kf) continue;
    for (const el of kf.elements) {
      const name = (el.name || '').trim();
      if (name) out[name] = el;
    }
  }
  return out;
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

// Boîte englobante du CONTENU d'un symbole dans son espace local (origine
// (0,0) de l'instance), calculée sur l'union de toutes ses images clés
// (contenu animé inclus) et des symboles imbriqués (récursif, avec garde de
// profondeur). Une instance est rendue avec son origine (0,0) placée à
// el.x/el.y : si le contenu est dessiné loin de son origine, une instance
// ajoutée au centre de la feuille (doc.width/2, doc.height/2) apparaîtrait
// hors feuille. Cette boîte permet de compenser (voir bouton « + » de la
// bibliothèque) pour que le contenu soit réellement centré.
export function getSymbolContentBounds(doc, symbolId, depth = 0) {
  const sym = doc.symbols[symbolId];
  if (!sym || depth > 12) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const acc = (x, y, w, h) => {
    if (!isFinite(x) || !isFinite(y)) return;
    if (!(w > 0) && !(h > 0)) return;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  };
  for (const layer of sym.layers) {
    for (const kf of layer.keyframes) {
      for (const el of kf.elements) {
        if (el.kind === 'instance') {
          const b = getSymbolContentBounds(doc, el.symbolId, depth + 1);
          if (b.width > 0 || b.height > 0) acc(el.x + b.x, el.y + b.y, b.width, b.height);
        } else if (el.shapeType === 'line' || el.shapeType === 'path') {
          // Points relatifs à (x,y) ; on inclut les poignées de courbe pour
          // une boîte fidèle au tracé visible.
          let ax = Infinity, ay = Infinity, bx = -Infinity, by = -Infinity;
          for (const p of el.points || []) {
            const xs = [p.x, p.cIn ? p.x + p.cIn.x : p.x, p.cOut ? p.x + p.cOut.x : p.x];
            const ys = [p.y, p.cIn ? p.y + p.cIn.y : p.y, p.cOut ? p.y + p.cOut.y : p.y];
            for (const vx of xs) { ax = Math.min(ax, vx); bx = Math.max(bx, vx); }
            for (const vy of ys) { ay = Math.min(ay, vy); by = Math.max(by, vy); }
          }
          if (ax !== Infinity) acc(el.x + ax, el.y + ay, bx - ax, by - ay);
        } else {
          // rect/ellipse/text/bitmap/bone : rendu centré sur (x,y) (Konva
          // offsetX/offsetY = width/2, height/2).
          const w = el.width || 0, h = el.height || 0;
          acc(el.x - w / 2, el.y - h / 2, w, h);
        }
      }
    }
  }
  if (minX === Infinity) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
