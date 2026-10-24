// Parser tests using payloads shaped like the provider documentation.
// Run all tests with: node --test 'scripts/test/*.test.mjs'

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEvents } from '../sources/ticketmaster.mjs';

test('Ticketmaster: reads string coordinates of the first venue', () => {
  const events = parseEvents([
    {
      id: 'e1', name: 'Concert', url: 'https://example.com/e1',
      dates: { start: { dateTime: '2026-10-24T18:00:00Z' } },
      classifications: [{ segment: { name: 'Music' } }],
      _embedded: { venues: [{ name: 'Hall', city: { name: 'Vienna' }, location: { latitude: '48.2', longitude: '16.37' } }] },
    },
    { id: 'e2', name: 'No venue', dates: { start: { dateTime: '2026-10-24T18:00:00Z' } } },
  ]);
  assert.equal(events.length, 1);
  assert.deepEqual([events[0].lat, events[0].lon], [48.2, 16.37]);
  assert.equal(events[0].detail, 'Hall, Vienna, Music');
});
