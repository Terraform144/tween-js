// tween-runtime.js — runtime autonome (aucune dépendance) pour rejouer,
// comme objets de jeu réutilisables, les symboles exportés depuis TweenJS.
//
// Usage typique dans un jeu :
//
//   import { CharacterClip } from './Character.js';
//   const hero = new CharacterClip({ x: 100, y: 200 });
//   hero.gotoAndPlay('walk');
//   // dans la boucle de jeu :
//   hero.update(dt);      // dt en millisecondes
//   hero.draw(ctx);        // dessine sur un canvas 2D existant

function lerp(a, b, t) { return a + (b - a) * t; }

function applyEasing(t, easing) {
  if (easing === 'easeIn') return t * t;
  if (easing === 'easeOut') return 1 - (1 - t) * (1 - t);
  if (easing === 'easeInOut') return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  return t;
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '#000000');
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function clamp255(n) { return Math.max(0, Math.min(255, Math.round(n))); }

function lerpColor(hexA, hexB, t) {
  if (hexA === hexB) return hexA;
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  const r = clamp255(lerp(a.r, b.r, t)).toString(16).padStart(2, '0');
  const g = clamp255(lerp(a.g, b.g, t)).toString(16).padStart(2, '0');
  const bl = clamp255(lerp(a.b, b.b, t)).toString(16).padStart(2, '0');
  return '#' + r + g + bl;
}

const NUMERIC_PROPS = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity', 'width', 'height'];
const COLOR_PROPS = ['fill', 'stroke'];

function lerpHandle(h1, h2, t) {
  const a = h1 || { x: 0, y: 0 };
  const b = h2 || { x: 0, y: 0 };
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function lerpPoint(p, q, t) {
  return {
    x: lerp(p.x, q.x, t),
    y: lerp(p.y, q.y, t),
    cIn: (p.cIn || q.cIn) ? lerpHandle(p.cIn, q.cIn, t) : null,
    cOut: (p.cOut || q.cOut) ? lerpHandle(p.cOut, q.cOut, t) : null,
    smooth: p.smooth,
  };
}

function interpolateElement(a, b, t) {
  const out = JSON.parse(JSON.stringify(a));
  if (!b) return out;
  for (const p of NUMERIC_PROPS) {
    if (typeof a[p] === 'number' && typeof b[p] === 'number') out[p] = lerp(a[p], b[p], t);
  }
  for (const p of COLOR_PROPS) {
    if (typeof a[p] === 'string' && typeof b[p] === 'string') out[p] = lerpColor(a[p], b[p], t);
  }
  // Morphing point à point si les deux courbes ont le même nombre de points
  // (même index = points correspondants) ; sinon la forme reste rigide et
  // ne fait que bouger/tourner/redimensionner via les props ci-dessus.
  if (Array.isArray(a.points) && Array.isArray(b.points) && a.points.length === b.points.length && a.points.length > 0) {
    out.points = a.points.map((p, i) => lerpPoint(p, b.points[i], t));
  }
  return out;
}

function getActiveKeyframe(layer, frameIndex) {
  let active = layer.keyframes[0];
  for (const kf of layer.keyframes) {
    if (kf.index <= frameIndex) active = kf; else break;
  }
  return active;
}

function getNextKeyframe(layer, kf) {
  const idx = layer.keyframes.indexOf(kf);
  return layer.keyframes[idx + 1] || null;
}

function resolveLayerAtFrame(layer, frameIndex) {
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

function tracePath(ctx, points, closed) {
  if (!points.length) return;
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) traceSegment(ctx, points[i - 1], points[i]);
  if (closed && points.length > 1) {
    traceSegment(ctx, points[points.length - 1], points[0]);
    ctx.closePath();
  }
}

function traceSegment(ctx, a, b) {
  if (!a.cOut && !b.cIn) { ctx.lineTo(b.x, b.y); return; }
  const c1 = a.cOut ? { x: a.x + a.cOut.x, y: a.y + a.cOut.y } : { x: a.x, y: a.y };
  const c2 = b.cIn ? { x: b.x + b.cIn.x, y: b.y + b.cIn.y } : { x: b.x, y: b.y };
  ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);
}

// Cache d'images par dataUrl : les bitmaps embarqués sont décodés une seule
// fois et réutilisés par toutes les instances qui partagent l'asset. L'image
// se remplit en arrière-plan ; tant qu'elle n'est pas décodée, drawImage est
// simplement ignoré (le rendu suivant de la boucle l'affichera).
const __imageCache = {};
function getImage(dataUrl) {
  let img = __imageCache[dataUrl];
  if (img) return img;
  img = new Image();
  img.src = dataUrl;
  __imageCache[dataUrl] = img;
  return img;
}

