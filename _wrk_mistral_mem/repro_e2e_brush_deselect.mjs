// E2E pinceau : après un trait, la forme n'est PAS sélectionnée (demande user).
// 1) outil pinceau (B) + trait à la souris -> 1 élément ajouté, Transformer à 0 nœud ;
// 2) 2e trait -> 2 éléments, toujours 0 nœud (on enchaîne sans être gêné) ;
// 3) non-régression : outil rectangle -> le rect EST sélectionné (Transformer 1 nœud).
// 0 pageerror.
// Run: node _wrk_mistral_mem/repro_e2e_brush_deselect.mjs  (vite preview :4180)
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

// helpers d'inspection via le Konva global exposé par la page
const countElements = () => page.evaluate(() => {
  let n = 0;
  const walk = (node) => {
    if (node.getAttr && node.getAttr('elKind')) n++;
    if (node.getChildren) node.getChildren().forEach(walk);
  };
  walk(Konva.stages[0]);
  return n;
});
const transformerNodes = () => page.evaluate(() => {
  const t = Konva.stages[0].find('Transformer')[0];
  return t ? t.nodes().length : -1;
});
const activeTool = () => page.evaluate(() => {
  const b = document.querySelector('.toolbar button.active, #toolbar button.active');
  return b ? b.title : null;
});
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

// 1) pinceau (raccourci B) + 1er trait
await page.keyboard.press('b');
await new Promise(r => setTimeout(r, 150));
console.log('  outil actif: ' + await activeTool());
await drawStroke([[100, 100], [140, 120], [180, 110], [220, 150]]);
let n = await countElements();
let t = await transformerNodes();
ok(n === 1, `trait 1 ajouté au doc (éléments=${n})`);
ok(t === 0, `après trait 1 : AUCUNE sélection, transformer à ${t} nœud`);

// 2) 2e trait enchaîné (outil toujours pinceau)
await drawStroke([[300, 200], [340, 230], [380, 210]]);
n = await countElements();
t = await transformerNodes();
ok(n === 2, `trait 2 ajouté (éléments=${n})`);
ok(t === 0, `après trait 2 : toujours aucune sélection, transformer à ${t} nœud`);

// 3) non-régression : un rectangle dessiné à la souris RESTE sélectionné
await page.keyboard.press('r');
await new Promise(r => setTimeout(r, 150));
const a = await toScreen(100, 250);
const b = await toScreen(180, 300);
await page.mouse.move(a.x, a.y);
await page.mouse.down();
await page.mouse.move(b.x, b.y, { steps: 5 });
await page.mouse.up();
await new Promise(r => setTimeout(r, 250));
t = await transformerNodes();
ok(t === 1, `non-régression : rect dessiné bien sélectionné (transformer=${t} nœud)`);

ok(pageErrors.length === 0, `0 pageerror (${pageErrors.length})`);
if (pageErrors.length) console.log(pageErrors.join('\n'));

await browser.close();
console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
