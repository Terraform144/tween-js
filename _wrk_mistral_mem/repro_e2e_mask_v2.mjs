// E2E masque v2 : imbrication (mask+masked) + masque animé (tween sur le masque).
// Doc : Contenu (masked, grand rect rouge) sous MaskInterne (mask+masked, petit
// rect qui tween de (275,200) à (350,200) entre f0 et f10) sous MaskExterne
// (mask, rect 120x120 centré en 275,200).
// Attendu frame 0 : pixel (275,200) = rouge (dans A et B), (330,200) = transparent (hors B).
// Attendu frame 10 : pixel (330,200) = rouge (dans A et B déplacé), (275,200) = transparent.
// Run: node _wrk_mistral_mem/repro_e2e_mask_v2.mjs  (vite preview :4180)
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

const input = await page.$('input[type=file][accept=".json,application/json"]');
await input.uploadFile(HERE + 'doc-mask2-e2e.json');
await new Promise(r => setTimeout(r, 600));
// sélectionner le calque Contenu (l1) : sinon le calque masque sélectionné
// serait rendu visible (noir) par-dessus le contenu masqué
await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.tl-layer-row')];
  const row = rows.find(r => r.textContent && r.textContent.includes('Contenu'));
  if (row) row.click();
});
await new Promise(r => setTimeout(r, 300));

// lit un pixel du canvas Konva (coordonnées scène -> pixels canvas)
const px = (sx, sy) => page.evaluate(([sx, sy]) => {
  const st = Konva.stages[0];
  const cv = st.toCanvas();
  const ctx = cv.getContext('2d');
  const d = ctx.getImageData(Math.round(sx), Math.round(sy), 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}, [sx, sy]);
const isRed = (p) => p[0] > 200 && p[1] < 80 && p[2] < 80 && p[3] > 200;
const isTransparent = (p) => p[3] < 30;

// frame 0 (par défaut après chargement)
await new Promise(r => setTimeout(r, 300));
let p = await px(275, 200);
ok(isRed(p), `frame 0: centre (275,200) rouge (dans A et B) — rgba=${p}`);
p = await px(330, 200);
ok(isTransparent(p) || !isRed(p), `frame 0: (330,200) hors masque interne — rgba=${p}`);
p = await px(230, 200);
ok(isTransparent(p) || !isRed(p), `frame 0: (230,200) dans A mais hors B (B=245..305) — rgba=${p}`);

// aller à la frame 10 via la règle de timeline (re-querry : le re-render détache les nœuds)
let cells = await page.$$('.tl-ruler .cell');
await cells[10].click();
await new Promise(r => setTimeout(r, 400));
p = await px(330, 200);
ok(isRed(p), `frame 10: (330,200) rouge (B déplacé à 350±30, dans A) — rgba=${p}`);
p = await px(275, 200);
ok(!isRed(p), `frame 10: (275,200) plus rouge (hors B déplacé) — rgba=${p}`);

// retour frame 0
cells = await page.$$('.tl-ruler .cell');
await cells[0].click();
await new Promise(r => setTimeout(r, 400));
p = await px(275, 200);
ok(isRed(p), `retour frame 0: centre rouge à nouveau — rgba=${p}`);

ok(pageErrors.length === 0, '0 pageerror' + (pageErrors.length ? ' : ' + pageErrors.join(' | ') : ''));
console.log(`\n${pass} OK, ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
