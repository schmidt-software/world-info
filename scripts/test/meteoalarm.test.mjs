// Tests for the MeteoAlarm links. Run all tests with:
// node --test 'scripts/test/*.test.mjs'

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COUNTRIES, countryPage } from '../sources/meteoalarm.mjs';

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
