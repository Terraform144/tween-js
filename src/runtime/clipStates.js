// États de lecture indépendants par instance de MovieClip (runtime éditeur).
// Chaque instance MovieClip possède sa propre timeline (isPlaying,
// currentFrame) — comportement identique à Adobe Animate CC.

const clipStates = new Map(); // instanceId -> ClipState

export function getClipState(instanceId) {
  let s = clipStates.get(instanceId);
  if (!s) {
    s = { isPlaying: true, currentFrame: 0, _lastScriptFrame: -1, loop: true };
    clipStates.set(instanceId, s);
  }
  return s;
}

export function hasClipState(instanceId) {
  return clipStates.has(instanceId);
}

export function resetAllClipStates() {
  for (const s of clipStates.values()) {
    s.isPlaying = true;
    s.currentFrame = 0;
    s._lastScriptFrame = -1;
  }
}

export function clearClipStates() {
  clipStates.clear();
}
