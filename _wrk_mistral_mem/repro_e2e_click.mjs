// E2E v4 : charge un document JSON complet (rect nomme "But" + script de test)
// via le vrai flux "Ouvrir...", puis Exécuter, puis clic sur le rect.
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const CHROME = 'C:/Users/jl_be/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const BASE = 'http://localhost:4173/';
const DOC_JSON = new URL('./doc-e2e.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const CODE = [
  'Scene.log("createjs :", typeof createjs);',
  'Scene.log("But typeof:", typeof But);',
  'document.title = "SCRIPT_OK";',
  'Scene.play();',
  'Scene.on("stagemousedown", function () { document.title = "STAGE_MD"; });',
  'But.on("mousedown", function () { document.title = "BUT_MD"; });',
  'But.on("click", function () { document.title = "CLIQUE_OK"; });',
].join('\n');

// 1. Document fabrique avec le VRAI modele du projet (format garanti)
const model = await import(pathToFileURL('F:/_SRC/__Debrouillard/Animate_JS_PRJ/src/core/model.js').href);
const doc = model.createDocument({ name: 'E2E-But', width: 550, height: 400 });
const rect = model.createShape('rect', { x: 275, y: 200, width: 120, height: 90, fill: '#cb4b16' });
rect.name = 'But';
doc.layers[0].keyframes[0].elements.push(rect);
doc.scripts[0].code = CODE;
writeFileSync(DOC_JSON, JSON.stringify(doc));
console.log('ETAPE  document E2E ecrit : ' + DOC_JSON);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 950 });
  page.on('pageerror', (e) => console.log('  [pageerror] ' + e.message));
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 20000 });

  // 2. Ouvrir le document (le vrai flux utilisateur)
  const fileInput = await page.$('input[type="file"][accept=".json,application/json"]');
  if (!fileInput) { console.log('ECHEC  input file JSON introuvable'); process.exit(1); }
  await fileInput.uploadFile(DOC_JSON);
  await new Promise((r) => setTimeout(r, 800));
  const consoleAfterOpen = await page.$eval('.script-console', (el) => el.textContent).catch(() => '');
  console.log('ETAPE  document charge (console panel: ' + JSON.stringify(consoleAfterOpen) + ')');

  // 3. Verifier que l'editeur contient bien le script du document
  const seen = await page.$eval('.cm-content', (el) => el.textContent).catch(() => '');
  console.log('ETAPE  editeur = ' + JSON.stringify(seen.slice(0, 60)));

  // 4. Executer
  await page.click('button[title="Exécuter (Ctrl+Entrée)"]');
  await new Promise((r) => setTimeout(r, 700));
  const consoleText = await page.$eval('.script-console', (el) => el.textContent).catch(() => '(introuvable)');
  console.log('--- CONSOLE PANNEAU : ' + consoleText);
  console.log('--- TITLE APRES EXECUTER : ' + await page.title());

  // 5. Clic sur le rect (centre scene 275,200 -> coords ecran via boundingBox)
  const bb = await (await page.$('#stage-container canvas')).boundingBox();
  const sx = bb.x + 275, sy = bb.y + 200;
  await page.evaluate(() => { document.title = 'READY'; });
  await page.mouse.click(sx, sy);
  await new Promise((r) => setTimeout(r, 700));
  const t = await page.title();
  console.log('--- TITLE APRES CLIC : ' + t);
  console.log(t === 'CLIQUE_OK' ? '=== SUCCES : handler But.on("click") declenche ===' : '=== DIAGNOSTIC : arret a "' + t + '" ===');
  process.exitCode = t === 'CLIQUE_OK' ? 0 : 1;
} finally {
  await browser.close();
}
