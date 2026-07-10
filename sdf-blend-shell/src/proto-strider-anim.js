// proto-strider-anim.js — ANIMATION SPIKE (Option 1: worker re-meshing).
// The strider WALKS on its real gait; every pose is re-meshed on a Web
// Worker OFF the render thread. The main thread renders 60fps and swaps in
// the newest mesh whenever the worker finishes one. This answers the only
// open question for the isosurface path: does worker re-meshing read
// smoothly for a walking creature, and at what update rate?
//
// How the pose reaches the mesher: gait.update writes each leg prim's
// transform through setPrimTransform, which keeps uA/uB in lockstep — so
// after an update, the sim material's uA/uB ARE the current animated
// endpoints. We snapshot those, ship them to the worker, and (to keep the
// displayed creature self-consistent) apply that SAME snapshot's pose to
// the shading + the rig when its mesh comes back. The display therefore
// lags the simulation by ~one mesh, all of a piece — no foot-sliding.
//
// cellSize dial trades mesh speed (→ update rate) against quality. Nothing
// here touches the main app or the cast.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CREATURES } from './data/creatures.js';
import { createBlendMaterial, createSurfaceNetsMaterial } from './render/blendMaterial.js';
import { createGait } from './gait.js';
import { createInkPass } from './render/inkPass.js';
import { createWorld } from './render/world.js';
import { CAMERA_FOV, CAMERA_START, ORBIT_TARGET, BACKGROUND_COLOR } from './config.js';

const strider = CREATURES.find((c) => c.id === 'strider');
const inflate = strider.inflate ?? 0;
// PROTO-LOCAL HUMANOID PASS v3.2 (not authored into the cast; the proto
// is deliberately veering creature -> humanoid). Explicit values — every
// line is one lever.
// v3.2 changes: HEAD 0.26 -> 0.20 (was reading big on the slim body);
// the eye group SCALES with it so the balls stay rooted EYE_ROOT into
// the head surface and each iris keeps its exact on-ball offset (paint
// band preserved). LEG DE-FUSE (MEASURED, three culprits): the torso
// bottom hung to y 0.70 — knee height — so the crotch WAS at the knees;
// the thigh k bridged the knee cluster (four capsule ends stack their
// smin deficits); and the shins bridged at global k. Fix (sweep-picked
// against the live field): torso bottom raised to 1.00 with the hips up
// at 0.92 (burial -0.047), THIGH_K 0.12, SHIN_K 0.12, leg track z 0.17.
// Rest midline field between the legs: -0.068 (v3.1) -> +0.031 = an
// open gap. A dedicated pelvis prim was tried and measured WORSE (a
// sphere that buries the thighs hangs into the crotch itself). Body
// 0.22 -> 0.20, neck 0.10 -> 0.09 ride the overall slim.
// Straight leg column kept from v3.1: hip + foot aligned at x 0.11,
// knee 0.06 forward as the IK pole; rest reach ~0.98, the gait
// self-regulates at its 0.995 straight limit (MEASURED).
// NOTE: SN is the truth view; the static-proto SHELL toggle shows rim
// artifacts at the untucked knees and slim body — expected.
const THIGH_K = 0.12; // sweep-picked with the leg gap; 0.30 (fat-body armpit fix) bridged the knee cluster
const SHIN_K = 0.12;  // anti-fuse: legs stop bridging each other
const HEAD = [0.02, 1.56, 0];
const HEAD_R = 0.20;
const EYE_ROOT = 0.045; // authored ball rooting depth into the head
const OVERRIDE = {
  body: { a: [0.11, 1.00, 0], b: [0.11, 1.20, 0], r: 0.20 }, // bottom raised off the crotch (was 0.90 -> cap at knee height)
  neck: { a: [0.11, 1.20, 0], b: [0.05, 1.40, 0], r: 0.09 },
  head: { a: HEAD, r: HEAD_R },
  thigh_l: { a: [0.11, 0.92, 0.13], b: [0.05, 0.71, 0.17], r: 0.10, kPrim: THIGH_K },
  thigh_r: { a: [0.11, 0.92, -0.13], b: [0.05, 0.71, -0.17], r: 0.10, kPrim: THIGH_K },
  leg_l: { a: [0.05, 0.71, 0.17], b: [0.11, 0.06, 0.17], r: 0.09, kPrim: SHIN_K },
  leg_r: { a: [0.05, 0.71, -0.17], b: [0.11, 0.06, -0.17], r: 0.09, kPrim: SHIN_K },
  tail: null, // removed: humanoid
};
const headSrc = strider.prims.find((p) => p.id === 'head');
const prims = strider.prims.flatMap((p) => {
  if (OVERRIDE[p.id] === null) return [];
  if (p.id.startsWith('eyeball')) {
    const o = [p.a[0] - headSrc.a[0], p.a[1] - headSrc.a[1], p.a[2] - headSrc.a[2]];
    const s = (HEAD_R - EYE_ROOT) / Math.hypot(o[0], o[1], o[2]); // keep the rooting depth on the smaller head
    return [{ ...p, a: [HEAD[0] + o[0] * s, HEAD[1] + o[1] * s, HEAD[2] + o[2] * s] }];
  }
  if (p.id.startsWith('iris')) {
    const eye = strider.prims.find((q) => q.id === 'eyeball' + p.id.slice(4)); // iris_l -> eyeball_l
    const o = [eye.a[0] - headSrc.a[0], eye.a[1] - headSrc.a[1], eye.a[2] - headSrc.a[2]];
    const s = (HEAD_R - EYE_ROOT) / Math.hypot(o[0], o[1], o[2]);
    // the scaled ball center + the EXACT authored iris-on-ball offset: paint band preserved
    return [{ ...p, a: [HEAD[0] + o[0] * s + (p.a[0] - eye.a[0]), HEAD[1] + o[1] * s + (p.a[1] - eye.a[1]), HEAD[2] + o[2] * s + (p.a[2] - eye.a[2])] }];
  }
  return [{ ...p, ...(OVERRIDE[p.id] ?? {}) }];
});
const proto = { ...strider, prims }; // same ids/indices/step — only thigh kPrim differs
let blendK = 0.25; // BACK to the cast default: the armpit fix moved into THIGH_K
let cellSize = 0.02; // animation default: coarser than the static 0.015 for speed

