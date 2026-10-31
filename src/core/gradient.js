// Dégradés de remplissage (linéaire / radial), façon Animate CC.
// Modèle : el.fillGradient = { type, ..., stops: [{offset, color}] } | null.
// - coordonnées (x1,y1,x2,y2) pour linéaire, (cx,cy,r) pour radial : fractions
//   0..1 de la BOÎTE englobante de l'élément (r = fraction de la largeur).
// - stops : offset 0..1 + color (hex ou 'transparent', cf. TRANSPARENT).
// Quand fillGradient est posé, il prime sur el.fill pour le remplissage.
// Logique pure (pas de DOM/Konva) : testable en Node.

export function defaultGradient(el) {
  return {
    type: 'linear',
    x1: 0, y1: 0, x2: 1, y2: 0,
    stops: [
      { offset: 0, color: (el && el.fill) || '#cb4b16' },
      { offset: 1, color: '#ffffff' },
    ],
  };
}

export function sanitizeGradient(g) {
  if (!g || typeof g !== 'object') return null;
  const type = g.type === 'radial' ? 'radial' : 'linear';
  const clamp01 = (v, d) => Math.max(0, Math.min(1, Number.isFinite(+v) ? +v : d));
  let stops = Array.isArray(g.stops) ? g.stops.map((s) => ({
    offset: clamp01(s && s.offset, 0),
    color: (s && typeof s.color === 'string' && s.color) ? s.color : '#000000',
  })) : [];
  if (!stops.length) stops = [{ offset: 0, color: '#000000' }, { offset: 1, color: '#ffffff' }];
  stops.sort((a, b) => a.offset - b.offset);
  const out = { type, stops };
  if (type === 'radial') {
    out.cx = clamp01(g.cx, 0.5); out.cy = clamp01(g.cy, 0.5); out.r = Math.max(0.01, clamp01(g.r, 0.5));
  } else {
    out.x1 = clamp01(g.x1, 0); out.y1 = clamp01(g.y1, 0); out.x2 = clamp01(g.x2, 1); out.y2 = clamp01(g.y2, 0);
  }
  return out;
}

// Boîte englobante de l'élément dans le repère LOCAL du node Konva éditeur
// (celui du sceneFunc, avant offset) — sert à placer les points du dégradé.
export function elementLocalBoxKonva(el, renderedHeight = null) {
  if (el.kind === 'bitmap' || el.shapeType === 'rect') {
    return { x: 0, y: 0, w: el.width || 0, h: el.height || 0 };
  }
  if (el.shapeType === 'ellipse') {
    // Konva.Ellipse est centré en local (0,0)
    return { x: -(el.width || 0) / 2, y: -(el.height || 0) / 2, w: el.width || 0, h: el.height || 0 };
  }
  if (el.shapeType === 'text') {
    return { x: 0, y: 0, w: el.width || 0, h: renderedHeight || el.height || (el.fontSize || 24) * 1.2 };
  }
  // line / path : boîte des points (relatifs à el.x/el.y)
  const pts = el.points || [];
  if (!pts.length) return { x: 0, y: 0, w: 0, h: 0 };
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

// Repère local du runtime exporté (drawShape centre rect/ellipse/bitmap/texte
// en -w/2,-h/2 ; path identique à l'éditeur). Copie autonome côté runtime.
export function elementLocalBoxRuntime(el, renderedHeight = null) {
  const b = elementLocalBoxKonva(el, renderedHeight);
  if (el.kind === 'bitmap' || el.shapeType === 'rect' || el.shapeType === 'ellipse' || el.shapeType === 'text') {
    return { x: b.x - b.w / 2, y: b.y - b.h / 2, w: b.w, h: b.h };
  }
  return b;
}

export function gradientPoint(box, fx, fy) {
  return { x: box.x + fx * box.w, y: box.y + fy * box.h };
}

// Interpolation de deux dégradés (tween) : même type + même nombre de stops,
// sinon on garde celui de départ (pas de fondu croisé). Les couleurs passent
// par lerpColor (donc 'transparent' -> fondu d'alpha, cf. session 20).
export function lerpGradient(a, b, t, lerp, lerpColor) {
  if (!a || !b || a.type !== b.type) return a;
  const sa = a.stops || [], sb = b.stops || [];
  if (sa.length !== sb.length || !sa.length) return t < 0.5 ? a : b;
  const stops = sa.map((s, i) => ({
    offset: lerp(s.offset, sb[i].offset, t),
    color: lerpColor(s.color, sb[i].color, t),
  }));
  if (a.type === 'radial') {
    return { type: 'radial', cx: lerp(a.cx, b.cx, t), cy: lerp(a.cy, b.cy, t), r: lerp(a.r, b.r, t), stops };
  }
  return { type: 'linear', x1: lerp(a.x1, b.x1, t), y1: lerp(a.y1, b.y1, t), x2: lerp(a.x2, b.x2, t), y2: lerp(a.y2, b.y2, t), stops };
}
