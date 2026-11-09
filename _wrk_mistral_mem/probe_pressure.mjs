// Sonde : quelle pressure arrive réellement dans Konva / le DOM ?
import { createRequire } from 'module';
const require = createRequire('/tmp/e2e/');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const URL = process.env.TJS_URL || 'http://127.0.0.1:4180/';

const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('.tl-toolbar');
await new Promise(r => setTimeout(r, 400));

await page.evaluate(() => {
  window.__log = [];
  const c = Konva.stages[0].container();
  c.addEventListener('pointerdown', (e) => window.__log.push('DOM pointerdown pressure=' + e.pressure));
  c.addEventListener('pointermove', (e) => window.__log.push('DOM pointermove pressure=' + e.pressure));
  c.addEventListener('mousedown', (e) => window.__log.push('DOM mousedown (MouseEvent, pas de pressure)'));
  Konva.stages[0].on('mousedown', (e) => window.__log.push('Konva mousedown e.evt.pressure=' + (e.evt && e.evt.pressure) + ' type=' + (e.evt && e.evt.type)));
});

const client = await page.createCDPSession();
const st = await page.evaluate(() => {
  const s = Konva.stages[0];
  const r = s.container().getBoundingClientRect();
  return { x: r.left + 200 * s.scaleX(), y: r.top + 150 * s.scaleX() };
});
// Stylet simulé : touch avec force (0..1) -> PointerEvent.pressure côté navigateur
await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: st.x, y: st.y, id: 1, force: 0.95 }] });
await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: st.x + 30, y: st.y, id: 1, force: 0.2 }] });
await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await new Promise(r => setTimeout(r, 300));

console.log((await page.evaluate(() => window.__log)).join('\n'));
await browser.close();
