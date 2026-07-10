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
// PROTO-LOCAL PROPORTION PASS v2 (not authored into the cast):
// 1) SOFT ARMPITS: thighs carry kPrim; the GLOBAL k stays at the cast
//    default (global 0.32 plumped the whole creature, ~k*0.25 MEASURED).
// 2) SLIM: body r 0.34 -> 0.30 (the widen was the SHELL missing-chunk
//    fix; the isosurface has no donor rims to hide).
// 3) STAND: torso rigid-rotated about the hip pivot until the body axis
//    is vertical (the cast strider is AUTHORED leaning 45deg).
// 4) LONGER LEGS / SHORTER TORSO (the still-chubby fix): hips + thighs
//    raised by RAISE with the feet PLANTED (the shins lengthen to reach)
//    and the torso bottom pulled up to TORSO_BOTTOM_Y. Visible leg goes
//    ~0.25 -> ~0.53 while total height stays ~1.75: same width + more
//    leg = the thinner read. Rest knee reach 0.949 < the gait straight
//    limit 0.995 (MEASURED in the delivery check).
// 5) EYES FORWARD: the stand rotation left the eyes pointing 45deg up;
//    eyes + irises instead keep their AUTHORED offset from the head
//    center (a rigid counter-rotation reduces to exactly that), so they
//    face -X again with every decal relation preserved.
// 6) TAIL: re-hung off the new torso bottom at its authored
//    body-relative offset, horizontal again — standing up had swung it
//    into a droop that read as a hip growth.
const THIGH_K = 0.34; // crease sharpness ~0 by k0.36; 0.34 = soft armpits
const BODY_R = 0.30;
const RAISE = 0.25; // hips + knees up by this; feet stay planted
const TORSO_BOTTOM_Y = 0.90; // body a-end (was 0.614 after the stand): shorter torso, longer visible leg
const bodySrc = strider.prims.find((p) => p.id === 'body');
const headSrc = strider.prims.find((p) => p.id === 'head');
const tlA = strider.prims.find((p) => p.id === 'thigh_l').a;
const trA = strider.prims.find((p) => p.id === 'thigh_r').a;
const PIVOT = [(tlA[0] + trA[0]) / 2, (tlA[1] + trA[1]) / 2]; // hip midpoint (x, y)
const TH = Math.atan2(bodySrc.b[0] - bodySrc.a[0], bodySrc.b[1] - bodySrc.a[1]); // lands the body axis on +Y
const C = Math.cos(TH), S = Math.sin(TH);
const stand = (v) => {
  const x = v[0] - PIVOT[0], y = v[1] - PIVOT[1];
  return [PIVOT[0] + C * x - S * y, PIVOT[1] + S * x + C * y, v[2]];
};
const headC = stand(headSrc.a); // stood-up head center: the eye anchor
const prims = strider.prims.map((p) => {
  if (p.id === 'thigh_l' || p.id === 'thigh_r') {
    return { ...p, kPrim: THIGH_K, a: [p.a[0], p.a[1] + RAISE, p.a[2]], b: [p.b[0], p.b[1] + RAISE, p.b[2]] };
  }
  if (p.id === 'leg_l' || p.id === 'leg_r') {
    return { ...p, a: [p.a[0], p.a[1] + RAISE, p.a[2]] }; // knee rides up; foot b stays PLANTED
  }
  if (p.id === 'body') {
    const a = stand(p.a), b = stand(p.b);
    return { ...p, r: BODY_R, a: [a[0], TORSO_BOTTOM_Y, a[2]], b };
  }
  if (p.id === 'tail') {
    const bx = stand(bodySrc.a)[0]; // authored offsets off body.a: root +0.06/+0.10, axis +0.40/-0.12
    const a = [bx + 0.06, TORSO_BOTTOM_Y + 0.10, 0];
    return { ...p, a, b: [a[0] + 0.40, a[1] - 0.12, 0] };
  }
  if (p.id.startsWith('eyeball') || p.id.startsWith('iris')) {
    return { ...p, a: [headC[0] + (p.a[0] - headSrc.a[0]), headC[1] + (p.a[1] - headSrc.a[1]), p.a[2]] };
  }
  const q = { ...p, a: stand(p.a) }; // neck + head: stood up
  if (p.b) q.b = stand(p.b);
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
