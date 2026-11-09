import { createDocument, serializeDocument, deserializeDocument, getContextFrameCount, setContextFrameCount, addAsset, bumpIdCounterPastDocument } from '../core/model.js';
import { notify } from '../state.js';
import { downloadStandaloneHTML } from '../export/exportHTML.js';
import { downloadCompiledHTML } from '../export/exportCompiled.js';
import { downloadPNGSequence } from '../export/exportPNG.js';
import { supportsDirectoryExport } from '../export/projectExport.js';
import { getPref } from '../util/prefs.js';
import { downloadTextFile } from '../util/download.js';
import { ICONS } from './icons.js';
import { parseSvg } from '../util/importSvg.js';
import { enableDragScroll } from '../util/dragScroll.js';
import { toggleFullscreen, fullscreenElement, onFullscreenChange } from '../util/fullscreen.js';
import { getAllProjects, saveProject, loadProject, deleteProject, deleteAllProjects } from '../util/projects.js';
import { isAdminMode } from '../util/adminMode.js';
import { listRemoteArchives, saveRemoteArchive, loadRemoteArchive, deleteRemoteArchive } from '../util/remoteArchives.js';

export function mountMenuBar(container, state, { onDocReplaced, onStageResize, history, onSvgImport = () => {}, onImageImport = () => {}, onAudioImport = () => {}, onProjectLoad = () => {}, onExportVideo = () => {}, onExportProject = () => {}, onOpenProjectFolder = () => {}, onToggleTheme = () => {} }) {
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
    else if (e.key.toLowerCase() === 's') {
      e.preventDefault();
      try {
        saveProject(state.doc);
        alert(`Projet "${state.doc.name}" sauvegardé dans les archives.`);
      } catch (err) {
        alert('Erreur lors de la sauvegarde : ' + err.message);
      }
    }
  });

  const btnNew = iconTextButton('newDoc', 'Nouveau', () => {
    // Ouvre un nouveau projet dans une nouvelle fenêtre — rien n'est perdu.
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

  // Bouton d'import de fichiers audio (mp3/wav/ogg...) : stocké comme asset
  // kind:'audio' en dataUrl (persistable dans le JSON), posable sur la piste
  // audio de la timeline.
  const audioFileInput = document.createElement('input');
  audioFileInput.type = 'file';
  audioFileInput.accept = 'audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac';
  audioFileInput.style.display = 'none';
  audioFileInput.addEventListener('change', () => {
    const file = audioFileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const asset = addAsset(state.doc, {
        name: file.name,
        kind: 'audio',
        type: file.type || 'audio/mpeg',
        dataUrl: reader.result,
      });
      notify(state);
      onAudioImport(asset);
    };
    reader.onerror = () => alert('Impossible de lire ce fichier audio.');
    reader.readAsDataURL(file);
    audioFileInput.value = '';
  });

  // Menu Fichier : regroupe les opérations d'entrée/sortie (ouvrir, importer
  // SVG/image, enregistrer JSON, exporter HTML). Le panneau est monté en
  // position:fixed dans menuPortal() — #menubar a un overflow-x:auto qui
  // clipperait tout dropdown positionné en absolu dans ses descendants.
  // menuPortal() renvoie document.body en fenêtre normale, MAIS l'élément
  // plein écran quand il est actif : le Fullscreen API natif ne rend que le
  // sous-arbre de l'élément plein écran, et le repli CSS (.fs-css-active,
  // z-index 9999) couvre le reste du body — monté sous body, un panneau
  // serait invisible dans les deux modes et les menus sembleraient morts.
  function menuPortal() {
    const fs = fullscreenElement();
    return (fs && fs !== document.body) ? fs : document.body;
  }

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
    { icon: 'folderOpen', label: 'Ouvrir un dossier…', action: () => onOpenProjectFolder(), disabled: !supportsDirectoryExport(), title: supportsDirectoryExport() ? 'Ouvrir un projet éclaté (projet.json + assets/ + scripts/) — Chromium uniquement' : "Non supporté hors Chromium (File System Access API)" },
    { icon: 'importSvg', label: 'Importer SVG', action: () => svgFileInput.click() },
    { icon: 'importImage', label: 'Importer image…', action: () => imgFileInput.click() },
    { icon: 'audio', label: 'Importer audio…', action: () => audioFileInput.click() },
    { icon: 'save', label: 'Enregistrer JSON', action: () => downloadTextFile(serializeDocument(state.doc), safeName(state.doc.name) + '.json', 'application/json') },
    { icon: 'exportHtml', label: 'Exporter HTML', action: () => downloadStandaloneHTML(state.doc) },
    { icon: 'exportHtml', label: 'Compiler un HTML', action: () => downloadCompiledHTML(state.doc) },
    { icon: 'export', label: 'Exporter PNG (ZIP)', action: () => downloadPNGSequence(state.doc) },
    { icon: 'video', label: 'Exporter vidéo WebM…', action: () => onExportVideo() },
    { icon: 'folderOpen', label: 'Exporter projet vers dossier…', action: () => onExportProject() },
    { icon: 'moon', label: () => (getPref('theme', 'light') === 'dark' ? '✓ Thème sombre (Solarized dark)' : 'Thème sombre (Solarized dark)'), action: () => onToggleTheme() },
  ];
  for (const item of fileMenuItems) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = ICONS[item.icon] + `<span>${typeof item.label === 'function' ? item.label() : item.label}</span>`;
    if (item.title) b.title = item.title;
    if (item.disabled) b.disabled = true;
    b.addEventListener('click', () => { closeFileMenu(); item.action(); });
    fileMenuPanel.appendChild(b);
  }
  fileMenu.append(fileMenuBtn, fileMenuPanel);

  function openFileMenu() {
    const rect = fileMenuBtn.getBoundingClientRect();
    fileMenuPanel.style.left = rect.left + 'px';
    fileMenuPanel.style.top = rect.bottom + 4 + 'px';
    fileMenuPanel.style.minWidth = Math.max(230, rect.width) + 'px';
    menuPortal().appendChild(fileMenuPanel);
    fileMenuPanel.classList.add('open');
  }

  function closeFileMenu() {
    fileMenuPanel.classList.remove('open');
    if (fileMenuPanel.parentNode) fileMenuPanel.parentNode.removeChild(fileMenuPanel);
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

  // Menu Archives : liste des projets sauvegardés dans localStorage
  const archivesMenu = document.createElement('div');
  archivesMenu.className = 'file-menu';
  const archivesMenuBtn = document.createElement('button');
  archivesMenuBtn.type = 'button';
  archivesMenuBtn.className = 'file-menu-btn';
  archivesMenuBtn.innerHTML = ICONS.folderOpen + '<span>Archives</span><span class="caret">▾</span>';
  archivesMenuBtn.title = 'Projets sauvegardés localement';
  const archivesMenuPanel = document.createElement('div');
  archivesMenuPanel.className = 'file-menu-panel archives-menu-panel';
  
  // Fonction pour rafraîchir la liste des archives
  function refreshArchivesMenu() {
    archivesMenuPanel.innerHTML = '';
    const projects = getAllProjects();
    
    if (projects.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'archives-empty';
      emptyMsg.textContent = 'Aucun projet sauvegardé';
      archivesMenuPanel.appendChild(emptyMsg);
    } else {
      // Tri par timestamp (plus récent en premier)
      projects.sort((a, b) => b.timestamp - a.timestamp);
      // Homonymes : suffixer la date de sauvegarde pour les distinguer
      const nameCounts = {};
      for (const p of projects) nameCounts[p.name || 'Sans titre'] = (nameCounts[p.name || 'Sans titre'] || 0) + 1;
      
      for (const project of projects) {
        const projectBtn = document.createElement('button');
        projectBtn.type = 'button';
        projectBtn.className = 'archive-item';
        const label = project.name || 'Sans titre';
        projectBtn.textContent = nameCounts[label] > 1
          ? label + ' — ' + new Date(project.timestamp).toLocaleString()
          : label;
        projectBtn.addEventListener('click', () => {
          closeArchivesMenu();
          const doc = loadProject(project.id);
          if (doc) {
            // Mémoriser l'entrée d'archive d'où vient ce doc : les Ctrl+S
            // suivants mettront à jour CETTE entrée (les archives sont
            // indexées par id, plusieurs scènes du même nom peuvent coexister).
            doc._archiveId = project.id;
            bumpIdCounterPastDocument(doc);
            onProjectLoad(doc);
          } else {
            alert('Erreur lors du chargement du projet.');
          }
        });
        archivesMenuPanel.appendChild(projectBtn);
      }
    }
    
    // Bouton pour sauvegarder le projet actuel
    const saveRow = document.createElement('div');
    saveRow.className = 'archive-save-row';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'archive-save-btn';
    saveBtn.textContent = `Sauvegarder "${state.doc.name}"`;
    saveBtn.title = 'Sauvegarder (Ctrl+S)';
    saveBtn.addEventListener('click', () => {
      closeArchivesMenu();
      try {
        saveProject(state.doc);
        alert(`Projet "${state.doc.name}" sauvegardé dans les archives.`);
        refreshArchivesMenu();
      } catch (e) {
        alert('Erreur lors de la sauvegarde : ' + e.message);
      }
    });
    saveRow.appendChild(saveBtn);
    archivesMenuPanel.appendChild(saveRow);

    // Section « archives en ligne » (dossier ./Archives du serveur) :
    // visible UNIQUEMENT avec la clé ?adm=4321 dans l'URL.
    if (isAdminMode()) renderRemoteArchivesSection();
  }

  // Sauvegardes EN LIGNE dans ./Archives (API /api/archives du serveur,
  // clé adm requise) : bouton de sauvegarde + liste des fichiers avec
  // ouvrir (nouvelle fenêtre-projet) et supprimer.
  function renderRemoteArchivesSection() {
    const sep = document.createElement('div');
    sep.className = 'archives-remote-sep';
    sep.textContent = 'En ligne — dossier ./Archives';
    archivesMenuPanel.appendChild(sep);

    const row = document.createElement('div');
    row.className = 'archive-save-row archives-remote-save-row';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'archive-save-btn archive-remote-save-btn';
    btn.innerHTML = ICONS.save + '<span>Sauvegarder en ligne</span>';
    btn.title = 'Écrire le projet dans ./Archives sur le serveur (clé adm requise)';
    btn.addEventListener('click', async () => {
      closeArchivesMenu();
      try {
        const r = await saveRemoteArchive(state.doc.name, serializeDocument(state.doc));
        if (r.ok) alert(`Projet « ${state.doc.name} » sauvegardé en ligne :\nArchives/${r.file}`);
        else alert('API archives indisponible ici — le JSON a été téléchargé localement.\nPlace-le dans le dossier ./Archives du serveur.\n(' + (r.error && r.error.message ? r.error.message : r.error) + ')');
      } catch (e) {
        alert('Erreur lors de la sauvegarde en ligne : ' + e.message);
      }
    });
    row.appendChild(btn);
    archivesMenuPanel.appendChild(row);

    const list = document.createElement('div');
    list.className = 'archives-remote-list';
    archivesMenuPanel.appendChild(list);
    const loading = document.createElement('div');
    loading.className = 'archives-empty';
    loading.textContent = 'Chargement des sauvegardes en ligne…';
    list.appendChild(loading);

    listRemoteArchives().then((files) => {
      list.innerHTML = '';
      if (!files.length) {
        const empty = document.createElement('div');
        empty.className = 'archives-empty';
        empty.textContent = 'Aucune sauvegarde en ligne';
        list.appendChild(empty);
        return;
      }
      for (const f of files) {
        const item = document.createElement('div');
        item.className = 'archive-remote-item';
        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'archive-item archive-remote-name';
        open.title = `${f.name} — ${(f.size / 1024).toFixed(1)} Ko — ${new Date(f.mtime).toLocaleString()}`;
        open.textContent = `${f.name} — ${new Date(f.mtime).toLocaleString()}`;
        open.addEventListener('click', async () => {
          closeArchivesMenu();
          try {
            const doc = deserializeDocument(await loadRemoteArchive(f.name));
            onProjectLoad(doc); // nouvelle fenêtre-projet, comme les archives locales
          } catch (e) {
            alert('Erreur lors du chargement de la sauvegarde en ligne : ' + e.message);
          }
        });
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'archive-remote-del';
        del.innerHTML = ICONS.trash;
        del.title = 'Supprimer cette sauvegarde en ligne';
        del.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm(`Supprimer « ${f.name} » du dossier ./Archives ?`)) return;
          try {
            await deleteRemoteArchive(f.name);
            refreshArchivesMenu();
          } catch (err) {
            alert('Erreur lors de la suppression : ' + err.message);
          }
        });
        item.append(open, del);
        list.appendChild(item);
      }
    }).catch(() => {
      list.innerHTML = '';
      const note = document.createElement('div');
      note.className = 'archives-remote-note';
      note.textContent = 'API archives indisponible sur ce serveur (statique ?) — le bouton ci-dessus fait un téléchargement local.';
      list.appendChild(note);
    });
  }
  
  function openArchivesMenu() {
    const rect = archivesMenuBtn.getBoundingClientRect();
    archivesMenuPanel.style.left = rect.left + 'px';
    archivesMenuPanel.style.top = rect.bottom + 4 + 'px';
    archivesMenuPanel.style.minWidth = Math.max(280, rect.width) + 'px';
    menuPortal().appendChild(archivesMenuPanel);
    archivesMenuPanel.classList.add('open');
    refreshArchivesMenu();
  }
  
  function closeArchivesMenu() {
    archivesMenuPanel.classList.remove('open');
    if (archivesMenuPanel.parentNode) archivesMenuPanel.parentNode.removeChild(archivesMenuPanel);
  }
  
  archivesMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (archivesMenuPanel.classList.contains('open')) closeArchivesMenu();
    else openArchivesMenu();
  });
  document.addEventListener('click', (e) => {
    if (!archivesMenuPanel.contains(e.target)) closeArchivesMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeArchivesMenu(); });
  window.addEventListener('scroll', closeArchivesMenu, true);
  window.addEventListener('resize', closeArchivesMenu);

  archivesMenu.append(archivesMenuBtn, archivesMenuPanel);

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
    { icon: 'heart', label: 'Faire un don', className: 'donate-btn', action: () => { window.open('https://www.paypal.com/donate/?hosted_button_id=HCDEXV9E52EAW', '_blank'); } },
    { icon: 'info', label: 'Mentions légales & RGPD', action: () => { window.location.href = window.__TJS_VANILLA__ ? 'docs/mentions-legales.html' : '/src/mentions-legales.html'; } },
    { icon: 'book', label: 'Documentation', action: () => {
      // Dans l'app native (APK, WebView Capacitor), window.open est sans
      // effet (pas de nouvelles fenêtres) et le WebView ne rend pas les
      // PDF : on ouvre la version HTML autonome de la doc (CSS inliné)
      // dans la même fenêtre. Partout ailleurs, le PDF s'ouvre dans un
      // nouvel onglet comme avant.
      const nativeApp = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
      if (nativeApp) window.location.href = 'docs/Animate-JS-Documentation.html';
      else window.open(window.__TJS_VANILLA__ ? 'docs/Animate-JS-Documentation.pdf' : '/docs/Animate-JS-Documentation.pdf', '_blank');
    } },
    { icon: 'chevronDown', label: 'APK Debug', action: () => { window.location.href = 'http://gamecreator.debrouillard.be/app/Tween_JS/app-debug.apk'; } },
  ];
  for (const item of aboutMenuItems) {
    const b = document.createElement('button');
    b.type = 'button';
    if (item.className) b.classList.add(item.className);
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
    menuPortal().appendChild(aboutMenuPanel);
    aboutMenuPanel.classList.add('open');
  }

  function closeAboutMenu() {
    aboutMenuPanel.classList.remove('open');
    if (aboutMenuPanel.parentNode) aboutMenuPanel.parentNode.removeChild(aboutMenuPanel);
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
    brand, btnUndo, btnRedo, btnNew, fileMenu, archivesMenu, aboutMenu, btnFullscreen, fileInput, svgFileInput, imgFileInput, audioFileInput,
    spacer,
    nameInput,
    wLabel, wInput, hLabel, hInput,
    fpsLabel, fpsInput, framesLabel, framesInput,
    bgLabel, bgInput,
  );
  enableDragScroll(container);

  function resetDocument(newDoc) {
    // Non destructif : le document s'ouvre dans une NOUVELLE fenêtre-projet
    // (multi-documents géré côté main.js), le projet courant reste intact.
    onDocReplaced(newDoc);
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
