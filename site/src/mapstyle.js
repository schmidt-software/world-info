// Map-style surface of the overview globe: land and water drawn once from
// Natural Earth into an equirectangular canvas, used as the globe texture.

import { closePolarRing, unwrapRing } from './mapgeometry.js';

export const MAP_COLORS = {
  ocean: '#0d2a4a',
  land: '#34473c',
};

// 4096 x 2048 keeps coastlines crisp at the overview and fits the texture
// size limit of practically every device.
const WIDTH = 4096;
const HEIGHT = 2048;

export function drawMapTexture(landGeometry) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  context.fillStyle = MAP_COLORS.ocean;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  context.fillStyle = MAP_COLORS.land;
  const polygons = landGeometry.type === 'Polygon' ? [landGeometry.coordinates] : landGeometry.coordinates;
  for (const polygon of polygons) {
    // Unwrapped rings may extend past the map edge; drawing each polygon
    // also shifted by one map width fills the part that wraps around.
    for (const shift of [-360, 0, 360]) {
      context.beginPath();
      for (const ring of polygon) {
        const points = closePolarRing(unwrapRing(ring));
        points.forEach(([lon, lat], index) => {
          const x = ((lon + shift + 180) / 360) * WIDTH;
          const y = ((90 - lat) / 180) * HEIGHT;
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.closePath();
      }
      // evenodd keeps lakes, which are inner rings, as water.
      context.fill('evenodd');
    }
  }
  return canvas;
}
