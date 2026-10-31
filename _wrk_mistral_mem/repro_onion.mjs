// Harnais onion skin — logique pure de src/core/onionSkin.js (pas de DOM/Konva).
// Run: node _wrk_mistral_mem/repro_onion.mjs
import { defaultOnionSkin, sanitizeOnionSkin, onionFrames, tintElementForOnion,
         ONION_PAST_COLOR, ONION_FUTURE_COLOR, ONION_BASE_ALPHA, ONION_MAX_FRAMES } from '../src/core/onionSkin.js';

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  OK  ' + label); }
  else { fail++; console.log('  FAIL ' + label); }
}

console.log('== défauts & sanitize ==');
{
  const d = defaultOnionSkin();
  ok(d.enabled === false && d.past === 2 && d.future === 2, 'défauts {enabled:false, past:2, future:2}');
  const s = sanitizeOnionSkin({ enabled: 1, past: 999, future: -3 });
  ok(s.enabled === true && s.past === ONION_MAX_FRAMES && s.future === 0, 'sanitize: clamp past=50, future=0, enabled truthy');
  const s2 = sanitizeOnionSkin(null);
  ok(s2.past === 2 && s2.enabled === false, 'sanitize null -> défauts');
  const s3 = sanitizeOnionSkin({ past: 'abc' });
  ok(s3.past === 2, 'sanitize NaN -> défaut 2');
}

console.log('== onionFrames: désactivé ==');
{
  ok(onionFrames(5, 24, { enabled: false, past: 2, future: 2 }).length === 0, 'enabled=false -> aucune frame');
  ok(onionFrames(5, 24, null).length === 0, 'os null -> []');
}

console.log('== onionFrames: cas nominal (frame 5/24, past 2, future 2) ==');
{
  const fr = onionFrames(5, 24, { enabled: true, past: 2, future: 2 });
  ok(fr.length === 4, '4 fantômes (2 passé + 2 futur)');
  // ordre : passé du plus loin au plus proche, puis futur du plus proche au plus loin
  ok(fr[0].index === 3 && fr[0].dir === 'past', 'premier = frame 3 (passé lointain)');
  ok(fr[1].index === 4 && fr[1].dir === 'past', 'puis frame 4 (passé proche)');
  ok(fr[2].index === 6 && fr[2].dir === 'future', 'puis frame 6 (futur proche)');
  ok(fr[3].index === 7 && fr[3].dir === 'future', 'enfin frame 7 (futur lointain)');
  ok(fr[0].tint === ONION_PAST_COLOR && fr[1].tint === ONION_PAST_COLOR, 'passé = BLEU');
  ok(fr[2].tint === ONION_FUTURE_COLOR && fr[3].tint === ONION_FUTURE_COLOR, 'futur = ROUGE');
  ok(Math.abs(fr[1].alpha - ONION_BASE_ALPHA) < 1e-9, 'passé proche alpha = base (0.55)');
  ok(Math.abs(fr[0].alpha - ONION_BASE_ALPHA / 2) < 1e-9, 'passé lointain alpha = base/2 (dégressif)');
  ok(Math.abs(fr[2].alpha - ONION_BASE_ALPHA) < 1e-9, 'futur proche alpha = base');
  ok(Math.abs(fr[3].alpha - ONION_BASE_ALPHA / 2) < 1e-9, 'futur lointain alpha = base/2');
  ok(fr[1].alpha > fr[0].alpha && fr[2].alpha > fr[3].alpha, 'dégressif: proche > lointain des deux côtés');
}

console.log('== onionFrames: limites de la timeline ==');
{
  const f0 = onionFrames(0, 24, { enabled: true, past: 3, future: 1 });
  ok(f0.every(f => f.dir === 'future'), 'frame 0: aucun fantôme passé');
  ok(f0.length === 1 && f0[0].index === 1, 'frame 0: un seul futur (index 1)');
  const fLast = onionFrames(23, 24, { enabled: true, past: 1, future: 5 });
  ok(fLast.every(f => f.dir === 'past'), 'dernière frame (23/24): aucun fantôme futur');
  ok(fLast.length === 1 && fLast[0].index === 22, 'dernière frame: un seul passé (index 22)');
  const mid = onionFrames(2, 24, { enabled: true, past: 5, future: 5 });
  ok(mid.filter(f => f.dir === 'past').length === 2, 'frame 2 avec past=5: seulement 2 passés (0,1,2 -> index 0 et 1 valides)');
}

console.log('== onionFrames: alpha plancher ==');
{
  const fr = onionFrames(30, 100, { enabled: true, past: 10, future: 0 });
  ok(fr.every(f => f.alpha >= 0.08), 'alpha jamais sous 0.08 même à i=10');
}

console.log('== tintElementForOnion ==');
{
  const rect = { kind: 'shape', shapeType: 'rect', fill: '#ff0000', stroke: '#00ff00', opacity: 1, x: 10 };
  const t = tintElementForOnion(rect, ONION_PAST_COLOR, 0.3);
  ok(t.fill === ONION_PAST_COLOR && t.stroke === ONION_PAST_COLOR, 'rect: fill+stroke teintés');
  ok(t.opacity === 0.3, 'opacité onion posée');
  ok(rect.fill === '#ff0000' && rect.opacity === 1, 'original NON muté');
  const bone = { kind: 'bone', color: '#123456', opacity: 1 };
  const tb = tintElementForOnion(bone, ONION_FUTURE_COLOR, 0.5);
  ok(tb.color === ONION_FUTURE_COLOR, 'bone: color teintée');
  ok(bone.color === '#123456', 'bone original non muté');
  const bmp = { kind: 'bitmap', assetId: 'a1', opacity: 1 };
  const tm = tintElementForOnion(bmp, ONION_PAST_COLOR, 0.4);
  ok(tm.opacity === 0.4 && tm.fill === undefined, 'bitmap: opacité seule, pas de fill ajouté');
  const open = { kind: 'shape', shapeType: 'line', stroke: '#000', opacity: 1 };
  const to = tintElementForOnion(open, ONION_FUTURE_COLOR, 0.6);
  ok(to.stroke === ONION_FUTURE_COLOR && to.fill === ONION_FUTURE_COLOR, 'ligne: stroke teinté (fill forcé teinte aussi, inoffensif pour une ligne ouverte)');
}

console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
