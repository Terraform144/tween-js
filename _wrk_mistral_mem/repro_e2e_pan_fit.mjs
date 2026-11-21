// E2E pan à 100% (feuille ajustée, PAS de débordement) : le pan doit
// fonctionner via le transform de .stage-pan-layer (régression Electron/PRJ
// 18/11 : avant, le scroll ne pouvait rien déplacer). + pan à 175% (scroll).
// Run: node _wrk_mistral_mem/repro_e2e_pan_fit.mjs  (vite preview :4180)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');

const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const URL = 'http://127.0.0.1:4180/';
let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  userDataDir: '/tmp/chrome-prof-panfit-' + Date.now(),
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('.tl-toolbar', { timeout: 10000 });
await sleep(400);

async function drag() {
  const stage = await page.evaluate(() => {
    const r = document.querySelector('.konvajs-content').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(stage.x, stage.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(stage.x - i * 10, stage.y - i * 5);
  await page.mouse.up();
  await sleep(250);
}
const state = () => page.evaluate(() => {
  const c = document.getElementById('stage-container');
  const sc = document.getElementById('stage-scroll');
  return {
    scrollLeft: sc.scrollLeft, scrollTop: sc.scrollTop,
    scrollW: sc.scrollWidth, clientW: sc.clientWidth, scrollH: sc.scrollHeight, clientH: sc.clientHeight,
    transform: c.style.transform || '',
  };
});

// A) 100% : pas de débordement -> pan par transform
await page.click('.zoom-hand-btn'); await sleep(250);
ok(await page.evaluate(() => document.querySelector('.zoom-hand-btn').classList.contains('active')), 'outil main actif');
const a0 = await state();
ok(a0.scrollW <= a0.clientW + 1, 'à 100% la feuille tient dans la zone (pas de scroll possible)');
await drag();
const a1 = await state();
ok(a1.transform === 'translate(-100px, -50px)', 'pan 100% : le cadre entier bouge, translate(-100px, -50px) -> ' + (a1.transform || '(vide)'));

// reset zoom -> transform remis à zéro
await page.click('.zoom-percent'); await sleep(250);
ok((await state()).transform === '', 'reset zoom -> transform remis à zéro');

// B) 175% : débordement -> pan par scroll
for (let i = 0; i < 3; i++) { await page.click('button[title="Agrandir le zoom (Ctrl+molette)"]'); await sleep(150); }
const b0 = await state();
ok(b0.scrollW > b0.clientW || b0.scrollH > b0.clientH, 'à 175% la feuille déborde (au moins un axe)');
await drag();
const b1 = await state();
ok(b1.scrollTop !== b0.scrollTop || b1.scrollLeft !== b0.scrollLeft, `pan 175% : scroll a bougé (${b0.scrollLeft},${b0.scrollTop}) -> (${b1.scrollLeft},${b1.scrollTop})`);
ok(b1.transform === '', 'pan 175% : pas de transform (scroll pur)');

ok(pageErrors.length === 0, '0 pageerror' + (pageErrors.length ? ' : ' + pageErrors.join(' | ') : ''));
await browser.close();
console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
