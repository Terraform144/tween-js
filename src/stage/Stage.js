import Konva from 'konva';
import { getContextLayers, getContextFrameCount, insertKeyframe, createShape, createInstance, createPathPoint, createBone, getChildBones, getAllChildBones, solveIK, calculateBoneWeightsForPoint, applyBoneTransformToPoint, nextSkeletonId, getSkeletonBones, cloneElement, getActiveKeyframe } from '../core/model.js';
import { onionFrames, tintElementForOnion } from '../core/onionSkin.js';
import { computeMaskOwner, computeMaskChain, hasMasks } from '../core/mask.js';
import { elementLocalBoxKonva, gradientPoint } from '../core/gradient.js';
import { gridLines, snapPoint, addGuide, removeGuide, rulerStep, nearestGuide } from '../core/grid.js';
import { hasPivot, pivotNodeOffset, pivotBoxFromNode, pivotMoveDelta } from '../core/pivot.js';
import { hasCamera, defaultCamera, resolveCameraAtFrame, upsertCameraKeyframe, removeCameraKeyframeAt, cameraLayerTransform, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX } from '../core/camera.js';
import { WARP_DEFAULT_COLS, WARP_DEFAULT_ROWS, defaultWarpGrid, ensureWarp, hasValidWarp, drawWarpImage, warpOutlinePath, warpBounds } from '../core/warp.js';
import { resolveLayersAtFrame } from '../playback/resolve.js';
import { getClipState } from '../runtime/clipStates.js';
import { notify } from '../state.js';
import { fullscreenElement } from '../util/fullscreen.js';
import { ICONS } from '../ui/icons.js';
import { brushToPoly, pressureToScale, spatterDots } from '../util/brushGeom.js';

const HANDLE_DRAG_THRESHOLD = 3; // px, avant qu'un clic-glissé plume ne devienne un point lisse
const CLOSE_PATH_THRESHOLD = 8; // px, distance au premier point pour fermer le tracé au clic
const BRUSH_MIN_DISTANCE = 2; // px, distance minimum entre points pour le pinceau

// Trace un chemin (segments droits ou courbes de Bézier) dans un contexte
// canvas déjà positionné en beginPath(). Partagé par le rendu Konva (scène
// éditeur) et l'aperçu en direct de l'outil plume — jamais par l'export, qui
// a sa propre copie autonome dans tweenRuntime.js (voir la mémoire projet).
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

function clonePathPoint(p) {
  return { x: p.x, y: p.y, cIn: p.cIn ? { x: p.cIn.x, y: p.cIn.y } : null, cOut: p.cOut ? { x: p.cOut.x, y: p.cOut.y } : null, smooth: p.smooth };
}

