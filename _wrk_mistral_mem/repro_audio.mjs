// Harnais piste audio — core/audio.js (pur + playFrameSounds avec stub Audio).
// Run: node _wrk_mistral_mem/repro_audio.mjs
import { audioEventsAt, upsertAudioEvent, removeAudioEventAt, audioAssets, playFrameSounds } from '../src/core/audio.js';

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };

const doc = { assets: { a1: { id: 'a1', kind: 'audio', dataUrl: 'data:audio/wav;base64,xx' }, img1: { id: 'img1', dataUrl: 'data:image/png;base64,yy' } } };

console.log('== events ==');
ok(audioEventsAt(doc, 2).length === 0, 'rien à frame 2 au départ');
const e1 = upsertAudioEvent(doc, 2, 'a1');
ok(audioEventsAt(doc, 2).length === 1 && audioEventsAt(doc, 2)[0].assetId === 'a1', 'event posé à frame 2');
upsertAudioEvent(doc, 5, 'a1');
ok(doc.audio.length === 2 && doc.audio[0].frame === 2 && doc.audio[1].frame === 5, 'deux events triés');
const e1b = upsertAudioEvent(doc, 2, 'a1');
ok(doc.audio.length === 2 && e1b.id === e1.id, 'upsert même frame = remplace (pas de doublon)');
ok(removeAudioEventAt(doc, 2) === true && audioEventsAt(doc, 2).length === 0, 'remove frame 2');
ok(removeAudioEventAt(doc, 9) === false, 'remove frame sans event = false');

console.log('== audioAssets ==');
ok(audioAssets(doc).length === 1 && audioAssets(doc)[0].id === 'a1', 'seuls les assets kind=audio (image exclue)');

console.log('== playFrameSounds (stub Audio) ==');
{
  let plays = 0;
  globalThis.Audio = class { constructor(src) { this.src = src; } play() { plays++; } };
  upsertAudioEvent(doc, 3, 'a1');
  ok(playFrameSounds(doc, 2) === 0, 'frame 2: aucun son (event a été supprimé)');
  ok(playFrameSounds(doc, 3) === 1 && plays === 1, 'frame 3: 1 son joué');
  ok(playFrameSounds(doc, 5) === 1 && plays === 2, 'frame 5: 1 son joué');
  // asset manquant -> pas de crash, 0 joué
  upsertAudioEvent(doc, 7, 'inexistant');
  ok(playFrameSounds(doc, 7) === 0, 'asset inconnu: rien, pas de crash');
  delete globalThis.Audio;
  ok(playFrameSounds(doc, 3) === 0, 'sans Audio (Node): 0, pas de crash');
}

console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
