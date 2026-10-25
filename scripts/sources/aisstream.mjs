// Ships around Europe from aisstream.io. The service only offers a WebSocket
// stream and does not allow browser connections, so the script listens for a
// short while and keeps the latest position of every ship it hears.

import { EUROPE_BBOX } from '../lib.mjs';

const STREAM_URL = 'wss://stream.aisstream.io/v0/stream';
const LISTEN_MS = 45 * 1000;
const MAX_SHIPS = 6000;

export default {
  id: 'aisstream-ships',
  label: 'Ships around Europe (aisstream.io, AIS)',
  color: 0x0891b2,
  pulse: false,
  cluster: true,
  clusterNoun: 'ships',
  attribution: 'aisstream.io',
  requiredEnv: ['AISSTREAM_API_KEY'],
  async fetch(env) {
    const messages = await listen(env.AISSTREAM_API_KEY);
    if (!messages.length) throw new Error('aisstream.io: no messages received');
    return collectShips(messages).slice(0, MAX_SHIPS);
  },
};

function listen(apiKey) {
  return new Promise((resolve, reject) => {
    const messages = [];
    const socket = new WebSocket(STREAM_URL);
    const timer = setTimeout(() => socket.close(), LISTEN_MS);

    // The subscription must arrive within 3 seconds after connecting.
    socket.onopen = () => socket.send(JSON.stringify({
      APIKey: apiKey,
      BoundingBoxes: [[[EUROPE_BBOX.minLat, EUROPE_BBOX.minLon], [EUROPE_BBOX.maxLat, EUROPE_BBOX.maxLon]]],
      FilterMessageTypes: ['PositionReport'],
    }));
    socket.onmessage = async (message) => {
      const text = typeof message.data === 'string' ? message.data : await message.data.text();
      const parsed = JSON.parse(text);
      // A rejected key is answered with an error object and a closed socket.
      if (parsed.error) {
        clearTimeout(timer);
        reject(new Error(`aisstream.io: ${parsed.error}`));
        socket.close();
        return;
      }
      messages.push(parsed);
    };
    // An invalid key is not answered with a message: the server drops the
    // connection right after the subscription.
    socket.onerror = () => {
      clearTimeout(timer);
      reject(new Error('aisstream.io: connection dropped, check AISSTREAM_API_KEY'));
    };
    socket.onclose = () => {
      clearTimeout(timer);
      resolve(messages);
    };
  });
}

// Keeps the most recent position report per MMSI. aisstream documents the
// MetaData fields in both capitalizations, so both are accepted.
export function collectShips(messages) {
  const ships = new Map();
  for (const message of messages) {
    if (message.MessageType !== 'PositionReport') continue;
    const meta = message.MetaData ?? {};
    const report = message.Message?.PositionReport ?? {};
    const lat = meta.latitude ?? meta.Latitude ?? report.Latitude;
    const lon = meta.longitude ?? meta.Longitude ?? report.Longitude;
    const mmsi = meta.MMSI ?? report.UserID;
    if (typeof lat !== 'number' || typeof lon !== 'number' || !mmsi) continue;
    // AIS uses 91/181 for "position not available".
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;

    const time = parseTime(meta.time_utc) ?? new Date();
    ships.set(mmsi, {
      id: String(mmsi),
      lat,
      lon,
      title: meta.ShipName?.trim() || `MMSI ${mmsi}`,
      detail: typeof report.Sog === 'number' ? `${report.Sog.toFixed(1)} kn` : '',
      time,
      url: `https://www.myshiptracking.com/vessels/mmsi-${mmsi}`,
      size: 0.35,
    });
  }
  return [...ships.values()];
}

// time_utc looks like "2026-10-24 00:12:01.123456789 +0000 UTC".
function parseTime(value) {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/.exec(value);
  return match ? new Date(`${match[1]}T${match[2]}Z`) : null;
}
