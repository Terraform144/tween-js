import Konva from 'konva';
import { getContextLayers, insertKeyframe, createShape, createInstance, createPathPoint, createBone, getChildBones, getAllChildBones, solveIK, calculateBoneWeightsForPoint, applyBoneTransformToPoint, nextSkeletonId, getSkeletonBones, cloneElement, getActiveKeyframe } from '../core/model.js';
import { resolveLayersAtFrame } from '../playback/resolve.js';
import { getClipState } from '../runtime/clipStates.js';
import { notify } from '../state.js';
import { fullscreenElement, isElementFullscreen } from '../util/fullscreen.js';
import { ICONS } from '../ui/icons.js';

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

  // Le pan (outil main) translate ce wrapper interne et non `container`
  // lui-même : en plein écran natif, la feuille de style UA du navigateur
  // impose `transform: none !important` à l'élément fullscreen (spec WHATWG
  // §5.2), ce qui écraserait silencieusement tout transform inline posé sur
  // le conteneur — la scène devenait impossible à déplacer. Un enfant de
  // l'élément fullscreen n'est pas visé par cette règle.
  const panLayer = document.createElement('div');
  panLayer.className = 'stage-pan-layer';
  container.appendChild(panLayer);

  const konvaStage = new Konva.Stage({ container: panLayer, width: initialDoc.width, height: initialDoc.height });

  const bgLayer = new Konva.Layer({ listening: false });
  const contentLayer = new Konva.Layer();
  const overlayLayer = new Konva.Layer();
  konvaStage.add(bgLayer, contentLayer, overlayLayer);

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
  overlayLayer.add(transformer, handleGroup);

  // Cache d'images décodées, indexé par assetId. Tant qu'une image n'est pas
  // décodée (chargement asynchrone depuis le dataUrl), le nœud affiche un
  // placeholder ; le onload déclenche un re-rendu pour la montrer.
  const imageCache = new Map();
  const imagePending = new Map();
  function getImage(assetId) {
    const asset = (state.doc.assets || {})[assetId];
    if (!asset || !asset.dataUrl) return null;
    if (imageCache.has(assetId)) return imageCache.get(assetId);
    if (imagePending.has(assetId)) return null;
    const img = new Image();
    imagePending.set(assetId, img);
    img.onload = () => {
      imageCache.set(assetId, img);
      imagePending.delete(assetId);
      render(currentTick);
    };
    img.onerror = () => imagePending.delete(assetId);
    img.src = asset.dataUrl;
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
  let clipboard = []; // éléments copiés (Ctrl+C/X), hors state.doc pour ne jamais entrer dans l'historique d'annulation
  let panStart = null; // { mouseX, mouseY, offsetX, offsetY } — glisser-déposer en cours avec la main
  let panOffset = { x: 0, y: 0 }; // décalage CSS translate courant du conteneur

  function applyPanTransform() {
    panLayer.style.transform = (panOffset.x || panOffset.y) ? `translate(${panOffset.x}px, ${panOffset.y}px)` : '';
  }

  function resetPan() {
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
      if (img) {
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
          const elData = { points: el.points.map(clonePathPoint), closed: !!el.closed };
          node = new Konva.Shape({
            fill: el.closed ? el.fill : undefined,
            stroke: el.stroke,
            strokeWidth: el.strokeWidth,
            lineCap: el.lineCap || 'round',
            lineJoin: el.lineJoin || 'round',
            sceneFunc: (ctx, shape) => {
              const d = shape.getAttr('elData');
              ctx.beginPath();
              tracePath(ctx, d.points, d.closed);
              ctx.fillStrokeShape(shape);
            },
          });
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
    node.setAttrs({ x: el.x, y: el.y, rotation: el.rotation, scaleX: el.scaleX, scaleY: el.scaleY, opacity: el.opacity });
    node.id(el.id);
    node.setAttr('elKind', el.kind);
    node.setAttr('elShapeType', el.shapeType || null);
    node.setAttr('elLayerId', el.layerId);
    if (el.kind === 'instance') node.setAttr('symbolId', el.symbolId);
    if (el.kind === 'bone') {
      node.setAttr('boneLength', el.length);
      node.setAttr('boneColor', el.color);
      node.setAttr('boneStrokeWidth', el.strokeWidth);
    }
    return node;
  }

  // depth 0 = contenu directement éditable dans le contexte courant (scène
  // racine ou symbole en cours d'édition). En profondeur > 0 (contenu d'une
  // instance imbriquée), les objets restent visibles mais non interactifs :
  // il faut double-cliquer pour entrer dans ce symbole et l'éditer lui-même.
  function renderInto(parent, layers, frameIndex, tick, depth = 0) {
    const elements = resolveLayersAtFrame(layers, frameIndex);
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

  let currentTick = 0;
  function render(tick = 0) {
    // Changer d'outil en pleine plume ou chaîne de bones abandonnait un tracé fantôme
    if (drawState && drawState.tool === 'pen' && state.currentTool !== 'pen') cancelDraw();
    if (drawState && drawState.tool === 'boneChain' && state.currentTool !== 'boneChain') finishBoneChain();
    if (drawState && drawState.tool === 'brush' && state.currentTool !== 'brush') finishBrush();
    currentTick = tick;
    const doc = state.doc;
    bgRect.width(doc.width);
    bgRect.height(doc.height);
    bgRect.fill(doc.backgroundColor);
    contentLayer.destroyChildren();
    renderInto(contentLayer, currentLayers(), state.currentFrame, tick, 0);
    refreshSelectionVisuals();
    refreshPointHandles();
    contentLayer.draw();
    overlayLayer.batchDraw();
  }

  function refreshSelectionVisuals() {
    const nodes = state.selectedElementIds
      .map((id) => contentLayer.findOne('#' + id))
      .filter(Boolean);
    transformer.nodes(state.playing ? [] : nodes);
  }

  // ----------------------------------------------------------- interaction
  function attachInteraction(node, el) {
    if (state.playing) return;
    node.on('mousedown touchstart', (e) => {
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
    el.x = node.x();
    el.y = node.y();
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

  transformer.on('transformend', () => {
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
    const node = contentLayer.findOne('#' + subselectId);
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
    const tool = state.currentTool;
    if (tool === 'hand') {
      e.cancelBubble = true;
      const evt = e.evt;
      panStart = { mouseX: evt.clientX, mouseY: evt.clientY, offsetX: panOffset.x, offsetY: panOffset.y };
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
      startOrContinueBrush(p);
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

  konvaStage.on('mousemove touchmove', () => {
    if (panStart) {
      const dx = event.clientX - panStart.mouseX;
      const dy = event.clientY - panStart.mouseY;
      panOffset.x = panStart.offsetX + dx;
      panOffset.y = panStart.offsetY + dy;
      applyPanTransform();
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
      startOrContinueBrush(p);
    }
    overlayLayer.batchDraw();
  });

  konvaStage.on('mouseup touchend', () => {
    if (panStart) {
      panStart = null;
      container.classList.remove('grabbing');
      return;
    }
    if (marquee) { finishMarquee(); return; }
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
  window.addEventListener('mouseup', () => { if (marquee) finishMarquee(); if (panStart) { panStart = null; container.classList.remove('grabbing'); } });

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
      contentLayer.children.forEach((node2) => {
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
        const lastNode = contentLayer.findOne('#' + hitIds[hitIds.length - 1]);
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
      // Le pan n'est permis qu'en plein écran de la feuille (voir main.js)
      if (!isElementFullscreen(container)) return;
      if (state.currentTool === 'hand') { state.currentTool = 'select'; } else { state.currentTool = 'hand'; }
      notify(state);
      return;
    }
    if (e.key === 'Enter' && drawState && drawState.tool === 'pen') finishPen(false);
    if (e.key === 'Enter' && drawState && drawState.tool === 'boneChain') finishBoneChain();
    if (e.key === 'Escape' && drawState && drawState.tool === 'pen') cancelDraw();
    if (e.key === 'Escape' && drawState && drawState.tool === 'boneChain') cancelDraw();
    if (e.key === 'Escape' && drawState && drawState.tool === 'brush') cancelDraw();
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedElementIds.length) deleteSelected();
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
      el = createShape('rect', { x: x + w / 2, y: y + h / 2, width: w, height: h, fill: state.fillColor, stroke: state.strokeColor, strokeWidth: state.strokeWidth });
    } else if (tool === 'ellipse') {
      const w = Math.abs(last.x - start.x), h = Math.abs(last.y - start.y);
      if (w < 2 || h < 2) return;
      el = createShape('ellipse', { x: (start.x + last.x) / 2, y: (start.y + last.y) / 2, width: w, height: h, fill: state.fillColor, stroke: state.strokeColor, strokeWidth: state.strokeWidth });
    } else if (tool === 'line') {
      const dx = last.x - start.x, dy = last.y - start.y;
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
      el = createShape('line', { x: start.x, y: start.y, points: [createPathPoint(0, 0), createPathPoint(dx, dy)], stroke: state.strokeColor, strokeWidth: state.strokeWidth, width: Math.abs(dx), height: Math.abs(dy) });
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
    const ox = pts[0].x, oy = pts[0].y;
    const rel = pts.map((p) => createPathPoint(p.x - ox, p.y - oy, { cIn: p.cIn, cOut: p.cOut, smooth: p.smooth }));
    const xs = rel.map((p) => p.x), ys = rel.map((p) => p.y);
    const el = createShape('path', {
      x: ox, y: oy, points: rel, closed: closeShape,
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

  // Démarrer ou continuer le trait de pinceau
  function startOrContinueBrush(p) {
    if (!drawState || drawState.tool !== 'brush') {
      drawState = {
        tool: 'brush',
        points: [p],
        previewNode: null
      };
      const previewNode = new Konva.Line({
        points: [p.x, p.y, p.x, p.y],
        stroke: state.strokeColor,
        strokeWidth: state.brushSize || 5,
        lineCap: 'round',
        lineJoin: 'round',
        tension: 0.8,
        listening: false
      });
      drawState.previewNode = previewNode;
      overlayLayer.add(previewNode);
    } else {
      const points = drawState.points;
      const last = points[points.length - 1];
      const dist = distance(p, last);
      if (dist < BRUSH_MIN_DISTANCE) return;
      points.push(p);
      const flatPoints = points.flatMap(pt => [pt.x, pt.y]);
      drawState.previewNode.points(flatPoints);
      overlayLayer.batchDraw();
    }
  }

  // Finaliser le trait de pinceau
  function finishBrush() {
    if (!drawState || drawState.tool !== 'brush' || drawState.points.length < 2) {
      cancelDraw();
      return;
    }
    let points = drawState.points;
    
    // Étape 1 : Simplifier avec Ramer-Douglas-Peucker
    points = simplifyPointsRD(points, 2.0);
    
    // Étape 2 : Convertir en courbe Bézier lisse
    points = createSmoothPath(points, 0.6);
    
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const ox = minX;
    const oy = minY;
    const relPoints = points.map(p => createPathPoint(p.x - ox, p.y - oy));
    const el = createShape('path', {
      x: ox, y: oy,
      points: relPoints,
      closed: false,
      width: maxX - minX,
      height: maxY - minY,
      fill: 'transparent',
      stroke: state.strokeColor,
      strokeWidth: state.brushSize || 5
    });
    cancelDraw();
    addElement(el);
    state.currentTool = 'select';
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
    const el = createShape('text', {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
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

  function addElement(el) {
    commitToActiveKeyframe((kf) => kf.elements.push(el));
    state.selectedElementIds = [el.id];
    notify(state);
  }

  function deleteSelected() {
    const layer = activeLayer();
    if (!layer) return;
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
    clipboard = elements.map((el) => cloneElement(el, false));
  }

  function cutSelected() {
    if (!state.selectedElementIds.length) return;
    copySelected();
    deleteSelected();
  }

  function pasteClipboard() {
    if (!clipboard.length) return;
    const layer = activeLayer();
    if (!layer || layer.locked) return;
    const pasted = clipboard.map((el) => cloneElement(el, true));
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
  function resize() {
    const doc = state.doc;
    const fullscreenTarget = fullscreenElement();
    const isSheetFullscreen = fullscreenTarget === container;
    const availEl = isSheetFullscreen ? container : container.parentElement;
    const availW = Math.max(80, (availEl ? availEl.clientWidth : doc.width) - 24);
    const availH = Math.max(80, (availEl ? availEl.clientHeight : doc.height) - 24);
    fitScale = isSheetFullscreen
      ? Math.min(availW / doc.width, availH / doc.height)
      : Math.min(1, availW / doc.width, availH / doc.height);
    resetPan();
    applyZoom();
    render();
  }

  const ZOOM_MIN = 0.1;
  const ZOOM_MAX = 10;
  const ZOOM_STEP = 0.25;

  function applyZoom() {
    const doc = state.doc;
    const scale = fitScale * state.zoom;
    konvaStage.width(Math.round(doc.width * scale));
    konvaStage.height(Math.round(doc.height * scale));
    konvaStage.scale({ x: scale, y: scale });
  }

  function zoomIn() {
    state.zoom = Math.min(ZOOM_MAX, state.zoom + ZOOM_STEP);
    applyZoom();
    render();
    if (onZoomChange) onZoomChange();
  }

  function zoomOut() {
    state.zoom = Math.max(ZOOM_MIN, state.zoom - ZOOM_STEP);
    applyZoom();
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

  // Zoom à la molette : Ctrl+molette agrandit/rétrécit autour du pointeur
  container.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, state.zoom + delta));
    if (newZoom === state.zoom) return;
    state.zoom = newZoom;
    applyZoom();
    render();
    if (onZoomChange) onZoomChange();
  }, { passive: false });

  // Convertit des coordonnées client (événement DOM : glisser-déposer, clic
  // externe) en coordonnées document, en inversant la transformation absolue
  // du stage (même principe que getRelativePointerPosition()).
  function pointFromClient(clientX, clientY) {
    // Rect du panLayer (et non du container) : c'est lui que le pan translate,
    // l'origine doit donc suivre la scène déplacée.
    const rect = panLayer.getBoundingClientRect();
    const abs = { x: clientX - rect.left, y: clientY - rect.top };
    return konvaStage.getAbsoluteTransform().copy().invert().point(abs);
  }

  return { konvaStage, render, resize, addInstanceAt, deleteSelected, copySelected, cutSelected, pasteClipboard, pointFromClient, zoomIn, zoomOut, zoomReset, getZoomPercent, setOnZoomChange, resetPan };
}
