// E2E : le document REEL de l'utilisateur (IIB_v3.test.json, seul changement :
// alert() -> marqueur document.title) charge via Ouvrir..., Exécuter, clic
// sur le bouton "But" (scene ~208,126). Attend CLIQUE_OK_F2 : le handler a
// ete declenche ET gotoAndStop("Start") a saute au label (frame 2).
import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Users/jl_be/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const BASE = 'http://localhost:4173/';
const DOC = 'C:/_APP/PortableGit/tmp/e2e/iib-v3-e2e.json';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 950 });
  page.on('pageerror', (e) => console.log('  [pageerror] ' + e.message));
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 20000 });

  const fileInput = await page.$('input[type="file"][accept=".json,application/json"]');
  await fileInput.uploadFile(DOC);
  await new Promise((r) => setTimeout(r, 1000));
  console.log('ETAPE  IIB_v3 charge');

  await page.click('button[title="Exécuter (Ctrl+Entrée)"]');
  await new Promise((r) => setTimeout(r, 900));
  const consoleText = await page.$eval('.script-console', (el) => el.textContent).catch(() => '(introuvable)');
  console.log('--- CONSOLE PANNEAU : ' + consoleText);

  // Bouton : instance But (25.6, -401.9) + rect symbole (183, 528) -> scene ~ (208.6, 126.1)
  const bb = await (await page.$('#stage-container canvas')).boundingBox();
  const sx = bb.x + 208.6, sy = bb.y + 126.1;
  await page.evaluate(() => { document.title = 'READY'; });
  await page.mouse.click(sx, sy);
  await new Promise((r) => setTimeout(r, 800));
  const t = await page.title();
  console.log('--- TITLE APRES CLIC SUR LE BOUTON : ' + t);
  const ok = t.startsWith('CLIQUE_OK');
  console.log(ok ? '=== SUCCES : handler declenche' + (t === 'CLIQUE_OK_F2' ? ' + gotoAndStop("Start") -> frame 2 ===' : ' (title=' + t + ') ===') : '=== ECHEC : arrete a "' + t + '" ===');
  process.exitCode = ok ? 0 : 1;
} finally {
  await browser.close();
}
