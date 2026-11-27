// E2E masque de calque — preuve de bout en bout (éditeur + export HTML).
// Doc : L1 'fond' (masked) rect rouge 300x200 centré (200,200) ; L2 'masque'
// (mask) ellipse noire 100x100 centrée (275,200).
// Vérifs : structure Konva (groupe + destination-in), pixels (centre=rouge,
// hors masque=blanc), toggle masked -> hors masque=rouge, édition du masque
// (calque sélectionné -> masque visible, centre=noir), export HTML -> mêmes
// pixels. 0 pageerror.
// Run: node _wrk_mistral_mem/repro_e2e_mask.mjs  (vite preview :4180)
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { createDocument, createLayer, createShape } from '../src/core/model.js';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');

const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const URL = 'http://127.0.0.1:4180/';

const doc = createDocument({ name: 'MaskTest' });
const fond = doc.layers[0];
fond.name = 'fond';
fond.masked = true;
fond.keyframes[0].elements = [createShape('rect', { x: 200, y: 200, width: 300, height: 200, fill: '#ff0000', stroke: '#000000', strokeWidth: 1 })];
const masque = createLayer('masque');
masque.mask = true;
doc.layers.push(masque);
masque.keyframes[0].elements = [createShape('ellipse', { x: 275, y: 200, width: 100, height: 100, fill: '#000000', stroke: '#000000', strokeWidth: 1 })];
writeFileSync('/tmp/e2e/mask-test.json', JSON.stringify(doc));

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };

const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('.tl-toolbar');
const input = await page.$('input[type=file][accept=".json,application/json"]');
await input.uploadFile('/tmp/e2e/mask-test.json');
await new Promise(r => setTimeout(r, 500));

// helper pixels COMPOSITÉS des layers de contenu (children[2..] sauf overlay) en coordonnées scène
const pxEval = (x, y) => page.evaluate((x, y) => {
  const st = Konva.stages[0];
  const pr = st.children[2].canvas._canvas.width / st.width();
  const sx = Math.round(x * st.scaleX() * pr), sy = Math.round(y * st.scaleX() * pr);
  // composite source-over des layers de contenu (du bas vers le haut), overlay exclu
  let r = 0, g = 0, b = 0, a = 0;
  const layers = [...st.children].slice(2, -1);
  for (const l of layers) {
    const cv = l.canvas._canvas;
    const d = cv.getContext('2d').getImageData(sx, sy, 1, 1).data;
    const sa = d[3] / 255;
    const da = a + sa * (1 - a);
    if (da > 0) {
      r = (d[0] * sa + r * a * (1 - sa)) / da;
      g = (d[1] * sa + g * a * (1 - sa)) / da;
      b = (d[2] * sa + b * a * (1 - sa)) / da;
    }
    a = da;
  }
  return [Math.round(r), Math.round(g), Math.round(b), Math.round(a * 255)];
}, x, y);
const isRed = (p) => p[0] > 200 && p[1] < 60 && p[2] < 60;
const isWhite = (p) => p[0] > 240 && p[1] > 240 && p[2] > 240;
const isBlack = (p) => p[0] < 40 && p[1] < 40 && p[2] < 40;

// 1) structure Konva : dans le layer du bloc masque, un Group contenant le rect + un sous-groupe destination-in
const struct = await page.evaluate(() => {
  const content = Konva.stages[0].children[2];
  const g = content.children.find(c => c.getType() === 'Group' && c.children.length >= 2);
  if (!g) return { group: false, dump: content.children.map(c => ({ cls: c.className, gco: c.globalCompositeOperation ? c.globalCompositeOperation() : null })) };
  const rect = g.children.find(c => c.className === 'Rect' || c.className === 'Shape' || c.className === 'Ellipse');
  const maskG = g.children.find(c => c.getType() === 'Group' && c.globalCompositeOperation && c.globalCompositeOperation() === 'destination-in');
  return { group: true, hasRect: !!rect, maskDestIn: !!maskG, maskChildren: maskG ? maskG.children.length : 0 };
});
console.log('  struct:', JSON.stringify(struct));
ok(struct.group && struct.hasRect, 'bloc masque = Group contenant le rect masqué');
ok(struct.maskDestIn && struct.maskChildren === 1, 'masque posé en destination-in (1 ellipse)');

