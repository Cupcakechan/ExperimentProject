// ============================================================
// main.js — entry point. Scene, camera, THE FIELD: all creatures
// roam one shared stage simultaneously. Each actor = one creature
// with its own rig (skin draw), roam instance (seeded), and anim
// index. Nothing switches anymore, so nothing is disposed — the
// actors are built once and live forever.
//
// R1: the ink line is a SCREEN-SPACE pass (inkPass.js) — the
// inverted-hull ink DRAW is gone, and with it every per-actor ink
// material and its per-frame uniform writes. The scene renders
// once into the pass's target; a fullscreen pass inks depth
// discontinuities. Smooth blends are depth-continuous, so the
// concave-crease seam family (knee rings, body-exit slashes)
// cannot ink — deleted by construction.
// ============================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CREATURES } from './data/creatures.js';
import { buildShellGeometry } from './render/buildShell.js';
import { createBlendMaterial } from './render/blendMaterial.js';
import { createInkPass } from './render/inkPass.js';
import { updateAnim, animEntries, breathInflate } from './anim.js';
import { createControls } from './ui/controls.js';
import { createRoam } from './roam.js';
import { createSurfaceNetsActor } from './render/surfaceNetsActor.js';
import { createGait } from './gait.js';
import { createHop } from './hop.js';
import { createBlink } from './blink.js';
import { exportCreature, parseCreatureJSON } from './data/creatureIO.js';
import { generateCreature, GENERATE_MAX_ATTEMPTS } from './data/generate.js';
import { createWorld } from './render/world.js';
import { createTrails } from './render/trails.js';
import { createShadows } from './render/shadows.js';
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
  ACTOR_CAP,
} from './config.js';
import { stridePulse, leanTarget, approach, headingDelta } from './feel.js';

// antialias OFF on the canvas, deliberately: the canvas now only ever
// shows the ink pass's fullscreen quad (no geometric edges to smooth).
// Content antialiasing lives in the pass's multisampled target instead.
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // cap DPR: retina 3x is wasted work here
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

// COLOR-SPACE PARITY (R1): rendering into the ink pass's target skips
// three's sRGB output transform (with a target bound, the renderer's
// output space is LinearSRGB — r170 WebGLPrograms line 202), so the two
// managed-pipeline colors here (background clear + MeshBasicMaterial
// ground) would come out DARKER than the old direct-to-canvas path
// (convert-in/convert-out was a net identity). Authoring them RAW
// (setHex in LinearSRGB = store the hex verbatim) makes no-conversion a
// net identity too — same pixels as before R1. The creature shaders
// never used the transform, so they need nothing.
scene.background = new THREE.Color().setHex(BACKGROUND_COLOR, THREE.LinearSRGBColorSpace);

