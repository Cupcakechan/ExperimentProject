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
// PROTO-LOCAL POSTURE + PROPORTION (not authored into the cast):
// 1) SOFT ARMPITS: thighs carry kPrim so the GLOBAL k stays at the cast
//    default (global 0.32 plumped the whole creature, ~k*0.25 MEASURED).
// 2) SLIM: body r 0.34 -> 0.30. The widen was the SHELL missing-chunk
//    fix (capless shin rims poking the silhouette); the isosurface has
//    no donor rims, so here the widen is pure chub. (The static proto
//    shell toggle may show the old rim chunk again at 0.30 — expected.)
// 3) STAND STRAIGHT: the cast strider is AUTHORED forward-leaning 45deg;
//    per feedback the proto stands vertical. Rigid-rotate the TORSO
//    prims about the Z axis through the HIP PIVOT (thigh-top midpoint)
//    until the body axis is +Y. Legs untouched: feet keep contact, the
//    gait rest pose is unchanged, and the thigh tops lie ON the rotation
//    axis so hip burial survives (knee cover -0.044 at r 0.30, MEASURED
//    in the delivery check). Eyes/irises rotate rigidly with the head,
//    so every decal-band relation is preserved exactly.
const THIGH_K = 0.34; // crease sharpness ~0 by k0.36; 0.34 = soft armpits
const BODY_R = 0.30;
const LEG_IDS = ['thigh_l', 'leg_l', 'thigh_r', 'leg_r'];
const bodySrc = strider.prims.find((p) => p.id === 'body');
const tlA = strider.prims.find((p) => p.id === 'thigh_l').a;
const trA = strider.prims.find((p) => p.id === 'thigh_r').a;
const PIVOT = [(tlA[0] + trA[0]) / 2, (tlA[1] + trA[1]) / 2]; // hip midpoint (x, y)
const TH = Math.atan2(bodySrc.b[0] - bodySrc.a[0], bodySrc.b[1] - bodySrc.a[1]); // rotation that lands the body axis on +Y
const C = Math.cos(TH), S = Math.sin(TH);
const stand = (v) => {
  const x = v[0] - PIVOT[0], y = v[1] - PIVOT[1];
  return [PIVOT[0] + C * x - S * y, PIVOT[1] + S * x + C * y, v[2]];
};
const prims = strider.prims.map((p) => {
  if (LEG_IDS.includes(p.id)) return p.id.startsWith('thigh') ? { ...p, kPrim: THIGH_K } : p;
  const q = { ...p, a: stand(p.a) };
  if (p.b) q.b = stand(p.b);
  if (p.id === 'body') q.r = BODY_R;
  return q;
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
