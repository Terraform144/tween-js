// Harnais grille + snap + règles/guides — core/grid.js (pur).
// Run: node _wrk_mistral_mem/repro_grid.mjs
import { defaultGrid, sanitizeGrid, snapValue, snapPoint, gridLines, rulerStep, addGuide, removeGuide, guideAt } from '../src/core/grid.js';

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };

console.log('== default / sanitize ==');
{
  const d = defaultGrid();
  ok(d.visible === false && d.spacing === 10 && d.snap === false && d.rulers === true, 'défauts {visible:false, spacing:10, snap:false, rulers:true}');
  const s = sanitizeGrid({ visible: 1, spacing: 9999, snap: 1, rulers: 0 });
  ok(s.visible && s.spacing === 500 && s.snap && s.rulers === false, 'sanitize: clamp spacing 500, rulers false volontaire');
  ok(sanitizeGrid(null).spacing === 10, 'null -> défauts');
}

console.log('== snap ==');
ok(snapValue(13, 10) === 10 && snapValue(17, 10) === 20 && snapValue(-4, 10) === 0, 'snapValue au multiple de 10');
ok(snapValue(13, 0) === 13, 'spacing 0 -> pas de snap');
const p = snapPoint({ x: 23, y: 47 }, 10);
ok(p.x === 20 && p.y === 50, `snapPoint (23,47) -> (20,50)`);

console.log('== gridLines ==');
{
  const { xs, ys } = gridLines(100, 50, 10);
  ok(xs.length === 11 && ys.length === 6, '100x50 @10 -> 11 lignes v, 6 h');
  ok(gridLines(100, 50, 0).xs.length === 0, 'spacing 0 -> rien');
}

console.log('== rulerStep ==');
ok(rulerStep(1) === 50 && rulerStep(0.1) === 500 && rulerStep(10) === 10, 'pas adaptatif à l\'échelle');

console.log('== guides ==');
{
  const doc = {};
  ok(addGuide(doc, 'v', 120) === 120 && doc.guides.v.length === 1, 'addGuide v 120');
  addGuide(doc, 'v', 40); addGuide(doc, 'h', 200);
  ok(doc.guides.v[0] === 40 && doc.guides.v[1] === 120, 'tri croissant');
  ok(addGuide(doc, 'v', 120) === 120 && doc.guides.v.length === 2, 'pas de doublon');
  ok(guideAt(doc, 'v', 122, 6) === 120, 'guideAt avec tolérance');
  ok(guideAt(doc, 'v', 200, 6) === null, 'guideAt hors tolérance -> null');
  ok(removeGuide(doc, 'v', 120) && doc.guides.v.length === 1, 'removeGuide');
  ok(removeGuide(doc, 'v', 999) === false, 'removeGuide absent -> false');
}

console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
