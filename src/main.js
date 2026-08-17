import { createDocument, createShape, createBitmap, addAsset, getContextFrameCount, nextId, insertKeyframe, getContextLayers } from './core/model.js';
import { createEditorState, subscribe, notify } from './state.js';
import { createHistory } from './history.js';
import { createStage } from './stage/Stage.js';
import { mountToolbar } from './ui/Toolbar.js';
import { mountTimeline } from './ui/Timeline.js';
import { mountLibraryPanel } from './ui/LibraryPanel.js';
import { mountScriptsPanel } from './ui/ScriptsPanel.js';
import { mountPropertiesPanel } from './ui/PropertiesPanel.js';
import { mountMenuBar } from './ui/MenuBar.js';
import { createSceneRuntime } from './runtime/sceneRuntime.js';
import { getClipState } from './runtime/clipStates.js';
import { resolveLayersAtFrame } from './playback/resolve.js';
import { getPref, setPref, hasPref } from './util/prefs.js';
import { toggleFullscreen, isElementFullscreen, onFullscreenChange } from './util/fullscreen.js';
import { ICONS } from './ui/icons.js';
import { isNarrowViewport, isTouchLike, isPhoneSize, isLargeScreen } from './util/responsive.js';

const doc = createDocument({ name: 'Sans titre' });

const state = createEditorState(doc);

// Créé tôt : createHistory() s'abonne immédiatement à state, et doit voir
// chaque notify() AVANT le rendu (voir plus bas) pour que les boutons
// annuler/rétablir reflètent l'état à jour dès ce même passage.
const rawHistory = createHistory(state);

// Doit être déclaré avant renderAll() (appelé plus bas dès le montage) car
// il y est référencé.
let tick = 0;

// Créer timeline et properties d'abord (ils sont référencés dans onSelectionChange du stage)
const timelineCtl = mountTimeline(document.getElementById('timeline'), state);
const propertiesCtl = mountPropertiesPanel(document.getElementById('properties-panel'), state);

const stageContainer = document.getElementById('stage-container');
const stage = createStage({
  container: stageContainer,
  state,
  // Une sélection ne change pas le document : on ne redessine que les
  // panneaux qui en dépendent, jamais la scène elle-même (voir Stage.js).
  onSelectionChange: () => {
    toolbarCtl.update();
    propertiesCtl.update();
    timelineCtl.update();
  },
});

// Bouton carré posé sur la feuille (coin haut droit) : ne met en plein écran
// QUE la feuille de travail, pas toute l'application. L'icône change selon
// l'état (entrer/quitter), et la scène est recalculée pour remplir l'écran.
const stageFullscreenBtn = document.createElement('button');
stageFullscreenBtn.type = 'button';
stageFullscreenBtn.className = 'stage-fullscreen-btn';
const isSheetFullscreen = () => isElementFullscreen(stageContainer);
const updateFsBtn = () => {
  const active = isSheetFullscreen();
  stageFullscreenBtn.innerHTML = ICONS[active ? 'exitFullscreen' : 'fullscreen'];
  stageFullscreenBtn.title = active ? 'Quitter le plein écran (Échap)' : 'Plein écran de la feuille de travail';
};
stageFullscreenBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleFullscreen(stageContainer);
});
onFullscreenChange(() => { updateFsBtn(); stage.resize(); });
stageContainer.appendChild(stageFullscreenBtn);
updateFsBtn();

const toolbarCtl = mountToolbar(document.getElementById('toolbar'), state, {
  onDelete: stage.deleteSelected,
});

const banner = document.createElement('div');
banner.className = 'edit-path-banner';
banner.style.display = 'none';
banner.addEventListener('click', () => {
  state.editPath = state.editPath.slice(0, -1);
  state.selectedElementIds = [];
  state.currentFrame = 0;
  notify(state);
});
document.getElementById('stage-wrap').appendChild(banner);

