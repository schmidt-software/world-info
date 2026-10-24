// Aircraft in flight over Europe from the OpenSky Network. Requires an API
// client (OAuth2 client credentials) from the OpenSky account page.
// A request for the whole Europe box costs 4 of the 4,000 daily credits of a
// standard account; one request every 10 minutes uses about 600.

import { EUROPE_BBOX, fetchJson } from '../lib.mjs';

const TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';

// Positions of state vector fields, see https://openskynetwork.github.io/opensky-api/rest.html
const ICAO24 = 0;
const CALLSIGN = 1;
const ORIGIN_COUNTRY = 2;
const TIME_POSITION = 3;
const LONGITUDE = 5;
const LATITUDE = 6;
const ON_GROUND = 8;
const VELOCITY = 9;
const GEO_ALTITUDE = 13;

export default {
  id: 'opensky-aircraft',
  label: 'Aircraft over Europe (OpenSky)',
  color: 0xe2e8f0,
  pulse: false,
  attribution: 'OpenSky Network',
  requiredEnv: ['OPENSKY_CLIENT_ID', 'OPENSKY_CLIENT_SECRET'],
  async fetch(env) {
    const token = await fetchJson(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: env.OPENSKY_CLIENT_ID,
        client_secret: env.OPENSKY_CLIENT_SECRET,
      }),
    });
    const params = new URLSearchParams({
      lamin: EUROPE_BBOX.minLat, lomin: EUROPE_BBOX.minLon, lamax: EUROPE_BBOX.maxLat, lomax: EUROPE_BBOX.maxLon,
    });
    const data = await fetchJson(`https://opensky-network.org/api/states/all?${params}`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    return parseStates(data.states ?? []);
  },
};

export function parseStates(states) {
  return states.flatMap((state) => {
    if (state[ON_GROUND] || state[LATITUDE] === null || state[LONGITUDE] === null) return [];
    const callsign = state[CALLSIGN]?.trim();
    const altitudeM = state[GEO_ALTITUDE];
    return [{
      id: state[ICAO24],
      lat: state[LATITUDE],
      lon: state[LONGITUDE],
      title: callsign || state[ICAO24].toUpperCase(),
      detail: [
        state[ORIGIN_COUNTRY],
        altitudeM !== null && `${Math.round(altitudeM).toLocaleString('en')} m`,
        state[VELOCITY] !== null && `${Math.round(state[VELOCITY] * 3.6)} km/h`,
      ].filter(Boolean).join(', '),
      time: new Date(state[TIME_POSITION] * 1000),
      url: `https://globe.adsbexchange.com/?icao=${state[ICAO24]}`,
      size: 0.3,
    }];
  });
}
