// E2E piste audio — éditeur + export HTML.
// Doc : asset audio (wav dataUrl) + événement à la frame 2. On espionne
// HTMLAudioElement.prototype.play. 1) piste audio visible + event affiché ;
// 2) double-clic cellule frame 5 pose un 2e événement ; 3) lecture -> play
// appelé quand on passe la frame 2 ; 4) export HTML ouvert en file:// ->
// play appelé aussi. 0 pageerror.
// Run: node _wrk_mistral_mem/repro_e2e_audio.mjs  (vite preview :4180)
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { createDocument } from '../src/core/model.js';

const require = createRequire('/tmp/e2e/');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const URL = 'http://127.0.0.1:4180/';
const WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

const doc = createDocument({ name: 'AudioTest' });
doc.assets['a1'] = { id: 'a1', name: 'bip.wav', kind: 'audio', type: 'audio/wav', dataUrl: WAV };
doc.audio = [{ id: 's1', assetId: 'a1', frame: 2 }];
writeFileSync('/tmp/e2e/audio-test.json', JSON.stringify(doc));

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };

const SPY = `(() => { window.__audioPlays = 0; const orig = HTMLAudioElement.prototype.play; HTMLAudioElement.prototype.play = function (...a) { window.__audioPlays++; return orig.apply(this, a); }; })();`;

const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
await page.evaluateOnNewDocument(SPY);
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('.tl-toolbar');
const input = await page.$('input[type=file][accept=".json,application/json"]');
await input.uploadFile('/tmp/e2e/audio-test.json');
await new Promise(r => setTimeout(r, 500));

// 1) piste audio visible + événement affiché à la frame 2 (index 2)
const track = await page.evaluate(() => {
  const row = document.querySelector('.tl-audio-row');
  const cells = [...document.querySelectorAll('.tl-audio-cell')];
  return {
    visible: !!row,
    selectOptions: row ? row.querySelectorAll('select option').length : 0,
    eventAt2: cells[2] ? cells[2].classList.contains('audio-event') : false,
    nbCells: cells.length,
  };
});
ok(track.visible && track.selectOptions === 1, `piste audio visible, 1 son dans la liste (${JSON.stringify(track)})`);
ok(track.eventAt2, 'événement affiché à la frame 2');

// 2) poser un 2e événement à la frame 5 via le bouton "+" de la piste
const rulerCells = await page.$$('.tl-ruler .cell');
await rulerCells[5].click();
await new Promise(r => setTimeout(r, 200));
await page.evaluate(() => {
  const row = document.querySelector('.tl-audio-row');
  const btns = row.querySelectorAll('.mini-btn');
  btns[btns.length - 1].click(); // bouton "+"
});
await new Promise(r => setTimeout(r, 300));
const eventAt5 = await page.evaluate(() => document.querySelectorAll('.tl-audio-cell')[5].classList.contains('audio-event'));
ok(eventAt5, 'bouton + -> 2e événement posé à la frame courante (5)');

// 3) lecture -> le son de la frame 2 est joué au passage (on repart de la frame 0)
await page.evaluate(() => { document.querySelectorAll('.tl-ruler .cell')[0].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); });
await new Promise(r => setTimeout(r, 200));
await page.click('button[title="Lecture / Pause (Entrée)"]');
await new Promise(r => setTimeout(r, 900));
const plays = await page.evaluate(() => window.__audioPlays);
ok(plays >= 1, `lecture: Audio.play appelé ${plays}x (frame 2 atteinte)`);
await page.click('button[title="Arrêter la lecture"]');

// 4) export HTML -> son joué aussi dans l'export
await page.evaluate(() => {
  window.__cap = null;
  const orig = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (blob) => { window.__cap = blob; return orig(blob); };
});
const menuBtns = await page.$$('#menubar button');
for (const b of menuBtns) {
  const t = await b.evaluate(el => el.textContent);
  if (t && t.includes('Fichier')) { await b.click(); break; }
}
await new Promise(r => setTimeout(r, 300));
await page.evaluate(() => {
  const items = [...document.querySelectorAll('[class*="menu"] *')];
  const it = items.find(el => el.children.length === 0 && el.textContent && el.textContent.includes('Exporter HTML'));
  if (it) it.click();
});
await new Promise(r => setTimeout(r, 800));
const htmlBytes = await page.evaluate(async () => window.__cap ? Array.from(new Uint8Array(await window.__cap.arrayBuffer())) : null);
ok(!!htmlBytes, 'export HTML capturé');
if (htmlBytes) {
  writeFileSync('/tmp/e2e/export-audio.html', Buffer.from(htmlBytes));
  const page2 = await browser.newPage();
  await page2.evaluateOnNewDocument(SPY);
  const errs2 = [];
  page2.on('pageerror', (e) => errs2.push(String(e)));
  await page2.goto('file:///tmp/e2e/export-audio.html', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 900));
  const plays2 = await page2.evaluate(() => window.__audioPlays);
  ok(plays2 >= 1, `export HTML: Audio.play appelé ${plays2}x en lecture`);
  ok(errs2.length === 0, 'export: 0 pageerror');
  await page2.close();
}

ok(pageErrors.length === 0, 'éditeur: 0 pageerror' + (pageErrors.length ? ' -> ' + pageErrors.join(' | ') : ''));
await browser.close();
console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
