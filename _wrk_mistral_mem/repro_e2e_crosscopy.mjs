// E2E copier/coller ENTRE fenêtres-projets — le presse-papiers global de
// Stage.js + import des assets/symboles au collage.
// Doc A (fenêtre 1) : rect (100,100), instance de symbole (300,100), bitmap
// asset a1 (450,200). On copie chacun, on ouvre un 2e projet (bouton +New), on
// colle, et on vérifie via le JSON exporté du projet 2 : élément collé (nouvel
// id), symbole importé, asset importé. 0 pageerror.
// Run: node _wrk_mistral_mem/repro_e2e_crosscopy.mjs  (vite preview :4180)
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { createDocument, createLayer, createShape, createSymbol, createInstance, nextId } from '../src/core/model.js';

const require = createRequire('/tmp/e2e/');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const URL = 'http://127.0.0.1:4180/';
const PNG1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const doc = createDocument({ name: 'ProjetA' });
const layer = doc.layers[0];
const sym = createSymbol('Sym1', 'movieclip');
sym.layers[0].keyframes[0].elements = [createShape('ellipse', { x: 0, y: 0, width: 60, height: 60, fill: '#00ff00', stroke: '#000000' })];
doc.symbols[sym.id] = sym;
doc.assets['a1'] = { id: 'a1', name: 'px.png', dataUrl: PNG1PX };
layer.keyframes[0].elements = [
  createShape('rect', { x: 100, y: 100, width: 40, height: 40, fill: '#ff0000', stroke: '#000000' }),
  createInstance(sym.id, { x: 300, y: 100 }),
  { kind: 'bitmap', id: nextId('bitmap'), name: '', assetId: 'a1', x: 450, y: 200, width: 40, height: 40, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1 },
];
writeFileSync('/tmp/e2e/projetA.json', JSON.stringify(doc));

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };

const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('.tl-toolbar');

// patch capture des téléchargements (blob) pour lire le JSON exporté
await page.evaluate(() => {
  window.__cap = null;
  const orig = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (blob) => { window.__cap = blob; return orig(blob); };
});

const input = await page.$('input[type=file][accept=".json,application/json"]');
await input.uploadFile('/tmp/e2e/projetA.json');
await new Promise(r => setTimeout(r, 500));

const sceneToPage = (x, y) => page.evaluate((x, y) => {
  const st = Konva.stages[0];
  const r = st.container().getBoundingClientRect();
  const s = st.scaleX();
  return { x: r.left + x * s, y: r.top + y * s };
}, x, y);
const ctrl = async (key) => { await page.keyboard.down('Control'); await page.keyboard.press(key); await page.keyboard.up('Control'); };
const exportJson = async () => {
  const menuBtns = await page.$$('#menubar button');
  for (const b of menuBtns) {
    const t = await b.evaluate(el => el.textContent);
    if (t && t.includes('Fichier')) { await b.click(); break; }
  }
  await new Promise(r => setTimeout(r, 250));
  await page.evaluate(() => {
    const items = [...document.querySelectorAll('[class*="menu"] *')];
    const it = items.find(el => el.children.length === 0 && el.textContent && el.textContent.includes('Enregistrer JSON'));
    if (it) it.click();
  });
  await new Promise(r => setTimeout(r, 500));
  return page.evaluate(async () => {
    if (!window.__cap) return null;
    return JSON.parse(await window.__cap.text());
  });
};
const selectAt = async (x, y) => {
  const p = await sceneToPage(x, y);
  await page.mouse.click(p.x, p.y);
  await new Promise(r => setTimeout(r, 200));
};
const newProject = async () => {
  await page.click('.project-tab-new');
  await new Promise(r => setTimeout(r, 400));
};
const switchTab = async (index) => {
  await page.evaluate((i) => { document.querySelectorAll('.project-tab')[i].click(); }, index);
  await new Promise(r => setTimeout(r, 400));
};

// --- 1) copier le RECT dans A, coller dans B ---
await selectAt(100, 100);
await ctrl('KeyC');
await newProject();               // fenêtre 2 = doc vide
await ctrl('KeyV');
let docB = await exportJson();
ok(!!docB && docB.layers[0].keyframes[0].elements.length === 1 && docB.layers[0].keyframes[0].elements[0].shapeType === 'rect', 'rect collé dans le projet B (1 élément)');
ok(docB.layers[0].keyframes[0].elements[0].id !== doc.layers[0].keyframes[0].elements[0].id, 'nouvel id au collage');

// --- 2) copier l'INSTANCE (symbole) dans A, coller dans B ---
await switchTab(0);               // retour projet A
await selectAt(300, 100);
await ctrl('KeyC');
await switchTab(1);               // projet B
await ctrl('KeyV');
docB = await exportJson();
const instB = docB.layers[0].keyframes[0].elements.find(e => e.kind === 'instance');
ok(!!instB, 'instance collée dans B');
ok(!!docB.symbols && !!docB.symbols[sym.id], 'symbole importé dans doc B (doc.symbols)');
ok(docB.symbols[sym.id].layers[0].keyframes[0].elements.length === 1, 'contenu du symbole présent');

// --- 3) copier le BITMAP (asset) dans A, coller dans B ---
await switchTab(0);
await selectAt(450, 200);
await ctrl('KeyC');
await switchTab(1);
await ctrl('KeyV');
docB = await exportJson();
const bmpB = docB.layers[0].keyframes[0].elements.find(e => e.kind === 'bitmap');
ok(!!bmpB, 'bitmap collé dans B');
ok(!!docB.assets && !!docB.assets['a1'] && docB.assets['a1'].dataUrl === PNG1PX, 'asset importé dans doc B (doc.assets)');

// --- 4) couper (Ctrl+X) dans B supprime la sélection ---
const before = docB.layers[0].keyframes[0].elements.length;
await selectAt(100, 100); // le rect collé en (100,100)
await ctrl('KeyX');
docB = await exportJson();
ok(docB.layers[0].keyframes[0].elements.length === before - 1, `Ctrl+X dans B: élément supprimé (${before} -> ${docB.layers[0].keyframes[0].elements.length})`);

ok(pageErrors.length === 0, '0 pageerror' + (pageErrors.length ? ' -> ' + pageErrors.join(' | ') : ''));
await browser.close();
console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