const libraryCtl = mountLibraryPanel(document.getElementById('library-panel'), state, {
  addInstanceAt: stage.addInstanceAt,
});

const sceneRuntime = createSceneRuntime({ state, onResize: () => stage.resize() });

const scriptsCtl = mountScriptsPanel(document.getElementById('scripts-panel'), state, {
  runtime: sceneRuntime,
});

// Un undo/redo remplace state.doc en bloc — la taille de scène peut avoir
// changé (ex. on annule un redimensionnement), donc on redimensionne le
// Konva.Stage en plus du re-rendu déjà déclenché par notify().
const history = {
  undo: () => { rawHistory.undo(); stage.resize(); },
  redo: () => { rawHistory.redo(); stage.resize(); },
  canUndo: rawHistory.canUndo,
  canRedo: rawHistory.canRedo,
};

const menuBarCtl = mountMenuBar(document.getElementById('menubar'), state, {
  onDocReplaced: () => {},
  onStageResize: () => stage.resize(),
  history,
  onSvgImport: (elements) => {
    // Trouver le calque actif
    const layers = getContextLayers(state.doc, state.editPath);
    const layer = layers.find((l) => l.id === state.selectedLayerId) || layers[layers.length - 1];
    if (!layer || layer.locked) return;
    const kf = insertKeyframe(layer, state.currentFrame);
    // Ajouter tous les éléments importés
    for (const el of elements) {
      // S'assurer que chaque élément a un ID unique
      if (!el.id) el.id = nextId('shape');
      el.layerId = layer.id;
      kf.elements.push(el);
    }
    notify(state);
  },
  onImageImport: (asset) => {
    addBitmapAsset(asset, { x: state.doc.width / 2, y: state.doc.height / 2 });
  },
});

// Place une image importée (asset déjà créé dans doc.assets par le menu) dans
// la keyframe active du calque actif, à la position donnée (centre de la
// scène pour l'import via le menu, point de dépôt pour le glisser-déposer).
// La taille d'affichage est plafonnée pour que l'image tienne dans la scène
// (proportions conservées), au lieu de déborder aux dimensions naturelles.
function addBitmapAsset(asset, pos) {
  const layers = getContextLayers(state.doc, state.editPath);
  const layer = layers.find((l) => l.id === state.selectedLayerId) || layers[layers.length - 1];
  if (!layer || layer.locked) return;
  const kf = insertKeyframe(layer, state.currentFrame);
  const el = createBitmap(asset.id, { x: pos.x, y: pos.y, ...fitBitmapInScene(asset) });
  kf.elements.push(el);
  state.selectedElementIds = [el.id];
  notify(state);
}

// Taille d'affichage d'un bitmap importé : au plus 90 % de la scène en largeur
// et en hauteur, sans jamais agrandir une image déjà plus petite que ça.
function fitBitmapInScene(asset) {
  const doc = state.doc;
  const natW = asset.width || 100, natH = asset.height || 100;
  const scale = Math.min(1, (doc.width * 0.9) / natW, (doc.height * 0.9) / natH);
  return { width: Math.max(1, Math.round(natW * scale)), height: Math.max(1, Math.round(natH * scale)) };
}

