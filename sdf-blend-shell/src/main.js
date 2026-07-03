// ============================================================
// main.js — entry point. Scene, camera, gallery state, loop.
// Switching creatures rebuilds geometry + material (simplest
// reliable — a rebuild is a one-off cost, not per-frame).
// ============================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CREATURES } from './data/creatures.js';
import { buildShellGeometry } from './render/buildShell.js';
import { createBlendMaterial } from './render/blendMaterial.js';
import { updateAnim, animPrimIndex } from './anim.js';
import { createControls } from './ui/controls.js';
import { BLEND_K, BACKGROUND_COLOR, CAMERA_FOV, CAMERA_START, ORBIT_TARGET } from './config.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // cap DPR: retina 3x is wasted work here
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(BACKGROUND_COLOR);

const camera = new THREE.PerspectiveCamera(CAMERA_FOV, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(...CAMERA_START);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(...ORBIT_TARGET);
controls.enableDamping = true;

// --- gallery state ---
let shell = null;
let current = null;
let animIdx = -1;
let k = BLEND_K; // the slider's value survives creature switches

function setCreature(i) {
  const creature = CREATURES[i];
  if (!creature) return;
  if (shell) {
    scene.remove(shell);
    shell.geometry.dispose();
    shell.material.dispose(); // rebuilt per creature; never leak GPU objects
  }
  const material = createBlendMaterial(creature.prims);
  animIdx = animPrimIndex(creature);
  material.uniforms.uAnimPrim.value = animIdx;
  material.uniforms.uK.value = k;
  shell = new THREE.Mesh(buildShellGeometry(creature.prims), material);
  // Vertices move in the shader, so the CPU-side bounding volume is wrong —
  // never let three cull the mesh based on it.
  shell.frustumCulled = false;
  scene.add(shell);
  current = creature;
  ui.setActive(i);
}

const ui = createControls({
  creatures: CREATURES,
  initialK: k,
  onK: (v) => {
    k = v;
    if (shell) shell.material.uniforms.uK.value = v;
  },
  onSelect: setCreature,
});

// Number keys 1..N mirror the buttons.
window.addEventListener('keydown', (e) => {
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= CREATURES.length) setCreature(n - 1);
});

setCreature(0);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  updateAnim(shell.material, clock.getElapsedTime(), current, animIdx); // absolute pose — no drift
  controls.update(); // required every frame when damping is on
  renderer.render(scene, camera);
});
