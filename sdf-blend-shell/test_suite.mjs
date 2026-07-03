// ============================================================
// test_suite.mjs — committed permanent guard (run: node test_suite.mjs)
//
// ONE-TIME LOCAL SETUP: `npm install three@0.170.0`
// (the browser gets three from the CDN import map; Node needs a local
// copy to resolve the same imports. node_modules/ is gitignored.)
//
// Section 0: import every src/ module (except the boot entry main.js)
//            so the browser is never the first parser to see the code.
// Section 1: logic probes with hand-computed expected values.
// ============================================================

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

let failures = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.error(`  FAIL  ${label}`);
  }
}

// ---------- Section 0: module health ----------
console.log('Section 0: module health');

// Minimal DOM stub so UI-touching modules can import headlessly.
globalThis.window = {};
globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ getContext: () => null, style: {} }),
  addEventListener: () => {},
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

const modules = walk('src').filter((p) => !p.endsWith('main.js')); // main.js needs a real canvas
for (const modPath of modules) {
  try {
    await import(pathToFileURL(modPath).href);
    console.log(`  PASS  import ${modPath}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL  import ${modPath}: ${err.message}`);
  }
}

delete globalThis.window;
delete globalThis.document;

// ---------- Section 1: logic probes ----------
console.log('Section 1: logic probes');

const { CREATURE } = await import('./src/data/creature.js');
const { MAX_PRIMS, BLEND_K, COLOR_SOFT, COLOR_POW, WAVE_AMPLITUDE, WAVE_SPEED } = await import('./src/config.js');
const { buildShellGeometry } = await import('./src/render/buildShell.js');
const { createBlendMaterial } = await import('./src/render/blendMaterial.js');
const { rotateAboutPivot, updateAnim, ANIM_PRIM_INDEX } = await import('./src/anim.js');

// Registry shape: every primitive must be renderable by buildShell + shader.
for (const prim of CREATURE) {
  assert(typeof prim.id === 'string' && prim.id.length > 0, `prim has id (${prim.id})`);
  assert(Array.isArray(prim.a) && prim.a.length === 3, `${prim.id}: a is [x,y,z]`);
  assert(prim.b === undefined || (Array.isArray(prim.b) && prim.b.length === 3), `${prim.id}: b is [x,y,z] or omitted`);
  assert(typeof prim.r === 'number' && prim.r > 0, `${prim.id}: r > 0`);
  assert(prim.color === undefined || typeof prim.color === 'number', `${prim.id}: color is a hex number or omitted`);
  assert(prim.paint === undefined || typeof prim.paint === 'boolean', `${prim.id}: paint is boolean or omitted`);
}
assert(CREATURE.length <= MAX_PRIMS, `creature fits shader capacity (${CREATURE.length} <= ${MAX_PRIMS})`);
assert(BLEND_K > 0, 'BLEND_K > 0 (smin divides by k)');

// Geometry: merge succeeded, aPrim attribute present and spans all primitives.
const geo = buildShellGeometry(CREATURE);
assert(geo !== null && geo.getAttribute('position').count > 0, 'merged geometry has vertices');
const aPrim = geo.getAttribute('aPrim');
assert(aPrim !== undefined, 'aPrim attribute exists (animated verts follow their prim)');
const seen = new Set(aPrim.array);
const solidCount = CREATURE.filter((p) => !p.paint).length;
assert(seen.size === solidCount, `aPrim covers all ${solidCount} SOLID primitives (saw ${seen.size})`);
assert([...seen].every((i) => !CREATURE[i].paint), 'no paint prim got a mesh (aPrim indices are all solid)');

