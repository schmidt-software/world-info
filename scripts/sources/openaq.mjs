// Fine dust (PM2.5) readings from official measuring stations via OpenAQ v3.
// Only stations in Europe with a current reading at or above the EU air
// quality index level "poor" (25 µg/m³) are shown, so the layer marks places
// with notable air pollution rather than every station.

import { EUROPE_BBOX, fetchJson, isInBbox } from '../lib.mjs';

const PM25_PARAMETER_ID = 2;
const PAGE_SIZE = 1000;
const MAX_PAGES = 25;
const MAX_AGE_MS = 3 * 60 * 60 * 1000;
const MIN_VALUE = 25;

// EU air quality index bands for PM2.5 in µg/m³ (European Environment Agency).
const BANDS = [
  { min: 75, name: 'Extremely poor', color: 0x7e22ce, size: 1.2 },
  { min: 50, name: 'Very poor', color: 0xb91c1c, size: 1 },
  { min: 25, name: 'Poor', color: 0xf97316, size: 0.8 },
];

export default {
  id: 'openaq-pm25',
  label: 'Poor air quality, PM2.5 (OpenAQ)',
  color: 0x84cc16,
  pulse: false,
  attribution: 'OpenAQ',
  requiredEnv: ['OPENAQ_API_KEY'],
  minIntervalMinutes: 30,
  async fetch(env) {
    const readings = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
      const data = await fetchJson(`https://api.openaq.org/v3/parameters/${PM25_PARAMETER_ID}/latest?${params}`, {
        headers: { 'X-API-Key': env.OPENAQ_API_KEY },
      });
      readings.push(...data.results);
      if (data.results.length < PAGE_SIZE) break;
    }
    return parseReadings(readings, Date.now());
  },
};

export function parseReadings(readings, now) {
  return readings.flatMap((reading) => {
    const { latitude: lat, longitude: lon } = reading.coordinates ?? {};
    const time = new Date(reading.datetime?.utc);
    if (lat == null || lon == null || !isInBbox(lat, lon, EUROPE_BBOX)) return [];
    if (!(now - time.getTime() < MAX_AGE_MS) || !(reading.value >= MIN_VALUE)) return [];
    const band = BANDS.find((candidate) => reading.value >= candidate.min);
    return [{
      id: String(reading.sensorsId),
      lat,
      lon,
      title: `PM2.5 ${Math.round(reading.value)} µg/m³`,
      detail: `${band.name} air quality`,
      time,
      url: `https://explore.openaq.org/locations/${reading.locationsId}`,
      size: band.size,
      color: band.color,
    }];
  });
}
