// ============================================================
// main.js — entry point. Scene, camera, gallery state, loop.
// Switching creatures rebuilds geometry + material (simplest
// reliable — a rebuild is a one-off cost, not per-frame).
// ============================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CREATURES } from './data/creatures.js';
import { buildShellGeometry } from './render/buildShell.js';
import { createBlendMaterial, createOutlineMaterial } from './render/blendMaterial.js';
import { updateAnim, animPrimIndex } from './anim.js';
import { createControls } from './ui/controls.js';
import { createRoam } from './roam.js';
import { BLEND_K, BACKGROUND_COLOR, CAMERA_FOV, CAMERA_START, ORBIT_TARGET, BOB_AMPLITUDE, BOB_SPEED } from './config.js';

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

// The rig carries BOTH draws: root motion moves the group, so skin and
// ink can never drift apart. This works because geometry + snapping live
// in creature space and the model matrix applies AFTER — moving the mesh
// moves the whole snapped result.
const rig = new THREE.Group();
scene.add(rig);
const roam = createRoam();

// --- gallery state ---
let shell = null;
let outline = null;
let current = null;
let animIdx = -1;
let k = BLEND_K; // the slider's value survives creature switches

function setCreature(i) {
  const creature = CREATURES[i];
  if (!creature) return;
  if (shell) {
    rig.remove(shell);
    rig.remove(outline);
    shell.geometry.dispose(); // ONE dispose — the outline shares this geometry
    shell.material.dispose();
    outline.material.dispose();
  }
  const geometry = buildShellGeometry(creature.prims); // shared by both draws
  const material = createBlendMaterial(creature.prims);
  const inkMaterial = createOutlineMaterial(creature.prims);
  animIdx = animPrimIndex(creature);
  for (const m of [material, inkMaterial]) {
    m.uniforms.uK.value = k; // both draws follow the same field
  }
  shell = new THREE.Mesh(geometry, material);
  outline = new THREE.Mesh(geometry, inkMaterial);
  // Vertices move in the shader, so the CPU-side bounding volume is wrong —
  // never let three cull either mesh based on it.
  shell.frustumCulled = false;
  outline.frustumCulled = false;
  rig.add(shell);
  rig.add(outline);
  // Each creature starts its wander fresh at center, facing -X.
  roam.reset();
  rig.position.set(0, 0, 0);
  rig.rotation.y = 0;
  current = creature;
  ui.setActive(i);
}

const ui = createControls({
  creatures: CREATURES,
  initialK: k,
  onK: (v) => {
    k = v;
    if (shell) shell.material.uniforms.uK.value = v;
    if (outline) outline.material.uniforms.uK.value = v;
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
let tAnim = 0;

renderer.setAnimationLoop(() => {
  // Clamped delta: a backgrounded tab returns with a giant dt, which would
  // teleport the roamer and spike the steering.
  const dt = Math.min(clock.getDelta(), 0.05);
  tAnim += dt;

  // Both materials own their uniforms — the skin and its ink must move in
  // lockstep or the outline lags the wave.
  updateAnim(shell.material, tAnim, current, animIdx); // absolute pose — no drift
  updateAnim(outline.material, tAnim, current, animIdx);

  // Root motion: wander + face the direction of travel + idle bob.
  const pose = roam.update(dt);
  rig.position.set(pose.x, BOB_AMPLITUDE * Math.sin(tAnim * BOB_SPEED), pose.z);
  rig.rotation.y = pose.heading;

  controls.update(); // required every frame when damping is on
  renderer.render(scene, camera);
});
