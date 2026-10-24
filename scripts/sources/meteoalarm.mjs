// Weather warnings from all European national weather services via the
// MeteoAlarm feeds (CC BY 4.0). Keyless, but the feeds send no CORS headers,
// so they are fetched here instead of in the browser.
//
// Warning areas come as region codes (EMMA_ID or NUTS) or as CAP polygons and
// are resolved to one point per area. Several warnings for the same area are
// merged into one marker that shows the highest awareness level.

import { readFile } from 'node:fs/promises';
import { average, fetchJson } from '../lib.mjs';

// Germany is left out because the DWD layer shows the same warnings in more
// detail. The other slugs mirror the country feeds on feeds.meteoalarm.org.
const COUNTRIES = [
  'andorra', 'austria', 'belgium', 'bosnia-herzegovina', 'bulgaria', 'croatia', 'cyprus',
  'czechia', 'denmark', 'estonia', 'finland', 'france', 'greece', 'hungary', 'iceland',
  'ireland', 'israel', 'italy', 'latvia', 'lithuania', 'luxembourg', 'malta', 'moldova',
  'montenegro', 'netherlands', 'norway', 'poland', 'portugal', 'republic-of-north-macedonia',
  'romania', 'serbia', 'slovakia', 'slovenia', 'spain', 'sweden', 'switzerland', 'ukraine',
  'united-kingdom',
];

const LEVELS = {
  2: { name: 'Yellow', color: 0xfacc15, size: 0.6 },
  3: { name: 'Orange', color: 0xf97316, size: 1 },
  4: { name: 'Red', color: 0xef4444, size: 1.5 },
};

const centroids = JSON.parse(await readFile(new URL('../data/region-centroids.json', import.meta.url), 'utf8'));

export default {
  id: 'meteoalarm',
  label: 'Weather warnings Europe (MeteoAlarm)',
  color: 0xf97316,
  pulse: false,
  attribution: 'MeteoAlarm (EUMETNET)',
  async fetch() {
    const results = await Promise.allSettled(COUNTRIES.map((country) =>
      fetchJson(`https://feeds.meteoalarm.org/api/v1/warnings/feeds-${country}`)));
    const failed = COUNTRIES.filter((_, index) => results[index].status === 'rejected');
    if (failed.length === COUNTRIES.length) throw results[0].reason;
    if (failed.length) console.warn(`meteoalarm: feeds failed: ${failed.join(', ')}`);

    const now = Date.now();
    const areas = new Map();
    let unmapped = 0;

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      for (const { alert } of result.value.warnings) {
        const info = alert.info.find((entry) => entry.language?.startsWith('en')) ?? alert.info[0];
        const start = Date.parse(info.onset ?? info.effective);
        if (!(start <= now && now < Date.parse(info.expires))) continue;

        const level = Number.parseInt(parameter(info, 'awareness_level'), 10);
        if (!LEVELS[level]) continue;
        const type = parameter(info, 'awareness_type')?.split(';')[1]?.trim() ?? info.event;

        for (const area of info.area) {
          const position = areaPosition(area);
          if (!position) {
            unmapped++;
            continue;
          }
          const key = `${position.lat.toFixed(3)},${position.lon.toFixed(3)}`;
          const entry = areas.get(key) ?? { ...position, name: area.areaDesc, warnings: [] };
          entry.warnings.push({ level, type, start, expires: Date.parse(info.expires), web: info.web });
          areas.set(key, entry);
        }
      }
    }
    if (unmapped) console.warn(`meteoalarm: ${unmapped} active warning areas without known location`);

    return [...areas.entries()].map(([key, area]) => {
      const warnings = area.warnings.sort((a, b) => b.level - a.level);
      const top = warnings[0];
      const types = [...new Set(warnings.map((warning) => `${LEVELS[warning.level].name} ${warning.type}`))];
      return {
        id: key,
        lat: area.lat,
        lon: area.lon,
        title: area.name,
        detail: `${types.join(', ')}; until ${formatTime(top.expires)}`,
        time: new Date(Math.min(...warnings.map((warning) => warning.start))),
        url: top.web || 'https://meteoalarm.org/',
        size: LEVELS[top.level].size,
        color: LEVELS[top.level].color,
      };
    });
  },
};

function parameter(info, name) {
  return info.parameter?.find((entry) => entry.valueName === name)?.value;
}

function areaPosition(area) {
  for (const { valueName, value } of area.geocode ?? []) {
    const namespace = valueName === 'EMMA_ID' ? 'EMMA_ID' : valueName.startsWith('NUTS') ? 'NUTS' : null;
    const centroid = namespace && centroids[namespace][value];
    if (centroid) return { lat: centroid.lat, lon: centroid.lon };
  }
  // CAP polygons are strings of "lat,lon" pairs separated by spaces.
  const polygon = [area.polygon ?? []].flat()[0];
  if (!polygon) return null;
  const points = polygon.trim().split(/\s+/).map((pair) => {
    const [lat, lon] = pair.split(',').map(Number);
    return { lat, lon };
  });
  return average(points);
}

function formatTime(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}
