// ============================================================
// main.js — entry point. Scene, camera, THE FIELD: all creatures
// roam one shared stage simultaneously. Each actor = one creature
// with its own rig (skin + ink), roam instance (seeded), and anim
// index. Nothing switches anymore, so nothing is disposed — the
// actors are built once and live forever.
// ============================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CREATURES } from './data/creatures.js';
import { buildShellGeometry } from './render/buildShell.js';
import { createBlendMaterial, createOutlineMaterial } from './render/blendMaterial.js';
import { updateAnim, animPrimIndex } from './anim.js';
import { createControls } from './ui/controls.js';
import { createRoam } from './roam.js';
import { createGait } from './gait.js';
import {
  BLEND_K,
  BACKGROUND_COLOR,
  CAMERA_FOV,
  CAMERA_START,
  ORBIT_TARGET,
  BOB_AMPLITUDE,
  BOB_SPEED,
  GROUND_RADIUS,
  GROUND_COLOR,
} from './config.js';

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

// The field floor: flat and unlit (the toon look wants flat), a plain mesh
// outside the blend-shell system. Feet dipping a hair below y=0 get hidden
// by it — which reads as planted, for free.
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(GROUND_RADIUS, 48).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: GROUND_COLOR })
);
scene.add(ground);

// --- the actors: every creature, alive at once ---
const actors = CREATURES.map((creature, i) => {
  const geometry = buildShellGeometry(creature.prims); // shared by both draws
  const material = createBlendMaterial(creature.prims);
  const ink = createOutlineMaterial(creature.prims);
  const shell = new THREE.Mesh(geometry, material);
  const outline = new THREE.Mesh(geometry, ink);
  // Vertices move in the shader, so CPU-side bounds are wrong — never cull.
  shell.frustumCulled = false;
  outline.frustumCulled = false;
  const rig = new THREE.Group();
  rig.add(shell);
  rig.add(outline);
  scene.add(rig);
  return {
    creature,
    material,
    ink,
    rig,
    roam: createRoam(i), // seed = index: distinct spawn + wander phase
    gait: createGait(creature), // null for creatures without feet
    animIdx: animPrimIndex(creature),
    bobPhase: i * 2.1, // decorrelated bobbing — synchronized bouncing is uncanny
    pos: { x: 0, z: 0 }, // last frame's position, read by the OTHERS' separation
  };
});

const ui = createControls({
  initialK: BLEND_K,
  onK: (v) => {
    for (const a of actors) {
      a.material.uniforms.uK.value = v;
      a.ink.uniforms.uK.value = v; // skin and ink follow the same field
    }
  },
});
void ui; // controls has no return contract anymore; kept for symmetry

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
let tAnim = 0;

renderer.setAnimationLoop(() => {
  // Clamped delta: a backgrounded tab returns with a giant dt, which would
  // teleport the roamers and spike the steering.
  const dt = Math.min(clock.getDelta(), 0.05);
  tAnim += dt;

  for (const actor of actors) {
    // Skin and ink own separate uniforms — both must move, in lockstep.
    updateAnim(actor.material, tAnim, actor.creature, actor.animIdx);
    updateAnim(actor.ink, tAnim, actor.creature, actor.animIdx);

    // Separation reads the OTHERS' last-frame positions (1 frame of lag is
    // invisible at these speeds and keeps the update order-independent).
    const others = actors.filter((a) => a !== actor).map((a) => a.pos);
    const pose = actor.roam.update(dt, others);
    actor.pos.x = pose.x;
    actor.pos.z = pose.z;
    const bobY = BOB_AMPLITUDE * Math.sin(tAnim * BOB_SPEED + actor.bobPhase);
    actor.rig.position.set(pose.x, bobY, pose.z);
    actor.rig.rotation.y = pose.heading;

    // Feet plant in the world and step reactively; the gait writes the leg
    // prims through the SDF-lockstep path on both draws.
    if (actor.gait) {
      actor.gait.update(dt, { x: pose.x, y: bobY, z: pose.z, heading: pose.heading }, [actor.material, actor.ink]);
    }
  }

  controls.update(); // required every frame when damping is on
  renderer.render(scene, camera);
});
