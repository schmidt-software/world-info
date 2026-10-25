// Camera altitude helpers, free of browser and Three.js dependencies so that
// they can be tested with node --test. Altitudes are measured in globe radii
// above the surface (Earth radius 6,371 km, so 0.0002 is about 1.3 km).

export const MIN_ALTITUDE = 0.0002;
export const MAX_ALTITUDE = 5;
export const DEFAULT_ALTITUDE = 2.2;

// One wheel notch (deltaY 100) changes the altitude by about 16 percent.
const WHEEL_FACTOR = 0.0015;

export function clampAltitude(altitude) {
  return Math.min(MAX_ALTITUDE, Math.max(MIN_ALTITUDE, altitude));
}

// Exponential, so every notch feels the same at every altitude.
export function altitudeAfterWheel(altitude, deltaY) {
  return clampAltitude(altitude * Math.exp(deltaY * WHEEL_FACTOR));
}

// A pinch scales the altitude it started at by the change in finger
// distance: fingers twice as far apart halve the altitude.
export function altitudeAfterPinch(startAltitude, startDistance, distance) {
  return clampAltitude(startAltitude * (startDistance / distance));
}

// A drag across the full screen height should move the map by roughly the
// visible distance: OrbitControls rotates 2 * PI * rotateSpeed per screen
// height, and a 45 degree camera sees about 0.83 * altitude radians.
export function rotateSpeedFor(altitude) {
  return Math.min(1, Math.max(0.00003, altitude * 0.3));
}

// Approximate slippy map zoom level for an altitude: the level at which
// about three to four 256-pixel tiles fill the screen height. Used to pick
// the map view in the detail level work (#30).
export function zoomLevelFor(altitude) {
  return Math.min(19, Math.max(0, Math.log2(26.5 / altitude)));
}
