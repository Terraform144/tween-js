// Export vidéo WebM : enregistre la LECTURE réelle de l'éditeur (boucle loop de
// main.js, donc caméra, tweens, scripts d'image, clips imbriqués...) via
// MediaRecorder sur un canvas 2D alimenté par stage.toCanvas(), puis télécharge
// un .webm. Une seule passe : frame 0 → frameCount-1.
//
// v1 : vidéo seule (pas de piste audio — les sons de la timeline sont joués
// pendant l'enregistrement mais non muxés ; voir TODO v2).
//
// La partie "choix du mimeType" est pure (testable Node) ; recordVideoWebM
// reçoit state + stage + notify en paramètres (testable avec des stubs DOM).
import { getContextFrameCount } from '../core/model.js';
import { downloadBlobFile } from '../util/download.js';

// Premier conteneur WebM supporté (vp9 > vp8 > webm nu). Retourne null si rien.
export function pickWebMMimeType(isTypeSupported) {
  const supported = isTypeSupported || ((m) => (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)));
  for (const m of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
    try { if (supported(m)) return m; } catch (e) { /* isTypeSupported peut throw sur un mime invalide */ }
  }
  return null;
}

// Enregistre une passe complète de la lecture et retourne le Blob webm.
// - state : état éditeur (currentFrame remis à 0, playing forcé, restauré après)
// - stage : stage Konva (stage.toCanvas() fournit l'image de la scène, zoom/caméra inclus)
// - { onProgress(count, frameCount), notify } : notify(state) après chaque mutation d'état
// La durée de la vidéo = frameCount / frameRate (pilotée par la boucle de lecture
// en temps réel) ; on ne dessine le canvas d'enregistrement que quand la frame
// affichée change, donc une frame vidéo par frame du document.
export async function recordVideoWebM(state, stage, { onProgress = () => {}, notify = () => {} } = {}) {
  if (typeof MediaRecorder === 'undefined') throw new Error('MediaRecorder non disponible dans ce navigateur');
  const mime = pickWebMMimeType();
  if (!mime) throw new Error('Aucun conteneur WebM supporté par ce navigateur (vp9/vp8)');

  const fc = Math.max(1, getContextFrameCount(state.doc, state.editPath) | 0);
  const fps = Math.max(1, state.doc.frameRate | 0);
  const frameMs = 1000 / fps;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, state.doc.width | 0);
  canvas.height = Math.max(1, state.doc.height | 0);
  const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(); // capture à chaque changement du canvas
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((res) => { rec.onstop = res; });

  const wasPlaying = state.playing;
  const startFrame = state.currentFrame;
  state.currentFrame = 0;
  state.playing = true;
  notify(state);

  const maxMs = fc * frameMs * 3 + 5000; // garde-fou : 3x la durée normale + marge
  const t0 = performance.now();
  let drawn = -1;   // dernière frame du doc dessinée sur le canvas d'enregistrement
  let count = 0;    // nombre de frames distinctes dessinées
  rec.start(200);   // timeslice 200 ms : les chunks arrivent au fil de l'eau

  try {
    await new Promise((resolve) => {
      const watch = () => {
        const f = state.currentFrame | 0;
        if (f !== drawn) {
          drawn = f;
          count++;
          // stage.toCanvas() composite tous les layers (zoom + caméra inclus)
          ctx.drawImage(stage.toCanvas(), 0, 0, canvas.width, canvas.height);
          onProgress(Math.min(count, fc), fc);
        }
        const finished = count >= fc || !state.playing; // un script a peut-être fait Scene.stop()
        const timedOut = performance.now() - t0 > maxMs;
        if (finished || timedOut) {
          state.playing = false;
          notify(state);
          try { rec.stop(); } catch (e) { /* déjà arrêté */ }
          resolve();
          return;
        }
        setTimeout(() => requestAnimationFrame(watch), 4);
      };
      requestAnimationFrame(watch);
    });
    await stopped;
  } finally {
    // Restaure l'état de lecture d'avant l'export
    state.playing = wasPlaying;
    state.currentFrame = startFrame;
    notify(state);
    try { stream.getTracks().forEach((t) => t.stop()); } catch (e) { /* stream déjà mort */ }
  }

  if (!chunks.length) throw new Error("Aucun donnée vidéo reçue du MediaRecorder");
  return new Blob(chunks, { type: 'video/webm' });
}

function safeName(name) {
  return (name || 'document').replace(/[^a-z0-9_\-]+/gi, '_');
}

// Enregistre puis télécharge <nom du doc>.webm. Curseur "wait" pendant l'export.
export async function downloadVideoWebM(state, stage, opts = {}) {
  const notify = opts.notify || (() => {});
  const prevCursor = document.body.style.cursor;
  document.body.style.cursor = 'wait';
  try {
    const blob = await recordVideoWebM(state, stage, opts);
    downloadBlobFile(blob, safeName(state.doc.name) + '.webm');
    return blob;
  } finally {
    document.body.style.cursor = prevCursor;
  }
}
