import { getActiveKeyframe, getNextKeyframe } from '../core/model.js';
import { applyEasing, interpolateElement } from './interpolate.js';
import { computeGuideOwner, samplePath, tweenKfAt } from '../core/guide.js';

// Resolves the visible, fully-interpolated list of elements for a given
// array of layers at a given frame index. Elements are returned bottom-layer
// first (layers[0] = bottom, matching Animate's stacking where the topmost
// layer in the panel renders on top — callers render in array order).
// opts.includeGuides === false -> les calques guide eux-mêmes sont exclus du
// rendu (lecture/exports) ; ils servent néanmoins à calculer les trajectoires.
export function resolveLayersAtFrame(layers, frameIndex, opts = {}) {
  const includeGuides = opts.includeGuides !== false;
  const guideOwner = computeGuideOwner(layers);
  // courbes des guides : index du calque guide -> courbe échantillonnée (absolu)
  const guideCurves = new Map();
  layers.forEach((layer, i) => {
    if (!layer.guide || !layer.visible) return;
    const els = resolveLayerAtFrame(layer, frameIndex);
    const pathEl = els.find((e) => (e.shapeType === 'path' || e.shapeType === 'line') && e.points && e.points.length >= 2);
    if (pathEl) {
      const abs = pathEl.points.map((p) => ({ ...p, x: p.x + pathEl.x, y: p.y + pathEl.y }));
      guideCurves.set(i, samplePath(abs, !!pathEl.closed));
    }
  });

  const result = [];
  layers.forEach((layer, i) => {
    if (!layer.visible) return;
    if (layer.guide && !includeGuides) return;
    let elements = resolveLayerAtFrame(layer, frameIndex);
    // Motion guide : calque guidé + tween en cours -> la position de chaque
    // élément est posée sur la courbe du guide à la progression t (easing
    // compris), en gardant le delta relatif au premier élément de la clé.
    const gi = guideOwner[i];
    if (gi != null && gi >= 0 && guideCurves.has(gi)) {
      const kf = tweenKfAt(layer, frameIndex);
      const next = kf && getNextKeyframe(layer, kf);
      if (kf && next && next.index !== kf.index) {
        const span = next.index - kf.index;
        const raw = Math.min(1, Math.max(0, (frameIndex - kf.index) / span));
        const t = applyEasing(raw, kf.tween.easing);
        const pt = guideCurves.get(gi).pointAt(t);
        const base = kf.elements[0] ? { x: kf.elements[0].x, y: kf.elements[0].y } : { x: 0, y: 0 };
        elements = elements.map((el) => ({ ...el, x: pt.x + (el.x - base.x), y: pt.y + (el.y - base.y) }));
      }
    }
    for (const el of elements) result.push({ ...el, layerId: layer.id });
  });
  return result;
}

export function resolveLayerAtFrame(layer, frameIndex) {
  const kf = getActiveKeyframe(layer, frameIndex);
  if (!kf) return [];
  if (!kf.tween) return kf.elements;

  const next = getNextKeyframe(layer, kf);
  if (!next || next.index === kf.index) return kf.elements;

  const span = next.index - kf.index;
  const raw = Math.min(1, Math.max(0, (frameIndex - kf.index) / span));
  const t = applyEasing(raw, kf.tween.easing);

  return kf.elements.map((el) => {
    const target = next.elements.find((e) => e.id === el.id);
    return interpolateElement(el, target, t);
  });
}
