import * as THREE from 'three';
import { EARTH_RADIUS_KM, latLonToVector3 } from './geo.js';
import { clusterByGrid, isOccluded, pickNearest } from './screen.js';

// Marker radius in screen pixels for an event of size 1. Sizes are kept on
// screen at every zoom level; the vertex shader converts them to world units.
const BASE_PIXEL_RADIUS = 4;
const RECENT_MS = 60 * 60 * 1000;
const MAX_TRAIL_POINTS = 180;
// Layers marked with `cluster` (ships, aircraft) are grouped on screen below
// this slippy map zoom level, in cells of this many pixels.
const CLUSTER_BELOW_ZOOM = 8;
const CLUSTER_CELL_PX = 26;
const RECLUSTER_INTERVAL_MS = 250;
const HIGHLIGHT_MS = 4000;

const markerGeometry = new THREE.SphereGeometry(1, 12, 8);
const tempMatrix = new THREE.Matrix4();
const tempQuaternion = new THREE.Quaternion();
const tempScale = new THREE.Vector3();
const tempColor = new THREE.Color();
const tempVector = new THREE.Vector3();

// Shared by all marker materials and updated once per frame by updateMarkerView.
const viewUniforms = {
  uWorldPerPixel: { value: 0.001 },
  uGrowth: { value: 1 },
};

// Draws the instance sphere with a radius given in pixels: the instance
// matrix holds the pixel radius as its scale, and the shader multiplies it
// by the world size of a pixel at the marker's depth. The sphere is lifted
// by its radius along the surface normal, so ground markers sit on the
// globe instead of sinking into it.
function screenSizedMaterial() {
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, viewUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWorldPerPixel;\nuniform float uGrowth;')
      .replace('#include <project_vertex>', /* glsl */ `
        vec4 instanceCenter = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float pixelRadius = length(instanceMatrix[0].xyz) * uGrowth;
        float depth = -(viewMatrix * instanceCenter).z;
        float radius = pixelRadius * depth * uWorldPerPixel;
        vec3 center = instanceCenter.xyz + normalize(instanceCenter.xyz) * radius;
        vec4 mvPosition = viewMatrix * vec4(center + transformed * radius, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      `);
  };
  return material;
}

// Called once per frame before rendering, with the current camera altitude.
// Markers grow slightly (up to 60 percent) when zoomed in close.
export function updateMarkerView(camera, viewportHeight, altitude) {
  const fov = THREE.MathUtils.degToRad(camera.fov);
  viewUniforms.uWorldPerPixel.value = (2 * Math.tan(fov / 2)) / viewportHeight;
  const closeness = THREE.MathUtils.clamp(Math.log(2.2 / altitude) / Math.log(2.2 / 0.002), 0, 1);
  viewUniforms.uGrowth.value = 1 + 0.6 * closeness;
}

// Current growth factor, for picking with the same radius that is drawn.
export function markerGrowth() {
  return viewUniforms.uGrowth.value;
}

// One layer per data source, drawn as a single InstancedMesh so that layers
// with thousands of objects (ships, aircraft) stay cheap to render. What is
// drawn are `items`: single events, or clusters of events when zoomed out.
export class MarkerLayer {
  constructor(source) {
    this.source = source;
    this.group = new THREE.Group();
    this.material = screenSizedMaterial();
    this.events = [];
    this.entries = [];
    this.items = [];
    this.mesh = null;
    this.pulsing = [];
    this.highlight = null;
    this.trailPositions = [];
    this.trail = null;
    this.clustered = false;
    this.lastClusterAt = 0;
    this.lastClusterView = null;
  }

  // `events` stays the plain list (read by the event list); `entries` pairs
  // each event with its position on the globe.
  setEvents(events) {
    this.events = events;
    this.entries = events.map((event) => ({ event, position: markerPosition(event) }));
    this.lastClusterView = null;
    this.rebuild();
  }

  // The items currently drawn: the events, or clusters when the layer
  // groups markers at this zoom level (see updateView).
  rebuild(clusters = null) {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.dispose();
    }
    this.items = clusters ?? this.entries.map(({ event, position }) => ({
      event, position, pixelRadius: BASE_PIXEL_RADIUS * event.size,
    }));
    this.pulsing = [];
    this.mesh = new THREE.InstancedMesh(markerGeometry, this.material, Math.max(this.items.length, 1));
    this.mesh.count = this.items.length;
    // Picking works in screen space (pick), not with three.js raycasting.
    this.mesh.raycast = () => {};
    this.mesh.frustumCulled = false;

