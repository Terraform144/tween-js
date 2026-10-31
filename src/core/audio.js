// Piste audio de la timeline — événements son posés sur des frames
// (doc.audio = [{ id, assetId, frame }], champ optionnel du document).
// Les assets audio sont des assets normaux avec kind: 'audio' (dataUrl).
// Lecture : à chaque frame atteinte pendant la lecture, on joue les sons de
// cette frame (new Audio(dataUrl)) — éditeur (main.js) et runtime exporté.

export function audioEventsAt(doc, frame) {
  const list = (doc && doc.audio) || [];
  return list.filter((e) => e.frame === frame);
}

export function upsertAudioEvent(doc, frame, assetId) {
  doc.audio = doc.audio || [];
  const ex = doc.audio.find((e) => e.frame === frame);
  if (ex) { ex.assetId = assetId; return ex; }
  const ev = { id: 'snd' + Math.random().toString(36).slice(2, 10), assetId, frame };
  doc.audio.push(ev);
  doc.audio.sort((a, b) => a.frame - b.frame);
  return ev;
}

export function removeAudioEventAt(doc, frame) {
  if (!doc.audio) return false;
  const i = doc.audio.findIndex((e) => e.frame === frame);
  if (i < 0) return false;
  doc.audio.splice(i, 1);
  return true;
}

export function audioAssets(doc) {
  return Object.values((doc && doc.assets) || {}).filter((a) => a.kind === 'audio');
}

// Joue les sons d'une frame donnée (navigateur uniquement). Retourne le nb joués.
export function playFrameSounds(doc, frame) {
  if (typeof Audio === 'undefined') return 0;
  let n = 0;
  for (const ev of audioEventsAt(doc, frame)) {
    const asset = (doc.assets || {})[ev.assetId];
    if (asset && asset.dataUrl) {
      try { new Audio(asset.dataUrl).play(); n++; } catch (e) { /* son illisible : on ignore */ }
    }
  }
  return n;
}
