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
  if (!m) return { r: 0, g: 0, b: 0, a: 1 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16), a: 1 };
}

function clamp255(n) { return Math.max(0, Math.min(255, Math.round(n))); }

// 'transparent' (cf. TRANSPARENT dans core/model.js côté éditeur) = rgba(0,0,0,0) :
// on interpole le canal alpha pour qu'un tween vers/depuis transparent fasse
// fondre la couleur au lieu de virer au noir. Copie autonome de lerpColor
// (playback/interpolate.js) — même discipline que pivot/caméra.
function colorToRgba(c) {
  if (c === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  return hexToRgb(c);
}

function lerpColor(hexA, hexB, t) {
  if (hexA === hexB) return hexA;
  const a = colorToRgba(hexA), b = colorToRgba(hexB);
  const alpha = lerp(a.a, b.a, t);
  // Fondu vers/depuis transparent : on garde les canaux RGB de la couleur
  // opaque (seul l'alpha descend) — même règle que playback/interpolate.js.
  let r, g, bl;
  if (a.a === 0) { r = b.r; g = b.g; bl = b.b; }
  else if (b.a === 0) { r = a.r; g = a.g; bl = a.b; }
  else { r = lerp(a.r, b.r, t); g = lerp(a.g, b.g, t); bl = lerp(a.b, b.b, t); }
  if (alpha >= 1) return '#' + clamp255(r).toString(16).padStart(2, '0') + clamp255(g).toString(16).padStart(2, '0') + clamp255(bl).toString(16).padStart(2, '0');
  return `rgba(${clamp255(r)},${clamp255(g)},${clamp255(bl)},${Math.round(alpha * 1000) / 1000})`;
}

// pivotX/pivotY interpolables (voir playback/interpolate.js côté éditeur).
const NUMERIC_PROPS = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity', 'width', 'height', 'pivotX', 'pivotY'];
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
  // Maillage de déformation bitmap (cf. core/warp.js côté éditeur) :
  // interpolation des intersections si la structure cols/rows concorde.
  if (Array.isArray(a.warpPoints) && Array.isArray(b.warpPoints)
    && a.warp && b.warp && a.warp.cols === b.warp.cols && a.warp.rows === b.warp.rows
    && a.warpPoints.length === b.warpPoints.length && a.warpPoints.length > 0) {
    out.warpPoints = a.warpPoints.map((p, i) => ({
      x: lerp(p.x, b.warpPoints[i].x, t),
      y: lerp(p.y, b.warpPoints[i].y, t),
    }));
  }
  return out;
}

// --- Maillage de déformation bitmap (copie autonome de core/warp.js) ---
// Le runtime exporté ne doit importer aucun module de l'éditeur : les
// fonctions de maillage sont dupliquées ici, à maintenir en parallèle.

function warpPointCount(cols, rows) {
  return (cols + 1) * (rows + 1);
}

function defaultWarpGrid(w, h, cols, rows) {
  const pts = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) pts.push({ x: (w * i) / cols, y: (h * j) / rows });
  }
  return pts;
}

function hasValidWarp(el) {
  return !!(el.warp && Array.isArray(el.warpPoints)
    && el.warpPoints.length === warpPointCount(el.warp.cols, el.warp.rows)
    && el.warpPoints.every((p) => p && typeof p.x === 'number' && typeof p.y === 'number'));
}

function affineFromTriangle(s, d) {
  const [s1, s2, s3] = s;
  const [d1, d2, d3] = d;
  const det = s1.x * (s2.y - s3.y) - s2.x * (s1.y - s3.y) + s3.x * (s1.y - s2.y);
  if (Math.abs(det) < 1e-9) return null;
  const a = (d1.x * (s2.y - s3.y) + d2.x * (s3.y - s1.y) + d3.x * (s1.y - s2.y)) / det;
  const c = (d1.x * (s3.x - s2.x) + d2.x * (s1.x - s3.x) + d3.x * (s2.x - s1.x)) / det;
  const b = (d1.y * (s2.y - s3.y) + d2.y * (s3.y - s1.y) + d3.y * (s1.y - s2.y)) / det;
  const dd = (d1.y * (s3.x - s2.x) + d2.y * (s1.x - s3.x) + d3.y * (s2.x - s1.x)) / det;
  return [a, b, c, dd, d1.x - a * s1.x - c * s1.y, d1.y - b * s1.x - dd * s1.y];
}

