import * as THREE from 'three';
import { Globe } from './globe.js';
import { MarkerLayer } from './markers.js';
import { loadSnapshotSources } from './snapshots.js';
import { sources } from './sources.js';

const globe = new Globe(document.getElementById('globe'));
const layers = [];
const layerList = document.getElementById('layers');
const tooltip = document.getElementById('tooltip');
const clock = document.getElementById('clock');
const snapshotCredits = document.getElementById('snapshot-credits');

sources.forEach(addLayer);
loadSnapshotSources()
  .then((snapshotSources) => snapshotSources.forEach(addLayer))
  .catch((error) => console.error('Could not load snapshot layers', error));

globe.loadBorders().catch((error) => console.error('Could not load country borders', error));
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

  const label = document.createElement('span');
  label.textContent = layer.source.label;

  const count = document.createElement('span');
  count.className = 'count';
  count.textContent = '...';

  const status = document.createElement('span');
  status.className = 'status';
  status.textContent = 'Loading';

  row.append(toggle, swatch, label, count, status);
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

globe.renderer.domElement.addEventListener('click', () => {
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

function formatTime(date) {
  return date.toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
}

function formatAge(date) {
  const signedMinutes = Math.round((Date.now() - date.getTime()) / 60000);
  const minutes = Math.abs(signedMinutes);
  const hours = Math.round(minutes / 60);
  const span = minutes < 60 ? `${minutes} min` : hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} days`;
  return signedMinutes < 0 ? `in ${span}` : `${span} ago`;
}
