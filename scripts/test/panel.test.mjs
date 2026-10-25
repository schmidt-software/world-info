// Tests for the collapsible panel. Run all tests with:
// node --test 'scripts/test/*.test.mjs'

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialCollapsed } from '../../site/src/panel.js';

test('panel: narrow screens start collapsed, wide screens expanded', () => {
  assert.equal(initialCollapsed(null, true), true);
  assert.equal(initialCollapsed(null, false), false);
});

test('panel: a remembered choice wins over the screen width', () => {
  assert.equal(initialCollapsed('false', true), false);
  assert.equal(initialCollapsed('true', false), true);
  assert.equal(initialCollapsed('garbage', true), true);
});
