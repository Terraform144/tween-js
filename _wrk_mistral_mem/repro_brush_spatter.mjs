// Harnais spatterDots (géométrie pure) — déterminisme, bornes, intensité 0.
import { spatterDots, brushToPoly, bboxOf } from '../src/util/brushGeom.js';

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };

const core = [[0, 0], [50, 0], [100, 10], [150, 0]];

// intensité 0 -> aucune goutte
const d0 = spatterDots(core, 10, 0);
ok(Array.isArray(d0) && d0.length === 0, 'intensité 0 = 0 goutte');

// intensité max -> des gouttes
const d1 = spatterDots(core, 10, 1);
ok(d1.length > 5, `intensité 1 = ${d1.length} gouttes (>5)`);

// déterminisme : 2 appels identiques
const d2 = spatterDots(core, 10, 0.7);
const d3 = spatterDots(core, 10, 0.7);
ok(JSON.stringify(d2) === JSON.stringify(d3), 'déterministe (2 appels -> JSON identique)');

// bornes : r > 0, gouttes proches du tracé (pas à des kilomètres)
const bb = bboxOf(core);
let allNear = true, allR = true;
for (const d of d2) {
  if (!(d.r > 0)) allR = false;
  const ax = d.dx + bb.cx, ay = d.dy + bb.cy;
  // distance au core < size * 4
  let minD = Infinity;
  for (let i = 1; i < core.length; i++) {
    const [x1, y1] = core[i - 1], [x2, y2] = core[i];
    const dx = x2 - x1, dy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((ax - x1) * dx + (ay - y1) * dy) / (dx * dx + dy * dy || 1)));
    minD = Math.min(minD, Math.hypot(ax - (x1 + t * dx), ay - (y1 + t * dy)));
  }
  if (minD > 10 * 4) allNear = false;
}
ok(allR, 'tous les rayons r > 0');
ok(allNear, 'gouttes proches du tracé (< 4x la taille)');

// plus d'intensité -> plus de gouttes (ou égal)
ok(d1.length >= d2.length, `intensité 1 (${d1.length}) >= intensité 0.7 (${d2.length})`);

// core vide / un point -> pas de crash
const d4 = spatterDots([], 10, 1);
ok(Array.isArray(d4) && d4.length === 0, 'core vide = 0 goutte, pas de crash');
const d5 = spatterDots([[5, 5]], 10, 1);
ok(Array.isArray(d5), 'core à 1 point = ok (pas de crash)');

// non-régression brushToPoly
ok(brushToPoly([[0, 0], [10, 0], [20, 5]], 8, 'round').points.length > 4, 'brushToPoly round inchangé');

console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
