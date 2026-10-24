// Parser tests using payloads shaped like the provider documentation.
// Run all tests with: node --test 'scripts/test/*.test.mjs'

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseWebcams } from '../sources/windy-webcams.mjs';

test('Windy: keeps active webcams with a location', () => {
  const events = parseWebcams([
    { webcamId: 1, title: 'Old Town', status: 'active', location: { latitude: 47.8, longitude: 13.0, city: 'Salzburg', country: 'Austria' }, urls: { detail: 'https://example.com/1' } },
    { webcamId: 2, title: 'Offline', status: 'inactive', location: { latitude: 1, longitude: 1 } },
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0].detail, 'Salzburg, Austria');
});
