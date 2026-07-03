// ============================================================
// main.js — entry point. Scene, camera, controls, render loop.
// (Roughly: this file is the "Main Camera + game loop" of a
// Unity scene; buildShell + blendMaterial are the prefab+shader.)
// ============================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CREATURE } from './data/creature.js';
import { buildShellGeometry } from './render/buildShell.js';
import { createBlendMaterial } from './render/blendMaterial.js';
import { BACKGROUND_COLOR, CAMERA_FOV, CAMERA_START, ORBIT_TARGET } from './config.js';

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

// The creature: one merged geometry + the blend-shell material.
const shell = new THREE.Mesh(buildShellGeometry(CREATURE), createBlendMaterial(CREATURE));
// Vertices move in the shader, so the CPU-side bounding volume is wrong —
// never let three cull the mesh based on it.
shell.frustumCulled = false;
scene.add(shell);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  controls.update(); // required every frame when damping is on
  renderer.render(scene, camera);
});
