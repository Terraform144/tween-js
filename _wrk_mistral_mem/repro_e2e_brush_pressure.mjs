// E2E pression du pinceau : toggle "Pression (stylet)" + sensibilité 100 % dans
// le panneau, traits tracés via CDP Input.dispatchMouseEvent avec pressure
// imposée -> le trait à pressure 1.0 est nettement plus épais que celui à 0.05.
// Non-régression : toggle OFF -> trait souris = taille fixe (comme avant).
// 0 pageerror.
// Run: node _wrk_mistral_mem/repro_e2e_brush_pressure.mjs  (vite preview :4180)
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
const client = await page.createCDPSession();

const toScreen = (sx, sy) => page.evaluate(([sx, sy]) => {
  const st = Konva.stages[0];
  const r = st.container().getBoundingClientRect();
  const s = st.scaleX();
  return { x: r.left + sx * s, y: r.top + sy * s };
}, [sx, sy]);
const lastShapeHeight = () => page.evaluate(() => {
  const nodes = Konva.stages[0].find(n => n.getAttr && n.getAttr('elKind') === 'shape');
  if (!nodes.length) return -1;
  return nodes[nodes.length - 1].getClientRect().height;
});
const countShapes = () => page.evaluate(() =>
  Konva.stages[0].find(n => n.getAttr && n.getAttr('elKind') === 'shape').length);

// Stylet simulé : touch CDP avec force (0..1) -> PointerEvent.pressure côté navigateur
// (dispatchMouseEvent ignore pressure en headless : sonde probe_pressure.mjs)
async function cdpStroke(yScene, force) {
  const pts = [];
  for (let i = 0; i <= 10; i++) pts.push(await toScreen(100 + i * 20, yScene));
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0].x, y: pts[0].y, id: 1, force }] });
  for (let i = 1; i < pts.length; i++) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pts[i].x, y: pts[i].y, id: 1, force }] });
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await new Promise(r => setTimeout(r, 250));
}
async function setCheckbox(on) {
  await page.evaluate((on) => {
    const chk = document.querySelector('#properties-panel input[type=checkbox]');
    if (chk && chk.checked !== on) { chk.checked = on; chk.dispatchEvent(new Event('change', { bubbles: true })); }
  }, on);
  await new Promise(r => setTimeout(r, 150));
}
async function setSens(v) {
  await page.evaluate((v) => {
    const labels = [...document.querySelectorAll('#properties-panel label')];
    const l = labels.find(l => l.textContent.includes('Sensibilité'));
    if (!l) return;
    const inp = document.getElementById(l.htmlFor);
    inp.value = v;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }, v);
  await new Promise(r => setTimeout(r, 150));
}

// outil pinceau
await page.keyboard.press('b');
await new Promise(r => setTimeout(r, 150));

// activer la pression, sensibilité 100 %
await setCheckbox(true);
await setSens(100);
const sensVisible = await page.evaluate(() => {
  const labels = [...document.querySelectorAll('#properties-panel label')];
  return labels.some(l => l.textContent.includes('Sensibilité'));
});
ok(sensVisible, 'toggle Pression coché -> ligne Sensibilité visible');

// trait A : pressure 1.0 (plein) ; trait B : pressure 0.05 (léger)
await cdpStroke(100, 1.0);
const hA = await lastShapeHeight();
await cdpStroke(200, 0.05);
const hB = await lastShapeHeight();
console.log(`  hauteurs: pressure 1.0 -> ${hA.toFixed(1)} px, pressure 0.05 -> ${hB.toFixed(1)} px`);
ok(await countShapes() === 2, `2 traits créés (${await countShapes()})`);
ok(hA > 0 && hB > 0, 'deux traits rendus avec hauteur > 0');
ok(hA > hB * 3, `pression prise en compte : trait plein ${hA.toFixed(1)} px >> trait léger ${hB.toFixed(1)} px (ratio ${(hA / hB).toFixed(1)})`);

// non-régression : toggle OFF -> la souris (pressure 0.5) retombe sur la taille fixe
await setCheckbox(false);
const a = await toScreen(100, 300), b = await toScreen(300, 300);
await page.mouse.move(a.x, a.y); await page.mouse.down();
await page.mouse.move(b.x, b.y, { steps: 10 }); await page.mouse.up();
await new Promise(r => setTimeout(r, 250));
const hC = await lastShapeHeight();
console.log(`  hauteur toggle OFF (souris) -> ${hC.toFixed(1)} px`);
ok(hC > hB * 2, `toggle OFF : trait souris = taille fixe (${hC.toFixed(1)} px), bien plus épais que le trait léger (${hB.toFixed(1)} px)`);
ok(Math.abs(hC - hA) / hA < 0.6, `toggle OFF proche du trait pleine pression (${hC.toFixed(1)} vs ${hA.toFixed(1)})`);

ok(pageErrors.length === 0, `0 pageerror (${pageErrors.length})`);
if (pageErrors.length) console.log(pageErrors.join('\n'));
await browser.close();
console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
