// E2E scrollbars de la zone de travail — #stage-scroll porte les scrollbars (la feuille entière déborde)
// H/V natives dès que la feuille dépasse (zoom ou fenêtre étroite), toute la
// feuille reste atteignable (centrage sûr par margin:auto, plus de
// justify-content:center qui coupait le côté haut/gauche), les règles restent
// épinglées avec des graduations qui suivent le scroll, l'outil main scrolle,
// et le zoom molette garde le point sous le curseur.
// Run: node _wrk_mistral_mem/repro_e2e_scrollbars.mjs  (vite preview :4180)
import { createRequire } from 'module';

const require = createRequire('/tmp/e2e/');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const URL = 'http://127.0.0.1:4180/';

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };

const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('.tl-toolbar');
await new Promise(r => setTimeout(r, 400));

//Snapshot de la géométrie utile
const snap = () => page.evaluate(() => {
  const wrap = document.getElementById('stage-wrap');
  const sc = document.getElementById('stage-scroll');
  const cont = document.getElementById('stage-scroll');
  const pan = cont.querySelector('.stage-pan-layer');
  const rulerH = document.getElementById('ruler-h');
  const rulerV = document.getElementById('ruler-v');
  const r = (el) => { const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
  return {
    wrap: r(wrap),
    scroller: { ...r(sc), clientWidth: sc.clientWidth, clientHeight: sc.clientHeight, offsetWidth: sc.offsetWidth, offsetHeight: sc.offsetHeight, scrollWidth: sc.scrollWidth, scrollHeight: sc.scrollHeight, scrollLeft: sc.scrollLeft, scrollTop: sc.scrollTop },
    pan: r(pan),
    rulerH: r(rulerH), rulerV: r(rulerV),
    rulerHVisible: rulerH && getComputedStyle(rulerH).display !== 'none',
    zoomLabel: document.querySelector('.zoom-percent')?.textContent,
    rulerHData: document.querySelector('#ruler-h canvas') ? document.querySelector('#ruler-h canvas').toDataURL().length + ':' + document.querySelector('#ruler-h canvas').toDataURL().slice(100, 160) : null,
  };
});

console.log('— 1. Zoom 100% : la feuille tient dans la zone, pas de scrollbars');
let s = await snap();
ok(s.scroller.scrollWidth <= s.scroller.clientWidth && s.scroller.scrollHeight <= s.scroller.clientHeight, 'pas de débordement à 100% (doc 550x400 tient)');
ok(s.scroller.offsetWidth - s.scroller.clientWidth === 0 && s.scroller.offsetHeight - s.scroller.clientHeight === 0, 'aucune scrollbar affichée à 100%');

console.log('— 2. Zoom x2 (4 clics sur +) : débordement H+V, scrollbars visibles');
await page.evaluate(() => { const bs = document.querySelectorAll('.stage-zoom-controls button'); for (let i = 0; i < 4; i++) bs[2].click(); });
await new Promise(r => setTimeout(r, 300));
s = await snap();
ok(s.zoomLabel === '200%', 'zoom affiché = 200% (était ' + s.zoomLabel + ')');
ok(s.scroller.scrollWidth > s.scroller.clientWidth, 'débordement horizontal (scrollWidth ' + s.scroller.scrollWidth + ' > clientWidth ' + s.scroller.clientWidth + ')');
ok(s.scroller.scrollHeight > s.scroller.clientHeight, 'débordement vertical (scrollHeight ' + s.scroller.scrollHeight + ' > clientHeight ' + s.scroller.clientHeight + ')');
// (headless shell = scrollbars overlay sans épaisseur : on teste la
// scrollabilité fonctionnelle plutôt que la largeur des barres)
const scrollWorks = await page.evaluate(() => { const sc = document.getElementById('stage-scroll'); sc.scrollLeft = 37; sc.scrollTop = 23; const r = sc.scrollLeft === 37 && sc.scrollTop === 23; sc.scrollLeft = 0; sc.scrollTop = 0; return r; });
ok(scrollWorks, 'le scroller répond au scroll H et V (scrollLeft/Top modifiables)');

console.log('— 3. Toute la feuille est atteignable (coin haut-gauche puis bas-droit)');
await page.evaluate(() => { const sc = document.getElementById('stage-scroll'); sc.scrollLeft = 0; sc.scrollTop = 0; });
await new Promise(r => setTimeout(r, 150));
s = await snap();
ok(Math.abs(s.pan.left - s.scroller.left) < 3 && Math.abs(s.pan.top - s.scroller.top) < 3, 'scroll (0,0) : le coin haut-gauche de la feuille est visible (pan.left=' + s.pan.left.toFixed(1) + ' vs scroller.left=' + s.scroller.left.toFixed(1) + ')');
await page.evaluate(() => { const sc = document.getElementById('stage-scroll'); sc.scrollLeft = sc.scrollWidth; sc.scrollTop = sc.scrollHeight; });
await new Promise(r => setTimeout(r, 150));
s = await snap();
ok(Math.abs(s.pan.right - (s.scroller.left + s.scroller.clientWidth)) < 3, 'scroll max X : le coin droit de la feuille est visible');
ok(Math.abs(s.pan.bottom - (s.scroller.top + s.scroller.clientHeight)) < 3, 'scroll max Y : le coin bas de la feuille est visible');

console.log('— 4. Règles épinglées + graduations suivent le scroll');
const r0 = await snap();
await page.evaluate(() => { const sc = document.getElementById('stage-scroll'); sc.scrollLeft = 0; sc.scrollTop = 0; });
await new Promise(r => setTimeout(r, 150));
const r1 = await snap();
ok(r1.rulerHVisible, 'règle horizontale visible');
ok(Math.abs(r1.rulerH.top - r1.wrap.top) < 2 && Math.abs(r1.rulerV.left - r1.wrap.left) < 2, 'règles épinglées en haut/gauche de la zone (hors scroller)');
ok(Math.abs(r0.rulerH.top - r1.rulerH.top) < 2 && Math.abs(r0.rulerV.left - r1.rulerV.left) < 2, 'règles ne bougent pas quand on scrolle');
ok(r0.rulerHData !== r1.rulerHData, 'graduations de la règle H redessinées après scroll');

console.log('— 5. Outil main (M) : le drag scrolle la zone');
await page.evaluate(() => { const sc = document.getElementById('stage-scroll'); sc.scrollLeft = 60; sc.scrollTop = 40; });
await page.keyboard.press('m');
await new Promise(r => setTimeout(r, 100));
const before = await snap();
const cx = before.scroller.left + before.scroller.clientWidth / 2;
const cy = before.scroller.top + before.scroller.clientHeight / 2;
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx - 60, cy - 40, { steps: 8 });
await page.mouse.up();
await new Promise(r => setTimeout(r, 150));
const after = await snap();
ok(Math.abs(after.scroller.scrollLeft - (before.scroller.scrollLeft + 60)) < 4, 'drag main de -60px en X -> scrollLeft ' + before.scroller.scrollLeft + ' -> ' + after.scroller.scrollLeft);
ok(Math.abs(after.scroller.scrollTop - (before.scroller.scrollTop + 40)) < 4, 'drag main de -40px en Y -> scrollTop ' + before.scroller.scrollTop + ' -> ' + after.scroller.scrollTop);
await page.keyboard.press('m');

