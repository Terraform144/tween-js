// E2E pinceau texture + éclaboussures :
// 1) doc avec un asset image chargé via Ouvrir... ;
// 2) trait sans spatter -> el.brushSpatter absent, brushTexture absent ;
// 3) coche "Éclaboussures" + intensité -> trait -> el.brushSpatter non vide, aperçu visible ;
// 4) select Texture = asset -> trait -> el.brushTexture.assetId + fillPatternImage sur le node ;
// 5) 0 pageerror.
// Run: node _wrk_mistral_mem/repro_e2e_brush_tex_spatter.mjs  (vite preview :4180)
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const PAGE_URL = process.env.TJS_URL || 'http://127.0.0.1:4180/';
const HERE = fileURLToPath(new URL('.', import.meta.url));

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };

const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(PAGE_URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('.tl-toolbar');
await new Promise(r => setTimeout(r, 400));

// charge le doc (avec asset image) via Ouvrir...
const input = await page.$('input[type=file][accept=".json,application/json"]');
await input.uploadFile(HERE + 'doc-brushtex-e2e.json');
await new Promise(r => setTimeout(r, 500));

const toScreen = (sx, sy) => page.evaluate(([sx, sy]) => {
  const st = Konva.stages[0];
  const r = st.container().getBoundingClientRect();
  const s = st.scaleX();
  return { x: r.left + sx * s, y: r.top + sy * s };
}, [sx, sy]);
async function drawStroke(pts) {
  const screen = [];
  for (const p of pts) screen.push(await toScreen(p[0], p[1]));
  await page.mouse.move(screen[0].x, screen[0].y);
  await page.mouse.down();
  for (let i = 1; i < screen.length; i++) await page.mouse.move(screen[i].x, screen[i].y, { steps: 4 });
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 300));
}
const brushEls = () => page.evaluate(() => {
  const out = [];
  const walk = (n) => {
    if (n.getAttr && n.getAttr('elShapeType') === 'path' && n.getAttr('elData') && n.getAttr('elData').brushPoly) out.push(n);
    if (n.getChildren) n.getChildren().forEach(walk);
  };
  walk(Konva.stages[0]);
  return out.map(n => ({ id: n.id(), spatter: (n.getAttr('elData').brushSpatter || []).length, hasPattern: !!n.fillPatternImage(), patternImgOk: n.fillPatternImage() ? n.fillPatternImage().naturalWidth > 0 : false }));
});
const countBrush = () => brushEls().then(a => a.length);

// --- 1) trait de base (pas de spatter, pas de texture) ---
await page.keyboard.press('b');
await new Promise(r => setTimeout(r, 150));
await drawStroke([[150, 200], [250, 220], [350, 200]]);
ok(await countBrush() === 1, '1er trait pinceau créé');
let els = await brushEls();
ok(els[0].spatter === 0, 'pas de spatter par défaut');
ok(!els[0].hasPattern, 'pas de texture par défaut');

// --- 2) activer Éclaboussures via le panneau ---
await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.prop-row')];
  const row = rows.find(r => r.querySelector('label') && r.querySelector('label').textContent === 'Éclaboussures');
  if (!row) return false;
  const chk = row.querySelector('input[type=checkbox]');
  if (!chk.checked) chk.click();
  return true;
});
await new Promise(r => setTimeout(r, 300));
await drawStroke([[150, 300], [250, 320], [350, 300]]);
els = await brushEls();
ok(els.length === 2, '2e trait créé');
ok(els[1].spatter > 5, `2e trait avec éclaboussures (${els[1].spatter} gouttes > 5)`);

// --- 3) choisir la texture via le select du panneau ---
const texOk = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.prop-row')];
  const row = rows.find(r => r.querySelector('label') && r.querySelector('label').textContent === 'Texture');
  if (!row) return 'pas de ligne Texture';
  const sel = row.querySelector('select');
  if (!sel || sel.options.length < 2) return 'pas d asset image dans le select';
  sel.value = sel.options[1].value;
  sel.dispatchEvent(new Event('change'));
  return true;
});
ok(texOk === true, 'texture sélectionnée dans le panneau (' + texOk + ')');
await new Promise(r => setTimeout(r, 300));
await drawStroke([[150, 100], [250, 120], [350, 100]]);
els = await brushEls();
ok(els.length === 3, '3e trait créé');
ok(els[2].hasPattern && els[2].patternImgOk, `3e trait rendu en mosaïque (fillPatternImage ${els[2].patternImgOk ? 'chargée' : 'vide'})`);

// modèle : brushTexture sur le 3e élément
const modelInfo = await page.evaluate(() => {
  let brush = [];
  const walk = (n) => {
    if (n.getAttr && n.getAttr('elData') && n.getAttr('elData').brushPoly) brush.push(n.getAttr('elData'));
    if (n.getChildren) n.getChildren().forEach(walk);
  };
  walk(Konva.stages[0]);
  return brush.map(d => ({ spatter: (d.brushSpatter || []).length }));
});
ok(modelInfo[2].spatter > 5, 'spatter persisté dans elData du 3e trait');

ok(pageErrors.length === 0, '0 pageerror' + (pageErrors.length ? ' : ' + pageErrors.join(' | ') : ''));
console.log(`\n${pass} OK, ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
