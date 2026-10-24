// Parser tests using payloads shaped like the provider documentation.
// Run all tests with: node --test 'scripts/test/*.test.mjs'

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectShips } from '../sources/aisstream.mjs';

test('aisstream: keeps the latest report per ship and skips unavailable positions', () => {
  const report = (lat, lon, time) => ({
    MessageType: 'PositionReport',
    MetaData: { MMSI: 211000001, ShipName: 'EXAMPLE  ', latitude: lat, longitude: lon, time_utc: time },
    Message: { PositionReport: { Sog: 12.4 } },
  });
  const ships = collectShips([
    report(54, 10, '2026-10-24 00:00:00.0 +0000 UTC'),
    report(54.1, 10.1, '2026-10-24 00:01:00.0 +0000 UTC'),
    report(91, 181, '2026-10-24 00:02:00.0 +0000 UTC'),
  ]);
  assert.equal(ships.length, 1);
  assert.equal(ships[0].lat, 54.1);
  assert.equal(ships[0].title, 'EXAMPLE');
  assert.equal(ships[0].url, 'https://www.myshiptracking.com/vessels/mmsi-211000001');
  assert.equal(ships[0].time.toISOString(), '2026-10-24T00:01:00.000Z');
});

test('aisstream: accepts capitalized MetaData coordinates', () => {
  const ships = collectShips([{
    MessageType: 'PositionReport',
    MetaData: { MMSI: 211000002, ShipName: 'B', Latitude: 50, Longitude: 1 },
    Message: { PositionReport: {} },
  }]);
  assert.equal(ships[0].lon, 1);
});
