// Live webcams in Europe from the Windy Webcams API (v3, free tier).
// Image URLs of the free tier expire after 10 minutes, longer than a snapshot
// may live, so markers link to the webcam page instead of embedding images.
// The free tier returns at most 50 webcams per request.

import { EUROPE_BBOX, fetchJson } from '../lib.mjs';

const PAGE_SIZE = 50;
const PAGES = 4;

export default {
  id: 'windy-webcams',
  label: 'Live webcams Europe (Windy)',
  color: 0x94a3b8,
  pulse: false,
  attribution: 'Windy.com',
  requiredEnv: ['WINDY_WEBCAMS_API_KEY'],
  // Webcams rarely change; there is no point in fetching them every run.
  minIntervalMinutes: 60,
  async fetch(env) {
    const webcams = [];
    for (let page = 0; page < PAGES; page++) {
      const params = new URLSearchParams({
        // Order as in the Windy map cluster API: north, east, south, west.
        // Not yet verified against a live key.
        bbox: [EUROPE_BBOX.maxLat, EUROPE_BBOX.maxLon, EUROPE_BBOX.minLat, EUROPE_BBOX.minLon].join(','),
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
        include: 'location,urls',
        lang: 'en',
      });
      const data = await fetchJson(`https://api.windy.com/webcams/api/v3/webcams?${params}`, {
        headers: { 'x-windy-api-key': env.WINDY_WEBCAMS_API_KEY },
      });
      webcams.push(...data.webcams);
      if (data.webcams.length < PAGE_SIZE) break;
    }
    return parseWebcams(webcams);
  },
};

export function parseWebcams(webcams) {
  return webcams.flatMap((webcam) => {
    const location = webcam.location;
    if (webcam.status !== 'active' || !location) return [];
    return [{
      id: String(webcam.webcamId),
      lat: location.latitude,
      lon: location.longitude,
      title: webcam.title,
      detail: [location.city, location.country].filter(Boolean).join(', '),
      time: new Date(webcam.lastUpdatedOn ?? Date.now()),
      url: webcam.urls?.detail,
      size: 0.5,
    }];
  });
}
