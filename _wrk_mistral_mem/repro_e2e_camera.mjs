// E2E OUTIL CAMÉRA — prouve le pipeline complet dans un vrai navigateur :
//   1. la version vanilla servie démarre sans erreur ;
//   2. un rectangle est dessiné à la souris (outil Rectangle) ;
//   3. l'outil Caméra (C) s'active ; ZOOM par la poignée d'angle (tant que
//      le cadre par défaut borde la feuille), puis PAN du cadre -> image(s)
//      clé(s) caméra posée(s) ; puis un tick de MOLETTE zoome encore ;
//   4. "Exporter HTML" après le pan puis après la molette : le fichier
//      exporté contient doc.camera avec les valeurs attendues (le zoom
//      molette est > au zoom poignée) + l'appel applyCameraToContext ;
//   5. le fichier exporté ouvert en file:// rend À TRAVERS la caméra :
//      le centre du canvas = blanc (le rect s'est déplacé) et le centre du
//      rect apparaît à la position exacte prédite par la sémantique
//      cadre->canvas (centre + (rect-cam)*zoom) avec sa couleur de remplissage.
// Run : copier dans /tmp/e2e (puppeteer-core hors repo) puis :
//   cd /tmp/e2e && node camera.mjs
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { writeFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const CHROME = 'C:/Users/jl_be/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const SERVER = 'F:/_SRC/__Debrouillard/Animate_JS_PRJ/_wrk_mistral_mem/vanilla_server.mjs';
const OUT = 'F:/_SRC/__Debrouillard/Animate_JS_PRJ/_wrk_mistral_mem/camera-e2e-export.html';
const BASE = 'http://localhost:4175/';

let passed = 0, failed = 0;
const ok = (label, cond, detail) => {
  if (cond) { passed++; console.log('  OK  ' + label); }
  else { failed++; console.log('FAIL  ' + label + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); }
};

// --- serveur statique vanilla ---
const server = spawn(process.execPath, [SERVER], { stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((resolveWait) => {
  server.stdout.on('data', (d) => { if (String(d).includes('READY')) resolveWait(); });
  setTimeout(resolveWait, 4000);
});

async function exportHTML(page) {
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
  if (!clicked) return null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const cap = await page.evaluate(() => window.__capture);
    if (cap) return cap;
  }
  return null;
}
function parseCamera(exported) {
  // Capture le TABLEAU entier (les accolades de l'objet clé sont dans m[1],
  // les reconstruire autour doublerait les accolades -> JSON.parse jetait
  // une exception à chaque run alors que tout fonctionnait).
  const m = /"camera":\{"keyframes":(\[[^\]]*\])\}/.exec(exported || '');
  if (!m) {
    const i = (exported || '').indexOf('"camera"');
    if (i >= 0) console.log('  [contexte camera] ...' + exported.slice(i - 40, i + 160));
    else console.log('  [contexte camera] absent du fichier');
    return null;
  }
  try { const arr = JSON.parse(m[1]); return arr && arr.length ? arr[0] : null; } catch (e) { return null; }
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 950 });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise((r) => setTimeout(r, 700));
  ok('app vanilla démarre sans pageerror', pageErrors.length === 0, pageErrors);

  // Canvas Konva (3 canvas superposés — instrumenter le conteneur, leçon
  // session 14 : le premier canvas est la couche de fond).
  const bb = await (await page.$('.konvajs-content')).boundingBox();
  const fit = bb.width / 550;
  const sx = (dx) => bb.x + dx * fit;
  const sy = (dy) => bb.y + dy * fit;
  ok('canvas scène présent', bb.width > 100, bb);

  // --- 2. rectangle au centre (outil Rectangle) ---
  await page.click('button[title^="Rectangle"]');
  await page.mouse.move(sx(250), sy(180));
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(sx(250 + 5 * i), sy(180 + 4 * i));
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 400));

  // --- 3. outil caméra : zoom (poignée) puis pan puis molette ---
  const camBtn = await page.$('button[title^="Caméra"]');
  ok('bouton outil Caméra présent', !!camBtn);
  await camBtn.click();
  await new Promise((r) => setTimeout(r, 300));
  ok('outil caméra actif', await page.evaluate(() => !!document.querySelector('button[title^="Caméra"].active')));

  // DEBUG : introspection du cadre caméra via le Konva global.
  const frameState = async (label) => {
    const s = await page.evaluate(() => {
      const layers = window.Konva.stages[0].getLayers();
      return layers.map((l, i) => i + ':' + l.getChildren().map((c) => c.className + (c.getChildren ? '(' + c.getChildren().length + ')' : '')).join(','));
    });
    console.log('  [frame ' + label + '] ' + JSON.stringify(s));
  };

  // ZOOM D'ABORD : le cadre par défaut borde la feuille -> la poignée
  // haut-gauche est autour de (0,0) document. Tirer vers l'extérieur =
  // zoom in (cadre plus petit).
  await page.mouse.move(sx(3), sy(3));
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(sx(3 - 7.3 * i), sy(3 - 5.3 * i));
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 400));
  await frameState('apres zoom');

  // PAN : glisser le centre du cadre vers (200,150) (document).
  await page.mouse.move(sx(275), sy(200));
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(sx(275 - 7.5 * i), sy(200 - 5 * i));
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 400));
  await frameState('apres pan');
  ok('gestes caméra sans pageerror', pageErrors.length === 0, pageErrors);

  // --- 4a. export après pan : valeurs poignée + pan ---
  const exp1 = await exportHTML(page);
  ok('export #1 capturé', !!exp1, exp1 ? '' : 'aucun blob');
  const cam1 = parseCamera(exp1);
  ok('DATA.camera contient une image clé', !!cam1 && cam1.index === 0, cam1);
  if (cam1) {
    ok('pan appliqué (~200,150)', Math.abs(cam1.x - 200) < 3 && Math.abs(cam1.y - 150) < 3, cam1);
    ok('zoom poignée > 1', cam1.zoom > 1.05 && cam1.zoom < 10, cam1);
  }

  // MOLETTE : un tick vers l'avant = zoom caméra autour du pointeur.
  await page.mouse.move(sx(300), sy(220));
  await page.mouse.wheel({ deltaY: -120 });
  await new Promise((r) => setTimeout(r, 400));

  // --- 4b. export après molette : le zoom a encore augmenté ---
  const exp2 = await exportHTML(page);
  const cam2 = parseCamera(exp2);
  ok('export #2 capturé', !!exp2, exp2 ? '' : 'aucun blob');
  if (cam1 && cam2) {
    ok('molette : zoom caméra accru', cam2.zoom > cam1.zoom * 1.05, { cam1, cam2 });
  }
  writeFileSync(OUT, exp2 || '');
  console.log('       export final : ' + OUT + ' (' + statSync(OUT).size + ' octets)');
  ok('export appelle applyCameraToContext', (exp2 || '').includes('applyCameraToContext(ctx, resolveCameraAtFrame(DATA.camera'));

  // --- 5. le fichier exporté rend à travers la caméra ---
  const p2 = await browser.newPage();
  await p2.setViewport({ width: 1500, height: 950 });
  const errors2 = [];
  p2.on('pageerror', (e) => errors2.push(e.message));
  p2.on('console', (msg) => { if (msg.type() === 'error') errors2.push(msg.text()); });
  await p2.goto(pathToFileURL(OUT).href, { waitUntil: 'load', timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1500));
  ok('page exportée démarre sans erreur', errors2.length === 0, errors2);

  if (cam2) {
    const samples = await p2.evaluate((pts) => {
      const c = document.getElementById('stage');
      const ctx = c.getContext('2d');
      const px = (x, y) => Array.from(ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data);
      return { center: px(pts.cx, pts.cy), rectCenter: px(pts.rx, pts.ry) };
    }, {
      cx: 275, cy: 200, // centre du canvas
      // centre du rect (275,200 doc) vu à travers la caméra :
      rx: 275 + (275 - cam2.x) * cam2.zoom,
      ry: 200 + (200 - cam2.y) * cam2.zoom,
    });
    const isWhite = (p) => p[0] > 235 && p[1] > 235 && p[2] > 235;
    const isRectFill = (p) => Math.abs(p[0] - 203) < 30 && Math.abs(p[1] - 75) < 30 && Math.abs(p[2] - 22) < 30;
    ok('centre du canvas = blanc (le rect a bougé avec le pan)', isWhite(samples.center), samples.center);
    ok('centre du rect à la position caméra prédite, couleur remplissage', isRectFill(samples.rectCenter), samples.rectCenter);
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
