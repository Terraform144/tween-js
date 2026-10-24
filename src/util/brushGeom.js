/* Brush geometry: converts a raw stroke into a variable-width outline polygon.
   Implements 4 patterns: round, flat, calligraphy, taper
   Based on __IIB.v.3/brush.js */

export function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function norm(v) {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
}

// Lissage des points par moyenne mobile
function smoothPoints(pts, passes) {
  let p = pts.slice();
  for (let k = 0; k < (passes || 2); k++) {
    const q = [p[0]];
    for (let i = 1; i < p.length - 1; i++) {
      q.push([
        (p[i - 1][0] + p[i][0] * 2 + p[i + 1][0]) / 4,
        (p[i - 1][1] + p[i][1] * 2 + p[i + 1][1]) / 4
      ]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}

// Calcule la demi-épaisseur à une position donnée selon le pattern
function halfWidthAt(t, dirAngle, size, pattern) {
  const half = size / 2;
  
  if (pattern === 'calligraphy') {
    const nib = Math.PI / 4; // 45 degree nib angle
    return Math.max(size * 0.08, half * (0.25 + 0.75 * Math.abs(Math.sin(dirAngle - nib))));
  }
  
  if (pattern === 'taper') {
    // ramp in/out over 40% of the stroke (20% at start, 20% at end)
    const e = Math.min(1, 2.5 * Math.min(t, 1 - t));
    return half * Math.min(1, e);
  }
  
  return half; // round, flat
}

// Génère des points pour un demi-cercle (pour les extrémités arrondies)
function capPts(E, d, r, steps) {
  const n = [-d[1], d[0]]; // vecteur normal
  const a0 = Math.atan2(n[1], n[0]);
  const pts = [];
  
  for (let k = 1; k < steps; k++) {
    const a = a0 - Math.PI * k / steps;
    pts.push([E[0] + r * Math.cos(a), E[1] + r * Math.sin(a)]);
  }
  return pts;
}

// Génère des points pour une ellipse
function ellipsePts(cx, cy, rx, ry, rot, steps) {
  const pts = [];
  for (let k = 0; k < steps; k++) {
    const t = 2 * Math.PI * k / steps;
    const ex = rx * Math.cos(t), ey = ry * Math.sin(t);
    const c = Math.cos(rot), s = Math.sin(rot);
    pts.push([
      cx + ex * c - ey * s,
      cy + ex * s + ey * c
    ]);
  }
  return pts;
}

// Forme de base pour un point unique (dab)
function dabShape(p, size, pattern) {
  const half = size / 2;
  
  if (pattern === 'flat') {
    return {
      points: [
        [p[0] - half, p[1] - half],
        [p[0] + half, p[1] - half],
        [p[0] + half, p[1] + half],
        [p[0] - half, p[1] + half]
      ]
    };
  }
  
  if (pattern === 'calligraphy') {
    return { points: ellipsePts(p[0], p[1], half, Math.max(half * 0.3, 1), -Math.PI / 4, 12) };
  }
  
  if (pattern === 'taper') {
    return { points: ellipsePts(p[0], p[1], half / 2, half / 2, 0, 10) };
  }
  
  // round (défaut)
  return { points: ellipsePts(p[0], p[1], half, half, 0, 12) };
}

// Calcule la bounding box d'une série de points
export function bboxOf(pts) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const minx = Math.min(...xs), maxx = Math.max(...xs);
  const miny = Math.min(...ys), maxy = Math.max(...ys);
  return {
    minx, maxx, miny, maxy,
    w: maxx - minx,
    h: maxy - miny,
    cx: (minx + maxx) / 2,
    cy: (miny + maxy) / 2
  };
}

/* rawPts: [[x,y],...] absolute stage coordinates (>= 1 point).
   Returns { points: outline (absolute), w, h, cx, cy } */
export function brushToPoly(rawPts, size, pattern = 'round') {
  pattern = pattern || 'round';
  size = Math.max(1, size);
  
  let pts = rawPts;
  if (pts.length > 2) pts = smoothPoints(pts, 2);
  
  // Cas spécial : un seul point (dab)
  if (pts.length === 1 || (pts.length === 2 && dist(pts[0], pts[1]) < 2)) {
    const d = dabShape(pts[0], size, pattern);
    return Object.assign(d, bboxOf(d.points));
  }

  const n = pts.length;
  const left = [], right = [], hw = new Array(n);
  
  // Calculer les points gauche et droite pour chaque point du trait
  for (let i = 0; i < n; i++) {
    const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(n - 1, i + 1)];
    const d = norm([next[0] - prev[0], next[1] - prev[1]]);
    hw[i] = halfWidthAt(i / (n - 1), Math.atan2(d[1], d[0]), size, pattern);
    const nv = [-d[1], d[0]]; // vecteur normal à gauche
    left.push([pts[i][0] + nv[0] * hw[i], pts[i][1] + nv[1] * hw[i]]);
    right.push([pts[i][0] - nv[0] * hw[i], pts[i][1] - nv[1] * hw[i]]);
  }

  const outline = left.slice();
  
  // Pour le pattern round, ajouter les extrémités arrondies
  if (pattern === 'round') {
    const dEnd = norm([pts[n - 1][0] - pts[n - 2][0], pts[n - 1][1] - pts[n - 2][1]]);
    outline.push(...capPts(pts[n - 1], dEnd, hw[n - 1], 8));
    for (let i = n - 1; i >= 0; i--) outline.push(right[i]);
    const dStart = norm([pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]]);
    outline.push(...capPts(pts[0], [-dStart[0], -dStart[1]], hw[0], 8));
  } else {
    // Pour les autres patterns, simplement ajouter les points droits dans l'ordre inverse
    for (let i = n - 1; i >= 0; i--) outline.push(right[i]);
  }

  return Object.assign({ points: outline }, bboxOf(outline));
}

export { smoothPoints, halfWidthAt };
