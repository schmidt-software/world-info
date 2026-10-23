import * as THREE from 'three';

export const EARTH_RADIUS_KM = 6371;

// Converts geographic coordinates to a point on a sphere centred at the origin:
// north pole on +Y, (0°, 0°) on +X, 90° east on -Z.
export function latLonToVector3(lat, lon, radius = 1) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

// Approximate subsolar point (NOAA general solar position formulas). The error
// is well below one degree, which is enough for day/night shading.
export function subsolarPoint(date) {
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1);
  const dayOfYear = (date.getTime() - startOfYear) / 86400000;
  const gamma = (2 * Math.PI / 365) * dayOfYear;

  const declination = 0.006918
    - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);

  const equationOfTimeMinutes = 229.18 * (0.000075
    + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));

  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const lon = -(utcMinutes + equationOfTimeMinutes - 720) / 4;

  return {
    lat: THREE.MathUtils.radToDeg(declination),
    lon: ((lon + 540) % 360) - 180,
  };
}
