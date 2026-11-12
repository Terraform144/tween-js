import { fileURLToPath } from 'node:url';
// Harnais E2E de l'outil Maillage (mesh warp) :
//   1. fabrique un document avec un bitmap ORANGE plein maillé dont le point
//      (2,0) du bord haut est tire vers l'interieur (100,50) — la deformation
//      laisse un trou transparent a (200,85) (pixel P1) et l'orange reste
//      ailleurs (P2) ;
//   2. charge le doc via le vrai flux « Ouvrir... », verifie les pixels du
//      canvas Konva (contentLayer) ;
//   3. active l'outil Maillage, verifie les poignees de la grille ;
//   4. GLISSE la poignee du coin haut-gauche vers l'exterieur, verifie que
//      l'image suit (pixel orange la ou il y avait du fond).
// Prerequis : `npm run build` puis `npm run preview` sur 4173.
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';

const CHROME = process.env.HOME + '/.local/chromium/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE = 'http://localhost:4173/';
const REPO = fileURLToPath(new URL('..', import.meta.url));
const DOC_JSON = fileURLToPath(new URL('./doc-warp-e2e.json', import.meta.url)).replace(/^\/([A-Za-z]:)/, '$1');

// --- PNG 1x1 orange (#cb4b16) fabrique a la main (aucune dependance) ---
function crc32(buf) {
  let c, table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png1xOrange() {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const raw = Buffer.from([0x00, 0xcb, 0x4b, 0x16]); // filtre 0 + RGB
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const DATA_URL = 'data:image/png;base64,' + png1xOrange().toString('base64');

// --- Document fabrique avec le VRAI modele (format garanti) ---
const model = await import(pathToFileURL(REPO + '/src/core/model.js').href);
const warp = await import(pathToFileURL(REPO + '/src/core/warp.js').href);

const doc = model.createDocument({ name: 'E2E-Warp', width: 400, height: 300 });
const asset = model.addAsset(doc, { name: 'orange', type: 'image/png', dataUrl: DATA_URL, width: 200, height: 160 });
const bm = model.createBitmap(asset.id, { x: 200, y: 150, width: 200, height: 160 });
warp.ensureWarp(bm);
// Point (2,0) du bord haut tire vers l'interieur (100,50) : le mesh se
// creuse au sommet — le pixel local (100,15) n'est plus couvert (un maillage
// a sommets partages ne troue JAMAIS l'interieur, seul un point de BORD
// tire vers l'interieur decouvre du fond).
bm.warpPoints[2] = { x: 100, y: 50 };
doc.layers[0].keyframes[0].elements.push(bm);
writeFileSync(DOC_JSON, JSON.stringify(doc));
console.log('ETAPE  document E2E ecrit');

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
let failed = 0;
function check(label, cond) {
  console.log((cond ? '  OK  ' : 'FAIL  ') + label);
  if (!cond) failed++;
}
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 950 });
  page.on('pageerror', (e) => console.log('  [pageerror] ' + e.message));
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 20000 });

  const input = await page.$('input[type="file"][accept=".json,application/json"]');
  if (!input) { console.log('ECHEC  input file JSON introuvable'); process.exit(1); }
  await input.uploadFile(DOC_JSON);
  await new Promise((r) => setTimeout(r, 900)); // decode de l'image + rendu

  // Sampling via le canvas Konva du contentLayer (2e canvas, apres bgLayer)
  const colorAt = (worldX, worldY) => page.evaluate((x, y) => {
    const canvases = document.querySelectorAll('#stage-container canvas');
    const c = canvases[1]; // contentLayer
    const ctx = c.getContext('2d');
    const s = c.width / 400;
    const d = ctx.getImageData(Math.round(x * s), Math.round(y * s), 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  }, worldX, worldY);
  const isOrange = (px) => px[3] > 0 && Math.abs(px[0] - 0xcb) < 24 && Math.abs(px[1] - 0x4b) < 24 && Math.abs(px[2] - 0x16) < 24;
  const isTransparent = (px) => px[3] === 0;

  // Le bitmap est centre en (200,150) : local (lx,ly) -> monde (100+lx, 70+ly).
  // Le point de bord (100,0) est tire en (100,50) : le pixel local (100,15)
  // tombe dans le creux decouvert (transparent sur contentLayer).
  const p1 = await colorAt(200, 85);   // local (100,15) : creux decouvert
  const p2 = await colorAt(250, 150);  // local (150,80) : coeur intact
  console.log('  P1(200,85)=' + JSON.stringify(p1) + ' P2(250,150)=' + JSON.stringify(p2));
  check('P1 transparent : la deformation laisse le creux attendu', isTransparent(p1));
  check('P2 orange : le reste de l\'image est rendu', isOrange(p2));

  // --- outil Maillage : selectionner le bitmap puis activer l'outil ---
  const bb = await (await page.$('#stage-container canvas')).boundingBox();
  const s = bb.width / 400;
  const toScreen = (wx, wy) => ({ x: bb.x + wx * s, y: bb.y + wy * s });
  const clickAt = async (wx, wy) => {
    const p = toScreen(wx, wy);
    await page.mouse.click(p.x, p.y);
    await new Promise((r) => setTimeout(r, 250));
  };
  await clickAt(250, 150); // selection du bitmap
  await page.click('button[title^="Maillage"]');
  await new Promise((r) => setTimeout(r, 300));

  const handles = await page.evaluate(() => document.querySelectorAll('#stage-container canvas').length);
  check('overlay Konva present (>=3 canvases)', handles >= 3);

  // --- glisser la poignee du coin haut-gauche (100,70) vers (70,40) ---
  const from = toScreen(100, 70);
  const to = toScreen(70, 40);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let k = 1; k <= 6; k++) {
    await page.mouse.move(from.x + (to.x - from.x) * k / 6, from.y + (to.y - from.y) * k / 6);
    await new Promise((r) => setTimeout(r, 40));
  }
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 400)); // commit + re-render

  const p3 = await colorAt(75, 45); // sous le nouveau coin : orange attendu
  console.log('  P3(75,45)=' + JSON.stringify(p3));
  check('P3 orange : le coin tire par la poignee a bien deplace l\'image', isOrange(p3));

  // --- Suppr : retour a la pose d'identite ---
  await page.keyboard.press('Delete');
  await new Promise((r) => setTimeout(r, 400));
  const p4 = await colorAt(200, 85); // l'ancien creux est comble
  console.log('  P4(200,85)=' + JSON.stringify(p4));
  check('P4 orange : Suppr a restaure la pose d\'identite (le trou est comble)', isOrange(p4));

  console.log(failed ? `\n${failed} ECHEC(S)` : '\n=== E2E MAILLAGE : TOUT PASSE ===');
  process.exitCode = failed ? 1 : 0;
} finally {
  await browser.close();
}
