// Harnais E2E : bouton « Faire un don » du menu À propos (version vanilla).
// Vérifie : présence du bouton, première position dans le menu, style jaune,
// libellé, icône, et ouverture de l'URL PayPal au clic (window.open stubbé).
// Run : copier dans /tmp/e2e puis `node donate-test.mjs` (serveur 4175).
import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Users/jl_be/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const BASE = 'http://localhost:4175/';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
let failed = 0;
function check(label, cond) {
  console.log((cond ? '  OK  ' : 'FAIL  ') + label);
  if (!cond) failed++;
}

await page.evaluateOnNewDocument(() => {
  window.__opens = [];
  window.open = (u) => { window.__opens.push(u); return null; };
});
await page.goto(BASE, { waitUntil: 'networkidle0' });

await page.waitForSelector('.file-menu-btn');
const clicked = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('#menubar .file-menu-btn')];
  const b = btns.find(x => x.textContent.includes('À propos'));
  if (!b) return false;
  b.click();
  return true;
});
check('Menu « À propos » trouvé et ouvert', clicked);

await page.waitForSelector('.file-menu-panel.open');
const info = await page.evaluate(() => {
  const panel = document.querySelector('.file-menu-panel.open');
  const donate = panel.querySelector('button.donate-btn');
  if (!donate) return { found: false };
  const cs = getComputedStyle(donate);
  return {
    found: true,
    first: panel.firstElementChild === donate,
    label: donate.textContent.trim(),
    bg: cs.backgroundColor,
    hasHeart: !!donate.querySelector('svg path'),
  };
});
check('Bouton donate-btn présent', info.found);
check('Bouton en première position du menu', info.found && info.first);
check('Libellé « Faire un don »', info.found && info.label === 'Faire un don');
check('Fond jaune', info.found && info.bg === 'rgb(255, 221, 87)');
check('Icône cœur affichée', info.found && info.hasHeart);

await page.click('.file-menu-panel.open button.donate-btn');
const opens = await page.evaluate(() => window.__opens);
check('Clic ouvre l\'URL PayPal', opens.length === 1
  && opens[0] === 'https://www.paypal.com/donate/?hosted_button_id=HCDEXV9E52EAW');

await browser.close();
console.log(failed === 0 ? 'TOUS LES TESTS PASSENT' : `${failed} ÉCHEC(S)`);
process.exit(failed === 0 ? 0 : 1);
