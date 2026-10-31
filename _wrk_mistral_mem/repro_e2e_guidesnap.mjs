// E2E snap sur les GUIDES (pas la grille) — doc avec guides.v=[150], snap ON,
// grille OFF : un rect dessiné avec son centre à ~140 doit snapper à x=150.
// Run: node _wrk_mistral_mem/repro_e2e_guidesnap.mjs  (vite preview :4180)
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { createDocument } from '../src/core/model.js';

const require = createRequire('/tmp/e2e/');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';

const doc = createDocument({ name: 'GuideSnap' });
doc.guides = { v: [150], h: [] };
writeFileSync('/tmp/e2e/guidesnap.json', JSON.stringify(doc));

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };

const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto('http://127.0.0.1:4180/', { waitUntil: 'networkidle0' });
await page.waitForSelector('.tl-toolbar');
const input = await page.$('input[type=file][accept=".json,application/json"]');
await input.uploadFile('/tmp/e2e/guidesnap.json');
await new Promise(r => setTimeout(r, 400));

// snap ON, grille OFF (défaut)
await page.click('button[title="Aimanter (snap) les déplacements sur la grille"]');
await page.click('button[title="Rectangle (R)"]');
const pt = await page.evaluate(() => {
  const st = Konva.stages[0];
  const r = st.container().getBoundingClientRect();
  const s = st.scaleX();
  // centre visé ~ (140, 200) : proche du guide x=150 à 10px... tolérance 6 -> non.
  // prenons centre ~ (147, 200) : à 3px du guide -> snap attendu à 150
  return { x1: r.left + 127 * s, y1: r.top + 180 * s, x2: r.left + 167 * s, y2: r.top + 220 * s };
});
await page.mouse.move(pt.x1, pt.y1);
await page.mouse.down();
await page.mouse.move(pt.x2, pt.y2, { steps: 5 });
await page.mouse.up();
await new Promise(r => setTimeout(r, 300));
const rectPos = await page.evaluate(() => {
  for (const l of Konva.stages[0].children) {
    const r = l.find('Rect').find(n => n.getAttr && n.getAttr('elKind'));
    if (r) return { x: r.x(), y: r.y() };
  }
  return null;
});
// centre sans snap = (127+167)/2 = 147 -> à 3px du guide 150 -> snap à 150
ok(rectPos && rectPos.x === 150, `rect snappé sur le guide x=150 (centre 147 -> 150), got ${JSON.stringify(rectPos)}`);
ok(pageErrors.length === 0, '0 pageerror');
await browser.close();
console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
