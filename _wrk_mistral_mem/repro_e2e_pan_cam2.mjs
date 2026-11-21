// E2E : pan caméra en attrapant le CADRE (pas le centre stage) avec caméra zoomée.
// Run: node _wrk_mistral_mem/repro_e2e_pan_cam2.mjs  (vite preview :4180)
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
  userDataDir: '/tmp/chrome-prof-pancam2-' + Date.now(),
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('.tl-toolbar', { timeout: 10000 });
await sleep(400);

const camState = () => page.evaluate(() => {
  const el = document.querySelector('.cam-state');
  return el ? el.title : '(none)';
});
// Centre DU CADRE caméra en coordonnées écran (via le modèle exposé en debug ?)
// -> on le calcule depuis le titre .cam-state (x,y,zoom) + transform du stage.
const frameCenter = () => page.evaluate(() => {
  const el = document.querySelector('.cam-state');
  const m = /x=(-?\d+), y=(-?\d+), zoom=(\d+)%/.exec(el.title);
  if (!m) return null;
  const cam = { x: +m[1], y: +m[2], zoom: +m[3] / 100 };
  const content = document.querySelector('.konvajs-content');
  const r = content.getBoundingClientRect();
  // le stage Konva est scalé : stage.scale = fitScale*state.zoom ; on lit le scale via le canvas
  const canvas = content.querySelector('canvas');
  const scaleX = canvas.width / (canvas.getBoundingClientRect().width || 1);
  const k = 1 / scaleX; // coordonnées écran -> doc
  // position écran du centre caméra = coin canvas + cam.x*k (approx, sans panOffset)
  const scroll = document.getElementById('stage-scroll');
  const cr = canvas.getBoundingClientRect();
  return {
    x: cr.left + (cam.x) * (cr.width / (canvas.width / scaleX)) ,
    y: cr.top + (cam.y) * (cr.width / (canvas.width / scaleX)),
    raw: { cam, cr: { left: cr.left, top: cr.top, w: cr.width }, canvasW: canvas.width, k },
  };
});
async function dragFrom(pt) {
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(pt.x - i * 8, pt.y - i * 4);
  await page.mouse.up();
  await sleep(300);
}

await page.keyboard.press('c'); await sleep(300);
// poser une clé caméra de départ
await page.evaluate(() => { document.querySelector('.cam-add')?.click(); });
await sleep(300);
console.log('init :', await camState());

// zoomer la caméra x5 à la molette
{
  const r = await page.evaluate(() => {
    const c = document.querySelector('.konvajs-content').getBoundingClientRect();
    return { x: c.left + c.width / 2, y: c.top + c.height / 2 };
  });
  await page.mouse.move(r.x, r.y);
  for (let i = 0; i < 5; i++) { await page.mouse.wheel({ deltaY: -120 }); await sleep(150); }
  await sleep(300);
}
console.log('zoomée :', await camState());

// drag depuis le centre du CADRE
const fc = await frameCenter();
console.log('centre cadre écran :', JSON.stringify(fc));
const before = await camState();
await dragFrom(fc);
const after = await camState();
ok(before !== after, `pan caméra en attrapant le cadre zoomé : '${before}' -> '${after}'`);

await browser.close();
console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
