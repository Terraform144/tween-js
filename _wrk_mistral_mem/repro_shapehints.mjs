// Harnais shape hints (core/shapeHints.js + interpolate.js + copie autonome
// dans tweenRuntime.js extraite du vrai source). Pur Node.
// Usage : node _wrk_mistral_mem/repro_shapehints.mjs   (depuis la racine du projet)
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { computePointMatch, sanitizeHints, nextHintId } from '../src/core/shapeHints.js';
import { interpolateElement } from '../src/playback/interpolate.js';

const here = dirname(fileURLToPath(import.meta.url));
let passed = 0, failed = 0;
const ok = (c, name) => { if (c) { passed++; console.log('  OK  ' + name); } else { failed++; console.log('  FAIL ' + name); } };
const pts = (xs) => xs.map((x) => ({ x, y: 0 }));

console.log('== sanitizeHints / nextHintId ==');
ok(JSON.stringify(sanitizeHints([{ id: 'a', pointIndex: 99 }, { id: 'a', pointIndex: 1 }, { id: '', pointIndex: 0 }, null], 4)) === JSON.stringify([{ id: 'a', pointIndex: 3 }]), 'clamp + dédoublonnage + invalides retirés');
ok(JSON.stringify(sanitizeHints(null, 4)) === '[]', 'null -> []');
ok(nextHintId([{ id: 'h1' }, { id: 'h3' }]) === 'h2', 'nextHintId h2');
ok(nextHintId([]) === 'h1', 'nextHintId h1 sans hints');

console.log('== computePointMatch ==');
ok(computePointMatch(pts([0, 1, 2, 3]), pts([0, 1, 2, 3]), [], []) === null, 'pas de hints -> null (appariement par index)');
ok(computePointMatch(pts([0, 1]), pts([0, 1, 2]), [{ id: 'h1', pointIndex: 0 }], [{ id: 'h1', pointIndex: 0 }]) === null, 'nb points différents -> null');
ok(JSON.stringify(computePointMatch(pts([0, 1, 2, 3]), pts([0, 1, 2, 3]), [{ id: 'h1', pointIndex: 0 }], [{ id: 'h1', pointIndex: 2 }])) === '[2,3,0,1]', '1 hint : rotation de 2 -> [2,3,0,1]');
ok(JSON.stringify(computePointMatch(pts([0, 1, 2, 3]), pts([0, 1, 2, 3]), [{ id: 'h1', pointIndex: 0 }, { id: 'h2', pointIndex: 2 }], [{ id: 'h1', pointIndex: 1 }, { id: 'h2', pointIndex: 3 }])) === '[1,2,3,0]', '2 hints -> [1,2,3,0]');
ok(computePointMatch(pts([0, 1, 2]), pts([0, 1, 2]), [{ id: 'hX', pointIndex: 0 }], [{ id: 'h1', pointIndex: 0 }]) === null, 'id sans correspondance côté b -> ignoré -> null');
const m = computePointMatch(pts([0, 1, 2, 3, 4]), pts([0, 1, 2, 3, 4]), [{ id: 'h1', pointIndex: 0 }, { id: 'h2', pointIndex: 4 }], [{ id: 'h1', pointIndex: 2 }, { id: 'h2', pointIndex: 4 }]);
ok(m && m[0] === 2 && m[4] === 4 && m.slice().sort().join() === '0,1,2,3,4', 'permutation valide (bijection) avec 2 hints dont un fixe, m=' + JSON.stringify(m));

console.log('== interpolateElement avec hints ==');
const a = { kind: 'shape', shapeType: 'path', x: 0, y: 0, points: pts([0, 10, 20, 30]), shapeHints: [{ id: 'h1', pointIndex: 0 }] };
const b = { kind: 'shape', shapeType: 'path', x: 0, y: 0, points: pts([100, 110, 120, 130]), shapeHints: [{ id: 'h1', pointIndex: 2 }] };
const mid = interpolateElement(a, b, 0.5);
ok(mid.points[0].x === 60, 'avec hint h1:0->2, point 0 lerp vers b[2]=120 -> 60 (pas 50), x=' + mid.points[0].x);
ok(mid.points[1].x === 70 && mid.points[2].x === 60 && mid.points[3].x === 70, 'points restants en ordre circulaire (match [2,3,0,1]) : ' + mid.points.map((p) => p.x).join(','));
const bSansHints = { ...b, shapeHints: [] };
const mid2 = interpolateElement(a, bSansHints, 0.5);
ok(mid2.points[0].x === 50, 'sans hint côté b -> appariement par index (50)');

console.log('== copie autonome dans tweenRuntime.js ==');
const src = readFileSync(join(here, '../src/export/tweenRuntime.js'), 'utf8');
const start = src.indexOf('function computePointMatch');
ok(start > 0, 'computePointMatch présent dans tweenRuntime.js');
let depth = 0, end = start;
for (let i = src.indexOf('{', start); i < src.length; i++) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}') { depth--; if (!depth) { end = i + 1; break; } }
}
const fn = new Function(src.slice(start, end) + '; return computePointMatch;')();
const m2 = fn(pts([0, 1, 2, 3]), pts([0, 1, 2, 3]), [{ id: 'h1', pointIndex: 0 }, { id: 'h2', pointIndex: 2 }], [{ id: 'h1', pointIndex: 1 }, { id: 'h2', pointIndex: 3 }]);
ok(JSON.stringify(m2) === '[1,2,3,0]', 'copie runtime identique au core : [1,2,3,0]');
ok(src.includes('a.shapeHints, b.shapeHints'), 'interpolateElement du runtime lit bien shapeHints');

console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
