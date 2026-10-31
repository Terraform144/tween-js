// Harnais couleurs transparentes — lerpColor (éditeur + copie autonome du
// runtime exporté) et interpolateElement avec 'transparent'.
// Run: node _wrk_mistral_mem/repro_transparent.mjs
import { readFileSync } from 'fs';
import { lerpColor, interpolateElement } from '../src/playback/interpolate.js';
import { TRANSPARENT, createShape } from '../src/core/model.js';

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };

console.log('== constante ==');
ok(TRANSPARENT === 'transparent', "TRANSPARENT = 'transparent'");

console.log('== lerpColor (playback/interpolate.js) ==');
ok(lerpColor('#ff0000', '#ff0000', 0.5) === '#ff0000', 'identique -> inchangé');
ok(lerpColor('#ff0000', '#00ff00', 0.5) === '#808000', 'hex classique inchangé (#ff0000->#00ff00 @0.5 = #808000)');
ok(lerpColor('#ff0000', 'transparent', 0.5) === 'rgba(255,0,0,0.5)', 'rouge -> transparent @0.5 = rgba(255,0,0,0.5)');
ok(lerpColor('transparent', '#0000ff', 0.25) === 'rgba(0,0,255,0.25)', 'transparent -> bleu @0.25 = rgba(0,0,255,0.25) (RGB de la cible, alpha = t)');
ok(lerpColor('#ff0000', 'transparent', 0) === '#ff0000', 't=0 -> couleur de départ');
ok(lerpColor('#ff0000', 'transparent', 1) === 'rgba(255,0,0,0)', 't=1 -> rgba(255,0,0,0) (alpha 0, pas le raccourci hex)');

console.log('== copie autonome dans tweenRuntime.js (extraction du vrai source) ==');
{
  const src = readFileSync(new URL('../src/export/tweenRuntime.js', import.meta.url), 'utf8');
  const start = src.indexOf('function lerp(a, b, t)');
  const end = src.indexOf('// pivotX/pivotY interpolables');
  ok(start > 0 && end > start, 'segment lerp/lerpColor trouvé dans tweenRuntime.js');
  const factory = new Function(src.slice(start, end) + '\nreturn { lerpColor };');
  const rt = factory();
  ok(rt.lerpColor('#ff0000', '#00ff00', 0.5) === '#808000', 'runtime: hex classique OK');
  ok(rt.lerpColor('#ff0000', 'transparent', 0.5) === 'rgba(255,0,0,0.5)', 'runtime: rouge -> transparent @0.5 = rgba(255,0,0,0.5)');
  ok(rt.lerpColor('transparent', 'transparent', 0.3) === 'transparent', 'runtime: transparent -> transparent inchangé');
}

console.log('== interpolateElement avec fill transparent ==');
{
  const a = createShape('rect', { x: 0, y: 0, fill: '#ff0000', stroke: '#000000' });
  const b = { ...a, fill: 'transparent' };
  const mid = interpolateElement(a, b, 0.5);
  ok(mid.fill === 'rgba(255,0,0,0.5)', `tween fill rouge->transparent @0.5 = ${mid.fill}`);
  ok(mid.stroke === '#000000', 'stroke non tweené (identique) conservé');
  const back = interpolateElement(a, b, 0);
  ok(back.fill === '#ff0000', 't=0 -> fill de départ');
}

console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
