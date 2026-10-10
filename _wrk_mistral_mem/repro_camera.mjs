// Harnais outil caméra (caméra virtuelle de scène façon Animate CC).
// Valide :
//   1. les valeurs par défaut (aucune image clé caméra) — resolveCameraAtFrame
//      null, cameraLayerTransform null : rendu historique strict ;
//   2. upsert/getCameraKeyframeAt/removeCameraKeyframeAt : pose de clé (base
//      = état interpolé courant), modification, tri, suppression de la
//      dernière clé -> doc.camera null ;
//   3. l'interpolation linéaire permanente entre clés + tenue après la
//      dernière + identité avant la première ;
//   4. la PARITÉ DE RENDU éditeur (cameraLayerTransform, la transform
//      appliquée aux calques Konva) vs export (applyCameraToContext +
//      resolveCameraAtFrame de tweenRuntime.js) avec un vrai produit
//      matriciel sur un contexte canvas factice — un point connu de la scène
//      doit tomber exactement au même endroit au pixel près ;
//   5. la sémantique cadre->canvas : zoom 1 = identité ; zoom 2 = le point
//      central caméra tombe au centre du canvas et un déplacement de 1 px
//      scène bouge de 1/zoom px à l'écran ; rotation = le contenu tourne de
//      -cam.rotation dans le cadre ;
//   6. buildFullDocData embarque doc.camera ; les deux résolveurs
//      (core/camera.js éditeur vs tweenRuntime.js export) donnent le même
//      état interpolé image par image (parité éditeur/export).
// Run : node _wrk_mistral_mem/repro_camera.mjs
import { createDocument } from '../src/core/model.js';
import {
  hasCamera, defaultCamera, resolveCameraAtFrame, upsertCameraKeyframe,
  removeCameraKeyframeAt, getCameraKeyframeAt, cameraLayerTransform,
} from '../src/core/camera.js';
import {
  resolveCameraAtFrame as resolveCameraExport,
  applyCameraToContext,
} from '../src/export/tweenRuntime.js';
import { readFileSync } from 'node:fs';

let passed = 0, failed = 0;
function check(label, cond, detail) {
  if (cond) { passed++; console.log('  OK  ' + label); }
  else { failed++; console.log('FAIL  ' + label + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); }
}
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const nearPt = (a, b, eps = 1e-9) => near(a.x, b.x, eps) && near(a.y, b.y, eps);

// Contexte canvas factice avec VRAI produit matriciel (convention DOMMatrix
// [a,b,c,d,e,f] : x' = a·x + c·y + e). Composition CANVAS : M' = M·A.
function makeMockCtx() {
  const st = { m: [1, 0, 0, 1, 0, 0], stack: [] };
  const mul = (m, a) => [
    m[0] * a[0] + m[2] * a[1],
    m[1] * a[0] + m[3] * a[1],
    m[0] * a[2] + m[2] * a[3],
    m[1] * a[2] + m[3] * a[3],
    m[0] * a[4] + m[2] * a[5] + m[4],
    m[1] * a[4] + m[3] * a[5] + m[5],
  ];
  const T = (x, y) => [1, 0, 0, 1, x, y];
  // L'API canvas ctx.rotate() prend des RADIANS (comme le vrai code appelé).
  const R = (rad) => {
    const c = Math.cos(rad), s = Math.sin(rad);
    return [c, s, -s, c, 0, 0];
  };
  const S = (x, y) => [x, 0, 0, y, 0, 0];
  return {
    st,
    translate(x, y) { st.m = mul(st.m, T(x, y)); },
    rotate(rad) { st.m = mul(st.m, R(rad)); },
    scale(x, y) { st.m = mul(st.m, S(x, y)); },
    save() { st.stack.push(st.m.slice()); },
    restore() { st.m = st.stack.pop(); },
    // Applique la matrice courante à un point de scène.
    point(p) {
      const m = st.m;
      return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
    },
  };
}

// Point écran de référence (sémantique cadre->canvas), calculé à la main :
// screen = centre + R(-rotation) . S(zoom) . (p - cam)
// (le cadre doc/zoom x doc/zoom est étiré sur tout le canvas).
function refScreen(cam, p, W, H) {
  const rad = -(cam.rotation || 0) * Math.PI / 180;
  const c = Math.cos(rad), s = Math.sin(rad);
  const k = cam.zoom || 1;
  const dx = (p.x - cam.x) * k, dy = (p.y - cam.y) * k;
  return { x: W / 2 + c * dx - s * dy, y: H / 2 + s * dx + c * dy };
}