// Découpe le texte en lignes : d'abord sur les retours à la ligne explicites
// (\n saisis dans la boîte de texte), puis par mot dès qu'une ligne dépasse
// maxWidth (retour à la ligne automatique façon paragraphe). Un mot seul
// plus large que maxWidth n'est pas coupé au milieu (comme le wrap 'word' de
// Konva côté éditeur), il déborde simplement.
function wrapTextLines(ctx, text, maxWidth) {
  const paragraphs = (text || '').split('\n');
  const lines = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(' ');
    let current = '';
    for (const word of words) {
      const test = current ? current + ' ' + word : word;
      if (maxWidth && current && ctx.measureText(test).width > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    lines.push(current);
  }
  return lines;
}

function drawShape(ctx, el, data) {
  ctx.save();
  ctx.translate(el.x, el.y);
  ctx.rotate((el.rotation || 0) * Math.PI / 180);
  ctx.scale(el.scaleX || 1, el.scaleY || 1);
  ctx.globalAlpha *= (el.opacity == null ? 1 : el.opacity);
  ctx.fillStyle = el.fill || '#000';
  ctx.strokeStyle = el.stroke || '#000';
  ctx.lineWidth = el.strokeWidth || 0;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (el.shapeType === 'rect') {
    ctx.beginPath();
    ctx.rect(-el.width / 2, -el.height / 2, el.width, el.height);
    if (el.fill) ctx.fill();
    if (el.strokeWidth) ctx.stroke();
  } else if (el.shapeType === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(0, 0, Math.max(0, el.width / 2), Math.max(0, el.height / 2), 0, 0, Math.PI * 2);
    if (el.fill) ctx.fill();
    if (el.strokeWidth) ctx.stroke();
  } else if (el.shapeType === 'line' || el.shapeType === 'path') {
    const pts = el.points || [];
    if (pts.length) {
      ctx.beginPath();
      tracePath(ctx, pts, !!el.closed);
      if (el.closed && el.fill) ctx.fill();
      if (el.strokeWidth) ctx.stroke();
    }
  } else if (el.shapeType === 'text') {
    const fontSize = el.fontSize || 24;
    ctx.font = fontSize + 'px ' + (el.fontFamily || 'Arial');
    const align = el.align || 'center';
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    const lineHeight = (el.lineHeight != null ? el.lineHeight : 1.2) * fontSize;
    const lines = wrapTextLines(ctx, el.text || '', el.width);
    const startY = -((lines.length - 1) * lineHeight) / 2;
    const xPos = align === 'left' ? -el.width / 2 : align === 'right' ? el.width / 2 : 0;
    lines.forEach((line, i) => ctx.fillText(line, xPos, startY + i * lineHeight));
  } else if (el.kind === 'bitmap') {
    const asset = data.assets ? data.assets[el.assetId] : null;
    const img = asset ? getImage(asset.dataUrl) : null;
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, -el.width / 2, -el.height / 2, el.width, el.height);
    }
  }
  ctx.restore();
}

// Un MovieClip a sa propre timeline indépendante : play/stop/gotoAndPlay et
// currentFrame se comportent comme dans Adobe Animate. Les symboles de type
// 'graphic' imbriqués, eux, restent synchronisés sur l'image du parent (pas
// d'état propre) — exactement comme dans l'éditeur.
export class MovieClip {
  constructor(data, props = {}) {
    this.data = data; // { frameRate, frameCount, layers, frameLabels, symbols, width, height }
    this.x = props.x || 0;
    this.y = props.y || 0;
    this.rotation = props.rotation || 0;
    this.scaleX = props.scaleX != null ? props.scaleX : 1;
    this.scaleY = props.scaleY != null ? props.scaleY : 1;
    this.opacity = props.opacity != null ? props.opacity : 1;
    this.visible = true;
    this.loop = props.loop != null ? props.loop : true;
    this.isPlaying = true;

    this._frame = 0;
    this._acc = 0;
    this._listeners = {};
    this._children = new Map(); // id d'instance -> MovieClip enfant (symboles movieclip imbriqués)
    // Appelé (au plus une fois par image, hors ré-affichages sur place) quand
    // this._frame change — sert à déclencher les scripts d'image (frame
    // actions) posés sur ce clip. Non propagé aux enfants movieclip imbriqués
    // pour l'instant : seule la timeline racine exécute ses scripts d'image
    // à l'export (voir exportHTML.js).
    this._onFrameScript = props.onFrameScript || null;
    this._lastScriptFrame = -1;
  }

  get currentFrame() { return this._frame; }
  get frameCount() { return this.data.frameCount; }

  play() { this.isPlaying = true; }
  stop() { this.isPlaying = false; }

  gotoAndPlay(frameOrLabel) { this._goto(frameOrLabel); this.isPlaying = true; }
  gotoAndStop(frameOrLabel) { this._goto(frameOrLabel); this.isPlaying = false; }

