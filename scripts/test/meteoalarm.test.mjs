// Tests for the MeteoAlarm links. Run all tests with:
// node --test 'scripts/test/*.test.mjs'

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { areaPosition, COUNTRIES, countryPage } from '../sources/meteoalarm.mjs';

test('MeteoAlarm: links to the live page of the country', () => {
  assert.equal(countryPage(COUNTRIES.switzerland), 'https://meteoalarm.org/en/live/region/CH');
  assert.equal(countryPage(COUNTRIES['united-kingdom']), 'https://meteoalarm.org/en/live/region/UK');
});

test('MeteoAlarm: every country feed has a distinct two-letter code', () => {
  const codes = Object.values(COUNTRIES);
  assert.equal(codes.length, 38);
  assert.ok(codes.every((code) => /^[A-Z]{2}$/.test(code)));
  assert.equal(new Set(codes).size, codes.length);
});

test('MeteoAlarm: places areas with NUTS codes of older versions', () => {
  // France sends NUTS 2013 codes; Calvados is FR251 there and FRD11 since 2016.
  const position = areaPosition({ geocode: [{ valueName: 'NUTS3', value: 'FR251' }] });
  assert.ok(Math.abs(position.lat - 49.07) < 0.1 && Math.abs(position.lon + 0.36) < 0.1);
});

test('MeteoAlarm: places an area with several Irish FIPS codes at their average', () => {
  const clare = areaPosition({ geocode: [{ valueName: 'FIPS', value: 'EI03' }] });
  const kerry = areaPosition({ geocode: [{ valueName: 'FIPS', value: 'EI11' }] });
  const both = areaPosition({ geocode: [{ valueName: 'FIPS', value: 'EI03' }, { valueName: 'FIPS', value: 'EI11' }] });
  assert.ok(Math.abs(both.lat - (clare.lat + kerry.lat) / 2) < 1e-9);
  assert.ok(Math.abs(both.lon - (clare.lon + kerry.lon) / 2) < 1e-9);
});

test('MeteoAlarm: unknown codes without polygon cannot be placed', () => {
  assert.equal(areaPosition({ geocode: [{ valueName: 'FIPS', value: 'EI32' }] }), null);
  assert.equal(areaPosition({ geocode: [{ valueName: 'UNKNOWN', value: 'X' }] }), null);
});
