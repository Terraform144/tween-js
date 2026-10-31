// Harnais motion guide — computeGuideOwner + samplePath (core/guide.js, purs)
// + resolveLayersAtFrame avec calque guidé (playback/resolve.js).
// Run: node _wrk_mistral_mem/repro_guide.mjs
import { computeGuideOwner, samplePath } from '../src/core/guide.js';
import { resolveLayersAtFrame } from '../src/playback/resolve.js';
import { createDocument, createLayer, createShape, createPathPoint, insertKeyframe } from '../src/core/model.js';

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const L = (guide, guided) => ({ guide: !!guide, guided: !!guided });

console.log('== computeGuideOwner ==');
ok(JSON.stringify(computeGuideOwner([L(), L(false, true), L(true)])) === '[-1,2,-1]', 'guidé sous un guide -> owner');
ok(JSON.stringify(computeGuideOwner([L(false, true), L(), L(true)])) === '[-1,-1,-1]', 'calque normal coupe la chaîne');
ok(JSON.stringify(computeGuideOwner([L(true)])) === '[-1]', 'guide seul');

console.log('== samplePath ==');
{
  const line = samplePath([{ x: 100, y: 100 }, { x: 400, y: 100 }], false);
  ok(line && near(line.length, 300), 'ligne droite: longueur 300');
  ok(near(line.pointAt(0).x, 100) && near(line.pointAt(1).x, 400), 'extrémités');
  const mid = line.pointAt(0.5);
  ok(near(mid.x, 250) && near(mid.y, 100), `pointAt(0.5) = (250,100), got ${JSON.stringify(mid)}`);
  const bez = samplePath([
    { x: 0, y: 0, cOut: { x: 0, y: -100 } },
    { x: 100, y: 0, cIn: { x: 0, y: -100 } },
  ], false);
  ok(bez && bez.length > 100, 'courbe Bézier: longueur > corde (100)');
  ok(near(bez.pointAt(1).x, 100) && near(bez.pointAt(1).y, 0), 'Bézier: fin = dernier point');
  ok(bez.pointAt(0.5).y < -50, 'Bézier: milieu au-dessus (courbure)');
  ok(samplePath([{ x: 0, y: 0 }], false) === null, 'moins de 2 points -> null');
}

console.log('== resolveLayersAtFrame avec guide ==');
{
  const doc = createDocument({ name: 'G' });
  const guidé = doc.layers[0];
  guidé.name = 'guidé'; guidé.guided = true;
  guidé.keyframes[0].elements = [createShape('rect', { x: 100, y: 200, width: 20, height: 20, fill: '#ff0000' })];
  guidé.keyframes[0].tween = { easing: 'linear' };
  insertKeyframe(guidé, 4); // clone, même position
  const guide = createLayer('guide');
  guide.guide = true;
  doc.layers.push(guide);
  guide.keyframes[0].elements = [createShape('path', {
    x: 0, y: 0, closed: false, fill: undefined, stroke: '#000',
    points: [createPathPoint(100, 100), createPathPoint(400, 100)],
  })];

  const f0 = resolveLayersAtFrame(doc.layers, 0);
  const r0 = f0.find(e => e.shapeType === 'rect');
  ok(near(r0.x, 100) && near(r0.y, 100), `frame 0: rect au début du guide (100,100), got (${r0.x},${r0.y})`);
  ok(f0.some(e => e.shapeType === 'path'), 'édition: le guide est rendu (includeGuides défaut)');

  const f2 = resolveLayersAtFrame(doc.layers, 2);
  const r2 = f2.find(e => e.shapeType === 'rect');
  ok(near(r2.x, 250) && near(r2.y, 100), `frame 2 (t=0.5): rect au milieu du guide (250,100), got (${r2.x},${r2.y})`);

  const f4 = resolveLayersAtFrame(doc.layers, 4);
  const r4 = f4.find(e => e.shapeType === 'rect');
  ok(near(r4.x, 400) && near(r4.y, 100), `frame 4 (t=1): rect à la fin du guide (400,100), got (${r4.x},${r4.y})`);

  const f2NoGuide = resolveLayersAtFrame(doc.layers, 2, { includeGuides: false });
  ok(!f2NoGuide.some(e => e.shapeType === 'path'), 'includeGuides:false -> le guide exclu du rendu');
  ok(near(f2NoGuide.find(e => e.shapeType === 'rect').x, 250), 'mais la trajectoire guidée est toujours appliquée');

  // sans tween -> pas de trajectoire
  guidé.keyframes[0].tween = null;
  const f2b = resolveLayersAtFrame(doc.layers, 2);
  const r2b = f2b.find(e => e.shapeType === 'rect');
  ok(near(r2b.x, 100) && near(r2b.y, 200), `sans tween: position historique (100,200), got (${r2b.x},${r2b.y})`);
}

console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
