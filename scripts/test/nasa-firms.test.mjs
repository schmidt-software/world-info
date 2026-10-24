// Parser tests using payloads shaped like the provider documentation.
// Run all tests with: node --test 'scripts/test/*.test.mjs'

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeDetections, parseCsv } from '../sources/nasa-firms.mjs';

test('FIRMS: parses CSV and merges detections in the same grid cell', () => {
  const csv = [
    'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight',
    '38.5001,-8.2001,330.1,0.4,0.4,2026-10-24,0142,N,VIIRS,n,2.0NRT,290.1,5.2,N',
    '38.5003,-8.2002,331.1,0.4,0.4,2026-10-24,0236,1,VIIRS,h,2.0NRT,291.1,9.8,N',
    '40.0,-3.0,300.0,0.4,0.4,2026-10-24,0236,1,VIIRS,l,2.0NRT,280.0,1.0,N',
  ].join('\n');
  const events = mergeDetections(parseCsv(csv));
  assert.equal(events.length, 1);
  assert.equal(events[0].detail, 'Fire radiative power 9.8 MW');
  assert.equal(events[0].time.toISOString(), '2026-10-24T02:36:00.000Z');
});
