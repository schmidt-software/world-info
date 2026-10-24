// Weather warnings from all European national weather services via the
// MeteoAlarm feeds (CC BY 4.0). Keyless, but the feeds send no CORS headers,
// so they are fetched here instead of in the browser.
//
// Warning areas come as region codes (EMMA_ID or NUTS) or as CAP polygons and
// are resolved to one point per area. Several warnings for the same area are
// merged into one marker that shows the highest awareness level.

import { readFile } from 'node:fs/promises';
import { average, fetchJson } from '../lib.mjs';

// Country feeds on feeds.meteoalarm.org and the country codes MeteoAlarm uses
// for its own pages (ISO codes, except UK for the United Kingdom). Germany is
// left out because the DWD layer shows the same warnings in more detail.
export const COUNTRIES = {
  andorra: 'AD', austria: 'AT', belgium: 'BE', 'bosnia-herzegovina': 'BA', bulgaria: 'BG',
  croatia: 'HR', cyprus: 'CY', czechia: 'CZ', denmark: 'DK', estonia: 'EE', finland: 'FI',
  france: 'FR', greece: 'GR', hungary: 'HU', iceland: 'IS', ireland: 'IE', israel: 'IL',
  italy: 'IT', latvia: 'LV', lithuania: 'LT', luxembourg: 'LU', malta: 'MT', moldova: 'MD',
  montenegro: 'ME', netherlands: 'NL', norway: 'NO', poland: 'PL', portugal: 'PT',
  'republic-of-north-macedonia': 'MK', romania: 'RO', serbia: 'RS', slovakia: 'SK',
  slovenia: 'SI', spain: 'ES', sweden: 'SE', switzerland: 'CH', ukraine: 'UA',
  'united-kingdom': 'UK',
};

// The warnings' own web links point to a national page that is the same for
// every region of a country. MeteoAlarm's live page of the country shows all
// active warnings on a map, and each region there opens its warning. A page
// per single warning would need MeteoAlarm-internal area ids that the feeds
// do not contain.
export function countryPage(countryCode) {
  return `https://meteoalarm.org/en/live/region/${countryCode}`;
}

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
    const slugs = Object.keys(COUNTRIES);
    const results = await Promise.allSettled(slugs.map((slug) =>
      fetchJson(`https://feeds.meteoalarm.org/api/v1/warnings/feeds-${slug}`)));
    const failed = slugs.filter((_, index) => results[index].status === 'rejected');
    if (failed.length === slugs.length) throw results[0].reason;
    if (failed.length) console.warn(`meteoalarm: feeds failed: ${failed.join(', ')}`);

    const now = Date.now();
    const areas = new Map();
    let unmapped = 0;

    for (const [index, result] of results.entries()) {
      if (result.status !== 'fulfilled') continue;
      const country = COUNTRIES[slugs[index]];
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
          const entry = areas.get(key) ?? { ...position, name: area.areaDesc, country, warnings: [] };
          entry.warnings.push({ level, type, start, expires: Date.parse(info.expires) });
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
        url: countryPage(area.country),
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
