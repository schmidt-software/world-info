// Tests for the EONET link selection of the page, with sources as EONET lists
// them. Run all tests with: node --test 'scripts/test/*.test.mjs'

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eventUrl } from '../../site/src/eonet.js';

const date = new Date('2026-10-15T00:00:00Z');

test('EONET: data-product sources fall back to NASA Worldview with the event date', () => {
  const sources = [
    { id: 'IRWIN', url: 'https://irwin.doi.gov/observer/incidents/2026-FLFLS-260601105' },
    { id: 'JTWC', url: 'https://www.metoc.navy.mil/jtwc/products/ep2226.tcw' },
    { id: 'NATICE', url: 'https://usicecenter.gov/pub/Iceberg_Tabular.csv' },
  ];
  for (const source of sources) {
    assert.equal(
      eventUrl({ id: 'EONET_6474', sources: [source] }, date),
      'https://worldview.earthdata.nasa.gov/?e=EONET_6474,2026-10-15',
    );
  }
});

test('EONET: prefers an Earth Observatory article when the event has one', () => {
  const article = 'https://earthobservatory.nasa.gov/images/152848/antarctic-ice-shelf-spawns-iceberg-a-83';
  const event = { id: 'EONET_1', sources: [{ id: 'NATICE', url: 'https://usicecenter.gov/pub/x.csv' }, { id: 'EO', url: article }] };
  assert.equal(eventUrl(event, date), article);
});