  _goto(frameOrLabel) {
    if (typeof frameOrLabel === 'string') {
      const idx = this.data.frameLabels ? this.data.frameLabels[frameOrLabel] : undefined;
      if (idx == null) {
        console.warn('[MovieClip] label introuvable : "' + frameOrLabel + '"');
        return;
      }
      this._frame = idx;
    } else {
      this._frame = Math.max(0, Math.min(this.data.frameCount - 1, frameOrLabel | 0));
    }
    this._acc = 0;
  }

  addEventListener(type, fn) {
    (this._listeners[type] = this._listeners[type] || []).push(fn);
  }

  removeEventListener(type, fn) {
    if (this._listeners[type]) this._listeners[type] = this._listeners[type].filter((f) => f !== fn);
  }

  _emit(type) {
    for (const fn of this._listeners[type] || []) fn({ type, target: this });
  }

  // dt en millisecondes, comme performance.now()/requestAnimationFrame.
  update(dt) {
    if (this.isPlaying) {
      const frameDuration = 1000 / (this.data.frameRate || 24);
      this._acc += dt;
      while (this._acc >= frameDuration) {
        this._acc -= frameDuration;
        const next = this._frame + 1;
        if (next >= this.data.frameCount) {
          if (this.loop) {
            this._frame = 0;
            this._emit('loop');
          } else {
            this._frame = this.data.frameCount - 1;
            this.isPlaying = false;
            this._emit('complete');
            break;
          }
        } else {
          this._frame = next;
        }
      }
    }
    this._syncChildren(this.data.layers, this._frame, dt, true);
    // Déclenché une seule fois par arrivée sur une image (pas à chaque appel
    // d'update() tant qu'on y reste, ex. après un stop()) — que l'image ait
    // été atteinte en avançant normalement ou via un saut direct (gotoAndX).
    if (this._onFrameScript && this._frame !== this._lastScriptFrame) {
      this._lastScriptFrame = this._frame;
      this._onFrameScript(this._frame);
    }
  }

  draw(ctx) {
    if (!this.visible) return;
    // Garantit que les enfants movieclip existent même si draw() est appelé
    // avant le premier update() (par ex. un premier rendu avant la boucle).
    this._syncChildren(this.data.layers, this._frame, 0, false);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate((this.rotation || 0) * Math.PI / 180);
    ctx.scale(this.scaleX, this.scaleY);
    ctx.globalAlpha *= this.opacity;
    this._renderLayers(ctx, this.data.layers, this._frame);
    ctx.restore();
  }

  // Parcourt les instances de type 'movieclip' présentes à l'image donnée,
  // crée/retire les enfants correspondants et les fait avancer. Les enfants
  // sont indexés par id d'INSTANCE (unique par placement sur la scène), donc
  // deux instances du même symbole ont bien un état de lecture indépendant.
  _syncChildren(layers, frameIndex, dt, doUpdate) {
    const seen = new Set();
    for (const layer of layers) {
      if (!layer.visible) continue;
      for (const el of resolveLayerAtFrame(layer, frameIndex)) {
        if (el.kind !== 'instance') continue;
        const symbol = this.data.symbols[el.symbolId];
        if (!symbol || symbol.type !== 'movieclip') continue;
        seen.add(el.id);
        let child = this._children.get(el.id);
        if (!child) {
          child = new MovieClip({ ...symbol, frameRate: this.data.frameRate, symbols: this.data.symbols, assets: this.data.assets });
          this._children.set(el.id, child);
        }
        if (doUpdate) child.update(dt);
      }
    }
    for (const id of this._children.keys()) if (!seen.has(id)) this._children.delete(id);
  }

  _renderLayers(ctx, layers, frameIndex) {
    for (const layer of layers) {
      if (!layer.visible) continue;
      for (const el of resolveLayerAtFrame(layer, frameIndex)) {
        if (el.kind === 'instance') this._renderInstance(ctx, el, frameIndex);
        else drawShape(ctx, el, this.data);
      }
    }
  }

  _renderInstance(ctx, el, parentFrame) {
    const symbol = this.data.symbols[el.symbolId];
    if (!symbol) return;
    ctx.save();
    ctx.translate(el.x, el.y);
    ctx.rotate((el.rotation || 0) * Math.PI / 180);
    ctx.scale(el.scaleX || 1, el.scaleY || 1);
    ctx.globalAlpha *= (el.opacity == null ? 1 : el.opacity);
    if (symbol.type === 'graphic') {
      const childFrame = parentFrame % Math.max(1, symbol.frameCount);
      this._renderLayers(ctx, symbol.layers, childFrame);
    } else {
      const child = this._children.get(el.id);
      if (child) {
        // La transformation propre de l'instance est déjà appliquée
        // ci-dessus ; l'enfant se dessine donc à l'origine locale.
        const savedX = child.x, savedY = child.y;
        child.x = 0; child.y = 0;
        child.draw(ctx);
        child.x = savedX; child.y = savedY;
      }
    }
    ctx.restore();
  }
}

export function createMovieClip(data, props) {
  return new MovieClip(data, props);
}
