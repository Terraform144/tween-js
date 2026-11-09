// E2E : après un trait au pinceau, le panneau #properties-panel ne montre PLUS
// la forme tracée (selectedElementIds vidé + notify -> propertiesCtl.update).
// Scénario : rect sélectionné d'abord, puis pinceau (B), trait -> panneau vide.
// Run: node _wrk_mistral_mem/repro_e2e_brush_panel.mjs  (vite preview :4180)
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

const toScreen = (sx, sy) => page.evaluate(([sx, sy]) => {
  const st = Konva.stages[0];
  const r = st.container().getBoundingClientRect();
  const s = st.scaleX();
  return { x: r.left + sx * s, y: r.top + sy * s };
}, [sx, sy]);
const panelInfo = () => page.evaluate(() => {
  const p = document.querySelector('#properties-panel');
  const t = Konva.stages[0].find('Transformer')[0];
  return {
    text: p ? p.textContent.replace(/\s+/g, ' ').trim().slice(0, 150) : '(vide)',
    inputs: p ? p.querySelectorAll('input, select, textarea').length : -1,
    transformerNodes: t ? t.nodes().length : -1,
  };
});
async function stroke(pts) {
  const screen = [];
  for (const p of pts) screen.push(await toScreen(p[0], p[1]));
  await page.mouse.move(screen[0].x, screen[0].y);
  await page.mouse.down();
  for (let i = 1; i < screen.length; i++) await page.mouse.move(screen[i].x, screen[i].y, { steps: 4 });
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 250));
}

// 1) dessiner un rect -> sélectionné, panneau montre la forme
await page.keyboard.press('r');
await new Promise(r => setTimeout(r, 150));
const a = await toScreen(400, 100), b = await toScreen(480, 160);
await page.mouse.move(a.x, a.y); await page.mouse.down();
await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up();
await new Promise(r => setTimeout(r, 250));
let p1 = await panelInfo();
console.log('  panneau après rect: ' + JSON.stringify(p1));
ok(p1.transformerNodes === 1, `rect sélectionné (transformer=${p1.transformerNodes})`);
ok(p1.inputs > 0, `panneau montre les champs de la forme (inputs=${p1.inputs})`);

// 2) pinceau + trait -> plus de sélection, panneau vidé
await page.keyboard.press('b');
await new Promise(r => setTimeout(r, 150));
await stroke([[100, 300], [150, 330], [200, 310], [250, 350]]);
let p2 = await panelInfo();
console.log('  panneau après trait pinceau: ' + JSON.stringify(p2));
ok(p2.transformerNodes === 0, `après trait : transformer=${p2.transformerNodes} nœud`);
ok(p2.inputs === 0, `après trait : panneau propriétés vidé (inputs=${p2.inputs})`);

ok(pageErrors.length === 0, `0 pageerror (${pageErrors.length})`);
if (pageErrors.length) console.log(pageErrors.join('\n'));
await browser.close();
console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