// Wraps a Konva.Stage and turns it into an Animate-like canvas: it renders
// the document model at the current frame/edit-context, and implements the
// drawing/selection tools. All committed edits go through the plain data
// model (core/model.js) and then call notify(state) to trigger a re-render
// everywhere (timeline, library, properties panel, ...).
export function createStage({ container, state, onSelectionChange = () => {} }) {
  const initialDoc = state.doc;

  // Scroller de la zone de travail : #stage-scroll (parent de #stage-container)
  // HORS plein écran — la feuille entière y déborde et les scrollbars couvrent
  // tout le cadre. EN plein écran, seul le sous-arbre de l'élément fullscreen
  // est rendu : c'est alors #stage-container lui-même qui scrolle (overflow:auto
  // via :fullscreen / .fs-css-active, voir style.css).
  const scrollEl = container.parentElement || container;
  const activeScroller = () => (fullscreenElement() === container) ? container : scrollEl;

  const panLayer = document.createElement('div');
  panLayer.className = 'stage-pan-layer';
  container.appendChild(panLayer);

  const konvaStage = new Konva.Stage({ container: panLayer, width: initialDoc.width, height: initialDoc.height });

  const bgLayer = new Konva.Layer({ listening: false });
  // Peau d'oignon : fantômes des images voisines sous le contenu courant,
  // au-dessus du fond. Non interactif, re-rempli à chaque render().
  const onionLayer = new Konva.Layer({ listening: false });
  const contentLayer = new Konva.Layer();
  const overlayLayer = new Konva.Layer();
  konvaStage.add(bgLayer, onionLayer, contentLayer, overlayLayer);

  // Pile des layers Konva de CONTENU (du bas vers le haut) : contentLayer +
  // éventuellement un layer dédié par segment masqué (renderLayersWithMasks).
  // Un masque en destination-in s'applique à tout le canvas de SON layer :
  // il faut donc un layer à part par bloc masque, sinon il effacerait aussi
  // les calques normaux peints avant dans le même layer. La pile est recréée
  // à chaque render (resetContentStack).
  let contentStack = [contentLayer];
  function resetContentStack() {
    for (const l of contentStack.slice(1)) l.destroy();
    contentStack = [contentLayer];
    contentLayer.destroyChildren();
  }
  function findContentNode(selector) {
    for (const l of contentStack) { const n = l.findOne(selector); if (n) return n; }
    return null;
  }
  function drawContent() { for (const l of contentStack) l.batchDraw(); }

  const bgRect = new Konva.Rect({ x: 0, y: 0, width: initialDoc.width, height: initialDoc.height, fill: initialDoc.backgroundColor });
  bgLayer.add(bgRect);
  bgLayer.draw();

  const transformer = new Konva.Transformer({
    rotateEnabled: true,
    borderStroke: '#cb4b16',
    anchorStroke: '#cb4b16',
    anchorFill: '#ffffff',
    anchorSize: 8,
  });
  const handleGroup = new Konva.Group();
  // Réticule du pivot de transformation (outil sélection, sélection simple)
  const pivotGroup = new Konva.Group();
  // Retenu visuel de l'outil rotation : rayon pivot->pointeur + angle
  const rotateGroup = new Konva.Group({ listening: false });
  // Cadre caméra de scène (outil caméra, façon Animate CC)
  const cameraGroup = new Konva.Group();
  // Grille de déformation posée sur un bitmap sélectionné (outil maillage)
  const meshGroup = new Konva.Group();
  overlayLayer.add(transformer, handleGroup, pivotGroup, rotateGroup, cameraGroup, meshGroup);

  // Grille de la scène + guides tirés depuis les règles (overlay, non interactif
  // sauf clic droit sur un guide pour le supprimer).
  const gridGroup = new Konva.Group({ listening: false });
  const guidesGroup = new Konva.Group();
  overlayLayer.add(gridGroup, guidesGroup);

  // Cache d'images décodées, indexé par dataUrl (immuable par contenu). Tant qu'une image n'est pas
  // décodée (chargement asynchrone depuis le dataUrl), le nœud affiche un
  // placeholder ; le onload déclenche un re-rendu pour la montrer.
  const imageCache = new Map();
  const imagePending = new Map();
  function getImage(assetId) {
    const asset = (state.doc.assets || {})[assetId];
    if (!asset || !asset.dataUrl) return null;
    // Cle = dataUrl (et non assetId) : les ids d'assets peuvent etre reemis
    // apres restauration du document (undo/redo, ouverture d'un projet) ;
    // deux contenus differents ne partagent jamais un dataUrl, le cache ne
    // peut donc pas servir les pixels d'une autre image.
    const key = asset.dataUrl;
    if (imageCache.has(key)) return imageCache.get(key);
    if (imagePending.has(key)) return null;
    const img = new Image();
    imagePending.set(key, img);
    img.onload = () => {
      imageCache.set(key, img);
      imagePending.delete(key);
      render(currentTick);
    };
    img.onerror = () => imagePending.delete(key);
    img.src = key;
    return null;
  }

  // Boutons flottants Valider/Annuler pour l'outil plume : sur mobile, sans
  // clavier, Entrée/Échap (voir plus bas) sont inaccessibles — sans ce
  // bouton, un tracé plume commencé au doigt ne pouvait jamais être terminé.
  const penActions = document.createElement('div');
  penActions.className = 'pen-actions';
  penActions.style.display = 'none';
  const btnPenCancel = document.createElement('button');
  btnPenCancel.type = 'button';
  btnPenCancel.className = 'pen-action-btn pen-cancel';
  btnPenCancel.title = 'Annuler le tracé (Échap)';
  btnPenCancel.innerHTML = ICONS.close + '<span>Annuler</span>';
  btnPenCancel.addEventListener('click', () => cancelDraw());
  const btnPenConfirm = document.createElement('button');
  btnPenConfirm.type = 'button';
  btnPenConfirm.className = 'pen-action-btn pen-confirm';
  btnPenConfirm.title = 'Valider la forme (Entrée)';
  btnPenConfirm.innerHTML = ICONS.check + '<span>Valider</span>';
  btnPenConfirm.addEventListener('click', () => finishPen(false));
  penActions.append(btnPenCancel, btnPenConfirm);
  container.appendChild(penActions);

  // Boutons flottants pour la chaîne d'ossatures (même principe que plume)
  const boneChainActions = document.createElement('div');
  boneChainActions.className = 'pen-actions';
  boneChainActions.style.display = 'none';
  const btnChainCancel = document.createElement('button');
  btnChainCancel.type = 'button';
  btnChainCancel.className = 'pen-action-btn pen-cancel';
  btnChainCancel.title = 'Annuler la chaîne (Échap)';
  btnChainCancel.innerHTML = ICONS.close + '<span>Annuler</span>';
  btnChainCancel.addEventListener('click', () => cancelDraw());
  const btnChainConfirm = document.createElement('button');
  btnChainConfirm.type = 'button';
  btnChainConfirm.className = 'pen-action-btn pen-confirm';
  btnChainConfirm.title = 'Valider la chaîne (Entrée)';
  btnChainConfirm.innerHTML = ICONS.check + '<span>Valider</span>';
  btnChainConfirm.addEventListener('click', () => finishBoneChain());
  boneChainActions.append(btnChainCancel, btnChainConfirm);
  container.appendChild(boneChainActions);

  function updatePenActions() {
    const active = !!(drawState && drawState.tool === 'pen');
    penActions.style.display = active ? 'flex' : 'none';
    if (active) btnPenConfirm.disabled = drawState.points.length < 2;
  }

  function updateBoneChainActions() {
    const active = !!(drawState && drawState.tool === 'boneChain');
    boneChainActions.style.display = active ? 'flex' : 'none';
    if (active) btnChainConfirm.disabled = drawState.points.length < 2;
  }

  let drawState = null;
  let marquee = null; // { start, node, additive } — sélection rectangulaire en cours (outil sélection)
  let subselectId = null; // id de l'élément path/line actuellement édité par l'outil sous-sélection
  let pointRefs = []; // nœuds Konva des ancres/poignées affichées, reconstruits à chaque sélection
  // Presse-papiers GLOBAL (hors state.doc, donc hors historique d'annulation),
  // partagé entre toutes les fenêtres-projets : copier dans un projet, basculer
  // d'onglet, coller dans l'autre. Contient les éléments + les assets (bitmaps)
  // et symboles (instances) référencés, pour que le collage fonctionne même
  // dans un document qui ne les connaît pas. Les ids sont globalement uniques
  // (compteur partagé dans core/model.js) -> importer asset/symbole avec le
  // même id dans un autre doc ne peut pas entrer en conflit.
  let clipboard = { elements: [], assets: {}, symbols: {} };
  let panStart = null; // { mouseX, mouseY, scrollLeft, scrollTop, scrollable, tx, ty } — glisser-déposer en cours avec la main
  let camPanBg = null; // { startPointer, startCam } — pan caméra depuis le FOND de la scène (outil caméra, clic hors cadre)
  const panOffset = { x: 0, y: 0 }; // décalage CSS translate courant de la feuille

  // Pan (outil main) : hors plein écran, TOUTE LA FEUILLE (#stage-container)
  // est translatée — le cadre entier se déplace dans la zone grise, même à 100%
  // quand aucun scroll n'est possible. En plein écran, la feuille UA impose
  // transform:none !important à l'élément fullscreen : on scrolle alors le
  // conteneur lui-même (le contenu glisse dans le cadre plein écran).
  function applyPanTransform() {
    const t = (panOffset.x || panOffset.y) ? `translate(${panOffset.x}px, ${panOffset.y}px)` : '';
    if (fullscreenElement() === container) {
      // Plein écran : transform interdit sur l'élément fullscreen -> panLayer
      // (enfant, autorisé). Le scroll du conteneur reste prioritaire quand
      // la feuille déborde (voir panStart.scrollable).
      panLayer.style.transform = t;
      container.style.transform = '';
    } else {
      container.style.transform = t;
      panLayer.style.transform = '';
    }
  }

  function resetPan() {
    scrollEl.scrollLeft = 0;
    scrollEl.scrollTop = 0;
    container.scrollLeft = 0;
    container.scrollTop = 0;
    panOffset.x = 0;
    panOffset.y = 0;
    applyPanTransform();
  }

  function currentLayers() {
    return getContextLayers(state.doc, state.editPath);
  }

  function activeLayer() {
    const layers = currentLayers();
    return layers.find((l) => l.id === state.selectedLayerId) || layers[layers.length - 1];
  }

  function commitToActiveKeyframe(mutator) {
    const layer = activeLayer();
    if (!layer || layer.locked) return null;
    const kf = insertKeyframe(layer, state.currentFrame);
    mutator(kf, layer);
    return kf;
  }

  // ---------------------------------------------------------------- render
  function buildNode(el) {
    let node;
    if (el.kind === 'instance') {
      node = new Konva.Group({});
    } else if (el.kind === 'bone') {
      const group = new Konva.Group({});
      const line = new Konva.Line({
        points: [0, 0, el.length, 0],
        stroke: el.color,
        strokeWidth: el.strokeWidth,
        lineCap: 'round',
      });
      const head = new Konva.Circle({
        x: 0, y: 0,
        radius: 6,
        fill: el.color,
        stroke: '#ffffff',
        strokeWidth: 1,
      });
      const tail = new Konva.Circle({
        x: el.length, y: 0,
        radius: 4,
        fill: el.color,
        stroke: '#ffffff',
        strokeWidth: 1,
      });
      group.add(line, head, tail);
      node = group;
      node.getSelfRect = function () {
        return { x: 0, y: -6, width: el.length, height: 12 };
      };
    } else if (el.kind === 'bitmap') {
      const img = getImage(el.assetId);
      if (img && hasValidWarp(el)) {
        // Maillage de déformation (cf. core/warp.js) : l'image est
        // redessinée par triangles, posant chaque cellule de la grille sur
        // sa forme déformée. elData = pose du modèle ; warpPointsLive =
        // prévisu pendant le drag d'une intersection (outil Maillage),
        // posée dans le modèle au dragend — jamais pendant le drag.
        const elData = { width: el.width, height: el.height, warp: el.warp, warpPoints: el.warpPoints };
        node = new Konva.Shape({
          sceneFunc: (ctx, shape) => {
            const d = shape.getAttr('elData');
            const live = shape.getAttr('warpPointsLive');
            drawWarpImage(ctx._context, img, live ? { ...d, warpPoints: live } : d);
          },
          hitFunc: (ctx, shape) => {
            const d = shape.getAttr('elData');
            const live = shape.getAttr('warpPointsLive');
            warpOutlinePath(ctx, d.warp.cols, d.warp.rows, live || d.warpPoints);
            ctx.fillStrokeShape(shape);
          },
        });
        node.setAttr('elData', elData);
        // Boîte du Transformer : englobante de la pose courante (une image
        // déformée sort du rectangle d'origine).
        node.getSelfRect = function () {
          return warpBounds(node.getAttr('warpPointsLive') || node.getAttr('elData').warpPoints);
        };
      } else if (img) {
        node = new Konva.Image({ image: img, width: el.width, height: el.height, offsetX: el.width / 2, offsetY: el.height / 2 });
      } else {
        // Placeholder tant que l'image décode (getImage déclenche un re-rendu au onload).
        node = new Konva.Rect({ width: el.width || 100, height: el.height || 100, offsetX: (el.width || 100) / 2, offsetY: (el.height || 100) / 2, fill: '#cfd8dc', stroke: '#90a4ae', strokeWidth: 1, dash: [4, 4], cornerRadius: 2 });
      }
      // Pas d'override de getSelfRect : le défaut de Konva.Image/Rect
      // (getSelfRect = {x:0, y:0, width, height} avec offsetX/offsetY) donne
      // déjà la bonne boîte pour le Transformer. Un rect centré ici DOUBLErait
      // le décalage (offset appliqué une fois dans la transform, une fois dans
      // la boîte) et le sélecteur glisserait vers le haut-gauche de l'image.
    } else {
      switch (el.shapeType) {
        case 'rect':
          node = new Konva.Rect({ offsetX: el.width / 2, offsetY: el.height / 2, width: el.width, height: el.height, fill: el.fill, stroke: el.stroke, strokeWidth: el.strokeWidth });
          break;
        case 'ellipse':
          node = new Konva.Ellipse({ radiusX: el.width / 2, radiusY: el.height / 2, fill: el.fill, stroke: el.stroke, strokeWidth: el.strokeWidth });
          break;
        case 'line':
        case 'path': {
          // Clone indépendant : el.points peut aliaser directement le
          // tableau du modèle (image tenue, sans tween) — l'édition de
          // points doit pouvoir muter elData librement pendant un drag
          // sans jamais toucher le modèle avant commitPoints().
          const elData = { points: el.points.map(clonePathPoint), closed: !!el.closed, brushPoly: el.brushPoly, brushSpatter: el.brushSpatter || null };
          const shapeAttrs = {
            fill: el.closed ? el.fill : undefined,
            stroke: el.stroke,
            strokeWidth: el.strokeWidth,
            lineCap: el.lineCap || 'round',
            lineJoin: el.lineJoin || 'round',
            sceneFunc: (ctx, shape) => {
              const d = shape.getAttr('elData');
              ctx.beginPath();
              if (d.brushPoly) {
                // Dessiner le polygone de brush directement
                if (d.points.length > 0) {
                  ctx.moveTo(d.points[0].x, d.points[0].y);
                  for (let i = 1; i < d.points.length; i++) {
                    ctx.lineTo(d.points[i].x, d.points[i].y);
                  }
                  if (d.closed) {
                    ctx.closePath();
                  }
                }
              } else {
                tracePath(ctx, d.points, d.closed);
              }
              ctx.fillStrokeShape(shape);
              // Éclaboussures : petits disques autour du tracé (même couleur de remplissage)
              if (d.brushSpatter && d.brushSpatter.length) {
                ctx.fillStyle = shape.fill() || '#000';
                for (const dot of d.brushSpatter) {
                  ctx.beginPath();
                  ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
                  ctx.fill();
                }
              }
            },
          };
          // Texture bitmap : mosaïque de l'asset image en remplissage du polygone
          if (el.brushPoly && el.brushTexture && el.brushTexture.assetId) {
            const img = getImage(el.brushTexture.assetId);
            if (img) {
              shapeAttrs.fill = undefined;
              shapeAttrs.fillPatternImage = img;
              shapeAttrs.fillPatternRepeat = 'repeat';
              shapeAttrs.fillPriority = 'pattern';
            }
          }
          node = new Konva.Shape(shapeAttrs);
          node.setAttr('elData', elData);
          // Konva.Shape générique : getSelfRect() par défaut se base sur les
          // attrs width/height (jamais renseignés ici) et renverrait une
          // boîte nulle — inutilisable pour le cadre de sélection (marquee)
          // ou le Transformer. On la recalcule depuis les points réels.
          node.getSelfRect = function () {
            const pts = elData.points;
            if (!pts.length) return { x: 0, y: 0, width: 0, height: 0 };
            const xs = pts.map((pt) => pt.x), ys = pts.map((pt) => pt.y);
            const minX = Math.min(...xs), maxX = Math.max(...xs);
            const minY = Math.min(...ys), maxY = Math.max(...ys);
            return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
          };
          break;
        }
        case 'text':
          node = new Konva.Text({
            width: el.width,
            text: el.text || 'Texte',
            fontSize: el.fontSize,
            fontFamily: el.fontFamily,
            fill: el.fill,
            align: el.align || 'center',
            lineHeight: el.lineHeight != null ? el.lineHeight : 1.2,
            wrap: 'word',
          });
          // La hauteur d'un texte dépend du nombre de lignes après retour à
          // la ligne (paragraphe) ; on centre donc sur la hauteur réellement
          // rendue plutôt que sur el.height, qui n'est plus utilisé pour le
          // texte (contrairement aux autres formes) et se désynchroniserait
          // dès que le contenu change de nombre de lignes.
          node.offsetX(el.width / 2);
          node.offsetY(node.height() / 2);
          break;
        default:
          node = new Konva.Rect({ width: 1, height: 1, fill: 'red' });
      }
    }
    // Pivot de transformation (registration point à la Animate CC) :
    // offsetX/offsetY placent le pivot sur l'origine du nœud — la rotation
    // (Transformer, interpolations, lecture) se fait autour de lui. Sans
    // pivot explicite, chaque type garde son centre historique : centre de
    // la boîte pour rect/ellipse/texte/bitmap, origine du nœud (premier
    // point) pour ligne/chemin, origine du symbole pour une instance, tête
    // d'os pour un bone (pas de pivot sur les bones, l'IK en dépend).
    if (el.kind !== 'bone') {
      const piv = pivotNodeOffset(el, el.shapeType === 'text' ? node.height() : null);
      node.offsetX(piv.x);
      node.offsetY(piv.y);
    }
    node.setAttrs({ x: el.x, y: el.y, rotation: el.rotation, scaleX: el.scaleX, scaleY: el.scaleY, opacity: el.opacity });
    node.id(el.id);
    node.setAttr('elKind', el.kind);
    node.setAttr('elShapeType', el.shapeType || null);
    node.setAttr('elLayerId', el.layerId);
    node.setAttr('hasPivot', hasPivot(el));
    if (el.kind === 'instance') node.setAttr('symbolId', el.symbolId);
    if (el.kind === 'bone') {
      node.setAttr('boneLength', el.length);
      node.setAttr('boneColor', el.color);
      node.setAttr('boneStrokeWidth', el.strokeWidth);
    }
    // Dégradé de remplissage (prime sur fill). RÈGLE Konva (vérifiée E2E) :
    // poser fill à null + les attrs du dégradé + fillPriority:'gradient' en UN
    // setAttrs — appeler fill(...) (même '#000') fait retomber sur la couleur
    // unie. Coordonnées dans le repère local du node (offset pivot compris).
    if (el.fillGradient && el.kind !== 'bone' && el.kind !== 'instance') {
      const g = el.fillGradient;
      const box = elementLocalBoxKonva(el, node.height ? node.height() : null);
      const stops = (g.stops || []).flatMap((s) => [s.offset, s.color]);
      const attrs = { fill: null };
      if (g.type === 'radial') {
        const c = gradientPoint(box, g.cx, g.cy);
        attrs.fillRadialGradientStartPoint = c;
        attrs.fillRadialGradientEndPoint = { x: c.x + Math.max(0.01, g.r * box.w), y: c.y };
        attrs.fillRadialGradientStartRadius = 0;
        attrs.fillRadialGradientEndRadius = Math.max(0.01, g.r * box.w);
        attrs.fillRadialGradientColorStops = stops;
      } else {
        attrs.fillLinearGradientStartPoint = gradientPoint(box, g.x1, g.y1);
        attrs.fillLinearGradientEndPoint = gradientPoint(box, g.x2, g.y2);
        attrs.fillLinearGradientColorStops = stops;
      }
      attrs.fillPriority = 'gradient';
      node.setAttrs(attrs);
    }
    return node;
  }

  // depth 0 = contenu directement éditable dans le contexte courant (scène
  // racine ou symbole en cours d'édition). En profondeur > 0 (contenu d'une
  // instance imbriquée), les objets restent visibles mais non interactifs :
  // il faut double-cliquer pour entrer dans ce symbole et l'éditer lui-même.
  function renderInto(parent, layers, frameIndex, tick, depth = 0) {
    // En lecture, les calques guide ne sont pas rendus (ils ne servent qu'à
    // calculer les trajectoires) ; en édition ils restent visibles/éditables.
    const elements = resolveLayersAtFrame(layers, frameIndex, { includeGuides: !state.playing });
    // Collecter tous les bones de cette frame pour le skinning
    const allBones = elements.filter((el) => el.kind === 'bone');
    
    for (const el of elements) {
      // Appliquer la déformation aux paths si un squelette leur est assigné
      let deformedEl = el;
      
      // Vérifier si l'élément a un skeletonId ou un boneId (rétrocompatibilité)
      const hasSkeleton = el.skeletonId && allBones.some((b) => b.skeletonId === el.skeletonId);
      const hasBoneId = el.boneId && allBones.some((b) => b.id === el.boneId);
      
      if (el.kind === 'shape' && (el.shapeType === 'path' || el.shapeType === 'line') && (hasSkeleton || hasBoneId)) {
        // Cloner l'élément pour ne pas modifier l'original
        deformedEl = JSON.parse(JSON.stringify(el));
        
        // Obtenir les bones à considérer
        let bonesToUse = allBones;
        if (hasSkeleton) {
          // Utiliser tous les bones du squelette
          bonesToUse = allBones.filter((b) => b.skeletonId === el.skeletonId);
        } else if (hasBoneId) {
          // Rétrocompatibilité : utiliser le bone unique + ses enfants
          const rootBone = allBones.find((b) => b.id === el.boneId);
          if (rootBone) {
            // Trouver tous les bones enfants récursivement
            bonesToUse = [rootBone];
            const allChildren = getAllChildBones(kf, rootBone.id);
            // Ajouter tous les descendants r�cursivement
            bonesToUse.push(...allChildren);
          }
        }
        
        if (bonesToUse.length > 0) {
          // Calculer les poids pour chaque point en considérant les bones du squelette
          for (let i = 0; i < deformedEl.points.length; i++) {
            const point = deformedEl.points[i];
            const weights = calculateBoneWeightsForPoint(point, bonesToUse);
            if (weights.length > 0) {
              // Appliquer la transformation
              const deformed = applyBoneTransformToPoint(point, bonesToUse, weights);
              deformedEl.points[i] = { ...point, x: deformed.x, y: deformed.y };
            }
          }
        }
      }
      
      const node = buildNode(deformedEl);
      parent.add(node);
      if (depth === 0) attachInteraction(node, el);
      if (el.kind === 'instance') {
        const symbol = state.doc.symbols[el.symbolId];
        if (symbol) {
          const childFrame = symbol.type === 'graphic'
            ? frameIndex % Math.max(1, symbol.frameCount)
            : getClipState(el.id).currentFrame;
          renderInto(node, symbol.layers, childFrame, tick, depth + 1);
        }
      }
    }
  }

  // ------------------------------------------------ masque de calque (layer mask)
  // Un calque layer.mask rogne les calques layer.masked juste en dessous de lui
  // (computeMaskOwner, core/mask.js). Rendu : chaque bloc masque a son PROPRE
  // Konva.Layer (un destination-in s'applique à tout le canvas de son layer —
  // mettre le bloc dans contentLayer effacerait les calques normaux peints
  // avant). Dans ce layer : d'abord les calques masqués, puis le masque en
  // globalCompositeOperation 'destination-in'. Le masque rendu à depth=1
  // (pas d'attachInteraction) + listening muté sur chaque nœud feuille — ne
  // JAMAIS poser listening:false sur le groupe gco lui-même (Konva applique
  // quand même le gco mais ne dessine pas les enfants). Tant que le calque
  // masque est sélectionné, il est rendu normal (visible + interactif).
  // Silhouette d'un calque masque : pas de contour, pas de dégradé, fill opaque
  // (un stroke dans un groupe destination-in casse le composite Konva).
  function maskSilhouetteOf(maskLayer) {
    return {
      ...maskLayer,
      keyframes: (maskLayer.keyframes || []).map((kf) => ({
        ...kf,
        elements: (kf.elements || []).map((e) => ({ ...e, stroke: undefined, strokeWidth: 0, fill: '#000000', fillGradient: null })),
      })),
    };
  }

  function renderLayersWithMasks(layers, frameIndex, tick) {
    if (!hasMasks(layers)) {
      renderInto(contentLayer, layers, frameIndex, tick, 0);
      return;
    }
    // v2 : imbrication via computeMaskChain — chaque calque masqué porte la
    // chaîne de ses masques (externe -> interne). On regroupe les calques
    // masqués par chaîne identique : un Konva.Layer dédié par groupe, avec
    // un destination-in par masque de la chaîne (l'intersection est
    // commutative, l'ordre d'application n'a pas d'importance).
    const chains = computeMaskChain(layers);
    const segments = []; // { kind:'normal'|'mask'|'masklayer', layers?, chain? }
    let cur = null;
    const groups = new Map(); // clé chaîne -> segment mask
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      if (!layer.visible) continue;
      const chain = chains[i];
      if (chain.length > 0) {
        const key = JSON.stringify(chain);
        let seg = groups.get(key);
        if (!seg) { seg = { kind: 'mask', chain, layers: [] }; groups.set(key, seg); segments.push(seg); cur = null; }
        seg.layers.push(layer);
      } else if (layer.mask) {
        // calque masque non masqué lui-même : segment dédié (visible seulement
        // s'il est sélectionné — sinon seule sa silhouette en dest-in compte)
        cur = { kind: 'masklayer', layers: [layer] };
        segments.push(cur);
      } else {
        if (!cur || cur.kind !== 'normal') { cur = { kind: 'normal', layers: [] }; segments.push(cur); }
        cur.layers.push(layer);
      }
    }
    const segLayers = []; // { kl, ghost? } dans l'ordre des segments
    segments.forEach((seg, idx) => {
      const kl = idx === 0 ? contentLayer : new Konva.Layer();
      if (idx > 0) {
        konvaStage.add(kl);
        contentStack.push(kl);
        // même transform que contentLayer (caméra de scène)
        kl.position(contentLayer.position());
        kl.rotation(contentLayer.rotation());
        kl.scale(contentLayer.scale());
      }
      if (seg.kind === 'normal') { renderInto(kl, seg.layers, frameIndex, tick, 0); segLayers.push({ kl, ghost: null }); return; }
      if (seg.kind === 'masklayer') {
        // masque non masqué : rendu normal seulement s'il est sélectionné
        const maskLayer = seg.layers[0];
        if (maskLayer.id === state.selectedLayerId) renderInto(kl, seg.layers, frameIndex, tick, 0);
        segLayers.push({ kl, ghost: null });
        return;
      }
      // segment masqué avec chaîne de masques
      const chain = seg.chain; // externe -> interne
      // Un calque qui est LUI-MÊME masque (mask+masked) ne se rend pas comme
      // contenu visible : seule sa silhouette sert (dans les groupes dest-in
      // des chaînes qui le référencent) — sauf s'il est sélectionné (édition).
      const masked = seg.layers.filter((l) => !l.mask || l.id === state.selectedLayerId);
      // Group englobant INDISPENSABLE : un gco sur un enfant DIRECT du layer
      // s'applique mal (Konva), mais dans un Group ça marche (vérifié E2E).
      const g = new Konva.Group();
      kl.add(g);
      if (masked.length) renderInto(g, masked, frameIndex, tick, 0);
      const mute = (n) => { n.listening(false); if (n.children) n.children.forEach(mute); };
      for (const m of chain) {
        const maskLayer = layers[m];
        const sil = maskSilhouetteOf(maskLayer);
        if (maskLayer.id === state.selectedLayerId) {
          renderInto(g, [maskLayer], frameIndex, tick, 0); // édition : masque visible
        } else {
          const mg = new Konva.Group({ globalCompositeOperation: 'destination-in' });
          g.add(mg);
          renderInto(mg, [sil], frameIndex, tick, 1);
          mg.children.forEach(mute);
        }
      }
      // ÉDITION seule : fantôme des parties ROGNÉES en gris clair transparent
      // 15%. Layer Konva DÉDIÉ + destination-out pour chaque masque de la chaîne.
      let ghost = null;
      if (!state.playing && masked.length) {
        ghost = new Konva.Layer({ listening: false });
        konvaStage.add(ghost);
        contentStack.push(ghost);
        ghost.position(contentLayer.position());
        ghost.rotation(contentLayer.rotation());
        ghost.scale(contentLayer.scale());
        const g2 = new Konva.Group();
        ghost.add(g2);
        renderInto(g2, masked.map(ghostLayerOf), frameIndex, tick, 1);
        for (const m of chain) {
          const mg2 = new Konva.Group({ globalCompositeOperation: 'destination-out' });
          g2.add(mg2);
          renderInto(mg2, [maskSilhouetteOf(layers[m])], frameIndex, tick, 1);
        }
      }
      segLayers.push({ kl, ghost });
    });
    // ordre des layers : visible et fantôme intercalés, dans l'ordre des segments
    segLayers.forEach((s, k) => {
      s.kl.zIndex(2 + 2 * k);
      if (s.ghost) s.ghost.zIndex(2 + 2 * k + 1);
    });
  }

  // Fantôme des parties rognées d'un calque masqué (édition seule) : gris
  // clair transparent à 15% (demande user). fill/stroke remplacés par la
  // couleur fantôme ; bitmap/instance = opacité x 0.15 seule ; bone = color.
  const GHOST_COLOR = 'rgba(176,176,176,0.15)';
  function ghostLayerOf(layer) {
    return {
      ...layer,
      keyframes: (layer.keyframes || []).map((kf) => ({
        ...kf,
        elements: (kf.elements || []).map((e) => {
          if (e.kind === 'bitmap' || e.kind === 'instance') return { ...e, opacity: (e.opacity == null ? 1 : e.opacity) * 0.15 };
          if (e.kind === 'bone') return { ...e, color: GHOST_COLOR };
          return { ...e, fill: GHOST_COLOR, stroke: e.stroke ? GHOST_COLOR : e.stroke, fillGradient: null };
        }),
      })),
    };
  }

  // ------------------------------------------------ peau d'oignon (onion skin)
  // Fantômes des images voisines de la tête de lecture, teintés bleu (passé)
  // / rouge (futur), opacité dégressive — voir core/onionSkin.js. Uniquement
  // HORS lecture (pendant la lecture la tête avance : pas de fantôme fixe).
  // Rendu dans onionLayer, sous le contenu courant, non interactif. Les
  // instances de symboles sont résolues à la frame fantôme (modulo leur
  // frameCount) : on voit aussi le fantôme du contenu interne du clip.
  // v1 : pas de skinning (déformation par bones) appliqué aux fantômes.
  function renderOnionInto(parent, layers, frameIndex, tint, alpha, depth = 0) {
    const elements = resolveLayersAtFrame(layers, frameIndex);
    for (const el of elements) {
      const node = buildNode(tintElementForOnion(el, tint, alpha));
      node.listening(false);
      parent.add(node);
      if (el.kind === 'instance') {
        const symbol = state.doc.symbols[el.symbolId];
        if (symbol) {
          const childFrame = frameIndex % Math.max(1, symbol.frameCount);
          renderOnionInto(node, symbol.layers, childFrame, tint, alpha, depth + 1);
        }
      }
    }
  }

  function renderOnionSkin() {
    onionLayer.destroyChildren();
    if (!state.playing) {
      const n = getContextFrameCount(state.doc, state.editPath);
      for (const f of onionFrames(state.currentFrame, n, state.onionSkin)) {
        const g = new Konva.Group({ listening: false });
        renderOnionInto(g, currentLayers(), f.index, f.tint, f.alpha, 0);
        onionLayer.add(g);
      }
    }
    onionLayer.draw();
  }

  // ------------------------------------------------ grille + guides + règles
  // Snap : d'abord la grille (si visible), puis les GUIDES qui gagnent s'ils
  // sont à moins de 6px — même si la grille est masquée, les guides snappent.
  function snapIfEnabled(x, y) {
    if (!state.grid.snap) return { x, y };
    let nx = x, ny = y;
    if (state.grid.visible) {
      const p = snapPoint({ x, y }, state.grid.spacing);
      nx = p.x;
      ny = p.y;
    }
    const g = state.doc.guides || {};
    const gv = nearestGuide(g.v, x, 6);
    if (gv != null) nx = gv;
    const gh = nearestGuide(g.h, y, 6);
    if (gh != null) ny = gh;
    return { x: nx, y: ny };
  }

  function refreshGridAndGuides() {
    gridGroup.destroyChildren();
    guidesGroup.destroyChildren();
    const doc = state.doc;
    const sp = state.grid.spacing;
    if (state.grid.visible) {
      const { xs, ys } = gridLines(doc.width, doc.height, sp);
      for (const x of xs) {
        gridGroup.add(new Konva.Line({
          points: [x, 0, x, doc.height],
          stroke: (sp > 0 && x % (sp * 5) === 0) ? 'rgba(7,54,66,0.18)' : 'rgba(7,54,66,0.08)',
          strokeWidth: 1, listening: false,
        }));
      }
      for (const y of ys) {
        gridGroup.add(new Konva.Line({
          points: [0, y, doc.width, y],
          stroke: (sp > 0 && y % (sp * 5) === 0) ? 'rgba(7,54,66,0.18)' : 'rgba(7,54,66,0.08)',
          strokeWidth: 1, listening: false,
        }));
      }
    }
    const g = doc.guides || { v: [], h: [] };
    for (const x of g.v || []) {
      const ln = new Konva.Line({ points: [x, 0, x, doc.height], stroke: 'rgba(203,75,22,0.55)', strokeWidth: 1, dash: [6, 4], hitStrokeWidth: 8 });
      ln.on('contextmenu', (e) => { e.evt.preventDefault(); removeGuide(doc, 'v', x); notify(state); });
      guidesGroup.add(ln);
    }
    for (const y of g.h || []) {
      const ln = new Konva.Line({ points: [0, y, doc.width, y], stroke: 'rgba(203,75,22,0.55)', strokeWidth: 1, dash: [6, 4], hitStrokeWidth: 8 });
      ln.on('contextmenu', (e) => { e.evt.preventDefault(); removeGuide(doc, 'h', y); notify(state); });
      guidesGroup.add(ln);
    }
    renderRulers();
  }

  // Règles : deux bandes DOM épinglées dans #stage-wrap (hors du scroller
  // #stage-scroll : elles ne défilent pas avec la scène), graduations
  // selon zoom/scroll. Glisser depuis une règle pose un guide (doc.guides).
  const rulersHost = container.closest('#stage-wrap') || container.parentElement || container;
  const rulerH = document.createElement('div');
  rulerH.id = 'ruler-h';
  const rulerV = document.createElement('div');
  rulerV.id = 'ruler-v';
  rulersHost.appendChild(rulerH);
  rulersHost.appendChild(rulerV);

  function renderRulers() {
    const on = state.grid.rulers !== false;
    rulerH.style.display = on ? 'block' : 'none';
    rulerV.style.display = on ? 'block' : 'none';
    if (!on) return;
    const wrapRect = rulersHost.getBoundingClientRect();
    const stageRect = konvaStage.container().getBoundingClientRect();
    const scale = konvaStage.scaleX() || 1;
    drawRuler(rulerH, 'h', wrapRect, stageRect, scale);
    drawRuler(rulerV, 'v', wrapRect, stageRect, scale);
  }

  function drawRuler(el, orient, wrapRect, stageRect, scale) {
    const horizontal = orient === 'h';
    const w = horizontal ? Math.max(10, Math.round(wrapRect.width)) : 16;
    const h = horizontal ? 16 : Math.max(10, Math.round(wrapRect.height));
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    if (!el.firstChild) el.appendChild(document.createElement('canvas'));
    const cv = el.firstChild;
    if (cv.width !== w) cv.width = w;
    if (cv.height !== h) cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#eee8d5';
    ctx.fillRect(0, 0, w, h);
    const off = horizontal ? stageRect.left - wrapRect.left : stageRect.top - wrapRect.top;
    const scene0 = -off / scale;
    const step = rulerStep(scale);
    const limit = horizontal ? w : h;
    ctx.strokeStyle = '#93a1a1';
    ctx.fillStyle = '#586e75';
    ctx.font = '8px sans-serif';
    ctx.lineWidth = 1;
    for (let s = Math.ceil(scene0 / step) * step; s * scale + off <= limit; s += step) {
      const px = Math.round(s * scale + off);
      ctx.beginPath();
      if (horizontal) { ctx.moveTo(px, 10); ctx.lineTo(px, 16); } else { ctx.moveTo(10, px); ctx.lineTo(16, px); }
      ctx.stroke();
      if (s % (step * 5) === 0) {
        const label = String(s);
        if (horizontal) ctx.fillText(label, px + 1, 9); else ctx.fillText(label, 1, px + 8);
      }
    }
  }

  function rulerDragStart(orient) {
    let temp = null;
    let pos = null;
    const move = (ev) => {
      const stageRect = konvaStage.container().getBoundingClientRect();
      const scale = konvaStage.scaleX() || 1;
      pos = orient === 'h' ? (ev.clientY - stageRect.top) / scale : (ev.clientX - stageRect.left) / scale;
      if (!temp) {
        temp = new Konva.Line({
          points: orient === 'h' ? [0, pos, state.doc.width, pos] : [pos, 0, pos, state.doc.height],
          stroke: 'rgba(203,75,22,0.8)', strokeWidth: 1, listening: false,
        });
        guidesGroup.add(temp);
      } else {
        temp.points(orient === 'h' ? [0, pos, state.doc.width, pos] : [pos, 0, pos, state.doc.height]);
      }
      overlayLayer.batchDraw();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (temp) temp.destroy();
      if (pos != null && pos >= 0) {
        const max = orient === 'h' ? state.doc.height : state.doc.width;
        if (pos <= max) { addGuide(state.doc, orient === 'h' ? 'h' : 'v', pos); notify(state); }
      }
      overlayLayer.batchDraw();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }
  rulerH.addEventListener('mousedown', (e) => { e.preventDefault(); rulerDragStart('h'); });
  rulerV.addEventListener('mousedown', (e) => { e.preventDefault(); rulerDragStart('v'); });
  // Au scroll de la scène, seules les graduations des règles sont redessinées
  // (les bandes restent épinglées dans #stage-wrap, hors du scroller).
  scrollEl.addEventListener('scroll', () => renderRulers());
  container.addEventListener('scroll', () => renderRulers());

  // ------------------------------------------------------------ caméra
  // Pendant la lecture, le monde entier (page + contenu) est vu à travers
  // la caméra : la transform document->cadre est appliquée à bgLayer ET
  // contentLayer comme position/rotation/échelle de calque (l'espace du
  // canvas de sortie reste doc.width x doc.height, seule la portion de
  // scène vue change). Hors lecture : identité — l'édition reste
  // exactement le comportement historique, le cadre caméra est affiché en
  // surimpression (refreshCameraFrame). Réservé à la scène racine : la
  // caméra est une notion de document, pas de symbole.
  function applyCameraTransform() {
    const doc = state.doc;
    const cam = (state.playing && !state.editPath.length && hasCamera(doc))
      ? resolveCameraAtFrame(doc, state.currentFrame)
      : null;
    const lt = cameraLayerTransform(cam, doc.width, doc.height);
    for (const layer of [bgLayer, contentLayer]) {
      if (lt) {
        layer.position({ x: lt.x, y: lt.y });
        layer.rotation(lt.rotation);
        layer.scale({ x: lt.scaleX, y: lt.scaleY });
      } else {
        layer.position({ x: 0, y: 0 });
        layer.rotation(0);
        layer.scale({ x: 1, y: 1 });
      }
    }
  }

  // Cadre caméra (outil Caméra) : liseré pointillé autour de ce que la
  // caméra voit à l'image courante (état interpolé entre images clés).
  // Interactions (outil actif uniquement) : glisser l'intérieur = pan,
  // poignées d'angle = zoom, poignée au-dessus = rotation. Chaque geste pose
  // une image clé caméra à l'image courante (Suppr = la supprime). Même
  // discipline que le réticule pivot : aucun notify()/render() pendant un
  // drag, le modèle n'est touché qu'au dragend.
  let cameraDrag = null; // { kind: 'pan'|'zoom'|'rotate', startCam, startDist|startAngle, rotAcc }

  function cameraTouchGuard(e) {
    // Leçon sessions 8/14 : sans preventDefault sur touchstart, le
    // navigateur rejoue la séquence souris émulée et le drag partait deux
    // fois ; cancelBubble : ni marquee ni sélection sous le cadre.
    if (e.evt.type === 'touchstart' && e.evt.cancelable) e.evt.preventDefault();
    e.cancelBubble = true;
  }

  // Angle (degrés) et distance du pointeur autour du centre du cadre, en
  // repère MONDE (espace document, overlayLayer non transformé) — jamais en
  // repère local du groupe : le groupe tourne pendant le drag de rotation et
  // un angle local créerait une boucle de rétroaction (le retenu
  // réappliquerait son propre déplacement). Même principe que le Transformer
  // Konva pour sa poignée de rotation.
  function cameraPointerPolar(g) {
    const p = stagePointer();
    if (!p) return null;
    return {
      angle: Math.atan2(p.y - g.y(), p.x - g.x()) * 180 / Math.PI,
      dist: Math.hypot(p.x - g.x(), p.y - g.y()),
    };
  }

  function refreshCameraFrame() {
    cameraGroup.destroyChildren();
    cameraDrag = null;
    if (state.playing || state.editPath.length) return;
    const doc = state.doc;
    const cam = resolveCameraAtFrame(doc, state.currentFrame) || defaultCamera(doc);
    const active = state.currentTool === 'camera';
    // Hors outil caméra, le cadre reste visible (sans interaction) tant
    // qu'une caméra existe — retour d'information comme le cadre caméra
    // d'Animate.
    if (!active && !hasCamera(doc)) return;

    const w = doc.width / cam.zoom, h = doc.height / cam.zoom;
    const g = new Konva.Group({
      x: cam.x, y: cam.y, rotation: cam.rotation,
      draggable: active, listening: active,
    });
    const rect = new Konva.Rect({
      x: -w / 2, y: -h / 2, width: w, height: h,
      stroke: '#cb4b16', strokeWidth: 1, dash: [5, 4],
      fill: 'rgba(0,0,0,0)', // capte le glisser dans tout le cadre (pan)
      listening: active,
    });
    g.add(rect);

    // Poignée de rotation : hampe au-dessus du bord haut + poire. La hampe
    // (ligne fine) n'écoute pas, seule la poire est draggable.
    let rotLine = null, rotHandle = null, corners = [];
    if (active) {
      rotLine = new Konva.Line({ points: [0, -h / 2, 0, -h / 2 - 22], stroke: '#cb4b16', strokeWidth: 1.2, listening: false });
      rotHandle = new Konva.Group({ x: 0, y: -h / 2 - 28, draggable: true });
      const rotHit = new Konva.Circle({ radius: 14, fill: 'rgba(0,0,0,0)' });
      const rotDot = new Konva.Circle({ radius: 6, fill: '#ffffff', stroke: '#cb4b16', strokeWidth: 1.5, listening: false });
      rotHandle.add(rotHit, rotDot);
      rotHandle.on('mousedown touchstart', cameraTouchGuard);
      rotHandle.on('dragstart', () => {
        const p = cameraPointerPolar(g);
        if (!p) return;
        cameraDrag = { kind: 'rotate', startCam: { ...cam }, lastAngle: p.angle, rotAcc: cam.rotation };
      });
      rotHandle.on('dragmove', () => {
        if (!cameraDrag || cameraDrag.kind !== 'rotate') return;
        const p = cameraPointerPolar(g);
        if (!p) return;
        // Accumulé par plus court chemin à chaque move : les tours
        // complets du geste continuent de tourner au-delà de ±180°.
        let d = p.angle - cameraDrag.lastAngle;
        cameraDrag.lastAngle = p.angle;
        d = ((d + 540) % 360) - 180;
        cameraDrag.rotAcc += d;
        g.rotation(cameraDrag.rotAcc);
        overlayLayer.batchDraw();
      });
      rotHandle.on('dragend', () => {
        if (!cameraDrag || cameraDrag.kind !== 'rotate') return;
        const rot = ((cameraDrag.rotAcc % 360) + 540) % 360 - 180;
        cameraDrag = null;
        upsertCameraKeyframe(state.doc, state.currentFrame, { rotation: rot });
        notify(state);
      });
      g.add(rotLine, rotHandle);

      // Poignées d'angle : le zoom suit la distance pointeur->centre
      // (facteur du zoom initial) — insensible à la rotation du cadre.
      const cornerPos = (cw, ch) => [
        { x: -cw / 2, y: -ch / 2 }, { x: cw / 2, y: -ch / 2 },
        { x: cw / 2, y: ch / 2 }, { x: -cw / 2, y: ch / 2 },
      ];
      const layoutFrame = (cw, ch) => {
        rect.position({ x: -cw / 2, y: -ch / 2 });
        rect.size({ width: cw, height: ch });
        rotLine.points([0, -ch / 2, 0, -ch / 2 - 22]);
        rotHandle.position({ x: 0, y: -ch / 2 - 28 });
        const pts = cornerPos(cw, ch);
        corners.forEach((a, i) => a.position(pts[i]));
      };
      for (const pos of cornerPos(w, h)) {
        const a = new Konva.Group({ x: pos.x, y: pos.y, draggable: true });
        a.add(new Konva.Circle({ radius: 14, fill: 'rgba(0,0,0,0)' }));
        a.add(new Konva.Circle({ radius: 6, fill: '#ffffff', stroke: '#cb4b16', strokeWidth: 1.5, listening: false }));
        a.on('mousedown touchstart', cameraTouchGuard);
        a.on('dragstart', () => {
          const p = cameraPointerPolar(g);
          if (!p) return;
          cameraDrag = { kind: 'zoom', startCam: { ...cam }, startDist: p.dist, zoom: cam.zoom };
        });
        a.on('dragmove', () => {
          if (!cameraDrag || cameraDrag.kind !== 'zoom') return;
          const p = cameraPointerPolar(g);
          if (!p) return;
          if (!p.dist || !cameraDrag.startDist) return;
          const zoom = Math.min(CAMERA_ZOOM_MAX, Math.max(CAMERA_ZOOM_MIN, cameraDrag.startCam.zoom * p.dist / cameraDrag.startDist));
          cameraDrag.zoom = zoom;
          const cw = doc.width / zoom, ch = doc.height / zoom;
          layoutFrame(cw, ch);
          overlayLayer.batchDraw();
        });
        a.on('dragend', () => {
          if (!cameraDrag || cameraDrag.kind !== 'zoom') return;
          const zoom = cameraDrag.zoom;
          cameraDrag = null;
          upsertCameraKeyframe(state.doc, state.currentFrame, { zoom });
          notify(state);
        });
        g.add(a);
        corners.push(a);
      }
    }

    g.on('mousedown touchstart', cameraTouchGuard);
    g.on('dragend', (e) => {
      // Pan : la position du groupe EST le centre caméra (l'overlay ne
      // porte ni rotation de page ni zoom d'affichage — espace document).
      // Garde e.target === g : le dragend d'une POIGNÉE bubble jusqu'au
      // groupe (Konva), il ne doit pas poser de clé pan en plus.
      if (e.target !== g || state.currentTool !== 'camera') return;
      upsertCameraKeyframe(state.doc, state.currentFrame, { x: g.x(), y: g.y() });
      notify(state);
    });
    cameraGroup.add(g);
  }

  // -------------------------------------------------------- outil maillage
  // Grille de déformation posée sur un bitmap sélectionné (outil Maillage,
  // W) : les intersections sont glissables ; chaque relâcher pose une image
  // clé contenant la pose des points, et le tween entre deux poses déforme
  // l'image (interpolateElement gère warpPoints comme les points de
  // courbe). Suppr = revenir à la pose d'identité à l'image courante.
  // Même discipline que l'outil caméra : aucun notify()/render() pendant
  // le drag — la prévisu passe par l'attr warpPointsLive du nœud, le
  // modèle n'est touché qu'au dragend.
  let meshDrag = null; // { id, layerId, cols, rows, pts, index }

  function meshTouchGuard(e) {
    // Sans preventDefault sur touchstart, le navigateur rejoue la
    // séquence souris émulée et le drag partait deux fois (leçons 8/14) ;
    // cancelBubble : ni marquee ni sélection sous une poignée.
    if (e.evt.type === 'touchstart' && e.evt.cancelable) e.evt.preventDefault();
    e.cancelBubble = true;
  }

  function selectedBitmapNode() {
    if (state.selectedElementIds.length !== 1) return null;
    const node = findContentNode('#' + state.selectedElementIds[0]);
    if (!node || node.getAttr('elKind') !== 'bitmap' || isLocked(node.getAttr('elLayerId'))) return null;
    return node;
  }

  // Reconstruit les poignées de la grille sur le bitmap sélectionné. Si
  // l'image n'est pas encore maillée, montre la lattice d'identité : le
  // premier dragend activera le maillage (ensureWarp au commit).
  function refreshMeshHandles() {
    meshGroup.destroyChildren();
    meshDrag = null;
    if (state.playing || state.currentTool !== 'mesh') return;
    const node = selectedBitmapNode();
    if (!node) return;

    let cols, rows, pts;
    const d = node.getAttr('elData');
    if (d) {
      cols = d.warp.cols;
      rows = d.warp.rows;
      pts = d.warpPoints.map((p) => ({ ...p }));
    } else {
      cols = WARP_DEFAULT_COLS;
      rows = WARP_DEFAULT_ROWS;
      pts = defaultWarpGrid(node.width(), node.height(), cols, rows);
    }
    const t = node.getAbsoluteTransform(konvaStage);
    // Lignes de la grille (horizontales + verticales, en pointillés) :
    // ajoutées AVANT les poignées pour rester dessous ; non interactives.
    const seg = (a, b) => {
      const wa = t.point(a), wb = t.point(b);
      meshGroup.add(new Konva.Line({
        points: [wa.x, wa.y, wb.x, wb.y],
        stroke: '#cb4b16', strokeWidth: 1, dash: [4, 3], listening: false,
      }));
    };
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i < cols; i++) seg(pts[j * (cols + 1) + i], pts[j * (cols + 1) + i + 1]);
    }
    for (let i = 0; i <= cols; i++) {
      for (let j = 0; j < rows; j++) seg(pts[j * (cols + 1) + i], pts[(j + 1) * (cols + 1) + i]);
    }
    for (let idx = 0; idx < pts.length; idx++) {
      const world = t.point(pts[idx]);
      const h = new Konva.Group({ x: world.x, y: world.y, draggable: true });
      h.add(new Konva.Circle({ radius: 13, fill: 'rgba(0,0,0,0)' }));
      h.add(new Konva.Circle({ radius: 4.5, fill: '#fdf6e3', stroke: '#cb4b16', strokeWidth: 1.5, listening: false }));
      h.on('mousedown touchstart', meshTouchGuard);
      h.on('dragstart', () => {
        meshDrag = {
          id: node.id(),
          layerId: node.getAttr('elLayerId'),
          cols, rows,
          pts: pts.map((p) => ({ ...p })),
          index: idx,
        };
      });
      h.on('dragmove', () => {
        if (!meshDrag) return;
        const local = node.getAbsoluteTransform(konvaStage).copy().invert().point(h.position());
        meshDrag.pts[meshDrag.index] = { x: local.x, y: local.y };
        // Prévisu : le nœud se redessine avec la pose en cours, le
        // modèle reste intact jusqu'au dragend.
        node.setAttr('warpPointsLive', meshDrag.pts);
        drawContent();
        overlayLayer.batchDraw();
      });
      h.on('dragend', () => {
        if (!meshDrag) return;
        commitMeshPose(node);
      });
      meshGroup.add(h);
    }
  }

  function commitMeshPose(node) {
    const drag = meshDrag;
    meshDrag = null;
    node.setAttr('warpPointsLive', null);
    if (!drag) return;
    const layer = currentLayers().find((l) => l.id === drag.layerId);
    if (!layer || layer.locked) { refreshMeshHandles(); return; }
    const kf = insertKeyframe(layer, state.currentFrame);
    const el = kf.elements.find((e) => e.id === drag.id);
    if (!el || el.kind !== 'bitmap') { refreshMeshHandles(); return; }
    ensureWarp(el);
    el.warpPoints = drag.pts.map((p) => ({ x: p.x, y: p.y }));
    notify(state);
  }

  // Suppr (outil maillage + bitmap sélectionné) : pose d'identité à
  // l'image courante. Renvoie true si traité (le handler clavier ne doit
  // alors PAS supprimer l'élément).
  function resetMeshPose() {
    const node = selectedBitmapNode();
    if (!node) return false;
    const layer = currentLayers().find((l) => l.id === node.getAttr('elLayerId'));
    if (!layer || layer.locked) return false;
    const kf = insertKeyframe(layer, state.currentFrame);
    const el = kf.elements.find((e) => e.id === node.id());
    if (!el || el.kind !== 'bitmap') return false;
    ensureWarp(el);
    el.warpPoints = defaultWarpGrid(el.width, el.height, el.warp.cols, el.warp.rows);
    notify(state);
    return true;
  }

  let currentTick = 0;
  let lastBrushSize = null;
  let lastBrushPattern = null;
  
  function render(tick = 0) {
    // Changer d'outil en pleine plume ou chaîne de bones abandonnait un tracé fantôme
    if (drawState && drawState.tool === 'pen' && state.currentTool !== 'pen') cancelDraw();
    if (drawState && drawState.tool === 'boneChain' && state.currentTool !== 'boneChain') finishBoneChain();
    if (drawState && drawState.tool === 'brush' && state.currentTool !== 'brush') finishBrush();
    if (rotateDrag && state.currentTool !== 'rotate') finishRotate();
    
    // Mettre à jour l'aperçu du pinceau si la taille ou le pattern a changé
    if (drawState && drawState.tool === 'brush') {
      if (state.brushSize !== lastBrushSize || state.brushPattern !== lastBrushPattern) {
        lastBrushSize = state.brushSize;
        lastBrushPattern = state.brushPattern;
        updateBrushPreview();
      }
    } else {
      lastBrushSize = null;
      lastBrushPattern = null;
    }
    
    currentTick = tick;
    const doc = state.doc;
    bgRect.width(doc.width);
    bgRect.height(doc.height);
    bgRect.fill(doc.backgroundColor);
    resetContentStack();
    applyCameraTransform();
    renderLayersWithMasks(currentLayers(), state.currentFrame, tick);
    renderOnionSkin();
    refreshSelectionVisuals();
    refreshPointHandles();
    refreshCameraFrame();
    refreshMeshHandles();
    refreshGridAndGuides();
    for (const l of contentStack) l.draw();
    overlayLayer.batchDraw();
  }

  function refreshSelectionVisuals() {
    const nodes = state.selectedElementIds
      .map((id) => findContentNode('#' + id))
      .filter(Boolean);
    transformer.nodes(state.playing ? [] : nodes);
    refreshPivotHandle();
  }

  // ------------------------------------------------ pivot de transformation
  // Réticule draggable (cercle + croix, comme le registration point
  // d'Animate CC) posé sur le pivot de l'élément sélectionné. Le glisser
  // déplace le pivot SANS bouger l'objet à l'écran : x/y sont compensés en
  // continu (rotation/échelle incluses, voir pivotMoveDelta). Le commit en
  // modèle ne se fait qu'au dragend — pendant le drag on ne touche qu'au
  // nœud Konva, même principe que les poignées de la plume.
  let pivotDrag = null; // { id, layerId, startNodeX, startNodeY, startOff, rot, sx, sy }

  function refreshPivotHandle() {
    pivotGroup.destroyChildren();
    pivotDrag = null;
    if (state.playing || (state.currentTool !== 'select' && state.currentTool !== 'rotate')) return;
    if (state.selectedElementIds.length !== 1) return;
    const id = state.selectedElementIds[0];
    const node = findContentNode('#' + id);
    if (!node || node.getAttr('elKind') === 'bone') return;
    if (isLocked(node.getAttr('elLayerId'))) return;

    const world = node.getAbsoluteTransform(konvaStage).point({ x: node.offsetX(), y: node.offsetY() });
    const cross = new Konva.Group({ x: world.x, y: world.y, draggable: true });
    const ring = new Konva.Circle({
      radius: 6, fill: 'rgba(253, 246, 227, 0.9)', stroke: '#cb4b16', strokeWidth: 1.5,
      hitStrokeWidth: 22, // cible tactile confortable
    });
    const hLine = new Konva.Line({ points: [-10, 0, 10, 0], stroke: '#cb4b16', strokeWidth: 1.2, listening: false });
    const vLine = new Konva.Line({ points: [0, -10, 0, 10], stroke: '#cb4b16', strokeWidth: 1.2, listening: false });
    cross.add(ring, hLine, vLine);
    cross.on('mousedown touchstart', (e) => {
      // Comme les formes (session 8) : sans preventDefault sur touchstart, le
      // navigateur rejoue la séquence souris émulée et le drag Konva partait
      // deux fois. cancelBubble : ni sélection, ni marquee sous le réticule.
      if (e.evt.type === 'touchstart' && e.evt.cancelable) e.evt.preventDefault();
      e.cancelBubble = true;
    });
    cross.on('dragstart', () => {
      pivotDrag = {
        id,
        layerId: node.getAttr('elLayerId'),
        startNodeX: node.x(),
        startNodeY: node.y(),
        startOff: { x: node.offsetX(), y: node.offsetY() },
        rotation: node.rotation(),
        scaleX: node.scaleX(),
        scaleY: node.scaleY(),
      };
    });
    cross.on('dragmove', () => {
      if (!pivotDrag) return;
      const abs = node.getAbsoluteTransform(konvaStage);
      // Position du pointeur dans l'espace de dessin du nœud = nouveau pivot
      const local = abs.copy().invert().point(cross.position());
      node.offsetX(local.x);
      node.offsetY(local.y);
      // Compensation : l'origine du nœud (= position du pivot) suit pour
      // que le contenu reste immobile sous la rotation/échelle courantes.
      const d = pivotMoveDelta(pivotDrag, pivotDrag.startOff, local);
      node.x(pivotDrag.startNodeX + d.dx);
      node.y(pivotDrag.startNodeY + d.dy);
      // Reticule recalé sur le pivot (qui vient de bouger avec l'origine)
      const world2 = node.getAbsoluteTransform(konvaStage).point(local);
      cross.position(world2);
      transformer.forceUpdate();
      drawContent();
      overlayLayer.batchDraw();
    });
    cross.on('dragend', () => {
      if (!pivotDrag) return;
      const layer = currentLayers().find((l) => l.id === pivotDrag.layerId);
      pivotDrag = null;
      if (!layer || layer.locked) { refreshPivotHandle(); return; }
      const kf = insertKeyframe(layer, state.currentFrame);
      const el = kf.elements.find((e) => e.id === id);
      if (!el) { refreshPivotHandle(); return; }
      const box = pivotBoxFromNode(el, { x: node.offsetX(), y: node.offsetY() });
      el.pivotX = box.x;
      el.pivotY = box.y;
      // x/y du modèle = position du pivot (l'objet n'a pas bougé, le
      // réticule si) — valeurs déjà compensées par le dragmove.
      el.x = node.x();
      el.y = node.y();
      notify(state);
    });
    pivotGroup.add(cross);
    overlayLayer.batchDraw();
  }

  // ---------------------------------------------------------- outil rotation
  // Outil dédié (Q) : le glissé sur un élément le tourne autour de SON
  // pivot (l'offset Konva posé par buildNode — pivot explicite ou défaut
  // historique du type). Le pivot ne bouge pas : el.x/el.y SONT sa position,
  // on ne touche qu'à la rotation, le commit passe par commitTransform.
  // Le réticule du pivot reste visible/draggable (refreshPivotHandle accepte
  // l'outil rotation) : on voit autour de quoi on tourne, comme dans Animate.
  let rotateDrag = null; // { id, layerId, node, pivot, startPointerAngle, startRotation }

  function startRotateDrag(node) {
    const id = node.id();
    const layerId = node.getAttr('elLayerId');
    if (isLocked(layerId)) return;
    if (!state.selectedElementIds.includes(id)) selectElement(id, layerId, false);
    const pivot = node.getAbsoluteTransform(konvaStage).point({ x: node.offsetX(), y: node.offsetY() });
    const p = stagePointer();
    if (!p) return;
    rotateDrag = {
      id, layerId, node,
      pivot,
      startPointerAngle: Math.atan2(p.y - pivot.y, p.x - pivot.x),
      startRotation: node.rotation(),
    };
    refreshRotateFeedback(p, node.rotation());
    drawContent();
    overlayLayer.batchDraw();
  }

  function refreshRotateFeedback(p, deg) {
    rotateGroup.destroyChildren();
    if (!rotateDrag) return;
    rotateGroup.add(new Konva.Line({
      points: [rotateDrag.pivot.x, rotateDrag.pivot.y, p.x, p.y],
      stroke: '#cb4b16', strokeWidth: 1.2, dash: [4, 3],
    }));
    rotateGroup.add(new Konva.Text({
      x: p.x + 12, y: p.y - 20, text: Math.round(deg) + '°',
      fontSize: 12, fontFamily: 'inherit', fill: '#cb4b16',
    }));
  }

  function finishRotate() {
    const rd = rotateDrag;
    rotateDrag = null;
    rotateGroup.destroyChildren();
    overlayLayer.batchDraw();
    if (!rd) return;
    commitTransform(rd.id, rd.layerId, rd.node);
  }

  function cancelRotate() {
    if (!rotateDrag) return;
    rotateDrag.node.rotation(rotateDrag.startRotation);
    rotateDrag = null;
    rotateGroup.destroyChildren();
    drawContent();
    overlayLayer.batchDraw();
  }

  // ----------------------------------------------------------- interaction
  function attachInteraction(node, el) {
    if (state.playing) return;
    node.on('mousedown touchstart', (e) => {
      // Meme correctif que le handler de scene : sans lui, cancelBubble ci-
      // dessous empeche le preventDefault de scene de s'appliquer et le
      // navigateur rejoue la sequence souris emulee apres le touchstart.
      if (e.evt.type === 'touchstart' && e.evt.cancelable) e.evt.preventDefault();
      // Ne pas sélectionner si le calque est verrouillé
      if (isLocked(el.layerId)) return;
      if (state.currentTool === 'select') {
        e.cancelBubble = true;
        selectElement(el.id, el.layerId, e.evt.shiftKey);
      } else if (state.currentTool === 'subselect') {
        e.cancelBubble = true;
        if (el.kind === 'shape' && (el.shapeType === 'path' || el.shapeType === 'line')) {
          subselectId = el.id;
          selectElement(el.id, el.layerId, false);
          refreshPointHandles();
          overlayLayer.batchDraw();
        } else {
          subselectId = null;
          selectElement(el.id, el.layerId, false);
        }
      }
    });
    node.on('dblclick dbltap', (e) => {
      if (el.kind === 'instance' && state.currentTool === 'select') {
        e.cancelBubble = true;
        state.editPath = [...state.editPath, el.symbolId];
        state.selectedElementIds = [];
        state.currentFrame = 0;
        notify(state);
      }
    });
    if (state.currentTool === 'select' && !isLocked(el.layerId)) {
      node.draggable(true);
      node.on('dragend', () => commitTransform(el.id, el.layerId, node));
    }
  }

  function isLocked(layerId) {
    const layer = currentLayers().find((l) => l.id === layerId);
    return layer ? layer.locked : false;
  }

  // Sélectionner ne modifie pas le document : on ne doit JAMAIS reconstruire
  // la scène (contentLayer.destroyChildren() + rebuild) pour ça, même avec
  // un délai. Ce handler tourne pendant le mousedown qui sert aussi à Konva
  // pour armer son propre glisser-déposer sur CE nœud précis ; si on détruit
  // et remplace ce nœud par un autre pendant que le bouton reste enfoncé
  // (un drag dure largement plus qu'une frame), Konva perd la référence sur
  // laquelle il suit le geste et le déplacement s'arrête net. On se contente
  // donc de rafraîchir les poignées du Transformer + prévenir les autres
  // panneaux (propriétés, timeline) sans jamais toucher aux nœuds de forme.
  function selectElement(id, layerId, additive) {
    // Ne pas sélectionner si le calque est verrouillé
    if (isLocked(layerId)) return;
    if (additive) {
      const set = new Set(state.selectedElementIds);
      set.has(id) ? set.delete(id) : set.add(id);
      state.selectedElementIds = [...set];
    } else {
      state.selectedElementIds = [id];
    }
    state.selectedLayerId = layerId;
    refreshSelectionVisuals();
    overlayLayer.batchDraw();
    onSelectionChange();
  }

  function commitTransform(id, layerId, node) {
    const layer = currentLayers().find((l) => l.id === layerId);
    if (!layer) return;
    const kf = insertKeyframe(layer, state.currentFrame);
    const el = kf.elements.find((e) => e.id === id);
    if (!el) return;
    
    const oldX = el.x, oldY = el.y, oldRotation = el.rotation;
    const sp = snapIfEnabled(node.x(), node.y());
    el.x = sp.x;
    el.y = sp.y;
    el.rotation = node.rotation();
    el.scaleX = node.scaleX();
    el.scaleY = node.scaleY();
    
    // Propager la transformation aux enfants et aux shapes associées si c'est un bone
    if (el.kind === 'bone') {
      const dx = el.x - oldX;
      const dy = el.y - oldY;
      const dRotation = el.rotation - oldRotation;
      
      // Si ce bone a un parent, c'est peut-être un déplacement IK
      // Calculer la nouvelle position de la queue
      const newTailX = el.x + el.length * Math.cos(el.rotation * Math.PI / 180);
      const newTailY = el.y + el.length * Math.sin(el.rotation * Math.PI / 180);
      
      if (el.parentBoneId) {
        // Résoudre l'IK pour la chaîne
        solveIK(kf, el.id, newTailX, newTailY);
      }
      
      // Propager aux bones enfants (normal, pas IK)
      const childBones = getChildBones(kf, el.id);
      for (const child of childBones) {
        child.x += dx;
        child.y += dy;
        child.rotation += dRotation;
      }
      
      // Propager aux shapes associées (skinning)
      for (const shape of kf.elements) {
        if (shape.kind === 'shape' && shape.boneId === el.id) {
          shape.x += dx;
          shape.y += dy;
          shape.rotation += dRotation;
        }
      }
    }
    
    notify(state);
  }

  // Le Transformer Konva fait tourner l'élément autour du CENTRE de sa
  // boîte englobante (rotateAroundCenter dans la source de Konva), pas
  // autour de l'offset du nœud qui porte le pivot : sans correctif, le
  // pivot se déplacait à l'écran dès la première rotation. Pour un élément
  // à pivot EXPLICITE (sélection simple, pas un bone — les autres cas
  // gardent le comportement historique), on restaure x/y pendant la
  // rotation : l'offset (= pivot, dont x/y EST la position) reste alors en
  // place et l'élément tourne autour de lui, comme dans Animate CC.
  let rotPin = null; // { node, x, y, rotation, scaleX, scaleY }
  transformer.on('transformstart', () => {
    rotPin = null;
    const nodes = transformer.nodes();
    if (nodes.length !== 1) return;
    const n = nodes[0];
    if (n.getAttr('elKind') === 'bone' || !n.getAttr('hasPivot')) return;
    rotPin = {
      node: n,
      x: n.x(), y: n.y(),
      rotation: n.rotation(),
      scaleX: n.scaleX(), scaleY: n.scaleY(),
    };
  });
  transformer.on('transform', () => {
    if (!rotPin) return;
    const n = rotPin.node;
    // Rotation pure (l'échelle ne bouge pas) : bloquer le pivot sur place.
    if (n.scaleX() === rotPin.scaleX && n.scaleY() === rotPin.scaleY && n.rotation() !== rotPin.rotation) {
      n.x(rotPin.x);
      n.y(rotPin.y);
    }
    rotPin.rotation = n.rotation();
  });
  transformer.on('transformend', () => {
    rotPin = null;
    for (const node of transformer.nodes()) {
      commitTransform(node.id(), node.getAttr('elLayerId'), node);
    }
  });

  // --------------------------------------------- édition des points (plume)
  // Même principe que la sélection : jamais de notify()/render() pendant un
  // drag en cours, seulement au dragend. Les nœuds d'ancres/poignées sont
  // reconstruits uniquement quand la sélection change ou après un commit.
  function refreshPointHandles() {
    handleGroup.destroyChildren();
    pointRefs = [];
    if (state.currentTool !== 'subselect' || !subselectId) return;
    const node = findContentNode('#' + subselectId);
    const elData = node && node.getAttr('elData');
    if (!node || !elData) return;
    buildPointHandles(node, elData);
  }

  function buildPointHandles(node, elData) {
    const pts = elData.points;
    // node.getAbsoluteTransform(konvaStage) s'arrête avant la transform du
    // stage : les poignées vivent dans overlayLayer, enfant direct du stage
    // sans échelle propre, donc le scale du stage sera appliqué une seule
    // fois (par Konva au rendu). Utiliser getAbsoluteTransform() sans borne
    // l'inclurait deux fois et désynchroniserait les poignées dès que
    // stage.scale() != 1 (plein écran / mobile).
    const worldOf = (local) => node.getAbsoluteTransform(konvaStage).point(local);

    pts.forEach((p, i) => {
      const ref = {};
      const anchorWorld = worldOf({ x: p.x, y: p.y });

      if (p.cOut) {
        const tip = worldOf({ x: p.x + p.cOut.x, y: p.y + p.cOut.y });
        ref.outLine = new Konva.Line({ points: [anchorWorld.x, anchorWorld.y, tip.x, tip.y], stroke: '#f0a94f', strokeWidth: 1, listening: false });
        ref.outCircle = new Konva.Circle({ x: tip.x, y: tip.y, radius: 4, fill: '#f0a94f', draggable: true });
        handleGroup.add(ref.outLine, ref.outCircle);
        ref.outCircle.on('dragmove', () => onHandleDrag(node, elData, i, 'cOut', ref));
        ref.outCircle.on('dragend', () => commitPoints(node, elData));
      }
      if (p.cIn) {
        const tip = worldOf({ x: p.x + p.cIn.x, y: p.y + p.cIn.y });
        ref.inLine = new Konva.Line({ points: [anchorWorld.x, anchorWorld.y, tip.x, tip.y], stroke: '#f0a94f', strokeWidth: 1, listening: false });
        ref.inCircle = new Konva.Circle({ x: tip.x, y: tip.y, radius: 4, fill: '#f0a94f', draggable: true });
        handleGroup.add(ref.inLine, ref.inCircle);
        ref.inCircle.on('dragmove', () => onHandleDrag(node, elData, i, 'cIn', ref));
        ref.inCircle.on('dragend', () => commitPoints(node, elData));
      }

      ref.anchor = new Konva.Circle({
        x: anchorWorld.x, y: anchorWorld.y, radius: 5,
        fill: i === 0 ? '#ffcc00' : '#ffffff', stroke: '#cb4b16', strokeWidth: 2, draggable: true,
      });
      handleGroup.add(ref.anchor);
      ref.anchor.on('dragmove', () => onAnchorDrag(node, elData, i, ref));
      ref.anchor.on('dragend', () => commitPoints(node, elData));
      pointRefs.push(ref);
    });
    overlayLayer.batchDraw();
  }

  function onAnchorDrag(node, elData, i, ref) {
    const transform = node.getAbsoluteTransform(konvaStage);
    const local = transform.copy().invert().point(ref.anchor.position());
    const p = elData.points[i];
    p.x = local.x;
    p.y = local.y;
    if (p.cOut && ref.outLine) {
      const tip = transform.point({ x: p.x + p.cOut.x, y: p.y + p.cOut.y });
      ref.outCircle.position(tip);
      ref.outLine.points([ref.anchor.x(), ref.anchor.y(), tip.x, tip.y]);
    }
    if (p.cIn && ref.inLine) {
      const tip = transform.point({ x: p.x + p.cIn.x, y: p.y + p.cIn.y });
      ref.inCircle.position(tip);
      ref.inLine.points([ref.anchor.x(), ref.anchor.y(), tip.x, tip.y]);
    }
    node.getLayer().batchDraw();
    overlayLayer.batchDraw();
  }

  function onHandleDrag(node, elData, i, which, ref) {
    const transform = node.getAbsoluteTransform(konvaStage);
    const p = elData.points[i];
    const circle = which === 'cOut' ? ref.outCircle : ref.inCircle;
    const line = which === 'cOut' ? ref.outLine : ref.inLine;
    const anchorRef = ref.anchor;
    
    // circle.position() retourne des coordonn�es �cran (stage coordinates)
    const circleScreenPos = circle.position();
    // Convertir en coordonn�es locales du node
    const local = transform.copy().invert().point(circleScreenPos);
    // Le vecteur est la diff�rence entre la poign�e et l'ancre
    const vec = { x: local.x - p.x, y: local.y - p.y };
    p[which] = vec;
    
    // Mettre � jour la ligne : de l'ancre au circle, en coordonn�es �cran
    line.points([anchorRef.x(), anchorRef.y(), circleScreenPos.x, circleScreenPos.y]);

    if (p.smooth) {
      const other = which === 'cOut' ? 'cIn' : 'cOut';
      p[other] = { x: -vec.x, y: -vec.y };
      const otherCircle = which === 'cOut' ? ref.inCircle : ref.outCircle;
      const otherLine = which === 'cOut' ? ref.inLine : ref.outLine;
      if (otherCircle && otherLine) {
        // Position de l'autre poign�e en �cran
        const otherTipLocal = { x: p.x + p[other].x, y: p.y + p[other].y };
        const otherTipScreen = transform.point(otherTipLocal);
        otherCircle.position(otherTipScreen);
        otherLine.points([anchorRef.x(), anchorRef.y(), otherTipScreen.x, otherTipScreen.y]);
      }
    }
    node.getLayer().batchDraw();
    overlayLayer.batchDraw();
  }

  function commitPoints(node, elData) {
    const layerId = node.getAttr('elLayerId');
    const layer = currentLayers().find((l) => l.id === layerId);
    if (!layer) return;
    const kf = insertKeyframe(layer, state.currentFrame);
    const target = kf.elements.find((e) => e.id === node.id());
    if (!target) return;
    target.points = elData.points.map(clonePathPoint);
    notify(state);
  }

  // --------------------------------------------------------- drawing tools
  // getPointerPosition() renvoie des pixels écran bruts (relatifs au
  // conteneur DOM) — ça ignore stage.scale() (le fitScale appliqué par
  // resize() pour les petits écrans). Sur mobile, avec fitScale < 1, ça
  // confinait tous les tracés (rect/ellipse/ligne/plume/texte) au quart
  // haut-gauche du document. getRelativePointerPosition() inverse la
  // transformation absolue du stage et renvoie la vraie position dans
  // l'espace du document, quel que soit le zoom d'affichage.
  function stagePointer() {
    return konvaStage.getRelativePointerPosition();
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  konvaStage.on('mousedown touchstart', (e) => {
    // Sur mobile, le navigateur rejoue apres un touchstart une sequence souris
    // emulee (mousedown puis mouseup puis click). Ce handler etant lie a
    // 'mousedown touchstart', un simple tap executait donc deux fois l'ajout de point
    // (plume) ou le debut de trace. preventDefault() sur le touchstart supprime
    // toute la sequence emulee ; le conteneur de scene est deja en touch-action:
    // none (voir style.css), aucun geste natif n est perdu.
    if (e.evt.type === 'touchstart' && e.evt.cancelable) e.evt.preventDefault();
    const tool = state.currentTool;
    if (tool === 'hand') {
      e.cancelBubble = true;
      const evt = e.evt;
      // Tactile : e.evt est un TouchEvent SANS clientX (il est sur
      // touches[0]) -> panStart undefined -> NaN au move -> pan figé.
      const src = (evt.touches && evt.touches[0]) || evt;
      const sc = activeScroller();
      panStart = {
        mouseX: src.clientX, mouseY: src.clientY,
        scrollLeft: sc.scrollLeft, scrollTop: sc.scrollTop,
        scrollable: sc.scrollWidth > sc.clientWidth + 1 || sc.scrollHeight > sc.clientHeight + 1,
        fullscreen: fullscreenElement() === container,
        tx: panOffset.x, ty: panOffset.y,
      };
      container.classList.add('grabbing');
      return;
    }
    const p = stagePointer();
    if (!p) return;

    if (tool === 'select' || tool === 'subselect') {
      if (e.target === konvaStage) {
        if (tool === 'subselect') {
          state.selectedElementIds = [];
          subselectId = null;
          refreshSelectionVisuals();
          refreshPointHandles();
          overlayLayer.batchDraw();
          onSelectionChange();
          return;
        }
        // Clic sur le vide avec l'outil sélection : démarre un cadre de
        // sélection en liseret pointillé (comme Animate/Flash) — le clic
        // simple (sans glissé, voir finishMarquee) garde l'effet de "vider
        // la sélection" d'origine.
        const additive = e.evt.shiftKey;
        if (!additive) state.selectedElementIds = [];
        const rectNode = new Konva.Rect({
          x: p.x, y: p.y, width: 0, height: 0,
          stroke: '#cb4b16', strokeWidth: 1, dash: [4, 4],
          fill: 'rgba(203, 75, 22, 0.08)', listening: false,
        });
        overlayLayer.add(rectNode);
        marquee = { start: p, node: rectNode, additive };
        refreshSelectionVisuals();
        overlayLayer.batchDraw();
        onSelectionChange();
      }
      return;
    }

    if (tool === 'rotate') {
      if (state.playing) return;
      // Remonter au nœud de l'élément depuis la cible du hit (les enfants
      // d'un groupe d'instance n'ont pas l'attr elKind, l'ancêtre si).
      let n = e.target;
      while (n && !contentStack.includes(n) && !n.getAttr('elKind')) n = n.getParent();
      // Bones exclus : leur rotation fait partie du workflow IK (tête),
      // les Transformer/poignées dédiées restent leur chemin.
      if (n && n.getAttr('elKind') && n.getAttr('elKind') !== 'bone') {
        e.cancelBubble = true;
        startRotateDrag(n);
      }
      return;
    }

    if (tool === 'rect' || tool === 'ellipse' || tool === 'line') {
      drawState = { tool, start: p, last: null };
      let node;
      if (tool === 'rect') node = new Konva.Rect({ x: p.x, y: p.y, width: 0, height: 0, stroke: state.strokeColor, strokeWidth: state.strokeWidth, fill: state.fillColor, dash: [4, 4], listening: false });
      if (tool === 'ellipse') node = new Konva.Ellipse({ x: p.x, y: p.y, radiusX: 0, radiusY: 0, stroke: state.strokeColor, strokeWidth: state.strokeWidth, fill: state.fillColor, dash: [4, 4], listening: false });
      if (tool === 'line') node = new Konva.Line({ points: [p.x, p.y, p.x, p.y], stroke: state.strokeColor, strokeWidth: state.strokeWidth, listening: false });
      drawState.previewNode = node;
      overlayLayer.add(node);
      overlayLayer.draw();
    } else if (tool === 'bone') {
      drawState = { tool, start: p, last: null, dragging: true };
      const previewLine = new Konva.Line({ points: [p.x, p.y, p.x, p.y], stroke: '#4a90d9', strokeWidth: 2, dash: [4, 4], listening: false });
      const previewHead = new Konva.Circle({ x: p.x, y: p.y, radius: 6, fill: '#4a90d9', stroke: '#ffffff', strokeWidth: 1, listening: false });
      drawState.previewNode = previewLine;
      drawState.previewHead = previewHead;
      overlayLayer.add(previewLine, previewHead);
      overlayLayer.draw();
    } else if (tool === 'boneChain') {
      // Création d'une chaîne de bones
      if (!drawState || drawState.tool !== 'boneChain') {
        // Premier clic : démarrer la chaîne
        drawState = { tool: 'boneChain', points: [p], previewLines: [], previewJoints: [] };
      } else {
        // Clic suivant : ajouter un segment
        drawState.points.push(p);
      }
      
      // Mettre à jour l'aperçu
      updateBoneChainPreview();
    } else if (tool === 'pen') {
      startOrContinuePen(p);
    } else if (tool === 'brush') {
      startOrContinueBrush(p, eventPressure(e));
    } else if (tool === 'camera' && e.target === konvaStage && !state.playing && !state.editPath.length) {
      // Pan caméra depuis le FOND : quand la caméra est zoomée, le cadre
      // (doc.width/zoom) rétrécit et peut sortir de la feuille, donc devenir
      // inatteignable au glisser. Ici, glisser N'IMPORTE OÙ sur la scène
      // (hors cadre) pan quand même la caméra. Le drag du cadre lui-même
      // reste prioritaire (e.target = le cadre, pas konvaStage).
      e.cancelBubble = true;
      const cam = resolveCameraAtFrame(state.doc, state.currentFrame) || defaultCamera(state.doc);
      camPanBg = { startPointer: { x: p.x, y: p.y }, startCam: { ...cam } };
      return;
    } else if (tool === 'text') {
      // Mode texte : clic simple = texte avec dimensions par défaut
      // Clic + glisser = dessiner un rectangle pour définir le cadre du texte
      if (!drawState || drawState.tool !== 'text') {
        // Démarrer un nouveau rectangle de texte
        const rectNode = new Konva.Rect({
          x: p.x, y: p.y, width: 0, height: 0,
          stroke: state.strokeColor, strokeWidth: 1, dash: [3, 3],
          listening: false,
        });
        overlayLayer.add(rectNode);
        drawState = {
          tool: 'text',
          start: { x: p.x, y: p.y },
          previewNode: rectNode,
          isDragging: false
        };
      }
    }
  });

  function startOrContinuePen(p) {
    if (drawState && drawState.tool === 'pen' && drawState.points.length > 1 && distance(p, drawState.points[0]) <= CLOSE_PATH_THRESHOLD) {
      finishPen(true);
      return;
    }
    const point = createPathPoint(p.x, p.y);
    if (!drawState || drawState.tool !== 'pen') {
      const curveNode = new Konva.Shape({
        stroke: state.strokeColor, strokeWidth: state.strokeWidth, listening: false,
        sceneFunc: (ctx, shape) => { ctx.beginPath(); tracePath(ctx, drawState.points, false); ctx.fillStrokeShape(shape); },
      });
      overlayLayer.add(curveNode);
      drawState = { tool: 'pen', points: [point], previewNode: curveNode, dots: [], dragging: false, dragIndex: 0, handlePreview: null };
    } else {
      drawState.points.push(point);
      drawState.dragIndex = drawState.points.length - 1;
    }
    drawState.dragging = true;
    const dot = new Konva.Circle({ x: p.x, y: p.y, radius: 3.5, fill: '#ffffff', stroke: '#cb4b16', strokeWidth: 1.5, listening: false });
    overlayLayer.add(dot);
    drawState.dots.push(dot);
    updatePenActions();
    overlayLayer.batchDraw();
  }

  konvaStage.on('mousemove touchmove', (e) => {
    if (camPanBg) {
      // Prévisu du pan caméra depuis le fond : le cadre suit le delta du
      // pointeur en coordonnées document (stagePointer tient compte du zoom
      // d'affichage). Le modèle n'est touché qu'au relâcher.
      const p2 = stagePointer();
      if (!p2) return;
      const g = cameraGroup.children[0];
      if (g) {
        g.position({
          x: camPanBg.startCam.x + (camPanBg.startPointer.x - p2.x),
          y: camPanBg.startCam.y + (camPanBg.startPointer.y - p2.y),
        });
        overlayLayer.batchDraw();
      }
      return;
    }
    if (panStart) {
      const evt = e.evt;
      // Tactile : l'implicite `event` (window.event) est un TouchEvent SANS
      // clientX -> NaN -> transform invalide -> pan figé sur mobile. On lit
      // e.evt et, pour un touchmove, son premier touch.
      const src = (evt.touches && evt.touches[0]) || evt;
      const dx = src.clientX - panStart.mouseX;
      const dy = src.clientY - panStart.mouseY;
      if (panStart.fullscreen && panStart.scrollable) {
        // Plein écran avec débordement : scroll du conteneur (transform
        // interdit sur l'élément fullscreen). Le contenu glisse dans le cadre.
        container.scrollLeft = panStart.scrollLeft - dx;
        container.scrollTop = panStart.scrollTop - dy;
      } else if (panStart.fullscreen) {
        // Plein écran à 100% (aucun débordement, le scroll n'a aucune plage) :
        // transform du panLayer, enfant de l'élément fullscreen.
        panOffset.x = panStart.tx + dx;
        panOffset.y = panStart.ty + dy;
        applyPanTransform();
      } else if (panStart.scrollable) {
        // Fenêtré avec débordement : scroll de #stage-scroll -> TOUTE la
        // feuille (le cadre) se déplace, les scrollbars suivent.
        scrollEl.scrollLeft = panStart.scrollLeft - dx;
        scrollEl.scrollTop = panStart.scrollTop - dy;
      } else {
        // Fenêtré sans débordement (zoom 100%) : le scroll ne peut rien
        // déplacer -> transform sur #stage-container, le cadre entier bouge.
        // Signe « attraper » : le cadre suit la souris, comme le scroll
        // (scrollLeft = start - dx) — translate(+dx, +dy).
        panOffset.x = panStart.tx + dx;
        panOffset.y = panStart.ty + dy;
        applyPanTransform();
      }
      return;
    }
    if (marquee) {
      const p = stagePointer();
      if (!p) return;
      const x = Math.min(p.x, marquee.start.x), y = Math.min(p.y, marquee.start.y);
      const w = Math.abs(p.x - marquee.start.x), h = Math.abs(p.y - marquee.start.y);
      marquee.node.setAttrs({ x, y, width: w, height: h });
      overlayLayer.batchDraw();
      return;
    }
    if (rotateDrag) {
      const p = stagePointer();
      if (!p) return;
      const a = Math.atan2(p.y - rotateDrag.pivot.y, p.x - rotateDrag.pivot.x);
      let deg = rotateDrag.startRotation + (a - rotateDrag.startPointerAngle) * 180 / Math.PI;
      // Maj : contrainte par pas de 15°, comme les repères d'angle d'Animate
      if (e.evt.shiftKey) deg = Math.round(deg / 15) * 15;
      rotateDrag.node.rotation(deg);
      refreshRotateFeedback(p, deg);
      drawContent();
      overlayLayer.batchDraw();
      return;
    }
    if (!drawState) return;
    const p = stagePointer();
    if (!p) return;
    if (drawState.tool === 'text') {
      // Marquer comme glissé si la distance est suffisante
      const distanceFromStart = Math.sqrt(
        Math.pow(p.x - drawState.start.x, 2) + Math.pow(p.y - drawState.start.y, 2)
      );
      if (distanceFromStart > 5) {
        drawState.isDragging = true;
      }
      
      if (drawState.isDragging) {
        const x = Math.min(p.x, drawState.start.x), y = Math.min(p.y, drawState.start.y);
        const w = Math.abs(p.x - drawState.start.x), h = Math.abs(p.y - drawState.start.y);
        drawState.previewNode.setAttrs({ x, y, width: w, height: h });
        drawState.last = p;
        overlayLayer.batchDraw();
      }
    } else if (drawState.tool === 'rect') {
      const x = Math.min(p.x, drawState.start.x), y = Math.min(p.y, drawState.start.y);
      const w = Math.abs(p.x - drawState.start.x), h = Math.abs(p.y - drawState.start.y);
      drawState.previewNode.setAttrs({ x, y, width: w, height: h });
      drawState.last = p;
    } else if (drawState.tool === 'ellipse') {
      const cx = (p.x + drawState.start.x) / 2, cy = (p.y + drawState.start.y) / 2;
      drawState.previewNode.setAttrs({ x: cx, y: cy, radiusX: Math.abs(p.x - drawState.start.x) / 2, radiusY: Math.abs(p.y - drawState.start.y) / 2 });
      drawState.last = p;
    } else if (drawState.tool === 'line') {
      drawState.previewNode.points([drawState.start.x, drawState.start.y, p.x, p.y]);
      drawState.last = p;
    } else if (drawState.tool === 'bone' && drawState.dragging) {
      drawState.previewNode.points([drawState.start.x, drawState.start.y, p.x, p.y]);
      drawState.previewHead.position({ x: p.x, y: p.y });
      drawState.last = p;
      overlayLayer.batchDraw();
    } else if (drawState.tool === 'pen' && drawState.dragging) {
      const point = drawState.points[drawState.dragIndex];
      const start = { x: point.x, y: point.y };
      if (distance(p, start) > HANDLE_DRAG_THRESHOLD) {
        const vec = { x: p.x - start.x, y: p.y - start.y };
        point.cOut = vec;
        point.cIn = { x: -vec.x, y: -vec.y };
        point.smooth = true;
        if (!drawState.handlePreview) {
          drawState.handlePreview = new Konva.Line({ stroke: '#f0a94f', strokeWidth: 1, listening: false });
          overlayLayer.add(drawState.handlePreview);
        }
        drawState.handlePreview.points([start.x - vec.x, start.y - vec.y, start.x + vec.x, start.y + vec.y]);
      }
      drawState.previewNode.getLayer().batchDraw();
    } else if (drawState.tool === 'brush') {
      startOrContinueBrush(p, eventPressure(e));
    }
    overlayLayer.batchDraw();
  });

  konvaStage.on('mouseup touchend', () => {
    if (camPanBg) {
      // Relâcher : pose la clé caméra pan (x/y seulement, zoom/rotation
      // intacts) comme le dragend du cadre.
      const g = cameraGroup.children[0];
      camPanBg = null;
      if (g && state.currentTool === 'camera') {
        upsertCameraKeyframe(state.doc, state.currentFrame, { x: g.x(), y: g.y() });
        notify(state);
      }
      return;
    }
    if (panStart) {
      panStart = null;
      container.classList.remove('grabbing');
      return;
    }
    if (marquee) { finishMarquee(); return; }
    if (rotateDrag) { finishRotate(); return; }
    if (!drawState) return;
    if (drawState.tool === 'pen') {
      drawState.dragging = false;
      return;
    }
    if (drawState.tool === 'brush') {
      finishBrush();
      return;
    }
    if (drawState.tool === 'text') {
      // Si on a dessiné un rectangle (glisser), créer le texte avec les dimensions
      if (drawState.isDragging && drawState.last) {
        const x = Math.min(drawState.last.x, drawState.start.x);
        const y = Math.min(drawState.last.y, drawState.start.y);
        const w = Math.abs(drawState.last.x - drawState.start.x);
        const h = Math.abs(drawState.last.y - drawState.start.y);
        // Créer le texte avec les dimensions du rectangle
        createTextAtWithBounds({ x, y, width: w, height: h });
        cancelDraw();
        return;
      } else {
        // Clic simple sans glisser : créer un texte à la position du clic
        const p = stagePointer();
        if (p) {
          createTextAt(p);
        }
        cancelDraw();
        return;
      }
    }
    finishDrag();
  });

  // Filet de sécurité si le bouton est relâché hors de la scène (l'événement
  // Konva ne se déclenche alors pas) — même principe que le redimensionnement
  // du panneau latéral dans main.js.
  window.addEventListener('mouseup', () => {
    if (marquee) finishMarquee();
    if (rotateDrag) finishRotate();
    if (camPanBg) {
      // Secours si le relâcher tombe hors du stage : même commit que le
      // mouseup de konvaStage (camPanBg remis à null, donc exécuté 1 fois).
      const g = cameraGroup.children[0];
      camPanBg = null;
      if (g && state.currentTool === 'camera') {
        upsertCameraKeyframe(state.doc, state.currentFrame, { x: g.x(), y: g.y() });
        notify(state);
      }
    }
    if (panStart) { panStart = null; container.classList.remove('grabbing'); }
  });

  const MARQUEE_CLICK_THRESHOLD = 3; // px, en dessous duquel on considère que c'était un simple clic (pas un glissé)

  function finishMarquee() {
    const { start, node, additive } = marquee;
    const end = stagePointer() || start;
    node.destroy();
    marquee = null;

    const x1 = Math.min(start.x, end.x), x2 = Math.max(start.x, end.x);
    const y1 = Math.min(start.y, end.y), y2 = Math.max(start.y, end.y);
    if (x2 - x1 >= MARQUEE_CLICK_THRESHOLD || y2 - y1 >= MARQUEE_CLICK_THRESHOLD) {
      const hitIds = [];
      for (const l of contentStack) l.children.forEach((node2) => {
        if (isLocked(node2.getAttr('elLayerId'))) return;
        const r = node2.getClientRect({ relativeTo: contentLayer });
        const intersects = r.x < x2 && r.x + r.width > x1 && r.y < y2 && r.y + r.height > y1;
        if (intersects) hitIds.push(node2.id());
      });
      if (hitIds.length) {
        if (additive) {
          const set = new Set(state.selectedElementIds);
          hitIds.forEach((id) => set.add(id));
          state.selectedElementIds = [...set];
        } else {
          state.selectedElementIds = hitIds;
        }
        const lastNode = findContentNode('#' + hitIds[hitIds.length - 1]);
        if (lastNode) state.selectedLayerId = lastNode.getAttr('elLayerId');
      }
    }
    refreshSelectionVisuals();
    overlayLayer.batchDraw();
    onSelectionChange();
  }

  // Double-clic désactivé pour l'outil plume (évite la validation involontaire)
  // konvaStage.on('dblclick dbltap', () => {
  //   if (drawState && drawState.tool === 'pen') finishPen(false);
  // });

  window.addEventListener('keydown', (e) => {
    if (isTypingTarget(e.target)) return;
    if (e.key === 'm' || e.key === 'M') {
      if (state.currentTool === 'hand') { state.currentTool = 'select'; } else { state.currentTool = 'hand'; }
      notify(state);
      return;
    }
    if (e.key === 'Enter' && drawState && drawState.tool === 'pen') finishPen(false);
    if (e.key === 'Enter' && drawState && drawState.tool === 'boneChain') finishBoneChain();
    if (e.key === 'Escape' && drawState && drawState.tool === 'pen') cancelDraw();
    if (e.key === 'Escape' && drawState && drawState.tool === 'boneChain') cancelDraw();
    if (e.key === 'Escape' && drawState && drawState.tool === 'brush') cancelDraw();
    if (e.key === 'Escape' && rotateDrag) cancelRotate();
    // Outil maillage + bitmap sélectionné : Suppr = revenir à la pose
    // d'identité (ne supprime PAS l'élément — pour supprimer, changer
    // d'outil d'abord, comme la caméra interprète Suppr dans son contexte).
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.currentTool === 'mesh' && resetMeshPose()) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedElementIds.length) deleteSelected();
    // Outil caméra sans sélection : Suppr supprime l'image clé caméra de
    // l'image courante (dernière clé supprimée = caméra entièrement retirée).
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.currentTool === 'camera' && !state.selectedElementIds.length
      && removeCameraKeyframeAt(state.doc, state.currentFrame)) notify(state);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelected(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') { e.preventDefault(); cutSelected(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteClipboard(); }
  });

  function isTypingTarget(target) {
    return target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
  }

  function finishDrag() {
    const { tool, previewNode, previewHead, last, start } = drawState;
    previewNode.destroy();
    if (previewHead) previewHead.destroy();
    overlayLayer.draw();
    drawState = null;
    if (!last) return;
    let el = null;
    if (tool === 'rect') {
      const x = Math.min(last.x, start.x), y = Math.min(last.y, start.y);
      const w = Math.abs(last.x - start.x), h = Math.abs(last.y - start.y);
      if (w < 2 || h < 2) return;
      const c = snapIfEnabled(x + w / 2, y + h / 2); // snap du centre si grille active
      el = createShape('rect', { x: c.x, y: c.y, width: w, height: h, fill: state.fillColor, stroke: state.strokeColor, strokeWidth: state.strokeWidth });
    } else if (tool === 'ellipse') {
      const w = Math.abs(last.x - start.x), h = Math.abs(last.y - start.y);
      if (w < 2 || h < 2) return;
      const c = snapIfEnabled((start.x + last.x) / 2, (start.y + last.y) / 2);
      el = createShape('ellipse', { x: c.x, y: c.y, width: w, height: h, fill: state.fillColor, stroke: state.strokeColor, strokeWidth: state.strokeWidth });
    } else if (tool === 'line') {
      const dx = last.x - start.x, dy = last.y - start.y;
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
      const s = snapIfEnabled(start.x, start.y);
      el = createShape('line', { x: s.x, y: s.y, points: [createPathPoint(0, 0), createPathPoint(dx, dy)], stroke: state.strokeColor, strokeWidth: state.strokeWidth, width: Math.abs(dx), height: Math.abs(dy) });
    } else if (tool === 'bone') {
      const dx = last.x - start.x, dy = last.y - start.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length < 5) return;
      const rotation = Math.atan2(dy, dx) * 180 / Math.PI;
      el = createBone({ x: start.x, y: start.y, length, rotation });
    }
    if (el) addElement(el);
  }

  function updateBoneChainPreview() {
    // Supprimer les anciens aperçus
    if (drawState.previewLines) {
      for (const line of drawState.previewLines) line.destroy();
    }
    if (drawState.previewJoints) {
      for (const joint of drawState.previewJoints) joint.destroy();
    }
    drawState.previewLines = [];
    drawState.previewJoints = [];
    
    const points = drawState.points;
    if (points.length < 2) return;
    
    // Dessiner les segments entre les points
    for (let i = 0; i < points.length - 1; i++) {
      const line = new Konva.Line({
        points: [points[i].x, points[i].y, points[i + 1].x, points[i + 1].y],
        stroke: '#4a90d9',
        strokeWidth: 2,
        dash: [4, 4],
        listening: false,
      });
      overlayLayer.add(line);
      drawState.previewLines.push(line);
    }
    
    // Dessiner les articulations (joints)
    for (let i = 0; i < points.length; i++) {
      const joint = new Konva.Circle({
        x: points[i].x,
        y: points[i].y,
        radius: 5,
        fill: i === 0 ? '#ffcc00' : (i === points.length - 1 ? '#4a90d9' : '#ffffff'),
        stroke: '#cb4b16',
        strokeWidth: 2,
        listening: false,
      });
      overlayLayer.add(joint);
      drawState.previewJoints.push(joint);
    }
    
    overlayLayer.draw();
  }

  function finishBoneChain() {
    if (!drawState || drawState.tool !== 'boneChain' || drawState.points.length < 2) {
      cancelDraw();
      return;
    }
    
    const points = drawState.points;
    const bones = [];
    const skeletonId = nextSkeletonId(); // ID unique pour ce squelette
    
    // Créer les bones de la chaîne
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const rotation = Math.atan2(dy, dx) * 180 / Math.PI;
      
      const bone = createBone({
        x: points[i].x,
        y: points[i].y,
        length: length,
        rotation: rotation,
        parentBoneId: i > 0 ? bones[i - 1].id : null,
        skeletonId: skeletonId, // Tous les bones de la chaîne partagent le même skeletonId
      });
      bones.push(bone);
      addElement(bone);
    }
    
    updateBoneChainActions();
    cancelDraw();
  }

  function finishPen(closeShape) {
    if (!drawState || drawState.points.length < 2) { cancelDraw(); return; }
    destroyPenPreview();
    const pts = drawState.points;
    // Fermer automatiquement si le dernier point est proche du premier (même avec Entrée/✅)
    const shouldClose = closeShape || (pts.length > 1 && distance(pts[pts.length - 1], pts[0]) <= CLOSE_PATH_THRESHOLD);
    const ox = pts[0].x, oy = pts[0].y;
    const rel = pts.map((p) => createPathPoint(p.x - ox, p.y - oy, { cIn: p.cIn, cOut: p.cOut, smooth: p.smooth }));
    const xs = rel.map((p) => p.x), ys = rel.map((p) => p.y);
    const el = createShape('path', {
      x: ox, y: oy, points: rel, closed: shouldClose,
      width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys),
      fill: state.fillColor, stroke: state.strokeColor, strokeWidth: state.strokeWidth,
    });
    updatePenActions();
    drawState = null;
    addElement(el);
    // R�initialiser l'outil � select apr�s validation
    state.currentTool = 'select';
    notify(state);
  }

  // =============================================================================
  // BRUSH TOOL FUNCTIONS
  // =============================================================================

  // Pression du stylet. Konva 9 émet 'mousedown' avec un MouseEvent (sans
  // pressure) : on lit donc la pression sur les POINTER events DOM parallèles
  // du conteneur (PointerEvent.pressure, 0..1 ; souris = 0.5 en drag, stylet /
  // tactile = force réelle). null si jamais vu -> traité comme 0.5 plus bas.
  let lastPointerPressure = null;
  container.addEventListener('pointerdown', (e) => {
    if (typeof e.pressure === 'number' && !Number.isNaN(e.pressure)) lastPointerPressure = e.pressure;
  });
  container.addEventListener('pointermove', (e) => {
    if (e.buttons && typeof e.pressure === 'number' && !Number.isNaN(e.pressure)) lastPointerPressure = e.pressure;
  });
  container.addEventListener('pointerup', () => { lastPointerPressure = null; });
  function eventPressure(e) {
    const ev = e && e.evt;
    if (ev && typeof ev.pressure === 'number' && !Number.isNaN(ev.pressure)) return ev.pressure;
    if (ev && ev.touches && ev.touches[0] && typeof ev.touches[0].force === 'number') return ev.touches[0].force;
    return lastPointerPressure;
  }

  // Facteur d'échelle de largeur par point du tracé courant, selon le réglage
  // "Pression" du panneau (null = off, taille fixe historique).
  function brushPressureScale() {
    if (!state.brushPressure || !drawState || drawState.tool !== 'brush') return null;
    const sens = Math.min(100, Math.max(0, state.brushPressureSens || 0)) / 100;
    return drawState.points.map((p) => pressureToScale(p.pressure == null ? 0.5 : p.pressure, sens));
  }

  // Démarrer ou continuer le trait de pinceau
  function startOrContinueBrush(p, pressure = null) {
    if (!drawState || drawState.tool !== 'brush') {
      drawState = {
        tool: 'brush',
        points: [{ x: p.x, y: p.y, pressure }],
        previewNode: null,
        previewOutline: null
      };
      // Utiliser brushToPoly pour créer un aperçu
      updateBrushPreview();
    } else {
      const points = drawState.points;
      const last = points[points.length - 1];
      const dist = distance(p, last);
      if (dist < BRUSH_MIN_DISTANCE) return;
      points.push({ x: p.x, y: p.y, pressure });
      updateBrushPreview();
    }
  }

  // Met à jour l'aperçu du pinceau
  function updateBrushPreview() {
    if (!drawState || drawState.tool !== 'brush') return;
    
    const pts = drawState.points.map(p => [p.x, p.y]);
    const brushSize = state.brushSize || 5;
    const pattern = state.brushPattern || 'round';

    // Supprimer l'ancien aperçu
    if (drawState.previewOutline) {
      drawState.previewOutline.destroy();
    }
    if (drawState.previewSpatter) {
      drawState.previewSpatter.destroy();
    }

    // Générer le polygone de contour (avec échelle de pression si réglée)
    const result = brushToPoly(pts, brushSize, pattern, brushPressureScale());
    
    // Créer un shape Konva avec le polygone
    const previewNode = new Konva.Line({
      points: result.points.flat(),
      stroke: state.strokeColor,
      strokeWidth: 1,
      fill: state.strokeColor,
      closed: true,
      listening: false
    });
    
    drawState.previewOutline = previewNode;
    overlayLayer.add(previewNode);

    // Aperçu des éclaboussures (mêmes gouttes que le trait final : déterministes)
    if (state.brushSpatter && pts.length > 0) {
      const inten = (state.brushSpatterIntensity != null ? state.brushSpatterIntensity : 40) / 100;
      const dots = spatterDots(pts, brushSize, inten, 7);
      if (dots.length) {
        const sp = new Konva.Shape({
          listening: false,
          sceneFunc: (ctx) => {
            ctx.fillStyle = state.strokeColor;
            for (const d of dots) {
              ctx.beginPath();
              ctx.arc(d.dx + result.cx, d.dy + result.cy, d.r, 0, Math.PI * 2);
              ctx.fill();
            }
          },
        });
        drawState.previewSpatter = sp;
        overlayLayer.add(sp);
      }
    }
    overlayLayer.batchDraw();

    // Stocker les données pour finishBrush
    drawState.polyResult = result;
  }

  // Finaliser le trait de pinceau
  function finishBrush() {
    if (!drawState || drawState.tool !== 'brush' || !drawState.polyResult) {
      cancelDraw();
      return;
    }
    
    const brushSize = state.brushSize || 5;
    const pattern = state.brushPattern || 'round';
    
    // Générer le polygone final avec les points finaux
    const pts = drawState.points.map(p => [p.x, p.y]);
    const finalResult = brushToPoly(pts, brushSize, pattern, brushPressureScale());
    
    // Créer un shape path fermé avec le polygone
    // On utilise createShape mais on va stocker le polygone dans un format spécial
    // pour pouvoir le dessiner correctement dans buildNode
    
    // Stocker le polygone brut dans l'élément
    const el = createShape('path', {
      x: finalResult.cx,
      y: finalResult.cy,
      points: finalResult.points.map(p => createPathPoint(p[0] - finalResult.cx, p[1] - finalResult.cy)),
      closed: true,
      width: finalResult.w,
      height: finalResult.h,
      fill: state.strokeColor,
      stroke: 'transparent',
      strokeWidth: 0,
      brushPoly: true, // Flag pour indiquer que c'est un polygone de brush
      // Points centraux du tracé (relatifs au centre) — utilisés pour les
      // éclaboussures et potentiellement d'autres effets le long du path.
      brushCore: pts.map(p => [p[0] - finalResult.cx, p[1] - finalResult.cy]),
    });
    // Texture bitmap : remplissage du polygone en mosaïque d'un asset image
    if (state.brushTextureAssetId && (state.doc.assets || {})[state.brushTextureAssetId]) {
      el.brushTexture = { assetId: state.brushTextureAssetId };
    }
    // Éclaboussures (spatter) autour du tracé
    if (state.brushSpatter) {
      const inten = (state.brushSpatterIntensity != null ? state.brushSpatterIntensity : 40) / 100;
      el.brushSpatter = spatterDots(pts, brushSize, inten, 7).map(d => ({ x: d.dx, y: d.dy, r: d.r }));
    }

    cancelDraw();
    addElement(el, false); // trait non sélectionné (demande user : on enchaîne sans être gêné)
    // Garder le pinceau actif pour enchaîner les traits sans recliquer
    notify(state);
  }

  // Algorithme Ramer-Douglas-Peucker pour simplifier un polyligne
  function simplifyPointsRD(points, epsilon = 2.0) {
    if (points.length <= 2) return points;
    
    let dmax = 0;
    let index = 0;
    const end = points.length - 1;
    
    for (let i = 1; i < end; i++) {
      const d = perpendicularDistance(points[i], points[0], points[end]);
      if (d > dmax) {
        index = i;
        dmax = d;
      }
    }
    
    if (dmax > epsilon) {
      const rec1 = simplifyPointsRD(points.slice(0, index + 1), epsilon);
      const rec2 = simplifyPointsRD(points.slice(index), epsilon);
      return rec1.slice(0, -1).concat(rec2);
    }
    
    return [points[0], points[end]];
  }

  // Distance perpendiculaire d'un point à une ligne
  function perpendicularDistance(point, lineStart, lineEnd) {
    const x0 = point.x, y0 = point.y;
    const x1 = lineStart.x, y1 = lineStart.y;
    const x2 = lineEnd.x, y2 = lineEnd.y;
    
    if (x1 === x2 && y1 === y2) {
      return Math.hypot(x0 - x1, y0 - y1);
    }
    
    const numerator = Math.abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1);
    const denominator = Math.hypot(y2 - y1, x2 - x1);
    return numerator / denominator;
  }

  // Conversion en courbe Bézier lisse
  function createSmoothPath(points, tension = 0.6) {
    if (points.length < 2) return points.map(p => createPathPoint(p.x, p.y));
    if (points.length === 2) {
      return [
        createPathPoint(points[0].x, points[0].y),
        createPathPoint(points[1].x, points[1].y)
      ];
    }
    
    const result = [createPathPoint(points[0].x, points[0].y)];
    
    for (let i = 1; i < points.length - 1; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      
      // Calcul des vecteurs
      const dx1 = p1.x - p0.x;
      const dy1 = p1.y - p0.y;
      const dx2 = p2.x - p1.x;
      const dy2 = p2.y - p1.y;
      
      // Longueurs
      const len1 = Math.hypot(dx1, dy1);
      const len2 = Math.hypot(dx2, dy2);
      
      // Vecteurs de contrôle (relatifs au point)
      const cOutX = dx1 * tension * len2 / (len1 + len2);
      const cOutY = dy1 * tension * len2 / (len1 + len2);
      const cInX = -dx2 * tension * len1 / (len1 + len2);
      const cInY = -dy2 * tension * len1 / (len1 + len2);
      
      result.push(createPathPoint(
        p1.x, p1.y,
        { x: cOutX, y: cOutY },
        { x: cInX, y: cInY }
      ));
    }
    
    // Dernier point
    result.push(createPathPoint(points[points.length - 1].x, points[points.length - 1].y));
    
    return result;
  }

  function cancelDraw() {
    if (drawState && drawState.tool === 'pen') destroyPenPreview();
    else if (drawState && drawState.previewNode) {
      drawState.previewNode.destroy();
      if (drawState.previewHead) drawState.previewHead.destroy();
    }
    else if (drawState && drawState.tool === 'boneChain') {
      // Nettoyer l'aperçu de la chaîne
      if (drawState.previewLines) {
        for (const line of drawState.previewLines) line.destroy();
      }
      if (drawState.previewJoints) {
        for (const joint of drawState.previewJoints) joint.destroy();
      }
    }
    else if (drawState && drawState.tool === 'brush') {
      if (drawState.previewNode) drawState.previewNode.destroy();
      if (drawState.previewOutline) drawState.previewOutline.destroy();
      if (drawState.previewSpatter) drawState.previewSpatter.destroy();
    }
    overlayLayer.draw();
    drawState = null;
    updatePenActions();
    updateBoneChainActions();
  }

  function destroyPenPreview() {
    drawState.previewNode.destroy();
    drawState.dots.forEach((d) => d.destroy());
    if (drawState.handlePreview) drawState.handlePreview.destroy();
    overlayLayer.draw();
  }

  function createTextAtWithBounds(bounds) {
    // bounds = { x, y, width, height }
    const c = snapIfEnabled(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    const el = createShape('text', {
      x: c.x,
      y: c.y,
      width: Math.max(20, bounds.width),
      height: Math.max(20, bounds.height),
      text: 'Texte',
      fill: state.fillColor,
      strokeWidth: 0
    });
    addElement(el);
    state.currentTool = 'select';
    state.selectedElementIds = [el.id];
    notify(state);
  }

  function createTextAt(p) {
    // Créer un texte avec dimensions par défaut à la position p
    createTextAtWithBounds({ x: p.x - 80, y: p.y - 15, width: 160, height: 30 });
  }

  function addElement(el, select = true) {
    commitToActiveKeyframe((kf) => kf.elements.push(el));
    // select=false (pinceau) : le trait fini n'est PAS sélectionné, pour
    // enchaîner les traits sans risquer de manipuler la forme précédente.
    state.selectedElementIds = select ? [el.id] : [];
    notify(state);
  }

  function deleteSelected() {
    const layer = activeLayer();
    if (!layer || layer.locked) return;
    const kf = insertKeyframe(layer, state.currentFrame);
    kf.elements = kf.elements.filter((e) => !state.selectedElementIds.includes(e.id));
    state.selectedElementIds = [];
    notify(state);
  }

  // Coller cible toujours activeLayer() au moment du Ctrl+V, jamais le calque
  // d'origine : c'est ce qui permet de déplacer une forme d'un calque à
  // l'autre en changeant simplement de calque actif entre le Ctrl+X/C et le
  // Ctrl+V. Les os ne sont pas copiables isolément : ils référencent
  // skeletonId/boneId/parent dans une hiérarchie que le remappage d'id ne
  // reconstruit pas, donc on les exclut de la sélection copiée.
  function copySelected() {
    const layer = activeLayer();
    if (!layer) return;
    const kf = getActiveKeyframe(layer, state.currentFrame);
    const elements = kf.elements.filter((e) => state.selectedElementIds.includes(e.id) && e.kind !== 'bone');
    if (!elements.length) return;
    const assets = {};
    const symbols = {};
    // Collecte récursive des assets (bitmaps) et symboles (instances + leurs
    // dépendances) référencés par la sélection, pour un collage cross-projets.
    const collectSymbol = (sym) => {
      if (!sym || symbols[sym.id]) return;
      symbols[sym.id] = sym;
      for (const l of sym.layers || []) {
        for (const k of l.keyframes || []) {
          for (const e of k.elements || []) {
            if (e.kind === 'bitmap' && state.doc.assets && state.doc.assets[e.assetId]) assets[e.assetId] = state.doc.assets[e.assetId];
            if (e.kind === 'instance') collectSymbol(state.doc.symbols[e.symbolId]);
          }
        }
      }
    };
    for (const el of elements) {
      if (el.kind === 'bitmap' && state.doc.assets && state.doc.assets[el.assetId]) assets[el.assetId] = state.doc.assets[el.assetId];
      if (el.kind === 'instance') collectSymbol(state.doc.symbols[el.symbolId]);
    }
    clipboard = { elements: elements.map((el) => cloneElement(el, false)), assets, symbols };
  }

  function cutSelected() {
    if (!state.selectedElementIds.length) return;
    copySelected();
    deleteSelected();
  }

  function pasteClipboard() {
    if (!clipboard.elements.length) return;
    const layer = activeLayer();
    if (!layer || layer.locked) return;
    // Importe les assets/symboles du presse-papiers dans le document CIBLE
    // (projet actif) s'il ne les connaît pas — c'est ce qui rend le collage
    // fonctionnel entre fenêtres-projets.
    const doc = state.doc;
    doc.assets = doc.assets || {};
    for (const id in clipboard.assets) if (!doc.assets[id]) doc.assets[id] = clipboard.assets[id];
    doc.symbols = doc.symbols || {};
    for (const id in clipboard.symbols) if (!doc.symbols[id]) doc.symbols[id] = clipboard.symbols[id];
    const pasted = clipboard.elements.map((el) => cloneElement(el, true));
    commitToActiveKeyframe((kf) => { pasted.forEach((el) => kf.elements.push(el)); });
    state.selectedElementIds = pasted.map((el) => el.id);
    state.selectedLayerId = layer.id;
    notify(state);
  }

  function addInstanceAt(symbolId, p) {
    const el = createInstance(symbolId, { x: p.x, y: p.y });
    addElement(el);
  }

  // Fait tenir la scène dans l'espace disponible (TV/desktop grand écran,
  // tablette, mobile) en utilisant le zoom natif de Konva (stage.scale()) —
  // jamais une transformation CSS externe, qui désynchroniserait le calcul
  // de position du pointeur. Le calcul de position (stagePointer(), plus
  // haut) doit utiliser getRelativePointerPosition() et non
  // getPointerPosition() pour que ce zoom reste transparent aux outils de
  // dessin — voir la mémoire projet sur le bug du quart haut-gauche mobile.
  // Ne grossit jamais au-delà de 100% : sur un très grand écran, c'est la
  // taille des contrôles autour qui s'adapte (voir style.css), pas la scène.
  let fitScale = 1;
  function resize(resetPanOnResize = true) {
    const doc = state.doc;
    const isSheetFullscreen = fullscreenElement() === container;
    // En plein écran la feuille couvre l'écran ; sinon c'est la zone de
    // travail (#stage-wrap, taille stable) qui borne la scène — PAS
    // #stage-container, dont la taille dépend du canvas (boucle sinon).
    const availEl = isSheetFullscreen ? container : container.parentElement;
    const availW = Math.max(80, (availEl ? availEl.clientWidth : doc.width) - 24);
    const availH = Math.max(80, (availEl ? availEl.clientHeight : doc.height) - 24);
    fitScale = isSheetFullscreen
      ? Math.min(availW / doc.width, availH / doc.height)
      : Math.min(1, availW / doc.width, availH / doc.height);
    if (resetPanOnResize) resetPan();
    applyZoom();
    render();
  }

  const ZOOM_MIN = 0.1;
  const ZOOM_MAX = 10;
  const ZOOM_STEP = 0.25;

  // `anchor` = { x, y } en coordonnées client : le point de la scène situé
  // sous l'ancre reste sous l'ancre après le changement de zoom (zoom au
  // curseur pour la molette, au centre de la zone pour les boutons +/-).
  function applyZoom(anchor) {
    const doc = state.doc;
    const scale = fitScale * state.zoom;
    const anchorDoc = anchor ? pointFromClient(anchor.x, anchor.y) : null;
    konvaStage.width(Math.round(doc.width * scale));
    konvaStage.height(Math.round(doc.height * scale));
    konvaStage.scale({ x: scale, y: scale });
    if (anchorDoc) {
      // Position du point d'ancrage dans le canvas APRÈS le changement
      // d'échelle, puis on cale le scroll pour qu'il retombe sous l'ancre :
      // clientX = rect.left + pixel.x + mx - scrollLeft (le scroll décale le
      // contenu vers la gauche), d'où scrollLeft = pixel.x + mx - (clientX - rect.left).
      const pixel = contentLayer.getAbsoluteTransform().point(anchorDoc);
      const sc = activeScroller();
      const r = sc.getBoundingClientRect();
      const mx = Math.max(0, (sc.clientWidth - konvaStage.width()) / 2);
      const my = Math.max(0, (sc.clientHeight - konvaStage.height()) / 2);
      sc.scrollLeft = pixel.x + mx - (anchor.x - r.left);
      sc.scrollTop = pixel.y + my - (anchor.y - r.top);
    }
    // Le pan par transform est transitoire : on le remet à zéro à chaque zoom.
    panOffset.x = 0;
    panOffset.y = 0;
    applyPanTransform();
  }

  function scrollerCenter() {
    const r = activeScroller().getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function zoomIn() {
    state.zoom = Math.min(ZOOM_MAX, state.zoom + ZOOM_STEP);
    applyZoom(scrollerCenter());
    render();
    if (onZoomChange) onZoomChange();
  }

  function zoomOut() {
    state.zoom = Math.max(ZOOM_MIN, state.zoom - ZOOM_STEP);
    applyZoom(scrollerCenter());
    render();
    if (onZoomChange) onZoomChange();
  }

  function zoomReset() {
    state.zoom = 1;
    applyZoom();
    render();
    if (onZoomChange) onZoomChange();
  }

  function getZoomPercent() {
    return Math.round(state.zoom * 100);
  }

  let onZoomChange = null;
  function setOnZoomChange(fn) { onZoomChange = fn; }

  // Zoom à la molette : Ctrl+molette agrandit/rétrécit autour du pointeur.
  // Outil caméra actif : la molette SANS modificateur zoome la CAMÉRA
  // autour du pointeur (l'image clé caméra de l'image courante est posée/
  // modifiée) — indispensable car les poignées d'angle du cadre deviennent
  // inatteignables dès que le cadre sort de la feuille (pan appuyé ou
  // dézoom) ; la molette, elle, fonctionne toujours.
  container.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey && state.currentTool === 'camera' && !state.playing && !state.editPath.length) {
      e.preventDefault();
      const p = stagePointer();
      if (!p) return;
      const cam = resolveCameraAtFrame(state.doc, state.currentFrame) || defaultCamera(state.doc);
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const zoom = Math.min(CAMERA_ZOOM_MAX, Math.max(CAMERA_ZOOM_MIN, cam.zoom * factor));
      if (zoom === cam.zoom) return;
      // Le point du document sous le pointeur reste fixe dans le cadre :
      // (p - cam') = (p - cam)·zoom/zoom' — la rotation s'annule de la
      // formule (même facteur des deux côtés de R(-θ)).
      const k = cam.zoom / zoom;
      upsertCameraKeyframe(state.doc, state.currentFrame, {
        zoom,
        x: p.x - (p.x - cam.x) * k,
        y: p.y - (p.y - cam.y) * k,
      });
      render();
      return;
    }
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, state.zoom + delta));
    if (newZoom === state.zoom) return;
    state.zoom = newZoom;
    applyZoom({ x: e.clientX, y: e.clientY });
    render();
    if (onZoomChange) onZoomChange();
  }, { passive: false });

  // Convertit des coordonnées client (événement DOM : glisser-déposer, clic
  // externe) en coordonnées document, en inversant la transformation absolue
  // du stage (même principe que getRelativePointerPosition()). La transform
  // du contentLayer (et non du stage seul) est inversée : pendant la lecture
  // sous caméra, le monde est transformé au niveau du calque — les clics des
  // scripts (Scene.onClick, événements pointer) tombent ainsi sur le bon
  // élément à travers la caméra.
  function pointFromClient(clientX, clientY) {
    // Rect du panLayer (et non du container) : getBoundingClientRect() suit
    // le scroll du scroller, l'origine suit donc la scène déplacée.
    const rect = panLayer.getBoundingClientRect();
    const abs = { x: clientX - rect.left, y: clientY - rect.top };
    return contentLayer.getAbsoluteTransform().copy().invert().point(abs);
  }

  return { konvaStage, render, resize, addInstanceAt, deleteSelected, copySelected, cutSelected, pasteClipboard, pointFromClient, zoomIn, zoomOut, zoomReset, getZoomPercent, setOnZoomChange, resetPan };
}
