import * as THREE from 'three';
import { EARTH_RADIUS_KM, latLonToVector3 } from './geo.js';

const BASE_MARKER_RADIUS = 0.008;
const RECENT_MS = 60 * 60 * 1000;
const MAX_TRAIL_POINTS = 180;
const markerGeometry = new THREE.SphereGeometry(1, 12, 8);

// One layer per data source. Markers carry their event in `userData.event`
// so the tooltip can read it after raycasting.
export class MarkerLayer {
  constructor(source) {
    this.source = source;
    this.group = new THREE.Group();
    this.material = new THREE.MeshBasicMaterial({ color: source.color });
    this.trailPositions = [];
    this.trail = null;
  }

  setEvents(events) {
    this.group.clear();
    for (const event of events) {
      const altitude = event.altitudeKm ? event.altitudeKm / EARTH_RADIUS_KM : 0;
      const marker = new THREE.Mesh(markerGeometry, this.material);
      marker.position.copy(latLonToVector3(event.lat, event.lon, 1.004 + altitude));
      marker.userData = {
        event,
        baseScale: BASE_MARKER_RADIUS * event.size,
        recent: Date.now() - event.time.getTime() < RECENT_MS,
        phase: Math.random() * Math.PI * 2,
      };
      marker.scale.setScalar(marker.userData.baseScale);
      this.group.add(marker);
    }
    if (this.trail) this.group.add(this.trail);
  }

  // Keeps a line of the previous positions, used for moving objects like the ISS.
  extendTrail(event) {
    const altitude = (event.altitudeKm ?? 0) / EARTH_RADIUS_KM;
    this.trailPositions.push(latLonToVector3(event.lat, event.lon, 1.004 + altitude));
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
    for (const marker of this.group.children) {
      const { recent, baseScale, phase } = marker.userData;
      if (!recent) continue;
      marker.scale.setScalar(baseScale * (1 + 0.35 * Math.sin(time / 300 + phase)));
    }
  }
}
