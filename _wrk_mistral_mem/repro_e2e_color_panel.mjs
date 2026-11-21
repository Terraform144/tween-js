import { fileURLToPath } from 'node:url';
// E2E panneau palette de couleurs + swatches carrés —
//  1. menubar (haut droite) : swatch "fond" JAMAIS écrasé (flex:none, carré) + bouton palette à côté
//  2. panneau custom : 3 groupes (Classiques/Pastels/Pantone), swatch courant surligné,
//     clic swatch -> couleur propagée (input value + événement), champ hex éditable,
//     Échap / clic dehors ferment, nuancier système proposé
//  3. panneau Propriétés : swatch Remplissage carré + palette fonctionnelle
//  4. viewport mobile 390px : swatch menubar >= 40px carré, panneau centré, swatches tactiles
// Run: node _wrk_mistral_mem/repro_e2e_color_panel.mjs  (vite preview :4180)
import puppeteer from 'puppeteer-core';

const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE = process.env.BASE || 'http://127.0.0.1:4180/';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
let failed = 0;
const check = (label, cond) => { console.log((cond ? '  OK  ' : 'FAIL  ') + label); if (!cond) failed++; };

try {
  // ---------- DESKTOP ----------
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 20000 });
  await page.waitForSelector('#menubar input[type="color"]');
  await new Promise((r) => setTimeout(r, 400));

  console.log('— 1. Menubar (haut droite) : swatch fond carré + non écrasé + bouton palette');
  const mb = await page.evaluate(() => {
    const inp = document.querySelector('#menubar input[type="color"]');
    const r = inp.getBoundingClientRect();
    const cs = getComputedStyle(inp);
    const btn = inp.nextElementSibling;
    return { w: r.width, h: r.height, flex: cs.flexShrink, paletteBtn: !!(btn && btn.classList.contains('palette-btn')) };
  });
  check('swatch carré (w=' + mb.w + ' == h=' + mb.h + ')', mb.w === mb.h && mb.w >= 30);
  check('flex-shrink = 0 (jamais écrasé)', mb.flex === '0');
  check('bouton palette présent à côté', mb.paletteBtn);

  console.log('— 2. Ouverture du panneau palette (menubar)');
  await page.evaluate(() => {
    const inp = document.querySelector('#menubar input[type="color"]');
    window.__bg = null;
    inp.addEventListener('input', () => { window.__bg = inp.value; });
    inp.nextElementSibling.click();
  });
  await new Promise((r) => setTimeout(r, 250));
  let p = await page.evaluate(() => {
    const p = document.querySelector('.color-panel');
    if (!p) return null;
    const groups = [...p.querySelectorAll('.cp-group-label')].map((e) => e.textContent);
    return {
      groups,
      swatches: p.querySelectorAll('.cp-swatch').length,
      current: (p.querySelector('.cp-swatch.current') || {}).dataset?.color || null,
      hex: (p.querySelector('.cp-hex') || {}).value || null,
      sysBtn: !!p.querySelector('.cp-sys-btn'),
      noTransp: !!p.querySelector('.no-color-btn'),
      inViewport: p.getBoundingClientRect().left >= 0 && p.getBoundingClientRect().right <= innerWidth,
    };
  });
  check('panneau ouvert', !!p);
  check('3 groupes Classiques/Pastels/Pantone', p && p.groups.join(',') === 'Classiques,Pastels,Pantone');
  check('39 swatches', p && p.swatches === 39);
  check('swatch courant surligné', p && p.current === '#ffffff');
  check('champ hex rempli', p && p.hex === '#ffffff');
  check('bouton nuancier système présent', p && p.sysBtn);
  check('pas de bouton transparent sur le fond', p && !p.noTransp);
  check('panneau dans le viewport', p && p.inViewport);

  console.log('— 3. Clic sur un swatch pastel -> couleur propagée');
  await page.evaluate(() => { document.querySelector('.cp-swatch[data-color="#ffd1dc"]').click(); });
  await new Promise((r) => setTimeout(r, 250));
  const after = await page.evaluate(() => ({
    panelClosed: !document.querySelector('.color-panel'),
    input: document.querySelector('#menubar input[type="color"]').value,
    propagated: window.__bg,
  }));
  check('panneau fermé après sélection', after.panelClosed);
  check('input value = #ffd1dc (' + after.input + ')', after.input === '#ffd1dc');
  check('événement propagé au modèle (doc.backgroundColor via input event)', after.propagated === '#ffd1dc');

  console.log('— 4. Champ hex éditable');
  await page.evaluate(() => { document.querySelector('#menubar input[type="color"]').nextElementSibling.click(); });
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => {
    const hex = document.querySelector('.cp-hex');
    hex.value = '#12ab34';
    hex.dispatchEvent(new Event('change'));
  });
  await new Promise((r) => setTimeout(r, 200));
  const hexRes = await page.evaluate(() => document.querySelector('#menubar input[type="color"]').value);
  check('hex #12ab34 appliqué (' + hexRes + ')', hexRes === '#12ab34');

  console.log('— 5. Fermetures : Échap puis clic dehors');
  await page.evaluate(() => { document.querySelector('#menubar input[type="color"]').nextElementSibling.click(); });
  await new Promise((r) => setTimeout(r, 200));
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 150));
  check('Échap ferme le panneau', await page.evaluate(() => !document.querySelector('.color-panel')));
  await page.evaluate(() => { document.querySelector('#menubar input[type="color"]').nextElementSibling.click(); });
  await new Promise((r) => setTimeout(r, 200));
  await page.mouse.click(640, 200); // clic ailleurs
  await new Promise((r) => setTimeout(r, 150));
  check('clic dehors ferme le panneau', await page.evaluate(() => !document.querySelector('.color-panel')));

  console.log('— 6. Panneau Propriétés : swatch carré + palette sur la ligne Remplissage');
  // dessiner un rect (R + drag) puis le sélectionner
  await page.keyboard.press('r');
  const toScreen = (sx, sy) => page.evaluate(([sx, sy]) => {
    const st = Konva.stages[0];
    const r = st.container().getBoundingClientRect();
    const s = st.scaleX();
    return { x: r.left + sx * s, y: r.top + sy * s };
  }, [sx, sy]);
  const a = await toScreen(100, 100), b = await toScreen(220, 180);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up();
  await new Promise((r) => setTimeout(r, 300));
  const prop = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.prop-row')];
    const fillRow = rows.find((r) => (r.querySelector('label') || {}).textContent === 'Remplissage');
    if (!fillRow) return null;
    const inp = fillRow.querySelector('input[type="color"]');
    const r = inp.getBoundingClientRect();
    const btn = inp.nextElementSibling;
    return { w: r.width, h: r.height, paletteBtn: !!(btn && btn.classList.contains('palette-btn')) };
  });
  check('forme dessinée, ligne Remplissage trouvée', !!prop);
  check('swatch propriétés carré (' + (prop && prop.w) + 'x' + (prop && prop.h) + ')', prop && prop.w === prop.h && prop.w >= 32);
  check('bouton palette présent dans les propriétés', prop && prop.paletteBtn);
  // palette des propriétés : sélectionner un swatch pantone
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.prop-row')];
    const fillRow = rows.find((r) => (r.querySelector('label') || {}).textContent === 'Remplissage');
    fillRow.querySelector('input[type="color"]').nextElementSibling.click();
  });
  await new Promise((r) => setTimeout(r, 200));
  const p2 = await page.evaluate(() => {
    const p = document.querySelector('.color-panel');
    return p ? { swatches: p.querySelectorAll('.cp-swatch').length, noTransp: !!p.querySelector('.no-color-btn') } : null;
  });
  check('panneau propriétés ouvert (39 swatches)', p2 && p2.swatches === 39);
  check('bouton transparent ∅ disponible (propriétés)', p2 && p2.noTransp);
  await page.evaluate(() => { document.querySelector('.cp-swatch[data-color="#ff6f61"]').click(); });
  await new Promise((r) => setTimeout(r, 250));
  const fillVal = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.prop-row')];
    const fillRow = rows.find((r) => (r.querySelector('label') || {}).textContent === 'Remplissage');
    return fillRow ? fillRow.querySelector('input[type="color"]').value : null;
  });
  check('swatch pantone Living Coral appliqué (' + fillVal + ')', fillVal === '#ff6f61');

  check('0 pageerror (desktop)', pageErrors.length === 0);
  if (pageErrors.length) console.log('   pageerrors:', pageErrors);
  await page.close();

  // ---------- MOBILE ----------
  const m = await browser.newPage();
  await m.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const mErrors = [];
  m.on('pageerror', (e) => mErrors.push(String(e)));
  await m.goto(BASE, { waitUntil: 'networkidle0', timeout: 20000 });
  await m.waitForSelector('#menubar input[type="color"]');
  await new Promise((r) => setTimeout(r, 400));

  console.log('— 7. Mobile 390px : swatch menubar carré et tactile');
  const mm = await m.evaluate(() => {
    const inp = document.querySelector('#menubar input[type="color"]');
    const r = inp.getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
  check('swatch carré >= 40px (' + mm.w + 'x' + mm.h + ')', mm.w === mm.h && mm.w >= 40);

  console.log('— 8. Mobile : panneau palette centré, swatches tactiles');
  await m.evaluate(() => { document.querySelector('#menubar input[type="color"]').nextElementSibling.click(); });
  await new Promise((r) => setTimeout(r, 250));
  const mp = await m.evaluate(() => {
    const p = document.querySelector('.color-panel');
    if (!p) return null;
    const r = p.getBoundingClientRect();
    const sw = p.querySelector('.cp-swatch').getBoundingClientRect();
    return {
      groups: p.querySelectorAll('.cp-group-label').length,
      swatches: p.querySelectorAll('.cp-swatch').length,
      sw: { w: sw.width, h: sw.height },
      centered: r.left >= 4 && r.right <= innerWidth - 4,
    };
  });
  check('panneau ouvert sur mobile', !!mp);
  check('3 groupes, 39 swatches', mp && mp.groups === 3 && mp.swatches === 39);
  check('swatches tactiles carrés >= 30px (' + (mp && mp.sw.w) + 'x' + (mp && mp.sw.h) + ')', mp && mp.sw.w === mp.sw.h && mp.sw.w >= 30);
  check('panneau dans le viewport (centré)', mp && mp.centered);
  await m.evaluate(() => { document.querySelector('.cp-swatch[data-color="#98ff98"]').click(); });
  await new Promise((r) => setTimeout(r, 200));
  const mv = await m.evaluate(() => document.querySelector('#menubar input[type="color"]').value);
  check('sélection tactile appliquée (' + mv + ')', mv === '#98ff98');
  check('0 pageerror (mobile)', mErrors.length === 0);
  if (mErrors.length) console.log('   pageerrors:', mErrors);
} finally {
  await browser.close();
}
console.log(failed === 0 ? '\nALL OK' : '\n' + failed + ' FAILURES');
process.exit(failed === 0 ? 0 : 1);
