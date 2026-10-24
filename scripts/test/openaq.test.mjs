// Parser tests using payloads shaped like the provider documentation.
// Run all tests with: node --test 'scripts/test/*.test.mjs'

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseReadings } from '../sources/openaq.mjs';

test('OpenAQ: keeps recent European readings of poor quality or worse', () => {
  const now = Date.parse('2026-10-24T12:00:00Z');
  const reading = (value, lat, lon, utc = '2026-10-24T11:00:00Z') => ({
    value, coordinates: { latitude: lat, longitude: lon }, datetime: { utc }, sensorsId: value, locationsId: 7,
  });
  const events = parseReadings([
    reading(60, 50, 19),
    reading(10, 50, 19),
    reading(80, 28.6, 77.2),
    reading(90, 50, 19, '2026-10-23T00:00:00Z'),
  ], now);
  assert.equal(events.length, 1);
  assert.equal(events[0].detail, 'Very poor air quality');
});