// Monde d'un point via la transform de CALQUE Konva (voie éditeur) :
// local p -> pos + R(rotation).S(scale).p (transform standard Konva).
function konvaWorldOf(lt, p) {
  const r = lt.rotation * Math.PI / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return {
    x: lt.x + lt.scaleX * p.x * c - lt.scaleY * p.y * s,
    y: lt.y + lt.scaleX * p.x * s + lt.scaleY * p.y * c,
  };
}

console.log('--- 1. Défauts (aucune caméra = rendu historique)');
{
  const doc = createDocument({ width: 550, height: 400 });
  check('hasCamera = false', hasCamera(doc) === false);
  check('resolveCameraAtFrame = null', resolveCameraAtFrame(doc, 5) === null);
  check('cameraLayerTransform(null) = null', cameraLayerTransform(null, 550, 400) === null);
  check('defaultCamera = centre du doc', nearPt(defaultCamera(doc), { x: 275, y: 200 }));
  // exportHTML.js importe tweenRuntime via ?raw (spécifique Vite, non
  // résolvable sous Node) : la présence de la caméra dans les exports se
  // vérifie sur le SOURCE, comme pour les copies autonomes du pivot.
  const srcExportHTML = readFileSync(new URL('../src/export/exportHTML.js', import.meta.url), 'utf8');
  check('buildFullDocData embarque camera', srcExportHTML.includes('camera: doc.camera || null'));
  check('bootstrap export applique la caméra au root.draw', srcExportHTML.includes('applyCameraToContext(ctx, resolveCameraAtFrame(DATA.camera, root.currentFrame'));
  const srcCompiled = readFileSync(new URL('../src/export/compiledPlayer.js', import.meta.url), 'utf8');
  check('player compilé applique la caméra au root.draw', srcCompiled.includes('applyCameraToContext(ctx, resolveCameraAtFrame(DATA.camera, root.currentFrame'));
  const srcExportCompiled = readFileSync(new URL('../src/export/exportCompiled.js', import.meta.url), 'utf8');
  check('compilé : DATA passe par buildFullDocData (camera incluse)', srcExportCompiled.includes('buildFullDocData(doc)'));
  check('removeCameraKeyframeAt sans caméra = false', removeCameraKeyframeAt(doc, 0) === false);
}

console.log('--- 2. Images clés : pose / modif / suppression');
{
  const doc = createDocument({ width: 550, height: 400 });
  upsertCameraKeyframe(doc, 5, { x: 300, y: 220, zoom: 2 });
  check('clé posée à 5', hasCamera(doc) && getCameraKeyframeAt(doc, 5) !== null);
  // Pose d'une clé à 10 partant de l'état interpolé courant (interpolation
  // comprise entre 5 et la nouvelle clé, pas de saut).
  const k5 = getCameraKeyframeAt(doc, 5);
  check('clé = valeurs normalisées', k5.x === 300 && k5.y === 220 && k5.zoom === 2 && k5.rotation === 0);
  upsertCameraKeyframe(doc, 10, { zoom: 3 });
  const k10 = getCameraKeyframeAt(doc, 10);
  check('nouvelle clé hérite x/y de la base', k10.x === 300 && k10.y === 220 && k10.zoom === 3);
  // Modification d'une clé existante : patch seulement.
  upsertCameraKeyframe(doc, 5, { x: 280 });
  check('patch de clé existante', getCameraKeyframeAt(doc, 5).x === 280 && getCameraKeyframeAt(doc, 5).zoom === 2);
  // Tri par index.
  upsertCameraKeyframe(doc, 7, { rotation: 15 });
  const idxs = doc.camera.keyframes.map((k) => k.index);
  check('clés triées', JSON.stringify(idxs) === JSON.stringify([5, 7, 10]), idxs);
  // Zoom borné.
  upsertCameraKeyframe(doc, 12, { zoom: 999 });
  check('zoom plafonné à 10', getCameraKeyframeAt(doc, 12).zoom === 10);
  upsertCameraKeyframe(doc, 13, { zoom: 0.0001 });
  check('zoom plancher à 0.1', getCameraKeyframeAt(doc, 13).zoom === 0.1);
  // Suppression.
  check('remove clé 7', removeCameraKeyframeAt(doc, 7) === true && getCameraKeyframeAt(doc, 7) === null);
  check('remove clé absente = false', removeCameraKeyframeAt(doc, 7) === false);
  removeCameraKeyframeAt(doc, 5);
  removeCameraKeyframeAt(doc, 10);
  removeCameraKeyframeAt(doc, 12);
  removeCameraKeyframeAt(doc, 13);
  check('dernière clé supprimée -> camera null', doc.camera === null && hasCamera(doc) === false);
  // Round-trip JSON (sérialisation document intacte).
  const doc2 = createDocument({ width: 200, height: 100 });
  upsertCameraKeyframe(doc2, 0, { x: 90, y: 60, zoom: 1.5, rotation: -30 });
  const back = JSON.parse(JSON.stringify(doc2));
  check('round-trip JSON', back.camera.keyframes[0].zoom === 1.5 && back.camera.keyframes[0].rotation === -30);
}

