// Pivot de transformation (registration point à la Adobe Animate CC).
//
// Un pivot explicite déplace le point autour duquel l'élément tourne (outil
// sélection, Transformer, interpolations, exports) : épaule d'un bras,
// poignée d'une épée, etc.
//
// Sémantique des coordonnées :
// - formes (rect/ellipse/texte), bitmap : pivotX/pivotY dans la BOÎTE
//   locale de l'élément, (0,0) = coin haut-gauche, unités = pixels.
// - ligne/chemin : mêmes coordonnées de boîte, la boîte étant l'enveloppe
//   des points.
// - instance de symbole : pivotX/pivotY dans l'ESPACE DU SYMBOLE (l'origine
//   du symbole = (0,0)), comme le registration point d'Animate.
// - bone : pas de pivot (la rotation autour de la tête fait partie du
//   modèle d'ossature/IK) — hasPivot() est toujours faux.
//
// Absence de pivot (pivotX/pivotY indéfinis) = comportement historique,
// inchangé pour tous les documents existants : centre de la boîte pour
// rect/ellipse/texte/bitmap, origine du nœud (premier point) pour
// ligne/chemin, origine du symbole pour une instance.
//
// Ce module est importé par l'éditeur (Stage.js) et le panneau de
// propriétés. Les runtimes d'export (tweenRuntime.js, exportHTML.js,
// compiledPlayer.js) embarquent chacun une copie autonome de la même
// logique : leurs sources sont inlinées via ?raw dans des fichiers sans
// import possible.

export function hasPivot(el) {
  return el.kind !== 'bone' && el.pivotX != null && el.pivotY != null;
}

// Coin haut-gauche (et dimensions) de la boîte locale de l'élément dans
// l'espace de dessin du nœud Konva. Pour ligne/chemin, les points vivent
// dans cet espace ; pour rect/texte/bitmap la boîte démarre à (0,0) ; pour
// une ellipse elle est centrée sur l'origine ; pour une instance, l'espace
// du symbole EST l'espace du nœud.
function boxOrigin(el) {
  if (el.kind === 'instance') return { x: 0, y: 0 };
  if (el.shapeType === 'line' || el.shapeType === 'path') {
    const pts = el.points || [];
    if (!pts.length) return { x: 0, y: 0 };
    let minX = Infinity, minY = Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
    }
    return { x: minX, y: minY };
  }
  if (el.shapeType === 'ellipse') return { x: -(el.width || 0) / 2, y: -(el.height || 0) / 2 };
  return { x: 0, y: 0 };
}

// Pivot par défaut (quand aucun pivot explicite n'est posé), en coordonnées
// de boîte/symbole. Pour un texte, la hauteur rendue dépend du nombre de
// lignes : le rendu utilise la hauteur réelle, cette approximation
// (el.height) ne sert qu'au panneau de propriétés.
export function defaultPivotBox(el, renderedHeight = null) {
  if (el.kind === 'instance') return { x: 0, y: 0 };
  if (el.shapeType === 'line' || el.shapeType === 'path') {
    const o = boxOrigin(el);
    return { x: -o.x, y: -o.y };
  }
  const w = el.width || 0;
  const h = el.shapeType === 'text' && renderedHeight != null ? renderedHeight : (el.height || 0);
  return { x: w / 2, y: h / 2 };
}

// Position du pivot dans l'espace de dessin du nœud Konva (offsetX/offsetY).
// renderedHeight : hauteur réellement rendue d'un texte (node.height()),
// uniquement utile pour le pivot par défaut d'un texte.
export function pivotNodeOffset(el, renderedHeight = null) {
  if (el.kind === 'bone' || el.kind === 'instance') {
    return hasPivot(el) ? { x: el.pivotX, y: el.pivotY } : { x: 0, y: 0 };
  }
  if (el.shapeType === 'line' || el.shapeType === 'path') {
    if (!hasPivot(el)) return { x: 0, y: 0 };
    const o = boxOrigin(el);
    return { x: o.x + el.pivotX, y: o.y + el.pivotY };
  }
  if (el.shapeType === 'ellipse') {
    if (!hasPivot(el)) return { x: 0, y: 0 };
    return { x: el.pivotX - (el.width || 0) / 2, y: el.pivotY - (el.height || 0) / 2 };
  }
  if (!hasPivot(el)) {
    const d = defaultPivotBox(el, renderedHeight);
    return { x: d.x, y: d.y };
  }
  return { x: el.pivotX, y: el.pivotY };
}

