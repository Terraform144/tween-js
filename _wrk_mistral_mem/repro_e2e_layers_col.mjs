// E2E colonne des calques escamotable + infobulle du nom de calque.
// Scénario : doc avec un calque au nom très long chargé via Ouvrir... ;
// (1) colonne visible par défaut sur desktop, .tl-body en "220px 1fr" ;
// (2) le .layer-name tronqué (ellipsis) porte un title = nom COMPLET ;
// (3) clic sur le bouton panelLeft -> classe layers-hidden, .tl-layers en
//     display:none, grille en "0px 1fr", pistes élargies, pref persistée,
//     bouton .active ; (4) re-clic -> retour à la normale ; (5) reload avec
//     pref enregistrée -> colonne toujours masquée ; 0 pageerror.
// Run: node _wrk_mistral_mem/repro_e2e_layers_col.mjs   (nécessite vite preview :4180 + puppeteer-core dans /tmp/e2e)
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { createDocument } from '../src/core/model.js';

// puppeteer-core : d'abord le node_modules local (_wrk_mistral_mem), sinon /tmp/e2e
let puppeteer;
try {
  puppeteer = createRequire(import.meta.url)('puppeteer-core');
} catch {
  puppeteer = createRequire('/tmp/e2e/')('puppeteer-core');
}

const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const URL = 'http://127.0.0.1:4180/';
const LONG_NAME = 'Calque avec un nom très long pour tester la troncature ellipsis';

// ---- fabrique le document test avec le VRAI model.js ----
const doc = createDocument({ name: 'LayersColTest' });
doc.layers[0].name = LONG_NAME;
writeFileSync('/tmp/e2e/layers-col-test.json', JSON.stringify(doc));

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  userDataDir: '/tmp/chrome-prof-layerscol-' + Date.now(),
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('.tl-toolbar', { timeout: 10000 });

// charge le doc via le vrai flux Ouvrir...
const input = await page.$('input[type=file][accept=".json,application/json"]');
await input.uploadFile('/tmp/e2e/layers-col-test.json');
await sleep(500);
await page.waitForSelector('.tl-layer-row:not(.tl-camera-row):not(.tl-audio-row) .layer-name', { timeout: 5000 });

// (1) état initial : colonne visible, grille 220px
const before = await page.evaluate(() => ({
  hidden: document.getElementById('timeline').classList.contains('layers-hidden'),
  layersDisplay: getComputedStyle(document.querySelector('.tl-layers')).display,
  cols: getComputedStyle(document.querySelector('.tl-body')).gridTemplateColumns,
  tracksW: document.querySelector('.tl-tracks-scroll').getBoundingClientRect().width,
  btnActive: !!document.querySelector('.tl-toolbar button[title*="colonne des calques"]').classList.contains('active'),
}));
ok(!before.hidden && before.layersDisplay !== 'none', 'colonne visible par défaut (desktop)');
ok(before.cols.startsWith('220px'), '.tl-body grid-template-columns = 220px 1fr -> ' + before.cols);
ok(!before.btnActive, 'bouton panelLeft non actif par défaut');

// (2) infobulle du nom = nom complet, et le texte est bien tronqué
const nameInfo = await page.evaluate(() => {
  const el = document.querySelector('.tl-layer-row:not(.tl-camera-row):not(.tl-audio-row) .layer-name');
  return { title: el.title, text: el.textContent, truncated: el.scrollWidth > el.clientWidth };
});
ok(nameInfo.title.startsWith(nameInfo.text) && nameInfo.text.length > 30, 'title du nom = nom complet -> "' + nameInfo.title.slice(0, 60) + '..."');
ok(nameInfo.truncated, 'nom affiché tronqué (ellipsis) dans la colonne étroite');

// (3) clic sur le bouton -> colonne masquée
const btnSel = '.tl-toolbar button[title*="colonne des calques"]';
await page.click(btnSel);
await sleep(300);
const hidden = await page.evaluate(() => ({
  hidden: document.getElementById('timeline').classList.contains('layers-hidden'),
  layersDisplay: getComputedStyle(document.querySelector('.tl-layers')).display,
  headerDisplay: getComputedStyle(document.querySelector('.tl-header')).display,
  cols: getComputedStyle(document.querySelector('.tl-body')).gridTemplateColumns,
  tracksW: document.querySelector('.tl-tracks-scroll').getBoundingClientRect().width,
  btnActive: !!document.querySelector('.tl-toolbar button[title*="colonne des calques"]').classList.contains('active'),
  pref: localStorage.getItem('tweenjs:timelineLayersHidden'),
}));
ok(hidden.hidden, 'classe layers-hidden posée sur #timeline');
ok(hidden.layersDisplay === 'none' && hidden.headerDisplay === 'none', '.tl-layers et .tl-header en display:none');
ok(hidden.cols.startsWith('0px'), 'grille passée en 0px 1fr -> ' + hidden.cols);
ok(hidden.tracksW > before.tracksW + 200, `pistes élargies (${Math.round(before.tracksW)} -> ${Math.round(hidden.tracksW)} px)`);
ok(hidden.btnActive, 'bouton panelLeft .active quand masqué');
ok(hidden.pref === 'true', 'pref persistée tweenjs:timelineLayersHidden=true');

// (4) re-clic -> retour à la normale
await page.click(btnSel);
await sleep(300);
const back = await page.evaluate(() => ({
  hidden: document.getElementById('timeline').classList.contains('layers-hidden'),
  layersDisplay: getComputedStyle(document.querySelector('.tl-layers')).display,
  cols: getComputedStyle(document.querySelector('.tl-body')).gridTemplateColumns,
  pref: localStorage.getItem('tweenjs:timelineLayersHidden'),
}));
ok(!back.hidden && back.layersDisplay !== 'none' && back.cols.startsWith('220px'), 're-clic -> colonne réaffichée (220px 1fr)');
ok(back.pref === 'false', 'pref repassée à false');

// (5) reload avec pref à true -> colonne toujours masquée
await page.click(btnSel);
await sleep(200);
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('.tl-toolbar', { timeout: 10000 });
await sleep(300);
const afterReload = await page.evaluate(() => ({
  hidden: document.getElementById('timeline').classList.contains('layers-hidden'),
  layersDisplay: getComputedStyle(document.querySelector('.tl-layers')).display,
}));
ok(afterReload.hidden && afterReload.layersDisplay === 'none', 'après reload, colonne toujours masquée (pref conservée)');

ok(pageErrors.length === 0, '0 pageerror' + (pageErrors.length ? ' : ' + pageErrors.join(' | ') : ''));
await browser.close();
console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