// Material: uniform arrays are padded to exactly MAX_PRIMS, count is honest.
const mat = createBlendMaterial(CREATURE);
assert(mat.uniforms.uA.value.length === MAX_PRIMS, 'uA padded to MAX_PRIMS');
assert(mat.uniforms.uR.value.length === MAX_PRIMS, 'uR padded to MAX_PRIMS');
assert(mat.uniforms.uColors.value.length === MAX_PRIMS, 'uColors padded to MAX_PRIMS');
assert(mat.uniforms.uPaint.value.length === MAX_PRIMS, 'uPaint padded to MAX_PRIMS');
assert(CREATURE.every((p, i) => mat.uniforms.uPaint.value[i] === (p.paint ? 1.0 : 0.0)), 'uPaint flags mirror the registry');
assert(mat.uniforms.uCount.value === CREATURE.length, 'uCount matches creature');
assert(mat.uniforms.uAnimPrim.value === -1, 'uAnimPrim defaults to -1 (main.js wires it)');

// Hand-computed smin check (JS mirror of the shader function):
// smin(1.0, 1.0, 0.25) => h = 0.5, mix = 1.0, minus 0.25*0.25 = 0.9375.
// Verifies the polynomial form we shipped is the one we think it is.
function smin(a, b, k) {
  const h = Math.min(Math.max(0.5 + (0.5 * (b - a)) / k, 0), 1);
  return b * (1 - h) + a * h - k * h * (1 - h);
}
assert(Math.abs(smin(1.0, 1.0, 0.25) - 0.9375) < 1e-9, 'smin(1,1,0.25) = 0.9375 (hand-computed)');
assert(smin(5.0, 1.0, 0.25) === 1.0, 'smin far apart degrades to plain min');

// Color weights (JS mirror of blendColor's weighting):
// touching primitive (d=0) must massively outweigh one 0.1 away —
// hand-computed with SOFT=0.015, POW=2: w(0)=4444.4, w(0.1)=75.6 (ratio 58.8).
function colorWeight(d) {
  return 1 / Math.pow(Math.max(d, 0) + COLOR_SOFT, COLOR_POW);
}
assert(colorWeight(0) > 50 * colorWeight(0.1), 'contact color dominates at the surface (w0 > 50*w0.1)');
assert(Math.abs(colorWeight(0.05) / (colorWeight(0.05) + colorWeight(0.05)) - 0.5) < 1e-12, 'equal distances = 50/50 color mix');

// Wave math: rotate arm's b around its a by +90deg about Z (hand-computed).
// a=(0.45,0.25,0), b=(1.25,0.9,0.15): b-a=(0.8,0.65,0.15) -> Rz90 -> (-0.65,0.8,0.15)
// -> +a = (-0.2, 1.05, 0.15).
const bRot = rotateAboutPivot([0.45, 0.25, 0], [1.25, 0.9, 0.15], [0, 0, 1], Math.PI / 2);
assert(
  Math.abs(bRot.x - -0.2) < 1e-9 && Math.abs(bRot.y - 1.05) < 1e-9 && Math.abs(bRot.z - 0.15) < 1e-9,
  'rotateAboutPivot 90deg about Z = (-0.2, 1.05, 0.15) (hand-computed)'
);

// updateAnim: t=0 => sin=0 => rest pose exactly (uB unchanged, uAnimMat identity-ish).
assert(ANIM_PRIM_INDEX >= 0, `animated prim '${CREATURE[ANIM_PRIM_INDEX]?.id}' found in registry`);
const restB = mat.uniforms.uB.value[ANIM_PRIM_INDEX].clone();
updateAnim(mat, 0);
assert(mat.uniforms.uB.value[ANIM_PRIM_INDEX].distanceTo(restB) < 1e-9, 'updateAnim(t=0) keeps rest pose');
// Quarter period of sin: t = (PI/2)/WAVE_SPEED => angle = WAVE_AMPLITUDE => b must move.
updateAnim(mat, Math.PI / 2 / WAVE_SPEED);
const moved = mat.uniforms.uB.value[ANIM_PRIM_INDEX].distanceTo(restB);
assert(moved > 0.01, `updateAnim(peak) moves b (moved ${moved.toFixed(3)} > 0.01) — the wave is not inert`);
assert(WAVE_AMPLITUDE > 0 && WAVE_SPEED > 0, 'wave constants are live');

