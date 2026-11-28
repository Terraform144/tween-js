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

  if (pattern === 'copic') {
    // Marqueur alcool (style Copic/Sketchbook) : quasi constant, très légère ondulation
    return half * (0.92 + 0.08 * grain(i, 10));
  }

  if (pattern === 'ink') {
    // Encre à bavure : bords très irréguliers qui "mouillent"
    return half * (0.72 + 0.48 * grain(i, 11));
  }

  if (pattern === 'pastel') {
    // Pastel gras : poudreux doux, 70..100 % de la taille
    return half * (0.7 + 0.3 * grain(i, 12));
  }

  if (pattern === 'spray') {
    // Aérosol : bouffées très espacées et douces, 15..100 %
    const w = Math.abs(Math.sin(t * Math.PI * 5 + 1.3));
    return half * (0.15 + 0.85 * w * w * w);
  }

  if (pattern === 'highlighter') {
    // Surligneur : large bande plate à bords nets (alpha faible au rendu)
    return half * 1.6;
  }

  if (pattern === 'glow') {
    // Néon : core rond régulier — le halo vient du rendu (shadowBlur)
    return half;
  }

  if (pattern === 'hatch') {
    // Hachures : corps plein — le motif croisé vient du remplissage (pattern)
    return half;
  }

  return half; // round, flat, double, bristles (sous-lignes gérées ailleurs)
}

// Patterns dont les extrémités de trait sont arrondies (les autres sont droites)
const ROUND_CAPS = new Set(['round', 'marker', 'airbrush', 'copic', 'ink', 'pastel', 'spray', 'glow', 'highlighter']);

/* Effets de rendu vectoriels associés à un motif (100 % vectoriel, aucun raster) :
   alpha  = opacité du remplissage (copic/surligneur/aérosol translucides)
   glow   = halo néon (shadowBlur Konva / ctx.shadow en canvas 2D)
   hatch  = remplissage en hachures (pattern de lignes diagonales) */
export const PATTERN_FX = {
  copic:       { alpha: 0.55 },
  highlighter: { alpha: 0.35 },
  spray:       { alpha: 0.28 },
  pastel:      { alpha: 0.85 },
  ink:         { alpha: 0.92 },
  glow:        { glow: true, glowBlur: 12 },
  hatch:       { hatch: true },
};

