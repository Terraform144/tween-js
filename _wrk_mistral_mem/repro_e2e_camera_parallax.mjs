// E2E parallaxe caméra : en lecture avec caméra zoom 2, le calque normal subit
// le zoom (groupe lg_l1 scaleX=2), le calque parallax=0 reste identité (scaleX=1).
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
await input.uploadFile(HERE + 'doc-parallax-e2e.json');
await new Promise(r => setTimeout(r, 600));
// lancer la lecture (bouton play de la timeline)
await page.click('button[title*="Lecture"]');
await new Promise(r => setTimeout(r, 500));
const groups = await page.evaluate(() => {
  const out = {};
  const walk = (n) => {
    if (n.id && n.id() && n.id().startsWith('lg_')) out[n.id()] = { scaleX: n.scaleX(), x: n.x(), y: n.y() };
    if (n.getChildren) n.getChildren().forEach(walk);
  };
  walk(Konva.stages[0]);
  return out;
});
ok(groups['lg_l1'] && Math.abs(groups['lg_l1'].scaleX - 2) < 0.01, `calque normal: groupe scaleX=2 (caméra zoom 2) -> ${groups['lg_l1'] && groups['lg_l1'].scaleX}`);
ok(groups['lg_l2'] && Math.abs(groups['lg_l2'].scaleX - 1) < 0.01, `calque parallax=0: groupe identité scaleX=1 -> ${groups['lg_l2'] && groups['lg_l2'].scaleX}`);
// hors lecture : tout identité
await page.click('button[title*="Lecture"]'); // re-clic = stop
await new Promise(r => setTimeout(r, 400));
const groups2 = await page.evaluate(() => {
  const out = {};
  const walk = (n) => {
    if (n.id && n.id() && n.id().startsWith('lg_')) out[n.id()] = { scaleX: n.scaleX() };
    if (n.getChildren) n.getChildren().forEach(walk);
  };
  walk(Konva.stages[0]);
  return out;
});
ok(groups2['lg_l1'] && Math.abs(groups2['lg_l1'].scaleX - 1) < 0.01, `hors lecture: calque normal redevenu identité -> ${groups2['lg_l1'] && groups2['lg_l1'].scaleX}`);
ok(pageErrors.length === 0, '0 pageerror' + (pageErrors.length ? ' : ' + pageErrors.join(' | ') : ''));
console.log(`\n${pass} OK, ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
