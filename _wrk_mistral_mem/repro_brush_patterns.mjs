// Harnais patterns de pinceau — 9 motifs (round, flat, calligraphy, taper,
// pencil, marker, airbrush, drybrush, chalk) dans src/util/brushGeom.js :
//  - polygone valide pour un tracé de 10 points (>= 3 points, bbox > 0)
//  - DÉTERMINISME : deux appels identiques -> JSON identique (pas de Math.random)
//  - halfWidthAt borné dans [0, size/2] pour tous les patterns
//  - spécificités : taper s'amenuise aux bouts, drybrush s'épuise vers la fin,
//    calligraphy dépend de l'angle, pencil/chalk varient par index (grain),
//    marker quasi constant, airbrush fortement variable
//  - dab (1 point) valide pour les 9 patterns
//  - caps arrondis uniquement pour round/marker/airbrush (2n+16 points vs 2n)
// Run: node _wrk_mistral_mem/repro_brush_patterns.mjs
import { brushToPoly, halfWidthAt, bboxOf } from '../src/util/brushGeom.js';

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };

const PATTERNS = ['round', 'flat', 'calligraphy', 'taper', 'pencil', 'marker', 'airbrush', 'drybrush', 'chalk'];
const SIZE = 20;
const stroke = [];
for (let i = 0; i < 10; i++) stroke.push([100 + i * 15, 100 + Math.sin(i) * 20]);

for (const p of PATTERNS) {
  const r = brushToPoly(stroke, SIZE, p);
  ok(Array.isArray(r.points) && r.points.length >= 3, `${p}: polygone valide (${r.points.length} points)`);
  ok(r.w > 0 && r.h > 0, `${p}: bbox > 0 (${r.w.toFixed(1)}x${r.h.toFixed(1)})`);
  const r2 = brushToPoly(stroke, SIZE, p);
  ok(JSON.stringify(r.points) === JSON.stringify(r2.points), `${p}: déterministe (aperçu == trait final)`);

  // halfWidthAt borné dans [0, size/2 + eps]
  let bounded = true, mn = Infinity, mx = -Infinity;
  for (let i = 0; i <= 20; i++) {
    for (const ang of [0, Math.PI / 3, Math.PI / 2]) {
      const h = halfWidthAt(i / 20, ang, SIZE, p, i, 21);
      if (!(h >= -1e-9 && h <= SIZE / 2 + 1e-9)) bounded = false;
      mn = Math.min(mn, h); mx = Math.max(mx, h);
    }
  }
  ok(bounded, `${p}: halfWidthAt dans [0, size/2] (vu [${mn.toFixed(2)}, ${mx.toFixed(2)}])`);

  // dab (1 point)
  const d = brushToPoly([[50, 50]], SIZE, p);
  ok(d.w > 0 && d.h > 0 && d.points.length >= 3, `${p}: dab valide (${d.w.toFixed(1)}x${d.h.toFixed(1)})`);

  // caps : round/marker/airbrush -> 2n+16 points ; les autres -> 2n
  const n = stroke.length;
  const expect = (p === 'round' || p === 'marker' || p === 'airbrush') ? 2 * n + 14 : 2 * n; // capPts -> steps-1 = 7 points par cap
  ok(r.points.length === expect, `${p}: ${r.points.length} points (attendu ${expect}, caps ${expect > 2 * n ? 'arrondis' : 'droits'})`);
}

const half = SIZE / 2;
ok(halfWidthAt(0, 0, SIZE, 'taper') < halfWidthAt(0.5, 0, SIZE, 'taper'), 'taper: aminci aux extrémités');
ok(halfWidthAt(0.9, 0, SIZE, 'drybrush', 18, 20) < halfWidthAt(0.1, 0, SIZE, 'drybrush', 2, 20), 'drybrush: encre s\'épuise vers la fin');
ok(Math.abs(halfWidthAt(0.5, Math.PI / 4, SIZE, 'calligraphy') - halfWidthAt(0.5, Math.PI / 4 + Math.PI / 2, SIZE, 'calligraphy')) > half * 0.3, 'calligraphy: dépend de la direction (nib 45°)');
{
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < 30; i++) { const h = halfWidthAt(0.5, 0, SIZE, 'pencil', i, 30); mn = Math.min(mn, h); mx = Math.max(mx, h); }
  ok(mx - mn > half * 0.2, `pencil: grain par index (étendue ${(mx - mn).toFixed(2)})`);
}
{
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < 30; i++) { const h = halfWidthAt(0.5, 0, SIZE, 'chalk', i, 30); mn = Math.min(mn, h); mx = Math.max(mx, h); }
  ok(mx - mn > half * 0.15, `chalk: rugosité (étendue ${(mx - mn).toFixed(2)})`);
}
{
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i <= 40; i++) { const h = halfWidthAt(i / 40, 0, SIZE, 'marker', i, 41); mn = Math.min(mn, h); mx = Math.max(mx, h); }
  ok(mx - mn < half * 0.12, `marker: quasi constant (étendue ${(mx - mn).toFixed(2)})`);
}
{
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i <= 40; i++) { const h = halfWidthAt(i / 40, 0, SIZE, 'airbrush', i, 41); mn = Math.min(mn, h); mx = Math.max(mx, h); }
  ok(mx - mn > half * 0.3, `airbrush: bouffées marquées (étendue ${(mx - mn).toFixed(2)})`);
}

// non-régression : round inchangé (largeur constante = size/2, caps arrondis)
{
  let constW = true;
  for (let i = 0; i <= 20; i++) if (Math.abs(halfWidthAt(i / 20, 0.7, SIZE, 'round') - half) > 1e-9) constW = false;
  ok(constW, 'round: largeur constante size/2 (non-régression)');
  const r = brushToPoly(stroke, SIZE, 'round');
  ok(r.points.length === 2 * stroke.length + 14, 'round: caps arrondis (2n+14)');
}

console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