// Mappe une pression brute (PointerEvent.pressure, 0..1 ; souris = 0.5) vers un
// facteur d'échelle de la demi-largeur. sens = sensibilité 0..1 (0 = off :
// on rend 1, la taille réglée reste exacte). Pleine pression -> 1, pression
// nulle -> 0.15 (le trait ne disparaît jamais complètement).
export function pressureToScale(p, sens) {
  const c = (typeof p === 'number' && !Number.isNaN(p)) ? Math.min(1, Math.max(0, p)) : 0.5;
  return (1 - sens) + sens * (0.15 + 0.85 * c);
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

  if (pattern === 'copic' || pattern === 'glow' || pattern === 'hatch') {
    return { points: ellipsePts(p[0], p[1], half, half, 0, 12) };
  }

  if (pattern === 'ink') {
    return { points: roughDisc(p[0], p[1], half * 0.85, 9, 11) };
  }

  if (pattern === 'pastel') {
    return { points: roughDisc(p[0], p[1], half * 0.85, 9, 12) };
  }

  if (pattern === 'spray') {
    return { points: ellipsePts(p[0], p[1], half * 1.2, half * 1.2, 0, 16) };
  }

  if (pattern === 'highlighter') {
    const w = half * 1.6, h = half * 0.55;
    return { points: [[p[0]-w, p[1]-h], [p[0]+w, p[1]-h], [p[0]+w, p[1]+h], [p[0]-w, p[1]+h]] };
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

/* Construit le contour (outline) d'une ligne centrale.
   rawPts: [[x,y],...] coordonnées absolues. size: taille du pinceau.
   ps(i): facteur de demi-largeur par point (pression). jitter: 0..1,
   variation déterministe de largeur à chaque point (grain par index).
   Retourne le tableau de points du contour (absolu). */
function strokeOutline(rawPts, size, pattern, ps, jitter = 0) {
  let pts = rawPts;
  if (pts.length > 2) pts = smoothPoints(pts, 2);

  // Cas spécial : un seul point (dab)
  if (pts.length === 1 || (pts.length === 2 && dist(pts[0], pts[1]) < 2)) {
    return dabShape(pts[0], size * ps(0), pattern).points;
  }

  const n = pts.length;
  const left = [], right = [], hw = new Array(n);
  const jit = Math.max(0, Math.min(1, jitter || 0));

  // Calculer les points gauche et droite pour chaque point du trait
  for (let i = 0; i < n; i++) {
    const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(n - 1, i + 1)];
    const d = norm([next[0] - prev[0], next[1] - prev[1]]);
    let h = halfWidthAt(i / (n - 1), Math.atan2(d[1], d[0]), size, pattern, i, n) * ps(i);
    if (jit > 0) h *= 1 + jit * (grain(i, 21) - 0.5) * 1.6; // jitter déterministe
    hw[i] = h;
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

  return outline;
}

/* Contour d'une sous-ligne parallèle, décalée de `offset` le long de la
   normale à la ligne centrale, avec sa propre demi-largeur (size réduit).
   Utilisé par les motifs multi-traits : double, bristles. */
function shiftedOutline(rawPts, size, offset, ps, jitter = 0, salt = 0) {
  let pts = rawPts;
  if (pts.length > 2) pts = smoothPoints(pts, 2);

  if (pts.length === 1 || (pts.length === 2 && dist(pts[0], pts[1]) < 2)) {
    return dabShape([pts[0][0] + offset, pts[0][1]], size * ps(0), 'round').points;
  }

  const n = pts.length;
  const left = [], right = [], hw = new Array(n);
  const jit = Math.max(0, Math.min(1, jitter || 0));

  for (let i = 0; i < n; i++) {
    const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(n - 1, i + 1)];
    const d = norm([next[0] - prev[0], next[1] - prev[1]]);
    let h = (size / 2) * ps(i);
    if (jit > 0) h *= 1 + jit * (grain(i, 22 + salt) - 0.5) * 1.6;
    hw[i] = h;
    const nv = [-d[1], d[0]];
    left.push([pts[i][0] + nv[0] * (offset + hw[i]), pts[i][1] + nv[1] * (offset + hw[i])]);
    right.push([pts[i][0] + nv[0] * (offset - hw[i]), pts[i][1] + nv[1] * (offset - hw[i])]);
  }

  const outline = left.slice();
  const dEnd = norm([pts[n - 1][0] - pts[n - 2][0], pts[n - 1][1] - pts[n - 2][1]]);
  const nvEnd = [-dEnd[1], dEnd[0]];
  const cEnd = [pts[n - 1][0] + nvEnd[0] * offset, pts[n - 1][1] + nvEnd[1] * offset];
  outline.push(...capPts(cEnd, dEnd, hw[n - 1], 6));
  for (let i = n - 1; i >= 0; i--) outline.push(right[i]);
  const dStart = norm([pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]]);
  const nvStart = [-dStart[1], dStart[0]];
  const cStart = [pts[0][0] + nvStart[0] * offset, pts[0][1] + nvStart[1] * offset];
  outline.push(...capPts(cStart, [-dStart[0], -dStart[1]], hw[0], 6));
  return outline;
}

/* rawPts: [[x,y],...] absolute stage coordinates (>= 1 point).
   pressureScale (optionnel) : facteur de demi-largeur par point (0..1+),
   typiquement produit par pressureToScale — null = taille fixe historique.
   Returns { points: outline (absolute), w, h, cx, cy } */
export function brushToPoly(rawPts, size, pattern = 'round', pressureScale = null) {
  pattern = pattern || 'round';
  size = Math.max(1, size);
  const ps = (i) => (pressureScale && pressureScale[i] != null) ? pressureScale[i] : 1;
  const points = strokeOutline(rawPts, size, pattern, ps, 0);
  return Object.assign({ points }, bboxOf(points));
}

