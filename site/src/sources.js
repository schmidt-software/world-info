import { districtEvents } from './dwd.js';
import { EUROPE_BBOX, isInBbox } from './geo.js';

// Every source returns events in one normalized shape:
// { id, lat, lon, title, detail, time: Date, url, size }
// `size` is a relative marker scale between roughly 0.3 and 2.
// A source may also offer `subscribe(onEvent)` for pushed live updates.

const MINUTE = 60 * 1000;

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

// Europe is left to EMSC, which is more complete there; this avoids
// showing the same quake twice.
export const earthquakes = {
  id: 'earthquakes',
  label: 'Earthquakes outside Europe (USGS, M2.5+)',
  color: 0xff8a3d,
  refreshMs: 5 * MINUTE,
  async fetch() {
    const data = await fetchJson('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson');
    return data.features.flatMap((quake) => {
      const [lon, lat, depthKm] = quake.geometry.coordinates;
      if (isInBbox(lat, lon, EUROPE_BBOX)) return [];
      const { mag, place, time, url } = quake.properties;
      return [{
        id: quake.id,
        lat,
        lon,
        title: `M${mag.toFixed(1)} ${place}`,
        detail: `Depth ${Math.round(depthKm)} km`,
        time: new Date(time),
        url,
        size: quakeSize(mag),
      }];
    });
  },
};

const EMSC_QUERY = 'https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=1000&minmag=1.5'
  + `&minlat=${EUROPE_BBOX.minLat}&maxlat=${EUROPE_BBOX.maxLat}`
  + `&minlon=${EUROPE_BBOX.minLon}&maxlon=${EUROPE_BBOX.maxLon}`;
const EMSC_WEBSOCKET = 'wss://www.seismicportal.eu/standing_order/websocket';

export const europeanEarthquakes = {
  id: 'emsc-earthquakes',
  label: 'Earthquakes Europe (EMSC, M1.5+, live)',
  color: 0xef4444,
  refreshMs: 15 * MINUTE,
  async fetch() {
    const start = new Date(Date.now() - 24 * 60 * MINUTE).toISOString().slice(0, 19);
    const data = await fetchJson(`${EMSC_QUERY}&start=${start}`);
    return data.features.map(emscEvent);
  },
  // EMSC pushes new and updated events worldwide; the REST refresh above
  // stays as a safety net in case the socket drops silently.
  subscribe(onEvent) {
    let retryMs = 5000;
    const connect = () => {
      const socket = new WebSocket(EMSC_WEBSOCKET);
      socket.onopen = () => { retryMs = 5000; };
      socket.onmessage = (message) => {
        const { data } = JSON.parse(message.data);
        const { lat, lon, mag } = data.properties;
        if (mag >= 1.5 && isInBbox(lat, lon, EUROPE_BBOX)) onEvent(emscEvent(data));
      };
      socket.onclose = () => {
        setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, 5 * MINUTE);
      };
    };
    connect();
  },
};

function emscEvent(feature) {
  const { unid, mag, magtype, flynn_region: region, depth, time } = feature.properties;
  return {
    id: unid,
    lat: feature.properties.lat,
    lon: feature.properties.lon,
    title: `M${mag.toFixed(1)} ${titleCase(region)}`,
    detail: `Depth ${Math.round(depth)} km, magnitude type ${magtype}`,
    time: new Date(time),
    url: `https://www.seismicportal.eu/eventdetails.html?unid=${unid}`,
    size: quakeSize(mag),
  };
}

function quakeSize(mag) {
  return 0.4 + mag * 0.25;
}

export const germanWeatherWarnings = {
  id: 'dwd-warnings',
  label: 'Weather warnings Germany (DWD)',
  color: 0xa78bfa,
  refreshMs: 10 * MINUTE,
  pulse: false,
  async fetch() {
    // The server filters for warnings active right now; the feed also holds
    // warnings that start later. Without geometry the response stays near
    // 100 KB, and the per-feature bbox is enough to place a marker. CRS:84
    // fixes the axis order to lon/lat, EPSG:4326 under WFS 2.0 would be lat/lon.
    const now = new Date().toISOString().slice(0, 19) + 'Z';
    const params = new URLSearchParams({
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeName: 'dwd:Warnungen_Landkreise',
      outputFormat: 'application/json',
      srsName: 'CRS:84',
      propertyName: 'EVENT,SEVERITY,ONSET,EXPIRES,AREADESC,GC_STATE,GC_WARNCELLID',
      CQL_FILTER: `ONSET <= '${now}' AND EXPIRES > '${now}'`,
    });
    const data = await fetchJson(`https://maps.dwd.de/geoserver/dwd/ows?${params}`);
    return districtEvents(data.features);
  },
};

const DIGITRAFFIC_HEADERS = { 'Digitraffic-User': 'world-info' };
const SHIP_MAX_AGE_MS = 60 * MINUTE;

