// E2E COMPILÉ : charge IIB_v3 (marqueurs title) dans l'app, clique
// "Compiler un HTML", capture le blob, vérifie le fichier (zéro new
// Function, zéro eval, CSP sans unsafe-eval), l'ouvre en file:// et clique
// le bouton "But". Attend CLIQUE_OK_F2.
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync, statSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const CHROME = 'C:/Users/jl_be/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const BASE = 'http://localhost:4173/';
const APP_DOC = 'C:/_APP/PortableGit/tmp/e2e/iib-v3-e2e.json';
const OUT = 'C:/_APP/PortableGit/tmp/e2e/dl/IIB_compiled.html';
mkdirSync('C:/_APP/PortableGit/tmp/e2e/dl', { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 950 });
  page.on('pageerror', (e) => console.log('  [pageerror app] ' + e.message));
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 20000 });
  await (await page.$('input[type="file"][accept=".json,application/json"]')).uploadFile(APP_DOC);
  await new Promise((r) => setTimeout(r, 1000));
  console.log('ETAPE  document IIB_v3 charge');

  await page.evaluate(() => {
    window.__capture = null;
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { blob.text().then((t) => { window.__capture = t; }); return orig(blob); };
  });
  await page.click('button[title="Ouvrir, importer, enregistrer, exporter"]');
  await new Promise((r) => setTimeout(r, 300));
  const clicked = await page.evaluate(() => {
    const btns = document.querySelectorAll('.file-menu-panel button');
    for (const b of btns) if (b.textContent.includes('Compiler un HTML')) { b.click(); return true; }
    return false;
  });
  if (!clicked) { console.log('ECHEC  bouton Compiler un HTML introuvable'); process.exit(1); }
  console.log('ETAPE  Compiler un HTML clique');

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const cap = await page.evaluate(() => window.__capture);
    if (cap) { writeFileSync(OUT, cap); break; }
  }
  if (!readFileSync(OUT, 'utf8')) { console.log('ECHEC  compilation non capturee'); process.exit(1); }
  console.log('ETAPE  fichier compile : ' + statSync(OUT).size + ' octets');

  // --- Vérifications statiques du fichier compilé ---
  const src = readFileSync(OUT, 'utf8');
  const nf = (src.match(/new Function/g) || []).length;
  const ev = (src.match(/\beval\s*\(/g) || []).length;
  const csp = src.includes("Content-Security-Policy");
  const cspNoEval = !/unsafe-eval/.test(src);
  const fnReal = src.includes('function(Scene, Game, console, named, createjs)');
  console.log('--- new Function dans le fichier : ' + nf + ' (attendu 0)');
  console.log('--- eval( dans le fichier : ' + ev + ' (attendu 0)');
  console.log('--- CSP presente : ' + csp + ' | sans unsafe-eval : ' + cspNoEval);
  console.log('--- fonctions reelles compilées visibles : ' + fnReal);

  // --- Test dynamique : ouvrir et cliquer ---
  const p2 = await browser.newPage();
  await p2.setViewport({ width: 1500, height: 950 });
  p2.on('pageerror', (e) => console.log('  [pageerror compile] ' + e.message));
  p2.on('console', (m) => { if (m.type() === 'error') console.log('  [compile console.error] ' + m.text()); });
  await p2.goto(pathToFileURL(OUT).href, { waitUntil: 'load', timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1200));
  console.log('ETAPE  compile charge (title=' + (await p2.title()) + ')');

  const bb = await (await p2.$('#stage')).boundingBox();
  await p2.evaluate(() => { document.title = 'READY'; });
  await p2.mouse.click(bb.x + 208.6, bb.y + 126.1);
  await new Promise((r) => setTimeout(r, 900));
  const t = await p2.title();
  console.log('--- TITLE APRES CLIC SUR LE BOUTON DANS LE COMPILE : ' + t);
  const ok = t === 'CLIQUE_OK_F2' && nf === 0 && ev === 0 && csp && cspNoEval && fnReal;
  console.log(ok
    ? '=== SUCCES : compile jouable, sans eval, sous CSP stricte ==='
    : '=== ECHEC (title=' + t + ', newFunction=' + nf + ', eval=' + ev + ') ===');
  process.exitCode = ok ? 0 : 1;
} finally {
  await browser.close();
}