const WARP_SEAM_PAD = 0.6;

function drawWarpTriangle(ctx, img, w, h, s, d) {
  const m = affineFromTriangle(s, d);
  if (!m) return;
  const [a, b, c, dd, e, f] = m;
  const cx = (d[0].x + d[1].x + d[2].x) / 3;
  const cy = (d[0].y + d[1].y + d[2].y) / 3;
  ctx.save();
  ctx.beginPath();
  d.forEach((p, k) => {
    const vx = p.x - cx, vy = p.y - cy;
    const len = Math.hypot(vx, vy) || 1;
    const px = p.x + (vx / len) * WARP_SEAM_PAD;
    const py = p.y + (vy / len) * WARP_SEAM_PAD;
    if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, dd, e, f);
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  ctx.drawImage(img, 0, 0, iw, ih, 0, 0, w, h);
  ctx.restore();
}

function drawWarpImage(ctx, img, el) {
  const cols = el.warp.cols, rows = el.warp.rows;
  const src = defaultWarpGrid(el.width, el.height, cols, rows);
  const dst = el.warpPoints;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const p00 = j * (cols + 1) + i;
      const p10 = p00 + 1;
      const p01 = p00 + (cols + 1);
      const p11 = p01 + 1;
      drawWarpTriangle(ctx, img, el.width, el.height,
        [src[p00], src[p10], src[p01]], [dst[p00], dst[p10], dst[p01]]);
      drawWarpTriangle(ctx, img, el.width, el.height,
        [src[p10], src[p11], src[p01]], [dst[p10], dst[p11], dst[p01]]);
    }
  }
}
function getActiveKeyframe(layer, frameIndex) {
  let active = layer.keyframes[0];
  for (const kf of layer.keyframes) {
    if (kf.index <= frameIndex) active = kf; else break;
  }
  return active;
}

