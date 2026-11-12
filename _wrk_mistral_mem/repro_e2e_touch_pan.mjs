// Harnais E2E : PAN (outil main) — hors plein écran ET en plein écran de la
// feuille. Doigt simulé via CDP Input.dispatchTouchEvent.
// Depuis la feature scrollbars : le pan PASSE PAR LE SCROLL NATIF de
// #stage-container scrolle (plus de transform CSS) — les scrollbars reflètent toujours
// la vue. On zoome d'abord (x2) pour que la feuille déborde et que le scroll
// ait une plage. Vérifie : (a) le pan tactile fonctionne partout (bug 03/10 :
// clientX lu sur un TouchEvent -> NaN) ; (b) hors plein écran, c'est le
// scroller qui bouge (scrollLeft/Top) ; (c) le contrôle de zoom reste ANCRÉ
// AU VIEWPORT pendant le pan (parent #stage-wrap, position écran inchangée) ;
// (d) en plein écran, même pan par scroll (plus de transform sur l'élément
// fullscreen, que l'UA interdit de toute façon) et les boutons retournent
// dans #stage-container ; (e) le pan cumule et fonctionne à la souris.
// Run: node _wrk_mistral_mem/repro_e2e_touch_pan.mjs  (vite dev :4173)
import puppeteer from 'puppeteer-core';

const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE = 'http://localhost:4173/';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
let failed = 0;
function check(label, cond) {
  console.log((cond ? '  OK  ' : 'FAIL  ') + label);
  if (!cond) failed++;
}
async function scrollPos(page) {
  return page.evaluate(() => {
    const sc = document.getElementById('stage-container');
    return { x: sc.scrollLeft, y: sc.scrollTop, maxX: sc.scrollWidth - sc.clientWidth, maxY: sc.scrollHeight - sc.clientHeight };
  });
}
async function setScroll(page, x, y) {
  await page.evaluate(([sx, sy]) => {
    const sc = document.getElementById('stage-container');
    sc.scrollLeft = sx; sc.scrollTop = sy;
  }, [x, y]);
  await new Promise((r) => setTimeout(r, 120));
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

  console.log('--- 0. Zoom x2 pour déborder, puis pan TACTILE hors plein écran ---');
  await page.evaluate(() => { const bs = document.querySelectorAll('.stage-zoom-controls button'); for (let i = 0; i < 4; i++) bs[2].click(); });
  await new Promise((r) => setTimeout(r, 300));
  const s0 = await scrollPos(page);
  console.log('  plage de scroll : maxX=' + s0.maxX + ' maxY=' + s0.maxY);
  check('feuille déborde en x2 (scrollbars actives)', s0.maxX > 0 && s0.maxY > 0);
  check('bouton main actif hors plein écran',
    await page.evaluate(() => !document.querySelector('.zoom-hand-btn').disabled));
  await page.click('.zoom-hand-btn');
  await new Promise((r) => setTimeout(r, 300));
  const parent0 = await page.evaluate(() => document.querySelector('.stage-zoom-controls').parentElement.id);
  console.log('  parent du contrôle zoom : ' + parent0);
  check('contrôle zoom ancré dans #stage-wrap', parent0 === 'stage-wrap');
  const zoomBoxBefore = await (await page.$('.stage-zoom-controls')).boundingBox();
  await setScroll(page, 100, 100);
  const before = await scrollPos(page);
  const c0 = await canvasCenter(page);
  await touchDrag(client, c0.x, c0.y, 35, -15);
  const after = await scrollPos(page);
  const tr0 = await transforms(page);
  console.log('  scroll avant=' + JSON.stringify(before) + ' apres=' + JSON.stringify(after));
  // drag de (+35,-15) -> scrollLeft diminue de 35, scrollTop augmente de 15
  check('le scroller suit le pan tactile (scroll ~100-35, 100+15)', Math.abs(after.x - (before.x - 35)) <= 12 && Math.abs(after.y - (before.y + 15)) <= 12);
  check('aucun transform CSS (pan = scroll natif)', !tr0.container && !tr0.panLayer);
  const zoomBoxAfter = await (await page.$('.stage-zoom-controls')).boundingBox();
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

  console.log('--- 3. Pan TACTILE en plein écran (par le scroll du scroller) ---');
  await setScroll(page, 200, 150);
  const beforeFs = await scrollPos(page);
  const c1 = await canvasCenter(page);
  await touchDrag(client, c1.x, c1.y, 40, 25);
  const afterFs = await scrollPos(page);
  console.log('  scroll avant=' + JSON.stringify(beforeFs) + ' apres=' + JSON.stringify(afterFs));
  check('scroll valide (pas de NaN)', Number.isFinite(afterFs.x) && Number.isFinite(afterFs.y));
  check('le scroller porte le pan (~200-40, 150-25)', Math.abs(afterFs.x - (beforeFs.x - 40)) <= 12 && Math.abs(afterFs.y - (beforeFs.y - 25)) <= 12);
  const trFs = await transforms(page);
  check('aucun transform en plein écran (UA)', !trFs.container && !trFs.panLayer);

  console.log('--- 4. Deuxieme glisse tactile (pan cumule) ---');
  await setScroll(page, 200, 150);
  const before2 = await scrollPos(page);
  const c2 = await canvasCenter(page);
  await touchDrag(client, c2.x, c2.y, -30, -20);
  const after2 = await scrollPos(page);
  console.log('  scroll avant=' + JSON.stringify(before2) + ' apres=' + JSON.stringify(after2));
  check('pan tactile cumule (~200+30, 150+20)', Math.abs(after2.x - (before2.x + 30)) <= 12 && Math.abs(after2.y - (before2.y + 20)) <= 12);

  console.log('--- 5. Pan SOURIS en plein écran (non-regression desktop) ---');
  await setScroll(page, 200, 150);
  const before3 = await scrollPos(page);
  const c3 = await canvasCenter(page);
  await page.mouse.move(c3.x, c3.y);
  await page.mouse.down();
  await page.mouse.move(c3.x + 25, c3.y + 15, { steps: 4 });
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 250));
  const after3 = await scrollPos(page);
  console.log('  scroll avant=' + JSON.stringify(before3) + ' apres=' + JSON.stringify(after3));
  check('pan souris a bouge (~200-25, 150-15)', Math.abs(after3.x - (before3.x - 25)) <= 12 && Math.abs(after3.y - (before3.y - 15)) <= 12);

  console.log('--- 6. Sortie du plein écran : boutons reviennent dans #stage-wrap ---');
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