/* Variante multi-polygones de brushToPoly : certains motifs (double, bristles)
   produisent plusieurs contours parallèles. jitter (0..1) ajoute une variation
   déterministe de largeur point par point.
   Returns { polys: [{ points, w, h, cx, cy }, ...], w, h, cx, cy } (bbox globale) */
export function brushToPolys(rawPts, size, pattern = 'round', pressureScale = null, jitter = 0) {
  pattern = pattern || 'round';
  size = Math.max(1, size);
  const ps = (i) => (pressureScale && pressureScale[i] != null) ? pressureScale[i] : 1;

  let outlines;
  if (pattern === 'double') {
    // Double trait : deux lignes parallèles fines de part et d'autre du centre
    outlines = [-size * 0.55, size * 0.55].map(off => shiftedOutline(rawPts, size * 0.28, off, ps, jitter, 0));
  } else if (pattern === 'bristles') {
    // Poils (bristles) : 5 traits fins en éventail autour de la ligne centrale
    outlines = [-0.4, -0.2, 0, 0.2, 0.4].map((o, k) => shiftedOutline(rawPts, size * 0.22, size * o, ps, jitter, k + 1));
  } else {
    outlines = [strokeOutline(rawPts, size, pattern, ps, jitter)];
  }

  const polys = outlines.map(points => Object.assign({ points }, bboxOf(points)));
  // Bounding box globale
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const p of polys) {
    minx = Math.min(minx, p.cx - p.w / 2); maxx = Math.max(maxx, p.cx + p.w / 2);
    miny = Math.min(miny, p.cy - p.h / 2); maxy = Math.max(maxy, p.cy + p.h / 2);
  }
  return { polys, w: maxx - minx, h: maxy - miny, cx: (minx + maxx) / 2, cy: (miny + maxy) / 2 };
}

// Longueur totale d'un polyline [[x,y],...]
function polyLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  return L;
}

// Point à l'abscisse curviligne s sur le polyline
function pointAtArc(pts, s) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = dist(pts[i - 1], pts[i]);
    if (acc + seg >= s && seg > 0) {
      const t = (s - acc) / seg;
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
    }
    acc += seg;
  }
  return pts[pts.length - 1].slice();
}

/* Éclaboussures (spatter) autour du tracé principal.
   corePts : points centraux du tracé (absolus). size : taille du pinceau.
   intensity : 0..1 (0 = aucune goutte). Retourne [{dx,dy,r}] relatifs au
   centre (cx,cy) du tracé, déterministes (grain par index, jamais Math.random
   sinon l'aperçu et le trait final différeraient). */
export function spatterDots(corePts, size, intensity, salt = 7) {
  const inten = Math.max(0, Math.min(1, intensity || 0));
  if (inten <= 0 || !corePts || corePts.length === 0) return [];
  const L = polyLength(corePts);
  const bb = bboxOf(corePts);
  const cx = bb.cx, cy = bb.cy;
  // densité : ~1 goutte tous les size/2 px le long du tracé, modulée par l'intensité
  const count = Math.round((L / Math.max(3, size * 0.5)) * inten * 2.5);
  const dots = [];
  for (let k = 0; k < count; k++) {
    const s = grain(k, salt) * L;                 // position le long du tracé
    const p = pointAtArc(corePts, s);
    const off = (0.55 + 2.2 * grain(k, salt + 1)) * size; // distance au core
    const ang = grain(k, salt + 2) * Math.PI * 2;
    const r = Math.max(0.4, (0.35 + grain(k, salt + 3) * 0.9) * size * 0.16 * (0.4 + inten));
    dots.push({ dx: p[0] + Math.cos(ang) * off - cx, dy: p[1] + Math.sin(ang) * off - cy, r });
  }
  return dots;
}

export { smoothPoints, halfWidthAt };