// --- renderer / scene / camera / stage ---
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color().setHex(BACKGROUND_COLOR, THREE.LinearSRGBColorSpace);
const camera = new THREE.PerspectiveCamera(CAMERA_FOV, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(...CAMERA_START);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(...ORBIT_TARGET);
controls.enableDamping = true;
createWorld(scene);

// --- sim material (gait sink — advances every frame, NEVER rendered) +
//     display SN mesh (set to the last MESHED snapshot) ---
const simMat = createBlendMaterial(prims, strider.inflate, strider.step?.knees);
const snMat = createSurfaceNetsMaterial(prims, strider.inflate);
snMat.uniforms.uK.value = blendK;
const snMesh = new THREE.Mesh(new THREE.BufferGeometry(), snMat);
snMesh.frustumCulled = false;
scene.add(snMesh);

const gait = createGait(proto); // cloned prims: gait writes land on the same indices

// --- worker ---
const worker = new Worker(new URL('./render/surfaceNetsWorker.js', import.meta.url), { type: 'module' });
let workerBusy = false;
let pending = null; // { prims, pose } snapshot in flight
let seq = 0;
let meshMsEMA = 300; // exponential moving average of mesh time (ms)
let lastVerts = 0;
let displayReady = false;

// Snapshot the sim's CURRENT prims from simMat's uA/uB (kept in lockstep by
// setPrimTransform). Plain arrays so they post/transfer cleanly.
function snapshotPrims() {
  const uA = simMat.uniforms.uA.value;
  const uB = simMat.uniforms.uB.value;
  return prims.map((p, i) => ({ // cloned prims: the worker must see THIGH_K
    type: p.type,
    r: p.r,
    kCap: p.kCap,
    kPrim: p.kPrim,
    paint: p.paint,
    negative: p.negative,
    a: [uA[i].x, uA[i].y, uA[i].z],
    b: [uB[i].x, uB[i].y, uB[i].z],
  }));
}

worker.onmessage = (e) => {
  const { positions, indices, vertexCount, ms } = e.data;
  meshMsEMA = meshMsEMA * 0.8 + ms * 0.2;
  lastVerts = vertexCount;

  // Swap in the fresh geometry (buffer sizes change every pose, so a new
  // BufferGeometry each time; dispose the old to free its GPU buffers).
  const old = snMesh.geometry;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  snMesh.geometry = geo;
  old.dispose();

  // Apply THIS snapshot's pose to the shading (uA/uB) and the rig, so the
  // mesh, its field, and its world placement all agree.
  if (pending) {
    const uA = snMat.uniforms.uA.value;
    const uB = snMat.uniforms.uB.value;
    for (let i = 0; i < pending.prims.length; i++) {
      uA[i].set(...pending.prims[i].a);
      uB[i].set(...pending.prims[i].b);
    }
    snMesh.position.set(pending.pose.x, pending.pose.y, pending.pose.z);
    snMesh.rotation.y = pending.pose.heading;
  }
  workerBusy = false;
  displayReady = true;
};

// --- the walk: a circle centered on the origin so it stays in frame ---
const R = 1.2; // circle radius
const SPEED = 0.35; // walk speed (units/s)
let phi = 0; // angle around the circle
let paused = false;
const pose = { x: 0, y: 0, z: 0, heading: 0 };

let last = performance.now();
function step(nowMs) {
  const dt = Math.min((nowMs - last) / 1000, 0.05);
  last = nowMs;

  if (!paused) {
    phi += (SPEED / R) * dt;
    pose.x = R * Math.cos(phi);
    pose.z = R * Math.sin(phi);
    pose.heading = Math.PI / 2 - phi; // face along the tangent (walk forward)
    gait.update(dt, pose, [simMat]); // advances the legs; keeps simMat.uA/uB current
  }

  // Post the current pose to the worker only when it's idle — it meshes
  // back-to-back at its own rate; we always display the newest completed.
  if (!workerBusy) {
    pending = { prims: snapshotPrims(), pose: { x: pose.x, y: pose.y, z: pose.z, heading: pose.heading } };
    worker.postMessage({ prims: pending.prims, opts: { cellSize, blendK, inflate }, seq: ++seq });
    workerBusy = true;
  }

  controls.update();
  if (displayReady) inkPass.render(scene, camera);
  else renderer.render(scene, camera); // stage only until the first mesh lands

  hud.rate.textContent =
    `${(1000 / meshMsEMA).toFixed(1)} Hz  ·  ${meshMsEMA.toFixed(0)} ms/mesh  ·  ${lastVerts.toLocaleString()} verts`;
  requestAnimationFrame(step);
}

// --- HUD ---
const bar = document.createElement('div');
bar.style.cssText =
  'position:fixed;top:0;left:0;right:0;padding:10px 14px;font:14px/1.4 system-ui,sans-serif;' +
  'color:#12303a;background:rgba(238,246,244,0.86);backdrop-filter:blur(3px);z-index:10;' +
  'display:flex;gap:12px;align-items:center;flex-wrap:wrap;';
document.body.appendChild(bar);
const title = document.createElement('b');
title.textContent = 'Surface Nets · worker re-meshing';
const pauseBtn = document.createElement('button');
pauseBtn.textContent = 'Pause';
pauseBtn.style.cssText =
  'font:600 13px system-ui,sans-serif;padding:6px 12px;border:1px solid #2e8478;border-radius:7px;' +
  'background:#3fa89a;color:#fff;cursor:pointer;';
pauseBtn.onclick = () => { paused = !paused; pauseBtn.textContent = paused ? 'Resume' : 'Pause'; };
const gridWrap = document.createElement('span');
gridWrap.style.cssText = 'display:flex;align-items:center;gap:6px;';
const gridLabel = document.createElement('span');
gridLabel.textContent = cellSize.toFixed(3);
const grid = document.createElement('input');
grid.type = 'range';
grid.min = '0.012';
grid.max = '0.040';
grid.step = '0.002';
grid.value = String(cellSize);
grid.style.cssText = 'width:150px;';
grid.addEventListener('input', () => { cellSize = Number(grid.value); gridLabel.textContent = cellSize.toFixed(3); });
gridWrap.append(document.createTextNode('cell (coarse→fast)'), grid, gridLabel);
const rate = document.createElement('span');
rate.style.cssText = 'margin-left:2px;color:#2e8478;font-variant-numeric:tabular-nums;';
bar.append(title, pauseBtn, gridWrap, rate);
const hud = { rate };

const hint = document.createElement('div');
hint.textContent =
  'The strider walks a circle, re-meshed on a worker each pose · drag to orbit · smaller cell = finer mesh but lower Hz';
hint.style.cssText =
  'position:fixed;bottom:8px;left:0;right:0;text-align:center;font:12px system-ui,sans-serif;' +
  'color:#2e8478;z-index:10;pointer-events:none;';
document.body.appendChild(hint);

// --- ink + resize + go ---
const inkPass = createInkPass(renderer, camera);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  inkPass.setSize(window.innerWidth, window.innerHeight);
});
requestAnimationFrame(step);

console.log('[strider anim] worker re-meshing spike. Walk is a circle; cell dial trades Hz for quality; Pause to inspect.');
