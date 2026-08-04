// Helpers purs de résolution des dégradés, partagés par le rendu Konva
// (Stage.js) et l'éditeur de dégradés (PropertiesPanel.js). Le runtime
// d'export (tweenRuntime.js) contient sa propre copie autonome de ces deux
// fonctions de géométrie (convention projet : exports autonomes).

// Retourne les extrémités (dans l'espace local de l'élément) d'un dégradé
// linéaire d'angle donné, de sorte qu'il couvre toute la boîte width×height.
// 0° = gauche→droite, 90° = haut→bas (les y augmentent vers le bas).
export function gradientLineEnds(angle, width, height) {
  const rad = (angle || 0) * Math.PI / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const hw = (width || 0) / 2;
  const hh = (height || 0) / 2;
  const extent = Math.abs(dx) * hw + Math.abs(dy) * hh;
  return { x1: -dx * extent, y1: -dy * extent, x2: dx * extent, y2: dy * extent };
}

// Dégradé radial couvrant la boîte : centre au milieu, rayon du bord = demi-
// diagonale de la boîte englobante.
export function gradientRadial(width, height) {
  const r = Math.hypot((width || 0) / 2, (height || 0) / 2);
  return { x0: 0, y0: 0, r0: 0, x1: 0, y1: 0, r1: r };
}

// [{ offset, color }, ...] -> [offset, color, offset, color, ...] (attribut
// Konva fill*GradientColorStops).
export function colorStopsToPairs(stops) {
  const pairs = [];
  for (const s of stops || []) pairs.push(s.offset, s.color);
  return pairs;
}
