// E2E export "projet vers dossier" — preuve dans un vrai navigateur (headless).
// On installe un faux window.showDirectoryPicker (après chargement : il n'est
// lu qu'au clic) qui enregistre chaque write dans window.__written ; doc avec
// un asset PNG + un script chargé via Ouvrir... ; Fichier > "Exporter projet
// vers dossier…" ; vérifie l'arborescence écrite : projet.json (tjsFormat, src
// relatif, dataUrl retiré) + assets/*.png (octets) + scripts/*.js (code).
// Run: node _wrk_mistral_mem/repro_e2e_projectexport.mjs   (vite preview :4180 + puppeteer-core /tmp/e2e)
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { createDocument, createScript, createAsset, addAsset } from '../src/core/model.js';

const require = createRequire('/tmp/e2e/');
const puppeteer = require('puppeteer-core');

const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const URL = 'http://127.0.0.1:4180/';

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const doc = createDocument({ name: 'Projet E2E' });
doc.scripts = [createScript('Principal', 'Scene.log("hello export");')];
addAsset(doc, createAsset({ name: 'pixel', type: 'image/png', dataUrl: PNG_1PX, width: 1, height: 1 }));
writeFileSync('/tmp/e2e/projet-test.json', JSON.stringify(doc));

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  userDataDir: '/tmp/chrome-prof-' + Date.now(),
  args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('  [page]', m.type(), m.text().slice(0, 160)); });

// Faux handle de dossier FSA (installé avant chargement) : enregistre les
// writes dans window.__written. Lu uniquement au clic sur le menu export.
await page.evaluateOnNewDocument(() => {
  window.__written = {};
  window.alert = (m) => { window.__alert = String(m); };
  const makeDir = (prefix) => ({
    kind: 'directory',
    name: prefix || 'dossier',
    getDirectoryHandle: async (name) => makeDir(prefix ? prefix + '/' + name : name),
    getFileHandle: async (name) => ({
      kind: 'file',
      name,
      createWritable: async () => ({
        write: async (data) => {
          window.__written[(prefix ? prefix + '/' : '') + name] =
            data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
        },
        close: async () => {},
      }),
    }),
  });
  window.showDirectoryPicker = async () => [makeDir('')];
});

await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('.tl-toolbar', { timeout: 10000 });

// charge le doc via le vrai flux Ouvrir...
const input = await page.$('input[type=file][accept=".json,application/json"]');
await input.uploadFile('/tmp/e2e/projet-test.json');
await sleep(400);


// menu Fichier > "Exporter projet vers dossier…" (clic DOM : page.click souris
// semble instable ici, on dispatch directement)
await page.evaluate(() => document.querySelector('.file-menu-btn').click());
await page.waitForSelector('.file-menu-panel.open', { timeout: 3000 });
const clicked = await page.evaluate(() => {
  const b = [...document.querySelectorAll('.file-menu-panel.open button')].find((x) => x.textContent.includes('dossier'));
  if (!b) return false;
  b.click();
  return true;
});
ok(clicked, 'entrée "Exporter projet vers dossier…" cliquée');

// attend l'écriture de projet.json
let paths = null;
for (let i = 0; i < 50; i++) {
  await sleep(150);
  paths = await page.evaluate(() => Object.keys(window.__written));
  if (paths.includes('projet.json')) break;
}
ok(paths && paths.includes('projet.json'), 'projet.json écrit : ' + (paths || []).join(', '));

const alertMsg = await page.evaluate(() => window.__alert || null);
if (alertMsg) console.log('  ALERT page:', alertMsg.slice(0, 200));
const check = await page.evaluate(() => {
  const dec = new TextDecoder();
  const w = window.__written;
  const json = JSON.parse(dec.decode(w['projet.json']));
  const assetId = Object.keys(json.assets)[0];
  const assetPath = json.assets[assetId].src;
  const scriptPath = Object.keys(w).find((p) => p.startsWith('scripts/') && p.endsWith('.js'));
  return {
    paths: Object.keys(w).sort(),
    tjsFormat: json.tjsFormat,
    assetSrc: assetPath,
    assetHasDataUrl: 'dataUrl' in json.assets[assetId],
    pngMagic: w[assetPath] ? [w[assetPath][0], w[assetPath][1], w[assetPath][2], w[assetPath][3]] : null,
    scriptPath,
    scriptCode: scriptPath ? dec.decode(w[scriptPath]) : null,
  };
});
ok(check.tjsFormat === 'folder-project', 'projet.json porte tjsFormat=folder-project');
ok(check.assetSrc === 'assets/pixel.png', 'asset référencé par src relatif : ' + check.assetSrc);
ok(check.assetHasDataUrl === false, 'dataUrl retiré du JSON');
ok(check.pngMagic && check.pngMagic.join(',') === '137,80,78,71', 'assets/pixel.png = octets PNG (magic 89 50 4E 47)');
ok(check.scriptPath === 'scripts/Principal.js', 'script éclaté : ' + check.scriptPath);
ok(check.scriptCode === 'Scene.log("hello export");', 'contenu du .js exact');

ok(pageErrors.length === 0, '0 pageerror' + (pageErrors.length ? ' : ' + pageErrors.join(' | ') : ''));

await browser.close();
console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
