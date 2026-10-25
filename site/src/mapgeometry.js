// Planar geometry for drawing Natural Earth polygons into an equirectangular
// texture and for placing country labels. Coordinates are [lon, lat] in
// degrees. Kept free of browser and Three.js dependencies so that it can be
// tested with node --test.

// Rings that cross the antimeridian jump from +180 to -180 between two
// points. Unwrapping keeps longitudes continuous (they may then leave the
// -180..180 range), so a ring can be drawn without a stripe across the map.
export function unwrapRing(ring) {
  const out = [];
  let offset = 0;
  for (let i = 0; i < ring.length; i++) {
    const [lon, lat] = ring[i];
    if (i > 0) {
      const delta = lon - ring[i - 1][0];
      if (delta > 180) offset -= 360;
      else if (delta < -180) offset += 360;
    }
    out.push([lon + offset, lat]);
  }
  return out;
}

// A ring around a pole (Antarctica) does not close in longitude after
// unwrapping: it ends 360 degrees from where it started. It is closed along
// the pole so that filling covers the polar area.
export function closePolarRing(unwrapped) {
  const span = unwrapped.at(-1)[0] - unwrapped[0][0];
  if (Math.abs(span) < 180) return unwrapped;
  const meanLat = unwrapped.reduce((sum, [, lat]) => sum + lat, 0) / unwrapped.length;
  const pole = meanLat < 0 ? -90 : 90;
  const [lastLon] = unwrapped.at(-1);
  const [firstLon] = unwrapped[0];
  return [...unwrapped, [lastLon, pole], [firstLon, pole]];
}

// Signed area (shoelace) of a ring in square degrees and its area-weighted
// centroid. Good enough to rank countries by size and to place a label;
// distortion towards the poles does not matter for that.
export function ringAreaAndCentroid(ring) {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-12) return { area: 0, lon: ring[0][0], lat: ring[0][1] };
  return { area: Math.abs(area), lon: cx / (6 * area), lat: cy / (6 * area) };
}

// Label anchor of a (Multi)Polygon geometry: the centroid of its largest
// polygon, so France is labelled in Europe and not between its overseas
// territories. Also returns the total area for ranking.
export function labelAnchor(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let total = 0;
  let best = null;
  for (const polygon of polygons) {
    const outer = ringAreaAndCentroid(unwrapRing(polygon[0]));
    total += outer.area;
    if (!best || outer.area > best.area) best = outer;
  }
  if (!best) return null;
  const lon = ((best.lon + 540) % 360) - 180;
  return { lon, lat: best.lat, area: total };
}
