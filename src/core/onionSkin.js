// Onion skin (peau d'oignon) : fantômes des images voisines de la tête de
// lecture, teintés — BLEU vers le passé, ROUGE vers l'avenir (convention
// demandée par l'utilisateur). Logique pure (pas de DOM, pas de Konva) :
// importable et testable hors navigateur (harnais _wrk_mistral_mem).

export const ONION_PAST_COLOR = '#268bd2';   // bleu Solarized
export const ONION_FUTURE_COLOR = '#dc322f'; // rouge Solarized
export const ONION_BASE_ALPHA = 0.55;
export const ONION_MAX_FRAMES = 50;          // borne anti-flood (champ libre)

export function defaultOnionSkin() {
  return { enabled: false, past: 2, future: 2 };
}

// Assainit un objet de réglage lu depuis les préférences (localStorage) :
// toute valeur délirante retombe sur les défauts bornés.
export function sanitizeOnionSkin(os) {
  const d = defaultOnionSkin();
  if (!os || typeof os !== 'object') return d;
  return {
    enabled: !!os.enabled,
    past: clampInt(os.past, 0, ONION_MAX_FRAMES, d.past),
    future: clampInt(os.future, 0, ONION_MAX_FRAMES, d.future),
  };
}

function clampInt(v, min, max, fallback) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// Opacité dégressive : la frame la plus proche de la tête de lecture est la
// plus visible (i=1 -> base, i=2 -> base/2, ...), avec un plancher pour que
// les fantômes lointains restent à peine perceptibles mais présents.
function alphaFor(i) {
  return Math.max(0.08, ONION_BASE_ALPHA / i);
}

// Liste des images fantômes à afficher pour une tête de lecture donnée.
// Retourne [{ index, dir: 'past'|'future', tint, alpha }], ordonnées du plus
// ÉLOIGNÉ au plus PROCHE (ordre de peinture : le plus proche finit au-dessus).
// `currentFrame` et `frameCount` sont 0-based (frameCount = nombre d'images,
// dernière image = frameCount - 1, comme buildRuler dans Timeline.js).
export function onionFrames(currentFrame, frameCount, os) {
  if (!os || !os.enabled) return [];
  const past = clampInt(os.past, 0, ONION_MAX_FRAMES, 0);
  const future = clampInt(os.future, 0, ONION_MAX_FRAMES, 0);
  const out = [];
  for (let i = past; i >= 1; i--) {
    const index = currentFrame - i;
    if (index < 0) continue;
    out.push({ index, dir: 'past', tint: ONION_PAST_COLOR, alpha: alphaFor(i) });
  }
  for (let i = 1; i <= future; i++) {
    const index = currentFrame + i;
    if (index > frameCount - 1) break;
    out.push({ index, dir: 'future', tint: ONION_FUTURE_COLOR, alpha: alphaFor(i) });
  }
  return out;
}

// Teinte un élément pour le rendu fantôme : clone superficiel (le modèle n'est
// JAMAIS muté), opacité onion posée, et selon le type :
// - bone   -> sa couleur devient la teinte (le contour blanc du head/tail reste)
// - bitmap -> pas de fill/stroke : l'image s'affiche telle quelle, à l'opacité
//             onion (v1 : pas de teinte hue sur les pixels, voir NOTES_SYNTHESE)
// - autres -> fill ET stroke deviennent la teinte (les lignes ouvertes n'ont
//             pas de fill : seul le stroke est teinté)
export function tintElementForOnion(el, tint, alpha) {
  const c = { ...el, opacity: alpha };
  if (el.kind === 'bone') {
    c.color = tint;
  } else if (el.kind !== 'bitmap' && el.kind !== 'instance') {
    c.fill = tint;
    if (c.stroke) c.stroke = tint;
  }
  return c;
}
