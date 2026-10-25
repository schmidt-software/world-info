// Country name labels on the globe, as a light HTML layer positioned every
// frame. Labels fade out towards the edge of the globe, small countries
// appear only when zoomed in far enough, and labels that would overlap a
// larger country's label are left out.

import * as THREE from 'three';
import { latLonToVector3 } from './geo.js';
import { labelAnchor } from './mapgeometry.js';

// A label is shown once its country is about this wide on screen.
const MIN_COUNTRY_PIXELS = 36;
// Rough text metrics, so no layout has to be measured every frame.
const CHAR_WIDTH = { large: 7.5, small: 6.5 };
const LABEL_HEIGHT = 16;
const LARGE_AREA = 300; // square degrees, about the size of Germany

const tempVector = new THREE.Vector3();
const cameraDirection = new THREE.Vector3();

export class CountryLabels {
  constructor(container, camera) {
    this.container = container;
    this.camera = camera;
    this.labels = [];
    this.enabled = true;
  }

  // Street maps carry their own place names; country labels are switched
  // off while they are shown.
  setEnabled(enabled) {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      for (const label of this.labels) {
        label.element.hidden = true;
        label.shown = false;
      }
    }
  }

  // `countries` is a GeoJSON FeatureCollection with a `name` property.
  setCountries(countries) {
    this.labels = countries.features.flatMap((country) => {
      const anchor = country.geometry && labelAnchor(country.geometry);
      if (!anchor || !country.properties.name) return [];
      const size = anchor.area >= LARGE_AREA ? 'large' : 'small';
      const element = document.createElement('span');
      element.className = `country-label ${size}`;
      element.textContent = country.properties.name;
      element.hidden = true;
      this.container.append(element);
      return [{
        element,
        position: latLonToVector3(anchor.lat, anchor.lon, 1),
        // Width of the country in radians, from its area in square degrees.
        extent: THREE.MathUtils.degToRad(Math.sqrt(anchor.area)),
        width: country.properties.name.length * CHAR_WIDTH[size],
        area: anchor.area,
        shown: false,
      }];
    }).sort((a, b) => b.area - a.area);
  }

  update() {
    if (!this.labels.length || !this.enabled) return;
    const { clientWidth: width, clientHeight: height } = this.container;
    const distance = this.camera.position.length();
    cameraDirection.copy(this.camera.position).normalize();
    // A surface point is visible when its cosine to the camera direction
    // exceeds 1 / distance (the horizon); labels fade in a bit above it.
    const horizon = 1 / distance;
    const pixelsPerRadian = height / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * (distance - 1));
    const placed = [];

    for (const label of this.labels) {
      const facing = label.position.dot(cameraDirection);
      const fade = THREE.MathUtils.clamp((facing - horizon) / 0.15, 0, 1);
      let visible = fade > 0 && label.extent * pixelsPerRadian >= MIN_COUNTRY_PIXELS;

      let x = 0;
      let y = 0;
      if (visible) {
        tempVector.copy(label.position).project(this.camera);
        x = (tempVector.x + 1) / 2 * width;
        y = (1 - tempVector.y) / 2 * height;
        const box = { left: x - label.width / 2, right: x + label.width / 2, top: y - LABEL_HEIGHT / 2, bottom: y + LABEL_HEIGHT / 2 };
        visible = box.right > 0 && box.left < width && box.bottom > 0 && box.top < height
          && !placed.some((other) => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top);
        if (visible) placed.push(box);
      }

      if (visible) {
        label.element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
        label.element.style.opacity = fade.toFixed(2);
      }
      if (visible !== label.shown) {
        label.element.hidden = !visible;
        label.shown = visible;
      }
    }
  }
}
