// E2E motion guide — preuve de bout en bout (éditeur + lecture + export HTML).
// Doc : calque 'guidé' (guided) rect 20x20 rouge à (100,200), tween linéaire
// kf0->kf4 ; calque 'guide' (guide) path Bézier (100,100) cOut(0,-100) ->
// (400,100) cIn(0,-100). À frame 2 (t=0.5) le rect doit être au sommet de la
// courbe (~250, ~25). En lecture le guide n'est pas rendu. Export HTML : le
// rect passe par le sommet, et le sommet n'est PAS noir en continu (guide
// non rendu). 0 pageerror.
// Run: node _wrk_mistral_mem/repro_e2e_guide.mjs  (vite preview :4180)
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { createDocument, createLayer, createShape, createPathPoint, insertKeyframe } from '../src/core/model.js';

const require = createRequire('/tmp/e2e/');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const URL = 'http://127.0.0.1:4180/';

const doc = createDocument({ name: 'GuideTest' });
const guidé = doc.layers[0];
guidé.name = 'guidé'; guidé.guided = true;
guidé.keyframes[0].elements = [createShape('rect', { x: 100, y: 200, width: 20, height: 20, fill: '#ff0000', stroke: '#000000', strokeWidth: 1 })];
guidé.keyframes[0].tween = { easing: 'linear' };
insertKeyframe(guidé, 4);
const guide = createLayer('guide');
guide.guide = true;
doc.layers.push(guide);
guide.keyframes[0].elements = [createShape('path', {
  x: 0, y: 0, closed: false, fill: undefined, stroke: '#000000', strokeWidth: 2,
  points: [createPathPoint(100, 100, { cOut: { x: 0, y: -100 } }), createPathPoint(400, 100, { cIn: { x: 0, y: -100 } })],
})];
writeFileSync('/tmp/e2e/guide-test.json', JSON.stringify(doc));

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
await input.uploadFile('/tmp/e2e/guide-test.json');
await new Promise(r => setTimeout(r, 500));

const findRect = () => page.evaluate(() => {
  for (const l of Konva.stages[0].children) {
    const r = l.find('Rect').find(n => n.fill && n.fill() === '#ff0000');
    if (r) return { x: r.x(), y: r.y() };
  }
  return null;
});
const countPaths = () => page.evaluate(() => {
  let n = 0;
  for (const l of Konva.stages[0].children) {
    for (const s of l.find('Shape')) if (s.getAttr('elKind') && s.getAttr('elShapeType') === 'path') n++;
  }
  return n;
});

// frame 2 (t = 0.5) : le rect doit être au sommet de la courbe (~250, ~25)
const cells = await page.$$('.tl-ruler .cell');
await cells[2].click();
await new Promise(r => setTimeout(r, 300));
const rect = await findRect();
ok(!!rect && Math.abs(rect.x - 250) < 20 && rect.y < 60 && rect.y > 0, `frame 2: rect au sommet de la courbe ~ (250,25), got (${rect && rect.x},${rect && rect.y})`);
ok(await countPaths() >= 1, 'édition: le guide (path) est rendu');

// lecture : le guide n'est plus rendu
await page.click('button[title="Lecture / Pause (Entrée)"]');
await new Promise(r => setTimeout(r, 500));
const frameInfo = await page.evaluate(() => document.querySelector('.frame-info').textContent);
const pathsDuringPlay = await countPaths();
console.log('  frameInfo pendant lecture:', frameInfo, '| paths:', pathsDuringPlay);
ok(pathsDuringPlay === 0, `lecture: aucun path de guide rendu, got ${pathsDuringPlay}`);
await page.click('button[title="Arrêter la lecture"]');
await new Promise(r => setTimeout(r, 200));

// export HTML à frame 2 -> le rect suit la courbe, le guide n'est pas peint
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
await page.evaluate(() => {
  const items = [...document.querySelectorAll('[class*="menu"] *')];
  const it = items.find(el => el.children.length === 0 && el.textContent && el.textContent.includes('Exporter HTML'));
  if (it) it.click();
});
await new Promise(r => setTimeout(r, 800));
const htmlBytes = await page.evaluate(async () => {
  if (!window.__captured) return null;
  return Array.from(new Uint8Array(await window.__captured.arrayBuffer()));
});
ok(!!htmlBytes, 'export HTML capturé');
if (htmlBytes) {
  writeFileSync('/tmp/e2e/export-guide.html', Buffer.from(htmlBytes));
  const page2 = await browser.newPage();
  const errs2 = [];
  page2.on('pageerror', (e) => errs2.push(String(e)));
  await page2.goto('file:///tmp/e2e/export-guide.html', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 300));
  // échantillonne le pixel du sommet (250,25) pendant 1.2s : on doit voir du
  // rouge (le rect passe dessus) ET du blanc (le guide n'est pas peint en continu)
  const samples = await page2.evaluate(async () => {
    const cv = document.querySelector('canvas');
    const ctx = cv.getContext('2d');
    const pr = cv.width / 550;
    const read = (x, y) => Array.from(ctx.getImageData(Math.round(x * pr), Math.round(y * pr), 1, 1).data);
    const seen = { red: 0, white: 0, black: 0, other: 0 };
    for (let i = 0; i < 40; i++) {
      const p = read(250, 25);
      if (p[0] > 200 && p[1] < 60) seen.red++;
      else if (p[0] > 240 && p[1] > 240 && p[2] > 240) seen.white++;
      else if (p[0] < 40 && p[1] < 40 && p[2] < 40) seen.black++;
      else seen.other++;
      await new Promise(r => setTimeout(r, 30));
    }
    return seen;
  });
  ok(samples.red > 0, `export: le rect passe par le sommet de la courbe (rouge vu ${samples.red}x)`);
  ok(samples.black === 0, `export: le guide n'est jamais peint en noir continu (noir vu ${samples.black}x)`);
  ok(errs2.length === 0, 'export: 0 pageerror' + (errs2.length ? ' -> ' + errs2.join('|') : ''));
  await page2.close();
}

ok(pageErrors.length === 0, 'éditeur: 0 pageerror' + (pageErrors.length ? ' -> ' + pageErrors.join(' | ') : ''));
await browser.close();
console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
