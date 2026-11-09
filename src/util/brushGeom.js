/* Brush geometry: converts a raw stroke into a variable-width outline polygon.
   Implements 9 patterns: round, flat, calligraphy, taper, pencil, marker,
   airbrush, drybrush, chalk
   Based on __IIB.v.3/brush.js */

// Bruit déterministe par index : JAMAIS de Math.random ici, sinon l'aperçu
// et le trait final différeraient (brushToPoly est rappelé à chaque rendu).
function grain(i, salt = 0) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x); // fract -> [0,1)
}

// Disque rugueux (dab de crayon/craie/pinceau sec)
function roughDisc(cx, cy, r, steps, salt) {
  const pts = [];
  for (let k = 0; k < steps; k++) {
    const a = (2 * Math.PI * k) / steps;
    const rr = r * (0.7 + 0.5 * grain(k, salt));
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
  return pts;
}

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

// Calcule la demi-épaisseur à une position donnée selon le pattern.
// i/n (index du point dans le tracé) alimentent le grain déterministe des
// patterns texturés (pencil, drybrush, chalk).
function halfWidthAt(t, dirAngle, size, pattern, i = 0, n = 1) {
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

  if (pattern === 'pencil') {
    // Crayon : grain fort, bords rugueux, largeur 50..100 % de la taille
    return half * (0.5 + 0.5 * grain(i, 1));
  }

  if (pattern === 'marker') {
    // Marqueur : quasi constant avec une légère ondulation régulière
    return half * (0.95 + 0.05 * Math.sin(t * Math.PI * 6));
  }

  if (pattern === 'airbrush') {
    // Aérographe : bouffées douces, largeur 30..100 %, aspect diffus
    const w = Math.abs(Math.sin(t * Math.PI * 2.5 + 0.7));
    return half * (0.3 + 0.7 * w * w);
  }

  if (pattern === 'drybrush') {
    // Pinceau sec : l'encre s'épuise le long du trait, bords dentelés
    return half * (1 - 0.65 * t) * (0.45 + 0.55 * grain(i, 2));
  }

  if (pattern === 'chalk') {
    // Craie : poudreux, forte rugosité, 65..100 % de la taille
    return half * (0.65 + 0.35 * grain(i, 3));
  }

  return half; // round, flat
}

// Patterns dont les extrémités de trait sont arrondies (les autres sont droites)
const ROUND_CAPS = new Set(['round', 'marker', 'airbrush']);

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

  if (pattern === 'pencil') {
    return { points: roughDisc(p[0], p[1], half * 0.7, 8, 4) };
  }

  if (pattern === 'marker') {
    return { points: ellipsePts(p[0], p[1], half, half, 0, 12) };
  }

  if (pattern === 'airbrush') {
    return { points: ellipsePts(p[0], p[1], half, half * 0.85, 0, 14) };
  }

  if (pattern === 'drybrush') {
    return { points: roughDisc(p[0], p[1], half * 0.5, 7, 5) };
  }

  if (pattern === 'chalk') {
    return { points: roughDisc(p[0], p[1], half, 9, 6) };
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
    hw[i] = halfWidthAt(i / (n - 1), Math.atan2(d[1], d[0]), size, pattern, i, n);
    const nv = [-d[1], d[0]]; // vecteur normal à gauche
    left.push([pts[i][0] + nv[0] * hw[i], pts[i][1] + nv[1] * hw[i]]);
    right.push([pts[i][0] - nv[0] * hw[i], pts[i][1] - nv[1] * hw[i]]);
  }

  const outline = left.slice();
  
  // Pour les patterns à extrémités arrondies, ajouter les caps
  if (ROUND_CAPS.has(pattern)) {
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
