import { createDocument, serializeDocument, deserializeDocument, getContextFrameCount, setContextFrameCount } from '../core/model.js';
import { notify } from '../state.js';
import { downloadStandaloneHTML } from '../export/exportHTML.js';
import { downloadTextFile } from '../util/download.js';
import { ICONS } from './icons.js';
import { parseSvg } from '../util/importSvg.js';
import { enableDragScroll } from '../util/dragScroll.js';

export function mountMenuBar(container, state, { onDocReplaced, onStageResize, history, onSvgImport = () => {} }) {
  container.innerHTML = '';

  const brand = document.createElement('span');
  brand.className = 'brand';
  brand.textContent = 'TweenJS';

  const btnUndo = iconTextButton('undo', 'Annuler', () => history.undo());
  btnUndo.title = 'Annuler (Ctrl+Z) — 15 niveaux';
  const btnRedo = iconTextButton('redo', 'Rétablir', () => history.redo());
  btnRedo.title = 'Rétablir (Ctrl+Y)';

  window.addEventListener('keydown', (e) => {
    if (isTypingTarget(e.target)) return;
    if (!e.ctrlKey && !e.metaKey) return;
    if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); history.undo(); }
    else if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) { e.preventDefault(); history.redo(); }
  });

  const btnNew = iconTextButton('newDoc', 'Nouveau', () => {
    if (!confirm('Créer un nouveau document ? Le travail non exporté sera perdu.')) return;
    resetDocument(createDocument({}));
  });

  const btnOpen = iconTextButton('folderOpen', 'Ouvrir…', () => fileInput.click());
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      resetDocument(deserializeDocument(text));
    } catch (err) {
      alert('Fichier invalide : ' + err.message);
    }
    fileInput.value = '';
  });

  // Bouton d'import SVG
  const btnImportSvg = iconTextButton('importSvg', 'Importer SVG', () => svgFileInput.click());
  const svgFileInput = document.createElement('input');
  svgFileInput.type = 'file';
  svgFileInput.accept = '.svg,image/svg+xml';
  svgFileInput.style.display = 'none';
  svgFileInput.addEventListener('change', async () => {
    const file = svgFileInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const elements = parseSvg(text);
      if (elements.length > 0) {
        // Ajouter les éléments à la frame courante du calque actif
        onSvgImport(elements);
      } else {
        alert('Aucun élément valide trouvé dans le SVG');
      }
    } catch (err) {
      alert('Erreur lors de l\'import SVG : ' + err.message);
    } finally {
      svgFileInput.value = '';
    }
  });

  const btnSave = iconTextButton('save', 'Enregistrer JSON', () => {
    downloadTextFile(serializeDocument(state.doc), safeName(state.doc.name) + '.json', 'application/json');
  });

  const btnExport = iconTextButton('exportHtml', 'Exporter HTML', () => downloadStandaloneHTML(state.doc));

  const spacer = document.createElement('div');
  spacer.className = 'spacer';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.style.width = '140px';
  nameInput.addEventListener('change', () => { state.doc.name = nameInput.value; notify(state); });

  const wLabel = document.createElement('label'); wLabel.textContent = 'L';
  const wInput = numberInput(1, 4000);
  wInput.addEventListener('change', () => { state.doc.width = parseInt(wInput.value) || state.doc.width; onStageResize(); notify(state); });

  const hLabel = document.createElement('label'); hLabel.textContent = 'H';
  const hInput = numberInput(1, 4000);
  hInput.addEventListener('change', () => { state.doc.height = parseInt(hInput.value) || state.doc.height; onStageResize(); notify(state); });

  const fpsLabel = document.createElement('label'); fpsLabel.textContent = 'i/s';
  const fpsInput = numberInput(1, 60);
  fpsInput.addEventListener('change', () => { state.doc.frameRate = parseInt(fpsInput.value) || state.doc.frameRate; notify(state); });

  const framesLabel = document.createElement('label'); framesLabel.textContent = 'images';
  const framesInput = numberInput(1, 9999);
  framesInput.addEventListener('change', () => {
    setContextFrameCount(state.doc, state.editPath, parseInt(framesInput.value) || 1);
    notify(state);
  });

  const bgLabel = document.createElement('label'); bgLabel.textContent = 'fond';
  const bgInput = document.createElement('input');
  bgInput.type = 'color';
  bgInput.addEventListener('input', () => { state.doc.backgroundColor = bgInput.value; notify(state); });

  container.append(
    brand, btnUndo, btnRedo, btnNew, btnOpen, btnImportSvg, btnSave, btnExport, fileInput, svgFileInput,
    spacer,
    nameInput,
    wLabel, wInput, hLabel, hInput,
    fpsLabel, fpsInput, framesLabel, framesInput,
    bgLabel, bgInput,
  );
  enableDragScroll(container);

  function resetDocument(newDoc) {
    state.doc = newDoc;
    state.editPath = [];
    state.currentFrame = 0;
    state.selectedLayerId = newDoc.layers[0].id;
    state.selectedElementIds = [];
    state.playing = false;
    onDocReplaced();
    onStageResize();
    notify(state);
  }

  function update() {
    nameInput.value = state.doc.name;
    wInput.value = state.doc.width;
    hInput.value = state.doc.height;
    fpsInput.value = state.doc.frameRate;
    framesInput.value = getContextFrameCount(state.doc, state.editPath);
    bgInput.value = state.doc.backgroundColor;
    btnUndo.disabled = !history.canUndo();
    btnRedo.disabled = !history.canRedo();
  }

  update();
  return { update };
}

function menuButton(label, onClick) {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function iconTextButton(iconName, label, onClick) {
  const b = document.createElement('button');
  b.innerHTML = ICONS[iconName] + `<span>${label}</span>`;
  b.addEventListener('click', onClick);
  return b;
}

function numberInput(min, max) {
  const i = document.createElement('input');
  i.type = 'number';
  i.min = String(min);
  i.max = String(max);
  return i;
}

function safeName(name) {
  return (name || 'document').replace(/[^a-z0-9_\-]+/gi, '_');
}

function isTypingTarget(target) {
  return target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
}
