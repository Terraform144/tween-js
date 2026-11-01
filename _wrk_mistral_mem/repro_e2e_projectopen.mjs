// E2E v2 "Ouvrir un dossier…" — dans un vrai navigateur (headless).
// Scénario : doc (asset PNG + script v1) chargé ; export vers un faux dossier
// FSA (écrit dans __written) ; on modifie scripts/Principal.js "dans VS Code" ;
// Fichier > "Ouvrir un dossier…" relit le dossier -> le nouveau projet ouvert
// doit avoir le script v2 (source de vérité = .js) et l'asset en dataUrl.
// Vérification via Enregistrer JSON du projet actif (blob capturé).
// Run: node _wrk_mistral_mem/repro_e2e_projectopen.mjs   (vite preview :4180 + puppeteer-core /tmp/e2e)
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { createDocument, createScript, createAsset, addAsset } from '../src/core/model.js';

const require = createRequire('/tmp/e2e/');
const puppeteer = require('puppeteer-core');

const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const URL = 'http://127.0.0.1:4180/';

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const doc = createDocument({ name: 'ProjetV2' });
doc.scripts = [createScript('Principal', 'Scene.log("v1");')];
addAsset(doc, createAsset({ name: 'pixel', type: 'image/png', dataUrl: PNG_1PX, width: 1, height: 1 }));
writeFileSync('/tmp/e2e/projetv2-test.json', JSON.stringify(doc));

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  userDataDir: '/tmp/chrome-prof-v2-' + Date.now(),
  args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

await page.evaluateOnNewDocument(() => {
  window.alert = (m) => { window.__alert = String(m); };
  // capture des téléchargements (Enregistrer JSON)
  const orig = URL.createObjectURL.bind(URL);
  window.__captured = [];
  URL.createObjectURL = (b) => { window.__captured.push(b); return orig(b); };
  // faux FSA : écriture dans __written, lecture depuis __written
  window.__written = {};
  const enc = new TextEncoder();
  const fileHandle = (path, bytes) => ({
    kind: 'file', name: path.split('/').pop(),
    getFile: async () => ({ arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }),
    createWritable: async () => ({ write: async (d) => { window.__written[path] = d instanceof Uint8Array ? d : enc.encode(String(d)); }, close: async () => {} }),
  });
  const dirFromTree = (tree, prefix) => ({
    kind: 'directory', name: prefix || 'dossier',
    entries: async function* () {
      const seen = new Set();
      for (const p of Object.keys(tree)) {
        const rest = prefix ? p.slice(prefix.length + 1) : p;
        if (prefix && !p.startsWith(prefix + '/')) continue;
        const slash = rest.indexOf('/');
        if (slash < 0) { yield [rest, fileHandle(p, tree[p])]; }
        else {
          const d = rest.slice(0, slash);
          if (!seen.has(d)) { seen.add(d); yield [d, dirFromTree(tree, prefix ? prefix + '/' + d : d)]; }
        }
      }
    },
    getDirectoryHandle: async (name) => dirFromTree(tree, prefix ? prefix + '/' + name : name),
    getFileHandle: async (name) => fileHandle(prefix ? prefix + '/' + name : name, tree[prefix ? prefix + '/' + name : name]),
  });
  window.showDirectoryPicker = async (opts) => {
    if (opts && opts.mode === 'read') return [dirFromTree(window.__written, '')];
    // readwrite : dossier d'écriture neuf, rattaché à __written
    const root = {};
    const proxyDir = dirFromTree({}, '');
    const wrap = (h, prefix) => ({
      kind: 'directory', name: h.name,
      getDirectoryHandle: async (n) => wrap(await h.getDirectoryHandle(n), prefix ? prefix + '/' + n : n),
      getFileHandle: async (n) => {
        const p = prefix ? prefix + '/' + n : n;
        return { kind: 'file', name: n, createWritable: async () => ({ write: async (d) => { window.__written[p] = d instanceof Uint8Array ? d : enc.encode(String(d)); }, close: async () => {} }) };
      },
    });
    return [wrap(proxyDir, '')];
  };
});

await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('.tl-toolbar', { timeout: 10000 });
const input = await page.$('input[type=file][accept=".json,application/json"]');
await input.uploadFile('/tmp/e2e/projetv2-test.json');
await sleep(400);

// 1) export vers le faux dossier
await page.evaluate(() => document.querySelector('.file-menu-btn').click());
await page.waitForSelector('.file-menu-panel.open', { timeout: 3000 });
await page.evaluate(() => [...document.querySelectorAll('.file-menu-panel.open button')].find((b) => b.textContent.includes('dossier…') && b.textContent.includes('Exporter')).click());
let paths = [];
for (let i = 0; i < 40; i++) { await sleep(150); paths = await page.evaluate(() => Object.keys(window.__written)); if (paths.includes('projet.json')) break; }
ok(paths.includes('projet.json') && paths.some((p) => p.startsWith('scripts/')), 'export v1 écrit : ' + paths.join(', '));

// 2) modif "VS Code" du script dans le dossier
await page.evaluate(() => {
  window.__written['scripts/Principal.js'] = new TextEncoder().encode('Scene.log("v2 depuis VS Code");');
});

// 3) Ouvrir un dossier…
await page.evaluate(() => document.querySelector('.file-menu-btn').click());
await page.waitForSelector('.file-menu-panel.open', { timeout: 3000 });
await page.evaluate(() => [...document.querySelectorAll('.file-menu-panel.open button')].find((b) => b.textContent.includes('Ouvrir un dossier')).click());
await sleep(800);
const alertMsg = await page.evaluate(() => window.__alert || null);
ok(!alertMsg, 'pas d\'erreur au chargement du dossier' + (alertMsg ? ' : ' + alertMsg.slice(0, 120) : ''));

// 4) le projet ouvert = nouvel onglet actif ; on récupère son JSON via Enregistrer JSON
await page.evaluate(() => document.querySelector('.file-menu-btn').click());
await page.waitForSelector('.file-menu-panel.open', { timeout: 3000 });
await page.evaluate(() => [...document.querySelectorAll('.file-menu-panel.open button')].find((b) => b.textContent.includes('Enregistrer JSON')).click());
await sleep(500);
const json = await page.evaluate(async () => {
  const b = window.__captured[window.__captured.length - 1];
  return JSON.parse(await b.text());
});
ok(json.scripts[0].code === 'Scene.log("v2 depuis VS Code");', 'script du projet rouvert = contenu du .js (v2), pas le inline v1');
const assetId = Object.keys(json.assets)[0];
ok(typeof json.assets[assetId].dataUrl === 'string' && json.assets[assetId].dataUrl.startsWith('data:image/png;base64,'), 'asset reconstitué en dataUrl depuis le binaire du dossier');
ok(json.assets[assetId].dataUrl === PNG_1PX, 'dataUrl = octets exacts du PNG exporté');
ok(json.name === 'ProjetV2', 'nom du doc conservé');

ok(pageErrors.length === 0, '0 pageerror' + (pageErrors.length ? ' : ' + pageErrors.join(' | ') : ''));

await browser.close();
console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