console.log('--- 3. Interpolation : tenue, linéaire permanente, identité avant');
{
  const doc = createDocument({ width: 500, height: 300 });
  upsertCameraKeyframe(doc, 0, { x: 100, y: 100, zoom: 1, rotation: 0 });
  upsertCameraKeyframe(doc, 10, { x: 300, y: 200, zoom: 4, rotation: 90 });
  const c5 = resolveCameraAtFrame(doc, 5);
  check('t=0.5 exact', nearPt(c5, { x: 200, y: 150 }) && near(c5.zoom, 2.5) && near(c5.rotation, 45), c5);
  const c3 = resolveCameraAtFrame(doc, 3);
  check('t=0.3 exact', near(c3.x, 160) && near(c3.y, 130) && near(c3.zoom, 1 + 0.3 * 3) && near(c3.rotation, 27), c3);
  const c10 = resolveCameraAtFrame(doc, 10);
  check('t=1 exact', near(c10.x, 300) && near(c10.zoom, 4) && near(c10.rotation, 90));
  const c12 = resolveCameraAtFrame(doc, 12);
  check('tenue après la dernière clé', near(c12.zoom, 4) && near(c12.rotation, 90));
  // Identité avant la première clé (clé à 5, image 2).
  const doc3 = createDocument({ width: 500, height: 300 });
  upsertCameraKeyframe(doc3, 5, { zoom: 2 });
  check('identité avant la première clé', resolveCameraAtFrame(doc3, 2) === null);
  check('première clé atteinte', resolveCameraAtFrame(doc3, 5) !== null);
  // Champ manquant -> défaut (centre du doc, zoom 1).
  const doc4 = createDocument({ width: 400, height: 200 });
  upsertCameraKeyframe(doc4, 0, {});
  const c0 = resolveCameraAtFrame(doc4, 0);
  check('clé vide = défauts', nearPt(c0, { x: 200, y: 100 }) && near(c0.zoom, 1) && near(c0.rotation, 0));
}

console.log('--- 4. Parité rendu éditeur (Konva) vs export (canvas)');
{
  const W = 550, H = 400;
  const cams = [
    { x: 275, y: 200, zoom: 1, rotation: 0 },      // identité
    { x: 275, y: 200, zoom: 2, rotation: 0 },      // travelling avant centré
    { x: 150, y: 120, zoom: 1.75, rotation: 0 },   // pan + zoom
    { x: 300, y: 220, zoom: 0.5, rotation: 0 },     // dézoom (toile élargie)
    { x: 275, y: 200, zoom: 1, rotation: 30 },     // rotation pure
    { x: 180, y: 260, zoom: 2.4, rotation: -37 },   // tout composé
    { x: 400, y: 150, zoom: 0.6, rotation: 123 },   // dézoom + rotation
  ];
  const pts = [{ x: 0, y: 0 }, { x: 275, y: 200 }, { x: 550, y: 400 }, { x: 137, y: 389 }, { x: 512, y: 33 }];
  let allOk = true, worst = 0;
  for (const cam of cams) {
    // Voie export : applyCameraToContext sur un ctx factice.
    const ctx = makeMockCtx();
    applyCameraToContext(ctx, cam, W, H);
    // Voie éditeur : transform de calque Konva.
    const lt = cameraLayerTransform(cam, W, H);
    for (const p of pts) {
      const exp = ctx.point(p);
      const edt = konvaWorldOf(lt, p);
      const ref = refScreen(cam, p, W, H);
      if (!nearPt(exp, ref, 1e-6) || !nearPt(edt, ref, 1e-6)) {
        allOk = false;
        worst = Math.max(worst, Math.abs(exp.x - ref.x), Math.abs(edt.x - ref.x));
      }
    }
  }
  check('éditeur et export tombent sur la référence (7 caméras x 5 points)', allOk, worst);
  check('applyCameraToContext(null) = no-op', (() => {
    const ctx = makeMockCtx();
    applyCameraToContext(ctx, null, W, H);
    const p = ctx.point({ x: 42, y: 13 });
    return nearPt(p, { x: 42, y: 13 });
  })());
}

