// Tests for the shared date formatting of the page. Run all tests with:
// node --test 'scripts/test/*.test.mjs'

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatAge } from '../../site/src/format.js';

const now = Date.parse('2026-10-25T12:00:00Z');
const at = (minutesAgo) => new Date(now - minutesAgo * 60000);

test('formatAge: past events in minutes, hours and days', () => {
  assert.equal(formatAge(at(12), now), '12 min ago');
  assert.equal(formatAge(at(180), now), '3 h ago');
  assert.equal(formatAge(at(3 * 24 * 60), now), '3 days ago');
});

test('formatAge: upcoming events', () => {
  assert.equal(formatAge(at(-30), now), 'in 30 min');
  assert.equal(formatAge(at(-120), now), 'in 2 h');
});
