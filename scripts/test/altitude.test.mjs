// Tests for the camera altitude helpers of the page. Run all tests with:
// node --test 'scripts/test/*.test.mjs'

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  altitudeAfterPinch, altitudeAfterWheel, clampAltitude, DEFAULT_ALTITUDE, MAX_ALTITUDE, MIN_ALTITUDE, rotateSpeedFor, zoomLevelFor,
} from '../../site/src/altitude.js';

test('altitude: zoom range ends about 1.3 km above the surface', () => {
  assert.equal(clampAltitude(0), MIN_ALTITUDE);
  assert.equal(clampAltitude(100), MAX_ALTITUDE);
  assert.ok(MIN_ALTITUDE * 6371 > 1 && MIN_ALTITUDE * 6371 < 1.5);
});

test('altitude: wheel steps are relative, so they feel the same at every height', () => {
  const high = altitudeAfterWheel(2, -100) / 2;
  const low = altitudeAfterWheel(0.001, -100) / 0.001;
  assert.ok(Math.abs(high - low) < 1e-12);
  assert.ok(high < 1, 'scrolling up zooms in');
  assert.equal(altitudeAfterWheel(MIN_ALTITUDE, -100), MIN_ALTITUDE);
});

test('altitude: rotation slows down towards the ground', () => {
  assert.equal(rotateSpeedFor(DEFAULT_ALTITUDE), 0.66);
  assert.ok(rotateSpeedFor(0.001) < rotateSpeedFor(0.1));
  assert.ok(rotateSpeedFor(MIN_ALTITUDE) > 0);
  assert.equal(rotateSpeedFor(MAX_ALTITUDE), 1);
});

test('altitude: maps to slippy map zoom levels from the globe to streets', () => {
  assert.ok(zoomLevelFor(DEFAULT_ALTITUDE) > 3 && zoomLevelFor(DEFAULT_ALTITUDE) < 4);
  assert.ok(zoomLevelFor(MIN_ALTITUDE) > 16);
  assert.equal(zoomLevelFor(1e-9), 19);
  assert.equal(zoomLevelFor(1000), 0);
});

test('altitude: pinching scales the altitude with the finger distance', () => {
  assert.equal(altitudeAfterPinch(2, 100, 200), 1);
  assert.equal(altitudeAfterPinch(1, 100, 50), 2);
  // Only the start of the pinch counts, so a pinch back restores the altitude.
  assert.equal(altitudeAfterPinch(1.5, 80, 80), 1.5);
  assert.equal(altitudeAfterPinch(MIN_ALTITUDE, 100, 400), MIN_ALTITUDE);
  assert.equal(altitudeAfterPinch(MAX_ALTITUDE, 100, 20), MAX_ALTITUDE);
});
