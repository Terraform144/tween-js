// E2E : le pan (outil main) doit marcher à CHAQUE niveau de zoom.
// Run: node _wrk_mistral_mem/repro_e2e_pan_zoom.mjs  (vite preview :4180)
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
  userDataDir: '/tmp/chrome-prof-panzoom-' + Date.now(),
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('.tl-toolbar', { timeout: 10000 });
await sleep(400);

async function drag() {
  const stage = await page.evaluate(() => {
    const r = document.querySelector('.konvajs-content').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(stage.x, stage.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(stage.x - i * 10, stage.y - i * 5);
  await page.mouse.up();
  await sleep(250);
}
const state = () => page.evaluate(() => {
  const c = document.getElementById('stage-container');
  const sc = document.getElementById('stage-scroll');
  const k = document.querySelector('.konvajs-content');
  return {
    scrollLeft: sc.scrollLeft, scrollTop: sc.scrollTop,
    scrollW: sc.scrollWidth, clientW: sc.clientWidth, scrollH: sc.scrollHeight, clientH: sc.clientHeight,
    transform: c.style.transform || '',
    canvasW: k ? k.getBoundingClientRect().width : 0,
  };
});

// Outil main actif une fois pour toutes
await page.click('.zoom-hand-btn'); await sleep(250);
ok(await page.evaluate(() => document.querySelector('.zoom-hand-btn').classList.contains('active')), 'outil main actif');

// Niveaux de zoom testés via le % (reset) puis boutons +/- ; on lit le % affiché.
async function setZoomByClicks(nClicks) {
  await page.click('.zoom-percent'); await sleep(200); // reset -> 100%
  for (let i = 0; i < nClicks; i++) { await page.click('button[title="Agrandir le zoom (Ctrl+molette)"]'); await sleep(80); }
  for (let i = 0; i < -nClicks; i++) { await page.click('button[title="Diminuer le zoom (Ctrl+molette)"]'); await sleep(80); }
  await sleep(200);
  return page.evaluate(() => document.querySelector('.zoom-percent').textContent);
}

for (const clicks of [0, 1, 2, 4, -1, -2]) { // 100%, 125%, 150%, 200%, 75%, 50%
  const label = await setZoomByClicks(clicks);
  const s0 = await state();
  await drag();
  const s1 = await state();
  const moved = (s1.scrollLeft !== s0.scrollLeft || s1.scrollTop !== s0.scrollTop || s1.transform !== s0.transform);
  ok(moved, `zoom ${label} : pan déplace bien (scroll ${s0.scrollLeft},${s0.scrollTop} -> ${s1.scrollLeft},${s1.scrollTop} ; transform '${s0.transform}' -> '${s1.transform}'; canvas ${Math.round(s0.canvasW)}px)`);
}

ok(pageErrors.length === 0, '0 pageerror' + (pageErrors.length ? ' : ' + pageErrors.join(' | ') : ''));
await browser.close();
console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
