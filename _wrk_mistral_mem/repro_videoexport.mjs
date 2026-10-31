// Harnais export vidéo WebM (src/export/videoExport.js) — stubs DOM/MediaRecorder.
// Vérifie : pickWebMMimeType (fallback vp9>vp8>webm>null), recordVideoWebM (une
// frame dessinée par frame du doc, durée pilotée par la lecture, restauration
// de state, Blob webm rendu), cas d'erreur (pas de MediaRecorder / pas de mime).
// Usage : node _wrk_mistral_mem/repro_videoexport.mjs   (depuis la racine du projet)
import { pickWebMMimeType, recordVideoWebM } from '../src/export/videoExport.js';
import { createDocument } from '../src/core/model.js';

let passed = 0, failed = 0;
const ok = (c, name) => { if (c) { passed++; console.log('  OK  ' + name); } else { failed++; console.log('  FAIL ' + name); } };

console.log('== pickWebMMimeType ==');
ok(pickWebMMimeType((m) => m.includes('vp9')) === 'video/webm;codecs=vp9', 'vp9 dispo -> vp9');
ok(pickWebMMimeType((m) => m.includes('vp8')) === 'video/webm;codecs=vp8', 'vp9 ko, vp8 ok -> vp8');
ok(pickWebMMimeType((m) => m === 'video/webm') === 'video/webm', 'seul webm nu -> webm');
ok(pickWebMMimeType(() => false) === null, 'rien -> null');
ok(pickWebMMimeType(() => { throw new Error('x'); }) === null, 'isTypeSupported qui throw -> null (sans crash)');

console.log('== recordVideoWebM (stubs) ==');
// --- stubs globaux ---
let draws = 0;
let recOpts = null;
let emittedChunks = 0;
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.document = {
  createElement: (tag) => ({
    width: 0, height: 0,
    getContext: () => ({ drawImage: () => { draws++; } }),
    captureStream: () => ({ getTracks: () => [] }),
  }),
};
globalThis.MediaRecorder = class {
  static isTypeSupported(m) { return m.includes('vp8') || m === 'video/webm'; } // vp9 NON supporté ici
  constructor(stream, opts) { recOpts = opts; this.stream = stream; }
  start() { // émet 3 chunks au fil de l'eau
    let i = 0;
    const iv = setInterval(() => {
      i++;
      if (this.ondataavailable) this.ondataavailable({ data: new Blob(['chunk' + i], { type: 'video/webm' }) });
      emittedChunks = i;
      if (i >= 3) clearInterval(iv);
    }, 5);
  }
  stop() { setTimeout(() => this.onstop && this.onstop(), 10); }
};

// --- faux doc : 12 frames (frameCount est un champ du doc, pas déduit des kf) ---
const doc = createDocument({ name: 'VideoTest', frameRate: 24 });
doc.frameCount = 12;
const state = { doc, editPath: [], currentFrame: 7, playing: false, frameRate: 24 };
let notifyCount = 0;
const notify = () => { notifyCount++; };

// --- faux stage + boucle de lecture simulée (avance toutes les 4 ms) ---
const stage = { toCanvas: () => ({ fake: 'canvas' }) };
const loopIv = setInterval(() => {
  if (!state.playing) return;
  state.currentFrame = (state.currentFrame + 1) % 12;
}, 4);

const progress = [];
const blob = await recordVideoWebM(state, stage, { onProgress: (n, t) => progress.push([n, t]), notify });
clearInterval(loopIv);

ok(blob && blob.type === 'video/webm', 'Blob retourné, type video/webm');
ok(blob.size > 0, 'Blob non vide (size=' + blob.size + ')');
ok(recOpts && recOpts.mimeType === 'video/webm;codecs=vp8', 'mimeType choisi = vp8 (vp9 non supporté par le stub)');
ok(recOpts.videoBitsPerSecond === 8_000_000, 'videoBitsPerSecond 8 Mbps');
ok(draws === 12, 'exactement 12 frames dessinées (une par frame du doc), draws=' + draws);
ok(emittedChunks >= 3 && blob.size >= 3 * 6, 'chunks MediaRecorder agrégés dans le Blob');
ok(progress.length === 12 && progress[11][0] === 12 && progress[11][1] === 12, 'onProgress 1..12/12');
ok(state.playing === false && state.currentFrame === 7, 'state restauré (playing=false, currentFrame=7)');
ok(notifyCount >= 3, 'notify appelé (démarrage + arrêt + restauration), count=' + notifyCount);

console.log("== cas d'erreur ==");
const savedMR = globalThis.MediaRecorder;
globalThis.MediaRecorder = undefined;
let threw = null;
try { await recordVideoWebM(state, stage, { notify }); } catch (e) { threw = e; }
ok(threw && /MediaRecorder/.test(threw.message), 'sans MediaRecorder -> erreur claire');
globalThis.MediaRecorder = class { static isTypeSupported() { return false; } };
threw = null;
try { await recordVideoWebM(state, stage, { notify }); } catch (e) { threw = e; }
ok(threw && /WebM/.test(threw.message), 'aucun mime webm supporté -> erreur claire');
globalThis.MediaRecorder = savedMR;

console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
