// Test sons dans les scripts — bilan SoundJS + Scene.playSound.
// 1) createjs.Sound en l'état : activePlugin (null = aucun plugin actif dans ce
//    navigateur headless, play -> playFailed) — documenté, on ne s'appuie pas dessus.
// 2) Scene.playSound('a1') (asset audio du doc) via le panneau Scripts -> Exécuter
//    -> Audio.play appelé. 3) export HTML -> le script s'exécute au chargement ->
//    Audio.play appelé aussi. Run: vite preview :4180 + /tmp/e2e/wav.txt
import { createRequire } from 'module';
import { readFileSync, writeFileSync } from 'fs';
import { createDocument } from '../src/core/model.js';

const require = createRequire('/tmp/e2e/');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const WAV = readFileSync('/tmp/e2e/wav.txt', 'utf8').trim();
const SPY = `(() => { window.__plays = 0; const o = HTMLAudioElement.prototype.play; HTMLAudioElement.prototype.play = function (...a) { window.__plays++; return o.apply(this, a); }; })();`;

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };

const doc = createDocument({ name: 'SoundScript' });
doc.assets['a1'] = { id: 'a1', name: 'bip.wav', kind: 'audio', type: 'audio/wav', dataUrl: WAV };
doc.scripts[0].code = `Scene.playSound('a1'); Scene.log('sound ok');`;
writeFileSync('/tmp/e2e/sound-script.json', JSON.stringify(doc));

const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required', '--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
await page.evaluateOnNewDocument(SPY);
page.on('pageerror', (e) => console.log('PAGEERROR', String(e)));
await page.goto('http://127.0.0.1:4180/', { waitUntil: 'networkidle0' });
await page.waitForSelector('.tl-toolbar');

// 1) bilan SoundJS en l'état
const sound = await page.evaluate((wav) => {
  const has = typeof createjs !== 'undefined' && !!createjs.Sound;
  const active = has ? (createjs.Sound.activePlugin ? createjs.Sound.activePlugin.name : null) : null;
  let state = null;
  if (has) { try { const i = createjs.Sound.play(wav); state = i && i.playState; } catch (e) { state = 'err:' + e.message; } }
  return { has, active, state };
}, WAV);
console.log('  SoundJS en l\'état:', JSON.stringify(sound));
ok(sound.has, 'createjs.Sound présent (soundjs embarqué)');

// 2) Scene.playSound via le panneau Scripts
const input = await page.$('input[type=file][accept=".json,application/json"]');
await input.uploadFile('/tmp/e2e/sound-script.json');
await new Promise(r => setTimeout(r, 500));
const before = await page.evaluate(() => window.__plays);
await page.click('button[title="Exécuter (Ctrl+Entrée)"]');
await new Promise(r => setTimeout(r, 500));
const after = await page.evaluate(() => window.__plays);
ok(after > before, `Scene.playSound('a1') via Exécuter -> Audio.play +${after - before}x`);

// 3) export HTML -> script exécuté au chargement -> son joué
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
  writeFileSync('/tmp/e2e/export-sound.html', Buffer.from(htmlBytes));
  const page2 = await browser.newPage();
  await page2.evaluateOnNewDocument(SPY);
  await page2.goto('file:///tmp/e2e/export-sound.html', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 900));
  const plays2 = await page2.evaluate(() => window.__plays);
  ok(plays2 >= 1, `export HTML: Scene.playSound joué au chargement (${plays2}x)`);
  await page2.close();
}

await browser.close();
console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
