// Shared helpers for the snapshot sources in scripts/sources/.

const USER_AGENT = 'world-info (+https://github.com/schmidt-software/world-info)';
const TIMEOUT_MS = 30 * 1000;

export async function fetchResponse(url, { headers = {}, ...options } = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'User-Agent': USER_AGENT, ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 200);
    throw new Error(`${new URL(url).host}: HTTP ${response.status} ${body}`);
  }
  return response;
}

export async function fetchJson(url, options) {
  return (await fetchResponse(url, options)).json();
}

export async function fetchText(url, options) {
  return (await fetchResponse(url, options)).text();
}

export function average(points) {
  const lat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const lon = points.reduce((sum, point) => sum + point.lon, 0) / points.length;
  return { lat, lon };
}

// Europe including the Mediterranean; matches EUROPE_BBOX in site/src/geo.js.
export const EUROPE_BBOX = { minLat: 27, maxLat: 72, minLon: -32, maxLon: 48 };

export function isInBbox(lat, lon, bbox) {
  return lat >= bbox.minLat && lat <= bbox.maxLat && lon >= bbox.minLon && lon <= bbox.maxLon;
}
