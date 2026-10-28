/**
 * Shape simplification: Ramer-Douglas-Peucker algorithm with optional smoothing.
 * Adapted for TweenJS PathPoint objects.
 * 
 * simplifyPathPoints(points, tolerance, closed, smoothPasses)
 *   points         Array of PathPoint objects (from createPathPoint: {x, y, cIn, cOut, smooth})
 *   tolerance     RDP epsilon: max allowed deviation from the original shape
 *   closed        true -> treat as a closed ring (filled polys)
 *   smoothPasses  number of moving-average passes before simplification (default 0)
 * 
 * Returns: Simplified array of PathPoint objects (cIn/cOut are cleared for simplified points)
 */

// Distance from point (px,py) to line segment (ax,ay)-(bx,by)
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Ramer-Douglas-Peucker for open polylines
function rdpOpen(pts, eps) {
  if (pts.length < 3) return pts.map(p => ({ x: p.x, y: p.y, cIn: null, cOut: null, smooth: false }));
  
  const ax = pts[0].x, ay = pts[0].y;
  const bx = pts[pts.length - 1].x, by = pts[pts.length - 1].y;
  
  let dmax = -1, index = -1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distToSeg(pts[i].x, pts[i].y, ax, ay, bx, by);
    if (d > dmax) { dmax = d; index = i; }
  }
  
  if (dmax > eps) {
    const left = rdpOpen(pts.slice(0, index + 1), eps);
    const right = rdpOpen(pts.slice(index), eps);
    return left.slice(0, -1).concat(right);
  }
  
  return [
    { x: ax, y: ay, cIn: null, cOut: null, smooth: false },
    { x: bx, y: by, cIn: null, cOut: null, smooth: false }
  ];
}

// Ramer-Douglas-Peucker for closed polygons
function rdpClosed(ring, eps) {
  const n = ring.length;
  if (n < 5) return ring.map(p => ({ x: p.x, y: p.y, cIn: null, cOut: null, smooth: false }));
  
  // Find point farthest from ring[0]
  let k = 1, dmax = -1;
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(ring[i].x - ring[0].x, ring[i].y - ring[0].y);
    if (d > dmax) { dmax = d; k = i; }
  }
  
  // Split ring at farthest point
  const ra = rdpOpen(ring.slice(0, k + 1), eps);
  const rb = rdpOpen(ring.slice(k).concat([ring[0]]), eps);
  const out = ra.slice(0, -1).concat(rb.slice(0, -1));
  
  // Ensure at least 3 points for a closed shape
  return out.length >= 3 ? out : ring.map(p => ({ x: p.x, y: p.y, cIn: null, cOut: null, smooth: false }));
}

// Smoothing for open polylines (moving average)
function smoothOpenPts(pts, passes) {
  let p = pts.map(q => ({ x: q.x, y: q.y, cIn: q.cIn, cOut: q.cOut, smooth: q.smooth }));
  
  for (let k = 0; k < passes; k++) {
    const q = p.map(r => ({ ...r }));
    for (let i = 1; i < p.length - 1; i++) {
      q[i] = {
        x: (p[i - 1].x + 2 * p[i].x + p[i + 1].x) / 4,
        y: (p[i - 1].y + 2 * p[i].y + p[i + 1].y) / 4,
        cIn: null,
        cOut: null,
        smooth: false
      };
    }
    p = q;
  }
  return p;
}

// Smoothing for closed rings (cyclic moving average)
function smoothCyclic(pts, passes) {
  let p = pts.map(q => ({ x: q.x, y: q.y, cIn: q.cIn, cOut: q.cOut, smooth: q.smooth }));
  const n = p.length;
  
  for (let k = 0; k < passes; k++) {
    const q = [];
    for (let i = 0; i < n; i++) {
      const a = p[(i - 1 + n) % n];
      const b = p[i];
      const c = p[(i + 1) % n];
      q.push({
        x: (a.x + 2 * b.x + c.x) / 4,
        y: (a.y + 2 * b.y + c.y) / 4,
        cIn: null,
        cOut: null,
        smooth: false
      });
    }
    p = q;
  }
  return p;
}

/**
 * Simplify an array of PathPoint objects using RDP algorithm.
 * 
 * @param {Array} pts - Array of PathPoint objects with {x, y, cIn, cOut, smooth}
 * @param {number} tolerance - RDP epsilon (max allowed deviation)
 * @param {boolean} closed - Whether the shape is closed (polygon)
 * @param {number} smoothPasses - Number of smoothing passes (default 0)
 * @returns {Array} Simplified array of PathPoint objects (Bezier handles are removed)
 */
export function simplifyPathPoints(pts, tolerance = 1.0, closed = false, smoothPasses = 0) {
  const eps = Math.max(0.1, tolerance);
  const passes = smoothPasses === undefined ? 0 : Math.max(0, smoothPasses);
  
  // Convert to plain objects if needed
  let p = pts.map(q => ({ x: q.x, y: q.y, cIn: q.cIn, cOut: q.cOut, smooth: q.smooth }));
  
  // Apply smoothing if requested
  if (passes > 0) {
    p = closed ? smoothCyclic(p, passes) : smoothOpenPts(p, passes);
  }
  
  // Apply RDP simplification
  p = closed ? rdpClosed(p, eps) : rdpOpen(p, eps);
  
  // Ensure minimum points
  const min = closed ? 3 : 2;
  if (p.length < min && pts.length >= min) {
    // If simplification was too aggressive, return original without handles
    return pts.map(q => ({ x: q.x, y: q.y, cIn: null, cOut: null, smooth: false }));
  }
  
  return p;
}

/**
 * Create a simplified copy of a shape element.
 * Only modifies 'line' and 'path' shape types.
 * 
 * @param {Object} shape - Shape element with points array
 * @param {number} tolerance - RDP tolerance (default 1.0)
 * @param {boolean} closed - Force closed shape (uses shape.closed if not specified)
 * @param {number} smoothPasses - Smoothing passes (default 0)
 * @returns {Object} New shape with simplified points (or original if not applicable)
 */
export function simplifyShape(shape, tolerance = 1.0, closed = null, smoothPasses = 0) {
  // Only simplify line and path shapes
  if (shape.shapeType !== 'line' && shape.shapeType !== 'path') {
    return shape;
  }
  
  if (!shape.points || shape.points.length < 2) {
    return shape;
  }
  
  // Use shape's closed property if not overridden
  const isClosed = closed !== null ? closed : (shape.closed || false);
  
  // Simplify the points
  const simplifiedPoints = simplifyPathPoints(
    shape.points,
    tolerance,
    isClosed,
    smoothPasses
  );
  
  // Create a new shape with simplified points
  const newShape = { ...shape };
  newShape.points = simplifiedPoints;
  
  return newShape;
}
