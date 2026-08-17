import { createDocument, serializeDocument, deserializeDocument, getContextFrameCount, setContextFrameCount, addAsset } from '../core/model.js';
import { notify } from '../state.js';
import { downloadStandaloneHTML } from '../export/exportHTML.js';
import { downloadTextFile } from '../util/download.js';
import { ICONS } from './icons.js';
import { parseSvg } from '../util/importSvg.js';
import { enableDragScroll } from '../util/dragScroll.js';
import { toggleFullscreen, fullscreenElement, onFullscreenChange } from '../util/fullscreen.js';

export function mountMenuBar(container, state, { onDocReplaced, onStageResize, history, onSvgImport = () => {}, onImageImport = () => {} }) {
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

  // Bouton d'import d'images bitmap (PNG/JPG/GIF/WebP). L'image est décodée
  // pour connaître sa taille naturelle puis stockée dans doc.assets sous
  // forme de dataUrl base64 (persistable dans le JSON) ; le placement sur la
  // scène est délégué à main.js via onImageImport(asset).
  const imgFileInput = document.createElement('input');
  imgFileInput.type = 'file';
  imgFileInput.accept = 'image/png,image/jpeg,image/gif,image/webp,.png,.jpg,.jpeg,.gif,.webp';
  imgFileInput.style.display = 'none';
  imgFileInput.addEventListener('change', () => {
    const file = imgFileInput.files[0];
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
        notify(state);
        onImageImport(asset);
      };
      img.onerror = () => alert('Impossible de lire cette image.');
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    imgFileInput.value = '';
  });

  // Menu Fichier : regroupe les opérations d'entrée/sortie (ouvrir, importer
  // SVG/image, enregistrer JSON, exporter HTML). Le panneau est monté dans
  // document.body en position:fixed — #menubar a un overflow-x:auto qui
  // clipperait tout dropdown positionné en absolu dans ses descendants.
  const fileMenu = document.createElement('div');
  fileMenu.className = 'file-menu';
  const fileMenuBtn = document.createElement('button');
  fileMenuBtn.type = 'button';
  fileMenuBtn.className = 'file-menu-btn';
  fileMenuBtn.innerHTML = ICONS.folderOpen + '<span>Fichier</span><span class="caret">▾</span>';
  fileMenuBtn.title = 'Ouvrir, importer, enregistrer, exporter';
  const fileMenuPanel = document.createElement('div');
  fileMenuPanel.className = 'file-menu-panel';
  const fileMenuItems = [
    { icon: 'folderOpen', label: 'Ouvrir…', action: () => fileInput.click() },
    { icon: 'importSvg', label: 'Importer SVG', action: () => svgFileInput.click() },
    { icon: 'importImage', label: 'Importer image…', action: () => imgFileInput.click() },
    { icon: 'save', label: 'Enregistrer JSON', action: () => downloadTextFile(serializeDocument(state.doc), safeName(state.doc.name) + '.json', 'application/json') },
    { icon: 'exportHtml', label: 'Exporter HTML', action: () => downloadStandaloneHTML(state.doc) },
  ];
  for (const item of fileMenuItems) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = ICONS[item.icon] + `<span>${item.label}</span>`;
    b.addEventListener('click', () => { closeFileMenu(); item.action(); });
    fileMenuPanel.appendChild(b);
  }
  fileMenu.append(fileMenuBtn, fileMenuPanel);

  function openFileMenu() {
    const rect = fileMenuBtn.getBoundingClientRect();
    fileMenuPanel.style.left = rect.left + 'px';
    fileMenuPanel.style.top = rect.bottom + 4 + 'px';
    fileMenuPanel.style.minWidth = Math.max(230, rect.width) + 'px';
    document.body.appendChild(fileMenuPanel);
    fileMenuPanel.classList.add('open');
  }

  function closeFileMenu() {
    fileMenuPanel.classList.remove('open');
    if (fileMenuPanel.parentNode === document.body) document.body.removeChild(fileMenuPanel);
  }

  fileMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (fileMenuPanel.classList.contains('open')) closeFileMenu();
    else openFileMenu();
  });
  // Clic ailleurs ou Échap → fermer. On ne ferme pas au scroll/resize (les
  // coordonnées fixed suivraient mal) : on referme le menu pour éviter qu'il
  // reste orphelin à un endroit périmé.
  document.addEventListener('click', (e) => {
    if (!fileMenuPanel.contains(e.target)) closeFileMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeFileMenu(); });
  window.addEventListener('scroll', closeFileMenu, true);
  window.addEventListener('resize', closeFileMenu);

  // Menu À propos : mentions légales, RGPD et documentation.
  const aboutMenu = document.createElement('div');
  aboutMenu.className = 'file-menu';
  const aboutMenuBtn = document.createElement('button');
  aboutMenuBtn.type = 'button';
  aboutMenuBtn.className = 'file-menu-btn';
  aboutMenuBtn.innerHTML = ICONS.info + '<span>À propos</span><span class="caret">▾</span>';
  aboutMenuBtn.title = 'Mentions légales, RGPD, documentation';
  const aboutMenuPanel = document.createElement('div');
  aboutMenuPanel.className = 'file-menu-panel';
  const aboutMenuItems = [
    { icon: 'info', label: 'Mentions légales & RGPD', action: () => { window.location.href = '/src/mentions-legales.html'; } },
    { icon: 'book', label: 'Documentation', action: () => { window.open('/docs/Animate-JS-Documentation.pdf', '_blank'); } },
  ];
  for (const item of aboutMenuItems) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = ICONS[item.icon] + `<span>${item.label}</span>`;
    b.addEventListener('click', () => { closeAboutMenu(); item.action(); });
    aboutMenuPanel.appendChild(b);
  }
  aboutMenu.append(aboutMenuBtn, aboutMenuPanel);

  function openAboutMenu() {
    const rect = aboutMenuBtn.getBoundingClientRect();
    aboutMenuPanel.style.left = rect.left + 'px';
    aboutMenuPanel.style.top = rect.bottom + 4 + 'px';
    aboutMenuPanel.style.minWidth = Math.max(230, rect.width) + 'px';
    document.body.appendChild(aboutMenuPanel);
    aboutMenuPanel.classList.add('open');
  }

  function closeAboutMenu() {
    aboutMenuPanel.classList.remove('open');
    if (aboutMenuPanel.parentNode === document.body) document.body.removeChild(aboutMenuPanel);
  }

  aboutMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (aboutMenuPanel.classList.contains('open')) closeAboutMenu();
    else openAboutMenu();
  });
  document.addEventListener('click', (e) => {
    if (!aboutMenuPanel.contains(e.target)) closeAboutMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAboutMenu(); });
  window.addEventListener('scroll', closeAboutMenu, true);
  window.addEventListener('resize', closeAboutMenu);

  // Bouton plein écran : bascule entre le mode plein écran du navigateur et
  // la fenêtre normale (l'icône change selon l'état, via fullscreenchange).
  // Utilitaire normalisé (tous préfixes + repli CSS) dans util/fullscreen.js.
  const fsTarget = document.getElementById('app') || document.documentElement;
  const btnFullscreen = iconTextButton('fullscreen', 'Plein écran', () => {
    toggleFullscreen(fsTarget);
  });

  const updateFullscreenBtn = () => {
    const active = !!fullscreenElement();
    btnFullscreen.innerHTML = ICONS[active ? 'exitFullscreen' : 'fullscreen'] + `<span>${active ? 'Quitter le plein écran' : 'Plein écran'}</span>`;
  };
  onFullscreenChange(updateFullscreenBtn);

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
    brand, btnUndo, btnRedo, btnNew, fileMenu, aboutMenu, btnFullscreen, fileInput, svgFileInput, imgFileInput,
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
