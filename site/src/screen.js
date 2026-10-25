// Screen-space helpers for markers: occlusion by the globe, grouping dense
// markers into clusters and picking the marker under the pointer. Points are
// plain {x, y, z} objects; kept free of browser and Three.js dependencies so
// that they can be tested with node --test.

// True when the unit globe hides `point` from `camera`: the line between
// them enters the sphere before reaching the point. Works for points on the
// surface and above it (ISS, aircraft).
export function isOccluded(camera, point) {
  const dx = point.x - camera.x;
  const dy = point.y - camera.y;
  const dz = point.z - camera.z;
  const a = dx * dx + dy * dy + dz * dz;
  const b = 2 * (camera.x * dx + camera.y * dy + camera.z * dz);
  const c = camera.x * camera.x + camera.y * camera.y + camera.z * camera.z - 1;
  const discriminant = b * b - 4 * a * c;
  if (discriminant <= 0) return false;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  // Points on the surface carry rounding errors and may sit a hair inside
  // the sphere; the margin keeps them visible. It is relative to the line
  // length, so it stays well below a metre even when zoomed in close.
  return t > 0 && t < 1 - 1e-4;
}

// Groups screen points that fall into the same grid cell. `points` are
// {x, y, index} in pixels; returns arrays of indices, one per cell, in the
// order cells were first seen.
export function clusterByGrid(points, cellSize) {
  const cells = new Map();
  for (const point of points) {
    const key = `${Math.floor(point.x / cellSize)},${Math.floor(point.y / cellSize)}`;
    const cell = cells.get(key);
    if (cell) cell.push(point.index);
    else cells.set(key, [point.index]);
  }
  return [...cells.values()];
}

// The candidate whose centre is closest to (x, y) and within its radius plus
// a small tolerance, so that tiny markers stay easy to hit. Candidates are
// {x, y, radius, ...}; returns the candidate or null.
export function pickNearest(candidates, x, y, tolerance = 3) {
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = Math.hypot(candidate.x - x, candidate.y - y);
    if (distance <= candidate.radius + tolerance && distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

// What a click or tap on `item` (a marker or cluster, or null) does. On
// touch screens the first tap on a marker shows its tooltip and a second tap
// on the same marker opens the source; `tappedEvent` is the event whose
// tooltip a tap opened last. Returns 'zoom', 'tooltip', 'open', 'close' or
// 'none'.
export function clickAction(item, touch, tappedEvent = null) {
  if (!item) return touch ? 'close' : 'none';
  if (item.cluster) return 'zoom';
  if (touch && item.event !== tappedEvent) return 'tooltip';
  return item.event.url ? 'open' : touch ? 'close' : 'none';
}
