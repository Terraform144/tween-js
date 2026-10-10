// Caméra virtuelle de scène — outil caméra façon Animate CC (2018).
//
// Sémantique : le cadre caméra est TOUJOURS mappé sur la surface entière du
// canvas de sortie (doc.width x doc.height). À zoom 1 + position (centre du
// document) + rotation 0, le rendu est identique au comportement historique
// — la caméra est donc purement additive : un document sans doc.camera ne
// change jamais d'un pixel.
//
// Modèle de données : doc.camera = { keyframes: [...] } | null (absent des
// documents existants = pas de caméra). Une image clé caméra est
// { index, x, y, zoom, rotation } :
//   - x, y  : centre du cadre caméra, en coordonnées document
//   - zoom  : 1 = cadre = limites du document ; 2 = cadre = moitié de la
//             scène (travelling avant) ; 0.5 = cadre = 2x le doc (on voit
//             autour de la feuille)
//   - rotation : degrés, sens horaire (le contenu tourne à l'inverse dans le
//             cadre, coins rognés au bord du canvas)
// Les images clés caméra s'interpolent TOUJOURS linéairement entre deux clés
// consécutives (un zoom cinématographique est un mouvement par nature) ;
// après la dernière clé la caméra tient son état, avant la première elle est
// à l'identité (rendu historique).
//
// Ce fichier est le point de vérité pour l'ÉDITEUR. Les exports embarquent
// une copie autonome (resolveCameraAtFrame/applyCameraToContext) dans
// tweenRuntime.js, inliné via ?raw — aucun import possible (même discipline
// que le pivot, voir src/core/pivot.js).

export const CAMERA_ZOOM_MIN = 0.1;
export const CAMERA_ZOOM_MAX = 10;

// Un doc.camera existe-t-il avec au moins une image clé ?
export function hasCamera(doc) {
  return !!(doc.camera && Array.isArray(doc.camera.keyframes) && doc.camera.keyframes.length > 0);
}

// État caméra par défaut : cadre = exactement les limites du document
// (rendu identique au comportement historique).
export function defaultCamera(doc) {
  return { x: doc.width / 2, y: doc.height / 2, zoom: 1, rotation: 0 };
}

function sortCameraKeyframes(cam) {
  cam.keyframes.sort((a, b) => a.index - b.index);
}

function clampCameraState(s, doc) {
  return {
    x: typeof s.x === 'number' ? s.x : doc.width / 2,
    y: typeof s.y === 'number' ? s.y : doc.height / 2,
    zoom: typeof s.zoom === 'number' ? Math.min(CAMERA_ZOOM_MAX, Math.max(CAMERA_ZOOM_MIN, s.zoom)) : 1,
    rotation: typeof s.rotation === 'number' ? s.rotation : 0,
  };
}

export function getCameraKeyframeAt(doc, frameIndex) {
  if (!hasCamera(doc)) return null;
  return doc.camera.keyframes.find((k) => k.index === frameIndex) || null;
}

// État caméra pleinement interpolé à l'image donnée. null = pas de caméra
// (identité, rendu historique). Sémantique des calques : la clé active
// (index <= frame) tient jusqu'à la suivante, interpole linéairement vers
// elle ; avant la première clé -> null (identité).
export function resolveCameraAtFrame(doc, frameIndex) {
  if (!hasCamera(doc)) return null;
  const kfs = doc.camera.keyframes;
  let active = null;
  for (const kf of kfs) {
    if (kf.index <= frameIndex) active = kf;
    else break;
  }
  if (!active) return null;
  const idx = kfs.indexOf(active);
  const next = kfs[idx + 1] || null;
  const a = clampCameraState(active, doc);
  if (!next || next.index === active.index) return a;
  const b = clampCameraState(next, doc);
  const span = next.index - active.index;
  const t = Math.min(1, Math.max(0, (frameIndex - active.index) / span));
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    zoom: a.zoom + (b.zoom - a.zoom) * t,
    rotation: a.rotation + (b.rotation - a.rotation) * t,
  };
}

// Pose (ou modifie) l'image clé caméra à frameIndex avec les valeurs `patch`.
// Si aucune clé n'existe à cette image, la nouvelle clé part de l'état
// résolu courant (interpolation comprise) — l'équivalent du F6 des calques :
// la caméra ne saute jamais au moment de la pose.
export function upsertCameraKeyframe(doc, frameIndex, patch = {}) {
  if (!doc.camera || !Array.isArray(doc.camera.keyframes)) doc.camera = { keyframes: [] };
  const existing = getCameraKeyframeAt(doc, frameIndex);
  if (existing) {
    Object.assign(existing, clampCameraState({ ...existing, ...patch }, doc));
    return existing;
  }
  const base = resolveCameraAtFrame(doc, frameIndex) || defaultCamera(doc);
  const kf = { index: frameIndex, ...clampCameraState({ ...base, ...patch }, doc) };
  doc.camera.keyframes.push(kf);
  sortCameraKeyframes(doc.camera);
  return kf;
}

// Supprime l'image clé caméra à frameIndex. Si c'était la dernière, la caméra
// disparaît entièrement (doc.camera = null -> rendu historique).
export function removeCameraKeyframeAt(doc, frameIndex) {
  if (!hasCamera(doc)) return false;
  const kfs = doc.camera.keyframes;
  const idx = kfs.findIndex((k) => k.index === frameIndex);
  if (idx === -1) return false;
  kfs.splice(idx, 1);
  if (!kfs.length) doc.camera = null;
  return true;
}

// Transform de "monde" pour l'éditeur Konva : à appliquer à bgLayer ET
// contentLayer comme position/rotation/échelle — le point de scène situé au
// centre caméra tombe exactement au centre du canvas, le cadre caméra
// (doc/zoom x doc/zoom) couvre tout le canvas. null = identité.
//
// screen = centre + R(-rotation) . S(zoom) . (p - cam)
// (S = zoom : le cadre sous-tendu est zoom fois PLUS PETIT que la scène,
// étiré sur tout le canvas — c'est le travelling avant.)
// La composition Konva position/rotation/scale est T(pos).R(φ).S(s) : on
// intègre la translation finale (-cam) dans pos.
export function cameraLayerTransform(cam, width, height) {
  if (!cam) return null;
  const zoom = cam.zoom || 1;
  const rad = -(cam.rotation || 0) * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return {
    x: width / 2 + (cos * -cam.x - sin * -cam.y) * zoom,
    y: height / 2 + (sin * -cam.x + cos * -cam.y) * zoom,
    rotation: rad * 180 / Math.PI,
    scaleX: zoom,
    scaleY: zoom,
  };
}
