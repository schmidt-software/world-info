import { EventList } from './eventlist.js';
import { formatAge, formatTime } from './format.js';
import { vector3ToLatLon } from './geo.js';
import { fallbackNotice, isView, PROVIDERS, providerMinZooms, satelliteDate, VIEWS } from './mapviews.js';
import { Globe } from './globe.js';
import { CountryLabels } from './labels.js';
import { MarkerLayer, markerGrowth, updateMarkerView } from './markers.js';
import { setUpPanel } from './panel.js';
import { loadSnapshotSources } from './snapshots.js';
import { sources } from './sources.js';
import { TileLayer } from './tiles.js';
import { ZoomController } from './zoom.js';

setUpPanel();
const globe = new Globe(document.getElementById('globe'));
const layers = [];
const layerList = document.getElementById('layers');
const tooltip = document.getElementById('tooltip');
const clock = document.getElementById('clock');
const snapshotCredits = document.getElementById('snapshot-credits');
const eventList = new EventList({ getLayers: () => layers, onShow: showOnMap });
const zoom = new ZoomController(globe);
document.getElementById('zoom-in').addEventListener('click', () => zoom.zoomIn());
document.getElementById('zoom-out').addEventListener('click', () => zoom.zoomOut());
document.getElementById('zoom-reset').addEventListener('click', () => zoom.reset());

sources.forEach(addLayer);
loadSnapshotSources()
  .then((snapshotSources) => snapshotSources.forEach(addLayer))
  .catch((error) => console.error('Could not load snapshot layers', error));

const countryLabels = new CountryLabels(document.getElementById('labels'), globe.camera);
globe.onFrame(() => countryLabels.update());
// Map views: satellite and street tiles over the map-style globe, chosen by
// zoom level ("auto") or fixed in the panel. While the street map covers the
// view, the overview outlines and country labels give way to its own.
const VIEW_STORAGE_KEY = 'world-info.mapView';
const tileLayers = Object.fromEntries(Object.entries(PROVIDERS).map(([id, provider]) => [id, new TileLayer(globe, provider)]));
const viewSelect = document.getElementById('map-view');
let mapView = readStoredView();

for (const view of VIEWS) {
  const option = document.createElement('option');
  option.value = view.id;
  option.textContent = view.id === 'today' ? `${view.label} (${satelliteDate(Date.now())})` : view.label;
  viewSelect.append(option);
}
viewSelect.value = mapView;
viewSelect.addEventListener('change', () => {
  mapView = viewSelect.value;
  try { localStorage.setItem(VIEW_STORAGE_KEY, mapView); } catch { /* storage may be unavailable */ }
});

const mapCredits = document.getElementById('map-credits');
let shownCredits = '';

const viewNotice = document.getElementById('map-view-notice');

globe.onFrame((time) => {
  // Providers whose tiles keep failing are replaced by the next lower view.
  const failed = new Set(Object.entries(tileLayers).filter(([, layer]) => layer.failed).map(([id]) => id));
  const notice = fallbackNotice(mapView, failed);
  viewNotice.hidden = !notice;
  if (notice && viewNotice.textContent !== notice) viewNotice.textContent = notice;
  const minZooms = providerMinZooms(mapView, zoom.zoomLevel, failed);
  if (minZooms.today !== null) useSatelliteDate(satelliteDate(Date.now()));
  for (const [id, layer] of Object.entries(tileLayers)) layer.update(globe.camera, minZooms[id], time);
  const streetsCover = tileLayers.streets.fullyVisible;
  globe.setOutlinesVisible(!streetsCover);
  countryLabels.setEnabled(!streetsCover);
  showMapCredits(Object.values(tileLayers).filter((layer) => layer.tiles.visible).map((layer) => layer.provider.credit));
});

