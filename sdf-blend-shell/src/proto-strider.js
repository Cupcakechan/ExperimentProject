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
