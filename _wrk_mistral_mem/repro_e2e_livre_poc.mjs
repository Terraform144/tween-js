import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
// E2E du livre-dont-tu-es-le-héros (LIVRE_POC.test.json) :
//  - chargé via Ouvrir..., Exécuter -> lecture lancée, page 1 épinglée (titre PAGE1)
//  - la page 1 est illustrée (formes vectorielles présentes)
//  - clic sur chaque bouton nommé navigue vers la bonne page (titre PAGE n)
//  - page p4 : Scene.camera.set({zoom:1.25}) -> contentLayer.scaleX ~ 1.25 en lecture
//  - chemin « bon » : p1 -> p2 -> p3 -> p4 -> p7 -> (rejouer) p1
//  - chemin « raté » : p1 -> p5 -> p1
// Run: node _wrk_mistral_mem/repro_e2e_livre_poc.mjs  (vite dev :4173)
import puppeteer from 'puppeteer-core';

const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE = 'http://localhost:4173/';
const BOOK = fileURLToPath(new URL('./LIVRE_POC.test.json', import.meta.url));

const book = JSON.parse(readFileSync(BOOK, 'utf8'));
const nameToId = {};
for (const kf of book.layers[0].keyframes) for (const e of kf.elements) if (e.name) nameToId[e.name] = e.id;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
let failed = 0;
const check = (label, cond) => { console.log((cond ? '  OK  ' : 'FAIL  ') + label); if (!cond) failed++; };

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 900 });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 20000 });
  const input = await page.$('input[type="file"][accept=".json,application/json"]');
  await input.uploadFile(BOOK);
  await new Promise((r) => setTimeout(r, 800));
  await page.click('button[title="Exécuter (Ctrl+Entrée)"]');
  await new Promise((r) => setTimeout(r, 700));

  const title = () => page.title();
  const clickBtn = async (name) => {
    // attend que le bouton de la page courante soit rendu, puis clique au
    // centre de son client rect (getClientRect = pixels canvas, relatif au
    // conteneur du stage Konva)
    let pt = null;
    for (let i = 0; i < 20 && !pt; i++) {
      pt = await page.evaluate((id) => {
        const node = Konva.stages[0].findOne('#' + id);
        if (!node) return null;
        const cr = node.getClientRect();
        const bb = Konva.stages[0].container().getBoundingClientRect();
        return { x: bb.x + cr.x + cr.width / 2, y: bb.y + cr.y + cr.height / 2 };
      }, nameToId[name]);
      if (!pt) await new Promise((r) => setTimeout(r, 150));
    }
    if (!pt) throw new Error('bouton introuvable: ' + name);
    await page.mouse.click(pt.x, pt.y);
    await new Promise((r) => setTimeout(r, 450));
  };
  const shapeCount = () => page.evaluate(() => {
    let n = 0;
    for (const l of Konva.stages[0].children) n += l.find('Shape').length + l.find('Rect').length + l.find('Ellipse').length + l.find('Line').length + l.find('Text').length;
    return n;
  });

  console.log('— Page 1 : chargement + illustration');
  check('lecture lancée, page 1 épinglée (titre PAGE1)', (await title()) === 'PAGE1');
  const n1 = await shapeCount();
  console.log('  formes rendues page 1 : ' + n1);
  check('page 1 illustrée (>= 8 formes)', n1 >= 8);

  console.log('— Chemin « bon » : p1 -> p2 -> p3 -> p4 -> p7 -> p1');
  await clickBtn('p1a'); check('clic p1a -> PAGE2', (await title()) === 'PAGE2');
  await clickBtn('p2a'); check('clic p2a -> PAGE3', (await title()) === 'PAGE3');
  const n3 = await shapeCount();
  check('page 3 illustrée (cadre caméra, >= 10 formes)', n3 >= 10);
  await clickBtn('p3a'); check('clic p3a -> PAGE4', (await title()) === 'PAGE4');
  await new Promise((r) => setTimeout(r, 400));
  const camScale = await page.evaluate(() => Konva.stages[0].children[2].scaleX());
  console.log('  contentLayer.scaleX page 4 = ' + camScale);
  check('page 4 : Scene.camera.set({zoom:1.25}) appliqué au rendu (scaleX ~ 1.25)', Math.abs(camScale - 1.25) < 0.02);
  await clickBtn('p4a'); check('clic p4a -> PAGE7', (await title()) === 'PAGE7');
  const n7 = await shapeCount();
  check('page 7 illustrée (héros, >= 8 formes)', n7 >= 8);
  await clickBtn('p7a'); check('clic p7a (rejouer) -> PAGE1', (await title()) === 'PAGE1');
  const camBack = await page.evaluate(() => Konva.stages[0].children[2].scaleX());
  check('retour page 1 : caméra remise à zoom 1', Math.abs(camBack - 1) < 0.02);

  console.log('— Chemin « raté » : p1 -> p5 -> p1');
  await clickBtn('p1b'); check('clic p1b -> PAGE5 (fin ratée)', (await title()) === 'PAGE5');
  await clickBtn('p5a'); check('clic p5a (recommencer) -> PAGE1', (await title()) === 'PAGE1');

  check('0 pageerror' + (pageErrors.length ? ' : ' + pageErrors.join(' | ') : ''), pageErrors.length === 0);

  // ---------- PARTIE B : le livre exporté en HTML autonome ----------
  console.log('— Export HTML du livre, puis navigation dans la page exportée');
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 1100, height: 900 });
  const expErrors = [];
  page2.on('pageerror', (e) => expErrors.push(String(e)));
  await page2.goto(BASE, { waitUntil: 'networkidle0', timeout: 20000 });
  await (await page2.$('input[type="file"][accept=".json,application/json"]')).uploadFile(BOOK);
  await new Promise((r) => setTimeout(r, 800));
  await page2.evaluate(() => {
    window.__capture = null;
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { blob.text().then((t) => { window.__capture = t; }); return orig(blob); };
  });
  await page2.click('button[title="Ouvrir, importer, enregistrer, exporter"]');
  await new Promise((r) => setTimeout(r, 300));
  await page2.evaluate(() => {
    for (const b of document.querySelectorAll('.file-menu-panel button')) if (b.textContent.includes('Exporter HTML')) { b.click(); return; }
  });
  let html = null;
  for (let i = 0; i < 40 && !html; i++) {
    await new Promise((r) => setTimeout(r, 250));
    html = await page2.evaluate(() => window.__capture);
  }
  check('export HTML du livre capturé (> 5 ko)', !!html && html.length > 5000);

  const p3 = await browser.newPage();
  await p3.setViewport({ width: 900, height: 800 });
  const expPageErrors = [];
  p3.on('pageerror', (e) => expPageErrors.push(String(e)));
  await p3.setContent(html, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 900));
  check('page exportée : lecture lancée, PAGE1', (await p3.title()) === 'PAGE1');
  // En export, pas de Konva : on clique aux coordonnées document (canvas 1:1)
  const clickDoc = async (docX, docY) => {
    const pt = await p3.evaluate(([x, y]) => {
      const bb = document.getElementById('stage').getBoundingClientRect();
      return { x: bb.x + x * (bb.width / 480), y: bb.y + y * (bb.height / 640) };
    }, [docX, docY]);
    await p3.mouse.click(pt.x, pt.y);
    await new Promise((r) => setTimeout(r, 500));
  };
  // p1a = bouton centré en (240, 500), 330x42
  await clickDoc(240, 500);
  check('export : clic p1a -> PAGE2', (await p3.title()) === 'PAGE2');
  await clickDoc(240, 500); // p2a est aussi en (240,500) sur la page 2
  check('export : clic p2a -> PAGE3', (await p3.title()) === 'PAGE3');
  check('export : 0 pageerror' + (expPageErrors.length ? ' : ' + expPageErrors.join('|') : ''), expPageErrors.length === 0);

  console.log(failed ? `\n${failed} ÉCHEC(S)` : '\n=== E2E LIVRE POC : TOUT PASSE ===');
  process.exitCode = failed ? 1 : 0;
} finally {
  await browser.close();
}
