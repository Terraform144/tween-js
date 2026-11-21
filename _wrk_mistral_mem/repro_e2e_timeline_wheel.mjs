import { fileURLToPath } from 'node:url';
// E2E molette souris sur la TIMELINE — la molette verticale (deltaY) doit
// défiler HORIZONTALEMENT les pistes quand la timeline déborde en largeur
// (laptop/TV, aucun Shift requis) ; deltaX reste géré nativement ; au bord
// horizontal on rend la main au vertical ; sans débordement H la molette ne
// touche pas le scrollLeft. Le tactile continue via le scroll natif (overflow:auto).
// Run: node _wrk_mistral_mem/repro_e2e_timeline_wheel.mjs  (vite preview :4180 sur dist)
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE = process.env.BASE || 'http://127.0.0.1:4180/';
const DOC_JSON = fileURLToPath(new URL('./doc-wheel-e2e.json', import.meta.url));

const model = await import(new URL('../src/core/model.js', import.meta.url).href);

// Doc large : 200 images -> pistes de 200*16 = 3200 px, viewport 1280 -> débordement H
const doc = model.createDocument({ name: 'E2E-Wheel', width: 400, height: 300 });
doc.frameCount = 200;
doc.layers[0].keyframes[0].elements.push(model.createShape('rect', { x: 200, y: 150, width: 120, height: 90, fill: '#cb4b16' }));
writeFileSync(DOC_JSON, JSON.stringify(doc));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
let failed = 0;
const check = (label, cond) => { console.log((cond ? '  OK  ' : 'FAIL  ') + label); if (!cond) failed++; };

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 20000 });
  const input = await page.$('input[type="file"][accept=".json,application/json"]');
  await input.uploadFile(DOC_JSON);
  await new Promise((r) => setTimeout(r, 700));

  const snap = () => page.evaluate(() => {
    const ts = document.querySelector('.tl-tracks-scroll');
    return {
      scrollLeft: ts.scrollLeft, scrollTop: ts.scrollTop,
      scrollWidth: ts.scrollWidth, clientWidth: ts.clientWidth,
      scrollHeight: ts.scrollHeight, clientHeight: ts.clientHeight,
    };
  });
  // Molette CDP au-dessus du milieu des pistes (événement wheel réaliste)
  const wheel = async (dx, dy) => {
    const bb = await (await page.$('.tl-tracks-scroll')).boundingBox();
    const cdp = await page.createCDPSession();
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x: bb.x + bb.width / 2, y: bb.y + bb.height / 2, deltaX: dx, deltaY: dy,
    });
    await new Promise((r) => setTimeout(r, 120));
  };

  console.log('— 1. Doc 200 images : débordement horizontal présent');
  let s = await snap();
  check('pistes plus larges que la vue (scrollWidth ' + s.scrollWidth + ' > clientWidth ' + s.clientWidth + ')', s.scrollWidth > s.clientWidth);
  check('scrollLeft initial = 0', s.scrollLeft === 0);

  console.log('— 2. Molette verticale vers le bas (deltaY>0) -> scroll HORIZONTAL');
  await wheel(0, 240);
  s = await snap();
  check('scrollLeft a augmenté (240 -> ' + s.scrollLeft + ')', s.scrollLeft > 200);
  const after1 = s.scrollLeft;
  await wheel(0, 240);
  s = await snap();
  check('encore un cran (scrollLeft ' + after1 + ' -> ' + s.scrollLeft + ')', s.scrollLeft > after1);

  console.log('— 3. Molette horizontale (deltaX) -> natif, continue de fonctionner');
  await wheel(120, 0);
  s = await snap();
  check('deltaX scroll aussi (scrollLeft -> ' + s.scrollLeft + ')', s.scrollLeft > after1 + 200);

  console.log('— 4. Molette verticale vers le haut (deltaY<0) -> retour vers la gauche');
  await wheel(0, -1000);
  s = await snap();
  check('scrollLeft redescendu vers 0 (' + s.scrollLeft + ')', s.scrollLeft <= 2);

  console.log('— 5. Au bord gauche, deltaY<0 ne casse rien (pas de scroll négatif)');
  await wheel(0, -500);
  s = await snap();
  check('scrollLeft toujours >= 0 (' + s.scrollLeft + ')', s.scrollLeft >= 0);

  console.log('— 6. Doc étroit (24 images, pas de débordement H) : la molette ne touche pas scrollLeft');
  const doc2 = model.createDocument({ name: 'E2E-Wheel-etroit', width: 400, height: 300 });
  writeFileSync(DOC_JSON, JSON.stringify(doc2));
  await input.uploadFile(DOC_JSON);
  await new Promise((r) => setTimeout(r, 700));
  s = await snap();
  check('pas de débordement H (scrollWidth ' + s.scrollWidth + ' <= clientWidth ' + s.clientWidth + ')', s.scrollWidth <= s.clientWidth);
  await wheel(0, 240);
  s = await snap();
  check('scrollLeft inchangé (' + s.scrollLeft + ')', s.scrollLeft === 0);

  check('0 pageerror', pageErrors.length === 0);
  if (pageErrors.length) console.log('   pageerrors:', pageErrors);
} finally {
  await browser.close();
}
console.log(failed === 0 ? '\nALL OK' : '\n' + failed + ' FAILURES');
process.exit(failed === 0 ? 0 : 1);
