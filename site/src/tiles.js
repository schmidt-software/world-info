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
// Tiles fade in over the zoom level after their minimum zoom.
const FADE_LEVELS = 1;
// Tile requests follow the camera, but sparingly: within one zoom level at
// most every POV_INTERVAL_MS, also while the globe turns; a new level
// (including the first one after a layer appears) only once the altitude
// has been stable for SETTLE_MS. Flying or zooming through levels would
// otherwise request every intermediate level, which the OSM tile policy
// does not allow (only tiles actually viewed may be fetched). Rotation does
// not delay a new level, so the auto-rotating globe still gets its tiles.
const POV_INTERVAL_MS = 300;
const SETTLE_MS = 250;
// Budgets (#32): at most this many tile textures per layer; when a session
// of zooming collects more, the layer is cleared and reloads its view from
// the browser cache. Each tile fades in over TILE_FADE_MS when it arrives.
const MAX_TILE_TEXTURES = 150;
const TILE_FADE_MS = 250;
// At the overview the globe fills only part of the screen, so zoom level 3
// (about 50 tiles for the visible hemisphere) is as sharp as it can show;
// the altitude formula alone would pick level 4 with about 160 tiles.
const OVERVIEW_ALTITUDE = 1;
const OVERVIEW_MAX_LEVEL = 3;
// A provider counts as failed after this many errors within FAILURE_WINDOW_MS
// when they outnumber its successes; it is tried again after RETRY_MS.
const FAILURE_COUNT = 5;
const FAILURE_WINDOW_MS = 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;

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
  uniform float fade;
  uniform float nightFactor;
  varying vec3 vNormal;
  varying vec2 vUv;
  void main() {
    float light = dot(normalize(vNormal), sunDirection);
    float day = smoothstep(-0.12, 0.12, light);
    vec3 dayColor = texture2D(map, vUv).rgb;
    vec3 nightColor = dayColor * nightFactor + vec3(0.0, 0.004, 0.012);
    gl_FragColor = vec4(mix(nightColor, dayColor, day), opacity * fade);
  }
