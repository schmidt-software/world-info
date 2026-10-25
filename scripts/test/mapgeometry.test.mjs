// Tests for the map geometry helpers of the page. Run all tests with:
// node --test 'scripts/test/*.test.mjs'

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { closePolarRing, labelAnchor, ringAreaAndCentroid, unwrapRing } from '../../site/src/mapgeometry.js';

test('map geometry: unwraps rings that cross the antimeridian', () => {
  // A small island around 180 degrees (like parts of Fiji).
  const ring = [[179, -17], [-179, -17], [-179, -16], [179, -16], [179, -17]];
  assert.deepEqual(unwrapRing(ring), [[179, -17], [181, -17], [181, -16], [179, -16], [179, -17]]);
});

test('map geometry: closes a ring around the south pole along the pole', () => {
  const ring = unwrapRing([[-180, -70], [-90, -68], [0, -70], [90, -66], [180, -70]]);
  const closed = closePolarRing(ring);
  assert.deepEqual(closed.slice(-2), [[180, -90], [-180, -90]]);
  // An ordinary ring stays as it is.
  const square = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  assert.equal(closePolarRing(square), square);
});

test('map geometry: area and centroid of a ring', () => {
  const { area, lon, lat } = ringAreaAndCentroid([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]);
  assert.equal(area, 100);
  assert.deepEqual([lon, lat], [5, 5]);
});

test('map geometry: labels sit on the largest polygon of a country', () => {
  const mainland = [[[0, 40], [10, 40], [10, 50], [0, 50], [0, 40]]];
  const island = [[[-60, 10], [-59, 10], [-59, 11], [-60, 11], [-60, 10]]];
  const anchor = labelAnchor({ type: 'MultiPolygon', coordinates: [island, mainland] });
  assert.deepEqual([anchor.lon, anchor.lat], [5, 45]);
  assert.equal(anchor.area, 101);
});
