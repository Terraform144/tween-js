// Tests unitaires caméra : easing du tween (resolveCameraAtFrame) et
// moveCameraKeyframe. Run : node _wrk_mistral_mem/repro_camera_easing.mjs
import { pathToFileURL } from 'node:url';

const cam = await import(pathToFileURL('F:/_SRC/__Debrouillard/Animate_JS_PRJ/src/core/camera.js').href);
const model = await import(pathToFileURL('F:/_SRC/__Debrouillard/Animate_JS_PRJ/src/core/model.js').href);

let failed = 0;
function check(label, cond) {
  console.log((cond ? '  OK  ' : 'FAIL  ') + label);
  if (!cond) failed++;
}
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

const doc = model.createDocument({ name: 'Cam-Test', width: 400, height: 300 });
check('doc vierge : pas de caméra', !cam.hasCamera(doc) && cam.resolveCameraAtFrame(doc, 5) === null);

// Clé 0 : zoom 1 ; clé 10 : zoom 2. Pas d'easing = linéaire.
cam.upsertCameraKeyframe(doc, 0, { zoom: 1 });
cam.upsertCameraKeyframe(doc, 10, { zoom: 2 });
const kf0 = cam.getCameraKeyframeAt(doc, 0);
const kf10 = cam.getCameraKeyframeAt(doc, 10);
check('deux clés posées', !!kf0 && !!kf10);

check('linéaire : zoom@5 = 1.5', near(cam.resolveCameraAtFrame(doc, 5).zoom, 1.5));
check('linéaire : zoom@2 = 1.2', near(cam.resolveCameraAtFrame(doc, 2).zoom, 1.2));
check('avant la première clé : identité (null)', cam.resolveCameraAtFrame(doc, -1) === null);
check('après la dernière : tient l\'état', near(cam.resolveCameraAtFrame(doc, 15).zoom, 2));

// Easing porté par la clé ACTIVE (gouverne la progression vers la suivante)
kf0.easing = 'easeIn'; // t^2 : zoom@5 = 1.25
check('easeIn : zoom@5 = 1.25', near(cam.resolveCameraAtFrame(doc, 5).zoom, 1.25));
kf0.easing = 'easeOut'; // 1-(1-t)^2 : zoom@5 = 1.75
check('easeOut : zoom@5 = 1.75', near(cam.resolveCameraAtFrame(doc, 5).zoom, 1.75));
kf0.easing = 'easeInOut'; // t<0.5 : 2t^2 : zoom@5 = 1.5
check('easeInOut : zoom@5 = 1.5', near(cam.resolveCameraAtFrame(doc, 5).zoom, 1.5));
kf10.easing = 'easeIn';
check('easing de la clé SUIVANTE ne change pas le span 0->10', near(cam.resolveCameraAtFrame(doc, 5).zoom, 1.5));

// Cycle d'easing : linear -> easeIn -> easeOut -> easeInOut -> linear
kf0.easing = 'linear';
check('cycle : linear -> easeIn', cam.nextCameraEasing(kf0) === 'easeIn');
check('cycle : easeIn -> easeOut', cam.nextCameraEasing(kf0) === 'easeOut');
check('cycle : easeOut -> easeInOut', cam.nextCameraEasing(kf0) === 'easeInOut');
check('cycle : easeInOut -> linear', cam.nextCameraEasing(kf0) === 'linear');

// moveCameraKeyframe
check('déplacement valide 0 -> 3', cam.moveCameraKeyframe(doc, kf0, 3) && kf0.index === 3);
check('interpolation suit le déplacement (zoom@5 = 1 + 2/7)', near(cam.resolveCameraAtFrame(doc, 5).zoom, 1 + 2 / 7));
check('refus : par-dessus la clé suivante (10)', !cam.moveCameraKeyframe(doc, kf0, 10));
check('refus : coller à la clé suivante (10-1 = 9 accepté, 10 refusé)', cam.moveCameraKeyframe(doc, kf0, 9) && !cam.moveCameraKeyframe(doc, kf0, 10));
check('refus : index déjà occupé (9 occupé par la clé déplacée elle-même = no-op vrai)',
  (() => { cam.upsertCameraKeyframe(doc, 12, { zoom: 3 }); const kf12 = cam.getCameraKeyframeAt(doc, 12); return !!kf12 && !cam.moveCameraKeyframe(doc, kf12, 9); })());
check('refus : index négatif', !cam.moveCameraKeyframe(doc, kf0, -1));

// Suppression de la dernière clé = caméra entièrement retirée
cam.removeCameraKeyframeAt(doc, 9);
cam.removeCameraKeyframeAt(doc, 10);
cam.removeCameraKeyframeAt(doc, 12);
check('suppression de toutes les clés : plus de caméra', !cam.hasCamera(doc) && doc.camera === null);

console.log(failed ? `\n${failed} ÉCHEC(S)` : '\nTOUS LES TESTS PASSENT');
process.exit(failed ? 1 : 0);