function getKeyframeAt(layer, index) {
  for (const kf of layer.keyframes) {
    if (kf.index === index) return kf;
  }
  return null;
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

// Précharge tous les bitmaps d'un document dans le cache ci-dessus et résout
// quand chaque image est décodée — garantit que draw() rend les bitmaps dès
// le premier appel (utilisé par l'export PNG frame à frame, qui ne dispose
// pas d'une boucle de rattrapage). Toujours résolu (les erreurs de décodage
// ne bloquent pas l'export).
export function preloadImages(data) {
  const assets = Object.values((data && data.assets) || {});
  return Promise.all(assets.map((asset) => new Promise((resolve) => {
    const img = getImage(asset.dataUrl);
    if (img.complete) return resolve();
    img.addEventListener('load', () => resolve());
    img.addEventListener('error', () => resolve());
  })));
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

// Pivot de transformation (registration point à la Animate CC) — copie
// autonome de la logique de src/core/pivot.js : ce fichier est inliné tel
// quel (?raw) dans les exports HTML et l'objet de jeu, aucun import
// possible. Le pivot est en coordonnées de boîte locale ((0,0) = coin
// haut-gauche de l'objet ; espace du symbole pour une instance).
function hasPivot(el) {
  return el.kind !== 'bone' && el.pivotX != null && el.pivotY != null;
}

// Décalage à appliquer au contenu (après translate/rotate/scale de
// l'élément) pour que le pivot tombe sur l'origine : la rotation se fait
// autour de lui. null = aucun pivot explicite (comportement historique).
function pivotDrawShift(ctx, el) {
  if (!hasPivot(el)) return null;
  if (el.kind === 'instance') return { x: -el.pivotX, y: -el.pivotY };
  if (el.shapeType === 'line' || el.shapeType === 'path') {
    const pts = el.points || [];
    let minX = 0, minY = 0;
    if (pts.length) {
      minX = Math.min(...pts.map((p) => p.x));
      minY = Math.min(...pts.map((p) => p.y));
    }
    return { x: -(minX + el.pivotX), y: -(minY + el.pivotY) };
  }
  let h = el.height || 0;
  if (el.shapeType === 'text') {
    // Le pivot d'un texte est relatif au haut de la boîte réellement rendue
    // (hauteur = lignes × interligne), comme l'éditeur Konva.
    const fontSize = el.fontSize || 24;
    ctx.font = fontSize + 'px ' + (el.fontFamily || 'Arial');
    const lineHeight = (el.lineHeight != null ? el.lineHeight : 1.2) * fontSize;
    h = wrapTextLines(ctx, el.text || '', el.width).length * lineHeight;
  }
  return { x: (el.width || 0) / 2 - el.pivotX, y: h / 2 - el.pivotY };
}

// Caméra de scène (outil caméra de l'éditeur, façon Animate CC) — copie
// autonome de src/core/camera.js : ce fichier est inliné tel quel (?raw)
// dans les exports, aucun import possible (même discipline que le pivot).
// doc.camera = { keyframes: [{ index, x, y, zoom, rotation }] } | null ;
// interpolation linéaire permanente entre clés consécutives, tenue après la
// dernière, identité avant la première ou sans caméra. Sémantique : le cadre
// caméra est mappé sur TOUT le canvas de sortie — screen = centre +
// R(-rotation).S(zoom).(p - cam).
function clampCameraState(s, docWidth, docHeight) {
  return {
    x: typeof s.x === 'number' ? s.x : docWidth / 2,
    y: typeof s.y === 'number' ? s.y : docHeight / 2,
    zoom: typeof s.zoom === 'number' ? Math.min(10, Math.max(0.1, s.zoom)) : 1,
    rotation: typeof s.rotation === 'number' ? s.rotation : 0,
  };
}

// État caméra interpolé à l'image donnée ; null = identité (rendu historique).
export function resolveCameraAtFrame(camData, frameIndex, docWidth, docHeight) {
  var kfs = (camData && camData.keyframes) || [];
  if (!kfs.length) return null;
  var active = null;
  for (var i = 0; i < kfs.length; i++) {
    if (kfs[i].index <= frameIndex) active = kfs[i];
    else break;
  }
  if (!active) return null;
  var next = null;
  for (var j = 0; j < kfs.length; j++) {
    if (kfs[j].index > active.index) { next = kfs[j]; break; }
  }
  var a = clampCameraState(active, docWidth, docHeight);
  if (!next) return a;
  var b = clampCameraState(next, docWidth, docHeight);
  var span = next.index - active.index;
  var t = Math.min(1, Math.max(0, (frameIndex - active.index) / span));
  // Easing porté par la clé active (copie autonome de core/camera.js).
  var et = applyEasing(t, active.easing);
  return {
    x: a.x + (b.x - a.x) * et,
    y: a.y + (b.y - a.y) * et,
    zoom: a.zoom + (b.zoom - a.zoom) * et,
    rotation: a.rotation + (b.rotation - a.rotation) * et,
  };
}

// Applique la caméra à un contexte canvas : à appeler dans un save()/restore()
// autour du dessin de la scène racine. null = no-op (identité).
// screen = centre + R(-rotation) . S(zoom) . (p - cam) — le cadre caméra
// (doc/zoom x doc/zoom) est étiré sur TOUT le canvas de sortie.
export function applyCameraToContext(ctx, cam, width, height) {
  if (!cam) return;
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-(cam.rotation || 0) * Math.PI / 180);
  var s = cam.zoom || 1;
  ctx.scale(s, s);
  ctx.translate(-cam.x, -cam.y);
}

function drawShape(ctx, el, data) {
  ctx.save();
  ctx.translate(el.x, el.y);
  ctx.rotate((el.rotation || 0) * Math.PI / 180);
  ctx.scale(el.scaleX || 1, el.scaleY || 1);
  const piv = pivotDrawShift(ctx, el);
  if (piv) ctx.translate(piv.x, piv.y);
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
      if (hasValidWarp(el)) {
        // Le rendu par maillage travaille en (0,0)-(w,h) : on recentre pour
        // rester cohérent avec le dessin historique (-w/2, -h/2).
        ctx.save();
        ctx.translate(-el.width / 2, -el.height / 2);
        drawWarpImage(ctx, img, el);
        ctx.restore();
      } else {
        ctx.drawImage(img, -el.width / 2, -el.height / 2, el.width, el.height);
      }
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
    // actions) posés sur ce clip. Propagé aux enfants movieclip imbriqués :
    // chaque clip a sa propre timeline indépendante avec ses propres scripts
    // (comportement identique à Adobe Animate CC).
    this._onFrameScript = props.onFrameScript || null;
    this._lastScriptFrame = -1;
    // Callbacks onEnterFrame scopés à CE clip (posés par son script de
    // symbole — « classe AS3 » — ou par un script d'image du clip).
    this._enterFrameCbs = [];
    // Exécuteur externe des scripts d'image des clips ENFANTS (mode compilé
    // — exportCompiled.js) : function(symbolData, layerId, frame, clipScene).
    // S'il est absent, les scripts sont exécutés dynamiquement (comportement
    // historique des exports classiques et de l'éditeur).
    this._clipScriptExecutor = props.clipScriptExecutor || null;

    // Script de symbole (classe AS3-like) : exécuté UNE fois à la création de
    // l'instance — le constructeur du MovieClip — AVANT les scripts d'image
    // de la première image, avec un Scene scopé à ce clip. Absent/vide des
    // données = aucun effet (documents existants inchangés).
    if (this.data.script && this.data.script.trim()) {
      try {
        const clipScene = this._buildClipScene(this);
        /* TJS_NOEVAL_START (repli retiré par l'export compilé — exportCompiled.js) */
        var fn = new Function('Scene', 'Game', 'console', 'named', 'createjs', '"use strict";\n' + this.data.script);
        fn(clipScene, clipScene, console, {}, (typeof createjs !== 'undefined' ? createjs : undefined));
        /* TJS_NOEVAL_END */
      } catch (err) { console.error(err); }
    }
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
    // Boucle de jeu du clip (onEnterFrame posé par son script de symbole).
    // Un clip arrêté ne tick pas (sémantique Animate : pas d'enterFrame
    // sur un MovieClip en pause).
    if (this.isPlaying) {
      for (const cb of this._enterFrameCbs) {
        try { cb(this._frame); } catch (err) { console.error(err); }
      }
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
  // Chaque enfant reçoit un onFrameScript qui exécute ses propres scripts
  // d'image avec un Scene scopé (stop/play/etc. déléguent au clip enfant).
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
          const parent = this;
          child = new MovieClip(
            { ...symbol, frameRate: this.data.frameRate, symbols: this.data.symbols, assets: this.data.assets },
            {
              onFrameScript: function (frame) { parent._runChildFrameScript(child, frame); },
              clipScriptExecutor: this._clipScriptExecutor,
            }
          );
          this._children.set(el.id, child);
        }
        if (doUpdate) child.update(dt);
      }
    }
    for (const id of this._children.keys()) if (!seen.has(id)) this._children.delete(id);
  }

  // Exécute les scripts d'image d'un clip enfant avec un Scene scopé :
  // Scene.stop() arrête CE clip, pas le parent.
  _runChildFrameScript(childClip, frame) {
    for (const layer of childClip.data.layers) {
      const kf = getKeyframeAt(layer, frame);
      if (!kf || !kf.script || !kf.script.trim()) continue;
      try {
        const clipScene = this._buildClipScene(childClip);
        if (this._clipScriptExecutor) {
          this._clipScriptExecutor(childClip.data, layer.id, frame, clipScene);
        } else {
          /* TJS_NOEVAL_START (repli retiré par l'export compilé — exportCompiled.js) */
          var fn = new Function('Scene', 'Game', 'console', 'named', 'createjs', '"use strict";\n' + kf.script);
          fn(clipScene, clipScene, console, {}, (typeof createjs !== 'undefined' ? createjs : undefined));
          /* TJS_NOEVAL_END */
        }
      } catch (err) { console.error(err); }
    }
  }

  // Crée un objet Scene qui délègue au clip enfant (comportement Animate CC).
  _buildClipScene(childClip) {
    const clip = childClip;
    return {
      get width() { return clip.data.width || 0; },
      get height() { return clip.data.height || 0; },
      get frameRate() { return clip.data.frameRate || 24; },
      get frameCount() { return clip.data.frameCount || 1; },
      get currentFrame() { return clip.currentFrame; },
      get playing() { return clip.isPlaying; },
      play: function () { clip.play(); },
      stop: function () { clip.stop(); },
      gotoAndPlay: function (f) { clip.gotoAndPlay(f); },
      gotoAndStop: function (f) { clip.gotoAndStop(f); },
      // Boucle de jeu scopée à CE clip (callbacks par instance).
      onEnterFrame: function (cb) { if (typeof cb === 'function') clip._enterFrameCbs.push(cb); },
      random: function (n) { return Math.floor(Math.random() * (n || 1)); },
      log: function () { console.log.apply(console, arguments); },
    };
  }

  _renderLayers(ctx, layers, frameIndex) {
    // Masque de calque (layer.mask rogne les layer.masked au-dessus de lui en
    // lecture) : les calques masqués sont dessinés dans un canvas offscreen,
    // le masque est appliqué en 'destination-in', puis le bloc est aplati sur
    // le ctx principal. Copie autonome de computeMaskOwner (core/mask.js).
    const owner = (function computeMaskOwner(ls) {
      const own = new Array(ls.length).fill(-1);
      let openMask = -1;
      for (let i = ls.length - 1; i >= 0; i--) {
        const l = ls[i];
        if (l.mask) openMask = i;
        else if (l.masked && openMask >= 0) own[i] = openMask;
        else openMask = -1;
      }
      return own;
    })(layers);
    const hasMask = layers.some((l) => l.mask || l.masked);
    if (!hasMask) {
      for (const layer of layers) {
        if (!layer.visible) continue;
        for (const el of resolveLayerAtFrame(layer, frameIndex)) {
          if (el.kind === 'instance') this._renderInstance(ctx, el, frameIndex);
          else drawShape(ctx, el, this.data);
        }
      }
      return;
    }
    const groups = new Map(); // maskIndex -> { canvas, ctx }
    const offscreen = (w, h) => {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
      return { canvas: c, ctx: c.getContext('2d') };
    };
    const renderLayer = (c, layer) => {
      for (const el of resolveLayerAtFrame(layer, frameIndex)) {
        if (el.kind === 'instance') this._renderInstance(c, el, frameIndex);
        else drawShape(c, el, this.data);
      }
    };
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      if (!layer.visible) continue;
      const m = owner[i];
      if (m >= 0) {
        if (!groups.has(m)) groups.set(m, offscreen(this.data.width || 550, this.data.height || 400));
        renderLayer(groups.get(m).ctx, layer);
      } else if (layer.mask) {
        if (!groups.has(i)) groups.set(i, offscreen(this.data.width || 550, this.data.height || 400));
        const g = groups.get(i);
        g.ctx.save();
        g.ctx.globalCompositeOperation = 'destination-in';
        // Masque = silhouette seule : contour retiré (strokeWidth 0), sinon le
        // composite dest-in se comporte mal (même constat que côté éditeur).
        const maskNoStroke = {
          ...layer,
          keyframes: layer.keyframes.map((kf) => ({
            ...kf,
            elements: (kf.elements || []).map((e) => ({ ...e, strokeWidth: 0 })),
          })),
        };
        renderLayer(g.ctx, maskNoStroke);
        g.ctx.restore();
        ctx.drawImage(g.canvas, 0, 0);
      } else {
        renderLayer(ctx, layer);
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
    // Pivot explicite de l'instance (coordonnées du symbole) : le contenu
    // est décalé pour que le pivot tombe sur l'origine (parité éditeur).
    if (hasPivot(el)) ctx.translate(-el.pivotX, -el.pivotY);
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
