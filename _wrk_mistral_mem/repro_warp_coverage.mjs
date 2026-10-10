// Couverture analytique du maillage : quels pixels locaux sont couverts par
// la pose (1,1)->(90,20) ? Répond si le trou attendu existe vraiment.
import { defaultWarpGrid, ensureWarp, drawWarpImage } from '../src/core/warp.js';

const bm = { kind: 'bitmap', width: 200, height: 160 };
ensureWarp(bm);
bm.warpPoints[1 * 5 + 1] = { x: 90, y: 20 };

// ctx simulé : enregistre les triangles de clip avec l'expansion SEAM_PAD
const triangles = [];
const ctx = {
  save() {}, restore() {}, beginPath() {}, closePath() {}, clip() {},
  moveTo() {}, lineTo() {},
  transform(a, b, c, d, e, f) { triangles.push([a, b, c, d, e, f]); },
  drawImage() {},
};
// reproduire le dessin réél : on capte les triangles CLIP, pas transform :
// on remplace : le clip = triangle dst étendu ; plus simple : réimplémenter
// l'itération de drawWarpImage en lisant les mêmes données.
const { cols, rows } = bm.warp;
const src = defaultWarpGrid(bm.width, bm.height, cols, rows);
const dst = bm.warpPoints;
const PAD = 0.6;
const clips = [];
for (let j = 0; j < rows; j++) {
  for (let i = 0; i < cols; i++) {
    const p00 = j * (cols + 1) + i, p10 = p00 + 1, p01 = p00 + (cols + 1), p11 = p01 + 1;
    for (const tri of [[dst[p00], dst[p10], dst[p01]], [dst[p10], dst[p11], dst[p01]]]) {
      const cx = (tri[0].x + tri[1].x + tri[2].x) / 3;
      const cy = (tri[0].y + tri[1].y + tri[2].y) / 3;
      clips.push(tri.map((p) => {
        const vx = p.x - cx, vy = p.y - cy;
        const len = Math.hypot(vx, vy) || 1;
        return { x: p.x + (vx / len) * PAD, y: p.y + (vy / len) * PAD };
      }));
    }
  }
}
function covered(x, y) {
  return clips.some(([a, b, c]) => {
    const s = (pa, pb, pp) => (pp.x - pa.x) * (pb.y - pa.y) - (pb.x - pa.x) * (pp.y - pa.y);
    const d1 = s(a, b, { x, y }), d2 = s(b, c, { x, y }), d3 = s(c, a, { x, y });
    const neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
    const pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
    return !(neg && pos);
  });
}
// vérification : le mock ctx ne sert pas, on appelle quand même la vraie
// fonction pour garantir qu'elle s'exécute sans erreur sur cette pose
drawWarpImage(ctx, { naturalWidth: 1, naturalHeight: 1 }, bm);

for (const [x, y, label] of [[45, 35, '(45,35) suppose etre trou'], [40, 30, '(40,30)'], [10, 10, '(10,10)'], [48, 33, '(48,33)'], [46, 36, '(46,36)'], [44, 38, '(44,38)'], [42, 25, '(42,25) T2?'], [150, 80, '(150,80) coeur']]) {
  console.log(`  local (${x},${y}) ${label} -> ${covered(x, y) ? 'COUVERT' : 'TROU'}`);
}
// scan : tous les points non couverts dans le carré (0,0)-(50,40)
const holes = [];
for (let y = 0; y <= 40; y += 5) for (let x = 0; x <= 50; x += 5) if (!covered(x, y)) holes.push(`(${x},${y})`);
console.log('  trous echantillonnes dans la cellule (0,0) : ' + (holes.join(' ') || 'AUCUN'));
