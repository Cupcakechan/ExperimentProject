// proto-strider.js — ISOLATED strider slice (R4 look validation + tuning).
// Renders ONLY the strider, two ways, so the isosurface can be judged
// against the donor-shell it would replace:
//   [1] SHELL         — buildShellGeometry + createBlendMaterial: the
//                       CURRENT renderer (per-prim meshes snapped onto the
//                       field). Shows the leg-junction cuts.
//   [2] SURFACE NETS  — buildSurfaceNetsGeometry + createSurfaceNetsMaterial:
//                       R4. The field meshed into ONE watertight skin.
// Plus a BLEND dial: the residual "slight cuts" on the isosurface are the
// real armpit creases (the thin-leg / fat-body join has a tight smin
// fillet ~k/6 that reads dark and dips the silhouette). Widening k opens
// that fillet. The dial re-bakes the SN mesh on release so the sweet spot
// (soft armpit WITHOUT the legs melting into the body) can be found by eye.
// Nothing here touches the main app or the cast.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CREATURES } from './data/creatures.js';
import { buildShellGeometry } from './render/buildShell.js';
import { buildSurfaceNetsGeometry } from './render/surfaceNets.js';
import { createBlendMaterial, createSurfaceNetsMaterial } from './render/blendMaterial.js';
import { createInkPass } from './render/inkPass.js';
import { createWorld } from './render/world.js';
import { CAMERA_FOV, CAMERA_START, ORBIT_TARGET, BACKGROUND_COLOR, BLEND_K } from './config.js';

const strider = CREATURES.find((c) => c.id === 'strider');
// PROTO-LOCAL HUMANOID PASS v3 (not authored into the cast; per feedback
// the proto is deliberately veering creature -> humanoid). Explicit
// authored values now — the v2 stand-rotation chain is collapsed into
// its results and re-proportioned. Every value below is ONE lever.
// vs v2: body r 0.30 -> 0.22 (side bulk), hips z 0.16 -> 0.11 and legs
// slimmed 0.12/0.11 -> 0.11/0.10 (front hip width: leg outer edge now
// FLUSH with the torso at 0.22), TAIL REMOVED (humanoid; it was half
// the side-view lump), head raised a touch (1.49 -> 1.56) for length.
// NOTE: the knee is no longer tucked inside the slim body — on the
// isosurface that is a FEATURE (a visible bending knee, no rims to
// leak); the static proto SHELL toggle will now show rim artifacts at
// knees and body — expected, the shell path is not humanoid-valid.
const THIGH_K = 0.30; // armpit/crotch softener (was 0.34 on the fat body)
const HEAD = [0.02, 1.56, 0]; // head center; eyes ride it at authored offsets
const OVERRIDE = {
  body: { a: [0.11, 0.90, 0], b: [0.11, 1.20, 0], r: 0.22 },
  neck: { a: [0.11, 1.20, 0], b: [0.05, 1.40, 0], r: 0.10 },
  head: { a: HEAD },
  thigh_l: { a: [0.10, 0.85, 0.11], b: [0.0, 0.71, 0.12], r: 0.11, kPrim: THIGH_K },
  thigh_r: { a: [0.10, 0.85, -0.11], b: [0.0, 0.71, -0.12], r: 0.11, kPrim: THIGH_K },
  leg_l: { a: [0.0, 0.71, 0.12], b: [0.12, 0.06, 0.12], r: 0.10 }, // feet PLANTED
  leg_r: { a: [0.0, 0.71, -0.12], b: [0.12, 0.06, -0.12], r: 0.10 },
  tail: null, // removed: humanoid
};
const headSrc = strider.prims.find((p) => p.id === 'head');
const prims = strider.prims.flatMap((p) => {
  if (OVERRIDE[p.id] === null) return [];
  if (p.id.startsWith('eyeball') || p.id.startsWith('iris')) {
    // authored offset from the head center, re-anchored on the new head
    return [{ ...p, a: [HEAD[0] + (p.a[0] - headSrc.a[0]), HEAD[1] + (p.a[1] - headSrc.a[1]), p.a[2]] }];
  }
  return [{ ...p, ...(OVERRIDE[p.id] ?? {}) }];
});
const inflate = strider.inflate ?? 0;

// --- renderer / scene / camera / stage (mirrors main.js exactly) ---
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

// --- SHELL strider (fixed geometry; the field follows uK in the shader) ---
const shellMat = createBlendMaterial(prims, strider.inflate, strider.step?.knees);
const shellMesh = new THREE.Mesh(buildShellGeometry(prims, strider.step?.knees), shellMat);
shellMesh.frustumCulled = false; // shell vertices move in the shader
scene.add(shellMesh);

// --- SURFACE NETS strider (re-baked when the blend changes) ---
const snMat = createSurfaceNetsMaterial(prims, strider.inflate);
const snMesh = new THREE.Mesh(new THREE.BufferGeometry(), snMat);
scene.add(snMesh);

