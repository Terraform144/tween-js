// E2E bascule du panneau latéral gauche/droite (bouton < | > au-dessus du
// panneau). Défaut = droite ; clic -> classe sidebar-left sur #main, la sidebar
// passe à GAUCHE de la scène, pref 'sidebarSide' persistée et conservée au
// reload ; re-clic -> retour à droite. 0 pageerror.
// Run: node _wrk_mistral_mem/repro_e2e_sidebar_side.mjs  (vite preview :4180)
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
  userDataDir: '/tmp/chrome-prof-side-' + Date.now(),
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('#sidebar-side-btn', { timeout: 10000 });
await sleep(400);

const geom = () => page.evaluate(() => {
  const main = document.getElementById('main');
  const sb = document.getElementById('sidebar').getBoundingClientRect();
  const st = document.getElementById('stage-wrap').getBoundingClientRect();
  return {
    leftClass: main.classList.contains('sidebar-left'),
    cols: main.style.gridTemplateColumns,
    sidebarLeft: sb.left, sidebarRight: sb.right,
    stageLeft: st.left, stageRight: st.right,
    pref: localStorage.getItem('tweenjs:sidebarSide'),
    btnTitle: document.getElementById('sidebar-side-btn').title,
  };
});

// 1) défaut : panneau à droite
const d = await geom();
ok(!d.leftClass, 'par défaut : pas de classe sidebar-left');
ok(d.sidebarLeft > d.stageRight - 5, `sidebar à droite de la scène (sidebar.left=${Math.round(d.sidebarLeft)} > stage.right=${Math.round(d.stageRight)})`);
ok(d.pref === null, 'pas de pref enregistrée au premier chargement');

// 2) clic -> panneau à gauche
await page.click('#sidebar-side-btn');
await sleep(400);
const l = await geom();
ok(l.leftClass, 'clic -> classe sidebar-left sur #main');
ok(l.sidebarRight < l.stageLeft + 5, `sidebar à GAUCHE de la scène (sidebar.right=${Math.round(l.sidebarRight)} < stage.left=${Math.round(l.stageLeft)})`);
ok(l.pref === '"left"', 'pref persistée tweenjs:sidebarSide="left"');
ok(/Panneau à droite/.test(l.btnTitle), 'title du bouton = action inverse -> ' + l.btnTitle);

// 3) reload -> toujours à gauche
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('#sidebar-side-btn', { timeout: 10000 });
await sleep(400);
const r = await geom();
ok(r.leftClass && r.sidebarRight < r.stageLeft + 5, 'après reload : panneau toujours à gauche');

// 4) re-clic -> retour à droite
await page.click('#sidebar-side-btn');
await sleep(400);
const b = await geom();
ok(!b.leftClass && b.sidebarLeft > b.stageRight - 5, 're-clic -> panneau de retour à droite');
ok(b.pref === '"right"', 'pref repassée à "right"');

ok(pageErrors.length === 0, '0 pageerror' + (pageErrors.length ? ' : ' + pageErrors.join(' | ') : ''));
await browser.close();
console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
