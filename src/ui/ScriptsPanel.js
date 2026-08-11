// Panneau "Scripts" : liste de scripts stockés dans state.doc.scripts,
// éditeur de code CodeMirror 6 (coloration syntaxique + autocomplétion JS et
// de l'API Scene/Game), boutons Exécuter/Arrêter et console de sortie.
import { EditorView, basicSetup } from 'codemirror';
import { javascript, javascriptLanguage } from '@codemirror/lang-javascript';
import { createScript, getNamedElements, getContextLayers, getKeyframeAt } from '../core/model.js';
import { notify } from '../state.js';
import { createPanel } from './Panel.js';
import { ICONS } from './icons.js';

// Complétions de l'API Scene/Game exposée par le runtime (sceneRuntime.js).
// On les fournit via languageDataAt("autocomplete") du langage JavaScript :
// autocompletion() combine la source du langage ET la nôtre (override non
// utilisé, ce qui préserverait l'autocomplétion JS native).
const SCENE_COMPLETIONS = [
  'width', 'height', 'frameRate', 'backgroundColor', 'name', 'frameCount',
  'playing', 'currentFrame', 'play', 'stop', 'gotoAndPlay', 'gotoAndStop',
  'addShape', 'addInstance', 'onEnterFrame', 'onKeyDown', 'onKeyUp', 'keys', 'random',
];

const sceneCompletionSource = (context) => {
  const word = context.matchBefore(/[\w$]*/);
  if (!word) return null;
  const before = context.state.sliceDoc(Math.max(0, word.from - 20), word.from);
  if (!/(?:Scene|Game)\.$/.test(before)) return null;
  return {
    from: word.from,
    options: SCENE_COMPLETIONS.map((label) => ({ label, type: 'property' })),
  };
};

// Propriétés manipulables depuis un script sur un élément nommé.
const INSTANCE_PROPS = [
  'x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity',
  'width', 'height', 'fill', 'stroke', 'strokeWidth', 'name', 'text', 'fontSize',
];

// Complétion des Noms d'instance du document courant comme variables
// directement utilisables (nom.x += 1). On ignore les positions après un
// point / crochet pour ne pas parasiter Scene.* ou obj.prop.
const instanceNameCompletionSource = (context) => {
  const word = context.matchBefore(/[\w$]*/);
  if (!word) return null;
  const before = context.state.sliceDoc(Math.max(0, word.from - 1), word.from);
  if (before === '.' || before === '[') return null;
  const options = Object.keys(getNamedElements(state.doc, state.editPath, state.currentFrame))
    .map((label) => ({ label, type: 'variable' }));
  if (!options.length) return null;
  return { from: word.from, options };
};

// Complétion des propriétés d'un élément nommé après « nom. ».
const instancePropsCompletionSource = (context) => {
  const word = context.matchBefore(/[\w$]*/);
  if (!word) return null;
  const before = context.state.sliceDoc(Math.max(0, word.from - 40), word.from);
  const m = /([A-Za-z_$][\w$]*)\.$/.exec(before);
  if (!m) return null;
  if (!(m[1] in getNamedElements(state.doc, state.editPath, state.currentFrame))) return null;
  return {
    from: word.from,
    options: INSTANCE_PROPS.map((label) => ({ label, type: 'property' })),
  };
};

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

  body.append(tabs, frameRow, editorHost, consoleEl);

  let activeId = null;
  let frameTarget = null; // { layerId, frameIndex } | null — non-null = édition d'un script d'image plutôt que d'un script nommé
  let editor = null;

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
    if (frameTarget) {
      const kf = findFrameKeyframe(frameTarget);
      if (kf) kf.script = code;
    } else if (activeId) {
      const sc = state.doc.scripts.find((s) => s.id === activeId);
      if (sc) sc.code = code;
    }
  };

  function addScript() {
    const name = prompt('Nom du script :', 'Script ' + (state.doc.scripts.length + 1));
    if (!name) return;
    const sc = createScript(name, '// ' + name + '\n');
    state.doc.scripts.push(sc);
    activeId = sc.id;
    frameTarget = null;
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
        javascriptLanguage.data.of({ autocomplete: [sceneCompletionSource, instanceNameCompletionSource, instancePropsCompletionSource] }),
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
      tab.className = 'script-tab' + (sc.id === activeId && !frameTarget ? ' active' : '');
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = sc.name;
      name.addEventListener('dblclick', () => {
        const next = prompt('Nom du script :', sc.name);
        if (next) { sc.name = next; notify(state); }
      });
      const del = document.createElement('button');
      del.className = 'script-tab-del';
      del.title = 'Supprimer le script';
      del.innerHTML = ICONS.close;
      del.addEventListener('click', (e) => { e.stopPropagation(); removeScript(sc.id); });
      tab.addEventListener('click', () => { saveActive(); activeId = sc.id; frameTarget = null; notify(state); });
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
    if (!v) { frameTarget = null; }
    else {
      const i = v.lastIndexOf('#');
      frameTarget = { layerId: v.slice(0, i), frameIndex: parseInt(v.slice(i + 1), 10) };
    }
    notify(state);
  });

  function update() {
    if (!state.doc.scripts) state.doc.scripts = [];
    if (!state.doc.scripts.length) state.doc.scripts.push(createScript('Script 1', ''));
    if (!state.doc.scripts.find((s) => s.id === activeId)) activeId = state.doc.scripts[0].id;
    // Le badge "a" de la timeline (Timeline.js) pose cette demande ponctuelle
    // pour ouvrir directement le script d'une keyframe cliquée ; on l'applique
    // puis on l'efface aussitôt pour ne pas reforcer le focus à chaque notify().
    if (state.focusFrameScript) {
      frameTarget = state.focusFrameScript;
      state.focusFrameScript = null;
    }
    ensureEditor();
    renderTabs();
    renderFrameRow();
    const code = getActiveCode();
    if (editor.state.doc.toString() !== code) {
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: code } });
    }
  }

  update();
  return { update };
}