// 2) pixels : centre du masque = rouge (visible), hors masque = fantôme gris clair 15% en édition
const pIn = await pxEval(275, 200);
const pOut = await pxEval(100, 200);
const pBg = await page.evaluate(() => {
  const st = Konva.stages[0];
  const cv = st.children[0].canvas._canvas; // bgLayer
  const d = cv.getContext('2d').getImageData(100, 200, 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
});
ok(isRed(pIn), `pixel au centre du masque = rouge ${JSON.stringify(pIn)}`);
ok(pOut[3] >= 30 && pOut[3] <= 45 && Math.abs(pOut[0] - 176) < 12, `hors masque: fantôme gris clair 15% en édition ${JSON.stringify(pOut)}`);
ok(isWhite(pBg), `fond blanc dessous ${JSON.stringify(pBg)}`);

// 2b) en lecture : plus de fantôme, le rogné est purement invisible (alpha 0)
await page.click('button[title="Lecture / Pause (Entrée)"]');
await new Promise(r => setTimeout(r, 400));
const pOutPlay = await pxEval(100, 200);
ok(pOutPlay[3] === 0, `lecture: plus de fantôme hors masque (alpha 0) ${JSON.stringify(pOutPlay)}`);
await page.click('button[title="Arrêter la lecture"]');
await new Promise(r => setTimeout(r, 200));

// 3) toggle masked OFF sur le calque fond -> le rect réapparaît partout
// (re-querie des lignes au moment du clic : la timeline se re-rend à chaque notify)
const clickMaskedBtn = async (rowIndex) => {
  await page.evaluate((rowIndex) => {
    const rows = document.querySelectorAll('.tl-layer-row:not(.tl-camera-row):not(.tl-audio-row)');
    const btns = rows[rowIndex].querySelectorAll('.mini-btn'); // [eye, mask, masked, lock]
    btns[2].click();
  }, rowIndex);
  await new Promise(r => setTimeout(r, 300));
};
await clickMaskedBtn(1); // rows[0] = masque (haut du panneau), rows[1] = fond
const pOut2 = await pxEval(100, 200);
ok(isRed(pOut2), `masked off -> pixel hors masque = rouge ${JSON.stringify(pOut2)}`);
await clickMaskedBtn(1); // remettre
await new Promise(r => setTimeout(r, 300));

// 4) sélectionner le calque masque -> rendu en édition (masque visible, interactif)
await page.evaluate(() => { document.querySelectorAll('.tl-layer-row:not(.tl-camera-row):not(.tl-audio-row)')[0].click(); });
await new Promise(r => setTimeout(r, 300));
const pEdit = await pxEval(275, 200);
ok(isBlack(pEdit), `calque masque sélectionné -> masque visible, centre = noir ${JSON.stringify(pEdit)}`);
await page.evaluate(() => { document.querySelectorAll('.tl-layer-row:not(.tl-camera-row):not(.tl-audio-row)')[1].click(); }); // resélectionner le fond
await new Promise(r => setTimeout(r, 300));

// 5) export HTML depuis l'app -> fichier -> pixels identiques dans l'export
await page.evaluate(() => {
  window.__captured = null;
  const orig = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (blob) => { window.__captured = blob; return orig(blob); };
});
const menuBtns = await page.$$('#menubar button');
for (const b of menuBtns) {
  const t = await b.evaluate(el => el.textContent);
  if (t && t.includes('Fichier')) { await b.click(); break; }
}
await new Promise(r => setTimeout(r, 300));
const clicked = await page.evaluate(() => {
  const items = [...document.querySelectorAll('.menu-item, .menu-panel button, [class*="menu"] button, [class*="menu"] div')];
  const it = items.find(el => el.textContent && el.textContent.includes('Exporter HTML'));
  if (!it) return false;
  it.click();
  return true;
});
ok(clicked, 'menu Fichier > Exporter HTML cliqué');
await new Promise(r => setTimeout(r, 800));
const htmlBytes = await page.evaluate(async () => {
  if (!window.__captured) return null;
  const ab = await window.__captured.arrayBuffer();
  return Array.from(new Uint8Array(ab));
});
ok(!!htmlBytes, 'blob HTML exporté capturé');
if (htmlBytes) {
  writeFileSync('/tmp/e2e/export-mask.html', Buffer.from(htmlBytes));
  const page2 = await browser.newPage();
  const errs2 = [];
  page2.on('pageerror', (e) => errs2.push(String(e)));
  await page2.goto('file:///tmp/e2e/export-mask.html', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 700));
  const px2 = await page2.evaluate(() => {
    const cv = document.querySelector('canvas');
    if (!cv) return null;
    const ctx = cv.getContext('2d');
    const pr = cv.width / 550;
    const read = (x, y) => Array.from(ctx.getImageData(Math.round(x * pr), Math.round(y * pr), 1, 1).data);
    return { in: read(275, 200), out: read(100, 200) };
  });
  ok(!!px2 && isRed(px2.in), `export HTML: centre du masque = rouge ${px2 && JSON.stringify(px2.in)}`);
  ok(!!px2 && isWhite(px2.out), `export HTML: hors masque = blanc rogné ${px2 && JSON.stringify(px2.out)}`);
  ok(errs2.length === 0, 'export HTML: 0 pageerror' + (errs2.length ? ' -> ' + errs2.join('|') : ''));
  await page2.close();
}

ok(pageErrors.length === 0, 'éditeur: 0 pageerror' + (pageErrors.length ? ' -> ' + pageErrors.join(' | ') : ''));

await browser.close();
console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
