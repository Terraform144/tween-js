// Fonctions d'interpolation pures — partagées par l'éditeur (Stage) et,
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
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function rgbToHex(r, g, b) {
  const c = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function lerpColor(hexA, hexB, t) {
  if (hexA === hexB) return hexA;
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return rgbToHex(lerp(a.r, b.r, t), lerp(a.g, b.g, t), lerp(a.b, b.b, t));
}

// Une "peinture" est soit une couleur unie (string hex), soit un objet
// dégradé { type, angle?, stops }. L'interpolation mélange les arrêts
// correspondants (même type + même nombre d'arrêts requis), sinon on retombe
// sur l'état de départ (forme rigide). À répercuter dans tweenRuntime.js.
function isGradient(p) {
  return !!(p && typeof p === 'object' && (p.type === 'linear' || p.type === 'radial') && Array.isArray(p.stops));
}

export function lerpPaint(a, b, t) {
  if (isGradient(a) && isGradient(b) && a.type === b.type && a.stops.length === b.stops.length) {
    return {
      type: a.type,
      angle: a.angle,
      stops: a.stops.map((s, i) => ({
        offset: lerp(s.offset, b.stops[i].offset, t),
        color: lerpColor(s.color, b.stops[i].color, t),
      })),
    };
  }
  if (typeof a === 'string' && typeof b === 'string') return lerpColor(a, b, t);
  return a;
}

const NUMERIC_PROPS = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity', 'width', 'height'];
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
    out[p] = lerpPaint(a[p], b[p], t);
  }
  // Morphing point à point : seulement si les deux courbes ont exactement
  // le même nombre de points (même index = points correspondants). Sinon
  // on garde les points de départ tels quels — la forme bouge alors comme
  // un bloc rigide via x/y/rotation/scale ci-dessus, sans se déformer.
  if (Array.isArray(a.points) && Array.isArray(b.points) && a.points.length === b.points.length && a.points.length > 0) {
    out.points = a.points.map((p, i) => lerpPoint(p, b.points[i], t));
  }
  return out;
}