console.log('--- 5. Sémantique cadre -> canvas');
{
  const W = 550, H = 400;
  // Zoom 1 + centre : identité parfaite.
  const lt = cameraLayerTransform({ x: W / 2, y: H / 2, zoom: 1, rotation: 0 }, W, H);
  check('zoom 1 centre = transform identité', near(lt.x, 0) && near(lt.y, 0) && near(lt.rotation, 0) && near(lt.scaleX, 1) && near(lt.scaleY, 1), lt);
  // Zoom 2 : 1 px de scène = 2 px de cadre autour du centre (travelling).
  const cam = { x: W / 2, y: H / 2, zoom: 2, rotation: 0 };
  const ctx = makeMockCtx();
  applyCameraToContext(ctx, cam, W, H);
  const a = ctx.point({ x: W / 2, y: H / 2 });
  const b = ctx.point({ x: W / 2 + 10, y: H / 2 });
  check('zoom 2 : centre au centre du canvas', nearPt(a, { x: W / 2, y: H / 2 }));
  check('zoom 2 : 10 px de scène = 20 px de cadre', near(b.x - a.x, 20) && near(b.y - a.y, 0));
  // Rotation 90 : le contenu tourne de -90 dans le cadre. Point à droite du
  // centre -> tombe AU-DESSUS du centre à l'écran.
  const camR = { x: W / 2, y: H / 2, zoom: 1, rotation: 90 };
  const ctxR = makeMockCtx();
  applyCameraToContext(ctxR, camR, W, H);
  const pr = ctxR.point({ x: W / 2 + 10, y: H / 2 });
  check('rotation 90 : contenu tourné de -90', near(pr.x, W / 2) && near(pr.y, H / 2 - 10, 1e-6), pr);
  // Le cadre couvre W/zoom x H/zoom : le coin du cadre (bas-droite) tombe au
  // coin du canvas.
  const camZ = { x: 200, y: 150, zoom: 2, rotation: 0 };
  const ctxZ = makeMockCtx();
  applyCameraToContext(ctxZ, camZ, W, H);
  const corner = ctxZ.point({ x: 200 + W / 4, y: 150 + H / 4 }); // coin du cadre
  check('coin du cadre = coin du canvas', nearPt(corner, { x: W, y: H }, 1e-6), corner);
}

console.log('--- 6. Parité éditeur/export : les deux résolveurs, image par image');
{
  const W = 550, H = 400;
  const doc = createDocument({ width: W, height: H });
  upsertCameraKeyframe(doc, 2, { x: 300, y: 210, zoom: 1, rotation: 0 });
  upsertCameraKeyframe(doc, 8, { x: 180, y: 120, zoom: 2.5, rotation: 40 });
  const camData = { keyframes: doc.camera.keyframes.map((k) => ({ ...k })) };
  check('camData = les clés du doc', camData.keyframes.length === 2);
  let allOk = true;
  for (let f = 0; f <= 12; f++) {
    const a = resolveCameraAtFrame(doc, f);
    const b = resolveCameraExport(camData, f, W, H);
    if (!a !== !b) { allOk = false; break; }
    if (a && b && (!near(a.x, b.x) || !near(a.y, b.y) || !near(a.zoom, b.zoom) || !near(a.rotation, b.rotation))) { allOk = false; break; }
  }
  check('resolveCameraAtFrame éditeur == export (images 0..12)', allOk);
  // resolveCameraExport n'a besoin QUE de camData (autonomie du runtime).
  const solo = resolveCameraExport({ keyframes: [{ index: 0, x: 10, y: 10, zoom: 1, rotation: 0 }, { index: 4, x: 50, y: 50, zoom: 3, rotation: 20 }] }, 2, 100, 100);
  check('runtime autonome (sans doc)', near(solo.x, 30) && near(solo.zoom, 2) && near(solo.rotation, 10), solo);
  check('runtime sans caméra = null', resolveCameraExport(null, 2, 100, 100) === null);
}

console.log('--- 7. Non-régression : export sans caméra dessine à l\'identique');
{
  const W = 300, H = 200;
  const doc = createDocument({ width: W, height: H });
  const ctxNo = makeMockCtx();
  applyCameraToContext(ctxNo, resolveCameraExport(null, 5, W, H), W, H);
  const p = ctxNo.point({ x: 123, y: 77 });
  check('sans caméra, point inchangé', nearPt(p, { x: 123, y: 77 }));
  // Et avec une caméra d'identité (zoom 1, centre, sans rotation) : pareil.
  upsertCameraKeyframe(doc, 0, {});
  const ctxId = makeMockCtx();
  applyCameraToContext(ctxId, resolveCameraAtFrame(doc, 5), W, H);
  const p2 = ctxId.point({ x: 123, y: 77 });
  check('caméra identité = point inchangé', nearPt(p2, { x: 123, y: 77 }), p2);
}

console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
