// E2E onion skin — preuve de bout en bout dans un vrai navigateur (headless).
// Scénario : doc avec rect à x=100 (f0), 200 (f2), 300 (f4), 400 (f6) ; tête de
// lecture à la frame 3 ; activation du bouton onion -> 4 fantômes (2 bleus
// passés x=200/x=100, 2 rouges futurs x=300/x=300), opacités dégressives ;
// pendant la lecture -> aucun fantôme ; 0 pageerror.
// Run: node _wrk_mistral_mem/repro_e2e_onion.mjs   (nécessite vite preview :4180 + puppeteer-core dans /tmp/e2e)
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { createDocument, createShape, insertKeyframe } from '../src/core/model.js';

const require = createRequire('/tmp/e2e/');
const puppeteer = require('puppeteer-core');

const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const URL = 'http://127.0.0.1:4180/';

// ---- fabrique le document test avec le VRAI model.js ----
const doc = createDocument({ name: 'OnionTest' });
const layer = doc.layers[0];
layer.keyframes[0].elements = [createShape('rect', { x: 100, y: 100, width: 40, height: 40, fill: '#ff0000', stroke: '#000000' })];
for (const [i, x] of [[2, 200], [4, 300], [6, 400]]) {
  const kf = insertKeyframe(layer, i);
  kf.elements = [createShape('rect', { x, y: 100, width: 40, height: 40, fill: '#ff0000', stroke: '#000000' })];
}
writeFileSync('/tmp/e2e/onion-test.json', JSON.stringify(doc));

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };

const browser = await puppeteer.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('.tl-toolbar', { timeout: 10000 });

// charge le doc via le vrai flux Ouvrir...
const input = await page.$('input[type=file][accept=".json,application/json"]');
await input.uploadFile('/tmp/e2e/onion-test.json');
await new Promise(r => setTimeout(r, 500));

// tête de lecture -> frame 3 (clic cellule de la règle, index 3 = 4e cellule)
const cells = await page.$$('.tl-ruler .cell');
await cells[3].click();
await new Promise(r => setTimeout(r, 200));

// bouton onion (toolbar timeline)
const btnOnion = await page.$('button[title*="Peau d\'oignon"]');
ok(!!btnOnion, 'bouton onion présent dans la timeline');

// état avant activation : onionLayer (children[1] du stage) vide
const before = await page.evaluate(() => {
  const st = Konva.stages[0];
  return { n: st.children.length, onionKids: st.children[1].children.length, listening: st.children[1].listening() };
});
ok(before.n === 4, 'stage = 4 layers (bg, onion, content, overlay)');
ok(before.onionKids === 0, 'onionLayer vide avant activation');
ok(before.listening === false, 'onionLayer non interactif');

await btnOnion.click();
await new Promise(r => setTimeout(r, 300));

const res = await page.evaluate(() => {
  const st = Konva.stages[0];
  const onion = st.children[1];
  const groups = onion.children.map(g => ({
    listening: g.listening(),
    rects: g.find('Rect').map(r => ({ fill: r.fill(), stroke: r.stroke(), opacity: r.opacity(), x: r.x() })),
  }));
  return { groups, active: !!document.querySelector('button[title*="Peau d\'oignon"].active') };
});
ok(res.active, 'bouton onion en état actif');
ok(res.groups.length === 4, '4 fantômes (2 passés + 2 futurs)');
// ordre : du plus éloigné au plus proche -> [f1, f2, f4, f5]
const xs = res.groups.map(g => g.rects[0] && g.rects[0].x);
ok(JSON.stringify(xs) === JSON.stringify([100, 200, 300, 300]), `positions fantômes ${JSON.stringify(xs)} = [100,200,300,300]`);
const fills = res.groups.map(g => g.rects[0] && g.rects[0].fill);
ok(fills[0] === '#268bd2' && fills[1] === '#268bd2', 'passés BLEUS #268bd2');
ok(fills[2] === '#dc322f' && fills[3] === '#dc322f', 'futurs ROUGES #dc322f');
const ops = res.groups.map(g => g.rects[0] && g.rects[0].opacity);
ok(Math.abs(ops[1] - 0.55) < 1e-6 && Math.abs(ops[0] - 0.275) < 1e-6, `opacités passé dégressifs ${ops[0]},${ops[1]}`);
ok(Math.abs(ops[2] - 0.55) < 1e-6 && Math.abs(ops[3] - 0.275) < 1e-6, `opacités futur dégressifs ${ops[2]},${ops[3]}`);
ok(res.groups.every(g => g.listening === false), 'groupes fantômes non interactifs');
const strokes = res.groups.map(g => g.rects[0] && g.rects[0].stroke);
ok(strokes.every(s => s === fills[0] || s === fills[2]), 'contours teintés aussi');

// pendant la lecture : plus de fantômes
await page.click('button[title*="Lecture"]');
await new Promise(r => setTimeout(r, 400));
const duringPlay = await page.evaluate(() => Konva.stages[0].children[1].children.length);
ok(duringPlay === 0, 'onionLayer vidé pendant la lecture');
await page.click('button[title*="Arrêter"]');
await new Promise(r => setTimeout(r, 300));
const afterStop = await page.evaluate(() => Konva.stages[0].children[1].children.length);
ok(afterStop === 4, 'fantômes de retour après arrêt de la lecture');

// persistance prefs
const pref = await page.evaluate(() => localStorage.getItem('tweenjs:onionSkin'));
ok(pref && JSON.parse(pref).enabled === true, 'réglage persisté dans localStorage');

ok(pageErrors.length === 0, '0 pageerror' + (pageErrors.length ? ' -> ' + pageErrors.join(' | ') : ''));

await browser.close();
console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
