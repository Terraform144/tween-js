// Maillage de déformation bitmap (mesh warp) — la grille posée sur une
// image a des intersections (points) animables image par image. Le rendu
// découpe l'image en cellules (2 triangles chacune) et plaque chaque
// triangle source sur son triangle destination par transformation affine
// (clip + transform + drawImage). Partagé par l'éditeur (Stage) et, sous
// forme de copie autonome, par le runtime exporté (tweenRuntime.js).
//
// Espace des points : IMAGE locale, origine = coin haut-gauche de l'image,
// unités = taille d'affichage (el.width x el.height) — les points vivent
// dans le même repère que le dessin du Konva.Image historique (0,0)-(w,h).

export const WARP_DEFAULT_COLS = 4;
export const WARP_DEFAULT_ROWS = 4;

// Nombre d'intersections d'une grille cols x rows cellules (row-major :
// index = j * (cols + 1) + i).
export function warpPointCount(cols, rows) {
  return (cols + 1) * (rows + 1);
}

// Pose d'identité : lattice régulier couvrant (0,0)-(w,h).
export function defaultWarpGrid(w, h, cols = WARP_DEFAULT_COLS, rows = WARP_DEFAULT_ROWS) {
  const pts = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      pts.push({ x: (w * i) / cols, y: (h * j) / rows });
    }
  }
  return pts;
}

// Active/garantit le maillage sur un élément bitmap du modèle (mutation sur
// place, à appeler juste avant un commit dans une image clé).
export function ensureWarp(el) {
  if (!el.warp) el.warp = { cols: WARP_DEFAULT_COLS, rows: WARP_DEFAULT_ROWS };
  const need = warpPointCount(el.warp.cols, el.warp.rows);
  const ok = Array.isArray(el.warpPoints)
    && el.warpPoints.length === need
    && el.warpPoints.every((p) => p && typeof p.x === 'number' && typeof p.y === 'number');
  if (!ok) el.warpPoints = defaultWarpGrid(el.width, el.height, el.warp.cols, el.warp.rows);
  return el;
}

// Le maillage est-il complet et valide sur cet élément ?
export function hasValidWarp(el) {
  return !!(el.warp && Array.isArray(el.warpPoints)
    && el.warpPoints.length === warpPointCount(el.warp.cols, el.warp.rows)
    && el.warpPoints.every((p) => p && typeof p.x === 'number' && typeof p.y === 'number'));
}

// Transformation affine envoyant le triangle source sur le triangle
// destination : [a, b, c, d, e, f] tels que x' = a*x + c*y + e,
// y' = b*x + d*y + f. Renvoie null si le triangle source est dégénéré.
function affineFromTriangle(s, d) {
  const [s1, s2, s3] = s;
  const [d1, d2, d3] = d;
  const det = s1.x * (s2.y - s3.y) - s2.x * (s1.y - s3.y) + s3.x * (s1.y - s2.y);
  if (Math.abs(det) < 1e-9) return null;
  const a = (d1.x * (s2.y - s3.y) + d2.x * (s3.y - s1.y) + d3.x * (s1.y - s2.y)) / det;
  const c = (d1.x * (s3.x - s2.x) + d2.x * (s1.x - s3.x) + d3.x * (s2.x - s1.x)) / det;
  const b = (d1.y * (s2.y - s3.y) + d2.y * (s3.y - s1.y) + d3.y * (s1.y - s2.y)) / det;
  const dd = (d1.y * (s3.x - s2.x) + d2.y * (s1.x - s3.x) + d3.y * (s2.x - s1.x)) / det;
  return [a, b, c, dd, d1.x - a * s1.x - c * s1.y, d1.y - b * s1.x - dd * s1.y];
}

// Expansion du clip autour du centroïde : sans elle, les erreurs d'arrondi
// du canvas laissent des coutures (fils de fond) entre cellules voisines.
const SEAM_PAD = 0.6;

function drawTriangle(ctx, img, w, h, s, d) {
  const m = affineFromTriangle(s, d);
  if (!m) return;
  const [a, b, c, dd, e, f] = m;
  const cx = (d[0].x + d[1].x + d[2].x) / 3;
  const cy = (d[0].y + d[1].y + d[2].y) / 3;
  ctx.save();
  ctx.beginPath();
  d.forEach((p, k) => {
    const vx = p.x - cx, vy = p.y - cy;
    const len = Math.hypot(vx, vy) || 1;
    const px = p.x + (vx / len) * SEAM_PAD;
    const py = p.y + (vy / len) * SEAM_PAD;
    if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, dd, e, f);
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  ctx.drawImage(img, 0, 0, iw, ih, 0, 0, w, h);
  ctx.restore();
}

// Dessine l'image déformée par le maillage, dans l'espace local (0,0)-(w,h).
// ctx : contexte canvas 2D NATIF (pas le wrapper Konva).
export function drawWarpImage(ctx, img, el) {
  const { cols, rows } = el.warp;
  const src = defaultWarpGrid(el.width, el.height, cols, rows);
  const dst = el.warpPoints;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const p00 = j * (cols + 1) + i;
      const p10 = p00 + 1;
      const p01 = p00 + (cols + 1);
      const p11 = p01 + 1;
      // Deux triangles par cellule (découpe diagonale p00-p11)
      drawTriangle(ctx, img, el.width, el.height,
        [src[p00], src[p10], src[p01]], [dst[p00], dst[p10], dst[p01]]);
      drawTriangle(ctx, img, el.width, el.height,
        [src[p10], src[p11], src[p01]], [dst[p10], dst[p11], dst[p01]]);
    }
  }
}

// Trace le contour extérieur du maillage déformé (pour le hit et le cadre).
// ctx : wrapper Konva.Context OU contexte natif (moveTo/lineTo/closePath
// existent dans les deux). ATTENTION : lineTo prend des COORDONNÉES, pas
// des objets point — un point passé tel quel produit un NaN silencieux
// dans le canvas et un chemin invalide (leçon E2E : le hit restait vide).
export function warpOutlinePath(ctx, cols, rows, pts) {
  const last = (cols + 1) * (rows + 1) - 1;
  const line = (i) => ctx.lineTo(pts[i].x, pts[i].y);
  ctx.beginPath();
  for (let i = 0; i <= cols; i++) {
    const p = pts[i];
    if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  }
  for (let j = 1; j <= rows; j++) line(j * (cols + 1) + cols);
  for (let i = cols - 1; i >= 0; i--) line(last - (cols - i));
  for (let j = rows - 1; j >= 1; j--) line(j * (cols + 1));
  ctx.closePath();
}

// Boîte englobante d'une pose de maillage (pour getSelfRect du nœud).
export function warpBounds(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
