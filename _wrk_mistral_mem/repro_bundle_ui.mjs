// Harnais headless : charge le VRAI bundle vanilla servi (tweenjs-bundle.js)
// avec des stubs DOM/Konva permissifs, puis simule les clics utilisateur
// (+New, Archives) pour reproduire "rien ne se passe a l'ouverture".
import { readFileSync } from 'node:fs';
import { createDocument } from '../src/core/model.js';

// ---------------------------------------------------------------- DOM stub
function makeText(t) { return { nodeType: 3, textContent: String(t), parentNode: null }; }

function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(), nodeType: 1,
    children: [], parentNode: null, style: {}, dataset: {},
    _handlers: {}, _classes: new Set(), textContent: '', innerHTML: '',
    get className() { return [...el._classes].join(' '); },
    set className(v) { el._classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
    classList: null, // rempli ci-dessous
    appendChild(c) { if (c) { if (c.parentNode && c.parentNode.removeChild) c.parentNode.removeChild(c); c.parentNode = el; } el.children.push(c); return c; },
    append(...cs) { for (const c of cs) el.appendChild(typeof c === 'string' ? makeText(c) : c); },
    prepend(...cs) { for (const c of cs) el.children.unshift(typeof c === 'string' ? makeText(c) : c); },
    insertBefore(n) { return el.appendChild(n); },
    removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); c.parentNode = null; return c; },
    remove() { if (el.parentNode && el.parentNode.removeChild) el.parentNode.removeChild(el); },
    get firstChild() { return el.children[0] || null; },
    get lastChild() { return el.children[el.children.length - 1] || null; },
    get parentElement() { return el.parentNode && el.parentNode.nodeType === 1 ? el.parentNode : null; },
    contains(n) { let p = n; while (p) { if (p === el) return true; p = p.parentNode; } return false; },
    addEventListener(t, fn) { (el._handlers[t] = el._handlers[t] || []).push(fn); },
    removeEventListener(t, fn) { const a = el._handlers[t] || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); },
    dispatch(t, ev) {
      ev = ev || {};
      ev.preventDefault = ev.preventDefault || (() => {});
      ev.stopPropagation = ev.stopPropagation || (() => {});
      ev.target = ev.target || el;
      for (const fn of [...(el._handlers[t] || [])]) fn(ev);
    },
    click() { el.dispatch('click'); },
    getBoundingClientRect() { return { left: 0, top: 0, right: 900, bottom: 40, width: 900, height: 40 }; },
    setAttribute(k, v) { el['attr_' + k] = String(v); },
    getAttribute(k) { return el['attr_' + k] !== undefined ? el['attr_' + k] : null; },
    removeAttribute(k) { delete el['attr_' + k]; },
    focus() {}, blur() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    getElementsByTagName() { return []; },
    getElementsByClassName(cls) { return collectByClass(el, cls); },
    getContext() { return ctxStub(); },
    get ownerDocument() { return documentStub; },
  };
  el.classList = {
    add: (...c) => c.forEach((x) => el._classes.add(x)),
    remove: (...c) => c.forEach((x) => el._classes.delete(x)),
    toggle(c, force) { const has = el._classes.has(c); const want = force === undefined ? !has : !!force; if (want) el._classes.add(c); else el._classes.delete(c); return want; },
    contains: (c) => el._classes.has(c),
    replace: (a, b) => { if (el._classes.has(a)) { el._classes.delete(a); el._classes.add(b); } },
  };
  return new Proxy(el, {
    get(t, p) {
      if (p in t) return t[p];
      if (typeof p === 'string' && !p.startsWith('_')) return (...a) => undefined; // methode inconnue -> no-op
      return undefined;
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}

function collectByClass(root, cls) {
  const out = [];
  const walk = (n) => {
    if (n.nodeType === 1) {
      if (n._classes && n._classes.has(cls)) out.push(n);
      for (const c of n.children) walk(c);
    }
  };
  walk(root);
  return out;
}

function ctxStub() {
  const noop = () => {};
  return new Proxy({ canvas: { width: 100, height: 100 } }, { get(t, p) { if (p in t) return t[p]; return noop; }, set(t, p, v) { t[p] = v; return true; } });
}

const byId = {};
const docBody = makeEl('body');
const documentStub = {
  nodeType: 9, body: docBody, documentElement: makeEl('html'), activeElement: null,
  createElement: (t) => makeEl(t),
  createElementNS: () => makeEl('svg'),
  createTextNode: (t) => makeText(t),
  createDocumentFragment: () => makeEl('#fragment'),
  getElementById: (id) => byId[id] || (byId[id] = makeEl('div')),
  addEventListener() {}, removeEventListener() {},
  querySelector: () => null, querySelectorAll: () => [],
  getElementsByTagName: () => [],
  getElementsByClassName: (cls) => collectByClass(docBody, cls),
  contains: () => true,
  getSelection: () => ({ rangeCount: 0, getRangeAt: () => ({}), addRange() {}, removeAllRanges() {} }),
  hasFocus: () => false,
};

// ---------------------------------------------------------------- globals
const alerts = [];
globalThis.window = globalThis;
globalThis.document = documentStub;
globalThis.location = { protocol: 'http:', href: 'http://127.0.0.1:8123/', host: '127.0.0.1:8123', pathname: '/', search: '', hash: '' };
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node-harness', maxTouchPoints: 0, platform: 'win' }, configurable: true, writable: true });
globalThis.localStorage = {
  _m: {},
  getItem(k) { return this._m[k] !== undefined ? this._m[k] : null; },
  setItem(k, v) { this._m[k] = String(v); },
  removeItem(k) { delete this._m[k]; },
};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};
globalThis.alert = (m) => { alerts.push(String(m)); console.log('[ALERT]', String(m)); };
globalThis.confirm = (m) => { console.log('[CONFIRM]', String(m), '-> true'); return true; };
globalThis.Image = class { constructor() { this._src = ''; } set src(v) { this._src = v; this.naturalWidth = 100; this.naturalHeight = 100; if (this.onload) this.onload(); } get src() { return this._src; } };
globalThis.performance = { now: () => Date.now() };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '0' });
globalThis.MutationObserver = class { observe() {} disconnect() {} takeRecords() { return []; } };
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.Range = class { setStart() {} setEnd() {} collapse() {} getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; } };
globalThis.DOMRect = class {};
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o || {}); } };
globalThis.Event = class { constructor(t) { this.type = t; } };
globalThis.KeyboardEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o || {}); } };
globalThis.MouseEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o || {}); } };
globalThis.FileReader = class { readAsDataURL() { if (this.onload) this.onload(); } readAsText() { if (this.onload) this.onload(); } };
globalThis.fetch = async () => ({ text: async () => '', ok: true });
globalThis.scrollX = 0; globalThis.scrollY = 0;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.dispatchEvent = () => true;
globalThis.innerWidth = 1280; globalThis.innerHeight = 800;
globalThis.devicePixelRatio = 1;