console.log('— 6. Zoom molette Ctrl : le point sous le curseur reste sous le curseur');
await page.evaluate(() => { const sc = document.getElementById('stage-scroll'); sc.scrollLeft = 100; sc.scrollTop = 60; });
await new Promise(r => setTimeout(r, 100));
const ax = (await snap()).scroller.left + 220;
const ay = (await snap()).scroller.top + 180;
await page.mouse.move(ax, ay);
await new Promise(r => setTimeout(r, 100));
const p1 = await page.evaluate(() => Konva.stages[0].getRelativePointerPosition());
await page.keyboard.down('Control');
await page.mouse.wheel({ deltaY: -120 });
await page.keyboard.up('Control');
await new Promise(r => setTimeout(r, 200));
await page.mouse.move(ax, ay);
await new Promise(r => setTimeout(r, 100));
const p2 = await page.evaluate(() => Konva.stages[0].getRelativePointerPosition());
const s6 = await snap();
ok(s6.zoomLabel === '225%', 'zoom passé à 225% (était ' + s6.zoomLabel + ')');
ok(p1 && p2 && Math.abs(p1.x - p2.x) < 1.5 && Math.abs(p1.y - p2.y) < 1.5, 'point document sous le curseur invariant (' + (p1 && p1.x.toFixed(1)) + ',' + (p1 && p1.y.toFixed(1)) + ') -> (' + (p2 && p2.x.toFixed(1)) + ',' + (p2 && p2.y.toFixed(1)) + ')');

console.log('— 7. Reset zoom (clic sur le %) : retour à 100%, plus de débordement');
await page.click('.zoom-percent');
await new Promise(r => setTimeout(r, 250));
s = await snap();
ok(s.zoomLabel === '100%', 'zoom revenu à 100%');
ok(s.scroller.scrollWidth <= s.scroller.clientWidth && s.scroller.scrollHeight <= s.scroller.clientHeight, 'plus de débordement à 100%');
ok(s.scroller.scrollLeft === 0 && s.scroller.scrollTop === 0, 'scroll remis à zéro');

console.log('— 8. Fenêtre réduite : la scène se re-fit, pas de débordement à 100%');
await page.setViewport({ width: 640, height: 480 });
await new Promise(r => setTimeout(r, 400));
s = await snap();
ok(s.scroller.scrollWidth <= s.scroller.clientWidth && s.scroller.scrollHeight <= s.scroller.clientHeight, 'à 640x480 la feuille tient toujours (fitScale)');

ok(pageErrors.length === 0, '0 pageerror' + (pageErrors.length ? ' : ' + pageErrors.join(' | ') : ''));

console.log(`\n${pass} OK, ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
