import {
  createLayer, getContextLayers, getContextFrameCount, setContextFrameCount,
  getKeyframeAt, getActiveKeyframe, getNextKeyframe, insertKeyframe, insertBlankKeyframe,
  removeKeyframe, moveKeyframe, toggleTween, getFrameLabels, getFrameLabel, setFrameLabel,
} from '../core/model.js';
import { notify } from '../state.js';
import { getPref, setPref, hasPref } from '../util/prefs.js';
import { ICONS } from './icons.js';
import { isTouchLike, isPhoneSize } from '../util/responsive.js';
import { enableDragScroll } from '../util/dragScroll.js';

const CELL_W = 16;

// Doit rester synchronisé avec .tl-layer-row / .tl-track-row dans style.css
// (même seuil, via isTouchLike) — la hauteur de ligne y grossit pour le
// doigt, donc les hauteurs calculées en JS (tracksBody, playhead) doivent
// suivre la même bascule.
function rowHeight() {
  return isTouchLike() ? 34 : 24;
}

export function mountTimeline(container, state) {
  container.innerHTML = '';

  const toolbar = document.createElement('div');
  toolbar.className = 'tl-toolbar';

  const btnAddLayer = svgButton('plus', 'Nouveau calque');
  const btnDelLayer = svgButton('trash', 'Supprimer le calque');
  const btnKeyframe = iconButton('F6', 'Insérer une image clé');
  const btnBlank = iconButton('F7', 'Insérer une image clé vide');
  const btnTween = svgButton('tween', 'Activer/désactiver le tween de mouvement');
  const btnRemoveKf = svgButton('close', 'Supprimer l\'image clé');
  const btnPlay = svgButton('play', 'Lecture / Pause (Entrée)');

  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.placeholder = 'Étiquette (label)';
  labelInput.title = "Nom de l'image courante — utilisable avec gotoAndPlay('label') à l'export";
  labelInput.style.width = '110px';
  labelInput.addEventListener('change', () => {
    const layer = selectedLayer();
    if (!layer) return;
    setFrameLabel(state.doc, state.editPath, state.currentFrame, labelInput.value);
    notify(state);
  });

  const frameInfo = document.createElement('span');
  frameInfo.className = 'frame-info';

  const btnCollapse = svgButton('chevronDown', 'Réduire / agrandir la timeline');
  // Premier chargement (aucune préférence enregistrée) : repliée par défaut
  // sur téléphone pour laisser un maximum de place à la scène.
  let collapsed = hasPref('timelineCollapsed') ? getPref('timelineCollapsed', false) : isPhoneSize();
  function applyCollapsed() {
    container.classList.toggle('collapsed', collapsed);
    btnCollapse.innerHTML = ICONS[collapsed ? 'chevronRight' : 'chevronDown'];
  }
  btnCollapse.addEventListener('click', () => {
    collapsed = !collapsed;
    setPref('timelineCollapsed', collapsed);
    applyCollapsed();
  });
  applyCollapsed();

  toolbar.append(btnAddLayer, btnDelLayer, sep(), btnKeyframe, btnBlank, btnTween, btnRemoveKf, sep(), labelInput, sep(), btnPlay, frameInfo, btnCollapse);
  enableDragScroll(toolbar);

  const body = document.createElement('div');
  body.className = 'tl-body';

  const header = document.createElement('div');
  header.className = 'tl-header';
  header.textContent = 'Calques';

  const layersCol = document.createElement('div');
  layersCol.className = 'tl-layers';

  const tracksScroll = document.createElement('div');
  tracksScroll.className = 'tl-tracks-scroll';

  const ruler = document.createElement('div');
  ruler.className = 'tl-ruler';

  const tracksBody = document.createElement('div');
  tracksBody.style.position = 'relative';

  const playhead = document.createElement('div');
  playhead.className = 'tl-playhead';

  tracksScroll.append(ruler, tracksBody, playhead);
  body.append(header, layersCol, tracksScroll);
  container.append(toolbar, body);

  let scrubbing = false;
  let scrubTarget = -1;
  window.addEventListener('mouseup', () => { scrubbing = false; scrubTarget = -1; });

  // ----------------------------------------------- glisser-déposer des clés
  // Déplace une keyframe existante le long de sa piste. Les tweens ne sont
  // jamais un lien explicite vers "l'autre" keyframe (juste kf.tween + l'ordre
  // du tableau, voir moveKeyframe() dans core/model.js) : on interdit donc de
  // sauter par-dessus une keyframe voisine pendant le glissé, ce qui garantit
  // que les tweens en cours restent intacts (seule leur durée peut changer).
  let keyDrag = null; // { layer, kf, startIndex, startX, targetIndex, cell, track, minIndex, maxIndex }

  function startKeyDrag(e, layer, kf, index, cell) {
    if (e.button !== 0) return;
    e.preventDefault();
    const arr = layer.keyframes;
    const idx = arr.indexOf(kf);
    const prev = arr[idx - 1];
    const next = arr[idx + 1];
    keyDrag = {
      layer, kf, startIndex: index, startX: e.clientX, targetIndex: index,
      cell, track: cell.parentElement,
      minIndex: prev ? prev.index + 1 : 0,
      maxIndex: next ? next.index - 1 : frameCount() - 1,
    };
    window.addEventListener('pointermove', onKeyDragMove);
    window.addEventListener('pointerup', onKeyDragEnd, { once: true });
  }

  function onKeyDragMove(e) {
    if (!keyDrag) return;
    const dxFrames = Math.round((e.clientX - keyDrag.startX) / CELL_W);
    const target = Math.max(0, Math.min(frameCount() - 1, keyDrag.startIndex + dxFrames));
    if (target === keyDrag.targetIndex) return;
    keyDrag.targetIndex = target;
    const { track, startIndex, cell, minIndex, maxIndex } = keyDrag;
    cell.style.transform = `translateX(${(target - startIndex) * CELL_W}px)`;
    cell.classList.add('dragging-key');
    Array.from(track.children).forEach((c) => c.classList.remove('drop-target', 'drop-invalid'));
    if (target !== startIndex) {
      const targetCell = track.children[target];
      if (targetCell) targetCell.classList.add(target >= minIndex && target <= maxIndex ? 'drop-target' : 'drop-invalid');
    }
  }

  function onKeyDragEnd() {
    window.removeEventListener('pointermove', onKeyDragMove);
    if (!keyDrag) return;
    const { layer, kf, startIndex, targetIndex, cell, track } = keyDrag;
    keyDrag = null;
    cell.style.transform = '';
    cell.classList.remove('dragging-key');
    Array.from(track.children).forEach((c) => c.classList.remove('drop-target', 'drop-invalid'));

    state.selectedLayerId = layer.id;
    state.currentFrame = (targetIndex !== startIndex && moveKeyframe(layer, kf, targetIndex)) ? targetIndex : startIndex;
    notify(state);
  }

  // ------------------------------------------------- réordonnancement des calques
  // Glisser une ligne de calque (colonne de gauche) vers le haut ou le bas
  // réordonne la pile. Le panneau affiche la pile à l'envers (haut de liste =
  // calque du dessus, comme Animate), on travaille donc en espace "affichage"
  // puis on réinjecte l'ordre inversé dans le tableau du modèle (index 0 =
  // bas, cohérent avec le rendu de Stage).
  let layerDrag = null; // { layer, row, fromIndex, startY, targetGap, moved }

  function startLayerDrag(e, layer, row) {
    if (e.button !== 0) return;
    if (e.target.closest('.mini-btn')) return;
    if (layersInContext().length <= 1) return;
    e.preventDefault();
    const rows = Array.from(layersCol.querySelectorAll('.tl-layer-row'));
    const idx = rows.indexOf(row);
    layerDrag = { layer, row, fromIndex: idx, startY: e.clientY, targetGap: idx, moved: false };
    window.addEventListener('pointermove', onLayerDragMove);
    window.addEventListener('pointerup', onLayerDragEnd, { once: true });
  }

  function onLayerDragMove(e) {
    if (!layerDrag) return;
    if (!layerDrag.moved) {
      if (Math.abs(e.clientY - layerDrag.startY) < 4) return;
      layerDrag.moved = true;
      layerDrag.row.classList.add('dragging');
    }
    const rows = Array.from(layersCol.querySelectorAll('.tl-layer-row'));
    let gap = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (e.clientY > r.top + r.height / 2) gap = i + 1;
      else break;
    }
    if (gap !== layerDrag.targetGap) {
      layerDrag.targetGap = gap;
      layersCol.querySelectorAll('.drop-line').forEach((el) => el.remove());
      const line = document.createElement('div');
      line.className = 'drop-line';
      line.style.top = (gap * rowHeight() - 1) + 'px';
      layersCol.appendChild(line);
    }
  }

  function onLayerDragEnd() {
    window.removeEventListener('pointermove', onLayerDragMove);
    if (!layerDrag) return;
    const { layer, fromIndex, targetGap, row } = layerDrag;
    layerDrag = null;
    row.classList.remove('dragging');
    layersCol.querySelectorAll('.drop-line').forEach((el) => el.remove());
    if (targetGap === fromIndex) return;

    // Espace "affichage" (haut = dernier calque du modèle) → on insère à la
    // position visée, on retire l'occurrence d'origine puis on réinverse pour
    // retrouver l'ordre du modèle (index 0 = bas, rendu dans cet ordre).
    const layers = layersInContext();
    const display = layers.slice().reverse();
    const from = display.indexOf(layer);
    display.splice(targetGap, 0, layer);
    if (from < targetGap) display.splice(from, 1);
    else display.splice(from + 1, 1);
    layers.length = 0;
    layers.push(...display.reverse());
    state.selectedLayerId = layer.id;
    notify(state);
  }

  let syncing = false;
  layersCol.addEventListener('scroll', () => {
    if (syncing) return;
    syncing = true; tracksScroll.scrollTop = layersCol.scrollTop; syncing = false;
  });
  tracksScroll.addEventListener('scroll', () => {
    if (syncing) return;
    syncing = true; layersCol.scrollTop = tracksScroll.scrollTop; syncing = false;
  });

  btnAddLayer.addEventListener('click', () => {
    const layers = layersInContext();
    const layer = createLayer(`Calque ${layers.length + 1}`);
    layers.push(layer);
    state.selectedLayerId = layer.id;
    notify(state);
  });

  btnDelLayer.addEventListener('click', () => {
    const layers = layersInContext();
    if (layers.length <= 1) return;
    const idx = layers.findIndex((l) => l.id === state.selectedLayerId);
    if (idx === -1) return;
    layers.splice(idx, 1);
    state.selectedLayerId = layers[Math.max(0, idx - 1)].id;
    notify(state);
  });

  function editableLayer() {
    const layer = selectedLayer();
    return layer && !layer.locked ? layer : null;
  }

  btnKeyframe.addEventListener('click', () => {
    const layer = editableLayer();
    if (layer) { insertKeyframe(layer, state.currentFrame); notify(state); }
  });
  btnBlank.addEventListener('click', () => {
    const layer = editableLayer();
    if (layer) { insertBlankKeyframe(layer, state.currentFrame); notify(state); }
  });
  btnTween.addEventListener('click', () => {
    const layer = editableLayer();
    if (!layer) return;
    let kf = getKeyframeAt(layer, state.currentFrame);
    if (!kf) kf = insertKeyframe(layer, state.currentFrame);

    if (kf.tween) {
      // Déjà tweenée : simple bascule pour désactiver.
      toggleTween(layer, kf);
    } else {
      // Une image de fin est nécessaire pour interpoler vers elle. Si elle
      // n'existe pas encore, on la crée automatiquement (contenu cloné) à
      // 12 images plus loin — l'utilisateur n'a plus qu'à venir y repositionner
      // les objets pour définir l'animation.
      let next = getNextKeyframe(layer, kf);
      if (!next) {
        const targetIndex = Math.min(frameCount() - 1, kf.index + 12);
        if (targetIndex <= kf.index) {
          alert("Pas assez d'images après la tête de lecture pour créer un tween : augmente le nombre d'images de la scène ou déplace la tête de lecture plus tôt.");
          return;
        }
        next = insertKeyframe(layer, targetIndex);
      }
      toggleTween(layer, kf);
      state.currentFrame = next.index;
    }
    notify(state);
  });
  btnRemoveKf.addEventListener('click', () => {
    const layer = editableLayer();
    if (!layer) return;
    // getKeyframeAt() ne trouve que les images qui SONT elles-mêmes une
    // keyframe explicite : sur une image "tenue" (fantôme, entre deux clés)
    // elle renvoyait null et le bouton ne faisait alors rien, sans que rien
    // ne le signale — d'où l'impression que "x" n'efface pas toujours.
    // getActiveKeyframe() résout systématiquement vers la clé qui gouverne
    // réellement le contenu affiché à la tête de lecture (pleine ou vide),
    // qu'on soit pile dessus ou sur une image tenue après elle.
    const kf = getActiveKeyframe(layer, state.currentFrame);
    if (kf && removeKeyframe(layer, kf)) notify(state);
  });
  btnPlay.addEventListener('click', () => {
    state.playing = !state.playing;
    notify(state);
  });

  window.addEventListener('keydown', (e) => {
    if (isTypingTarget(e.target)) return;
    const layer = editableLayer();
    if (e.key === 'F6' && layer) { e.preventDefault(); insertKeyframe(layer, state.currentFrame); notify(state); }
    if (e.key === 'F7' && layer) { e.preventDefault(); insertBlankKeyframe(layer, state.currentFrame); notify(state); }
    if (e.code === 'Space') { e.preventDefault(); state.playing = !state.playing; notify(state); }
  });

  function layersInContext() { return getContextLayers(state.doc, state.editPath); }
  function selectedLayer() { return layersInContext().find((l) => l.id === state.selectedLayerId); }
  function frameCount() { return getContextFrameCount(state.doc, state.editPath); }

  function buildRuler() {
    ruler.innerHTML = '';
    const n = frameCount();
    const labels = getFrameLabels(state.doc, state.editPath);
    for (let i = 0; i < n; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.style.width = CELL_W + 'px';
      if (labels[i]) {
        cell.classList.add('has-label');
        cell.innerHTML = ICONS.tag;
        cell.title = labels[i];
      } else if (i % 5 === 0) {
        cell.textContent = String(i + 1);
      }
      cell.addEventListener('mousedown', () => { scrubbing = true; state.currentFrame = i; notify(state); });
      cell.addEventListener('mouseenter', () => { if (scrubbing) { state.currentFrame = i; notify(state); } });
      ruler.appendChild(cell);
    }
    ruler.style.width = n * CELL_W + 'px';
  }

  function buildLayersAndTracks() {
    layersCol.innerHTML = '';
    tracksBody.innerHTML = '';
    const layers = layersInContext().slice().reverse(); // top-of-panel = last in model array
    const n = frameCount();

    for (const layer of layers) {
      const row = document.createElement('div');
      row.className = 'tl-layer-row' + (layer.id === state.selectedLayerId ? ' selected' : '');

      const eye = document.createElement('span');
      eye.className = 'mini-btn' + (layer.visible ? ' active' : '');
      eye.innerHTML = ICONS[layer.visible ? 'eye' : 'eyeOff'];
      eye.title = 'Afficher / masquer';
      eye.addEventListener('click', (e) => { e.stopPropagation(); layer.visible = !layer.visible; notify(state); });

      const lock = document.createElement('span');
      lock.className = 'mini-btn' + (layer.locked ? ' active' : '');
      lock.innerHTML = ICONS[layer.locked ? 'lockClosed' : 'lockOpen'];
      lock.title = 'Verrouiller / déverrouiller';
      lock.addEventListener('click', (e) => { e.stopPropagation(); layer.locked = !layer.locked; notify(state); });

      const name = document.createElement('span');
      name.className = 'layer-name';
      name.textContent = layer.name;
      name.title = 'Double-clic pour renommer';
      name.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const next = prompt('Nom du calque :', layer.name);
        if (next) { layer.name = next; notify(state); }
      });

      row.append(eye, name, lock);
      row.addEventListener('click', () => { state.selectedLayerId = layer.id; notify(state); });
      row.addEventListener('pointerdown', (e) => startLayerDrag(e, layer, row));
      layersCol.appendChild(row);

      const track = document.createElement('div');
      track.className = 'tl-track-row';
      track.style.width = n * CELL_W + 'px';
      for (let i = 0; i < n; i++) {
        track.appendChild(buildFrameCell(layer, i));
      }
      tracksBody.appendChild(track);
    }
    tracksBody.style.width = n * CELL_W + 'px';
    tracksBody.style.height = layers.length * rowHeight() + 'px';
  }

  function buildFrameCell(layer, index) {
    const cell = document.createElement('div');
    cell.className = 'tl-frame-cell';
    cell.style.width = CELL_W + 'px';
    const kf = getKeyframeAt(layer, index);
    const active = getActiveKeyframe(layer, index);
    const hasContent = active && active.elements.length > 0;
    if (hasContent) cell.classList.add('has-content');
    if (active && active.tween) {
      const next = getNextKeyframe(layer, active);
      if (next && index < next.index) {
        cell.classList.add('tweened');
        if (index === next.index - 1) cell.classList.add('tween-arrow-end');
      }
    }
    if (kf) cell.classList.add(kf.elements.length ? 'keyframe' : 'blank-keyframe');
    if (layer.id === state.selectedLayerId && index === state.currentFrame) cell.classList.add('selected');
    if (kf && !layer.locked) cell.classList.add('draggable-key');
    if (kf && kf.script && kf.script.trim()) {
      cell.classList.add('has-script');
      const badge = document.createElement('span');
      badge.className = 'frame-script-badge';
      badge.textContent = 'a';
      badge.title = "Script sur cette image — clic pour l'éditer dans le panneau Scripts";
      // pointerdown (pas click) : intercepte AVANT le pointerdown du parent
      // (cell) qui sinon démarrerait un glisser de keyframe ou un scrub.
      badge.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        state.selectedLayerId = layer.id;
        state.currentFrame = index;
        state.focusFrameScript = { layerId: layer.id, frameIndex: index };
        notify(state);
      });
      cell.appendChild(badge);
    }
    cell.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (kf && !layer.locked) {
        startKeyDrag(e, layer, kf, index, cell);
      } else {
        e.preventDefault();
        scrubbing = true;
        scrubTarget = index;
        state.selectedLayerId = layer.id;
        state.currentFrame = index;
        notify(state);
      }
    });
    // Glisser sur une cellule "tenue" (hors keyframe) scrube la tête de lecture
    // comme sur la règle, pour prévisualiser l'animation image par image.
    cell.addEventListener('pointermove', () => {
      if (scrubbing && scrubTarget !== index) {
        scrubTarget = index;
        state.currentFrame = index;
        notify(state);
      }
    });
    return cell;
  }

  function update() {
    const n = frameCount();
    buildRuler();
    buildLayersAndTracks();
    playhead.style.left = state.currentFrame * CELL_W + 'px';
    playhead.style.height = layersInContext().length * rowHeight() + 20 + 'px';
    btnPlay.innerHTML = ICONS[state.playing ? 'pause' : 'play'];
    frameInfo.textContent = `Image ${state.currentFrame + 1} / ${n} — ${state.doc.frameRate} i/s`;

    const layer = selectedLayer();
    const locked = !layer || !!layer.locked;
    const kfHere = layer && getKeyframeAt(layer, state.currentFrame);
    btnTween.classList.toggle('active', !!(kfHere && kfHere.tween));
    btnTween.disabled = locked;
    btnKeyframe.disabled = locked;
    btnBlank.disabled = locked;
    // Un calque ne peut jamais se retrouver sans aucune keyframe : rien à
    // effacer s'il n'en reste qu'une seule (le cas normal en dehors de ça est
    // couvert par getActiveKeyframe() dans le handler, toujours resolvable).
    btnRemoveKf.disabled = locked || (layer && layer.keyframes.length <= 1);
    btnDelLayer.disabled = layersInContext().length <= 1;

    const currentLabel = getFrameLabel(state.doc, state.editPath, state.currentFrame);
    if (document.activeElement !== labelInput) labelInput.value = currentLabel;
  }

  update();
  return { update };
}

function iconButton(label, title) {
  const b = document.createElement('button');
  b.className = 'icon-btn';
  b.textContent = label;
  b.title = title;
  return b;
}

function svgButton(name, title) {
  const b = document.createElement('button');
  b.className = 'icon-btn';
  b.innerHTML = ICONS[name];
  b.title = title;
  return b;
}

function sep() {
  const s = document.createElement('div');
  s.className = 'sep';
  return s;
}

function isTypingTarget(target) {
  return target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
}
