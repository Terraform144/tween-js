// E2E grille + snap + règles/guides — preuve de bout en bout.
// 1) bouton grille -> lignes dans l'overlay ; 2) snap ON + rect dessiné à la
// souris en (103,97)->(167,163) -> centre snappé (140,130) ; 3) règles visibles
// avec graduations ; 4) drag depuis la règle haute -> guide horizontal posé
// (vérifié via le JSON exporté). 0 pageerror.
// Run: node _wrk_mistral_mem/repro_e2e_grid.mjs  (vite preview :4180)
import { createRequire } from 'module';
const require = createRequire('/tmp/e2e/');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const URL = 'http://127.0.0.1:4180/';

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };

const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('.tl-toolbar');
await new Promise(r => setTimeout(r, 400));

// 1) activer la grille
await page.click('button[title="Afficher/masquer la grille de la scène"]');
await new Promise(r => setTimeout(r, 300));
const gridInfo = await page.evaluate(() => {
  const overlay = Konva.stages[0].children[3];
  const g = overlay.children.find(c => c.getType() === 'Group' && c.listening() === false && c.children.length > 20);
  return { lines: g ? g.children.length : 0 };
});
ok(gridInfo.lines >= 90, `grille rendue: ${gridInfo.lines} lignes (doc 550x400 @10px -> 97)`);

// 2) snap ON + dessin d'un rect à la souris (positions non alignées)
await page.click('button[title="Aimanter (snap) les déplacements sur la grille"]');
await page.click('button[title="Rectangle (R)"]');
const pt = await page.evaluate(() => {
  const st = Konva.stages[0];
  const r = st.container().getBoundingClientRect();
  const s = st.scaleX();
  return { x1: r.left + 103 * s, y1: r.top + 97 * s, x2: r.left + 167 * s, y2: r.top + 163 * s };
});
await page.mouse.move(pt.x1, pt.y1);
await page.mouse.down();
await page.mouse.move(pt.x2, pt.y2, { steps: 5 });
await page.mouse.up();
await new Promise(r => setTimeout(r, 300));
const rectPos = await page.evaluate(() => {
  for (const l of Konva.stages[0].children) {
    const r = l.find('Rect').find(n => n.getAttr && n.getAttr('elKind'));
    if (r) return { x: r.x(), y: r.y() };
  }
  return null;
});
ok(rectPos && rectPos.x % 10 === 0 && rectPos.y === 130, `rect snappé au multiple de 10: ${JSON.stringify(rectPos)}`);

// 3) règles visibles avec graduations dessinées
const rulerInfo = await page.evaluate(() => {
  const h = document.getElementById('ruler-h');
  if (!h || h.style.display === 'none') return { visible: false };
  const cv = h.querySelector('canvas');
  const ctx = cv.getContext('2d');
  let dark = 0;
  const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
  for (let i = 0; i < d.length; i += 4) if (d[i] < 200) dark++;
  return { visible: true, darkPixels: dark };
});
ok(rulerInfo.visible && rulerInfo.darkPixels > 20, `règle horizontale visible avec graduations (${rulerInfo.darkPixels} px foncés)`);

// 4) tirer un guide horizontal depuis la règle haute (drag vertical)
await page.evaluate(() => {
  window.__cap = null;
  const orig = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (blob) => { window.__cap = blob; return orig(blob); };
});
const rh = await page.evaluate(() => {
  const r = document.getElementById('ruler-h').getBoundingClientRect();
  return { x: r.left + 200, y: r.top + 8 };
});
await page.mouse.move(rh.x, rh.y);
await page.mouse.down();
await page.mouse.move(rh.x, rh.y + 150, { steps: 5 });
await page.mouse.up();
await new Promise(r => setTimeout(r, 300));
// export JSON pour lire doc.guides
const menuBtns = await page.$$('#menubar button');
for (const b of menuBtns) {
  const t = await b.evaluate(el => el.textContent);
  if (t && t.includes('Fichier')) { await b.click(); break; }
}
await new Promise(r => setTimeout(r, 300));
await page.evaluate(() => {
  const items = [...document.querySelectorAll('[class*="menu"] *')];
  const it = items.find(el => el.children.length === 0 && el.textContent && el.textContent.includes('Enregistrer JSON'));
  if (it) it.click();
});
await new Promise(r => setTimeout(r, 500));
const docJson = await page.evaluate(async () => window.__cap ? JSON.parse(await window.__cap.text()) : null);
ok(docJson && docJson.guides && docJson.guides.h && docJson.guides.h.length === 1, `guide horizontal posé depuis la règle: ${docJson && docJson.guides && JSON.stringify(docJson.guides.h)}`);
const guideY = docJson && docJson.guides && docJson.guides.h[0];
ok(typeof guideY === 'number' && guideY > 50 && guideY < 250, `guide à y=${guideY} (attendu ~150)`);

// le guide est rendu dans l'overlay
const guideLines = await page.evaluate(() => {
  const overlay = Konva.stages[0].children[3];
  let n = 0;
  for (const g of overlay.children) if (g.getType() === 'Group' && g.children.length > 0 && g.children.every(c => c.getAttr('dash') || c.dash())) n += g.children.length;
  return n;
});
ok(guideLines >= 1, `guide rendu en overlay (${guideLines} ligne(s) dash)`);

ok(pageErrors.length === 0, '0 pageerror' + (pageErrors.length ? ' -> ' + pageErrors.join(' | ') : ''));
await browser.close();
console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
