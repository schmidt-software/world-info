// Traffic incidents in large European cities from the TomTom Traffic API.
// A request may cover at most 10,000 km², so the layer queries a box around
// each city instead of all of Europe. With 20 cities and a new fetch every
// 20 minutes this stays below the 2,500 requests per day of the free tier.

import { fetchJson } from '../lib.mjs';

const CITIES = [
  ['London', 51.507, -0.128], ['Paris', 48.857, 2.352], ['Berlin', 52.52, 13.405],
  ['Madrid', 40.417, -3.704], ['Rome', 41.903, 12.496], ['Vienna', 48.208, 16.373],
  ['Warsaw', 52.23, 21.012], ['Amsterdam', 52.368, 4.904], ['Brussels', 50.85, 4.352],
  ['Munich', 48.137, 11.576], ['Milan', 45.464, 9.19], ['Barcelona', 41.385, 2.173],
  ['Prague', 50.075, 14.438], ['Budapest', 47.498, 19.04], ['Stockholm', 59.329, 18.069],
  ['Copenhagen', 55.676, 12.568], ['Hamburg', 53.551, 9.994], ['Zurich', 47.377, 8.541],
  ['Lisbon', 38.722, -9.139], ['Athens', 37.984, 23.728],
];
// Half extent of each box in degrees: about 90 x 80 km in central Europe.
const HALF_LAT = 0.4;
const HALF_LON = 0.55;

const FIELDS = '{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,'
  + 'events{description},startTime,from,to,roadNumbers}}}';

// iconCategory values of the Incident Details API (version 5).
const CATEGORIES = {
  1: 'Accident', 2: 'Fog', 3: 'Dangerous conditions', 4: 'Rain', 5: 'Ice', 6: 'Jam',
  7: 'Lane closed', 8: 'Road closed', 9: 'Road works', 10: 'Wind', 11: 'Flooding',
  14: 'Broken down vehicle',
};
// Jams and road works are everywhere; showing only incidents with at least a
// moderate delay or a closure keeps the layer readable.
const SHOWN_MAGNITUDES = new Set([2, 3, 4]);

export default {
  id: 'tomtom-incidents',
  label: 'Traffic incidents in major cities (TomTom)',
  color: 0xfda4af,
  attribution: 'TomTom',
  requiredEnv: ['TOMTOM_API_KEY'],
  minIntervalMinutes: 20,
  async fetch(env) {
    const events = [];
    for (const [city, lat, lon] of CITIES) {
      const params = new URLSearchParams({
        key: env.TOMTOM_API_KEY,
        bbox: [lon - HALF_LON, lat - HALF_LAT, lon + HALF_LON, lat + HALF_LAT].map((value) => value.toFixed(3)).join(','),
        fields: FIELDS,
        language: 'en-GB',
        timeValidityFilter: 'present',
      });
      const data = await fetchJson(`https://api.tomtom.com/traffic/services/5/incidentDetails?${params}`);
      events.push(...parseIncidents(data.incidents ?? [], city));
    }
    return events;
  },
};

export function parseIncidents(incidents, city) {
  return incidents.flatMap((incident) => {
    const p = incident.properties;
    if (!SHOWN_MAGNITUDES.has(p.magnitudeOfDelay)) return [];
    // LineStrings are placed at their first point, where the delay begins.
    const [lon, lat] = incident.geometry.type === 'Point'
      ? incident.geometry.coordinates
      : incident.geometry.coordinates[0];
    const road = p.roadNumbers?.length ? `${p.roadNumbers.join('/')} ` : '';
    const description = p.events?.map((event) => event.description).join(', ');
    return [{
      id: p.id,
      lat,
      lon,
      title: `${CATEGORIES[p.iconCategory] ?? 'Incident'}, ${city}`,
      detail: [description, p.from && p.to && `${road}${p.from} to ${p.to}`].filter(Boolean).join('; '),
      time: p.startTime ? new Date(p.startTime) : new Date(),
      size: p.magnitudeOfDelay === 3 || p.magnitudeOfDelay === 4 ? 0.9 : 0.6,
    }];
  });
}