function readStoredView() {
  try {
    const stored = localStorage.getItem(VIEW_STORAGE_KEY);
    return isView(stored) ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

// The daily imagery changes its date at 20:00 UTC; tiles of the old day are
// dropped so the new day loads.
function useSatelliteDate(date) {
  if (PROVIDERS.today.date === date) return;
  PROVIDERS.today.date = date;
  tileLayers.today.tiles.clearTiles();
}

// Every provider whose tiles are visible is credited, as their terms
// require; the footer only changes when the set of providers does.
function showMapCredits(credits) {
  const key = credits.map((credit) => credit.text).join('|');
  if (key === shownCredits) return;
  shownCredits = key;
  mapCredits.replaceChildren(...credits.flatMap((credit) => {
    const link = document.createElement('a');
    link.href = credit.href;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = credit.text;
    return [', map ', link];
  }));
}

// Marker sizes and clusters depend on the camera, so they follow it every frame.
globe.onFrame((time) => {
  const viewport = viewportSize();
  updateMarkerView(globe.camera, viewport.height, zoom.altitude);
  for (const layer of layers) layer.updateView(globe.camera, viewport, zoom.zoomLevel, time);
});
globe.loadMap()
  .then((countries) => countryLabels.setCountries(countries))
  .catch((error) => console.error('Could not load the map', error));
globe.start();

setInterval(updateClock, 1000);
updateClock();

function addLayer(source) {
  const layer = new MarkerLayer(source);
  layers.push(layer);
  layer.ui = createLayerRow(layer);

  // Snapshot layers without data (missing API key, failed fetch) stay listed
  // so it is visible what could be shown, but are not loaded.
  if (source.unavailable) {
    layer.ui.row.classList.add('unavailable');
    layer.ui.toggle.disabled = true;
    layer.ui.toggle.checked = false;
    layer.ui.count.textContent = '';
    layer.ui.status.textContent = source.unavailable;
    return;
  }

  if (source.attribution) {
    snapshotCredits.textContent += `, ${source.attribution}`;
  }
  globe.scene.add(layer.group);
  globe.onFrame((time) => layer.animate(time));
  refresh(layer);
  setInterval(() => refresh(layer), source.refreshMs);
  source.subscribe?.((event) => upsertEvent(layer, event));
}

async function refresh(layer) {
  try {
    // Sources return either the events or { events, updatedAt } when the data
    // is older than the request (snapshots).
    const result = await layer.source.fetch();
    const events = Array.isArray(result) ? result : result.events;
    layer.setEvents(events);
    if (layer.source.id === 'iss' && events[0]) layer.extendTrail(events[0]);
    layer.ui.count.textContent = events.length;
    layer.ui.status.textContent = `Updated ${formatTime(result.updatedAt ?? new Date())}`;
    layer.ui.status.classList.remove('error');
    eventList.refresh();
  } catch (error) {
    console.error(`Could not load ${layer.source.id}`, error);
    layer.ui.status.textContent = `Unavailable: ${error.message}`;
    layer.ui.status.classList.add('error');
  }
}

// Pushed events replace an existing event with the same id (EMSC sends
// updates when a magnitude is revised) or are added.
function upsertEvent(layer, event) {
  const events = [...layer.events.filter((existing) => existing.id !== event.id), event];
  layer.setEvents(events);
  layer.ui.count.textContent = events.length;
  layer.ui.status.textContent = `Live update ${formatTime(new Date())}`;
  eventList.refresh();
}

function createLayerRow(layer) {
  const row = document.createElement('li');
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = true;
  toggle.setAttribute('aria-label', `Show ${layer.source.label}`);
  toggle.addEventListener('change', () => { layer.group.visible = toggle.checked; });

  const swatch = document.createElement('span');
  swatch.className = 'swatch';
  swatch.style.background = `#${layer.source.color.toString(16).padStart(6, '0')}`;

  // The name opens the event list filtered to this layer. Layers without
  // data (missing API key) keep a plain label.
  const label = document.createElement(layer.source.unavailable ? 'span' : 'button');
  label.className = 'layer-name';
  label.textContent = layer.source.label;

  const count = document.createElement('span');
  count.className = 'count';
  count.textContent = '...';

  const status = document.createElement('span');
  status.className = 'status';
  status.textContent = 'Loading';

  row.append(toggle, swatch, label, count, status);
  // A click anywhere on the row except the checkbox opens the event list.
  if (!layer.source.unavailable) {
    label.type = 'button';
    label.title = `List the events of ${layer.source.label}`;
    row.classList.add('opens-list');
    row.addEventListener('click', (domEvent) => {
      if (domEvent.target !== toggle) eventList.open(layer.source.id);
    });
  }
  layerList.append(row);
  return { row, toggle, count, status };
}

function updateClock() {
  const now = new Date();
  clock.textContent = `${now.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
  // The terminator moves about a quarter degree per minute, so a per-second
  // update is more than smooth enough.
  globe.updateSun(now);
}

// Tooltip and click: the marker nearest to the pointer on screen, among the
// visible layers; markers behind the globe cannot be picked.
let hoveredItem = null;

function itemAt(x, y) {
  const viewport = viewportSize();
  const growth = markerGrowth();
  let best = null;
  for (const layer of layers) {
    const hit = layer.pick(globe.camera, viewport, x, y, growth);
    if (hit && (!best || hit.distance < best.distance)) best = hit;
  }
  return best?.item ?? null;
}

globe.renderer.domElement.addEventListener('pointermove', (domEvent) => {
  hoveredItem = itemAt(domEvent.clientX, domEvent.clientY);
  if (!hoveredItem) {
    tooltip.hidden = true;
    globe.renderer.domElement.style.cursor = '';
    return;
  }
  renderTooltip(hoveredItem.event);
  tooltip.style.left = `${Math.min(domEvent.clientX + 14, window.innerWidth - 300)}px`;
  tooltip.style.top = `${domEvent.clientY + 14}px`;
  tooltip.hidden = false;
  globe.renderer.domElement.style.cursor = hoveredItem.cluster || hoveredItem.event.url ? 'pointer' : '';
});

// Browsers also fire click after a drag that rotated the globe. Only a press
// and release at (almost) the same spot counts as a click on a marker.
const CLICK_TOLERANCE_PX = 5;
let pointerDownAt = null;

globe.renderer.domElement.addEventListener('pointerdown', (domEvent) => {
  pointerDownAt = { x: domEvent.clientX, y: domEvent.clientY };
});

globe.renderer.domElement.addEventListener('click', (domEvent) => {
  const moved = pointerDownAt
    && Math.hypot(domEvent.clientX - pointerDownAt.x, domEvent.clientY - pointerDownAt.y) > CLICK_TOLERANCE_PX;
  if (moved || !hoveredItem) return;
  if (hoveredItem.cluster) {
    // A cluster zooms in towards its members until they separate.
    const { lat, lon } = vector3ToLatLon(hoveredItem.position);
    zoom.flyTo(lat, lon, zoom.altitude / 4, 900);
  } else if (hoveredItem.event.url) {
    window.open(hoveredItem.event.url, '_blank', 'noopener');
  }
});

// From the event list: fly to the event, close enough to see it on its own,
// and let its marker pulse for a few seconds.
const SHOW_ON_MAP_ALTITUDE = 0.02;

function showOnMap(source, event) {
  zoom.flyTo(event.lat, event.lon, Math.min(zoom.altitude, SHOW_ON_MAP_ALTITUDE));
  const layer = layers.find((candidate) => candidate.source === source);
  if (!layer) return;
  layer.group.visible = true;
  layer.ui.toggle.checked = true;
  layer.highlightEvent(event.id, performance.now() + 1500);
}

function viewportSize() {
  return { width: globe.container.clientWidth, height: globe.container.clientHeight };
}

function renderTooltip(event) {
  const title = document.createElement('strong');
  title.textContent = event.title;
  const detail = document.createElement('span');
  detail.textContent = event.detail;
  const time = document.createElement('span');
  time.textContent = `${formatTime(event.time)} (${formatAge(event.time)})`;
  tooltip.replaceChildren(title, detail, time);
}
