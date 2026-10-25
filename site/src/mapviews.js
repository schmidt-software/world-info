// Map views and their tile providers. Which providers are shown depends on
// the view chosen in the panel and, for "auto", on the zoom level. Kept
// free of browser and Three.js dependencies so that it can be tested with
// node --test.

// NASA GIBS imagery, public domain. Tile rows come before columns in its URLs.
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';

export const PROVIDERS = {
  satellite: {
    id: 'satellite',
    minZoom: 4,
    maxZoom: 8,
    nightFactor: 0.5,
    url: (x, y, z) => `${GIBS}/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/${z}/${y}/${x}.jpeg`,
    credit: { text: 'NASA GIBS', href: 'https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api' },
  },
  today: {
    id: 'today',
    minZoom: 0,
    maxZoom: 9,
    nightFactor: 0.5,
    // Set by satelliteDate() when the view is built.
    date: null,
    url(x, y, z) {
      return `${GIBS}/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${this.date}/GoogleMapsCompatible_Level9/${z}/${y}/${x}.jpg`;
    },
    credit: { text: 'NASA GIBS (VIIRS)', href: 'https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api' },
  },
  streets: {
    id: 'streets',
    minZoom: 9,
    maxZoom: 19,
    nightFactor: 0.75,
    above: true,
    url: (x, y, z) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
    credit: { text: '© OpenStreetMap contributors', href: 'https://www.openstreetmap.org/copyright' },
  },
};

export const VIEWS = [
  { id: 'auto', label: 'Auto (by zoom)' },
  { id: 'map', label: 'Map' },
  { id: 'satellite', label: 'Satellite' },
  { id: 'today', label: 'Satellite today' },
  { id: 'streets', label: 'Streets' },
];

// In auto mode satellite imagery is switched off once the street map is
// fully opaque (tiles fade in over one level, see tiles.js), so it requests
// nothing that would be hidden anyway.
const STREETS_OPAQUE_AT = PROVIDERS.streets.minZoom + 1;

// For each provider the zoom level from which it fades in, or null when it
// is off. Chosen views show their provider at every zoom level. Providers in
// `failed` (see TileLayer.failed) are replaced by the next lower view:
// streets and today's imagery fall back to satellite, satellite to the map.
export function providerMinZooms(view, zoomLevel, failed = new Set()) {
  const off = { satellite: null, today: null, streets: null };
  const zooms = { ...off };
  switch (view) {
    case 'map':
      break;
    case 'satellite':
    case 'today':
    case 'streets':
      zooms[view] = 0;
      break;
    default:
      zooms.satellite = zoomLevel < STREETS_OPAQUE_AT ? PROVIDERS.satellite.minZoom : null;
      zooms.streets = PROVIDERS.streets.minZoom;
  }
  for (const id of ['streets', 'today']) {
    if (zooms[id] !== null && failed.has(id)) {
      zooms.satellite = Math.min(zooms.satellite ?? Infinity, view === 'auto' ? PROVIDERS.satellite.minZoom : 0);
      zooms[id] = null;
    }
  }
  if (failed.has('satellite')) zooms.satellite = null;
  return zooms;
}

// A short note for the panel while a provider of the chosen view is
// replaced, or null when everything works.
export function fallbackNotice(view, failed) {
  const used = view === 'auto' ? ['streets', 'satellite'] : [view];
  const names = { streets: 'Street map', satellite: 'Satellite imagery', today: "Today's imagery" };
  const missing = used.filter((id) => failed.has(id));
  if (!missing.length) return null;
  return `${missing.map((id) => names[id]).join(' and ')} unavailable right now; showing what is available.`;
}

// The VIIRS satellite passes the dayside around 13:30 local time; the
// imagery of a day is fairly complete for Europe, Africa and Asia by the
// evening UTC. Before 20:00 UTC the previous day is used, so the view does
// not show mostly empty tiles.
export function satelliteDate(now) {
  const day = new Date(now);
  if (day.getUTCHours() < 20) day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

export function isView(id) {
  return VIEWS.some((view) => view.id === id);
}
