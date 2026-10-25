// Tests for the screen-space marker helpers of the page. Run all tests with:
// node --test 'scripts/test/*.test.mjs'

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clickAction, clusterByGrid, isOccluded, pickNearest } from '../../site/src/screen.js';

const camera = { x: 0, y: 0, z: 3 };

test('screen: the globe hides points on its far side only', () => {
  assert.equal(isOccluded(camera, { x: 0, y: 0, z: 1 }), false, 'facing the camera');
  assert.equal(isOccluded(camera, { x: 0, y: 0, z: -1 }), true, 'far side');
  assert.equal(isOccluded(camera, { x: 1, y: 0, z: 0 }), true, 'just beyond the horizon');
  // The horizon seen from z = 3 lies at z = 1/3.
  assert.equal(isOccluded(camera, { x: Math.sqrt(1 - 0.36 ** 2), y: 0, z: 0.36 }), false, 'just before the horizon');
  assert.equal(isOccluded(camera, { x: 0.6, y: 0.48, z: 0.64 * 0.999999 }), false, 'rounding error below the surface');
});

test('screen: objects above the ground are seen beyond the horizon, but not around the globe', () => {
  // The ISS orbits about 0.066 radii up; just beyond the horizon of the
  // surface it is still in sight, further around the globe it is hidden.
  assert.equal(isOccluded(camera, { x: 1.066, y: 0, z: 0.1 }), false);
  assert.equal(isOccluded(camera, { x: 1.066, y: 0, z: -0.05 }), true);
  assert.equal(isOccluded(camera, { x: 0, y: 0, z: -1.066 }), true);
});

test('screen: groups points per grid cell', () => {
  const points = [{ x: 5, y: 5, index: 0 }, { x: 20, y: 10, index: 1 }, { x: 40, y: 5, index: 2 }, { x: 41, y: 6, index: 3 }];
  assert.deepEqual(clusterByGrid(points, 28), [[0, 1], [2, 3]]);
});

test('screen: picks the closest marker within reach', () => {
  const candidates = [{ x: 100, y: 100, radius: 5, id: 'a' }, { x: 106, y: 100, radius: 5, id: 'b' }];
  assert.equal(pickNearest(candidates, 104, 100).id, 'b');
  assert.equal(pickNearest(candidates, 99, 101).id, 'a');
  assert.equal(pickNearest(candidates, 130, 100), null);
});

test('screen: a wider tolerance reaches markers next to a fingertip', () => {
  const candidates = [{ x: 100, y: 100, radius: 5, id: 'a' }];
  assert.equal(pickNearest(candidates, 112, 106), null);
  assert.equal(pickNearest(candidates, 112, 106, 12).id, 'a');
});

test('screen: a click opens the source, a tap shows the tooltip first', () => {
  const event = { url: 'https://example.org/' };
  const marker = { event };
  assert.equal(clickAction(marker, false), 'open');
  assert.equal(clickAction(marker, true), 'tooltip');
  assert.equal(clickAction(marker, true, event), 'open');
  assert.equal(clickAction(marker, true, { url: 'https://example.org/other' }), 'tooltip');
});

test('screen: clusters zoom in, empty taps close the tooltip', () => {
  assert.equal(clickAction({ cluster: true, event: {} }, true), 'zoom');
  assert.equal(clickAction({ cluster: true, event: {} }, false), 'zoom');
  assert.equal(clickAction(null, true), 'close');
  assert.equal(clickAction(null, false), 'none');
  const event = {};
  assert.equal(clickAction({ event }, true, event), 'close');
  assert.equal(clickAction({ event }, false), 'none');
});