// Inverse de pivotNodeOffset : position en coordonnées de boîte/symbole
// d'un point exprimé dans l'espace de dessin du nœud.
export function pivotBoxFromNode(el, nodePt) {
  const o = boxOrigin(el);
  return { x: nodePt.x - o.x, y: nodePt.y - o.y };
}

// Décalage à appliquer à el.x/el.y quand le pivot passe de oldOff à newOff
// (espace nœud) pour que l'objet reste visuellement immobile. La rotation et
// l'échelle courantes de l'élément sont prises en compte : le déplacement
// de l'origine est M = R(rotation)·S(scale) appliqué au delta.
export function pivotMoveDelta(el, oldOff, newOff) {
  const r = (el.rotation || 0) * Math.PI / 180;
  const cos = Math.cos(r), sin = Math.sin(r);
  const sx = el.scaleX == null ? 1 : el.scaleX;
  const sy = el.scaleY == null ? 1 : el.scaleY;
  const dx = newOff.x - oldOff.x;
  const dy = newOff.y - oldOff.y;
  return { dx: sx * dx * cos - sy * dy * sin, dy: sx * dx * sin + sy * dy * cos };
}

// Poser un pivot explicite (coordonnées de boîte/symbole) en compensant
// x/y pour que l'objet ne bouge pas à l'écran.
export function setElementPivot(el, boxX, boxY) {
  const oldOff = pivotNodeOffset(el);
  el.pivotX = boxX;
  el.pivotY = boxY;
  const newOff = pivotNodeOffset(el);
  const d = pivotMoveDelta(el, oldOff, newOff);
  el.x += d.dx;
  el.y += d.dy;
}

// Fixer une seule composante du pivot (champ X ou Y du panneau) : l'autre
// garde sa valeur si déjà posée, sinon prend sa valeur par défaut.
export function setElementPivotField(el, boxX, boxY) {
  if (boxX == null && boxY == null) return;
  const oldOff = pivotNodeOffset(el);
  const def = defaultPivotBox(el);
  el.pivotX = boxX != null ? boxX : (el.pivotX != null ? el.pivotX : def.x);
  el.pivotY = boxY != null ? boxY : (el.pivotY != null ? el.pivotY : def.y);
  const newOff = pivotNodeOffset(el);
  const d = pivotMoveDelta(el, oldOff, newOff);
  el.x += d.dx;
  el.y += d.dy;
}

// Retirer le pivot explicite (retour au comportement par défaut) en
// compensant x/y pour que l'objet ne bouge pas à l'écran.
export function resetElementPivot(el) {
  const oldOff = pivotNodeOffset(el);
  delete el.pivotX;
  delete el.pivotY;
  const newOff = pivotNodeOffset(el);
  const d = pivotMoveDelta(el, oldOff, newOff);
  el.x += d.dx;
  el.y += d.dy;
}

// Décalage (espace nœud) entre le pivot explicite et le pivot par défaut.
// Le hit-test des éléments nommés (sceneRuntime + exports) compare la
// position locale au cadre du contenu exprimé dans le repère du pivot PAR
// DÉFAUT : ce décalage ramène le point cliqué dans ce repère. Nul quand
// aucun pivot explicite n'est posé.
export function pivotHitShift(el) {
  if (!hasPivot(el)) return { x: 0, y: 0 };
  const def = defaultPivotBox(el);
  const off = pivotNodeOffset(el);
  const defOff = pivotNodeOffset(Object.assign({}, el, { pivotX: def.x, pivotY: def.y }));
  return { x: off.x - defOff.x, y: off.y - defOff.y };
}