// ---------------------------------------------------------------- Konva stub
function konvaInstance(name, args) {
  const obj = {
    _attrs: (args && args[0]) || {}, className: name, children: [],
    add(c) { obj.children.push(c); c.parent = obj; c._stage = obj._stage || obj; return c; },
    destroy() {}, remove() {}, destroyChildren() {},
    on() { return obj; }, off() { return obj; }, fire() { return obj; },
    setAttrs(a) { Object.assign(obj._attrs, a); }, setAttr(k, v) { obj._attrs[k] = v; }, getAttr(k) { return obj._attrs[k]; },
    scale() { return { x: 1, y: 1 }; }, position() { return { x: 0, y: 0 }; },
    x() { return 0; }, y() { return 0; }, width() { return 550; }, height() { return 400; },
    getClientRect() { return { x: 0, y: 0, width: 50, height: 50 }; },
    getSelfRect() { return { x: 0, y: 0, width: 50, height: 50 }; },
    getPointerPosition() { return { x: 100, y: 100 }; },
    container() { return byId['stage-container'] || (byId['stage-container'] = makeEl('div')); },
    batchDraw() {}, draw() {}, drawScene() {}, drawHit() {}, hitGraphDirty() {},
    getStage() { return obj._stage || obj; }, getLayer() { return obj; }, getParent() { return obj.parent || null; },
    isDragging() { return false; }, stopDrag() {}, startDrag() {},
    getAbsolutePosition() { return { x: 0, y: 0 }; }, getAbsoluteScale() { return { x: 1, y: 1 }; },
    setAbsolutePosition() {},
    nodes() { return obj; }, getNodes() { return []; }, setNodes() {},
    findOne() { return null; }, find() { return []; },
    toCanvas: () => makeEl('canvas'), toDataURL: () => 'data:,',
    update() {}, forceUpdate() {}, hide() {}, show() {}, visible() { return true; },
    listening() { return true; }, draggable() { return false; }, intersects() { return false; },
    moveTo() { return obj; }, moveToTop() {}, zIndex() {}, move() {},
    offsetX() { return 0; }, offsetY() { return 0; }, rotation() { return 0; },
    isListening() { return true; }, isVisible() { return true; },
  };
  return new Proxy(obj, {
    get(t, p) {
      if (p in t) return t[p];
      if (typeof p === 'string') { const v = t._attrs[p]; if (v !== undefined) return typeof v === 'function' ? v : v; }
      return () => undefined;
    },
    set(t, p, v) { t._attrs[p] = v; t[p] = v; return true; },
  });
}
const konvaCache = {};
globalThis.Konva = new Proxy({}, {
  get(t, p) {
    if (typeof p !== 'string') return undefined;
    if (!(p in t)) t[p] = function (...a) { return konvaInstance(p, a); };
    return t[p];
  },
});

