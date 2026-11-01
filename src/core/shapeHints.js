// Shape hints pour le morphing (façon Animate CC) — logique PURE, testable Node.
//
// Modèle : un élément path/line porte `shapeHints: [{ id, pointIndex }]`
// (champ optionnel, rétrocompatible). Une paire de hints = même `id` présent
// sur l'élément de la keyframe de départ ET sur celui de la keyframe d'arrivée
// (les éléments sont appariés par id entre keyframes, voir playback/resolve.js).
//
// computePointMatch retourne la permutation des points de b :
// match[i] = index dans b.points correspondant à a.points[i].
// - pas de hints communs (ou nombres de points différents) -> null
//   (l'appelant retombe sur l'appariement par index historique).
// - sinon : les hints alignent les points ; entre deux hints consécutifs, les
//   points restants sont répartis PROPORTIONNELLEMENT dans l'ordre circulaire
//   (même sens), comme Animate.

// Nettoie une liste de hints : clamp de pointIndex, ids string, dédoublonnage
// (même id gardé une fois, premier arrivé).
export function sanitizeHints(hints, pointCount) {
  if (!Array.isArray(hints)) return [];
  const seen = new Set();
  const out = [];
  for (const h of hints) {
    if (!h || typeof h.id !== 'string' || !h.id || seen.has(h.id)) continue;
    let idx = h.pointIndex | 0;
    if (pointCount > 0) idx = Math.max(0, Math.min(pointCount - 1, idx));
    seen.add(h.id);
    out.push({ id: h.id, pointIndex: idx });
  }
  return out;
}

// Prochain id libre ("h1", "h2", ...) pour l'UI.
export function nextHintId(hints) {
  const used = new Set((hints || []).map((h) => h.id));
  let i = 1;
  while (used.has('h' + i)) i++;
  return 'h' + i;
}

// match[i] = index dans b correspondant à a[i], ou null si pas de hints communs.
export function computePointMatch(aPoints, bPoints, aHints, bHints) {
  const n = aPoints.length, m = bPoints.length;
  if (!n || n !== m) return null; // v1 : même nombre de points requis
  const pairs = [];
  for (const ha of aHints || []) {
    const hb = (bHints || []).find((h) => h.id === ha.id);
    if (hb && ha.pointIndex >= 0 && ha.pointIndex < n && hb.pointIndex >= 0 && hb.pointIndex < m) {
      pairs.push([ha.pointIndex, hb.pointIndex]);
    }
  }
  if (!pairs.length) return null;
  pairs.sort((p, q) => p[0] - q[0]);
  const match = new Array(n).fill(-1);
  for (const [ia, ib] of pairs) match[ia] = ib;
  // Les points non hintés sont mis en correspondance 1 à 1 dans l'ORDRE
  // CIRCULAIRE global, en partant du premier hint des deux côtés : bijection
  // garantie (n === m, k hints retirés des deux listes), et l'ordre relatif
  // imposé par les hints est respecté (les segments entre hints restent
  // dans le même sens). C'est l'esprit des shape hints d'Animate.
  const usedB = new Set(pairs.map((p) => p[1]));
  const restA = [];
  for (let s = 0; s < n; s++) { const ia = (pairs[0][0] + s) % n; if (match[ia] === -1) restA.push(ia); }
  const restB = [];
  for (let s = 0; s < m; s++) { const ib = (pairs[0][1] + s) % m; if (!usedB.has(ib)) restB.push(ib); }
  for (let i = 0; i < restA.length; i++) match[restA[i]] = restB[i];
  return match;
}