`;

// A provider: { id, maxZoom, nightFactor, url(x, y, z), above? }. Layers of
// providers with `above` are drawn over the others where both overlap
// while fading.
export class TileLayer {
  constructor(globe, provider) {
    this.globe = globe;
    this.provider = provider;
    this.opacity = { value: 0 };
    this.lastPov = 0;
    this.lastAltitudeChange = 0;
    this.previousAltitude = 0;
    this.lastCamera = new THREE.Vector3();
    this.requestedLevel = -1;
    this.fading = new Set();
    this.results = [];
    this.failedAt = null;
    layers.add(this);

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
    // The library adds a black sphere just below the surface against depth
    // artefacts and toggles its visibility itself. Our globe already lies
    // underneath, and the black sphere would show through where Mercator
    // tiles end (above about 85 degrees), so it is made to draw nothing.
    const backLayer = this.tiles.children[0];
    backLayer.material.colorWrite = false;
    backLayer.material.depthWrite = false;
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
        fade: { value: 0 },
        nightFactor: { value: this.provider.nightFactor ?? 0.5 },
      },
      vertexShader: tileVertexShader,
      fragmentShader: tileFragmentShader,
      transparent: true,
      depthWrite,
      polygonOffset: Boolean(this.provider.above),
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    });
    // The library frees material.map when it drops a tile; this material
    // keeps the texture in a uniform, so it frees it itself. Without this,
    // every dropped tile left its texture on the GPU (595 textures after
    // three zoom sessions).
    object.material.addEventListener('dispose', () => texture.dispose());
    object.renderOrder = this.provider.above ? 2 : 1;
    object.userData.restyled = true;
    object.userData.fadeStart = null;
    this.fading.add(object);
    return object;
  }

  // Opacity for a zoom level: 0 up to `minZoom`, 1 from one level above it.
  static opacityAt(zoomLevel, minZoom) {
    return THREE.MathUtils.clamp((zoomLevel - minZoom) / FADE_LEVELS, 0, 1);
  }

  get fullyVisible() {
    return this.tiles.visible && this.opacity.value >= 1;
  }

  // Tiles fade in when they arrive instead of popping up.
  advanceFades(time) {
    for (const tile of this.fading) {
      tile.userData.fadeStart ??= time;
      const fade = Math.min(1, (time - tile.userData.fadeStart) / TILE_FADE_MS);
      tile.material.uniforms.fade.value = fade;
      if (fade >= 1) this.fading.delete(tile);
    }
  }

  // The library keeps tiles of coarser levels while zooming in. Past the
  // budget the layer is cleared; the view reloads from the browser cache.
  enforceBudget() {
    const tiles = this.tiles.children.length - 1; // minus the back sphere
    if (tiles <= MAX_TILE_TEXTURES) return;
    this.tiles.clearTiles();
    this.fading.clear();
    this.lastCamera.set(0, 0, 0);
    this.requestedLevel = -1;
  }

  // Counts arrivals and errors of this layer's tiles over the last minute.
  recordResult(ok) {
    const now = performance.now();
    this.results.push({ ok, at: now });
    this.results = this.results.filter((result) => now - result.at < FAILURE_WINDOW_MS);
    const errors = this.results.filter((result) => !result.ok).length;
    if (this.failedAt === null && errors >= FAILURE_COUNT && errors * 2 > this.results.length) {
      this.failedAt = now;
      console.warn(`Map tiles from ${this.provider.id} keep failing; switching to another view for a while.`);
    }
  }

  // A failed provider is retried after RETRY_MS. Its failed tiles are
  // dropped then, because the library never asks for a failed tile again.
  get failed() {
    if (this.failedAt === null) return false;
    if (performance.now() - this.failedAt < RETRY_MS) return true;
    this.failedAt = null;
    this.results = [];
    this.tiles.clearTiles();
    return false;
  }

  // Start of this provider's tile URLs, to attribute loads to the layer.
  urlPrefix() {
    return this.provider.url(0, 0, 0).replace(/0\/0\/0[^/]*$/, '');
  }

  // Called every frame with the zoom level from which the layer fades in
  // (see mapviews.js), or null when its view is off. A layer that is off or
  // faded out requests nothing.
  update(camera, minZoom, time) {
    const opacity = minZoom === null ? 0 : TileLayer.opacityAt(zoomLevelFor(camera.position.length() - 1), minZoom);
    this.opacity.value = opacity;
    const visible = opacity > 0;
    if (visible !== this.tiles.visible) {
      this.tiles.visible = visible;
      // Free the textures of a layer that is no longer shown; a layer that
      // appears must ask for tiles even if the camera has not moved.
      if (visible) {
        this.lastCamera.set(0, 0, 0);
        this.requestedLevel = -1;
      } else {
        this.tiles.clearTiles();
      }
    }
    if (!visible) return;

    this.advanceFades(time);
    this.enforceBudget();

    // OrbitControls recomputes the camera position every frame, which leaves
    // rounding noise even at rest; changes are measured against tolerances
    // that scale with the altitude.
    const altitude = camera.position.length() - 1;
    this.tiles.maxLevel = maxLevelAt(altitude, this.provider);
    if (Math.abs(altitude - this.previousAltitude) > altitude * 1e-3) {
      this.previousAltitude = altitude;
      this.lastAltitudeChange = time;
    }
    if (camera.position.distanceTo(this.lastCamera) <= altitude * 1e-4) return;
    const level = levelFor(altitude, this.provider);
    const sameLevel = level === this.requestedLevel;
    const altitudeStable = time - this.lastAltitudeChange >= SETTLE_MS;
    if ((sameLevel && time - this.lastPov >= POV_INTERVAL_MS) || (!sameLevel && altitudeStable)) {
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
  return Math.min(maxLevelAt(altitude, provider), Math.max(provider.minLevel ?? 0, index < 0 ? THRESHOLDS.length : index));
}

function maxLevelAt(altitude, provider) {
  return altitude > OVERVIEW_ALTITUDE ? Math.min(provider.maxZoom, OVERVIEW_MAX_LEVEL) : provider.maxZoom;
}

// Tile loads go through three.js's default loading manager; its callbacks
// tell each layer which of its tiles arrived and which failed. The manager
// reports the end of every load through onProgress, after onError for a
// failed one, so failed URLs are remembered and not counted twice.
const layers = new Set();
const failedUrls = new Set();
THREE.DefaultLoadingManager.onError = (url) => {
  failedUrls.add(url);
  layerFor(url)?.recordResult(false);
};
THREE.DefaultLoadingManager.onProgress = (url) => {
  if (failedUrls.delete(url)) return;
  layerFor(url)?.recordResult(true);
};

function layerFor(url) {
  for (const layer of layers) {
    if (url.startsWith(layer.urlPrefix())) return layer;
  }
  return null;
}
