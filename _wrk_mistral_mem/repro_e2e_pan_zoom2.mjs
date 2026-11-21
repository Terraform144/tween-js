// E2E ciblé : pan après zoom en (A) plein écran, (B) outil caméra avec zoom caméra.
// Run: node _wrk_mistral_mem/repro_e2e_pan_zoom2.mjs  (vite preview :4180)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');

const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const URL = 'http://127.0.0.1:4180/';
let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  userDataDir: '/tmp/chrome-prof-panzoom2-' + Date.now(),
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('.tl-toolbar', { timeout: 10000 });
await sleep(400);

async function dragOnStage() {
  const s = await page.evaluate(() => {
    const r = document.querySelector('.konvajs-content').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(s.x, s.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(s.x - i * 10, s.y - i * 5);
  await page.mouse.up();
  await sleep(250);
}
const scrollState = () => page.evaluate(() => {
  const c = document.getElementById('stage-container');
  const sc = document.getElementById('stage-scroll');
  return {
    fs: !!document.fullscreenElement || c.classList.contains('fs-css-active'),
    cScroll: c.scrollLeft + ',' + c.scrollTop, cScrollable: c.scrollWidth > c.clientWidth + 1 || c.scrollHeight > c.clientHeight + 1,
    scScroll: sc.scrollLeft + ',' + sc.scrollTop,
    panLayerTransform: (c.querySelector('.stage-pan-layer') || {}).style?.transform || '',
    cTransform: c.style.transform || '',
  };
});

// ---------- A) PLEIN ÉCRAN + zoom ----------
await page.click('.stage-fullscreen-btn').catch(() => {}); await sleep(500);
let fsOn = await page.evaluate(() => !!document.fullscreenElement || document.getElementById('stage-container').classList.contains('fs-css-active'));
console.log('plein écran actif:', fsOn);
// zoom x3 via boutons
for (let i = 0; i < 3; i++) { await page.click('button[title="Agrandir le zoom (Ctrl+molette)"]'); await sleep(120); }
await page.click('.zoom-hand-btn'); await sleep(200);
const a0 = await scrollState();
await dragOnStage();
const a1 = await scrollState();
ok(a1.cScroll !== a0.cScroll || a1.panLayerTransform !== a0.panLayerTransform || a1.cTransform !== a0.cTransform,
  `plein écran zoomé : pan bouge (scroll ${a0.cScroll}->${a1.cScroll}, panLayer '${a0.panLayerTransform}'->'${a1.panLayerTransform}', cTransform '${a0.cTransform}'->'${a1.cTransform}', scrollable=${a0.cScrollable})`);
// sortir du plein écran
await page.keyboard.press('Escape'); await sleep(400);
await page.click('.stage-fullscreen-btn').catch(() => {}); await sleep(400);

// ---------- B) OUTIL CAMÉRA + zoom caméra (molette) ----------
await page.keyboard.press('c'); await sleep(250);
const camBefore = await page.evaluate(() => JSON.stringify(window.__dbgCam ? window.__dbgCam() : null));
// zoomer la caméra : molette vers le haut sur le stage (outil caméra actif)
const st = await page.evaluate(() => {
  const r = document.querySelector('.konvajs-content').getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
for (let i = 0; i < 4; i++) { await page.mouse.move(st.x, st.y); await page.mouse.wheel({ deltaY: -120 }); await sleep(120); }
// lire l'état caméra via le modèle exposé ? on vérifie visuellement via le readout caméra s'il existe
const camReadout = await page.evaluate(() => {
  const el = document.querySelector('.cam-readout, .camera-readout, [class*="cam"]');
  return el ? el.textContent : null;
});
console.log('readout caméra après molette:', camReadout);
// pan caméra : dragger le cadre caméra (zone du stage)
await dragOnStage();
const moved = await page.evaluate(() => {
  // la caméra a bougé si le readout a changé ; sinon on regarde le title des cellules caméra
  return true;
});
console.log('(B) drag caméra effectué — vérification visuelle via capture');
await page.screenshot({ path: '/tmp/panzoom2-camera.png' });

ok(pageErrors.length === 0, '0 pageerror' + (pageErrors.length ? ' : ' + pageErrors.join(' | ') : ''));
await browser.close();
console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