export const balticShips = {
  id: 'digitraffic-ships',
  label: 'Ships Baltic Sea (Digitraffic, AIS)',
  color: 0x22d3ee,
  refreshMs: 2 * MINUTE,
  pulse: false,
  async fetch() {
    const [locations, vessels] = await Promise.all([
      fetchJson('https://meri.digitraffic.fi/api/ais/v1/locations', DIGITRAFFIC_HEADERS),
      fetchJson('https://meri.digitraffic.fi/api/ais/v1/vessels', DIGITRAFFIC_HEADERS),
    ]);
    const vesselsByMmsi = new Map(vessels.map((vessel) => [vessel.mmsi, vessel]));
    const now = Date.now();
    return locations.features.flatMap((ship) => {
      const p = ship.properties;
      if (now - p.timestampExternal > SHIP_MAX_AGE_MS) return [];
      const [lon, lat] = ship.geometry.coordinates;
      const vessel = vesselsByMmsi.get(p.mmsi);
      return [{
        id: String(p.mmsi),
        lat,
        lon,
        title: vessel?.name?.trim() || `MMSI ${p.mmsi}`,
        detail: [
          `${p.sog.toFixed(1)} kn`,
          vessel?.destination?.trim() && `to ${vessel.destination.trim()}`,
        ].filter(Boolean).join(', '),
        time: new Date(p.timestampExternal),
        url: `https://www.myshiptracking.com/vessels/mmsi-${p.mmsi}`,
        size: 0.35,
      }];
    });
  },
};

export const naturalEvents = {
  id: 'natural-events',
  label: 'Natural events (NASA EONET)',
  color: 0x4ade80,
  refreshMs: 15 * MINUTE,
  async fetch() {
    const data = await fetchJson('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30');
    return data.events.flatMap((event) => {
      const latest = event.geometry.at(-1);
      const position = geometryCenter(latest);
      if (!position) return [];
      return [{
        id: event.id,
        ...position,
        title: event.title,
        detail: event.categories.map((category) => category.title).join(', '),
        time: new Date(latest.date),
        url: event.sources[0]?.url ?? event.link,
        size: 1,
      }];
    });
  },
};

const GDACS_EVENT_TYPES = {
  EQ: 'Earthquake',
  TC: 'Tropical cyclone',
  FL: 'Flood',
  VO: 'Volcano',
  DR: 'Drought',
  WF: 'Wildfire',
};

const GDACS_ALERT_SIZES = { Green: 0.8, Orange: 1.4, Red: 2 };

export const disasterAlerts = {
  id: 'disaster-alerts',
  label: 'Disaster alerts (GDACS)',
  color: 0xf472b6,
  refreshMs: 15 * MINUTE,
  async fetch() {
    const types = Object.keys(GDACS_EVENT_TYPES).join(';');
    const data = await fetchJson(
      `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=${types}&alertlevel=Green;Orange;Red`,
    );
    return data.features.flatMap((alert) => {
      const position = geometryCenter(alert.geometry);
      if (!position) return [];
      const p = alert.properties;
      return [{
        id: `${p.eventtype}-${p.eventid}`,
        ...position,
        title: p.name,
        detail: `${p.alertlevel} alert, ${GDACS_EVENT_TYPES[p.eventtype] ?? p.eventtype}`,
        time: new Date(`${p.fromdate}Z`),
        url: p.url?.report,
        size: GDACS_ALERT_SIZES[p.alertlevel] ?? 1,
      }];
    });
  },
};

export const iss = {
  id: 'iss',
  label: 'International Space Station',
  color: 0xfacc15,
  refreshMs: 5 * 1000,
  async fetch() {
    const data = await fetchJson('https://api.wheretheiss.at/v1/satellites/25544');
    return [{
      id: 'iss',
      lat: data.latitude,
      lon: data.longitude,
      altitudeKm: data.altitude,
      title: 'ISS',
      detail: `${Math.round(data.altitude)} km altitude, ${Math.round(data.velocity).toLocaleString('en')} km/h`,
      time: new Date(data.timestamp * 1000),
      url: 'https://wheretheiss.at/',
      size: 1.5,
    }];
  },
};

export const sources = [
  europeanEarthquakes,
  earthquakes,
  germanWeatherWarnings,
  balticShips,
  naturalEvents,
  disasterAlerts,
  iss,
];

function titleCase(text) {
  return text.toLowerCase().replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

// Points are used as is; for polygons the average of the outer ring is good
// enough to place a marker.
function geometryCenter(geometry) {
  if (!geometry) return null;
  if (geometry.type === 'Point') {
    const [lon, lat] = geometry.coordinates;
    return { lat, lon };
  }
  if (geometry.type === 'Polygon') {
    const ring = geometry.coordinates[0];
    const lon = ring.reduce((sum, point) => sum + point[0], 0) / ring.length;
    const lat = ring.reduce((sum, point) => sum + point[1], 0) / ring.length;
    return { lat, lon };
  }
  return null;
}
