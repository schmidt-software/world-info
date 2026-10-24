// Active fires and thermal anomalies in Europe detected by the VIIRS
// instruments of the Suomi NPP and NOAA-20 satellites, from NASA FIRMS.
// The two satellites often see the same fire; detections are merged on a
// grid of about 2 km.

import { EUROPE_BBOX, fetchText } from '../lib.mjs';

const SATELLITES = ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT'];
const GRID_DEGREES = 0.02;

export default {
  id: 'nasa-firms-fires',
  label: 'Active fires Europe (NASA FIRMS, 24 h)',
  color: 0xff5f1f,
  attribution: 'NASA FIRMS',
  requiredEnv: ['NASA_FIRMS_MAP_KEY'],
  minIntervalMinutes: 30,
  async fetch(env) {
    const area = [EUROPE_BBOX.minLon, EUROPE_BBOX.minLat, EUROPE_BBOX.maxLon, EUROPE_BBOX.maxLat].join(',');
    const csvFiles = await Promise.all(SATELLITES.map((satellite) =>
      fetchText(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${env.NASA_FIRMS_MAP_KEY}/${satellite}/${area}/1`)));
    // FIRMS answers an invalid key with HTTP 200 and a plain text message.
    for (const csv of csvFiles) {
      if (!csv.startsWith('latitude,')) throw new Error(`FIRMS: ${csv.slice(0, 120)}`);
    }
    return mergeDetections(csvFiles.flatMap(parseCsv));
  },
};

export function parseCsv(csv) {
  const [header, ...lines] = csv.trim().split('\n');
  const columns = header.split(',');
  return lines.map((line) => Object.fromEntries(line.split(',').map((value, index) => [columns[index], value])));
}

export function mergeDetections(rows) {
  const cells = new Map();
  for (const row of rows) {
    // Low-confidence detections are mostly sun glint and hot surfaces.
    if (row.confidence === 'l' || row.confidence === 'low') continue;
    const lat = Number(row.latitude);
    const lon = Number(row.longitude);
    const key = `${Math.round(lat / GRID_DEGREES)},${Math.round(lon / GRID_DEGREES)}`;
    const time = new Date(`${row.acq_date}T${row.acq_time.padStart(4, '0').replace(/(\d\d)(\d\d)/, '$1:$2')}:00Z`);
    const frp = Number(row.frp) || 0;
    const existing = cells.get(key);
    if (existing && existing.frp >= frp) continue;
    cells.set(key, { lat, lon, time, frp });
  }
  return [...cells.entries()].map(([key, cell]) => ({
    id: key,
    lat: cell.lat,
    lon: cell.lon,
    title: 'Active fire or thermal anomaly',
    detail: `Fire radiative power ${cell.frp.toFixed(1)} MW`,
    time: cell.time,
    url: `https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs;@${cell.lon.toFixed(3)},${cell.lat.toFixed(3)},10.0z`,
    size: Math.min(0.4 + Math.sqrt(cell.frp) / 10, 1.6),
  }));
}
