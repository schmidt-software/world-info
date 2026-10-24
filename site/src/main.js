import * as THREE from 'three';
import { Globe } from './globe.js';
import { MarkerLayer } from './markers.js';
import { sources } from './sources.js';

const globe = new Globe(document.getElementById('globe'));
const layers = sources.map((source) => new MarkerLayer(source));
const layerList = document.getElementById('layers');
const tooltip = document.getElementById('tooltip');
const clock = document.getElementById('clock');

for (const layer of layers) {
  globe.scene.add(layer.group);
  layer.ui = createLayerRow(layer);
  globe.onFrame((time) => layer.animate(time));
  refresh(layer);
  setInterval(() => refresh(layer), layer.source.refreshMs);
}

globe.loadBorders().catch((error) => console.error('Could not load country borders', error));
globe.start();

setInterval(updateClock, 1000);
updateClock();

async function refresh(layer) {
  try {
    const events = await layer.source.fetch();
    layer.setEvents(events);
    if (layer.source.id === 'iss' && events[0]) layer.extendTrail(events[0]);
    layer.ui.count.textContent = events.length;
    layer.ui.status.textContent = `Updated ${formatTime(new Date())}`;
    layer.ui.status.classList.remove('error');
  } catch (error) {
    console.error(`Could not load ${layer.source.id}`, error);
    layer.ui.status.textContent = `Unavailable: ${error.message}`;
    layer.ui.status.classList.add('error');
  }
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
  return { count, status };
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
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}
