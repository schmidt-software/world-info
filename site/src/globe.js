import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mesh } from 'topojson-client';
import { latLonToVector3, subsolarPoint } from './geo.js';

const WORLD_ATLAS_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json';

const globeVertexShader = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// The globe is never rotated (the camera orbits instead), so object-space
// normals can be compared with the world-space sun direction directly.
const globeFragmentShader = /* glsl */ `
  uniform vec3 sunDirection;
  varying vec3 vNormal;
  void main() {
    float light = dot(normalize(vNormal), sunDirection);
    float day = smoothstep(-0.12, 0.12, light);
    vec3 nightColor = vec3(0.015, 0.03, 0.07);
    vec3 dayColor = vec3(0.05, 0.16, 0.30);
    gl_FragColor = vec4(mix(nightColor, dayColor, day), 1.0);
  }
`;

const atmosphereFragmentShader = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
    gl_FragColor = vec4(0.3, 0.6, 1.0, 1.0) * intensity;
  }
`;

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
    this.camera.position.copy(latLonToVector3(30, 15, 3.2));

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.4;
    this.controls.maxDistance = 6;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.3;
    this.controls.addEventListener('start', () => { this.controls.autoRotate = false; });

    this.sunDirection = new THREE.Vector3();
    this.globeMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 64),
      new THREE.ShaderMaterial({
        uniforms: { sunDirection: { value: this.sunDirection } },
        vertexShader: globeVertexShader,
        fragmentShader: globeFragmentShader,
      }),
    );
    this.scene.add(this.globeMesh);

    this.scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.12, 64, 48),
      new THREE.ShaderMaterial({
        vertexShader: atmosphereVertexShader,
        fragmentShader: atmosphereFragmentShader,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
      }),
    ));

    this.frameCallbacks = [];
    this.updateSun(new Date());
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  async loadBorders() {
    const response = await fetch(WORLD_ATLAS_URL);
    if (!response.ok) throw new Error(`world-atlas: HTTP ${response.status}`);
    const world = await response.json();

    const coastlines = mesh(world, world.objects.land);
    const borders = mesh(world, world.objects.countries, (a, b) => a !== b);
    this.scene.add(createLines(coastlines, 1.002, 0x7fb4e8, 0.9));
    this.scene.add(createLines(borders, 1.002, 0x7fb4e8, 0.35));
  }

  updateSun(date) {
    const { lat, lon } = subsolarPoint(date);
    this.sunDirection.copy(latLonToVector3(lat, lon)).normalize();
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
      for (const callback of this.frameCallbacks) callback(time);
      this.renderer.render(this.scene, this.camera);
    });
  }
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
