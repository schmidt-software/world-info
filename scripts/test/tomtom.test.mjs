// Parser tests using payloads shaped like the provider documentation.
// Run all tests with: node --test 'scripts/test/*.test.mjs'

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseIncidents } from '../sources/tomtom.mjs';

test('TomTom: shows moderate and major delays, placed at the line start', () => {
  const incident = (id, magnitudeOfDelay) => ({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[16.3, 48.2], [16.4, 48.25]] },
    properties: { id, iconCategory: 6, magnitudeOfDelay, events: [{ description: 'Stationary traffic' }], from: 'A', to: 'B', roadNumbers: ['A23'] },
  });
  const events = parseIncidents([incident('a', 3), incident('b', 1)], 'Vienna');
  assert.equal(events.length, 1);
  assert.deepEqual([events[0].lat, events[0].lon], [48.2, 16.3]);
  assert.equal(events[0].title, 'Jam, Vienna');
  assert.equal(events[0].detail, 'Stationary traffic; A23 A to B');
});
