// Zoom for the globe, from the whole Earth down to about 1 km above the
// surface. OrbitControls only rotates; this module handles wheel, pinch,
// buttons and keys, keeps the point under the pointer in place while
// zooming, and adapts rotation speed and depth range to the altitude.
//
// Altitudes are in globe radii above the surface, see altitude.js.

import * as THREE from 'three';
import {
  altitudeAfterWheel,
  clampAltitude,
  DEFAULT_ALTITUDE,
  rotateSpeedFor,
  zoomLevelFor,
} from './altitude.js';

// Share of the remaining zoom applied per frame; gives a short ease-out.
const SMOOTHING = 0.25;
const BUTTON_STEP = 2;
const ANCHOR_ITERATIONS = 3;

const tempRay = new THREE.Ray();
const tempNdc = new THREE.Vector2();
const tempQuaternion = new THREE.Quaternion();
const origin = new THREE.Vector3();
const unitSphere = new THREE.Sphere(origin, 1);
const tempHit = new THREE.Vector3();

export class ZoomController {
  constructor(globe) {
    this.globe = globe;
    this.camera = globe.camera;
    this.element = globe.renderer.domElement;
    this.targetAltitude = this.altitude;
    this.anchor = null;
    this.touches = new Map();
    this.pinchDistance = null;

    globe.controls.enableZoom = false;

    this.element.addEventListener('wheel', (event) => this.onWheel(event), { passive: false });
    this.element.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.element.addEventListener('pointermove', (event) => this.onPointerMove(event));
    for (const type of ['pointerup', 'pointercancel']) {
      this.element.addEventListener(type, (event) => this.onPointerUp(event));
    }
    window.addEventListener('keydown', (event) => this.onKey(event));

    globe.onFrame(() => this.update());
  }

  get altitude() {
    return this.camera.position.length() - 1;
  }

  get zoomLevel() {
    return zoomLevelFor(this.altitude);
  }

  zoomBy(factor, anchor = null) {
    this.targetAltitude = clampAltitude(this.targetAltitude * factor);
    this.anchor = anchor;
    this.stopAutoRotate();
  }

  zoomIn() {
    this.zoomBy(1 / BUTTON_STEP);
  }

  zoomOut() {
    this.zoomBy(BUTTON_STEP);
  }

  // Back to the overview altitude; the current view direction is kept.
  reset() {
    this.targetAltitude = DEFAULT_ALTITUDE;
    this.anchor = null;
  }

  stopAutoRotate() {
    this.globe.controls.autoRotate = false;
  }

  onWheel(event) {
    event.preventDefault();
    // Trackpads report pinch gestures as wheel events with ctrlKey set and
    // small deltas; scale them up so pinching feels like the wheel.
    const delta = event.ctrlKey ? event.deltaY * 8 : event.deltaY;
    this.targetAltitude = altitudeAfterWheel(this.targetAltitude, delta);
    this.anchor = { x: event.clientX, y: event.clientY };
    this.stopAutoRotate();
  }

  onPointerDown(event) {
    if (event.pointerType !== 'touch') return;
    this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.pinchDistance = this.touches.size === 2 ? this.touchDistance() : null;
  }

  onPointerMove(event) {
    if (!this.touches.has(event.pointerId)) return;
    this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.touches.size !== 2 || !this.pinchDistance) return;
    const distance = this.touchDistance();
    const [a, b] = [...this.touches.values()];
    this.zoomBy(this.pinchDistance / distance, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    this.pinchDistance = distance;
  }

  onPointerUp(event) {
    this.touches.delete(event.pointerId);
    this.pinchDistance = null;
  }

  touchDistance() {
    const [a, b] = [...this.touches.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  onKey(event) {
    if (event.target.closest?.('input, select, textarea')) return;
    if (event.key === '+' || event.key === '=') this.zoomIn();
    else if (event.key === '-' || event.key === '_') this.zoomOut();
  }

  update() {
    const current = this.altitude;
    const remaining = Math.log(this.targetAltitude / current);
    if (Math.abs(remaining) > 1e-4) {
      const next = current * Math.exp(remaining * SMOOTHING);
      this.moveTo(next);
    } else {
      this.anchor = null;
    }
    this.globe.controls.rotateSpeed = rotateSpeedFor(this.altitude);
    this.updateDepthRange();
  }

  // Changes the altitude; with an anchor, the globe is rotated afterwards so
  // that the surface point under the anchor stays under it.
  moveTo(altitude) {
    const before = this.anchor && this.surfacePointAt(this.anchor);
    this.camera.position.setLength(1 + altitude);
    this.camera.lookAt(origin);
    this.camera.updateMatrixWorld();
    if (!before) return;
    // Re-aiming the camera at the globe centre also rolls it slightly, so one
    // correction leaves a small offset away from the screen centre; a few
    // iterations converge to well below a pixel.
    for (let i = 0; i < ANCHOR_ITERATIONS; i++) {
      const after = this.surfacePointAt(this.anchor);
      if (!after) return;
      tempQuaternion.setFromUnitVectors(after, before);
      this.camera.position.applyQuaternion(tempQuaternion);
      this.camera.lookAt(origin);
      this.camera.updateMatrixWorld();
    }
  }

  // Close to the surface a fixed near plane of 0.01 radii (64 km) would cut
  // off the ground, and a tiny fixed one would waste depth precision at the
  // overview, so both planes follow the altitude.
  updateDepthRange() {
    const altitude = this.altitude;
    const near = Math.max(altitude * 0.1, 0.000005);
    const far = altitude + 3;
    if (Math.abs(near / this.camera.near - 1) > 0.05 || Math.abs(far - this.camera.far) > 0.1) {
      this.camera.near = near;
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }
  }

  // Intersection of the view ray through a screen point with the unit
  // sphere, as a unit vector, or null when the ray misses the globe.
  surfacePointAt({ x, y }) {
    const rect = this.element.getBoundingClientRect();
    tempNdc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    tempRay.origin.setFromMatrixPosition(this.camera.matrixWorld);
    tempRay.direction.set(tempNdc.x, tempNdc.y, 0.5).unproject(this.camera).sub(tempRay.origin).normalize();
    const hit = tempRay.intersectSphere(unitSphere, tempHit);
    return hit ? hit.clone().normalize() : null;
  }
}
