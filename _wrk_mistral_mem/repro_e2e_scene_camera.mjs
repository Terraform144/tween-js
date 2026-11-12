import { fileURLToPath } from 'node:url';
// E2E Scene.camera (API scripts) :
//  PARTIE A — éditeur (vite dev :4173) : doc avec 2 clés caméra (f0 zoom 1,
//    f10 zoom 2), script Exécuter qui lit/écrit via Scene.camera :
//    - lecture résolue à l'image courante (zoom 1 en f0, 2 en f10)
//    - set({zoom:3}) pose une clé à l'image courante + read-after-write
//    - remove() supprime la clé de l'image courante, la lecture retombe
//      sur la clé précédente
//    - en lecture, le rendu applique la caméra (contentLayer.scaleX == zoom)
//  PARTIE B — export HTML : le script exporté fait set({zoom:2.5}) puis lit
//    Scene.camera.zoom -> titre EXPCAM2.5 (set+read dans le runtime exporté).
// Run: node _wrk_mistral_mem/repro_e2e_scene_camera.mjs
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE = 'http://localhost:4173/';
const DOC_JSON = fileURLToPath(new URL('./doc-scene-camera-e2e.json', import.meta.url));

const model = await import(new URL('../src/core/model.js', import.meta.url).href);
const cam = await import(new URL('../src/core/camera.js', import.meta.url).href);

const doc = model.createDocument({ name: 'E2E-SceneCamera', width: 400, height: 300 });
doc.frameCount = 20;
doc.layers[0].keyframes[0].elements.push(model.createShape('rect', { x: 200, y: 150, width: 120, height: 90, fill: '#cb4b16' }));
cam.upsertCameraKeyframe(doc, 0, { zoom: 1 });
cam.upsertCameraKeyframe(doc, 10, { zoom: 2 });
doc.scripts[0].code = [
  'window.__z0 = Scene.camera.zoom;',
  'Scene.camera.set({ zoom: 3 });',
  'window.__z1 = Scene.camera.zoom;',
  'window.__has = Scene.camera.hasKeyframes;',
  'Scene.gotoAndStop(10);',
  'window.__z10 = Scene.camera.zoom;',
  'Scene.camera.remove();',
  'window.__z10b = Scene.camera.zoom;',
  'Scene.gotoAndStop(0);',
  'Scene.play();',
  'window.__playing = Scene.playing;',
  "document.title = 'CAMOK';",
].join('\n');
writeFileSync(DOC_JSON, JSON.stringify(doc));

// Doc pour l'export : script qui set puis lit la caméra (titre = preuve)
const docExp = model.createDocument({ name: 'E2E-SceneCameraExp', width: 400, height: 300 });
docExp.frameCount = 20;
docExp.layers[0].keyframes[0].elements.push(model.createShape('rect', { x: 200, y: 150, width: 120, height: 90, fill: '#cb4b16' }));
cam.upsertCameraKeyframe(docExp, 0, { zoom: 1 });
docExp.scripts[0].code = "Scene.camera.set({ zoom: 2.5 }); document.title = 'EXPCAM' + Scene.camera.zoom;";
const DOC_EXP_JSON = fileURLToPath(new URL('./doc-scene-camera-exp-e2e.json', import.meta.url));
writeFileSync(DOC_EXP_JSON, JSON.stringify(docExp));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
let failed = 0;
const check = (label, cond) => { console.log((cond ? '  OK  ' : 'FAIL  ') + label); if (!cond) failed++; };

try {
  // ---------- PARTIE A : éditeur ----------
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 950 });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 20000 });
  const input = await page.$('input[type="file"][accept=".json,application/json"]');
  await input.uploadFile(DOC_JSON);
  await new Promise((r) => setTimeout(r, 800));

  await page.click('button[title="Exécuter (Ctrl+Entrée)"]');
  await new Promise((r) => setTimeout(r, 600));

  const v = await page.evaluate(() => ({
    z0: window.__z0, z1: window.__z1, has: window.__has,
    z10: window.__z10, z10b: window.__z10b, playing: window.__playing,
    title: document.title,
  }));
  console.log('  valeurs script : ' + JSON.stringify(v));
  check('lecture zoom à f0 = 1', v.z0 === 1);
  check('set({zoom:3}) -> read-after-write = 3', v.z1 === 3);
  check('hasKeyframes = true', v.has === true);
  check('lecture zoom à f10 = 2', v.z10 === 2);
  check('remove() en f10 -> lecture retombe sur la clé 0 (zoom 3)', v.z10b === 3);
  check('script terminé (titre CAMOK)', v.title === 'CAMOK');
  check('Scene.play() -> playing', v.playing === true);

  // Rendu : en lecture, applyCameraTransform met le zoom caméra sur contentLayer
  await new Promise((r) => setTimeout(r, 500));
  const scale = await page.evaluate(() => {
    const st = Konva.stages[0];
    const content = st.children[2]; // bg, onion, content, overlay
    return { sx: content.scaleX(), playing: true };
  });
  console.log('  contentLayer.scaleX en lecture = ' + scale.sx);
  check('en lecture, la caméra s\'applique au rendu (scaleX = zoom 3)', Math.abs(scale.sx - 3) < 0.01);
  await page.click('button[title="Arrêter la lecture"]');
  await new Promise((r) => setTimeout(r, 200));

  // ---------- PARTIE B : export HTML ----------
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 900, height: 700 });
  const expErrors = [];
  page2.on('pageerror', (e) => expErrors.push(String(e)));
  await page2.goto(BASE, { waitUntil: 'networkidle0', timeout: 20000 });
  const input2 = await page2.$('input[type="file"][accept=".json,application/json"]');
  await input2.uploadFile(DOC_EXP_JSON);
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
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    html = await page2.evaluate(() => window.__capture);
    if (html) break;
  }
  check('export HTML capturé (> 1000 o)', !!html && html.length > 1000);
  const page3 = await browser.newPage();
  await page3.setViewport({ width: 900, height: 700 });
  const expPageErrors = [];
  page3.on('pageerror', (e) => expPageErrors.push(String(e)));
  await page3.setContent(html, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 700));
  const t = await page3.title();
  console.log('  titre page exportée = ' + t);
  check('export : set({zoom:2.5}) + read -> EXPCAM2.5', t === 'EXPCAM2.5');
  check('export : 0 pageerror' + (expPageErrors.length ? ' : ' + expPageErrors.join('|') : ''), expPageErrors.length === 0);

  check('éditeur : 0 pageerror' + (pageErrors.length ? ' : ' + pageErrors.join('|') : ''), pageErrors.length === 0);
  console.log(failed ? `\n${failed} ÉCHEC(S)` : '\n=== E2E SCENE.CAMERA : TOUT PASSE ===');
  process.exitCode = failed ? 1 : 0;
} finally {
  await browser.close();
}
