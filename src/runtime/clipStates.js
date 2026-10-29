// États de lecture indépendants par instance de MovieClip (runtime éditeur).
// Chaque instance MovieClip possède sa propre timeline (isPlaying,
// currentFrame) — comportement identique à Adobe Animate CC.

const clipStates = new Map(); // instanceId -> ClipState

export function getClipState(instanceId) {
  let s = clipStates.get(instanceId);
  if (!s) {
    s = {
      isPlaying: true,
      currentFrame: 0,
      _lastScriptFrame: -1,
      loop: true,
      // Script de symbole (classe AS3-like) : exécuté une fois par vie
      // d'instance, avant les scripts d'image de la première image.
      _symbolScriptRan: false,
      // Callbacks onEnterFrame scopés à CE clip (posés par le script de
      // symbole ou les scripts d'image du clip).
      _enterFrameCbs: [],
    };
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
    s._symbolScriptRan = false;
    s._enterFrameCbs.length = 0;
  }
}

export function clearClipStates() {
  clipStates.clear();
}
