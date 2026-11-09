// E2E pinceau : après un trait, selectedElementIds=[] ET le panneau Propriétés
// ne montre plus la forme ; un trait suivant qui CROISE la forme précédente ne
// la resélectionne pas (mousedown sur la forme avec l'outil pinceau).
// Run: node _wrk_mistral_mem/repro_e2e_brush_state.mjs  (vite preview :4180)
import { createRequire } from 'module';
const require = createRequire('/tmp/e2e/');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const URL = 'http://127.0.0.1:4180/';

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

const stateSel = () => page.evaluate(() => {
  // state n'est pas global ; on lit via le Transformer + le panneau Propriétés
  const t = Konva.stages[0].find('Transformer')[0];
  return { transformerNodes: t ? t.nodes().length : -1 };
});
const propsText = () => page.evaluate(() => {
  const p = document.querySelector('#properties, .properties-panel, #panel-properties, aside');
  return p ? p.textContent.replace(/\s+/g, ' ').slice(0, 120) : '(panneau introuvable)';
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

await page.keyboard.press('b');
await new Promise(r => setTimeout(r, 150));

// Trait 1
await drawStroke([[100, 100], [140, 120], [180, 110], [220, 150]]);
let s = await stateSel();
console.log('  panneau après trait 1: ' + JSON.stringify(await propsText()));
ok(s.transformerNodes === 0, `après trait 1 : transformer à ${s.transformerNodes} nœud`);

// Trait 2 qui CROISE le trait 1 (passe par-dessus la forme précédente)
await drawStroke([[110, 90], [150, 130], [210, 160], [240, 120]]);
s = await stateSel();
const n = await page.evaluate(() => {
  let c = 0;
  const walk = (node) => { if (node.getAttr && node.getAttr('elKind')) c++; if (node.getChildren) node.getChildren().forEach(walk); };
  walk(Konva.stages[0]);
  return c;
});
console.log('  panneau après trait 2: ' + JSON.stringify(await propsText()));
ok(n === 2, `2 traits dans le doc (éléments=${n})`);
ok(s.transformerNodes === 0, `trait croisant le précédent : toujours ${s.transformerNodes} nœud sélectionné`);

// Clic simple (tap) au pinceau sur la zone du trait 1 : ne doit pas sélectionner non plus
await drawStroke([[150, 115]]);
s = await stateSel();
ok(s.transformerNodes === 0, `tap au pinceau sur la forme : ${s.transformerNodes} nœud sélectionné`);

ok(pageErrors.length === 0, `0 pageerror (${pageErrors.length})`);
if (pageErrors.length) console.log(pageErrors.join('\n'));
await browser.close();
console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
