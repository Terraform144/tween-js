// E2E lien vivant sur script d'image : le bouton "Lier" est proposé pour une
// cible frame script (key présente), et refreshLinkedScripts relit les kf liées.
// On stubbe showOpenFilePicker (FSA) pour simuler le lien, puis on modifie le
// "fichier" et on vérifie que kf.script est relu au polling.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const PAGE_URL = process.env.TJS_URL || 'http://127.0.0.1:4180/';
let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };
const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(PAGE_URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('.tl-toolbar');
await new Promise(r => setTimeout(r, 400));

// stub FSA : showOpenFilePicker renvoie un faux handle qui lit/écrit window.__fakeFile
await page.evaluateOnNewDocument(() => {
  window.__fakeFile = { name: 'frame1.js', text: '// v1\nScene.log("v1");' };
  window.showOpenFilePicker = async () => [{
    kind: 'file',
    name: window.__fakeFile.name,
    getFile: async () => new File([window.__fakeFile.text], window.__fakeFile.name),
    createWritable: async () => ({ write: async (d) => { window.__fakeFile.text = d; }, close: async () => {} }),
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
  }];
  // faux IndexedDB en mémoire (le vrai ne peut pas cloner un faux handle avec fonctions)
  const mem = new Map();
  Object.defineProperty(window, 'indexedDB', { configurable: true, value: { open: () => {
    const req = {};
    setTimeout(() => {
      req.result = {
        createObjectStore: () => {},
        transaction: () => ({ objectStore: () => ({
          put: (v, k) => { mem.set(k, v); const r = {}; setTimeout(() => { r.result = v; r.onsuccess && r.onsuccess(); }); return r; },
          get: (k) => { const r = {}; setTimeout(() => { r.result = mem.get(k); r.onsuccess && r.onsuccess(); }); return r; },
          delete: (k) => { mem.delete(k); const r = {}; setTimeout(() => { r.onsuccess && r.onsuccess(); }); return r; },
          getAllKeys: () => { const r = {}; setTimeout(() => { r.result = [...mem.keys()]; r.onsuccess && r.onsuccess(); }); return r; },
        }) }),
        close: () => {},
      };
      req.onupgradeneeded && req.onupgradeneeded();
      req.onsuccess && req.onsuccess();
    });
    return req;
  } } });
});
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('.tl-toolbar');
await new Promise(r => setTimeout(r, 400));

// créer un script d'image sur la frame courante : bouton "+ Sur cette image" du panneau Scripts
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  const b = btns.find(x => x.textContent.includes('Sur cette image'));
  if (b) b.click();
});
await new Promise(r => setTimeout(r, 400));
// le bouton Lier doit être visible (key frame présente + FSA stubbé)
const linkVisible = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.external-row button')];
  const b = btns.find(x => x.textContent === 'Lier');
  return b ? getComputedStyle(b).display !== 'none' : false;
});
ok(linkVisible, 'bouton "Lier" proposé pour un script d\'image (frame)');

// cliquer sur Lier -> le fichier stubbé est lu, kf.script = contenu du fichier
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.external-row button')];
  btns.find(x => x.textContent === 'Lier').click();
});
await new Promise(r => setTimeout(r, 800));
const codeAfterLink = await page.evaluate(() => {
  // lire le script de la frame courante via le JSON du doc ? via l'éditeur CodeMirror
  const cm = document.querySelector('.cm-content');
  return cm ? cm.textContent : null;
});
ok(codeAfterLink && codeAfterLink.includes('v1'), `script d'image lié : contenu du fichier lu (${(codeAfterLink || '').slice(0, 30)}...)`);

// modifier le "fichier" -> le polling (2 s) doit relire et mettre à jour kf.script
await page.evaluate(() => { window.__fakeFile.text = '// v2 modifie dans VS Code\nScene.log("v2");'; });
await new Promise(r => setTimeout(r, 3500)); // > intervalle de polling 2 s
const codeAfterPoll = await page.evaluate(() => {
  const cm = document.querySelector('.cm-content');
  return cm ? cm.textContent : null;
});
ok(codeAfterPoll && codeAfterPoll.includes('v2'), `watch par polling: fichier modifié relu automatiquement (${(codeAfterPoll || '').slice(0, 40)}...)`);

ok(pageErrors.length === 0, '0 pageerror' + (pageErrors.length ? ' : ' + pageErrors.join(' | ') : ''));
console.log(`\n${pass} OK, ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
