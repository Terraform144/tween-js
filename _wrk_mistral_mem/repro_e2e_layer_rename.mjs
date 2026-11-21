// E2E diagnostic/réparation : double-clic sur le NOM d'un calque -> prompt de renommage.
// (1) double-clic souris réel sur .layer-name -> window.prompt appelé ?
// (2) après fix : le nom du calque change bien dans le modèle (JSON exporté).
// Run: node _wrk_mistral_mem/repro_e2e_layer_rename.mjs   (vanilla servie sur :4185)
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { createDocument } from '../src/core/model.js';

let puppeteer;
try {
  puppeteer = createRequire(import.meta.url)('puppeteer-core');
} catch {
  puppeteer = createRequire('/tmp/e2e/')('puppeteer-core');
}

const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const URL = process.env.TJS_URL || 'http://127.0.0.1:4185/';

const doc = createDocument({ name: 'RenameTest' });
doc.layers[0].name = 'CalqueUn';
// deuxième calque pour que startLayerDrag fasse preventDefault (pire cas)
import { createLayer } from '../src/core/model.js';
doc.layers.push(createLayer('CalqueDeux'));
writeFileSync('/tmp/e2e/rename-test.json', JSON.stringify(doc));

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  userDataDir: '/tmp/chrome-prof-rename-' + Date.now(),
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

// stub prompt : enregistre l'appel et renvoie un nouveau nom
await page.evaluateOnNewDocument(() => {
  window.__promptCalls = [];
  window.prompt = (msg, val) => { window.__promptCalls.push({ msg, val }); return 'NomRenomme'; };
});

await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('.tl-toolbar', { timeout: 10000 });

const input = await page.$('input[type=file][accept=".json,application/json"]');
await input.uploadFile('/tmp/e2e/rename-test.json');
await sleep(500);
await page.waitForSelector('.tl-layer-row:not(.tl-camera-row):not(.tl-audio-row) .layer-name', { timeout: 5000 });

// double-clic souris RÉEL (deux clics rapides) sur le premier .layer-name
const nameBox = await (await page.$('.tl-layer-row:not(.tl-camera-row):not(.tl-audio-row) .layer-name')).boundingBox();
const cx = nameBox.x + Math.min(nameBox.width / 2, 30), cy = nameBox.y + nameBox.height / 2;
await page.mouse.click(cx, cy);
await sleep(120);
await page.mouse.click(cx, cy);
await sleep(400);

let calls = await page.evaluate(() => window.__promptCalls.length);
ok(calls >= 1, `double-clic sur le nom -> prompt appelé (${calls} appel(s))`);

// le nom a-t-il changé dans le modèle ? (relire via le JSON du doc courant)
const newName = await page.evaluate(() => {
  const row = document.querySelector('.tl-layer-row:not(.tl-camera-row):not(.tl-audio-row) .layer-name');
  return row ? row.textContent : null;
});
ok(newName === 'NomRenomme', `nom affiché après renommage = "${newName}"`);

ok(pageErrors.length === 0, '0 pageerror' + (pageErrors.length ? ' : ' + pageErrors.join(' | ') : ''));

await browser.close();
console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
