// Parser tests using payloads shaped like the provider documentation.
// Run all tests with: node --test 'scripts/test/*.test.mjs'

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseStates } from '../sources/opensky.mjs';

test('OpenSky: keeps airborne aircraft and maps state vector fields', () => {
  const airborne = ['3c6444', 'DLH9LF  ', 'Germany', 1792800000, 1792800001, 11.5, 48.3, 10000, false, 230, 90, 0, null, 10150, '1000', false, 0];
  const grounded = ['3c6445', 'DLH1   ', 'Germany', 1792800000, 1792800001, 11.8, 48.35, null, true, 0, 0, 0, null, null, null, false, 0];
  const events = parseStates([airborne, grounded]);
  assert.equal(events.length, 1);
  assert.deepEqual(
    { id: events[0].id, lat: events[0].lat, lon: events[0].lon, title: events[0].title },
    { id: '3c6444', lat: 48.3, lon: 11.5, title: 'DLH9LF' },
  );
  assert.match(events[0].detail, /10,150 m, 828 km\/h/);
});
