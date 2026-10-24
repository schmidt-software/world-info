// Concerts, sports and other events from the Ticketmaster Discovery API that
// start around now, in the European countries Ticketmaster sells in.
// The default key allows 5 requests per second and 5,000 per day.

import { fetchJson } from '../lib.mjs';

const COUNTRIES = ['AT', 'BE', 'CH', 'CZ', 'DE', 'DK', 'ES', 'FI', 'FR', 'GB', 'IE', 'IT', 'NL', 'NO', 'PL', 'PT', 'SE'];
// Events that started up to 3 hours ago are likely still going on.
const STARTED_WITHIN_MS = 3 * 60 * 60 * 1000;
const STARTS_WITHIN_MS = 60 * 60 * 1000;

export default {
  id: 'ticketmaster-events',
  label: 'Concerts and events now (Ticketmaster)',
  color: 0x818cf8,
  attribution: 'Ticketmaster',
  requiredEnv: ['TICKETMASTER_API_KEY'],
  minIntervalMinutes: 20,
  async fetch(env) {
    const now = Date.now();
    const events = [];
    for (const countryCode of COUNTRIES) {
      const params = new URLSearchParams({
        apikey: env.TICKETMASTER_API_KEY,
        countryCode,
        startDateTime: isoSeconds(now - STARTED_WITHIN_MS),
        endDateTime: isoSeconds(now + STARTS_WITHIN_MS),
        size: '200',
        sort: 'date,asc',
      });
      const data = await fetchJson(`https://app.ticketmaster.com/discovery/v2/events.json?${params}`);
      events.push(...parseEvents(data._embedded?.events ?? []));
      // Stay well below the limit of 5 requests per second.
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return events;
  },
};

export function parseEvents(events) {
  return events.flatMap((event) => {
    const venue = event._embedded?.venues?.[0];
    const lat = Number(venue?.location?.latitude);
    const lon = Number(venue?.location?.longitude);
    const start = event.dates?.start?.dateTime;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !start) return [];
    const genre = event.classifications?.[0]?.segment?.name;
    return [{
      id: event.id,
      lat,
      lon,
      title: event.name,
      detail: [venue.name, venue.city?.name, genre !== 'Undefined' && genre].filter(Boolean).join(', '),
      time: new Date(start),
      url: event.url,
      size: 0.7,
    }];
  });
}

// Ticketmaster expects "2026-10-24T18:00:00Z", without milliseconds.
function isoSeconds(timestamp) {
  return new Date(timestamp).toISOString().replace(/\.\d{3}Z$/, 'Z');
}
