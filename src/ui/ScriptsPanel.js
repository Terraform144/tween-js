// Panneau "Scripts" : liste de scripts stockés dans state.doc.scripts,
// éditeur de code CodeMirror 6 (coloration syntaxique + autocomplétion JS et
// de l'API Scene/Game), boutons Exécuter/Arrêter et console de sortie.
import { EditorView, basicSetup } from 'codemirror';
import { javascript, javascriptLanguage } from '@codemirror/lang-javascript';
import { createScript, getContextLayers, getKeyframeAt } from '../core/model.js';
import { notify } from '../state.js';
import { promptText } from '../util/promptText.js';
import { createPanel } from './Panel.js';
import { ICONS } from './icons.js';
import {
  sanitizeFileName, pickJsFile, exportJsFile, openInVsCode, getVscodeFolder,
  supportsLinkedFiles, linkFile, readLinkedFile, requestLinkedPermission,
} from './externalScripts.js';
import { makeCompletionSources } from './completions.js';

// Les sources d'autocomplétion (API Scene/Game racine ou scopée au clip,
// createjs.*, noms d'instances et leurs propriétés) vivent dans completions.js
// (module pur, testé sous Node) et sont fournies via languageDataAt :
// autocompletion() combine la source du langage JS ET les nôtres.

export function mountScriptsPanel(container, state, { runtime }) {
  const addBtn = document.createElement('button');
  addBtn.textContent = '+ Nouveau';
  addBtn.title = 'Ajouter un script';
  addBtn.addEventListener('click', addScript);

  const runBtn = document.createElement('button');
  runBtn.innerHTML = ICONS.play;
  runBtn.title = 'Exécuter (Ctrl+Entrée)';
  runBtn.addEventListener('click', () => runActive());

  const stopBtn = document.createElement('button');
  stopBtn.innerHTML = ICONS.pause;
  stopBtn.title = 'Arrêter la lecture';
  stopBtn.addEventListener('click', () => {
    state.playing = false;
    notify(state);
  });

  const { body } = createPanel(container, {
    key: 'scriptsCollapsed',
    label: 'Scripts',
    actions: [addBtn, runBtn, stopBtn],
  });
  body.classList.add('scripts-body');

  const tabs = document.createElement('div');
  tabs.className = 'script-tabs';

  // Scripts d'image (frame actions) : distincts des scripts nommés ci-dessus,
  // rattachés à une keyframe précise (kf.script) et listés ici pour pouvoir
  // sauter de l'un à l'autre, comme le navigateur d'actions d'Animate CC.
  // Script de symbole (classe AS3-like) : cible d'édition à part entière,
  // disponible quand le contexte d'édition est un MovieClip (editPath non
  // vide). Le code vit sur le symbole (sym.script) et s'exécute UNE fois par
  // instance au démarrage de la lecture (voir sceneRuntime.js/main.js).
  const symbolRow = document.createElement('div');
  symbolRow.className = 'script-frame-row';

  const symbolBtn = document.createElement('button');
  symbolBtn.title = "Éditer le script de ce MovieClip — constructeur exécuté une fois par instance au démarrage de la lecture (classe AS3-like)";
  symbolBtn.addEventListener('click', editSymbolScript);
  symbolRow.appendChild(symbolBtn);

  // Fichiers externes (workflow « gros projets », façon classe AS3) :
  // s'appliquent à la cible d'édition active (script nommé, script de
  // MovieClip ou script d'image). Import/export universels ; lien vivant
  // (relecture auto au focus) sur Chromium via File System Access API.
  const externalRow = document.createElement('div');
  externalRow.className = 'script-frame-row external-row';

  const fileLabel = document.createElement('span');
  fileLabel.className = 'external-file-label';

  const importBtn = document.createElement('button');
  importBtn.innerHTML = ICONS.importSvg;
  importBtn.title = 'Importer le code depuis un fichier .js (tous navigateurs)';
  importBtn.addEventListener('click', importActiveFromFile);

  const exportBtn = document.createElement('button');
  exportBtn.innerHTML = ICONS.export;
  exportBtn.title = 'Exporter le code de ce script vers un fichier .js (téléchargement)';
  exportBtn.addEventListener('click', exportActiveToFile);

  const vsBtn = document.createElement('button');
  vsBtn.innerHTML = ICONS.pencil;
  vsBtn.title = 'Ouvrir le fichier dans VS Code (protocole vscode://, tous navigateurs)';
  vsBtn.addEventListener('click', openActiveInVsCode);

  const linkBtn = document.createElement('button');
  linkBtn.textContent = 'Lier';
  linkBtn.title = 'Lier ce script à un fichier .js du disque : son contenu est relu automatiquement au retour dans l\'app (Chrome/Edge/Vivaldi uniquement)';
  linkBtn.addEventListener('click', linkActiveFile);

  const reloadBtn = document.createElement('button');
  reloadBtn.innerHTML = ICONS.undo;
  reloadBtn.title = 'Relire maintenant le fichier .js lié à ce script';
  reloadBtn.addEventListener('click', reloadLinkedActiveFile);
  reloadBtn.style.display = 'none';

  externalRow.append(fileLabel, importBtn, exportBtn, vsBtn, linkBtn, reloadBtn);

  const frameRow = document.createElement('div');
  frameRow.className = 'script-frame-row';

  const frameSelect = document.createElement('select');
  frameSelect.title = "Scripts d'image existants dans ce contexte";

  const frameAddBtn = document.createElement('button');
  frameAddBtn.textContent = '+ Sur cette image';
  frameAddBtn.title = "Ajouter/éditer un script sur l'image clé courante du calque sélectionné";
  frameAddBtn.addEventListener('click', addFrameScriptHere);

  const frameDelBtn = document.createElement('button');
  frameDelBtn.innerHTML = ICONS.close;
  frameDelBtn.title = "Supprimer le script d'image en cours d'édition";
  frameDelBtn.addEventListener('click', removeActiveFrameScript);

  frameRow.append(frameSelect, frameAddBtn, frameDelBtn);

  const editorHost = document.createElement('div');
  editorHost.className = 'script-editor';

  const consoleEl = document.createElement('div');
  consoleEl.className = 'script-console';
  consoleEl.textContent = '— console —';

  body.append(tabs, symbolRow, externalRow, frameRow, editorHost, consoleEl);

  let activeId = null;
  let frameTarget = null; // { layerId, frameIndex } | null — non-null = édition d'un script d'image plutôt que d'un script nommé
  let symbolTarget = false; // true = édition du script de symbole (constructeur AS3-like) du contexte courant
  let editor = null;

  // Symbole du contexte d'édition courant (null = scène principale).
  function contextSymbol() {
    const p = state.editPath || [];
    return p.length ? state.doc.symbols[p[p.length - 1]] : null;
  }

  // Cible d'édition active, vue comme un script externalisable : script nommé
  // du document, script de symbole (MovieClip) ou script d'image. `key`
  // identifie le lien fichier (File System Access API), `fileMeta`/`setFileMeta`
  // portent la métadonnée { fileName, mode: 'import' | 'export' | 'linked' }.
  function layerNameOf(layerId) {
    const l = getContextLayers(state.doc, state.editPath).find((x) => x.id === layerId);
    return l ? sanitizeFileName(l.name || 'calque') : 'calque';
  }

  function activeTarget() {
    const docId = state.doc.id || 'doc';
    const base = sanitizeFileName((state.doc.name || 'scene'));
    if (symbolTarget) {
      const sym = contextSymbol();
      if (!sym) return null;
      return {
        kind: 'symbol',
        key: docId + ':sym:' + sym.id,
        fileName: sanitizeFileName(base + '_' + sym.name) + '.js',
        get code() { return sym.script || ''; },
        set code(v) { sym.script = v; },
        get fileMeta() { return sym.scriptFile || null; },
        setFileMeta(m) { sym.scriptFile = m; },
      };
    }
    if (frameTarget) {
      const kf = findFrameKeyframe(frameTarget);
      if (!kf) return null;
      return {
        kind: 'frame',
        // v2 : lien vivant aussi sur les scripts d'image (même workflow que
        // les scripts nommés / de symbole). La meta vit sur la keyframe.
        key: docId + ':frame:' + frameTarget.layerId + ':' + frameTarget.frameIndex,
        fileName: sanitizeFileName(base + '_f' + (frameTarget.frameIndex + 1) + '_' + layerNameOf(frameTarget.layerId)) + '.js',
        get code() { return kf.script || ''; },
        set code(v) { kf.script = v; },
        get fileMeta() { return kf.scriptFile || null; },
        setFileMeta(m) { kf.scriptFile = m; },
      };
    }
    const sc = state.doc.scripts.find((s) => s.id === activeId);
    if (!sc) return null;
    return {
      kind: 'script',
      key: docId + ':script:' + sc.id,
      fileName: sanitizeFileName(base + '_' + sc.name) + '.js',
      get code() { return sc.code || ''; },
      set code(v) { sc.code = v; },
      get fileMeta() { return sc.file || null; },
      setFileMeta(m) { sc.file = m; },
    };
  }

  async function importActiveFromFile() {
    const t = activeTarget();
    if (!t) return;
    const res = await pickJsFile();
    if (!res) return;
    t.code = res.text;
    t.setFileMeta({ fileName: res.name, mode: 'import' });
    notify(state);
  }

  function exportActiveToFile() {
    const t = activeTarget();
    if (!t) return;
    saveActive();
    exportJsFile(t.code, t.fileName);
    t.setFileMeta({ fileName: t.fileName, mode: 'export' });
  }

  function openActiveInVsCode() {
    const t = activeTarget();
    if (!t) return;
    openInVsCode((t.fileMeta && t.fileMeta.fileName) || t.fileName);
  }

  async function linkActiveFile() {
    const t = activeTarget();
    if (!t || !t.key || !supportsLinkedFiles()) return;
    const name = await linkFile(t.key);
    if (!name) return;
    const res = await readLinkedFile(t.key);
    if (res) t.code = res.text;
    t.setFileMeta({ fileName: name, mode: 'linked' });
    notify(state);
  }

  async function reloadLinkedActiveFile() {
    const t = activeTarget();
    if (!t || !t.key) return;
    await requestLinkedPermission(t.key);
    const res = await readLinkedFile(t.key);
    if (res) {
      t.code = res.text;
      t.setFileMeta({ fileName: res.name, mode: 'linked' });
      notify(state);
    }
  }

  // Relecture automatique des fichiers liés au retour dans l'app (focus de
  // la fenêtre) : on édite dans VS Code, on sauvegarde, on revient — le code
  // est à jour. Chromium uniquement (File System Access API).
  async function refreshLinkedScripts() {
    if (!supportsLinkedFiles()) return;
    const doc = state.doc;
    const jobs = [];
    for (const sc of doc.scripts || []) {
      if (sc.file && sc.file.mode === 'linked') {
        jobs.push({ key: (doc.id || 'doc') + ':script:' + sc.id, get code() { return sc.code || ''; }, set code(v) { sc.code = v; } });
      }
    }
    for (const id in doc.symbols || {}) {
      const sym = doc.symbols[id];
      if (sym.scriptFile && sym.scriptFile.mode === 'linked') {
        jobs.push({ key: (doc.id || 'doc') + ':sym:' + sym.id, get code() { return sym.script || ''; }, set code(v) { sym.script = v; } });
      }
      // scripts d'image du symbole
      for (const layer of sym.layers || []) {
        for (const kf of layer.keyframes || []) {
          if (kf.scriptFile && kf.scriptFile.mode === 'linked') {
            jobs.push({ key: (doc.id || 'doc') + ':frame:' + layer.id + ':' + kf.index, get code() { return kf.script || ''; }, set code(v) { kf.script = v; } });
          }
        }
      }
    }
    // scripts d'image de la scène racine
    for (const layer of doc.layers || []) {
      for (const kf of layer.keyframes || []) {
        if (kf.scriptFile && kf.scriptFile.mode === 'linked') {
          jobs.push({ key: (doc.id || 'doc') + ':frame:' + layer.id + ':' + kf.index, get code() { return kf.script || ''; }, set code(v) { kf.script = v; } });
        }
      }
    }
    let changed = false;
    for (const j of jobs) {
      const res = await readLinkedFile(j.key);
      if (res && res.text !== j.code) { j.code = res.text; changed = true; }
    }
    if (changed) notify(state);
  }
  window.addEventListener('focus', refreshLinkedScripts);
  // Watch par polling : toutes les 2 s, on relit les fichiers liés modifiés
  // (utile quand on édite dans VS Code sans revenir dans l'onglet navigateur).
  // Chromium uniquement (File System Access API) — hors Chromium, un
  // navigateur ne peut pas lire le disque sans serveur local.
  setInterval(() => { refreshLinkedScripts(); }, 2000);

  function editSymbolScript() {
    const sym = contextSymbol();
    if (!sym) return;
    saveActive();
    if (!sym.script || !sym.script.trim()) {
      sym.script = '// Constructeur du MovieClip "' + sym.name + '"\n// Exécuté UNE fois par instance au démarrage de la lecture.\n// Scene est scopé à CE clip : Scene.stop() arrête ce clip, pas la scène.\nScene.stop();\nScene.onEnterFrame(() => {\n  // boucle de jeu propre à ce clip\n});\n';
    }
    symbolTarget = true;
    frameTarget = null;
    notify(state);
  }

  function selectedLayer() {
    return getContextLayers(state.doc, state.editPath).find((l) => l.id === state.selectedLayerId);
  }

  function findFrameKeyframe(target) {
    if (!target) return null;
    const layer = getContextLayers(state.doc, state.editPath).find((l) => l.id === target.layerId);
    return layer ? getKeyframeAt(layer, target.frameIndex) : null;
  }

  function listFrameScripts() {
    const out = [];
    for (const layer of getContextLayers(state.doc, state.editPath)) {
      for (const kf of layer.keyframes) {
        if (kf.script && kf.script.trim()) out.push({ layerId: layer.id, layerName: layer.name, frameIndex: kf.index });
      }
    }
    out.sort((a, b) => a.frameIndex - b.frameIndex);
    return out;
  }

  function getActiveCode() {
    if (symbolTarget) {
      const sym = contextSymbol();
      return sym ? (sym.script || '') : '';
    }
    if (frameTarget) {
      const kf = findFrameKeyframe(frameTarget);
      return kf ? kf.script : '';
    }
    const sc = state.doc.scripts.find((s) => s.id === activeId);
    return sc ? sc.code : '';
  }

  function addFrameScriptHere() {
    const layer = selectedLayer();
    if (!layer) return;
    const kf = getKeyframeAt(layer, state.currentFrame);
    if (!kf) { alert("Insère d'abord une image clé (F6) sur cette image avant d'y ajouter un script."); return; }
    saveActive();
    if (!kf.script) kf.script = '// Exécuté une fois quand la tête de lecture atteint cette image\nScene.stop();\n';
    frameTarget = { layerId: layer.id, frameIndex: kf.index };
    symbolTarget = false;
    notify(state);
  }

  function removeActiveFrameScript() {
    if (!frameTarget) return;
    const kf = findFrameKeyframe(frameTarget);
    if (kf) kf.script = '';
    frameTarget = null;
    notify(state);
  }

  const saveActive = () => {
    if (!editor) return;
    const code = editor.state.doc.toString();
    if (symbolTarget) {
      const sym = contextSymbol();
      if (sym) sym.script = code;
    } else if (frameTarget) {
      const kf = findFrameKeyframe(frameTarget);
      if (kf) kf.script = code;
    } else if (activeId) {
      const sc = state.doc.scripts.find((s) => s.id === activeId);
      if (sc) sc.code = code;
    }
  };

  async function addScript() {
    const name = await promptText('Nom du script :', 'Script ' + (state.doc.scripts.length + 1));
    if (!name) return;
    const sc = createScript(name, '// ' + name + '\n');
    state.doc.scripts.push(sc);
    activeId = sc.id;
    frameTarget = null;
    symbolTarget = false;
    notify(state);
  }

  function removeScript(id) {
    if (state.doc.scripts.length <= 1) return;
    const idx = state.doc.scripts.findIndex((s) => s.id === id);
    state.doc.scripts.splice(idx, 1);
    if (activeId === id) activeId = state.doc.scripts[Math.max(0, idx - 1)].id;
    notify(state);
  }

  function runActive() {
    if (symbolTarget) return; // s'exécute au démarrage de la lecture (une fois par instance)
    saveActive();
    const code = getActiveCode();
    consoleEl.textContent = '';
    try {
      runtime.run(code, (level, args) => appendConsole(level, args));
    } catch (err) {
      appendConsole('error', [String(err && err.stack || err)]);
    }
  }

  function appendConsole(level, args) {
    const line = document.createElement('div');
    line.className = 'script-console-line ' + level;
    line.textContent = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    consoleEl.appendChild(line);
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }

  function ensureEditor() {
    if (editor) return;
    editor = new EditorView({
      doc: getActiveCode(),
      extensions: [
        basicSetup,
        javascript(),
        // Une source par appel data.of (Facet.of ne retient que le 1er argument)
        // : languageDataAt pousse la valeur entière, donc un array de fonctions
        // serait pris pour une liste d'options (completeFromList) et crasherait
        // le FuzzyMatcher (label undefined). Bug pré-existant corrigé ici.
        ...makeCompletionSources(state, () => symbolTarget || !!frameTarget).map((s) => javascriptLanguage.data.of({ autocomplete: s })),
        EditorView.theme({
          '&': { fontSize: '12px', height: '100%' },
          '.cm-scroller': { fontFamily: "'Cascadia Mono', 'Consolas', monospace", lineHeight: '1.45' },
          '&.cm-focused': { outline: 'none' },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) saveActive();
        }),
      ],
      parent: editorHost,
    });
    window.addEventListener('keydown', (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key === 'Enter') {
        const cmFocused = editorHost.contains(document.activeElement);
        if (cmFocused) { e.preventDefault(); runActive(); }
      }
    });
  }

  function renderTabs() {
    tabs.innerHTML = '';
    for (const sc of state.doc.scripts) {
      const tab = document.createElement('div');
      tab.className = 'script-tab' + (sc.id === activeId && !frameTarget && !symbolTarget ? ' active' : '');
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = sc.name;
      name.addEventListener('dblclick', async () => {
        const next = await promptText('Nom du script :', sc.name);
        if (next) { sc.name = next; notify(state); }
      });
      const del = document.createElement('button');
      del.className = 'script-tab-del';
      del.title = 'Supprimer le script';
      del.innerHTML = ICONS.close;
      del.addEventListener('click', (e) => { e.stopPropagation(); removeScript(sc.id); });
      tab.addEventListener('click', () => { saveActive(); activeId = sc.id; frameTarget = null; symbolTarget = false; notify(state); });
      tab.append(name, del);
      tabs.appendChild(tab);
    }
  }

  function renderFrameRow() {
    const scripts = listFrameScripts();
    frameSelect.innerHTML = '';
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = scripts.length ? '— scripts d\'image —' : '(aucun script d\'image)';
    frameSelect.appendChild(emptyOpt);
    for (const s of scripts) {
      const opt = document.createElement('option');
      opt.value = s.layerId + '#' + s.frameIndex;
      opt.textContent = s.layerName + ' : image ' + (s.frameIndex + 1);
      frameSelect.appendChild(opt);
    }
    frameSelect.value = frameTarget ? frameTarget.layerId + '#' + frameTarget.frameIndex : '';
    frameRow.classList.toggle('active', !!frameTarget);
    frameDelBtn.disabled = !frameTarget;
  }

  frameSelect.addEventListener('change', () => {
    saveActive();
    const v = frameSelect.value;
    if (!v) { frameTarget = null; symbolTarget = false; }
    else {
      const i = v.lastIndexOf('#');
      frameTarget = { layerId: v.slice(0, i), frameIndex: parseInt(v.slice(i + 1), 10) };
      symbolTarget = false;
    }
    notify(state);
  });

  function update() {
    if (!state.doc.scripts) state.doc.scripts = [];
    if (!state.doc.scripts.length) state.doc.scripts.push(createScript('Script 1', ''));
    if (!state.doc.scripts.find((s) => s.id === activeId)) activeId = state.doc.scripts[0].id;
    // Script de symbole : visible/actif seulement en contexte MovieClip.
    const sym = contextSymbol();
    if (symbolTarget && !sym) symbolTarget = false;
    symbolRow.style.display = sym ? '' : 'none';
    if (sym) {
      const hasScript = !!(sym.script && sym.script.trim());
      symbolBtn.textContent = 'MovieClip : ' + sym.name + (hasScript ? '' : ' (sans script)');
      symbolRow.classList.toggle('active', symbolTarget);
    }
    // Le badge "a" de la timeline (Timeline.js) pose cette demande ponctuelle
    // pour ouvrir directement le script d'une keyframe cliquée ; on l'applique
    // puis on l'efface aussitôt pour ne pas reforcer le focus à chaque notify().
    if (state.focusFrameScript) {
      frameTarget = state.focusFrameScript;
      symbolTarget = false;
      state.focusFrameScript = null;
    }
    // Fichiers externes : état de la cible active (import/export/lien VS Code).
    const t = activeTarget();
    if (t) {
      const meta = t.fileMeta;
      fileLabel.textContent = meta
        ? (meta.mode === 'linked' ? 'lié : ' : meta.mode === 'import' ? 'importé : ' : 'exporté : ') + meta.fileName
        : '';
      linkBtn.style.display = (supportsLinkedFiles() && t.key) ? '' : 'none';
      reloadBtn.style.display = (meta && meta.mode === 'linked') ? '' : 'none';
    }
    ensureEditor();
    renderTabs();
    renderFrameRow();
    runBtn.disabled = symbolTarget; // s'exécute à la lecture, pas via Exécuter
    const code = getActiveCode();
    if (editor.state.doc.toString() !== code) {
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: code } });
    }
  }

  update();
  return { update };
}
