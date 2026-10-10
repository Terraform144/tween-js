// Test des fonctions de maillage (core/warp.js + playback/interpolate.js).
// Run : node _wrk_mistral_mem/repro_warp.mjs
import { defaultWarpGrid, warpPointCount, ensureWarp, hasValidWarp, drawWarpImage, warpOutlinePath, warpBounds, WARP_DEFAULT_COLS, WARP_DEFAULT_ROWS } from '../src/core/warp.js';
import { interpolateElement } from '../src/playback/interpolate.js';

let failed = 0;
function check(label, cond) {
  console.log((cond ? '  OK  ' : 'FAIL  ') + label);
  if (!cond) failed++;
}
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// --- grille par défaut ---
const grid = defaultWarpGrid(100, 80, 4, 4);
check('defaultWarpGrid 4x4 = 25 points', grid.length === 25 && warpPointCount(4, 4) === 25);
check('coins (0,0)-(100,80)', near(grid[0].x, 0) && near(grid[0].y, 0)
  && near(grid[24].x, 100) && near(grid[24].y, 80));
check('milieu (2,2) = (50,40)', near(grid[2 * 5 + 2].x, 50) && near(grid[2 * 5 + 2].y, 40));

// --- ensureWarp / hasValidWarp ---
const bm = { kind: 'bitmap', width: 100, height: 80 };
check('bitmap vierge : pas de warp', !hasValidWarp(bm));
ensureWarp(bm);
check('ensureWarp active le maillage', hasValidWarp(bm) && bm.warp.cols === WARP_DEFAULT_COLS);
const bm2 = { kind: 'bitmap', width: 100, height: 80, warp: { cols: 2, rows: 2 }, warpPoints: [{ x: 0 }] };
ensureWarp(bm2);
check('ensureWarp répare une pose incomplète', hasValidWarp(bm2) && bm2.warpPoints.length === 9);

// --- drawWarpImage via ctx simulé ---
function mockCtx() {
  const calls = { triangles: [], images: 0, path: [] };
  const ctx = {
    save() {}, restore() {},
    beginPath() {}, closePath() { calls.path.push('Z'); },
    moveTo(x, y) { calls.path.push([x, y]); },
    lineTo(x, y) { calls.path.push([x, y]); },
    clip() {},
    transform(a, b, c, d, e, f) { calls.triangles.push([a, b, c, d, e, f]); },
    drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) { calls.images++; calls.rect = [sx, sy, sw, sh, dx, dy, dw, dh]; },
  };
  return { ctx, calls };
}
const img = { naturalWidth: 50, naturalHeight: 40 };

// Pose d'identité : toutes les transformations doivent être l'identité
const { ctx: c1, calls: k1 } = mockCtx();
drawWarpImage(c1, img, bm);
check('grille 4x4 = 32 triangles dessinés', k1.triangles.length === 32);
check('pose identité : matrices identités', k1.triangles.every((m) => near(m[0], 1) && near(m[1], 0) && near(m[2], 0) && near(m[3], 1) && near(m[4], 0) && near(m[5], 0)));
check('drawImage met à l\'échelle d\'affichage', k1.images === 32 && near(k1.rect[2], 50) && near(k1.rect[6], 100) && near(k1.rect[7], 80));

// Pose déplacée : seul le point central (2,2) bouge de +10 px en x
const posed = ensureWarp({ ...bm, warpPoints: defaultWarpGrid(100, 80, 4, 4).map((p) => ({ ...p })) });
posed.warpPoints[2 * 5 + 2] = { x: 60, y: 40 };
const { ctx: c2, calls: k2 } = mockCtx();
drawWarpImage(c2, img, posed);
const nonIdentity = k2.triangles.filter((m) => !near(m[4], 0) || !near(m[5], 0));
// le point (2,2) appartient à 6 cellules x 2 triangles = 12 triangles max,
// et au moins les 2 triangles de la cellule adjacente doivent bouger
check('seuls les triangles autour du point bougent', nonIdentity.length > 0 && nonIdentity.length <= 12);

// --- interpolation des poses ---
const poseA = defaultWarpGrid(100, 80, 4, 4);
const poseB = defaultWarpGrid(100, 80, 4, 4).map((p) => ({ x: p.x, y: p.y + 20 }));
const elA = { kind: 'bitmap', width: 100, height: 80, warp: { cols: 4, rows: 4 }, warpPoints: poseA };
const elB = { kind: 'bitmap', width: 100, height: 80, warp: { cols: 4, rows: 4 }, warpPoints: poseB };
const mid = interpolateElement(elA, elB, 0.5);
check('t=0.5 : pose médiane', mid.warpPoints.every((p, i) => near(p.y, poseA[i].y + 10)));
const elC = { ...elB, warp: { cols: 2, rows: 8 } }; // structure différente
const rigid = interpolateElement(elA, elC, 0.5);
check('structure différente : pas d\'interpolation', rigid.warpPoints.every((p, i) => near(p.x, poseA[i].x) && near(p.y, poseA[i].y)));

// --- contour + englobante ---
const { ctx: c3, calls: k3 } = mockCtx();
warpOutlinePath(c3, 4, 4, posed.warpPoints);
const perim = k3.path.filter((p) => Array.isArray(p));
check('contour : périmètre complet + fermeture', perim.length === 16 && k3.path.includes('Z'));
check('contour : coordonnées numériques (pas de NaN)', perim.every((p) => typeof p[0] === 'number' && typeof p[1] === 'number' && Number.isFinite(p[0]) && Number.isFinite(p[1])));
check('contour : commence au coin (0,0)', near(perim[0][0], 0) && near(perim[0][1], 0));
const bb = warpBounds(posed.warpPoints);
check('warpBounds', near(bb.x, 0) && near(bb.y, 0) && near(bb.width, 100) && near(bb.height, 80));

console.log(failed ? `\n${failed} ÉCHEC(S)` : '\nTOUS LES TESTS PASSENT');
process.exit(failed ? 1 : 0);
