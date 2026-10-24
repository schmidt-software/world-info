// Parser tests using payloads shaped like the provider documentation.
// Run all tests with: node --test 'scripts/test/*.test.mjs'

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { latestPoint } from '../sources/entsoe.mjs';

test('ENTSO-E: returns the last point across periods', () => {
  const xml = `<GL_MarketDocument><TimeSeries>
    <Period><timeInterval><start>2026-10-24T08:00Z</start><end>2026-10-24T09:00Z</end></timeInterval>
      <resolution>PT15M</resolution>
      <Point><position>1</position><quantity>6100</quantity></Point>
      <Point><position>4</position><quantity>6400</quantity></Point>
    </Period></TimeSeries><TimeSeries>
    <Period><timeInterval><start>2026-10-24T09:00Z</start><end>2026-10-24T09:30Z</end></timeInterval>
      <resolution>PT15M</resolution>
      <Point><position>2</position><quantity>6550.5</quantity></Point>
    </Period></TimeSeries></GL_MarketDocument>`;
  const latest = latestPoint(xml);
  assert.equal(latest.megawatts, 6550.5);
  assert.equal(latest.time.toISOString(), '2026-10-24T09:15:00.000Z');
});
