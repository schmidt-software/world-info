// Tests for the manifest layer list. Run all tests with:
// node --test 'scripts/test/*.test.mjs'

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeLayers } from '../manifest.mjs';

const ids = ['meteoalarm', 'nasa-firms-fires', 'opensky-aircraft'];

test('manifest: a partial run keeps the previous entries of other sources', () => {
  const previous = [
    { id: 'meteoalarm', status: 'ok', count: 100 },
    { id: 'nasa-firms-fires', status: 'not-configured' },
    { id: 'opensky-aircraft', status: 'not-configured' },
  ];
  const layers = mergeLayers(ids, [{ id: 'meteoalarm', status: 'ok', count: 130 }], previous);
  assert.deepEqual(layers.map((layer) => [layer.id, layer.count ?? layer.status]), [
    ['meteoalarm', 130],
    ['nasa-firms-fires', 'not-configured'],
    ['opensky-aircraft', 'not-configured'],
  ]);
});

test('manifest: follows source order and drops entries of removed sources', () => {
  const layers = mergeLayers(
    ids,
    [{ id: 'opensky-aircraft' }, { id: 'meteoalarm' }],
    [{ id: 'retired-source' }, { id: 'nasa-firms-fires' }],
  );
  assert.deepEqual(layers.map((layer) => layer.id), ['meteoalarm', 'nasa-firms-fires', 'opensky-aircraft']);
});

test('manifest: without a previous manifest only fetched sources are listed', () => {
  assert.deepEqual(mergeLayers(ids, [{ id: 'meteoalarm' }]).map((layer) => layer.id), ['meteoalarm']);
});
