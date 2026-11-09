// Harnais pression du pinceau — pressureToScale + 4e param pressureScale de
// brushToPoly (src/util/brushGeom.js) :
//  - pressureToScale : p=1,sens=1 -> 1 ; p=0,sens=1 -> 0.15 ; sens=0 -> 1 (off) ;
//    clamp de p hors [0,1] ; p non nombre -> 0.5
//  - rétrocompat : brushToPoly(pts,size,pattern) === brushToPoly(pts,size,pattern,null)
//  - trait droit horizontal : hauteur = size * scale (round, largeur constante)
//  - dab (1 point) : largeur modulée par pressureScale[0]
//  - déterminisme avec pressureScale
// Run: node _wrk_mistral_mem/repro_brush_pressure.mjs
import { brushToPoly, pressureToScale } from '../src/util/brushGeom.js';

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

ok(near(pressureToScale(1, 1), 1, 1e-9), 'pressureToScale(1,1) = 1 (pleine pression = taille pleine)');
ok(near(pressureToScale(0, 1), 0.15, 1e-9), 'pressureToScale(0,1) = 0.15 (jamais nul)');
ok(near(pressureToScale(0.5, 0), 1, 1e-9), 'pressureToScale(0.5,0) = 1 (sensibilité 0 = off)');
ok(near(pressureToScale(5, 1), 1, 1e-9) && near(pressureToScale(-2, 1), 0.15, 1e-9), 'clamp de p hors [0,1]');
ok(near(pressureToScale(NaN, 1), pressureToScale(0.5, 1), 1e-9), 'p non nombre -> 0.5 (souris)');
ok(near(pressureToScale(0.8, 0.5), 0.5 + 0.5 * (0.15 + 0.85 * 0.8), 1e-9), 'mapping linéaire intermédiaire');

const SIZE = 20;
const line = [];
for (let i = 0; i < 10; i++) line.push([100 + i * 15, 200]); // trait droit horizontal

const r0 = brushToPoly(line, SIZE, 'round');
const rNull = brushToPoly(line, SIZE, 'round', null);
ok(JSON.stringify(r0.points) === JSON.stringify(rNull.points), 'rétrocompat : 4e param null = appel historique identique');

const rHalf = brushToPoly(line, SIZE, 'round', line.map(() => 0.5));
ok(near(rHalf.h, r0.h * 0.5, 0.5), `trait droit : hauteur modulée (h=${rHalf.h.toFixed(2)} vs ${r0.h.toFixed(2)} sans scale, ratio attendu 0.5)`);

const rVar = brushToPoly(line, SIZE, 'round', line.map((_, i) => (i % 2 ? 1 : 0.2)));
const rVar2 = brushToPoly(line, SIZE, 'round', line.map((_, i) => (i % 2 ? 1 : 0.2)));
ok(JSON.stringify(rVar.points) === JSON.stringify(rVar2.points), 'déterministe avec pressureScale variable');
ok(rVar.h > rHalf.h, `pression variable : trait plus épais que constant 0.5 (${rVar.h.toFixed(2)} > ${rHalf.h.toFixed(2)})`);

const d1 = brushToPoly([[50, 50]], SIZE, 'round');
const dHalf = brushToPoly([[50, 50]], SIZE, 'round', [0.5]);
ok(near(dHalf.w, d1.w * 0.5, 0.5), `dab : largeur modulée (w=${dHalf.w.toFixed(2)} vs ${d1.w.toFixed(2)})`);

// les autres patterns acceptent aussi pressureScale sans erreur
for (const p of ['flat', 'calligraphy', 'taper', 'pencil', 'marker', 'airbrush', 'drybrush', 'chalk']) {
  const r = brushToPoly(line, SIZE, p, line.map(() => 0.7));
  ok(r.points.length >= 3 && r.w > 0, `${p}: tracé avec pressureScale valide`);
}

console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