let blendK = BLEND_K;
let lastBake = { verts: 0, tris: 0, ms: 0 };
function rebakeSN(k) {
  const t0 = performance.now();
  const sn = buildSurfaceNetsGeometry(prims, { inflate, blendK: k }); // dial moves the GLOBAL k; thighs stay pinned at THIGH_K
  lastBake = { verts: sn.vertexCount, tris: sn.triCount, ms: performance.now() - t0 };
  snMesh.geometry.dispose(); // the old bake's buffers are done
  snMesh.geometry = sn.geometry;
  snMat.uniforms.uK.value = k; // shading field must match the meshed field
  shellMat.uniforms.uK.value = k; // keep the toggle honest — same k on both
}
rebakeSN(blendK);

// --- HUD ---
const bar = document.createElement('div');
bar.style.cssText =
  'position:fixed;top:0;left:0;right:0;padding:10px 14px;font:14px/1.4 system-ui,sans-serif;' +
  'color:#12303a;background:rgba(238,246,244,0.86);backdrop-filter:blur(3px);z-index:10;' +
  'display:flex;gap:12px;align-items:center;flex-wrap:wrap;';
document.body.appendChild(bar);

const mkBtn = (text) => {
  const b = document.createElement('button');
  b.textContent = text;
  b.style.cssText =
    'font:600 13px system-ui,sans-serif;padding:6px 12px;border:1px solid #2e8478;border-radius:7px;' +
    'background:#3fa89a;color:#fff;cursor:pointer;transition:opacity .12s;';
  return b;
};
const btnSN = mkBtn('[2] Surface Nets');
const btnShell = mkBtn('[1] Shell');

// blend dial
const dialWrap = document.createElement('span');
dialWrap.style.cssText = 'display:flex;align-items:center;gap:6px;';
const dialLabel = document.createElement('span');
const dial = document.createElement('input');
dial.type = 'range';
dial.min = '0.18';
dial.max = '0.45';
dial.step = '0.01';
dial.value = String(blendK);
dial.style.cssText = 'width:180px;';
dialWrap.append(document.createTextNode('blend k'), dial, dialLabel);

const status = document.createElement('span');
status.style.cssText = 'margin-left:2px;color:#2e8478;';
bar.append(btnSN, btnShell, dialWrap, status);

const hint = document.createElement('div');
hint.textContent =
  'Drag to orbit \u00b7 scroll to zoom \u00b7 widen "blend k" until the leg-body nicks open up (watch the legs stay distinct)';
hint.style.cssText =
  'position:fixed;bottom:8px;left:0;right:0;text-align:center;font:12px system-ui,sans-serif;' +
  'color:#2e8478;z-index:10;pointer-events:none;';
document.body.appendChild(hint);

let mode = 'sn';
function refresh() {
  shellMesh.visible = mode === 'shell';
  snMesh.visible = mode === 'sn';
  btnSN.style.opacity = mode === 'sn' ? '1' : '0.5';
  btnShell.style.opacity = mode === 'shell' ? '1' : '0.5';
  dialLabel.textContent = blendK.toFixed(2);
  status.innerHTML =
    mode === 'sn'
      ? '<b>SURFACE NETS</b> \u2014 ' + lastBake.verts.toLocaleString() + ' verts, baked ' + lastBake.ms.toFixed(0) + ' ms'
      : '<b>SHELL</b> (current) \u2014 donor-shell union';
}
btnSN.onclick = () => { mode = 'sn'; refresh(); };
btnShell.onclick = () => { mode = 'shell'; refresh(); };
window.addEventListener('keydown', (e) => {
  if (e.key === '1') { mode = 'shell'; refresh(); }
  if (e.key === '2') { mode = 'sn'; refresh(); }
});
// Live label while dragging; re-mesh only on release (a bake is ~0.5 s).
dial.addEventListener('input', () => { dialLabel.textContent = Number(dial.value).toFixed(2); });
dial.addEventListener('change', () => {
  blendK = Number(dial.value);
  status.textContent = 'meshing\u2026';
  // Defer so the "meshing" label paints before the synchronous bake.
  setTimeout(() => { rebakeSN(blendK); refresh(); }, 20);
});
refresh();

// --- ink pass + render loop (mirrors main.js) ---
const inkPass = createInkPass(renderer, camera);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  inkPass.setSize(window.innerWidth, window.innerHeight);
});
renderer.setAnimationLoop(() => {
  controls.update();
  inkPass.render(scene, camera);
});

console.log('[strider proto] SN baked: ' + lastBake.verts + ' verts, ' + lastBake.ms.toFixed(0) + ' ms at k=' + blendK + '. Keys [1]/[2]; blend dial re-bakes on release.');
