// Every source returns events in one normalized shape:
// { id, lat, lon, title, detail, time: Date, url, size }
// `size` is a relative marker scale between roughly 0.5 and 2.

const MINUTE = 60 * 1000;

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export const earthquakes = {
  id: 'earthquakes',
  label: 'Earthquakes (M2.5+, 24 h)',
  color: 0xff8a3d,
  refreshMs: 5 * MINUTE,
  async fetch() {
    const data = await fetchJson('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson');
    return data.features.map((quake) => {
      const [lon, lat, depthKm] = quake.geometry.coordinates;
      const { mag, place, time, url } = quake.properties;
      return {
        id: quake.id,
        lat,
        lon,
        title: `M${mag.toFixed(1)} ${place}`,
        detail: `Depth ${Math.round(depthKm)} km`,
        time: new Date(time),
        url,
        size: 0.4 + mag * 0.25,
      };
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

export const sources = [earthquakes, naturalEvents, disasterAlerts, iss];

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
