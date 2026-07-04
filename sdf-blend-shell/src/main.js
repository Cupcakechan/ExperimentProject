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
import { updateAnim, animPrimIndex, breathInflate } from './anim.js';
import { createControls } from './ui/controls.js';
import { createRoam } from './roam.js';
import { createGait } from './gait.js';
import { createHop } from './hop.js';
import { createBlink } from './blink.js';
import {
  BLEND_K,
  BACKGROUND_COLOR,
  CAMERA_FOV,
  CAMERA_START,
  ORBIT_TARGET,
  STRIDE_LIFT,
  LEAN_GAIN,
  LEAN_MAX,
  LEAN_SMOOTH,
  LIFT_SMOOTH,
  GROUND_RADIUS,
  GROUND_COLOR,
} from './config.js';
import { stridePulse, leanTarget, approach, headingDelta } from './feel.js';

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
  // inflate (plumpness) is creature data; skin and ink must dilate by the
  // SAME amount or the outline detaches from the plumped skin.
  const material = createBlendMaterial(creature.prims, creature.inflate);
  const ink = createOutlineMaterial(creature.prims, creature.inflate);
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
    roam: createRoam(i, CREATURES.length, creature.idle), // seed = index; count-spaced spawn ring; per-creature idle
    // A hopping creature's feet belong to the HOP state machine — running
    // the reactive gait underneath it would fight over the same anchors.
    hop: createHop(creature),
    gait: creature.hop ? null : createGait(creature), // null for creatures without feet
    animIdx: animPrimIndex(creature),
    bobPhase: i * 2.1, // breath decorrelator (synchronized breathing is uncanny)
    blink: createBlink(creature, i * 1.3), // staggered — unison blinking is worse
    pos: { x: 0, z: 0 }, // last frame's position, read by the OTHERS' separation
    lift: 0, // last frame's stride lift — rig and gait must AGREE on y, so both use it
    lean: 0, // smoothed bank angle
    prevHeading: null, // for wrap-safe omega
  };
});

// Banking rolls about the creature's FORWARD axis, which is LOCAL X
// (creatures face -X). Order YXZ applies heading first, then the roll
// happens in the already-yawed frame.
for (const a of actors) a.rig.rotation.order = 'YXZ';

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
let paused = false;

// Pause ([P] or Space): freezes the SIM but keeps the camera live —
// orbiting a frozen field is the whole point (screenshots). dt=0 flows
// safely through every consumer: roam integrates nothing, gait guards
// dt>0 for velocity and advances swings by 0, anims hold their phase.
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP' || e.code === 'Space') {
    paused = !paused;
    e.preventDefault(); // Space would scroll the page
  }
});

renderer.setAnimationLoop(() => {
  // Clamped delta: a backgrounded tab returns with a giant dt, which would
  // teleport the roamers and spike the steering. getDelta() must be CALLED
  // even while paused, or the first unpaused frame receives the entire
  // paused duration as one spike.
  const rawDt = clock.getDelta();
  const dt = paused ? 0 : Math.min(rawDt, 0.05);
  tAnim += dt;

  for (const actor of actors) {
    // Skin and ink own separate uniforms — both must move, in lockstep.
    updateAnim(actor.material, tAnim, actor.creature, actor.animIdx);
    updateAnim(actor.ink, tAnim, actor.creature, actor.animIdx);

    // Blink (A4): eye decals submerge into their host on a deterministic,
    // phase-staggered schedule — absolute from rest, so a non-blinking
    // frame writes the exact registry pose.
    if (actor.blink) actor.blink.update(tAnim, [actor.material, actor.ink]);

    // Breathing (A2): the field itself inhales. Both draws get the SAME
    // value or the outline detaches from the swelling skin; bobPhase
    // decorrelates the rhythms (synchronized breathing is uncanny).
    // Non-breathers keep their build-time uInflate — no write, no cost.
    if (actor.creature.breath) {
      const infl = breathInflate(tAnim, actor.creature, actor.bobPhase);
      actor.material.uniforms.uInflate.value = infl;
      actor.ink.uniforms.uInflate.value = infl;
    }

    // Separation reads the OTHERS' last-frame positions (1 frame of lag is
    // invisible at these speeds and keeps the update order-independent).
    const others = actors.filter((a) => a !== actor).map((a) => a.pos);
    const pose = actor.roam.update(dt, others);
    actor.pos.x = pose.x;
    actor.pos.z = pose.z;
    // Banking (all actors — a hopper leaning mid-air is free charm):
    // wrap-safe omega from the logical heading, clamped and smoothed so
    // steering spikes and wander jitter never wobble the body.
    if (actor.prevHeading === null) actor.prevHeading = pose.heading;
    const omega = dt > 0 ? headingDelta(actor.prevHeading, pose.heading) / dt : 0;
    actor.prevHeading = pose.heading;
    actor.lean = approach(actor.lean, leanTarget(omega, LEAN_GAIN, LEAN_MAX), LEAN_SMOOTH, dt);

    if (actor.hop) {
      // The hop returns the DISPLAYED pose (bursting between points on
      // the logical path) and owns the feet; no stride lift — the arc IS
      // the vertical life for this creature.
      const disp = actor.hop.update(dt, pose, [actor.material, actor.ink]);
      actor.rig.position.set(disp.x, disp.y, disp.z);
      actor.rig.rotation.y = disp.heading;
    } else {
      // STEP-SYNCED bob (A3.1): the body lifts with the ACTUAL stride,
      // so an idle walker is genuinely still and the breath shows.
      // The rig and the gait must agree on y (planted anchors are pinned
      // against the rig), and the lift depends on the swing state gait
      // produces — so BOTH use last frame's lift: a fully consistent
      // pair, one invisible frame of lag (the separation-lag pattern).
      if (actor.gait) {
        actor.gait.update(dt, { x: pose.x, y: actor.lift, z: pose.z, heading: pose.heading }, [actor.material, actor.ink]);
      }
      actor.rig.position.set(pose.x, actor.lift, pose.z);
      actor.rig.rotation.y = pose.heading;
      // The body is a MASS: it low-passes the stride. sin^2 softened each
      // hump's endpoints, but discrete full-range humps at the irregular
      // step cadence still read as convulsing — the suspension turns them
      // into one continuous sway (pause-safe: approach is identity at dt=0).
      const targetLift = actor.gait ? STRIDE_LIFT * stridePulse(actor.gait.feet) : 0;
      actor.lift = approach(actor.lift, targetLift, LIFT_SMOOTH, dt);
    }
    // SIGN CHECK (flagged): positive omega should bank INTO the turn —
    // if the field reads as leaning OUT of turns, flip this one sign.
    actor.rig.rotation.x = actor.lean;
  }

  controls.update(); // required every frame when damping is on
  renderer.render(scene, camera);
});
