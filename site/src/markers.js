import * as THREE from 'three';
import { EARTH_RADIUS_KM, latLonToVector3 } from './geo.js';

const BASE_MARKER_RADIUS = 0.008;
const RECENT_MS = 60 * 60 * 1000;
const MAX_TRAIL_POINTS = 180;
const markerGeometry = new THREE.SphereGeometry(1, 12, 8);
const tempMatrix = new THREE.Matrix4();
const tempQuaternion = new THREE.Quaternion();
const tempScale = new THREE.Vector3();
const tempColor = new THREE.Color();

// One layer per data source, drawn as a single InstancedMesh so that layers
// with thousands of objects (ships, aircraft) stay cheap to render.
// The instance id of a raycast hit indexes into `events`.
export class MarkerLayer {
  constructor(source) {
    this.source = source;
    this.group = new THREE.Group();
    // White, because the per-instance color is multiplied with it.
    this.material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.events = [];
    this.positions = [];
    this.scales = [];
    this.mesh = null;
    this.pulsing = [];
    this.trailPositions = [];
    this.trail = null;
  }

  setEvents(events) {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.dispose();
    }
    this.events = events;
    this.pulsing = [];
    this.mesh = new THREE.InstancedMesh(markerGeometry, this.material, Math.max(events.length, 1));
    this.mesh.count = events.length;
    this.mesh.userData.layer = this;
    this.positions = events.map((event) => markerPosition(event));
    this.scales = events.map((event) => BASE_MARKER_RADIUS * event.size);

    const now = Date.now();
    events.forEach((event, index) => {
      this.writeMatrix(index, this.scales[index]);
      // Events may carry their own color, e.g. the awareness level of a warning.
      this.mesh.setColorAt(index, tempColor.set(event.color ?? this.source.color));
      // Only past events can be recent; events that start later (for example
      // concerts within the next hour) must not pulse.
      const age = now - event.time.getTime();
      if (this.source.pulse !== false && age >= 0 && age < RECENT_MS) {
        this.pulsing.push({ index, phase: Math.random() * Math.PI * 2 });
      }
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.computeBoundingSphere();
    this.group.add(this.mesh);
  }

  eventAt(instanceId) {
    return this.events[instanceId] ?? null;
  }

  writeMatrix(index, scale) {
    tempMatrix.compose(this.positions[index], tempQuaternion, tempScale.setScalar(scale));
    this.mesh.setMatrixAt(index, tempMatrix);
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

  // Recent events pulse so that fresh activity stands out.
  animate(time) {
    if (!this.mesh || this.pulsing.length === 0) return;
    for (const { index, phase } of this.pulsing) {
      this.writeMatrix(index, this.scales[index] * (1 + 0.35 * Math.sin(time / 300 + phase)));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

function markerPosition(event) {
  const altitude = (event.altitudeKm ?? 0) / EARTH_RADIUS_KM;
  return latLonToVector3(event.lat, event.lon, 1.004 + altitude);
}