// Glisser-déposer d'un fichier image directement sur la scène : le point de
// dépôt (en coordonnées document) est converti via stage.pointFromClient.
stageContainer.addEventListener('dragenter', (e) => e.preventDefault());
stageContainer.addEventListener('dragover', (e) => e.preventDefault());
stageContainer.addEventListener('drop', (e) => {
  e.preventDefault();
  const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
  const file = files.find((f) => (f.type || '').startsWith('image/'));
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const asset = addAsset(state.doc, {
        name: file.name,
        type: file.type || 'image/png',
        dataUrl: reader.result,
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
      const pos = stage.pointFromClient(e.clientX, e.clientY);
      addBitmapAsset(asset, pos);
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});

function updateBanner() {
  if (state.editPath.length) {
    const symbolId = state.editPath[state.editPath.length - 1];
    const symbol = state.doc.symbols[symbolId];
    banner.innerHTML = `${ICONS.pencil} <span>Édition de « ${symbol ? symbol.name : '?'} » — cliquer pour revenir à la scène</span>`;
    banner.style.display = 'block';
  } else {
    banner.style.display = 'none';
  }
}

// ------------------------------------------------ redimensionnement latéral
// Le panneau bibliothèque, le panneau propriétés et tout futur panneau
// empilé dans #sidebar partagent la même colonne de grille : élargir cette
// colonne les élargit tous ensemble (voir Panel.js pour l'empilement).
//
// Sous ce seuil (tablette/mobile), le panneau ne pousse plus la scène : il
// devient un tiroir en position fixe par-dessus, avec un fond cliquable
// pour le refermer — plus de glisser-déposer pour le redimensionner dans ce
// mode (peu fiable au doigt), juste le bouton pour l'ouvrir/fermer.
const isOverlayMode = isNarrowViewport;
function toolbarWidth() {
  if (isTouchLike()) return 56;
  if (isLargeScreen()) return 58; // TV/4K : contrôles plus grands, voir style.css
  return 44;
}

const mainEl = document.getElementById('main');
const sidebarEl = document.getElementById('sidebar');
const sidebarResizer = document.getElementById('sidebar-resizer');

const sidebarToggleBtn = document.createElement('button');
sidebarToggleBtn.id = 'sidebar-toggle-btn';
sidebarToggleBtn.title = 'Afficher / masquer le panneau latéral';
sidebarResizer.appendChild(sidebarToggleBtn);

const sidebarBackdrop = document.createElement('div');
sidebarBackdrop.id = 'sidebar-backdrop';
sidebarBackdrop.addEventListener('click', () => {
  sidebarCollapsed = true;
  setPref('sidebarFullyCollapsed', true);
  applySidebarCollapse();
});
document.body.appendChild(sidebarBackdrop);

function applySidebarWidth(px) {
  const tb = toolbarWidth();
  mainEl.style.gridTemplateColumns = isOverlayMode() ? `${tb}px 1fr 34px` : `${tb}px 1fr 5px ${px}px`;
}

let sidebarWidth = getPref('sidebarWidth', isLargeScreen() ? 320 : 260);
// Premier chargement (aucune préférence enregistrée) : replié par défaut sur
// mobile/tablette pour laisser la scène occuper tout l'écran — dès que
// l'utilisateur touche au réglage, son choix est mémorisé et prime toujours.
let sidebarCollapsed = hasPref('sidebarFullyCollapsed') ? getPref('sidebarFullyCollapsed', false) : isNarrowViewport();

// Bandeau d'info cookies : aucun cookie n'est posé (voir mentions-legales.html),
// la fermeture est donc simplement mémorisée en préférence locale comme le
// reste de la mise en page, pas un consentement à tracer.
const cookieBar = document.getElementById('cookie-bar');
if (cookieBar) {
  if (getPref('cookieBarDismissed', false)) cookieBar.style.display = 'none';
  document.getElementById('cookie-bar-close')?.addEventListener('click', () => {
    setPref('cookieBarDismissed', true);
    cookieBar.style.display = 'none';
  });
}

function applySidebarCollapse() {
  const overlay = isOverlayMode();
  sidebarEl.classList.toggle('overlay-mode', overlay);
  sidebarEl.style.display = sidebarCollapsed ? 'none' : '';
  sidebarBackdrop.classList.toggle('visible', overlay && !sidebarCollapsed);
  applySidebarWidth(sidebarCollapsed ? 0 : sidebarWidth);
  sidebarToggleBtn.innerHTML = ICONS[sidebarCollapsed ? 'chevronLeft' : 'chevronRight'];
}
applySidebarCollapse();

sidebarToggleBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  sidebarCollapsed = !sidebarCollapsed;
  setPref('sidebarFullyCollapsed', sidebarCollapsed);
  applySidebarCollapse();
});

