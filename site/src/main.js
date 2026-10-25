import * as THREE from 'three';
import { EventList } from './eventlist.js';
import { formatAge, formatTime } from './format.js';
import { Globe } from './globe.js';
import { CountryLabels } from './labels.js';
import { MarkerLayer } from './markers.js';
import { loadSnapshotSources } from './snapshots.js';
import { sources } from './sources.js';
import { ZoomController } from './zoom.js';

const globe = new Globe(document.getElementById('globe'));
const layers = [];
const layerList = document.getElementById('layers');
const tooltip = document.getElementById('tooltip');
const clock = document.getElementById('clock');
const snapshotCredits = document.getElementById('snapshot-credits');
const eventList = new EventList({ getLayers: () => layers });
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

// Tooltip: the globe itself is part of the raycast so that markers on the far
// side are not picked through it.
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hoveredEvent = null;

globe.renderer.domElement.addEventListener('pointermove', (domEvent) => {
  pointer.set(
    (domEvent.clientX / window.innerWidth) * 2 - 1,
    -(domEvent.clientY / window.innerHeight) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, globe.camera);
  const targets = [globe.globeMesh, ...layers.filter((layer) => layer.group.visible).map((layer) => layer.group)];
  const hit = raycaster.intersectObjects(targets, true).find((intersection) => intersection.object.isMesh);
  hoveredEvent = hit?.object.userData.layer?.eventAt(hit.instanceId) ?? null;

  if (!hoveredEvent) {
    tooltip.hidden = true;
    globe.renderer.domElement.style.cursor = '';
    return;
  }
  renderTooltip(hoveredEvent);
  tooltip.style.left = `${Math.min(domEvent.clientX + 14, window.innerWidth - 300)}px`;
  tooltip.style.top = `${domEvent.clientY + 14}px`;
  tooltip.hidden = false;
  globe.renderer.domElement.style.cursor = hoveredEvent.url ? 'pointer' : '';
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
  if (moved) return;
  if (hoveredEvent?.url) window.open(hoveredEvent.url, '_blank', 'noopener');
});

function renderTooltip(event) {
  const title = document.createElement('strong');
  title.textContent = event.title;
  const detail = document.createElement('span');
  detail.textContent = event.detail;
  const time = document.createElement('span');
  time.textContent = `${formatTime(event.time)} (${formatAge(event.time)})`;
  tooltip.replaceChildren(title, detail, time);
}
