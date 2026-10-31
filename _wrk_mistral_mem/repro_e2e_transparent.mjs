// E2E couleurs transparentes — preuve de bout en bout dans un vrai navigateur.
// Scénario : doc avec rectA fill 'transparent' stroke noir (f0, calque L1) et
// rectB fill #ff0000 -> 'transparent' en tween linéaire sur 2 frames (L2).
// 1) rendu éditeur : rectA fill='transparent' ; 2) bouton ∅ de la toolbar pose
// state.fillColor='transparent' et un rect dessiné à la souris hérite ce fill ;
// 3) panneau propriétés : ligne Remplissage avec bouton ∅ actif sur rectA ;
// 4) tween à mi-frame : rectB fill='rgba(255,0,0,0.5)' ; 5) 0 pageerror.
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

// 1) rendu éditeur frame 0 : rectA transparent, rectB rouge
const fills0 = await page.evaluate(() => {
  const content = Konva.stages[0].children[2];
  return content.find('Rect').map(r => ({ fill: r.fill(), stroke: r.stroke() }));
});
ok(fills0.length === 2, '2 rects rendus');
ok(fills0.some(r => r.fill === 'transparent' && r.stroke === '#073642'), 'rectA fill=transparent, contour noir conservé');
ok(fills0.some(r => r.fill === '#ff0000'), 'rectB fill rouge à frame 0');

// 2) bouton ∅ remplissage de la toolbar + dessin d'un rect à la souris
const transBtns = await page.$$('.tool-color-row .no-color-btn');
ok(transBtns.length === 2, '2 boutons ∅ dans la toolbar (fill + stroke)');
await transBtns[0].click();
await new Promise(r => setTimeout(r, 100));
const fillIsTrans = await page.evaluate(() => {
  const b = document.querySelectorAll('.tool-color-row .no-color-btn')[0];
  return b.classList.contains('active');
});
ok(fillIsTrans, 'bouton ∅ fill actif après clic');
await page.click('button[title="Rectangle (R)"]');
// coordonnées page d'un point scène (450, 300)
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
const fills1 = await page.evaluate(() => {
  const content = Konva.stages[0].children[2];
  return content.find('Rect').map(r => ({ fill: r.fill(), x: r.x() }));
});
ok(fills1.length === 3 && fills1.some(r => r.x > 400 && r.fill === 'transparent'), `rect dessiné à la souris (x>400) hérite fill transparent (${JSON.stringify(fills1)})`);

// 3) sélection de rectA -> panneau propriétés : ∅ actif sur la ligne Remplissage
const centerA = await page.evaluate(() => {
  const st = Konva.stages[0];
  const content = st.children[2];
  const node = content.find('Rect').find(r => r.fill() === 'transparent' && r.x() === 100);
  const p = node.getAbsoluteTransform().point({ x: node.offsetX(), y: node.offsetY() });
  const r = st.container().getBoundingClientRect();
  return { x: r.left + p.x, y: r.top + p.y };
});
await page.click('button[title="Sélection (V)"]');
await page.mouse.click(centerA.x, centerA.y);
await new Promise(r => setTimeout(r, 300));
const propInfo = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.prop-row')];
  const fillRow = rows.find(r => r.querySelector('label') && r.querySelector('label').textContent === 'Remplissage');
  if (!fillRow) return { found: false };
  const btn = fillRow.querySelector('.no-color-btn');
  return { found: true, transActive: !!(btn && btn.classList.contains('active')) };
});
ok(propInfo.found, 'ligne « Remplissage » présente dans le panneau propriétés');
ok(propInfo.transActive, 'bouton ∅ actif sur Remplissage (rectA bien transparent)');

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
