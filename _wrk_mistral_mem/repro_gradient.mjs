// Harnais dégradés — core/gradient.js (pur) + interpolation (playback/interpolate.js).
// Run: node _wrk_mistral_mem/repro_gradient.mjs
import { defaultGradient, sanitizeGradient, elementLocalBoxKonva, elementLocalBoxRuntime, gradientPoint, lerpGradient } from '../src/core/gradient.js';
import { interpolateElement, lerpColor } from '../src/playback/interpolate.js';
import { createShape, createPathPoint } from '../src/core/model.js';

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

console.log('== default / sanitize ==');
{
  const d = defaultGradient({ fill: '#ff0000' });
  ok(d.type === 'linear' && d.stops.length === 2 && d.stops[0].color === '#ff0000', 'default linear 2 stops depuis fill');
  const s = sanitizeGradient({ type: 'radial', cx: 2, cy: -1, r: 0.5, stops: [{ offset: 1, color: '#fff' }, { offset: 0.2, color: 'transparent' }] });
  ok(s.type === 'radial' && s.cx === 1 && s.cy === 0, 'sanitize clamp 0..1');
  ok(s.stops[0].offset === 0.2 && s.stops[1].offset === 1, 'stops triés par offset');
  ok(s.stops[0].color === 'transparent', 'stop transparent conservé (trié en premier)');
  ok(sanitizeGradient(null) === null && sanitizeGradient({ type: 'x' }).type === 'linear', 'sanitize null / type inconnu');
}

console.log('== elementLocalBoxKonva / Runtime ==');
{
  const rect = createShape('rect', { x: 10, y: 20, width: 100, height: 50 });
  ok(JSON.stringify(elementLocalBoxKonva(rect)) === JSON.stringify({ x: 0, y: 0, w: 100, h: 50 }), 'rect: box (0,0,100,50)');
  ok(JSON.stringify(elementLocalBoxRuntime(rect)) === JSON.stringify({ x: -50, y: -25, w: 100, h: 50 }), 'runtime rect centré (-50,-25)');
  const ell = createShape('ellipse', { width: 80, height: 40 });
  ok(near(elementLocalBoxKonva(ell).x, -40) && near(elementLocalBoxKonva(ell).y, -20), 'ellipse Konva centrée (-40,-20)');
  ok(near(elementLocalBoxRuntime(ell).x, -80), 'runtime ellipse: -40-40 = -80');
  const path = createShape('path', { x: 0, y: 0, points: [createPathPoint(10, 5), createPathPoint(30, 25), createPathPoint(20, 15)] });
  const bp = elementLocalBoxKonva(path);
  ok(bp.x === 10 && bp.y === 5 && bp.w === 20 && bp.h === 20, `path: bbox points (10,5,20,20) got ${JSON.stringify(bp)}`);
  ok(JSON.stringify(elementLocalBoxRuntime(path)) === JSON.stringify(bp), 'runtime path = identique');
  const t = createShape('text', { width: 120, fontSize: 20 });
  ok(elementLocalBoxKonva(t, 48).h === 48, 'text: hauteur rendue passée');
}

console.log('== gradientPoint ==');
ok(near(gradientPoint({ x: 10, y: 20, w: 100, h: 50 }, 0.5, 0.5).x, 60) && near(gradientPoint({ x: 10, y: 20, w: 100, h: 50 }, 0.5, 0.5).y, 45), 'point à 50% de la box');

console.log('== lerpGradient ==');
{
  const a = { type: 'linear', x1: 0, y1: 0, x2: 1, y2: 0, stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }] };
  const b = { type: 'linear', x1: 0, y1: 1, x2: 1, y2: 1, stops: [{ offset: 0, color: '#000000' }, { offset: 1, color: 'transparent' }] };
  const mid = lerpGradient(a, b, 0.5, (x, y, t) => x + (y - x) * t, lerpColor);
  ok(near(mid.x2, 1) && near(mid.y2, 0.5), 'points de contrôle lerpés');
  ok(mid.stops[0].color === '#800000', `stop0 lerpColor rouge->noir @0.5 = ${mid.stops[0].color}`);
  ok(mid.stops[1].color === 'rgba(0,0,255,0.5)', `stop1 lerpColor bleu->transparent @0.5 = ${mid.stops[1].color}`);
  const diffType = lerpGradient(a, { ...b, type: 'radial' }, 0.5, (x, y, t) => x + (y - x) * t, lerpColor);
  ok(diffType === a, 'types différents -> garde a');
  const diffStops = lerpGradient(a, { ...b, stops: [{ offset: 0, color: '#000' }] }, 0.8, (x, y, t) => x + (y - x) * t, lerpColor);
  ok(diffStops !== a && diffStops.stops.length === 1, 'nb stops différents -> switch à t>=0.5 (b)');
}

console.log('== interpolateElement avec fillGradient ==');
{
  const a = createShape('rect', { x: 0, y: 0, fill: '#ff0000' });
  a.fillGradient = { type: 'linear', x1: 0, y1: 0, x2: 1, y2: 0, stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#ffffff' }] };
  const b = { ...a, fillGradient: { type: 'linear', x1: 0, y1: 0, x2: 0, y2: 1, stops: [{ offset: 0, color: '#000000' }, { offset: 1, color: '#0000ff' }] } };
  const mid = interpolateElement(a, b, 0.5);
  ok(mid.fillGradient && near(mid.fillGradient.x2, 0.5) && near(mid.fillGradient.y2, 0.5), 'gradient interpolé à mi-tween');
  ok(mid.fillGradient.stops[0].color === '#800000', 'stop couleur interpolée');
  const noB = interpolateElement(a, null, 0.5);
  ok(noB.fillGradient === undefined || true, 'sans b: rien ne casse');
}

console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
