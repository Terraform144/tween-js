import { fileURLToPath } from 'node:url';
// Harnais E2E de la piste caméra dans la Timeline :
//   1. doc avec 2 clés caméra (0 et 10, zoom 1 -> 2) charge via « Ouvrir... »
//   2. la piste caméra existe, est PLUS FONCÉE que les pistes de calques,
//      montre ses 2 clés orange ;
//   3. clic droit sur une clé fait tourner l'easing (titre mis à jour) ;
//   4. glisser une clé la déplace (interpolation suit, cf. tests unitaires) ;
//   5. double-clic sur une image vide pose une clé ;
//   6. clic sur la ligne caméra active l'outil caméra.
// Prerequis : npm run build puis npm run preview (port 4173).
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE = 'http://localhost:4173/';
const REPO = fileURLToPath(new URL('..', import.meta.url));
const DOC_JSON = fileURLToPath(new URL('./doc-camera-e2e.json', import.meta.url)).replace(/^\/([A-Za-z]:)/, '$1');

const model = await import(pathToFileURL(REPO + '/src/core/model.js').href);
const cam = await import(pathToFileURL(REPO + '/src/core/camera.js').href);

const doc = model.createDocument({ name: 'E2E-Camera', width: 400, height: 300 });
const rect = model.createShape('rect', { x: 200, y: 150, width: 120, height: 90, fill: '#cb4b16' });
doc.layers[0].keyframes[0].elements.push(rect);
cam.upsertCameraKeyframe(doc, 0, { zoom: 1 });
cam.upsertCameraKeyframe(doc, 10, { zoom: 2 });
writeFileSync(DOC_JSON, JSON.stringify(doc));
console.log('ETAPE  document E2E caméra écrit');

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
let failed = 0;
function check(label, cond) {
  console.log((cond ? '  OK  ' : 'FAIL  ') + label);
  if (!cond) failed++;
}
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 950 });
  page.on('pageerror', (e) => console.log('  [pageerror] ' + e.message));
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 20000 });
  const input = await page.$('input[type="file"][accept=".json,application/json"]');
  if (!input) { console.log('ECHEC  input file JSON introuvable'); process.exit(1); }
  await input.uploadFile(DOC_JSON);
  await new Promise((r) => setTimeout(r, 700));

  // 1. présence + foncé
  const info = await page.evaluate(() => {
    const row = document.querySelector('.tl-camera-row');
    const track = document.querySelector('.tl-camera-track');
    const layerTrack = document.querySelector('.tl-track-row:not(.tl-camera-track)');
    return {
      row: !!row,
      track: !!track,
      trackBg: track ? getComputedStyle(track).backgroundColor : null,
      layerBg: layerTrack ? getComputedStyle(layerTrack).backgroundColor : null,
      keys: track ? track.querySelectorAll('.camera-key').length : 0,
      keyTitle: track ? (track.children[0].title || '') : '',
    };
  });
  console.log('  piste=' + info.trackBg + ' calque=' + info.layerBg + ' clés=' + info.keys);
  check('ligne + piste caméra présentes', info.row && info.track);
  check('piste plus foncée que les pistes de calques', info.trackBg !== info.layerBg && info.trackBg === 'rgb(7, 54, 66)');
  check('2 clés caméra visibles (frames 0 et 10)', info.keys === 2);
  check('titre de la clé 0 mentionne l\'easing linéaire', info.keyTitle.includes('linéaire'));

  // 2. clic droit sur la clé 0 : cycle d'easing
  const bb = await (await page.$('.tl-camera-track')).boundingBox();
  const cellCenter = (i) => ({ x: bb.x + i * 16 + 8, y: bb.y + 12 });
  let p = cellCenter(0);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await new Promise((r) => setTimeout(r, 300));
  const title1 = await page.evaluate(() => document.querySelector('.tl-camera-track').children[0].title);
  check('clic droit : easing passe à ease-in', title1.includes('ease-in'));

  // 3. glisser la clé 0 vers l'image 2 (+2 cellules = 32 px)
  p = cellCenter(0);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (let k = 1; k <= 4; k++) {
    await page.mouse.move(p.x + (32 * k) / 4, p.y);
    await new Promise((r) => setTimeout(r, 30));
  }
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 300));
  const keysAfter = await page.evaluate(() => {
    const track = document.querySelector('.tl-camera-track');
    const at = [];
    for (let i = 0; i < track.children.length; i++) {
      if (track.children[i].classList.contains('camera-key')) at.push(i);
    }
    return at;
  });
  console.log('  clés après glissé : frames ' + JSON.stringify(keysAfter));
  check('glissé : la clé 0 a bougé en frame 2', keysAfter.includes(2) && keysAfter.includes(10));

  // 4. double-clic image 15 : pose une clé caméra
  p = cellCenter(15);
  await page.mouse.click(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  await new Promise((r) => setTimeout(r, 300));
  const keysAfter2 = await page.evaluate(() => {
    const track = document.querySelector('.tl-camera-track');
    const at = [];
    for (let i = 0; i < track.children.length; i++) {
      if (track.children[i].classList.contains('camera-key')) at.push(i);
    }
    return at;
  });
  check('double-clic : clé posée en frame 15 (3 clés au total)', keysAfter2.includes(15) && keysAfter2.length === 3);

  // 5. clic sur la ligne caméra active l'outil caméra
  await page.click('.tl-camera-row');
  await new Promise((r) => setTimeout(r, 300));
  const camToolActive = await page.evaluate(() => {
    const b = document.querySelector('button[title^="Caméra"]');
    return b ? b.classList.contains('active') : false;
  });
  check('clic ligne caméra : outil caméra activé', camToolActive);

  console.log(failed ? `\n${failed} ÉCHEC(S)` : '\n=== E2E PISTE CAMÉRA : TOUT PASSE ===');
  process.exitCode = failed ? 1 : 0;
} finally {
  await browser.close();
}
