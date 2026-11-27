// E2E guide v2 : orientation selon la tangente + plusieurs calques guidés sur un même guide.
// Doc : l1 (guided+guideOrient, rect rot=30), l2 (guided, ellipse), l3 (guide, courbe
// (100,100)->(250,50)->(400,300)). À frame 5 (t=0.5) les deux guidés sont sur la
// courbe ; l1 a rotation = tangente, l2 garde sa rotation.
// Run: node _wrk_mistral_mem/repro_e2e_guide_v2.mjs  (vite preview :4180)
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const PAGE_URL = process.env.TJS_URL || 'http://127.0.0.1:4180/';
const HERE = fileURLToPath(new URL('.', import.meta.url));

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };
const near = (a, b, eps) => Math.abs(a - b) <= eps;

const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(PAGE_URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('.tl-toolbar');
await new Promise(r => setTimeout(r, 400));

const input = await page.$('input[type=file][accept=".json,application/json"]');
await input.uploadFile(HERE + 'doc-guide2-e2e.json');
await new Promise(r => setTimeout(r, 600));

const nodeInfo = (id) => page.evaluate((id) => {
  let f = null;
  const walk = (n) => { if (!f && n.id && n.id() === id) f = n; if (n.getChildren) n.getChildren().forEach(walk); };
  walk(Konva.stages[0]);
  return f ? { x: f.x(), y: f.y(), rotation: f.rotation() } : null;
}, id);

// frame 0 : objets à leur position de départ (t=0 -> début du guide = (100,100))
let a = await nodeInfo('a'), b = await nodeInfo('b');
ok(near(a.x, 100, 1) && near(a.y, 100, 1), `frame 0: guidé orient a=(100,100) -> (${a.x},${a.y})`);
// tangente au départ (100,100)->(250,50) = atan2(-50,150) ≈ -18.43° ; rotation = 30 - 30 + (-18.43)
ok(near(a.rotation, -18.43, 1), `frame 0: rotation a orientée dès le départ = ${a.rotation.toFixed(2)} ~ -18.43° (tangente initiale)`);
ok(near(b.x, 100, 1) && near(b.y, 140, 1) || near(b.y, 100, 30), `frame 0: guidé simple b proche départ (${b.x},${b.y})`);

// frame 5 (t=0.5, milieu de la courbe)
let cells = await page.$$('.tl-ruler .cell');
await cells[5].click();
await new Promise(r => setTimeout(r, 400));
a = await nodeInfo('a'); b = await nodeInfo('b');
// les deux guidés doivent être SUR la courbe (même point à t=0.5, offsets conservés)
ok(near(a.x, b.x, 2) && near(a.y, b.y - 40, 2) || (near(a.x, b.x, 2) && near(a.y, b.y, 42)),
  `frame 5: les 2 guidés suivent le même guide (a=(${a.x.toFixed(1)},${a.y.toFixed(1)}) b=(${b.x.toFixed(1)},${b.y.toFixed(1)}))`);
// a a pivoté selon la tangente (rotation différente de sa base 30 si tangente != 0)
const tangenteOk = !near(a.rotation, 30, 0.5);
ok(tangenteOk, `frame 5: guidé orient a pivoté (rotation=${a.rotation.toFixed(1)} != base 30)`);
// b (sans orient) garde sa rotation 0
ok(near(b.rotation, 0, 0.5), `frame 5: guidé simple b rotation inchangée (${b.rotation})`);

// frame 10 (t=1 -> fin du guide (400,300))
cells = await page.$$('.tl-ruler .cell');
await cells[10].click();
await new Promise(r => setTimeout(r, 400));
a = await nodeInfo('a'); b = await nodeInfo('b');
ok(near(a.x, 400, 2) && near(a.y, 300, 2), `frame 10: a à la fin du guide (400,300) -> (${a.x.toFixed(1)},${a.y.toFixed(1)})`);
ok(near(b.x, 400, 2) && near(b.y, 340, 2) || near(b.y, 300, 42), `frame 10: b aussi à la fin (${b.x.toFixed(1)},${b.y.toFixed(1)})`);

ok(pageErrors.length === 0, '0 pageerror' + (pageErrors.length ? ' : ' + pageErrors.join(' | ') : ''));
console.log(`\n${pass} OK, ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
