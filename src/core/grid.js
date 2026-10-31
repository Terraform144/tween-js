// Grille + snap + règles/guides de la scène — logique pure, testable en Node.
// state.grid = { visible, spacing, snap, rulers } (prefs 'gridPrefs').
// doc.guides = { v: [x...], h: [y...] } — guides tirés depuis les règles (px scène, persistés).

export function defaultGrid() {
  return { visible: false, spacing: 10, snap: false, rulers: true };
}

export function sanitizeGrid(g) {
  const d = defaultGrid();
  if (!g || typeof g !== 'object') return d;
  return {
    visible: !!g.visible,
    spacing: Math.max(2, Math.min(500, Math.round(+g.spacing) || d.spacing)),
    snap: !!g.snap,
    rulers: g.rulers == null ? true : !!g.rulers,
  };
}

// Guide le plus proche d'une coordonnée, dans la tolérance (null si aucun).
export function nearestGuide(list, v, tol = 6) {
  if (!list || !list.length) return null;
  let best = null, bestD = tol;
  for (const p of list) {
    const d = Math.abs(p - v);
    if (d <= bestD) { best = p; bestD = d; }
  }
  return best;
}

// Aimantation sur la grille : arrondi au multiple de spacing le plus proche.
export function snapValue(v, spacing) {
  if (!spacing || spacing <= 0) return v;
  return Math.round(v / spacing) * spacing;
}

export function snapPoint(p, spacing) {
  return { x: snapValue(p.x, spacing), y: snapValue(p.y, spacing) };
}

// Coordonnées des lignes de la grille sur un document w x h.
export function gridLines(w, h, spacing) {
  const xs = [], ys = [];
  if (!spacing || spacing <= 0) return { xs, ys };
  for (let x = 0; x <= w; x += spacing) xs.push(x);
  for (let y = 0; y <= h; y += spacing) ys.push(y);
  return { xs, ys };
}

// Pas de graduation des règles : le plus petit pas (10/25/50/100/250/500/1000)
// tel que pas * scale >= minPx à l'écran.
export function rulerStep(scale, minPx = 50) {
  const steps = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
  for (const s of steps) if (s * scale >= minPx) return s;
  return steps[steps.length - 1];
}

// --- guides (persistés dans doc.guides) ---
export function addGuide(doc, orientation, pos) {
  doc.guides = doc.guides || { v: [], h: [] };
  const list = orientation === 'v' ? doc.guides.v : doc.guides.h;
  const p = Math.round(pos * 10) / 10;
  if (!list.includes(p)) { list.push(p); list.sort((a, b) => a - b); }
  return p;
}

export function removeGuide(doc, orientation, pos) {
  if (!doc.guides) return false;
  const list = orientation === 'v' ? doc.guides.v : doc.guides.h;
  const i = list.indexOf(pos);
  if (i < 0) return false;
  list.splice(i, 1);
  return true;
}

export function guideAt(doc, orientation, pos, tol = 6) {
  if (!doc.guides) return null;
  const list = orientation === 'v' ? doc.guides.v : doc.guides.h;
  return list.find((p) => Math.abs(p - pos) <= tol) ?? null;
}
