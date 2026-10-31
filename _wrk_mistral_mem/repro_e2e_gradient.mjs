// E2E dégradés — preuve de bout en bout (éditeur + propriétés + export HTML).
// Doc : rect 40x40 à (100,100) avec fillGradient linéaire horizontal
// rouge->bleu. 1) pixels: gauche du rect ~rouge, droite ~bleu ; 2) panneau
// propriétés: select "Dégradé" = linear + 2 stops (uniquement là, pas dans la
// toolbar) ; 3) switch radial via le select -> le centre devient la couleur du
// centre ; 4) export HTML -> mêmes pixels en dégradé. 0 pageerror.
// Run: node _wrk_mistral_mem/repro_e2e_gradient.mjs  (vite preview :4180)
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { createDocument, createShape } from '../src/core/model.js';

const require = createRequire('/tmp/e2e/');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const URL = 'http://127.0.0.1:4180/';

const doc = createDocument({ name: 'GradTest' });
const rect = createShape('rect', { x: 100, y: 100, width: 40, height: 40, fill: '#ff0000', stroke: '#000000', strokeWidth: 1 });
rect.fillGradient = { type: 'linear', x1: 0, y1: 0, x2: 1, y2: 0, stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }] };
doc.layers[0].keyframes[0].elements = [rect];
writeFileSync('/tmp/e2e/grad-test.json', JSON.stringify(doc));

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
await input.uploadFile('/tmp/e2e/grad-test.json');
await new Promise(r => setTimeout(r, 500));

const px = (x, y) => page.evaluate((x, y) => {
  const st = Konva.stages[0];
  const cv = st.children[2].canvas._canvas;
  const pr = cv.width / st.width();
  const d = cv.getContext('2d').getImageData(Math.round(x * st.scaleX() * pr), Math.round(y * st.scaleX() * pr), 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}, x, y);

// 1) pixels du dégradé linéaire horizontal (rect couvre x 80..120)
const pL = await px(84, 100);
const pR = await px(116, 100);
ok(pL[0] > 200 && pL[2] < 60, `gauche du rect ~rouge ${JSON.stringify(pL)}`);
ok(pR[2] > 200 && pR[0] < 60, `droite du rect ~bleu ${JSON.stringify(pR)}`);
const pMid = await px(100, 100);
ok(pMid[0] > 60 && pMid[2] > 60, `milieu = mélange ${JSON.stringify(pMid)}`);

// 2) panneau propriétés : section Dégradé présente, PAS dans la toolbar
const ui = await page.evaluate(() => {
  // sélectionner le rect (clic au centre)
  return null;
});
const st = await page.evaluate(() => {
  const s = Konva.stages[0];
  const r = s.container().getBoundingClientRect();
  return { x: r.left + 100 * s.scaleX(), y: r.top + 100 * s.scaleX() };
});
await page.mouse.click(st.x, st.y);
await new Promise(r => setTimeout(r, 300));
const panel = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.prop-row')];
  const gradRow = rows.find(r => r.querySelector('label') && r.querySelector('label').textContent === 'Dégradé');
  const stops = rows.filter(r => /^Stop \d+$/.test(r.querySelector('label') ? r.querySelector('label').textContent : ''));
  const toolbarHasGrad = !!document.querySelector('.tool-color-row select, #toolbar select');
  return {
    hasGradRow: !!gradRow,
    selectValue: gradRow && gradRow.querySelector('select') ? gradRow.querySelector('select').value : null,
    nbStops: stops.length,
    toolbarHasGrad,
  };
});
ok(panel.hasGradRow && panel.selectValue === 'linear', `panneau: select Dégradé = linear (${panel.selectValue})`);
ok(panel.nbStops === 2, `2 stops éditables (${panel.nbStops})`);
ok(!panel.toolbarHasGrad, 'PAS de sélecteur dégradé dans la barre latérale gauche');

// 3) switch radial via le select -> centre = couleur du centre (rouge), coin = bleu
await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.prop-row')];
  const gradRow = rows.find(r => r.querySelector('label') && r.querySelector('label').textContent === 'Dégradé');
  const sel = gradRow.querySelector('select');
  sel.value = 'radial';
  sel.dispatchEvent(new Event('change'));
});
await new Promise(r => setTimeout(r, 300));
const pC = await px(100, 100);
const pEdge = await px(114, 100); // à 14px du centre, dans le disque radial (r=20)
ok(pC[0] > 200 && pC[2] < 60, `radial: centre ~rouge ${JSON.stringify(pC)}`);
ok(pEdge[0] > 40 && pEdge[2] > 40, `radial: bord du disque = mélange ${JSON.stringify(pEdge)}`);

// 4) export HTML -> dégradé présent dans l'export (remet linear d'abord)
await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.prop-row')];
  const gradRow = rows.find(r => r.querySelector('label') && r.querySelector('label').textContent === 'Dégradé');
  const sel = gradRow.querySelector('select');
  sel.value = 'linear';
  sel.dispatchEvent(new Event('change'));
});
await new Promise(r => setTimeout(r, 200));
await page.evaluate(() => {
  window.__cap = null;
  const orig = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (blob) => { window.__cap = blob; return orig(blob); };
});
const menuBtns = await page.$$('#menubar button');
for (const b of menuBtns) {
  const t = await b.evaluate(el => el.textContent);
  if (t && t.includes('Fichier')) { await b.click(); break; }
}
await new Promise(r => setTimeout(r, 300));
await page.evaluate(() => {
  const items = [...document.querySelectorAll('[class*="menu"] *')];
  const it = items.find(el => el.children.length === 0 && el.textContent && el.textContent.includes('Exporter HTML'));
  if (it) it.click();
});
await new Promise(r => setTimeout(r, 800));
const htmlBytes = await page.evaluate(async () => window.__cap ? Array.from(new Uint8Array(await window.__cap.arrayBuffer())) : null);
ok(!!htmlBytes, 'export HTML capturé');
if (htmlBytes) {
  writeFileSync('/tmp/e2e/export-grad.html', Buffer.from(htmlBytes));
  const page2 = await browser.newPage();
  const errs2 = [];
  page2.on('pageerror', (e) => errs2.push(String(e)));
  await page2.goto('file:///tmp/e2e/export-grad.html', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 600));
  const px2 = await page2.evaluate(() => {
    const cv = document.querySelector('canvas');
    const ctx = cv.getContext('2d');
    const pr = cv.width / 550;
    const read = (x, y) => Array.from(ctx.getImageData(Math.round(x * pr), Math.round(y * pr), 1, 1).data);
    return { left: read(84, 100), right: read(116, 100) };
  });
  ok(px2.left[0] > 200 && px2.left[2] < 60, `export: gauche ~rouge ${JSON.stringify(px2.left)}`);
  ok(px2.right[2] > 200 && px2.right[0] < 60, `export: droite ~bleu ${JSON.stringify(px2.right)}`);
  ok(errs2.length === 0, 'export: 0 pageerror');
  await page2.close();
}

ok(pageErrors.length === 0, 'éditeur: 0 pageerror' + (pageErrors.length ? ' -> ' + pageErrors.join(' | ') : ''));
await browser.close();
console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
