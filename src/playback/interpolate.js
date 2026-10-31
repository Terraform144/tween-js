// Fonctions d'interpolation pures — partagées par l'éditeur (Stage) et,
import { lerpGradient } from '../core/gradient.js';

// sous forme de copie autonome, par le runtime exporté (voir export/runtimeSource.js).

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function applyEasing(t, easing) {
  switch (easing) {
    case 'easeIn': return t * t;
    case 'easeOut': return 1 - (1 - t) * (1 - t);
    case 'easeInOut': return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    default: return t; // linear
  }
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '#000000');
  if (!m) return { r: 0, g: 0, b: 0, a: 1 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16), a: 1 };
}

// 'transparent' (cf. TRANSPARENT dans core/model.js) = rgba(0,0,0,0) : on
// interpole aussi le canal alpha pour qu'un tween vers/depuis transparent
// fasse fondre la couleur au lieu de virer au noir.
function colorToRgba(c) {
  if (c === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  return hexToRgb(c);
}

function rgbToHex(r, g, b) {
  const c = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function lerpColor(hexA, hexB, t) {
  if (hexA === hexB) return hexA;
  const a = colorToRgba(hexA);
  const b = colorToRgba(hexB);
  const alpha = lerp(a.a, b.a, t);
  // Fondu vers/depuis transparent : on garde les canaux RGB de la couleur
  // OPAQUE (seul l'alpha descend) — sinon le rouge fondu à 50% deviendrait
  // rgba(128,0,0,0.5), un rouge sombre au lieu d'un rouge à moitié transparent.
  let r, g, bl;
  if (a.a === 0) { r = b.r; g = b.g; bl = b.b; }
  else if (b.a === 0) { r = a.r; g = a.g; bl = a.b; }
  else { r = lerp(a.r, b.r, t); g = lerp(a.g, b.g, t); bl = lerp(a.b, b.b, t); }
  if (alpha >= 1) return rgbToHex(r, g, bl);
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(bl)},${Math.round(alpha * 1000) / 1000})`;
}

// pivotX/pivotY (point de rotation déplaçable, cf. core/pivot.js) sont
// interpolables : un pivot qui bouge entre deux images clés déplace le
// centre de rotation pendant le tween, comme le registration point animé
// d'Animate. Absents d'un côté => pas d'interpolation de ce champ
// (typeof number requis des deux côtés).
const NUMERIC_PROPS = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity', 'width', 'height', 'pivotX', 'pivotY'];
const COLOR_PROPS = ['fill', 'stroke'];

function lerpHandle(h1, h2, t) {
  const a = h1 || { x: 0, y: 0 };
  const b = h2 || { x: 0, y: 0 };
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function lerpPoint(p, q, t) {
  return {
    x: lerp(p.x, q.x, t),
    y: lerp(p.y, q.y, t),
    cIn: (p.cIn || q.cIn) ? lerpHandle(p.cIn, q.cIn, t) : null,
    cOut: (p.cOut || q.cOut) ? lerpHandle(p.cOut, q.cOut, t) : null,
    smooth: p.smooth,
  };
}

// Interpolates a single element between its state in the start keyframe (`a`)
// and the matching element in the end keyframe (`b`). Falls back to `a` as-is
// for any property/element that has no counterpart to tween towards.
export function interpolateElement(a, b, t) {
  const out = JSON.parse(JSON.stringify(a));
  if (!b) return out;
  for (const p of NUMERIC_PROPS) {
    if (typeof a[p] === 'number' && typeof b[p] === 'number') {
      out[p] = lerp(a[p], b[p], t);
    }
  }
  for (const p of COLOR_PROPS) {
    if (typeof a[p] === 'string' && typeof b[p] === 'string') {
      out[p] = lerpColor(a[p], b[p], t);
    }
  }
  // Dégradé de remplissage : interpolé seulement si même type + même nombre de
  // stops des deux côtés (voir core/gradient.js).
  if (a.fillGradient && b.fillGradient) {
    out.fillGradient = lerpGradient(a.fillGradient, b.fillGradient, t, lerp, lerpColor);
  }
  // Morphing point à point : seulement si les deux courbes ont exactement
  // le même nombre de points (même index = points correspondants). Sinon
  // on garde les points de départ tels quels — la forme bouge alors comme
  // un bloc rigide via x/y/rotation/scale ci-dessus, sans se déformer.
  if (Array.isArray(a.points) && Array.isArray(b.points) && a.points.length === b.points.length && a.points.length > 0) {
    out.points = a.points.map((p, i) => lerpPoint(p, b.points[i], t));
  }
  // Maillage de déformation bitmap (cf. core/warp.js) : même discipline que
  // les points de courbe — on interpole les intersections seulement si la
  // structure du maillage (cols/rows) est identique des deux côtés.
  if (Array.isArray(a.warpPoints) && Array.isArray(b.warpPoints)
    && a.warp && b.warp && a.warp.cols === b.warp.cols && a.warp.rows === b.warp.rows
    && a.warpPoints.length === b.warpPoints.length && a.warpPoints.length > 0) {
    out.warpPoints = a.warpPoints.map((p, i) => ({
      x: lerp(p.x, b.warpPoints[i].x, t),
      y: lerp(p.y, b.warpPoints[i].y, t),
    }));
  }
  return out;
}
