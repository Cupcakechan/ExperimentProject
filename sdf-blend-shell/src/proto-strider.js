// proto-strider.js — ISOLATED strider slice (R4 look validation).
// Renders ONLY the strider, two ways, so the isosurface can be judged
// against the donor-shell it would replace:
//   [1] SHELL         — buildShellGeometry + createBlendMaterial: the
//                       CURRENT renderer (a union of per-prim meshes
//                       snapped onto the field). Shows the leg-junction
//                       cuts / missing chunks.
//   [2] SURFACE NETS  — buildSurfaceNetsGeometry + createSurfaceNetsMaterial:
//                       R4. The field meshed into ONE watertight skin, so
//                       a limb and the body are the same surface — the
//                       cuts are structurally impossible.
// Same stage, same camera, same shading + ink pass — the ONLY variable is
// shell-vs-isosurface. Press [1]/[2] or the buttons to A/B; drag to orbit
// into the leg junctions. Nothing here touches the main app or the cast.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CREATURES } from './data/creatures.js';
import { buildShellGeometry } from './render/buildShell.js';
import { buildSurfaceNetsGeometry } from './render/surfaceNets.js';
import { createBlendMaterial, createSurfaceNetsMaterial } from './render/blendMaterial.js';
import { createInkPass } from './render/inkPass.js';
import { createWorld } from './render/world.js';
import { CAMERA_FOV, CAMERA_START, ORBIT_TARGET, BACKGROUND_COLOR } from './config.js';

const strider = CREATURES.find((c) => c.id === 'strider');
const inflate = strider.inflate ?? 0;

// --- renderer / scene / camera / stage (mirrors main.js exactly) ---
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// Same LinearSRGB clear as main.js (the ink target skips sRGB output).
scene.background = new THREE.Color().setHex(BACKGROUND_COLOR, THREE.LinearSRGBColorSpace);

const camera = new THREE.PerspectiveCamera(CAMERA_FOV, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(...CAMERA_START);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(...ORBIT_TARGET);
controls.enableDamping = true;

createWorld(scene);

// --- the two strider skins, at the SAME authored position ---
const shellMesh = new THREE.Mesh(
  buildShellGeometry(strider.prims, strider.step?.knees),
  createBlendMaterial(strider.prims, strider.inflate, strider.step?.knees),
);
shellMesh.frustumCulled = false; // shell vertices move in the shader — CPU bounds are wrong
scene.add(shellMesh);

const t0 = performance.now();
const sn = buildSurfaceNetsGeometry(strider.prims, { inflate });
const meshMs = performance.now() - t0;
const snMesh = new THREE.Mesh(sn.geometry, createSurfaceNetsMaterial(strider.prims, strider.inflate));
scene.add(snMesh);

// --- HUD: title bar + A/B buttons + hint ---
const bar = document.createElement('div');
bar.style.cssText =
  'position:fixed;top:0;left:0;right:0;padding:10px 14px;font:14px/1.4 system-ui,sans-serif;' +
  'color:#12303a;background:rgba(238,246,244,0.82);backdrop-filter:blur(3px);z-index:10;' +
  'display:flex;gap:10px;align-items:center;flex-wrap:wrap;';
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
const btnShell = mkBtn('[1] Shell (current)');
const label = document.createElement('span');
label.style.cssText = 'margin-left:4px;';
bar.append(btnSN, btnShell, label);

const hint = document.createElement('div');
hint.textContent = 'Drag to orbit · scroll to zoom · look at the leg-body junctions';
hint.style.cssText =
  'position:fixed;bottom:8px;left:0;right:0;text-align:center;font:12px system-ui,sans-serif;' +
  'color:#2e8478;z-index:10;pointer-events:none;';
document.body.appendChild(hint);

let mode = 'sn'; // start on the new thing
function setMode(m) {
  mode = m;
  shellMesh.visible = m === 'shell';
  snMesh.visible = m === 'sn';
  label.innerHTML =
    m === 'sn'
      ? `<b>SURFACE NETS</b> — one watertight skin: ${sn.vertexCount.toLocaleString()} verts / ` +
        `${sn.triCount.toLocaleString()} tris, meshed in ${meshMs.toFixed(0)} ms. No seams possible.`
      : '<b>SHELL (current)</b> — donor-shell union; the leg-junction cuts live here.';
  btnSN.style.opacity = m === 'sn' ? '1' : '0.5';
  btnShell.style.opacity = m === 'shell' ? '1' : '0.5';
}
btnSN.onclick = () => setMode('sn');
btnShell.onclick = () => setMode('shell');
window.addEventListener('keydown', (e) => {
  if (e.key === '1') setMode('shell');
  if (e.key === '2') setMode('sn');
});
setMode('sn');

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
  inkPass.render(scene, camera); // scene -> target, then the fullscreen ink pass -> canvas
});

// One-line console proof so the watertightness shows even without orbiting.
console.log(
  `[strider proto] Surface Nets: ${sn.ns.join('x')} grid, ${sn.vertexCount} verts, ` +
    `${sn.triCount} tris, ${meshMs.toFixed(0)} ms. Toggle [1] shell / [2] surface nets.`,
);
