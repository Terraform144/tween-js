// E2E édition à travers la caméra : toggle ON -> contentLayer subit la caméra
// même hors lecture ; OFF -> identité. Le dessin (clic) reste en coordonnées doc.
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
await input.uploadFile(HERE + 'doc-parallax-e2e.json'); // doc avec caméra zoom 2 à f0
await new Promise(r => setTimeout(r, 600));
const contentScale = () => page.evaluate(() => {
  const cl = Konva.stages[0].getLayers().find(l => l.zIndex() === 2);
  const g = cl.children.find(c => c.id && c.id() === 'lg_l1');
  return g ? g.scaleX() : cl.scaleX();
});
// hors lecture, sans toggle : identité
ok(Math.abs(await contentScale() - 1) < 0.01, `hors lecture sans toggle: contentLayer identité (scaleX=${await contentScale()})`);
// activer le toggle via le bouton cam-view
await page.click('.cam-view');
await new Promise(r => setTimeout(r, 400));
ok(Math.abs(await contentScale() - 2) < 0.01, `toggle ON: contentLayer subit la caméra hors lecture (scaleX=${await contentScale()})`);
// dessiner un rect avec l'outil R : les coordonnées doivent rester en doc (le nœud créé à la position scène visée)
await page.keyboard.press('r');
await new Promise(r => setTimeout(r, 150));
const toScreen = (sx, sy) => page.evaluate(([sx, sy]) => {
  const st = Konva.stages[0];
  const r = st.container().getBoundingClientRect();
  // scène -> écran via le transform absolu du contentLayer (qui inclut la caméra)
  const cl = st.getLayers().find(l => l.zIndex() === 2);
  const pt = cl.getAbsoluteTransform().copy().point({ x: sx, y: sy });
  return { x: r.left + pt.x, y: r.top + pt.y };
}, [sx, sy]);
const p = await toScreen(400, 300);
await page.mouse.move(p.x, p.y);
await page.mouse.down();
const p2 = await toScreen(450, 350);
await page.mouse.move(p2.x, p2.y, { steps: 5 });
await page.mouse.up();
await new Promise(r => setTimeout(r, 300));
const rect = await page.evaluate(() => {
  let f = null;
  const walk = (n) => { if (!f && n.getAttr && n.getAttr('elShapeType') === 'rect') f = n; if (n.getChildren) n.getChildren().forEach(walk); };
  walk(Konva.stages[0]);
  return f ? { x: f.x(), y: f.y(), w: f.width(), h: f.height() } : null;
});
ok(rect && Math.abs(rect.x - 400) < 3 && Math.abs(rect.y - 300) < 3 && rect.w > 30, `rect créé en coordonnées document (départ 400,300, taille ~50) -> (${rect && rect.x},${rect && rect.y}) ${rect && rect.w}x${rect && rect.h}`);
// toggle OFF
await page.click('.cam-view');
await new Promise(r => setTimeout(r, 400));
ok(Math.abs(await contentScale() - 1) < 0.01, `toggle OFF: retour identité (scaleX=${await contentScale()})`);
ok(pageErrors.length === 0, '0 pageerror' + (pageErrors.length ? ' : ' + pageErrors.join(' | ') : ''));
console.log(`\n${pass} OK, ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
