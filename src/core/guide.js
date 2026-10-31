// Motion guide — trajectoire d'un tween de mouvement (façon Animate CC).
// Un calque layer.guide = true fournit la courbe ; les calques layer.guided =
// true situés juste en dessous suivent cette courbe pendant leur tween.
// Logique pure (pas de DOM/Konva) : testable en Node.

import { getNextKeyframe } from './model.js';

// Même sémantique de chaîne que le masque (core/mask.js) : en partant du HAUT,
// un calque guide ouvre un bloc ; les calques guided consécutifs en dessous
// sont guidés par lui ; tout calque normal ferme le bloc.
export function computeGuideOwner(layers) {
  const owner = new Array(layers.length).fill(-1);
  let openGuide = -1;
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i];
    if (l.guide) openGuide = i;
    else if (l.guided && openGuide >= 0) owner[i] = openGuide;
    else openGuide = -1;
  }
  return owner;
}

// Keyframe portant le tween actif à frameIndex : la dernière kf tweenée dont
// l'index <= frameIndex et qui couvre frameIndex (jusqu'à sa kf suivante
// INCLUSE — à la frame d'arrivée exacte, t = 1). null si aucun tween en cours.
export function tweenKfAt(layer, frameIndex) {
  const kfs = layer.keyframes || [];
  for (let i = kfs.length - 1; i >= 0; i--) {
    const kf = kfs[i];
    if (!kf.tween || kf.index > frameIndex) continue;
    const next = getNextKeyframe(layer, kf);
    if (!next || frameIndex <= next.index) return kf;
  }
  return null;
}

const SUB = 16; // sous-échantillons par segment pour la longueur d'arc

// Échantillonne un tracé (points, coordonnées absolues) en une courbe
// paramétrée par longueur d'arc. Retourne { length, pointAt(t) } ou null.
// Segments Bézier si cOut/cIn présents (même sémantique que traceSegment).
export function samplePath(points, closed) {
  if (!points || points.length < 2) return null;
  const segs = [];
  for (let i = 1; i < points.length; i++) segs.push([points[i - 1], points[i]]);
  if (closed && points.length > 1) segs.push([points[points.length - 1], points[0]]);
  const flat = [{ x: points[0].x, y: points[0].y }];
  const cum = [0];
  let length = 0;
  let prev = flat[0];
  for (const [a, b] of segs) {
    const c1 = a.cOut ? { x: a.x + a.cOut.x, y: a.y + a.cOut.y } : { x: a.x, y: a.y };
    const c2 = b.cIn ? { x: b.x + b.cIn.x, y: b.y + b.cIn.y } : { x: b.x, y: b.y };
    const bezier = !!(a.cOut || b.cIn);
    for (let s = 1; s <= SUB; s++) {
      const t = s / SUB;
      let p;
      if (bezier) {
        const mt = 1 - t;
        p = {
          x: mt * mt * mt * a.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * b.x,
          y: mt * mt * mt * a.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * b.y,
        };
      } else {
        p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      length += Math.hypot(p.x - prev.x, p.y - prev.y);
      cum.push(length);
      flat.push(p);
      prev = p;
    }
  }
  if (length <= 0) return null;
  return {
    length,
    pointAt(t) {
      const target = Math.max(0, Math.min(1, t)) * length;
      let lo = 0, hi = cum.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < target) lo = mid + 1; else hi = mid; }
      const i = Math.max(1, lo);
      const l0 = cum[i - 1], l1 = cum[i];
      const f = l1 > l0 ? (target - l0) / (l1 - l0) : 0;
      return { x: flat[i - 1].x + (flat[i].x - flat[i - 1].x) * f, y: flat[i - 1].y + (flat[i].y - flat[i - 1].y) * f };
    },
  };
}
