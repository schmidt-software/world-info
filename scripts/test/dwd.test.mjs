// Tests for the DWD warning helpers of the page, with field values taken from
// the dwd:Warnungen_Landkreise layer.
// Run all tests with: node --test 'scripts/test/*.test.mjs'

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { districtEvents, warningReportUrl } from '../../site/src/dwd.js';

const REPORT_BASE = 'https://www.dwd.de/DE/wetter/warnungen_aktuell/warnlagebericht/';

test('DWD: links each state to its regional warning report', () => {
  assert.equal(warningReportUrl('HH', 102000000), `${REPORT_BASE}schleswig_holstein_hamburg/warnlage_shh_node.html`);
  assert.equal(warningReportUrl('SL', 110041000), `${REPORT_BASE}rheinland-pfalz_saarland/warnlage_rps_node.html`);
});

test('DWD: splits Bavaria into the northern and southern report by government region', () => {
  // Kreis Rhön-Grabfeld (Lower Franconia) and Kreis und Stadt Fürth (Middle Franconia)
  assert.equal(warningReportUrl('BY', 109673000), `${REPORT_BASE}nordbayern/warnlage_nordbay_node.html`);
  assert.equal(warningReportUrl('BY', 909573999), `${REPORT_BASE}nordbayern/warnlage_nordbay_node.html`);
  // Munich (Upper Bavaria) and Augsburg (Swabia)
  assert.equal(warningReportUrl('BY', 109162000), `${REPORT_BASE}suedbayern/warnlage_suedbay_node.html`);
  assert.equal(warningReportUrl('BY', 109761000), `${REPORT_BASE}suedbayern/warnlage_suedbay_node.html`);
});

test('DWD: falls back to the overview report for unknown states', () => {
  assert.equal(warningReportUrl('XX', 100000000), `${REPORT_BASE}warnlagebericht_node.html`);
});

test('DWD: merges several warnings of one district into one event', () => {
  const feature = (event, severity, onset, expires) => ({
    bbox: [11.4, 50.4, 12.0, 50.8],
    properties: {
      EVENT: event, SEVERITY: severity, ONSET: onset, EXPIRES: expires,
      AREADESC: 'Saale-Orla-Kreis', GC_STATE: 'TH', GC_WARNCELLID: 116075000,
    },
  });
  const events = districtEvents([
    feature('WINDBÖEN', 'Minor', '2026-10-24T10:00:00Z', '2026-10-24T18:00:00Z'),
    feature('SCHWERE STURMBÖEN', 'Severe', '2026-10-24T12:00:00Z', '2026-10-24T20:00:00Z'),
  ]);
  assert.equal(events.length, 1);
  const [event] = events;
  assert.equal(event.title, 'Saale-Orla-Kreis');
  assert.match(event.detail, /^Schwere Sturmböen, Windböen; Severe, until /);
  assert.equal(event.time.toISOString(), '2026-10-24T10:00:00.000Z');
  assert.equal(event.size, 1.4);
  assert.equal(event.url, `${REPORT_BASE}thueringen/warnlage_thu_node.html`);
  assert.ok(Math.abs(event.lat - 50.6) < 1e-9 && Math.abs(event.lon - 11.7) < 1e-9, 'marker at the bbox centre');
});