// Burial classification (JS mirror of the shader's tuck check, using the
// torso from the registry). Hand-computed distances:
//   head-bottom (-0.95,0.25,0): |(-0.4,0.25,0)| - 0.5 = -0.0283  -> buried
//   head-top    (-0.95,0.95,0): |(-0.4,0.95,0)| - 0.5 = +0.5308  -> exposed
//   arm root    ( 0.45,0.25,0): |(0,0.25,0)|    - 0.5 = -0.25    -> deeply buried
function sdCapsule(p, a, b, r) {
  const pa = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const bb = Math.max(ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2], 1e-8);
  const h = Math.min(Math.max((pa[0] * ba[0] + pa[1] * ba[1] + pa[2] * ba[2]) / bb, 0), 1);
  const d = [pa[0] - ba[0] * h, pa[1] - ba[1] * h, pa[2] - ba[2] * h];
  return Math.hypot(d[0], d[1], d[2]) - r;
}
const { TUCK_DEPTH, BURY_EPS } = await import('./src/config.js');
const body = CREATURE.find((p) => p.id === 'body');
const tail = CREATURE.find((p) => p.id === 'tail');
const legFl = CREATURE.find((p) => p.id === 'leg_fl');
// tail root (0.5,0.7,0): closest body point (0.5,0.55,0) -> |(0,0.15,0)| - 0.42 = -0.27 exactly
const dTailRoot = sdCapsule(tail.a, body.a, body.b, body.r);
// leg_fl top (-0.42,0.45,0.22): closest (-0.42,0.55,0) -> sqrt(0.01+0.0484) - 0.42 = -0.1783
const dLegTop = sdCapsule(legFl.a, body.a, body.b, body.r);
// tail tip (1.05,1.05,0): closest (0.5,0.55,0) -> sqrt(0.3025+0.25) - 0.42 = +0.3233
const dTailTip = sdCapsule(tail.b, body.a, body.b, body.r);
assert(Math.abs(dTailRoot - -0.27) < 1e-9 && dTailRoot < -BURY_EPS, 'tail root is deeply buried in body (d = -0.27 exactly, hand-computed)');
assert(Math.abs(dLegTop - -0.1783) < 1e-3 && dLegTop < -BURY_EPS, 'leg_fl top is buried in body (d = -0.1783, hand-computed)');
assert(Math.abs(dTailTip - 0.3233) < 1e-3 && dTailTip > -BURY_EPS, 'tail tip is exposed (d = +0.3233, hand-computed)');
assert(TUCK_DEPTH > 0 && BURY_EPS > 0 && TUCK_DEPTH > BURY_EPS, 'tuck constants sane (depth > dead-zone > 0)');

// Painted eyes must POKE THROUGH the head's skin to be visible, while
// staying anchored inside it. Hand-computed for eye offset (0.20,0.08,0.14)
// from head center: |offset| = 0.2569; reach = 0.2569 + 0.08 = 0.3369.
// Anchored: 0.2569 < 0.32. Visible: 0.3369 > 0.32.
const head = CREATURE.find((p) => p.id === 'head');
for (const eye of CREATURE.filter((p) => p.paint)) {
  const off = Math.hypot(eye.a[0] - head.a[0], eye.a[1] - head.a[1], eye.a[2] - head.a[2]);
  assert(Math.abs(off - 0.2569) < 1e-3 && off < head.r, `${eye.id} anchored inside head (|offset| = 0.2569 < 0.32, hand-computed)`);
  assert(Math.abs(off + eye.r - 0.3369) < 1e-3 && off + eye.r > head.r, `${eye.id} pokes through the skin (reach = 0.3369 > 0.32, hand-computed)`);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
