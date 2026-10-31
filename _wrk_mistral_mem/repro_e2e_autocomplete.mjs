// E2E autocomplétion CodeMirror — preuve dans un vrai navigateur (headless).
// Scénario : doc avec un rect nommé "Logo" ; panneau Scripts ouvert ; on tape
// dans l'éditeur (CDP Input.insertText, car keyboard.type ne rentre pas dans
// CM6) : "Scene.p" -> tooltip avec playSound ; "createjs.Ease.quad" -> quadInOut ;
// "Logo." -> rotation + dispatchEvent ; 0 pageerror.
// Run: node _wrk_mistral_mem/repro_e2e_autocomplete.mjs   (nécessite vite preview :4180 + puppeteer-core /tmp/e2e)
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { createDocument, createShape } from '../src/core/model.js';

const require = createRequire('/tmp/e2e/');
const puppeteer = require('puppeteer-core');

const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const URL = 'http://127.0.0.1:4180/';

const doc = createDocument({ name: 'AcTest' });
doc.layers[0].keyframes[0].elements = [createShape('rect', { x: 50, y: 50, width: 40, height: 40, name: 'Logo' })];
writeFileSync('/tmp/e2e/ac-test.json', JSON.stringify(doc));

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('#scripts-panel .script-tab', { timeout: 10000 });

// charge le doc via le vrai flux Ouvrir...
const input = await page.$('input[type=file][accept=".json,application/json"]');
await input.uploadFile('/tmp/e2e/ac-test.json');
await sleep(400);

// ouvre le premier onglet de script -> monte l'éditeur CodeMirror
await page.click('#scripts-panel .script-tab');
await page.waitForSelector('#scripts-panel .cm-content', { timeout: 5000 });
await focusEditor();

const cdp = await page.createCDPSession();
async function focusEditor() {
  await page.evaluate(() => {
    const c = document.querySelector('#scripts-panel .cm-content');
    c.focus();
    const sel = window.getSelection();
    sel.selectAllChildren(c);
    sel.collapseToEnd();
  });
  await sleep(150);
}
async function type(text) {
  await cdp.send('Input.insertText', { text }); // insertText ne déclenche pas activateOnTyping
  await sleep(150);
  await page.keyboard.down('Control'); await page.keyboard.press('Space'); await page.keyboard.up('Control'); // startCompletion
  await sleep(400);
}
async function tooltipLabels() {
  await page.waitForSelector('.cm-tooltip-autocomplete .cm-completionLabel', { timeout: 3000 }).catch(() => {});
  return page.evaluate(() => [...document.querySelectorAll('.cm-tooltip-autocomplete .cm-completionLabel')].map((e) => e.textContent));
}
async function clearEditor() {
  await focusEditor();
  await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
  await page.keyboard.press('Backspace'); // raccourci clavier géré par CM lui-même
  await sleep(150);
  await page.keyboard.press('Escape'); // ferme un éventuel tooltip
  await sleep(150);
}

// 1) Scene. -> API racine (playSound, dispatchEvent)
await clearEditor();
await type('Scene.p');
let labels = await tooltipLabels();
ok(labels.includes('playSound'), 'Scene.p -> tooltip contient playSound (' + labels.slice(0, 8).join(',') + '...)');
ok(labels.includes('play'), 'Scene.p -> tooltip contient play');

// 2) createjs.Ease. -> easings
await clearEditor();
await type('createjs.Ease.quad');
labels = await tooltipLabels();
ok(labels.includes('quadInOut') && labels.includes('quadIn'), 'createjs.Ease.quad -> quadIn/quadInOut (' + labels.join(',') + ')');

// 3) createjs.Tween.get(...). -> méthodes d'instance
await clearEditor();
await type('createjs.Tween.get(Logo).');
labels = await tooltipLabels();
ok(labels.includes('wait') && labels.includes('to') && labels.includes('call'), 'createjs.Tween.get(Logo). -> wait/to/call (' + labels.join(',') + ')');

// 4) Logo. -> props + API événements
await clearEditor();
await type('Logo.');
labels = await tooltipLabels();
ok(labels.includes('rotation') && labels.includes('dispatchEvent') && labels.includes('on'), 'Logo. -> rotation + on + dispatchEvent');

// 5) nom d'instance seul
await clearEditor();
await type('Lo');
labels = await tooltipLabels();
ok(labels.includes('Logo'), 'Lo -> propose la variable Logo');

ok(pageErrors.length === 0, '0 pageerror' + (pageErrors.length ? ' : ' + pageErrors.join(' | ') : ''));

await browser.close();
console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
