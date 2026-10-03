// Harnais E2E : PAN TACTILE (outil main) — hors plein écran ET en plein
// écran de la feuille. Doigt simulé via CDP Input.dispatchTouchEvent.
// Vérifie : (a) le pan tactile fonctionne partout (bug 03/10 : clientX lu
// sur un TouchEvent -> NaN) ; (b) hors plein écran, la PAGE ENTIÈRE suit le
// pan (#stage-container transformé, panLayer immobile) ; (c) le contrôle de
// zoom reste ANCRÉ AU VIEWPORT pendant le pan (parent #stage-wrap, position
// à l'écran inchangée) ; (d) en plein écran, le pan revient au panLayer (UA
// interdit transform sur l'élément fullscreen) et les boutons retournent
// dans #stage-container.
// Run : copier dans /tmp/e2e puis `node pan_touch.mjs` (preview vite sur 4173).
import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Users/jl_be/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const BASE = 'http://localhost:4173/';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
let failed = 0;
function check(label, cond) {
  console.log((cond ? '  OK  ' : 'FAIL  ') + label);
  if (!cond) failed++;
}
function parseTranslate(tr) {
  if (!tr) return { x: 0, y: 0 };
  const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(tr);
  return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: NaN, y: NaN };
}
async function transforms(page) {
  return page.evaluate(() => ({
    container: document.getElementById('stage-container').style.transform,
    panLayer: document.querySelector('.stage-pan-layer').style.transform,
  }));
}
async function touchDrag(client, x, y, dx, dy) {
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 4; i++) {
    await new Promise((r) => setTimeout(r, 40));
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + (dx * i) / 4, y: y + (dy * i) / 4 }],
    });
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await new Promise((r) => setTimeout(r, 250));
}
async function canvasCenter(page) {
  const bb = await (await page.$('.konvajs-content')).boundingBox();
  return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 };
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 600, hasTouch: true, isMobile: true });
  page.on('pageerror', (e) => console.log('  [pageerror] ' + e.message));
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise((r) => setTimeout(r, 800));
  const client = await page.target().createCDPSession();

  console.log('--- 0. Pan TACTILE HORS plein écran ---');
  check('bouton main actif hors plein écran',
    await page.evaluate(() => !document.querySelector('.zoom-hand-btn').disabled));
  await page.click('.zoom-hand-btn');
  await new Promise((r) => setTimeout(r, 300));
  const parent0 = await page.evaluate(() => document.querySelector('.stage-zoom-controls').parentElement.id);
  console.log('  parent du contrôle zoom : ' + parent0);
  check('contrôle zoom ancré dans #stage-wrap', parent0 === 'stage-wrap');
  const zoomBoxBefore = await (await page.$('.stage-zoom-controls')).boundingBox();
  const before = parseTranslate((await transforms(page)).container);
  const c0 = await canvasCenter(page);
  await touchDrag(client, c0.x, c0.y, 35, -15);
  const tr0 = await transforms(page);
  const after = parseTranslate(tr0.container);
  console.log('  container avant=' + JSON.stringify(before) + ' apres=' + JSON.stringify(after));
  check('LA PAGE suit le pan (container ~35px,-15px)', Math.abs(after.x - before.x - 35) <= 12 && Math.abs(after.y - before.y + 15) <= 12);
  check('panLayer immobile hors plein écran', !tr0.panLayer);
  const zoomBoxAfter = await (await page.$('.stage-zoom-controls')).boundingBox();
  console.log('  zoom box avant=' + JSON.stringify(zoomBoxBefore) + ' apres=' + JSON.stringify(zoomBoxAfter));
  check('contrôle zoom FIXE pendant le pan (position écran inchangée)',
    Math.abs(zoomBoxAfter.x - zoomBoxBefore.x) <= 1 && Math.abs(zoomBoxAfter.y - zoomBoxBefore.y) <= 1);
  check('contrôle zoom toujours visible dans le viewport',
    await page.evaluate(() => {
      const r = document.querySelector('.stage-zoom-controls').getBoundingClientRect();
      return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
    }));

  console.log('--- 1. Entrée en plein écran de la feuille ---');
  await page.click('.stage-fullscreen-btn');
  await new Promise((r) => setTimeout(r, 800));
  const fsMode = await page.evaluate(() => {
    const native = document.fullscreenElement || document.webkitFullscreenElement;
    if (native) return 'NATIVE';
    return document.querySelector('.fs-css-active') ? 'CSS-FALLBACK' : null;
  });
  console.log('  mode plein écran : ' + fsMode);
  check('plein écran actif (natif ou repli CSS)', fsMode !== null);
  const parent1 = await page.evaluate(() => document.querySelector('.stage-zoom-controls').parentElement.id);
  console.log('  parent du contrôle zoom : ' + parent1);
  check('contrôle zoom retourné dans #stage-container (fullscreen)', parent1 === 'stage-container');

  console.log('--- 2. Outil main toujours actif en plein écran ---');
  const stillHand = await page.evaluate(() => /active/.test(document.querySelector('.zoom-hand-btn').className));
  if (!stillHand) await page.click('.zoom-hand-btn');
  await new Promise((r) => setTimeout(r, 300));
  check('outil main actif', /active/.test(await page.evaluate(() => document.querySelector('.zoom-hand-btn').className)));

  console.log('--- 3. Pan TACTILE en plein écran (panLayer porte le transform) ---');
  const beforeFs = parseTranslate((await transforms(page)).panLayer);
  const c1 = await canvasCenter(page);
  await touchDrag(client, c1.x, c1.y, 40, 25);
  const trFs = await transforms(page);
  const afterFs = parseTranslate(trFs.panLayer);
  console.log('  panLayer avant=' + JSON.stringify(beforeFs) + ' apres=' + JSON.stringify(afterFs));
  check('transform valide (pas de NaN)', Number.isFinite(afterFs.x) && Number.isFinite(afterFs.y));
  check('panLayer porte le pan (~40px,25px)', Math.abs(afterFs.x - beforeFs.x - 40) <= 12 && Math.abs(afterFs.y - beforeFs.y - 25) <= 12);
  check('container sans transform en plein écran (UA)', !trFs.container);

  console.log('--- 4. Deuxieme glisse tactile (pan cumule) ---');
  const before2 = parseTranslate((await transforms(page)).panLayer);
  const c2 = await canvasCenter(page);
  await touchDrag(client, c2.x, c2.y, -30, -20);
  const after2 = parseTranslate((await transforms(page)).panLayer);
  console.log('  panLayer avant=' + JSON.stringify(before2) + ' apres=' + JSON.stringify(after2));
  check('pan tactile cumule (~-30px,-20px)', Math.abs(after2.x - before2.x + 30) <= 12 && Math.abs(after2.y - before2.y + 20) <= 12);

  console.log('--- 5. Pan SOURIS en plein écran (non-regression desktop) ---');
  const before3 = parseTranslate((await transforms(page)).panLayer);
  const c3 = await canvasCenter(page);
  await page.mouse.move(c3.x, c3.y);
  await page.mouse.down();
  await page.mouse.move(c3.x + 25, c3.y + 15, { steps: 4 });
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 250));
  const after3 = parseTranslate((await transforms(page)).panLayer);
  console.log('  panLayer avant=' + JSON.stringify(before3) + ' apres=' + JSON.stringify(after3));
  check('pan souris a bouge (~25px,15px)', Math.abs(after3.x - before3.x - 25) <= 12 && Math.abs(after3.y - before3.y - 15) <= 12);

  console.log('--- 6. Sortie du plein écran : boutons reviennent dans #stage-wrap ---');
  // NB : Échap ne sort que du plein écran NATIF (comportement UA). Le repli
  // CSS (headless, iOS ancien) se quitte par le bouton, comme en usage réel.
  await page.click('.stage-fullscreen-btn');
  await new Promise((r) => setTimeout(r, 700));
  const parent2 = await page.evaluate(() => document.querySelector('.stage-zoom-controls').parentElement.id);
  console.log('  parent du contrôle zoom : ' + parent2);
  check('contrôle zoom de retour dans #stage-wrap', parent2 === 'stage-wrap');
} catch (err) {
  console.log('EXCEPTION : ' + err.message);
  failed++;
}

await browser.close();
console.log(failed === 0 ? '\nTOUS LES CONTROLES OK' : '\nECHECS : ' + failed);
process.exit(failed === 0 ? 0 : 1);
