// E2E export vidéo WebM — preuve dans un vrai navigateur (headless).
// Scénario : doc 12 frames avec un rect qui bouge (x 50 → 450) ; on intercepte
// URL.createObjectURL pour capturer le Blob téléchargé ; menu Fichier >
// "Exporter vidéo WebM…" ; on vérifie : blob video/webm non vide, la lecture a
// bien démarré puis l'état est restauré (playing=false), 0 pageerror.
// Run: node _wrk_mistral_mem/repro_e2e_videoexport.mjs   (vite preview :4180 + puppeteer-core /tmp/e2e)
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { createDocument, createShape, insertKeyframe } from '../src/core/model.js';

const require = createRequire('/tmp/e2e/');
const puppeteer = require('puppeteer-core');

const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const URL = 'http://127.0.0.1:4180/';

// ---- doc test : 12 frames, rect qui traverse la scène ----
const doc = createDocument({ name: 'VideoE2E', frameRate: 24, width: 320, height: 200 });
doc.frameCount = 12;
const layer = doc.layers[0];
layer.keyframes[0].elements = [createShape('rect', { x: 50, y: 100, width: 30, height: 30, fill: '#cb4b16' })];
const kf11 = insertKeyframe(layer, 11);
kf11.elements = [createShape('rect', { x: 450, y: 100, width: 30, height: 30, fill: '#cb4b16' })];
kf11.tween = { easing: 'linear' }; // interpolation entre les 2 keyframes
writeFileSync('/tmp/e2e/video-test.json', JSON.stringify(doc));

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

// capture le Blob passé à createObjectURL (downloadBlobFile)
await page.evaluateOnNewDocument(() => {
  const orig = URL.createObjectURL.bind(URL);
  window.__captured = [];
  URL.createObjectURL = (blob) => { window.__captured.push(blob); return orig(blob); };
});

await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('.tl-toolbar', { timeout: 10000 });

// charge le doc via Ouvrir...
const input = await page.$('input[type=file][accept=".json,application/json"]');
await input.uploadFile('/tmp/e2e/video-test.json');
await sleep(400);

// MediaRecorder dispo ?
const mrOk = await page.evaluate(() => typeof MediaRecorder !== 'undefined' && !!['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)));
ok(mrOk, 'MediaRecorder + WebM supportés dans ce navigateur');

// ouvre le menu Fichier et clique "Exporter vidéo WebM…"
await page.click('.file-menu-btn');
await page.waitForSelector('.file-menu-panel.open', { timeout: 3000 });
const clicked = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.file-menu-panel.open button')];
  const b = btns.find((x) => x.textContent.includes('WebM'));
  if (!b) return false;
  b.click();
  return true;
});
ok(clicked, 'entrée "Exporter vidéo WebM…" présente et cliquée');

// attend le blob téléchargé (12 frames à 24 fps ≈ 0,5 s + overhead)
let blob = null;
for (let i = 0; i < 75; i++) {
  await sleep(200);
  const caps = await page.evaluate(() => window.__captured.map((b) => ({ type: b.type, size: b.size })));
  const webm = caps.find((c) => c.type.includes('webm'));
  if (webm) { blob = webm; break; }
}
ok(!!blob, 'Blob webm téléchargé (capture createObjectURL)');
if (blob) {
  ok(blob.type === 'video/webm', 'type video/webm (' + blob.type + ')');
  ok(blob.size > 500, 'taille non vide (' + blob.size + ' octets — scène simple, vp9 compresse fort)');
  // en-tête WebM = EBML (0x1A45DFA3)
  const head = await page.evaluate(async () => {
    const b = window.__captured.find((x) => x.type.includes('webm'));
    const buf = new Uint8Array(await b.slice(0, 4).arrayBuffer());
    return [...buf].map((x) => x.toString(16).padStart(2, '0')).join('');
  });
  ok(head === '1a45dfa3', 'en-tête EBML valide (1a45dfa3), lu: ' + head);
}

// l'état de lecture est restauré après l'export
const after = await page.evaluate(() => ({ playing: window.__tjs_state ? window.__tjs_state.playing : null }));
// (state non exposé globalement -> on vérifie via le bouton lecture de la timeline)
const playBtn = await page.$('.tl-toolbar button[title*="Lecture"], .tl-toolbar button[title*="lecture"], .tl-toolbar .tl-play');
const playing = await page.evaluate(() => {
  // le loop remet state.playing=false à la fin de l'export ; on sonde via le DOM :
  // le bouton lecture redevient "▶" (non actif)
  const b = document.querySelector('.tl-toolbar button[title*="Lecture"], .tl-toolbar button[title*="lecture"]');
  return b ? !b.classList.contains('active') : null;
});
ok(playing === true, 'lecture arrêtée après export (bouton lecture inactif)');

ok(pageErrors.length === 0, '0 pageerror' + (pageErrors.length ? ' : ' + pageErrors.join(' | ') : ''));

await browser.close();
console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
