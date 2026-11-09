// E2E patterns pinceau : pour chacun des 5 nouveaux motifs (pencil, marker,
// airbrush, drybrush, chalk), on choisit le motif dans le select "Motif" du
// panneau Propriétés, on trace un trait à la souris -> 1 élément créé,
// aucune sélection (transformer 0 nœud). Non-régression round. 0 pageerror.
// Run: node _wrk_mistral_mem/repro_e2e_brush_patterns.mjs  (vite preview :4180)
import { createRequire } from 'module';
const require = createRequire('/tmp/e2e/');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const URL = process.env.TJS_URL || 'http://127.0.0.1:4180/';

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };

const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('.tl-toolbar');
await new Promise(r => setTimeout(r, 400));

const countElements = () => page.evaluate(() => {
  let n = 0;
  const walk = (node) => { if (node.getAttr && node.getAttr('elKind')) n++; if (node.getChildren) node.getChildren().forEach(walk); };
  walk(Konva.stages[0]);
  return n;
});
const transformerNodes = () => page.evaluate(() => {
  const t = Konva.stages[0].find('Transformer')[0];
  return t ? t.nodes().length : -1;
});
const motifOptions = () => page.evaluate(() => {
  const sels = [...document.querySelectorAll('#properties-panel select')];
  const s = sels.find(s => [...s.options].some(o => o.value === 'pencil'));
  return s ? [...s.options].map(o => o.value + '=' + o.textContent) : [];
});
const setMotif = (v) => page.evaluate((v) => {
  const sels = [...document.querySelectorAll('#properties-panel select')];
  const s = sels.find(s => [...s.options].some(o => o.value === v));
  if (!s) return false;
  s.value = v;
  s.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}, v);
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
  await new Promise(r => setTimeout(r, 250));
}

await page.keyboard.press('b');
await new Promise(r => setTimeout(r, 150));
const opts = await motifOptions();
console.log('  motifs proposés: ' + opts.join(', '));
ok(opts.length === 9, `9 motifs dans le select (${opts.length})`);

let y = 60;
for (const motif of ['pencil', 'marker', 'airbrush', 'drybrush', 'chalk', 'round']) {
  ok(await setMotif(motif), `motif "${motif}" sélectionné dans le panneau`);
  const before = await countElements();
  await drawStroke([[80, y], [130, y + 20], [190, y - 8], [250, y + 22]]);
  y += 42;
  const after = await countElements();
  const t = await transformerNodes();
  ok(after === before + 1, `${motif}: trait ajouté (${before} -> ${after})`);
  ok(t === 0, `${motif}: aucune sélection après le trait (transformer=${t})`);
}

ok(pageErrors.length === 0, `0 pageerror (${pageErrors.length})`);
if (pageErrors.length) console.log(pageErrors.join('\n'));
await browser.close();
console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
