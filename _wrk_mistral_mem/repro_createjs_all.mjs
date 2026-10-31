// E2E "tout CreateJS fonctionne dans la boîte de script" — un script utilisateur
// (panneau Scripts -> Exécuter) teste chaque brique CreateJS et poste les
// résultats dans window.__tjs :
//  Tween (élément nommé), Stage+Shape+Text (EaselJS offscreen), LoadQueue
//  (PreloadJS, dataUrl image), Ticker, EventDispatcher, Sound (wav de
//  Ressources/midi-song.wav). Run: vite preview :4180
import { createRequire } from 'module';
import { readFileSync, writeFileSync } from 'fs';
import { createDocument, createShape, createSymbol, createInstance } from '../src/core/model.js';

const require = createRequire('/tmp/e2e/');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const WAV_URL = 'data:audio/wav;base64,' + readFileSync('Ressources/midi-song.wav').toString('base64');
const PNG1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };

const script = `
window.__tjs = {};
try {
  // --- TweenJS sur élément nommé (prelude named) ---
  createjs.Tween.get(But).to({ x: 300 }, 50);
  window.__tjs.tween = !!createjs.Tween.get(But);
} catch (e) { window.__tjs.tween = 'err:' + e.message; }
try {
  // --- EaselJS : Stage + Shape + Text sur canvas offscreen ---
  var cv = document.createElement('canvas'); cv.width = 120; cv.height = 80;
  var stage = new createjs.Stage(cv);
  var sh = new createjs.Shape();
  sh.graphics.beginFill('#ff0000').drawRect(0, 0, 50, 50);
  stage.addChild(sh);
  var tx = new createjs.Text('hello', '20px Arial', '#000000');
  tx.x = 5; tx.y = 55;
  stage.addChild(tx);
  stage.update();
  window.__tjs.easelStage = stage.children.length === 2;
  window.__tjs.easelText = tx.text === 'hello';
  window.__tjs.easelRender = cv.getContext('2d').getImageData(10, 10, 1, 1).data[0] > 200; // pixel rouge
} catch (e) { window.__tjs.easelStage = 'err:' + e.message; }
try {
  // --- PreloadJS : LoadQueue sur dataUrl image ---
  var q = new createjs.LoadQueue();
  q.on('complete', function () { window.__tjs.loadqueue = q.loaded === true; });
  q.loadFile({ id: 'px', src: ${JSON.stringify(PNG1)}, type: 'image' });
} catch (e) { window.__tjs.loadqueue = 'err:' + e.message; }
try {
  // --- Ticker ---
  createjs.Ticker.paused = false;
  var ticks = 0;
  var onTick = function () { ticks++; };
  createjs.Ticker.addEventListener('tick', onTick);
  setTimeout(function () { createjs.Ticker.removeEventListener('tick', onTick); window.__tjs.ticker = ticks; }, 400);
} catch (e) { window.__tjs.ticker = 'err:' + e.message; }
try {
  // --- SoundJS : play du wav midi-song ---
  var inst = createjs.Sound.play(${JSON.stringify(WAV_URL)});
  window.__tjs.soundInst = !!inst;
  setTimeout(function () { window.__tjs.sound = inst ? inst.playState : 'no-inst'; }, 500);
} catch (e) { window.__tjs.sound = 'err:' + e.message; }
try {
  // --- EventDispatcher ---
  var d = new createjs.EventDispatcher();
  var got = false;
  d.on('ping', function () { got = true; });
  d.dispatchEvent('ping');
  window.__tjs.event = got;
} catch (e) { window.__tjs.event = 'err:' + e.message; }
Scene.log('createjs test done');
`;

const doc = createDocument({ name: 'CreateJSTest' });
const sym = createSymbol('B', 'movieclip');
sym.layers[0].keyframes[0].elements = [createShape('rect', { x: 0, y: 0, width: 30, height: 30, fill: '#00f' })];
doc.symbols[sym.id] = sym;
const but = createInstance(sym.id, { x: 50, y: 50 });
but.name = 'But';
doc.layers[0].keyframes[0].elements = [but];
doc.scripts[0].code = script;
writeFileSync('/tmp/e2e/createjs-test.json', JSON.stringify(doc));

const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e)));
await page.goto('http://127.0.0.1:4180/', { waitUntil: 'networkidle0' });
await page.waitForSelector('.tl-toolbar');
const input = await page.$('input[type=file][accept=".json,application/json"]');
await input.uploadFile('/tmp/e2e/createjs-test.json');
await new Promise(r => setTimeout(r, 500));
await page.click('button[title="Exécuter (Ctrl+Entrée)"]');
await new Promise(r => setTimeout(r, 1200));
const r = await page.evaluate(() => window.__tjs || {});
console.log('  résultats:', JSON.stringify(r));

ok(r.tween === true, 'TweenJS sur élément nommé (But)');
ok(r.easelStage === true && r.easelText === true, 'EaselJS Stage+Shape+Text (offscreen)');
ok(r.easelRender === true, 'EaselJS render: pixel rouge rendu');
ok(r.loadqueue === true, 'PreloadJS LoadQueue (dataUrl image) -> complete');
ok(typeof r.ticker === 'number' && r.ticker > 5, `Ticker tourne (${r.ticker} ticks en 400ms)`);
ok(r.event === true, 'EventDispatcher on/dispatchEvent');
ok(r.soundInst === true, 'SoundJS: play(wav) retourne une instance');
console.log('  sound playState:', r.sound, '(plugin actif:', await page.evaluate(() => createjs.Sound.activePlugin ? createjs.Sound.activePlugin.name : null), ')');

await browser.close();
console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
