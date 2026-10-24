// Tests for the event list of the page. Run all tests with:
// node --test 'scripts/test/*.test.mjs'

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectRows, filterRows, linkLabel } from '../../site/src/eventlist.js';

const event = (title, detail, minutesAgo) => ({ title, detail, time: new Date(Date.now() - minutesAgo * 60000) });
const layers = [
  { source: { id: 'emsc', label: 'Earthquakes Europe' }, events: [event('M3.5 Dodecanese Islands, Greece', 'Depth 10 km', 30), event('M2.3 Sicily, Italy', 'Depth 8 km', 5)] },
  { source: { id: 'dwd', label: 'Weather warnings Germany' }, events: [event('Kreis Siegen-Wittgenstein', 'Sturmböen; Moderate', 15)] },
  { source: { id: 'opensky', label: 'Aircraft', unavailable: 'Not configured' }, events: [] },
];

test('event list: collects events of all available layers, newest first', () => {
  const rows = collectRows(layers);
  assert.deepEqual(rows.map((row) => row.event.title), [
    'M2.3 Sicily, Italy', 'Kreis Siegen-Wittgenstein', 'M3.5 Dodecanese Islands, Greece',
  ]);
  assert.ok(rows.every((row) => row.layer.id !== 'opensky'));
});

test('event list: search matches all words in title, detail or layer name', () => {
  const rows = collectRows(layers);
  assert.deepEqual(filterRows(rows, { query: 'italy depth' }).map((row) => row.event.title), ['M2.3 Sicily, Italy']);
  assert.deepEqual(filterRows(rows, { query: 'STURM' }).map((row) => row.layer.id), ['dwd']);
  assert.equal(filterRows(rows, { query: 'germany' }).length, 1, 'matches the layer name');
  assert.equal(filterRows(rows, { query: '' }).length, 3);
});

test('event list: filters by layer', () => {
  const rows = collectRows(layers);
  assert.deepEqual(filterRows(rows, { layerId: 'emsc' }).map((row) => row.layer.id), ['emsc', 'emsc']);
  assert.equal(filterRows(rows, { layerId: 'emsc', query: 'greece' }).length, 1);
});

test('event list: link label is the host without www', () => {
  assert.equal(linkLabel('https://www.dwd.de/DE/wetter/warnungen_aktuell/x.html'), 'dwd.de');
  assert.equal(linkLabel('https://worldview.earthdata.nasa.gov/?e=EONET_1,2026-10-15'), 'worldview.earthdata.nasa.gov');
  assert.equal(linkLabel('not a url'), 'link');
});