const camera = new THREE.PerspectiveCamera(CAMERA_FOV, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(...CAMERA_START);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(...ORBIT_TARGET);
controls.enableDamping = true;

// The TERRARIUM (C3) replaces the flat disc: same y=0 plane and same
// GROUND_COLOR inside the roam clamp (the feet-dip trick survives —
// world.js carries the contract), seeded hills and props beyond it.
createWorld(scene);
const trails = createTrails(scene); // footprint decals: stamped by locomotion, faded by time
const shadows = createShadows(scene); // contact blobs (research build 1): the grounding read, one per actor

// --- the actors: every creature, alive at once ---
// C1: actor construction is a FUNCTION now — the authored cast and
// imported JSON creatures spawn through the same door. The slider's
// current value must reach late spawns too (a build-time BLEND_K on an
// imported actor would silently disagree with the field).
const actors = [];
let currentK = BLEND_K;

function spawnActor(creature, roamTotal = actors.length + 1) {
  const i = actors.length; // live index: seeds, phases, spawn ring slot
  // SN-rendered creatures (render: 'sn'): the field is meshed on a shared
  // worker instead of shell-snapped — exposed joints allowed, shell
  // validity NOT required. The sink material slots in as actor.material,
  // so every write path (gait/anim/blink — they all take a materials
  // list) works unchanged and cannot tell the renderers apart.
  const sn = creature.render === 'sn' ? createSurfaceNetsActor(creature, { blendK: currentK }) : null;
  let material;
  let bodyMesh;
  if (sn) {
    material = sn.simMat;
    sn.setK(currentK);
    bodyMesh = sn.mesh;
  } else {
    const geometry = buildShellGeometry(creature.prims, creature.step?.knees);
    material = createBlendMaterial(creature.prims, creature.inflate, creature.step?.knees);
    bodyMesh = new THREE.Mesh(geometry, material);
  }
  material.uniforms.uK.value = currentK; // late spawns join the CURRENT field mood
  // Vertices move in the shader (shell) or the geometry is re-baked (SN),
  // so CPU-side bounds are wrong either way — never cull.
  bodyMesh.frustumCulled = false;
  const rig = new THREE.Group();
  rig.add(bodyMesh);
  // Banking rolls about the creature's FORWARD axis, which is LOCAL X
  // (creatures face -X). Order YXZ applies heading first, then the roll
  // happens in the already-yawed frame.
  rig.rotation.order = 'YXZ';
  scene.add(rig);
  const actor = {
    creature,
    material,
    rig,
    sn, // null for shell actors
    roam: createRoam(i, roamTotal, creature.idle), // seed = index; count-spaced spawn ring; per-creature idle
    // A hopping creature's feet belong to the HOP state machine — running
    // the reactive gait underneath it would fight over the same anchors.
    hop: createHop(creature),
    gait: creature.hop ? null : createGait(creature), // null for creatures without feet
    anims: animEntries(creature), // cached {anim, prim, idx} entries — findIndex is spawn work, not frame work
    bobPhase: i * 2.1, // breath decorrelator (synchronized breathing is uncanny)
    blink: createBlink(creature, i * 1.3), // staggered — unison blinking is worse
    pos: { x: 0, z: 0 }, // last frame's position, read by the OTHERS' separation
    lift: 0, // last frame's stride lift — rig and gait must AGREE on y, so both use it
    lean: 0, // smoothed bank angle
    prevHeading: null, // for wrap-safe omega
  };
  actors.push(actor);
  return actor;
}

// The authored cast spawns with the ORIGINAL ring total, so the six keep
// their exact pre-C1 seeds and spawn spots (deterministic-roam parity);
// imports slot in after them at the then-current count.
for (const creature of CREATURES) spawnActor(creature, CREATURES.length);

// The ink pass owns the offscreen target + the fullscreen edge pass.
const inkPass = createInkPass(renderer, camera);

// The stage cap: every spawn door respects it (populate, generate,
// import). Purely a perf guard — each actor is a draw + real per-pixel
// field work, and 24 keeps the field smooth on modest GPUs.
const stageFull = () => actors.length >= ACTOR_CAP;
const fullMsg = () => 'the stage is full (' + ACTOR_CAP + ' actors) — reload to clear';
// Populate draws from its own seed lane, far from the seed field's
// neighborhood, so mashing populate never collides with hand-picked seeds.
let populateSeed = 1001;

const ui = createControls({
  initialK: BLEND_K,
  onK: (v) => {
    currentK = v; // remembered for actors spawned AFTER the drag
    for (const a of actors) {
      a.material.uniforms.uK.value = v; // one draw now — the ink has no field to follow
      if (a.sn) a.sn.setK(v); // SN: re-bake the field at the new k
    }
  },
  // C1 creature I/O — controls owns the DOM, main owns the data:
  roster: () => actors.map((a) => ({ id: a.creature.id, name: a.creature.name ?? a.creature.id })),
  onExport: (id) => {
    const a = actors.find((x) => x.creature.id === id);
    // The RAW registry object exports — fields this tool doesn't manage
    // ride along untouched (the preserve-hand-authored-data rule).
    return a ? { filename: id + '.json', text: exportCreature(a.creature) } : null;
  },
  onImport: (text) => {
    if (stageFull()) return { ok: false, errors: [fullMsg()], warnings: [] };
    const r = parseCreatureJSON(text);
    if (!r.ok) return r;
    const actor = spawnActor(r.creature); // validated: safe past the gate
    return { ok: true, name: actor.creature.name ?? actor.creature.id, warnings: r.warnings };
  },
  onGenerate: (seed) => {
    if (stageFull()) return { ok: false, errors: [fullMsg()] };
    // Deterministic and pre-graded: the generator already ran the same
    // validator that gates imports, so this spawn is safe by contract.
    const r = generateCreature(seed);
    if (!r.creature) return { ok: false, errors: [`seed ${seed} exhausted ${GENERATE_MAX_ATTEMPTS} attempts (deterministically unlucky — try the next one)`] };
    spawnActor(r.creature);
    return { ok: true, name: `${r.creature.name} (${r.archetype}, seed ${seed})` };
  },
  onPopulate: () => {
    if (stageFull()) return { ok: false, errors: [fullMsg()] };
    const spawned = [];
    while (spawned.length < 5 && !stageFull()) {
      const r = generateCreature(populateSeed++);
      if (r.creature) {
        spawnActor(r.creature);
        spawned.push(r.creature.name);
      }
    }
    return { ok: true, name: `populated +${spawned.length}: ${spawned.join(', ')}` };
  },
});
void ui; // { refreshRoster } — controls refreshes itself on import

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  inkPass.setSize(window.innerWidth, window.innerHeight); // target + resolution + px weight follow
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
    // One draw per actor now — every lockstep write targets the skin
    // material alone (the write paths all take a materials LIST, so the
    // single-element array is the whole change).
    updateAnim(actor.material, tAnim, actor.anims);
    trails.trackActor(actor, tAnim); // pure polling AFTER locomotion: fresh plants, landings, drag

    // Blink (A4): eye decals submerge into their host on a deterministic,
    // phase-staggered schedule — absolute from rest, so a non-blinking
    // frame writes the exact registry pose.
    if (actor.blink) actor.blink.update(tAnim, [actor.material]);

    // Breathing (A2): the field itself inhales. Non-breathers keep their
    // build-time uInflate — no write, no cost.
    if (actor.creature.breath && !actor.sn) {
      // SN actors skip breath THIS pass: an inflate change is a field change
      // = constant idle re-meshing. Shader-side breath is the queued follow-up.
      actor.material.uniforms.uInflate.value = breathInflate(tAnim, actor.creature, actor.bobPhase);
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

    if (actor.creature.hover) {
      // HOVER (reference queue): the roam brain steers as ever; the body
      // rides at an authored altitude with a gentle bob. Free bob was
      // retired for walkers because it read as floating — here floating
      // IS the locomotion. bobPhase decorrelates the field (and syncs
      // the bob with this creature's breath — inhale on the rise).
      const hv = actor.creature.hover;
      actor.rig.position.set(pose.x, hv.height + hv.amp * Math.sin(tAnim * hv.speed + actor.bobPhase), pose.z);
      actor.rig.rotation.y = pose.heading;
    } else if (actor.hop) {
      // The hop returns the DISPLAYED pose (bursting between points on
      // the logical path) and owns the feet; no stride lift — the arc IS
      // the vertical life for this creature.
      const disp = actor.hop.update(dt, pose, [actor.material]);
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
        actor.gait.update(dt, { x: pose.x, y: actor.lift, z: pose.z, heading: pose.heading }, [actor.material]);
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
    // SN: enqueue a bake carrying everything this frame wrote (v1 always-
    // dirty round-robin; idle-skip is a measured follow-up).
    if (actor.sn) { actor.sn.markDirty(); actor.sn.update(); }
  }

  shadows.update(actors); // every rig's DISPLAYED pose is final for the frame — one pass over the field

  controls.update(); // required every frame when damping is on
  trails.update(tAnim); // age prints on the anim clock (pause freezes trails with everything else)
  inkPass.render(scene, camera); // scene -> target, then the fullscreen ink pass -> canvas
});
