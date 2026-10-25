import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { feature, mesh } from 'topojson-client';
import { DEFAULT_ALTITUDE, MAX_ALTITUDE, MIN_ALTITUDE } from './altitude.js';
import { latLonToVector3, subsolarPoint } from './geo.js';
import { drawMapTexture, MAP_COLORS } from './mapstyle.js';

// Natural Earth 1:50m: detailed enough for the zoomed-in overview, about
// 240 KB compressed. It contains both the land and the country outlines.
const WORLD_ATLAS_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json';

const globeVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec2 vUv;
  void main() {
    vNormal = normalize(normal);
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// The globe is never rotated (the camera orbits instead), so object-space
// normals can be compared with the world-space sun direction directly.
// The night side keeps half of the map colors, so land and water stay
// distinguishable there as well.
const globeFragmentShader = /* glsl */ `
  uniform vec3 sunDirection;
  uniform sampler2D map;
  varying vec3 vNormal;
  varying vec2 vUv;
  void main() {
    float light = dot(normalize(vNormal), sunDirection);
    float day = smoothstep(-0.12, 0.12, light);
    vec3 dayColor = texture2D(map, vUv).rgb;
    vec3 nightColor = dayColor * 0.5 + vec3(0.0, 0.004, 0.012);
    gl_FragColor = vec4(mix(nightColor, dayColor, day), 1.0);
  }
`;

const atmosphereFragmentShader = /* glsl */ `
  uniform float opacity;
  varying vec3 vNormal;
  void main() {
    float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
    gl_FragColor = vec4(0.3, 0.6, 1.0, 1.0) * intensity * opacity;
  }
`;

// Borders and coastlines float slightly above the surface (about 600 m) so
// they are not hidden by the globe. The globe is finely tessellated so that
// its flat facets stay below this height when zoomed in close.
const LINE_RADIUS = 1.0001;
const GLOBE_SEGMENTS = [256, 128];
// The atmosphere shell would tint the whole view from inside; it fades out
// between these altitudes.
const ATMOSPHERE_FADE = [0.15, 0.4];

const atmosphereVertexShader = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export class Globe {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
    this.camera.position.copy(latLonToVector3(30, 15, 1 + DEFAULT_ALTITUDE));

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    // Zooming is handled by ZoomController (zoom.js); these only bound it.
    this.controls.minDistance = 1 + MIN_ALTITUDE;
    this.controls.maxDistance = 1 + MAX_ALTITUDE;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.3;
    this.controls.addEventListener('start', () => { this.controls.autoRotate = false; });

    this.sunDirection = new THREE.Vector3();
    this.globeMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, ...GLOBE_SEGMENTS),
      new THREE.ShaderMaterial({
        uniforms: { sunDirection: { value: this.sunDirection }, map: { value: oceanTexture() } },
        vertexShader: globeVertexShader,
        fragmentShader: globeFragmentShader,
        // Map tiles (tiles.js) lie on the same sphere; pushing the globe back
        // in depth lets them win without flickering.
        polygonOffset: true,
        polygonOffsetFactor: 2,
        polygonOffsetUnits: 4,
      }),
    );
    this.scene.add(this.globeMesh);

    this.atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.12, 64, 48),
      new THREE.ShaderMaterial({
        uniforms: { opacity: { value: 1 } },
        vertexShader: atmosphereVertexShader,
        fragmentShader: atmosphereFragmentShader,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.scene.add(this.atmosphere);

    this.frameCallbacks = [];
    this.updateSun(new Date());
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // Loads Natural Earth once: draws land and water into the globe texture,
  // adds coastlines and borders, and returns the countries for labels.
  async loadMap() {
    const response = await fetch(WORLD_ATLAS_URL);
    if (!response.ok) throw new Error(`world-atlas: HTTP ${response.status}`);
    const world = await response.json();

    const land = feature(world, world.objects.land);
    const texture = new THREE.CanvasTexture(drawMapTexture(land.features?.[0]?.geometry ?? land.geometry));
    // No color space conversion: the shader writes the hex colors of
    // MAP_COLORS unchanged, as it did with its former fixed colors.
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.globeMesh.material.uniforms.map.value = texture;

    const coastlines = mesh(world, world.objects.land);
    const borders = mesh(world, world.objects.countries, (a, b) => a !== b);
    this.outlines = [
      createLines(coastlines, LINE_RADIUS, 0x7fb4e8, 0.9),
      createLines(borders, LINE_RADIUS, 0x7fb4e8, 0.35),
    ];
    this.scene.add(...this.outlines);
    return feature(world, world.objects.countries);
  }

  // Street maps draw their own coastlines and borders; the overview lines
  // are hidden over them so they do not appear twice.
  setOutlinesVisible(visible) {
    for (const line of this.outlines ?? []) line.visible = visible;
  }

  updateSun(date) {
    const { lat, lon } = subsolarPoint(date);
    this.sunDirection.copy(latLonToVector3(lat, lon)).normalize();
  }

  fadeAtmosphere() {
    const altitude = this.camera.position.length() - 1;
    const [hidden, full] = ATMOSPHERE_FADE;
    const opacity = THREE.MathUtils.clamp((altitude - hidden) / (full - hidden), 0, 1);
    this.atmosphere.material.uniforms.opacity.value = opacity;
    this.atmosphere.visible = opacity > 0;
  }

  onFrame(callback) {
    this.frameCallbacks.push(callback);
  }

  resize() {
    const { clientWidth: width, clientHeight: height } = this.container;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  start() {
    this.renderer.setAnimationLoop((time) => {
      this.controls.update();
      this.fadeAtmosphere();
      for (const callback of this.frameCallbacks) callback(time);
      this.renderer.render(this.scene, this.camera);
    });
  }
}

// Until Natural Earth has loaded, the globe shows plain ocean.
function oceanTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d');
  context.fillStyle = MAP_COLORS.ocean;
  context.fillRect(0, 0, 1, 1);
  return new THREE.CanvasTexture(canvas);
}

function createLines(multiLineString, radius, color, opacity) {
  const positions = [];
  for (const line of multiLineString.coordinates) {
    for (let i = 1; i < line.length; i++) {
      const [lon1, lat1] = line[i - 1];
      const [lon2, lat2] = line[i];
      positions.push(...latLonToVector3(lat1, lon1, radius).toArray());
      positions.push(...latLonToVector3(lat2, lon2, radius).toArray());
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  );
}