// ---------------------------------------------------------------- seed archives
const seedDoc = createDocument({ name: 'Scene Archivee' });
globalThis.localStorage._m['tweenjs:projects'] = JSON.stringify([
  { id: 'p1', name: 'Scene Archivee', data: JSON.stringify(seedDoc), timestamp: 1 },
]);

// ---------------------------------------------------------------- charge le bundle
const code = readFileSync('../Animate_JS_PureVanilla/tweenjs-bundle.js', 'utf-8');
try {
  new Function(code)();
  console.log('bundle charge sans erreur au montage');
} catch (e) {
  console.log('ERREUR AU MONTAGE DU BUNDLE :', e && (e.stack || e.message));
  process.exit(1);
}

// ---------------------------------------------------------------- helpers UI
const tabsBar = byId['project-tabs'] || collectByClass(docBody, 'project-tabs-strip')[0]?.parentNode;
const findAll = (cls) => collectByClass(docBody, cls);
const countTabs = () => findAll('project-tab').filter((e) => e._classes.has('project-tab')).length;

function dump(label) {
  console.log(label, '| onglets:', countTabs(), '| boutons +New:', findAll('project-tab-new').length, '| alerts:', alerts.length);
}

dump('ETAT INITIAL');

// ---------------------------------------------------------------- test 1 : +New
const plus = findAll('project-tab-new')[0];
if (!plus) { console.log('ECHEC: bouton +New introuvable'); process.exit(1); }
if (plus.disabled) console.log('ECHEC: bouton +New desactive alors que peu de fenetres');
plus.click();
dump('APRES +New #1');
plus.click();
dump('APRES +New #2');
plus.click();
dump('APRES +New #3');

// ---------------------------------------------------------------- test 2 : Archives (meme scene 2 fois)
const saveBtn = findAll('archive-save-btn')[0];
// ouvrir le menu Archives : chercher les boutons de menu (file-menu-btn)
const menuBtns = findAll('file-menu-btn');
console.log('boutons menu:', menuBtns.map((b) => b.textContent || '').length);

// Cliquer le bouton "Archives" (2e file-menu-btn)
const archivesBtn = menuBtns[1] || menuBtns[0];
archivesBtn.dispatch('click', {});
const items = findAll('archive-item');
console.log('items archives affiches:', items.length);
if (items.length) {
  items[0].dispatch('click', {}); // 1re ouverture
  dump('APRES Archives #1');
  // rouvrir le menu et recliquer le meme item (meme scene !)
  archivesBtn.dispatch('click', {});
  const items2 = findAll('archive-item');
  if (items2.length) {
    items2[0].dispatch('click', {}); // 2e ouverture de la MEME scene
    dump('APRES Archives #2 (meme scene)');
  }
}

// ---------------------------------------------------------------- verdict
const tabs = countTabs();
console.log('');
console.log(alerts.length ? 'ALERTS EMISES: ' + alerts.length : 'aucune alerte emise');
console.log(tabs >= 3 ? 'OUVERTURES MULTIPLES OK (' + tabs + ' onglets)' : 'BUG REPRODUIT : seulement ' + tabs + ' onglet(s)');
