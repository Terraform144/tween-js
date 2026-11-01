// E2E thème sombre : light par défaut, bascule via Fichier > Thème sombre ->
// data-theme=dark + body #002b36 (rgb(0,43,54)) + pref persistée, conservé
// après reload. La feuille #stage-container reste blanche. 0 pageerror.
import { createRequire } from 'module';
const require = createRequire('/tmp/e2e/');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const URL = 'http://127.0.0.1:4180/';
let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  userDataDir: '/tmp/chrome-prof-theme-' + Date.now(),
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('.tl-toolbar', { timeout: 10000 });

const light = await page.evaluate(() => ({
  theme: document.documentElement.dataset.theme || '(light)',
  bodyBg: getComputedStyle(document.body).backgroundColor,
  stageBg: getComputedStyle(document.getElementById('stage-container')).backgroundColor,
}));
ok(light.theme === '(light)' || light.theme === 'light', 'thème light par défaut');
ok(light.bodyBg === 'rgb(253, 246, 227)', 'body bg light #fdf6e3 -> ' + light.bodyBg);
ok(light.stageBg === 'rgb(255, 255, 255)', 'feuille blanche en light');

// bascule via le menu
await page.evaluate(() => document.querySelector('.file-menu-btn').click());
await page.waitForSelector('.file-menu-panel.open', { timeout: 3000 });
const label = await page.evaluate(() => {
  const b = [...document.querySelectorAll('.file-menu-panel.open button')].find((x) => x.textContent.includes('Thème sombre'));
  if (!b) return null;
  const t = b.textContent;
  b.click();
  return t;
});
ok(!!label, 'entrée "Thème sombre" présente (' + label + ')');
await sleep(300);
const dark = await page.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  bodyBg: getComputedStyle(document.body).backgroundColor,
  text: getComputedStyle(document.body).color,
  stageBg: getComputedStyle(document.getElementById('stage-container')).backgroundColor,
  pref: localStorage.getItem('tweenjs:theme'),
}));
ok(dark.theme === 'dark', 'data-theme=dark après bascule');
ok(dark.bodyBg === 'rgb(0, 43, 54)', 'body bg dark #002b36 -> ' + dark.bodyBg);
ok(dark.text === 'rgb(131, 148, 150)', 'texte dark #839496 -> ' + dark.text);
ok(dark.stageBg === 'rgb(255, 255, 255)', 'feuille TOUJOURS blanche en dark');
ok(dark.pref === '"dark"', 'pref persistée tweenjs:theme="dark"');

// reload -> toujours dark
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('.tl-toolbar', { timeout: 10000 });
const after = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, bodyBg: getComputedStyle(document.body).backgroundColor }));
ok(after.theme === 'dark' && after.bodyBg === 'rgb(0, 43, 54)', 'thème dark conservé après reload');

ok(pageErrors.length === 0, '0 pageerror' + (pageErrors.length ? ' : ' + pageErrors.join(' | ') : ''));
await browser.close();
console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
