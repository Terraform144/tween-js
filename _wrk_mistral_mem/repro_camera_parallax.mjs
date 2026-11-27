// Harnais parallaxCamera (pur) : interpolation vers le centre selon f.
import { parallaxCamera, cameraLayerTransform } from '../src/core/camera.js';
let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l); } };
const near = (a, b, e=0.001) => Math.abs(a - b) <= e;
const doc = { width: 550, height: 400 };
const cam = { x: 400, y: 300, zoom: 2, rotation: 30 };

// f=1 -> caméra identique
ok(parallaxCamera(cam, 1, doc) === cam, 'f=1: caméra identique (référence)');
// f=0 -> identité (centre, zoom 1, rotation 0)
const c0 = parallaxCamera(cam, 0, doc);
ok(near(c0.x, 275) && near(c0.y, 200) && near(c0.zoom, 1) && near(c0.rotation, 0), 'f=0: identité (centre 275,200, zoom 1, rot 0)');
// f=0.5 -> à mi-chemin
const c5 = parallaxCamera(cam, 0.5, doc);
ok(near(c5.x, 337.5) && near(c5.y, 250) && near(c5.zoom, 1.5) && near(c5.rotation, 15), 'f=0.5: x=337.5 y=250 zoom=1.5 rot=15');
// f clampé
const c2 = parallaxCamera(cam, 5, doc);
ok(c2 === cam, 'f>1 clampé à 1');
// cam null -> null
ok(parallaxCamera(null, 0.5, doc) === null, 'cam null -> null');
// transform Konva cohérent : f=0 -> identité Konva
const lt0 = cameraLayerTransform(c0, 550, 400);
ok(near(lt0.x, 0, 0.01) && near(lt0.y, 0, 0.01) && near(lt0.scaleX, 1) && near(lt0.rotation, 0), 'cameraLayerTransform(f=0) = identité Konva');
console.log(`\n${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
