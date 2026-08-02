// Panneau "Scripts" : liste de scripts stockés dans state.doc.scripts,
// éditeur de code CodeMirror 6 (coloration syntaxique + autocomplétion JS et
// de l'API Scene/Game), boutons Exécuter/Arrêter et console de sortie.
import { EditorView, basicSetup } from 'codemirror';
import { javascript, javascriptLanguage } from '@codemirror/lang-javascript';
import { createScript } from '../core/model.js';
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

  const editorHost = document.createElement('div');
  editorHost.className = 'script-editor';

  const consoleEl = document.createElement('div');
  consoleEl.className = 'script-console';
  consoleEl.textContent = '— console —';

  body.append(tabs, editorHost, consoleEl);

  let activeId = null;
  let editor = null;

  const saveActive = () => {
    if (activeId && editor) {
      const sc = state.doc.scripts.find((s) => s.id === activeId);
      if (sc) sc.code = editor.state.doc.toString();
    }
  };

  function addScript() {
    const name = prompt('Nom du script :', 'Script ' + (state.doc.scripts.length + 1));
    if (!name) return;
    const sc = createScript(name, '// ' + name + '\n');
    state.doc.scripts.push(sc);
    activeId = sc.id;
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
    const sc = state.doc.scripts.find((s) => s.id === activeId);
    if (!sc) return;
    saveActive();
    consoleEl.textContent = '';
    try {
      runtime.run(sc.code, (level, args) => appendConsole(level, args));
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
    const sc = state.doc.scripts.find((s) => s.id === activeId);
    editor = new EditorView({
      doc: sc ? sc.code : '',
      extensions: [
        basicSetup,
        javascript(),
        javascriptLanguage.data.of({ autocomplete: sceneCompletionSource }),
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
      tab.className = 'script-tab' + (sc.id === activeId ? ' active' : '');
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
      tab.addEventListener('click', () => { saveActive(); activeId = sc.id; notify(state); });
      tab.append(name, del);
      tabs.appendChild(tab);
    }
  }

  function update() {
    if (!state.doc.scripts) state.doc.scripts = [];
    if (!state.doc.scripts.length) state.doc.scripts.push(createScript('Script 1', ''));
    if (!state.doc.scripts.find((s) => s.id === activeId)) activeId = state.doc.scripts[0].id;
    ensureEditor();
    renderTabs();
    const sc = state.doc.scripts.find((s) => s.id === activeId);
    if (sc && editor.state.doc.toString() !== sc.code) {
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: sc.code } });
    }
  }

  update();
  return { update };
}
