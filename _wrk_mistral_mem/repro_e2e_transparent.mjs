// E2E couleurs transparentes — preuve de bout en bout dans un vrai navigateur.
// Demande user : le bouton ∅ (transparent) n'existe QUE dans le panneau
// Propriétés de la forme, PAS dans la barre d'outils gauche.
// Scénario : doc avec rectA fill 'transparent' (f0, L1) et rectB rouge ->
// transparent en tween linéaire (L2). 1) rendu rectA transparent ; 2) AUCUN
// bouton ∅ dans la toolbar ; 3) rect dessiné à la souris puis ∅ via les
// propriétés -> fill transparent ; 4) tween mi-frame rgba(255,0,0,0.5) ;
// 5) 0 pageerror.
// Run: node _wrk_mistral_mem/repro_e2e_transparent.mjs  (vite preview :4180)
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { createDocument, createLayer, createShape, insertKeyframe } from '../src/core/model.js';

const require = createRequire('/tmp/e2e/');
const puppeteer = require('puppeteer-core');

const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const URL = 'http://127.0.0.1:4180/';

const doc = createDocument({ name: 'TransparentTest' });
const l1 = doc.layers[0];
l1.name = 'L1';
l1.keyframes[0].elements = [createShape('rect', { x: 100, y: 100, width: 40, height: 40, fill: 'transparent', stroke: '#073642', strokeWidth: 2 })];
const l2 = createLayer('L2');
doc.layers.push(l2);
const kb0 = l2.keyframes[0];
kb0.elements = [createShape('rect', { x: 300, y: 100, width: 40, height: 40, fill: '#ff0000', stroke: '#000000', strokeWidth: 2 })];
kb0.tween = { easing: 'linear' };
const kb2 = insertKeyframe(l2, 2);
kb2.elements[0].fill = 'transparent';
writeFileSync('/tmp/e2e/transparent-test.json', JSON.stringify(doc));

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };

const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('.tl-toolbar');
const input = await page.$('input[type=file][accept=".json,application/json"]');
await input.uploadFile('/tmp/e2e/transparent-test.json');
await new Promise(r => setTimeout(r, 500));

// 1) rendu éditeur frame 0
const fills0 = await page.evaluate(() => {
  const content = Konva.stages[0].children[2];
  return content.find('Rect').map(r => ({ fill: r.fill(), stroke: r.stroke() }));
});
ok(fills0.length === 2, '2 rects rendus');
ok(fills0.some(r => r.fill === 'transparent' && r.stroke === '#073642'), 'rectA fill=transparent, contour noir conservé');
ok(fills0.some(r => r.fill === '#ff0000'), 'rectB fill rouge à frame 0');

// 2) AUCUN bouton ∅ dans la barre d'outils gauche
const toolbarNoColor = await page.evaluate(() => document.querySelectorAll('.tool-color-row .no-color-btn').length);
ok(toolbarNoColor === 0, '0 bouton ∅ dans la toolbar (demande user)');

// 3) dessiner un rect à la souris, puis le rendre transparent via les propriétés
await page.click('button[title="Rectangle (R)"]');
const pt = await page.evaluate(() => {
  const st = Konva.stages[0];
  const r = st.container().getBoundingClientRect();
  const s = st.scaleX();
  return { x: r.left + 450 * s, y: r.top + 300 * s, x2: r.left + 500 * s, y2: r.top + 340 * s };
});
await page.mouse.move(pt.x, pt.y);
await page.mouse.down();
await page.mouse.move(pt.x2, pt.y2, { steps: 5 });
await page.mouse.up();
await new Promise(r => setTimeout(r, 300));
const drawn = await page.evaluate(() => {
  const content = Konva.stages[0].children[2];
  const n = content.find('Rect').find(r => r.x() > 400);
  return n ? { x: n.x(), fill: n.fill() } : null;
});
ok(!!drawn && drawn.fill !== 'transparent', `rect dessiné à la souris, fill par défaut (${drawn && drawn.fill})`);

// sélectionner ce rect (clic sur son centre)
await page.click('button[title="Sélection (V)"]');
const centerDrawn = await page.evaluate(() => {
  const st = Konva.stages[0];
  const content = st.children[2];
  const node = content.find('Rect').find(r => r.x() > 400);
  const p = node.getAbsoluteTransform().point({ x: node.offsetX(), y: node.offsetY() });
  const r = st.container().getBoundingClientRect();
  return { x: r.left + p.x, y: r.top + p.y };
});
await page.mouse.click(centerDrawn.x, centerDrawn.y);
await new Promise(r => setTimeout(r, 300));

// cliquer le ∅ de la ligne Remplissage dans le panneau propriétés
const clicked = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.prop-row')];
  const fillRow = rows.find(r => r.querySelector('label') && r.querySelector('label').textContent === 'Remplissage');
  const btn = fillRow && fillRow.querySelector('.no-color-btn');
  if (!btn) return { found: false };
  const wasActive = btn.classList.contains('active');
  btn.click();
  return { found: true, wasActive };
});
ok(clicked.found, 'bouton ∅ présent dans les propriétés (ligne Remplissage)');
ok(clicked.wasActive === false, '∅ inactif avant clic (fill opaque)');
await new Promise(r => setTimeout(r, 300));
const afterTrans = await page.evaluate(() => {
  const content = Konva.stages[0].children[2];
  const n = content.find('Rect').find(r => r.x() > 400);
  const rows = [...document.querySelectorAll('.prop-row')];
  const fillRow = rows.find(r => r.querySelector('label') && r.querySelector('label').textContent === 'Remplissage');
  const btn = fillRow && fillRow.querySelector('.no-color-btn');
  return { fill: n.fill(), btnActive: !!(btn && btn.classList.contains('active')) };
});
ok(afterTrans.fill === 'transparent', `rect sélectionné passé à fill=transparent via ∅ (${afterTrans.fill})`);
ok(afterTrans.btnActive, 'bouton ∅ des propriétés actif après application');

// 4) tween à mi-frame : frame 1 -> rectB rgba(255,0,0,0.5)
const cells = await page.$$('.tl-ruler .cell');
await cells[1].click();
await new Promise(r => setTimeout(r, 300));
const fillMid = await page.evaluate(() => {
  const content = Konva.stages[0].children[2];
  const b = content.find('Rect').find(r => r.x() === 300);
  return b.fill();
});
ok(fillMid === 'rgba(255,0,0,0.5)', `tween rouge->transparent à mi-frame = ${fillMid}`);

ok(pageErrors.length === 0, '0 pageerror' + (pageErrors.length ? ' -> ' + pageErrors.join(' | ') : ''));

await browser.close();
console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
