// E2E : pan (outil main) après zoom à la MOLETTE (Ctrl+wheel, qui ajuste le scroll).
// Run: node _wrk_mistral_mem/repro_e2e_pan_zoom3.mjs  (vite preview :4180)
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
  userDataDir: '/tmp/chrome-prof-panzoom3-' + Date.now(),
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('.tl-toolbar', { timeout: 10000 });
await sleep(400);

const stageCenter = () => page.evaluate(() => {
  const r = document.querySelector('.konvajs-content').getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
async function drag() {
  const s = await stageCenter();
  await page.mouse.move(s.x, s.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(s.x - i * 10, s.y - i * 5);
  await page.mouse.up();
  await sleep(250);
}
const state = () => page.evaluate(() => {
  const c = document.getElementById('stage-container');
  const sc = document.getElementById('stage-scroll');
  return {
    pct: document.querySelector('.zoom-percent')?.textContent,
    scroll: sc.scrollLeft + ',' + sc.scrollTop,
    scrollable: sc.scrollWidth > sc.clientWidth + 1 || sc.scrollHeight > sc.clientHeight + 1,
    transform: c.style.transform || '',
  };
});
async function ctrlWheel(n, dir) {
  const s = await stageCenter();
  await page.mouse.move(s.x, s.y);
  for (let i = 0; i < n; i++) {
    await page.keyboard.down('Control');
    await page.mouse.wheel({ deltaY: dir * -120 });
    await page.keyboard.up('Control');
    await sleep(120);
  }
  await sleep(200);
}

await page.click('.zoom-hand-btn'); await sleep(200);

// Zoom IN à la molette x6 (~250%)
await ctrlWheel(6, 1);
let s0 = await state();
await drag();
let s1 = await state();
ok(s1.scroll !== s0.scroll || s1.transform !== s0.transform,
  `Ctrl+wheel zoom IN (${s0.pct}) : pan bouge ? scroll ${s0.scroll}->${s1.scroll}, transform '${s0.transform}'->'${s1.transform}', scrollable=${s0.scrollable}`);

// Zoom OUT à la molette x8 (retour ~100% ou moins)
await ctrlWheel(8, -1);
s0 = await state();
await drag();
s1 = await state();
ok(s1.scroll !== s0.scroll || s1.transform !== s0.transform,
  `Ctrl+wheel zoom OUT (${s0.pct}) : pan bouge ? scroll ${s0.scroll}->${s1.scroll}, transform '${s0.transform}'->'${s1.transform}', scrollable=${s0.scrollable}`);

// Zoom OUT fort x6 (dézoom < 100%)
await ctrlWheel(6, -1);
s0 = await state();
await drag();
s1 = await state();
ok(s1.scroll !== s0.scroll || s1.transform !== s0.transform,
  `Ctrl+wheel dézoom (${s0.pct}) : pan bouge ? scroll ${s0.scroll}->${s1.scroll}, transform '${s0.transform}'->'${s1.transform}', scrollable=${s0.scrollable}`);

ok(pageErrors.length === 0, '0 pageerror' + (pageErrors.length ? ' : ' + pageErrors.join(' | ') : ''));
await browser.close();
console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
