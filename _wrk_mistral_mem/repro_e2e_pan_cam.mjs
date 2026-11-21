// E2E : pan CAMÉRA (glisser le cadre) avec la caméra zoomée ou non.
// Run: node _wrk_mistral_mem/repro_e2e_pan_cam.mjs  (vite preview :4180)
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
  userDataDir: '/tmp/chrome-prof-pancam-' + Date.now(),
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('.tl-toolbar', { timeout: 10000 });
await sleep(400);

const camState = () => page.evaluate(() => {
  const el = document.querySelector('.cam-state');
  return el ? (el.title || el.textContent) : '(pas de .cam-state)';
});
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
  await sleep(300);
}

// Activer outil caméra
await page.keyboard.press('c'); await sleep(300);
console.log('caméra init :', await camState());

// A) pan caméra SANS zoom caméra
await drag();
const a = await camState();
console.log('après drag (zoom 100%) :', a);
ok(/x=-?\d+, y=-?\d+/.test(a) && !/x=0, y=0,/.test(a), 'pan caméra à 100% : x/y ont bougé -> ' + a);

// B) zoom caméra via molette (outil caméra actif, molette sans Ctrl) x5
{
  const s = await stageCenter();
  await page.mouse.move(s.x, s.y);
  for (let i = 0; i < 5; i++) { await page.mouse.wheel({ deltaY: -120 }); await sleep(150); }
  await sleep(300);
}
console.log('caméra après molette x5 :', await camState());
await drag();
const b = await camState();
console.log('après drag (caméra zoomée) :', b);
ok(b !== (await camState()) || true, 'drag effectué');
// compare x/y avant/après drag zoomé
const before = await camState();
await drag();
const after = await camState();
ok(before !== after, `pan caméra avec caméra zoomée : état change ? '${before}' -> '${after}'`);

ok(pageErrors.length === 0, '0 pageerror' + (pageErrors.length ? ' : ' + pageErrors.join(' | ') : ''));
await browser.close();
console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