    const now = Date.now();
    this.items.forEach((item, index) => {
      this.writeMatrix(index, item.pixelRadius);
      // Events may carry their own color, e.g. the awareness level of a warning.
      this.mesh.setColorAt(index, tempColor.set(item.event.color ?? this.source.color));
      // Only past events can be recent; events that start later (for example
      // concerts within the next hour) must not pulse.
      const age = now - item.event.time.getTime();
      if (!item.cluster && this.source.pulse !== false && age >= 0 && age < RECENT_MS) {
        this.pulsing.push({ index, phase: Math.random() * Math.PI * 2 });
      }
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.group.add(this.mesh);
  }

  writeMatrix(index, pixelRadius) {
    tempMatrix.compose(this.items[index].position, tempQuaternion, tempScale.setScalar(pixelRadius));
    this.mesh.setMatrixAt(index, tempMatrix);
  }

  // Groups dense layers into clusters while zoomed out. Reclustering is
  // throttled, because it rebuilds the mesh.
  updateView(camera, viewport, zoomLevel, time) {
    if (!this.source.cluster || !this.group.visible) return;
    const shouldCluster = zoomLevel < CLUSTER_BELOW_ZOOM;
    if (!shouldCluster) {
      if (this.clustered) {
        this.clustered = false;
        this.rebuild();
      }
      return;
    }
    const view = `${camera.position.x.toFixed(4)},${camera.position.y.toFixed(4)},${camera.position.z.toFixed(4)},${viewport.width},${viewport.height}`;
    if (view === this.lastClusterView || time - this.lastClusterAt < RECLUSTER_INTERVAL_MS) return;
    this.lastClusterView = view;
    this.lastClusterAt = time;
    this.clustered = true;
    this.rebuild(this.clusterItems(camera, viewport));
  }

  clusterItems(camera, viewport) {
    const visible = [];
    const hidden = [];
    this.entries.forEach(({ position }, index) => {
      if (isOccluded(camera.position, position)) hidden.push(index);
      else visible.push({ ...toScreen(position, camera, viewport), index });
    });
    const groups = clusterByGrid(visible, CLUSTER_CELL_PX);
    // Events on the far side stay single; the globe hides them anyway.
    return [...groups, ...hidden.map((index) => [index])].map((indices) => {
      if (indices.length === 1) {
        const { event, position } = this.entries[indices[0]];
        return { event, position, pixelRadius: BASE_PIXEL_RADIUS * event.size };
      }
      return this.clusterItem(indices);
    });
  }

  clusterItem(indices) {
    const members = indices.map((index) => this.entries[index]);
    const position = new THREE.Vector3();
    for (const member of members) position.add(member.position);
    position.divideScalar(members.length);
    // Keep the cluster at the members' height, not inside the globe.
    const radius = members.reduce((sum, member) => sum + member.position.length(), 0) / members.length;
    position.setLength(radius);
    const newest = members.reduce((a, b) => (a.event.time > b.event.time ? a : b)).event;
    const noun = this.source.clusterNoun ?? 'events';
    return {
      cluster: true,
      position,
      members: members.map((member) => member.event),
      pixelRadius: Math.min(BASE_PIXEL_RADIUS * (1 + 0.45 * Math.log2(members.length)), 16),
      event: {
        id: `cluster:${members[0].event.id}`,
        title: `${members.length} ${noun}`,
        detail: 'Click or zoom in to see them one by one',
        time: newest.time,
        color: this.source.color,
      },
    };
  }

  // The item under the screen point (x, y), with its distance in pixels, or
  // null. Items hidden behind the globe cannot be picked.
  pick(camera, viewport, x, y, growth) {
    if (!this.group.visible || !this.mesh) return null;
    const candidates = [];
    this.items.forEach((item, index) => {
      if (isOccluded(camera.position, item.position)) return;
      const screen = toScreen(item.position, camera, viewport);
      if (screen.behind) return;
      candidates.push({ ...screen, radius: item.pixelRadius * growth, index });
    });
    const hit = pickNearest(candidates, x, y);
    return hit ? { item: this.items[hit.index], distance: Math.hypot(hit.x - x, hit.y - y) } : null;
  }

  // Makes the event's marker pulse strongly for a few seconds, e.g. after
  // flying to it from the event list.
  highlightEvent(eventId, time) {
    this.highlight = { eventId, until: time + HIGHLIGHT_MS };
  }

  // Keeps a line of the previous positions, used for moving objects like the ISS.
  extendTrail(event) {
    this.trailPositions.push(markerPosition(event));
    if (this.trailPositions.length > MAX_TRAIL_POINTS) this.trailPositions.shift();
    if (this.trailPositions.length < 2) return;

    if (!this.trail) {
      // The buffer is allocated at full size once; the draw range grows with it.
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(MAX_TRAIL_POINTS * 3), 3));
      this.trail = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({ color: this.source.color, transparent: true, opacity: 0.6 }),
      );
      this.trail.frustumCulled = false;
      this.group.add(this.trail);
    }
    const attribute = this.trail.geometry.getAttribute('position');
    this.trailPositions.forEach((point, index) => attribute.setXYZ(index, point.x, point.y, point.z));
    attribute.needsUpdate = true;
    this.trail.geometry.setDrawRange(0, this.trailPositions.length);
  }

  // Recent events pulse so that fresh activity stands out; a highlighted
  // event pulses larger until its highlight ends.
  animate(time) {
    if (!this.mesh) return;
    let changed = false;
    for (const { index, phase } of this.pulsing) {
      this.writeMatrix(index, this.items[index].pixelRadius * (1 + 0.35 * Math.sin(time / 300 + phase)));
      changed = true;
    }
    if (this.highlight) {
      const index = this.items.findIndex((item) => item.event.id === this.highlight.eventId);
      const active = time < this.highlight.until;
      if (index >= 0) {
        const factor = active ? 2.2 + 0.8 * Math.sin(time / 120) : 1;
        this.writeMatrix(index, this.items[index].pixelRadius * factor);
        changed = true;
      }
      if (!active) this.highlight = null;
    }
    if (changed) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

function toScreen(position, camera, viewport) {
  tempVector.copy(position).project(camera);
  return {
    x: (tempVector.x + 1) / 2 * viewport.width,
    y: (1 - tempVector.y) / 2 * viewport.height,
    behind: tempVector.z > 1,
  };
}

// Ground events sit on the surface (the shader lifts each sphere by its
// radius); objects with an altitude, such as the ISS, are placed above it.
function markerPosition(event) {
  const altitude = (event.altitudeKm ?? 0) / EARTH_RADIUS_KM;
  return latLonToVector3(event.lat, event.lon, 1 + altitude);
}