let resizingSidebar = false;
sidebarResizer.addEventListener('mousedown', (e) => {
  if (e.target === sidebarToggleBtn || sidebarCollapsed || isOverlayMode()) return;
  resizingSidebar = true;
  sidebarResizer.classList.add('dragging');
  e.preventDefault();
});
window.addEventListener('mousemove', (e) => {
  if (!resizingSidebar) return;
  const rect = mainEl.getBoundingClientRect();
  sidebarWidth = Math.max(200, Math.min(600, rect.right - e.clientX));
  applySidebarWidth(sidebarWidth);
  stage.resize();
});
window.addEventListener('mouseup', () => {
  if (!resizingSidebar) return;
  resizingSidebar = false;
  sidebarResizer.classList.remove('dragging');
  setPref('sidebarWidth', sidebarWidth);
});

// La scène se met à l'échelle disponible (voir Stage.js#resize) : il faut
// donc la recalculer à chaque redimensionnement de fenêtre, et réévaluer au
// passage le mode tiroir/poussée du panneau latéral si on franchit le seuil.
let resizeRaf = null;
window.addEventListener('resize', () => {
  if (resizeRaf) return;
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = null;
    applySidebarCollapse();
    stage.resize();
    timelineCtl.update(); // la hauteur des lignes dépend du seuil tactile/étroit
  });
});

function renderAll() {
  stage.render(tick);
  toolbarCtl.update();
  timelineCtl.update();
  libraryCtl.update();
  scriptsCtl.update();
  propertiesCtl.update();
  menuBarCtl.update();
  updateBanner();
}

subscribe(state, renderAll);
renderAll();
stage.resize(); // ajuste l'échelle initiale de la scène à l'espace réellement disponible

// ---------------------------------------------------------------- playback
let lastTime = null;
let acc = 0;
let wasPlaying = false;

// Avance les timelines indépendantes des MovieClip enfants (comportement
// Animate CC : chaque clip a son propre isPlaying/currentFrame).
function advanceClipsForLayer(layers, parentFrame) {
  const elements = resolveLayersAtFrame(layers, parentFrame);
  for (const el of elements) {
    if (el.kind !== 'instance') continue;
    const symbol = state.doc.symbols[el.symbolId];
    if (!symbol || symbol.type !== 'movieclip') continue;
    const clipState = getClipState(el.id);
    if (clipState.isPlaying) {
      clipState.currentFrame = (clipState.currentFrame + 1) % symbol.frameCount;
      if (clipState._lastScriptFrame !== clipState.currentFrame) {
        clipState._lastScriptFrame = clipState.currentFrame;
        sceneRuntime.runClipFrameScripts(symbol, clipState.currentFrame, clipState);
      }
    }
    // Récursion : avancer les clips imbriqués dans ce clip
    advanceClipsForLayer(symbol.layers, clipState.currentFrame);
  }
}

function loop(time) {
  requestAnimationFrame(loop);

  if (state.playing && !wasPlaying) { lastTime = time; acc = 0; sceneRuntime.runFrameScripts(state.currentFrame); }
  wasPlaying = state.playing;
  if (!state.playing) return;

  if (lastTime === null) lastTime = time;
  const dt = time - lastTime;
  lastTime = time;
  const frameDuration = 1000 / state.doc.frameRate;
  acc += dt;
  let advanced = false;
  while (acc >= frameDuration) {
    acc -= frameDuration;
    const fc = getContextFrameCount(state.doc, state.editPath);
    state.currentFrame = (state.currentFrame + 1) % fc;
    tick++;
    advanced = true;
  }
  if (advanced) {
    sceneRuntime.onFrame(state.currentFrame);
    sceneRuntime.runFrameScripts(state.currentFrame);
    advanceClipsForLayer(getContextLayers(state.doc, state.editPath), state.currentFrame);
    stage.render(tick);
    timelineCtl.update();
  }
}
requestAnimationFrame(loop);
