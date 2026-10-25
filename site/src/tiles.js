// Slippy map tiles on the globe, loaded with three-slippy-map-globe: only the
// tiles in view are requested, at a zoom level that follows the camera
// altitude. Each TileLayer serves one provider and fades in above its
// minimum zoom level, on top of the map-style globe.

import * as THREE from 'three';
import SlippyMapGlobe from 'three-slippy-map-globe';
import { zoomLevelFor } from './altitude.js';

// The library picks the first level whose threshold is below the altitude.
// Based on zoomLevelFor, shifted by half a level: tiles then show at 180 to
// 360 pixels at the equator. Mercator tiles get narrower towards the poles
// (about 120 to 230 pixels in central Europe), so a finer choice would
// double the requests there. The library's defaults would magnify tiles
// about four times at street level.
const THRESHOLDS = Array.from({ length: 30 }, (_, level) => (26.5 / Math.SQRT2) / 2 ** level);
// Tiles are sphere segments; one segment per degree keeps their facets close
// enough to the globe that it does not show through.
const CURVATURE_DEGREES = 1;
// Tiles fade in over one zoom level around the provider's minimum zoom.
const FADE_LEVELS = 1;
// Tile requests follow the camera, but sparingly: while it moves within one
// zoom level at most every POV_INTERVAL_MS, and after a level change only
// once it has rested for SETTLE_MS. Flying or zooming through levels would
// otherwise request every intermediate level, which the OSM tile policy
// does not allow (only tiles actually viewed may be fetched).
const POV_INTERVAL_MS = 300;
const SETTLE_MS = 250;

// The tile group is rotated (see TileLayer), so normals are taken to world
// space before they are compared with the sun direction.
const tileVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec2 vUv;
  void main() {
    vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Same day/night shading as the globe, so tiles darken on the night side.
// Providers set how dark: street maps stay readable, satellite imagery
// matches the globe.
const tileFragmentShader = /* glsl */ `
  uniform sampler2D map;
  uniform vec3 sunDirection;
  uniform float opacity;
  uniform float nightFactor;
  varying vec3 vNormal;
  varying vec2 vUv;
  void main() {
    float light = dot(normalize(vNormal), sunDirection);
    float day = smoothstep(-0.12, 0.12, light);
    vec3 dayColor = texture2D(map, vUv).rgb;
    vec3 nightColor = dayColor * nightFactor + vec3(0.0, 0.004, 0.012);
    gl_FragColor = vec4(mix(nightColor, dayColor, day), opacity);
  }
`;

// A provider: { id, minZoom, maxZoom, nightFactor, url(x, y, z) }.
export class TileLayer {
  constructor(globe, provider) {
    this.globe = globe;
    this.provider = provider;
    this.opacity = { value: 0 };
    this.lastPov = 0;
    this.lastMove = 0;
    this.lastCamera = new THREE.Vector3();
    this.previousCamera = new THREE.Vector3();
    this.requestedLevel = -1;

    this.tiles = new SlippyMapGlobe(1, {
      tileUrl: (x, y, z) => provider.url(x, y, z),
      minLevel: provider.minLevel ?? 0,
      maxLevel: provider.maxZoom,
    });
    this.tiles.thresholds = THRESHOLDS;
    // The library puts (0, 0) on +Z and 90 degrees east on +X; the globe
    // (geo.js) puts (0, 0) on +X and 90 degrees east on -Z. A quarter turn
    // around the polar axis aligns both.
    this.tiles.rotation.y = Math.PI / 2;
    this.tiles.curvatureResolution = CURVATURE_DEGREES;
    this.tiles.visible = false;
    // The library gives each loaded tile a lit material; our scene has no
    // lights, so tiles are restyled with the globe's shading before they
    // are added.
    const add = this.tiles.add.bind(this.tiles);
    this.tiles.add = (...objects) => add(...objects.map((object) => this.restyle(object)));
    globe.scene.add(this.tiles);
  }

  restyle(object) {
    const texture = object.material?.map;
    if (!texture || object.userData.restyled) return object;
    // No color space conversion, as for the globe texture: the shader writes
    // the tile colors unchanged.
    texture.colorSpace = THREE.NoColorSpace;
    texture.anisotropy = this.globe.renderer.capabilities.getMaxAnisotropy();
    const depthWrite = object.material.depthWrite;
    object.material.dispose();
    object.material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: texture },
        sunDirection: { value: this.globe.sunDirection },
        opacity: this.opacity,
        nightFactor: { value: this.provider.nightFactor ?? 0.5 },
      },
      vertexShader: tileVertexShader,
      fragmentShader: tileFragmentShader,
      transparent: true,
      depthWrite,
    });
    object.userData.restyled = true;
    return object;
  }

  // Opacity for a zoom level: 0 below the provider's minimum zoom, 1 one
  // level above it.
  opacityAt(zoomLevel) {
    return THREE.MathUtils.clamp((zoomLevel - this.provider.minZoom + FADE_LEVELS / 2) / FADE_LEVELS, 0, 1);
  }

  get fullyVisible() {
    return this.tiles.visible && this.opacity.value >= 1;
  }

  // Called every frame. `enabled` is false when another view is chosen; a
  // disabled or faded-out layer requests nothing.
  update(camera, enabled, time) {
    const opacity = enabled ? this.opacityAt(zoomLevelFor(camera.position.length() - 1)) : 0;
    this.opacity.value = opacity;
    const visible = opacity > 0;
    if (visible !== this.tiles.visible) {
      this.tiles.visible = visible;
      // Free the textures of a layer that is no longer shown; a layer that
      // appears must ask for tiles even if the camera has not moved.
      if (visible) this.lastCamera.set(0, 0, 0);
      else this.tiles.clearTiles();
    }
    if (!visible) return;

    // OrbitControls recomputes the camera position every frame, which leaves
    // rounding noise even at rest; movement is measured against a tolerance
    // that scales with the altitude.
    const altitude = camera.position.length() - 1;
    const tolerance = altitude * 1e-4;
    if (camera.position.distanceTo(this.previousCamera) > tolerance) {
      this.previousCamera.copy(camera.position);
      this.lastMove = time;
    }
    if (camera.position.distanceTo(this.lastCamera) <= tolerance) return;
    const level = levelFor(altitude, this.provider);
    const sameLevel = level === this.requestedLevel;
    const resting = time - this.lastMove >= SETTLE_MS;
    if ((sameLevel && time - this.lastPov >= POV_INTERVAL_MS) || resting) {
      this.tiles.updatePov(camera);
      this.lastCamera.copy(camera.position);
      this.lastPov = time;
      this.requestedLevel = level;
    }
  }
}

// The level the library picks for an altitude (first threshold below it).
function levelFor(altitude, provider) {
  const index = THRESHOLDS.findIndex((threshold) => threshold <= altitude);
  return Math.min(provider.maxZoom, Math.max(provider.minLevel ?? 0, index < 0 ? THRESHOLDS.length : index));
}

export const OPENSTREETMAP = {
  id: 'osm',
  minZoom: 9,
  maxZoom: 19,
  nightFactor: 0.75,
  url: (x, y, z) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
};
