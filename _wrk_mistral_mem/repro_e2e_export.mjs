// E2E EXPORT : (1) charge IIB_v3 (copie avec marqueurs title) dans l'app,
// (2) clique "Exporter HTML" et capture le telechargement via CDP,
// (3) ouvre le fichier exporte (file://) et clique le bouton "But" :
// attend CLIQUE_OK_F2 — parite editoriale complete.
import puppeteer from 'puppeteer-core';
import { readdirSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const CHROME = 'C:/Users/jl_be/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const BASE = 'http://localhost:4173/';
const APP_DOC = 'C:/_APP/PortableGit/tmp/e2e/iib-v3-e2e.json';
const DL_DIR = 'C:/_APP/PortableGit/tmp/e2e/dl';

if (existsSync(DL_DIR)) for (const f of readdirSync(DL_DIR)) console.log('ANCIEN FICHIER: ' + f);
mkdirSync(DL_DIR, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
try {
  // --- 1. L'app : charger le doc et exporter ---
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 950 });
  page.on('pageerror', (e) => console.log('  [pageerror app] ' + e.message));
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 20000 });
  const fileInput = await page.$('input[type="file"][accept=".json,application/json"]');
  await fileInput.uploadFile(APP_DOC);
  await new Promise((r) => setTimeout(r, 1000));
  console.log('ETAPE  document IIB_v3 charge dans l\'app');

  // Capture du blob AVANT l'ancre : revokeObjectURL immédiat annule le
  // telechargement intercepte en headless (race) — on lit le contenu du blob
  // via un patch de createObjectURL, sans toucher au code de l'app.
  await page.evaluate(() => {
    window.__capture = null;
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      blob.text().then((t) => { window.__capture = t; });
      return orig(blob);
    };
  });

  await page.click('button[title="Ouvrir, importer, enregistrer, exporter"]');
  await new Promise((r) => setTimeout(r, 300));
  const clicked = await page.evaluate(() => {
    const btns = document.querySelectorAll('.file-menu-panel button');
    for (const b of btns) if (b.textContent.includes('Exporter HTML')) { b.click(); return true; }
    return false;
  });
  if (!clicked) { console.log('ECHEC  bouton Exporter HTML introuvable'); process.exit(1); }
  console.log('ETAPE  Exporter HTML clique');

  let exported = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const cap = await page.evaluate(() => window.__capture);
    if (cap) { exported = DL_DIR + '/IIB_v3_export.html'; writeFileSync(exported, cap); break; }
  }
  if (!exported) { console.log('ECHEC  aucun contenu exporte capture'); process.exit(1); }
  console.log('ETAPE  export capture : ' + exported + ' (' + statSync(exported).size + ' octets)');

  // --- 2. Le fichier exporte : cliquer le bouton ---
  const p2 = await browser.newPage();
  await p2.setViewport({ width: 1500, height: 950 });
  p2.on('pageerror', (e) => console.log('  [pageerror export] ' + e.message));
  p2.on('console', (m) => { if (m.type() === 'error') console.log('  [export console.error] ' + m.text()); });
  await p2.goto(pathToFileURL(exported).href, { waitUntil: 'load', timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1200));
  console.log('ETAPE  page exportee chargee (title=' + (await p2.title()) + ')');

  const bb = await (await p2.$('#stage')).boundingBox();
  await p2.evaluate(() => { document.title = 'READY'; });
  await p2.mouse.click(bb.x + 208.6, bb.y + 126.1);
  await new Promise((r) => setTimeout(r, 900));
  const t = await p2.title();
  console.log('--- TITLE APRES CLIC SUR LE BOUTON DANS L\'EXPORT : ' + t);
  console.log(t === 'CLIQUE_OK_F2'
    ? '=== SUCCES : export = éditeur (handler + gotoAndStop("Start") -> frame 2) ==='
    : '=== ECHEC : arrete a "' + t + '" ===');
  process.exitCode = t === 'CLIQUE_OK_F2' ? 0 : 1;
} finally {
  await browser.close();
}
