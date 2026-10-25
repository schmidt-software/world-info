// Tests for the map views of the page. Run all tests with:
// node --test 'scripts/test/*.test.mjs'

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isView, PROVIDERS, providerMinZooms, satelliteDate } from '../../site/src/mapviews.js';

test('map views: auto shows satellite from level 4 and streets from level 9', () => {
  assert.deepEqual(providerMinZooms('auto', 3), { satellite: 4, today: null, streets: 9 });
  assert.deepEqual(providerMinZooms('auto', 9.9), { satellite: 4, today: null, streets: 9 });
});

test('map views: auto drops satellite once streets cover the view', () => {
  assert.deepEqual(providerMinZooms('auto', 12), { satellite: null, today: null, streets: 9 });
});

test('map views: chosen views show their provider at every zoom level', () => {
  assert.deepEqual(providerMinZooms('streets', 1), { satellite: null, today: null, streets: 0 });
  assert.deepEqual(providerMinZooms('today', 15), { satellite: null, today: 0, streets: null });
  assert.deepEqual(providerMinZooms('map', 15), { satellite: null, today: null, streets: null });
});

test('map views: satellite today uses the previous day until 20:00 UTC', () => {
  assert.equal(satelliteDate(Date.parse('2026-10-25T19:59:00Z')), '2026-10-24');
  assert.equal(satelliteDate(Date.parse('2026-10-25T20:00:00Z')), '2026-10-25');
  assert.equal(satelliteDate(Date.parse('2026-01-01T03:00:00Z')), '2025-12-31');
});

test('map views: tile URLs follow each provider scheme', () => {
  assert.equal(PROVIDERS.streets.url(17, 10, 5), 'https://tile.openstreetmap.org/5/17/10.png');
  assert.match(PROVIDERS.satellite.url(17, 10, 5), /GoogleMapsCompatible_Level8\/5\/10\/17\.jpeg$/);
  const today = { ...PROVIDERS.today, date: '2026-10-24' };
  assert.match(today.url(17, 10, 5), /\/default\/2026-10-24\/GoogleMapsCompatible_Level9\/5\/10\/17\.jpg$/);
});

test('map views: only known views are accepted', () => {
  assert.equal(isView('streets'), true);
  assert.equal(isView('terrain'), false);
});
