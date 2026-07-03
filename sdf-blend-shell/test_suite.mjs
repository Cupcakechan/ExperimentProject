// ============================================================
// test_suite.mjs — committed permanent guard (run: node test_suite.mjs)
//
// ONE-TIME LOCAL SETUP (only if node_modules is missing):
//   npm install three@0.170.0
//
// Section 0: import every src/ module (except the boot entry main.js)
//            so the browser is never the first parser to see the code.
// Section 1: GENERALIZED creature invariants — every creature in the
//            gallery must satisfy every rule — plus hand-computed
//            regression anchors for known values.
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

// ---------- Section 1: creature invariants ----------
console.log('Section 1: creature invariants');

const { CREATURES } = await import('./src/data/creatures.js');
const { MAX_PRIMS, BLEND_K, COLOR_SOFT, COLOR_POW, TUCK_DEPTH, BURY_EPS, PAINT_EDGE } = await import('./src/config.js');
const { buildShellGeometry } = await import('./src/render/buildShell.js');
const { createBlendMaterial, createOutlineMaterial } = await import('./src/render/blendMaterial.js');
const { OUTLINE_WIDTH } = await import('./src/config.js');
const THREE = await import('three');
const { rotateAboutPivot, updateAnim, animPrimIndex } = await import('./src/anim.js');

// --- shared math (JS mirrors of the shader) ---
function sdCapsule(p, a, b, r) {
  const pa = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const bb = Math.max(ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2], 1e-8);
  const h = Math.min(Math.max((pa[0] * ba[0] + pa[1] * ba[1] + pa[2] * ba[2]) / bb, 0), 1);
  const d = [pa[0] - ba[0] * h, pa[1] - ba[1] * h, pa[2] - ba[2] * h];
  return Math.hypot(d[0], d[1], d[2]) - r;
}
function sdPrim(p, prim) {
  return sdCapsule(p, prim.a, prim.b ?? prim.a, prim.r);
}
function smin(a, b, k) {
  const h = Math.min(Math.max(0.5 + (0.5 * (b - a)) / k, 0), 1);
  return b * (1 - h) + a * h - k * h * (1 - h);
}
function colorWeight(d) {
  return 1 / Math.pow(Math.max(d, 0) + COLOR_SOFT, COLOR_POW);
}
// Angular radius of a decal's visible disc on a spherical host.
function discAngle(off, r, R) {
  return Math.acos((R * R + off * off - r * r) / (2 * R * off));
}

// --- global sanity (creature-independent) ---
assert(BLEND_K > 0, 'BLEND_K > 0 (smin divides by k)');
assert(TUCK_DEPTH > 0 && BURY_EPS > 0 && TUCK_DEPTH > BURY_EPS, 'tuck constants sane (depth > dead-zone > 0)');
assert(PAINT_EDGE > 0, 'PAINT_EDGE > 0 (smoothstep needs a nonzero edge)');
assert(Math.abs(smin(1.0, 1.0, 0.25) - 0.9375) < 1e-9, 'smin(1,1,0.25) = 0.9375 (hand-computed)');
assert(smin(5.0, 1.0, 0.25) === 1.0, 'smin far apart degrades to plain min');
assert(colorWeight(0) > 50 * colorWeight(0.1), 'contact color dominates at the surface (w0 > 50*w0.1)');
const bRot = rotateAboutPivot([0.45, 0.25, 0], [1.25, 0.9, 0.15], [0, 0, 1], Math.PI / 2);
assert(
  Math.abs(bRot.x - -0.2) < 1e-9 && Math.abs(bRot.y - 1.05) < 1e-9 && Math.abs(bRot.z - 0.15) < 1e-9,
  'rotateAboutPivot 90deg about Z = (-0.2, 1.05, 0.15) (hand-computed)'
);
assert(new Set(CREATURES.map((c) => c.id)).size === CREATURES.length, 'creature ids are unique');

// --- per-creature invariants: EVERY creature must satisfy EVERY rule ---
for (const creature of CREATURES) {
  const tag = `[${creature.id}]`;
  const prims = creature.prims;
  const solids = prims.filter((p) => !p.paint);

  // registry shape
  for (const prim of prims) {
    const ok =
      typeof prim.id === 'string' && prim.id.length > 0 &&
      Array.isArray(prim.a) && prim.a.length === 3 &&
      (prim.b === undefined || (Array.isArray(prim.b) && prim.b.length === 3)) &&
      typeof prim.r === 'number' && prim.r > 0 &&
      (prim.color === undefined || typeof prim.color === 'number') &&
      (prim.paint === undefined || typeof prim.paint === 'boolean') &&
      (prim.kCap === undefined || (typeof prim.kCap === 'number' && prim.kCap > 0));
    assert(ok, `${tag} ${prim.id}: well-formed prim`);
  }
  assert(prims.length <= MAX_PRIMS, `${tag} fits shader capacity (${prims.length} <= ${MAX_PRIMS})`);
  assert(new Set(prims.map((p) => p.id)).size === prims.length, `${tag} prim ids are unique`);

  // geometry: solids meshed, paints not, aPrim carries registry indices
  const geo = buildShellGeometry(prims);
  const aPrim = geo.getAttribute('aPrim');
  assert(geo.getAttribute('position').count > 0 && aPrim !== undefined, `${tag} merged geometry + aPrim exist`);
  const seen = new Set(aPrim.array);
  assert(seen.size === solids.length, `${tag} aPrim covers all ${solids.length} solid prims (saw ${seen.size})`);
  assert([...seen].every((i) => !prims[i].paint), `${tag} no paint prim got a mesh`);

  // ring density: the LONGEST capsule must have interior rings, or joins
  // along it starve (the detached-legs defect class)
  let longest = null;
  let longestLen = 0;
  for (const s of solids) {
    if (!s.b) continue;
    const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]);
    if (len > longestLen) { longest = s; longestLen = len; }
  }
  if (longest) {
    const idx = prims.indexOf(longest);
    const dir = [(longest.b[0] - longest.a[0]) / longestLen, (longest.b[1] - longest.a[1]) / longestLen, (longest.b[2] - longest.a[2]) / longestLen];
    const pos = geo.getAttribute('position');
    const interior = new Set();
    for (let i = 0; i < pos.count; i++) {
      if (aPrim.array[i] !== idx) continue;
      const t = (pos.getX(i) - longest.a[0]) * dir[0] + (pos.getY(i) - longest.a[1]) * dir[1] + (pos.getZ(i) - longest.a[2]) * dir[2];
      if (t > 0.02 && t < longestLen - 0.02) interior.add(t.toFixed(3));
    }
    assert(interior.size >= 3, `${tag} longest capsule '${longest.id}' has interior rings (saw ${interior.size}, need >= 3)`);
  }

  // paint prims: anchored inside a solid host AND poking through its skin:
  // -r < dist(center, host surface) < 0. Host = nearest solid.
  const hostOf = {};
  for (const paint of prims.filter((p) => p.paint)) {
    let host = null;
    let hostSd = Infinity;
    for (const s of solids) {
      const sd = sdPrim(paint.a, s);
      if (sd < hostSd) { hostSd = sd; host = s; }
    }
    hostOf[paint.id] = { host, hostSd };
    assert(hostSd < 0, `${tag} ${paint.id} anchored inside a solid ('${host?.id}', sd ${hostSd.toFixed(4)} < 0)`);
    assert(hostSd > -paint.r, `${tag} ${paint.id} pokes through the skin (sd ${hostSd.toFixed(4)} > -r ${-paint.r})`);
  }

  // layered decals: every pupil_X pairs with an EARLIER sclera_X on the
  // SAME spherical host, and its disc fits fully inside the sclera's disc.
  for (const pupil of prims.filter((p) => p.paint && p.id.startsWith('pupil_'))) {
    const side = pupil.id.slice('pupil_'.length);
    const si = prims.findIndex((p) => p.id === 'sclera_' + side);
    const pi = prims.indexOf(pupil);
    assert(si >= 0 && pi > si, `${tag} ${pupil.id} comes after sclera_${side} (decal order)`);
    if (si < 0) continue;
    const sclera = prims[si];
    const hostS = hostOf[sclera.id].host;
    const hostP = hostOf[pupil.id].host;
    assert(hostS === hostP && hostS.b === undefined, `${tag} ${pupil.id} + sclera_${side} share a spherical host ('${hostS?.id}')`);
    if (hostS !== hostP || hostS.b !== undefined) continue;
    const H = hostS.a;
    const R = hostS.r;
    const vS = [sclera.a[0] - H[0], sclera.a[1] - H[1], sclera.a[2] - H[2]];
    const vP = [pupil.a[0] - H[0], pupil.a[1] - H[1], pupil.a[2] - H[2]];
    const nS = Math.hypot(...vS);
    const nP = Math.hypot(...vP);
    const gazeSep = Math.acos(Math.min(1, (vS[0] * vP[0] + vS[1] * vP[1] + vS[2] * vP[2]) / (nS * nP)));
    const aS = discAngle(nS, sclera.r, R);
    const aP = discAngle(nP, pupil.r, R);
    assert(gazeSep + aP <= aS, `${tag} ${pupil.id} disc fits inside sclera disc (${(gazeSep + aP).toFixed(3)} <= ${aS.toFixed(3)})`);
  }

  // material: padding + honest flags
  const mat = createBlendMaterial(prims);
  assert(mat.uniforms.uA.value.length === MAX_PRIMS && mat.uniforms.uPaint.value.length === MAX_PRIMS, `${tag} uniforms padded to MAX_PRIMS`);
  assert(mat.uniforms.uCount.value === prims.length, `${tag} uCount matches`);
  assert(prims.every((p, i) => mat.uniforms.uPaint.value[i] === (p.paint ? 1.0 : 0.0)), `${tag} uPaint flags mirror the registry`);
  assert(mat.uniforms.uKCap.value.length === MAX_PRIMS, `${tag} uKCap padded to MAX_PRIMS`);
  assert(prims.every((p, i) => mat.uniforms.uKCap.value[i] === (p.kCap != null ? p.kCap : 1e3)), `${tag} uKCap mirrors the registry (uncapped = sentinel 1e3)`);
  assert(mat.uniforms.uSnapOffset.value === 0.0, `${tag} skin material snaps to the zero surface`);
  const IDENTITY = new THREE.Matrix4();
  assert(mat.uniforms.uPrimMat.value.length === MAX_PRIMS, `${tag} uPrimMat padded to MAX_PRIMS`);
  assert(mat.uniforms.uPrimMat.value.every((m) => m.equals(IDENTITY)), `${tag} every prim starts at identity (rest pose)`);
  assert(new Set(mat.uniforms.uPrimMat.value).size === MAX_PRIMS, `${tag} uPrimMat slots are SEPARATE instances (no shared matrix)`);
  assert(mat.uniforms.uAnimPrim === undefined, `${tag} old single-slot uAnimPrim is gone`);

  // outline material: same field, offset snap target, back faces only
  const ink = createOutlineMaterial(prims);
  assert(ink.uniforms.uSnapOffset.value === OUTLINE_WIDTH, `${tag} outline snaps to the +${OUTLINE_WIDTH} offset surface`);
  assert(ink.side === THREE.BackSide, `${tag} outline renders BACK faces only (inverted hull on the offset surface)`);
  assert(ink.uniforms.uA.value.length === MAX_PRIMS && ink.uniforms.uKCap.value.length === MAX_PRIMS, `${tag} outline uniforms padded to MAX_PRIMS`);
  assert(ink.uniforms.uB.value !== mat.uniforms.uB.value, `${tag} skin and outline own SEPARATE uniform instances (anim writes both explicitly)`);
  // Buried patches fold when projected onto a target surface — part of a
  // buried cap lands with INVERTED winding, showing back faces (= black on
  // the BackSide ink) from outside. The buried ink patch must therefore end
  // BELOW the skin, occluded: ink tuck = snapOffset + TUCK_DEPTH puts
  // buried ink verts at -TUCK_DEPTH (inside the creature).
  assert(mat.uniforms.uTuck.value === TUCK_DEPTH, `${tag} skin tucks buried verts (uTuck = TUCK_DEPTH)`);
  assert(ink.uniforms.uTuck.value === OUTLINE_WIDTH + TUCK_DEPTH, `${tag} ink tuck = OUTLINE_WIDTH + TUCK_DEPTH`);
  assert(ink.uniforms.uSnapOffset.value - ink.uniforms.uTuck.value < 0, `${tag} buried ink ends BELOW the skin (${(ink.uniforms.uSnapOffset.value - ink.uniforms.uTuck.value).toFixed(3)} < 0) — occluded, not painted`);
  assert(mat.uniforms.uBuryBand.value > 0 && ink.uniforms.uBuryBand.value > 0, `${tag} both materials carry the burial ramp (uBuryBand > 0)`);

  // the ink must be thinner than the thinnest solid, or it swallows it
  const minSolidR = Math.min(...solids.map((s) => s.r));
  assert(OUTLINE_WIDTH < minSolidR, `${tag} OUTLINE_WIDTH ${OUTLINE_WIDTH} < thinnest solid r ${minSolidR}`);

  // anim: named prim exists, rest pose at t=0, actually moves at peak —
  // BEHAVIOR PARITY with the old single-slot path, now via uPrimMat.
  if (creature.anim) {
    const idx = animPrimIndex(creature);
    assert(idx >= 0, `${tag} anim prim '${creature.anim.primId}' found`);
    if (idx >= 0) {
      const restA = mat.uniforms.uA.value[idx].clone();
      const restB = mat.uniforms.uB.value[idx].clone();
      updateAnim(mat, 0, creature, idx);
      assert(mat.uniforms.uB.value[idx].distanceTo(restB) < 1e-9, `${tag} updateAnim(t=0) keeps rest pose`);
      assert(mat.uniforms.uPrimMat.value[idx].equals(IDENTITY), `${tag} updateAnim(t=0) writes identity to uPrimMat`);
      updateAnim(mat, Math.PI / 2 / creature.anim.speed, creature, idx);
      const moved = mat.uniforms.uB.value[idx].distanceTo(restB);
      assert(moved > 0.01, `${tag} updateAnim(peak) moves '${creature.anim.primId}' (${moved.toFixed(3)} > 0.01) — the wave is not inert`);
      assert(mat.uniforms.uA.value[idx].distanceTo(restA) < 1e-9, `${tag} pivot invariant: 'a' never moves under rotation about a`);
      assert(!mat.uniforms.uPrimMat.value[idx].equals(IDENTITY), `${tag} peak writes a non-identity uPrimMat`);
      const untouched = mat.uniforms.uPrimMat.value.filter((m, i) => i !== idx);
      assert(untouched.every((m) => m.equals(IDENTITY)), `${tag} non-animated prims stay at identity`);
    }
  }
}

// --- hand-computed regression anchors (exact values for known creatures) ---
const critter = CREATURES.find((c) => c.id === 'critter');
const hopper = CREATURES.find((c) => c.id === 'hopper');
const longneck = CREATURES.find((c) => c.id === 'longneck');
assert(critter && hopper && longneck, 'gallery holds critter, hopper, longneck');
function paintSd(creature, paintId, hostId) {
  const paint = creature.prims.find((p) => p.id === paintId);
  const host = creature.prims.find((p) => p.id === hostId);
  return sdPrim(paint.a, host);
}
assert(Math.abs(paintSd(critter, 'sclera_l', 'head') - -0.0631) < 1e-3, 'critter sclera_l sd vs head = -0.0631 (hand-computed)');
assert(Math.abs(paintSd(hopper, 'sclera_l', 'body') - -0.0229) < 1e-3, 'hopper sclera_l sd vs body = -0.0229 (hand-computed)');
assert(Math.abs(paintSd(longneck, 'sclera_l', 'head') - -0.0381) < 1e-3, 'longneck sclera_l sd vs head = -0.0381 (hand-computed)');
assert(Math.abs(sdPrim(critter.prims.find((p) => p.id === 'tail').a, critter.prims.find((p) => p.id === 'body')) - -0.27) < 1e-9, 'critter tail root buried d = -0.27 exactly (hand-computed)');

// Decals ride the inflated skin (the k=0.6 vanishing-eyes defect):
// coverage subtracts the local skin inflation so a decal stays visible at
// any blend radius. JS mirror of the shader's coverage; smoothstep as GLSL.
function smoothstep(a, b, x) {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}
function coverage(paintSd, infl) {
  return 1 - smoothstep(0, PAINT_EDGE, paintSd - infl);
}
// Test point: on the eye's gaze ray, on a skin inflated by 0.15 (~k=0.6's
// max deficit k/4). Hand-computed paint distances at that point:
//   hopper pupil:   |0.5+0.15 - 0.48| - 0.055 = 0.115
//   longneck pupil: |0.22+0.15 - 0.20| - 0.03  = 0.14
// OLD model (infl ignored) -> coverage 0 (the reported bug).
// NEW model (infl subtracted) -> full coverage.
assert(coverage(0.115, 0) < 0.01, 'hopper pupil at inflated skin, OLD model: invisible (reproduces the bug)');
assert(coverage(0.115, 0.15) > 0.99, 'hopper pupil at inflated skin, NEW model: fully covered (the fix)');
assert(coverage(0.14, 0) < 0.01, 'longneck pupil at inflated skin, OLD model: invisible (reproduces the bug)');
assert(coverage(0.14, 0.15) > 0.99, 'longneck pupil at inflated skin, NEW model: fully covered (the fix)');
// And at rest (no inflation) the pupil center is covered as before:
// hopper skin point on the ray at R=0.5: |0.5-0.48| - 0.055 = -0.035 < 0.
assert(coverage(-0.035, 0) > 0.99, 'hopper pupil at rest skin: covered (no regression at low k)');

// Continuous burial ramp (JS mirror of the shader's buryT). Hand-computed:
// 0 exactly at the boundary (-BURY_EPS), 1 once BURY_BAND deeper, and
// smoothstep's midpoint is exactly 0.5.
const { BURY_BAND } = await import('./src/config.js');
function buryT(dOther) {
  return 1 - smoothstep(-BURY_EPS - BURY_BAND, -BURY_EPS, dOther);
}
assert(BURY_BAND > 0, 'BURY_BAND > 0');
assert(buryT(-BURY_EPS) === 0, 'buryT at the boundary = 0 (no cliff — continuous with exposed verts)');
assert(buryT(-BURY_EPS - BURY_BAND) === 1, 'buryT at full depth = 1 (fully tucked)');
assert(Math.abs(buryT(-BURY_EPS - BURY_BAND / 2) - 0.5) < 1e-9, 'buryT at half depth = 0.5 exactly (hand-computed)');
assert(buryT(0.1) === 0, 'exposed verts never tuck (buryT = 0)');

// Roam: deterministic, seeded, bounded, separated, resettable.
const { createRoam } = await import('./src/roam.js');
const { ROAM_SPEED, ROAM_HARD_RADIUS, ROAM_SEP_RADIUS, GROUND_RADIUS, BOB_AMPLITUDE, BOB_SPEED } = await import('./src/config.js');
assert(ROAM_SPEED > 0 && BOB_AMPLITUDE > 0 && BOB_SPEED > 0, 'roam/bob constants are live');
assert(GROUND_RADIUS > ROAM_HARD_RADIUS, `the ground outreaches the roamers (${GROUND_RADIUS} > ${ROAM_HARD_RADIUS}) — nobody walks off the world`);

// Determinism + reset (same seed = same path, forever).
const roamA = createRoam(0);
const roamB = createRoam(0);
let poseA = null;
let poseB = null;
for (let i = 0; i < 2000; i++) {
  poseA = roamA.update(1 / 60);
  poseB = roamB.update(1 / 60);
}
assert(poseA.x === poseB.x && poseA.z === poseB.z && poseA.heading === poseB.heading, 'roam is deterministic (same seed, identical 2000-step paths)');
assert(Number.isFinite(poseA.heading), 'heading stays finite');
roamA.reset();
const fresh = roamA.update(1 / 60);
const freshC = createRoam(0).update(1 / 60);
assert(fresh.x === freshC.x && fresh.z === freshC.z, 'reset() restores the exact initial state');

// Seeds diverge — the field must not wander in unison.
let s0 = createRoam(0);
let s1 = createRoam(1);
let p0 = null;
let p1 = null;
for (let i = 0; i < 300; i++) {
  p0 = s0.update(1 / 60);
  p1 = s1.update(1 / 60);
}
assert(Math.hypot(p0.x - p1.x, p0.z - p1.z) > 0.3, 'different seeds walk different paths');

// Separation heading term is not inert: a close neighbor changes the path.
const lone = createRoam(0);
const crowded = createRoam(0);
const loneP = lone.update(1 / 60);
const crowdedP = crowded.update(1 / 60, [{ x: loneP.x - 0.1, z: loneP.z }]);
assert(loneP.heading !== crowdedP.heading || loneP.x !== crowdedP.x, 'a neighbor inside SEP_RADIUS alters the update');

// The field simulation, MEASURED (3 seeded roamers, mutual separation,
// ~100 simulated seconds): closest approach 1.234, max radius exactly
// 2.400 (the hard clamp). Thresholds set from measurement with margin.
const fieldRoams = [createRoam(0), createRoam(1), createRoam(2)];
const fieldPos = fieldRoams.map(() => ({ x: 0, z: 0 }));
let minPair = Infinity;
let fieldMaxR = 0;
for (let i = 0; i < 6000; i++) {
  fieldRoams.forEach((r, j) => {
    const p = r.update(1 / 60, fieldPos.filter((_, k) => k !== j));
    fieldPos[j] = { x: p.x, z: p.z };
    fieldMaxR = Math.max(fieldMaxR, Math.hypot(p.x, p.z));
  });
  for (let a = 0; a < 3; a++) {
    for (let b = a + 1; b < 3; b++) {
      minPair = Math.min(minPair, Math.hypot(fieldPos[a].x - fieldPos[b].x, fieldPos[a].z - fieldPos[b].z));
    }
  }
}
assert(minPair > 1.0, `actors never touch (closest approach ${minPair.toFixed(3)} > 1.0, MEASURED 1.234)`);
assert(fieldMaxR <= ROAM_HARD_RADIUS + 1e-9, `hard clamp holds (max radius ${fieldMaxR.toFixed(3)} <= ${ROAM_HARD_RADIUS})`);
assert(ROAM_SEP_RADIUS > 1.0, 'personal space exceeds the touch threshold');

// ---- Gait (stage 3): aim-and-stretch math, step data, and a measured walk ----
const { createGait, aimStretchMatrix } = await import('./src/gait.js');
const { STEP_TRIGGER, STRETCH_MIN, STRETCH_MAX } = await import('./src/config.js');

// aimStretchMatrix, hand-computed: rest leg straight down from hip (0,1,0)
// to foot (0,0,0). Re-aimed to (0.6,0.2,0): rotation only (same length).
const A0 = new THREE.Vector3(0, 1, 0);
const B0 = new THREE.Vector3(0, 0, 0);
const M1 = aimStretchMatrix(A0, B0, new THREE.Vector3(0.6, 0.2, 0));
assert(B0.clone().applyMatrix4(M1).distanceTo(new THREE.Vector3(0.6, 0.2, 0)) < 1e-9, 'aimStretch maps the foot exactly onto the pin (hand-computed)');
assert(A0.clone().applyMatrix4(M1).distanceTo(A0) < 1e-9, 'aimStretch: the hip is invariant');
// Stretched straight down to (0,-0.5,0): s = 1.5, no rotation — and a point
// offset perpendicular at the hip must NOT move (cross-section preserved).
const M2 = aimStretchMatrix(A0, B0, new THREE.Vector3(0, -0.5, 0));
assert(B0.clone().applyMatrix4(M2).distanceTo(new THREE.Vector3(0, -0.5, 0)) < 1e-9, 'aimStretch stretches to the pin (s=1.5, hand-computed)');
assert(new THREE.Vector3(0.13, 1, 0).applyMatrix4(M2).distanceTo(new THREE.Vector3(0.13, 1, 0)) < 1e-9, 'aimStretch preserves the cross-section (perpendicular point fixed)');

for (const creature of CREATURES) {
  if (!creature.step) continue;
  const tag = `[${creature.id}]`;
  const { feet: feetIds, groups } = creature.step;

  // step data: every foot resolves to a capsule with a ground end; groups
  // partition the feet exactly (every foot in exactly one group).
  for (const id of feetIds) {
    const prim = creature.prims.find((p) => p.id === id);
    assert(prim && Array.isArray(prim.b) && !prim.paint, `${tag} foot '${id}' is a solid capsule with a b end`);
  }
  const covered = groups.flat().sort((a, b) => a - b);
  assert(covered.length === feetIds.length && covered.every((v, i) => v === i), `${tag} groups partition the feet exactly`);

  // The walk, simulated (20s straight line at roam speed, with bob) —
  // thresholds encode the MEASURED values: drift 0.298, stretch 0.55-1.33,
  // never more than one group airborne, planted feet world-fixed.
  const gMat = createBlendMaterial(creature.prims);
  const gait = createGait(creature);
  let steps = 0;
  let maxDrift = 0;
  let maxS = 0;
  let minS = 9;
  let maxGroups = 0;
  let plantedMoved = false;
  const prevSwing = feetIds.map(() => false);
  const prevAnchor = feetIds.map(() => null);
  for (let i = 0; i < 1200; i++) {
    const tt = i / 60;
    gait.update(1 / 60, { x: -tt * 0.35, y: 0.03 * Math.sin(tt * 4), z: 0, heading: 0 }, [gMat]);
    maxGroups = Math.max(maxGroups, new Set(gait.feet.filter((f) => f.swingT >= 0).map((f) => f.group)).size);
    gait.feet.forEach((f, j) => {
      const swinging = f.swingT >= 0;
      if (swinging && !prevSwing[j]) steps++;
      if (!swinging && !prevSwing[j] && prevAnchor[j] && f.anchor.distanceTo(prevAnchor[j]) > 1e-9) plantedMoved = true;
      prevSwing[j] = swinging;
      prevAnchor[j] = (prevAnchor[j] ?? new THREE.Vector3()).copy(f.anchor);
      if (!swinging) maxDrift = Math.max(maxDrift, Math.hypot(f.b0.x - tt * 0.35 - f.anchor.x, f.b0.z - f.anchor.z));
      const s = gMat.uniforms.uA.value[f.idx].distanceTo(gMat.uniforms.uB.value[f.idx]) / f.len0;
      maxS = Math.max(maxS, s);
      minS = Math.min(minS, s);
    });
  }
  assert(steps >= feetIds.length * 15, `${tag} the gait is not inert (${steps} steps >= ${feetIds.length * 15} over 20s)`);
  assert(maxGroups === 1, `${tag} at most ONE group airborne at a time (the trot invariant)`);
  assert(!plantedMoved, `${tag} planted feet are world-fixed between steps`);
  assert(maxDrift < STEP_TRIGGER + 0.13, `${tag} feet keep up (max planted drift ${maxDrift.toFixed(3)} < ${(STEP_TRIGGER + 0.13).toFixed(2)}, MEASURED 0.298)`);
  assert(minS >= STRETCH_MIN - 1e-6 && maxS <= STRETCH_MAX + 1e-6, `${tag} leg stretch stays in the clamp band (${minS.toFixed(2)}-${maxS.toFixed(2)} within ${STRETCH_MIN}-${STRETCH_MAX})`);
}
assert(createGait({ prims: [] }) === null, 'creatures without step data get no gait (graceful null)');

// World-space lighting: the fragment shader must rotate the creature-space
// SDF normal by the model matrix, or the light turns with the roamer.
const litMat = createBlendMaterial(critter.prims);
assert(litMat.fragmentShader.includes('mat3(modelMatrix)'), 'fragment lighting rotates normals into world space (mat3(modelMatrix))');

// Per-prim blend caps (the thin-part trick). Effective k = min(slider, cap).
// Hand-computed with the shipped smin: smin(1,1,k) = 1 - k/4.
//   Longneck neck (kCap 0.12): slider 0.25 -> k 0.12 -> smin(1,1) = 0.97
//   Slider cranked to 0.60    -> k STILL 0.12 -> 0.97 (the cap holds)
//   An uncapped prim (sentinel 1e3): slider 0.60 -> k 0.60 -> 0.85
function effK(slider, cap) { return Math.min(slider, cap); }
const neck = longneck.prims.find((p) => p.id === 'neck');
assert(neck.kCap === 0.12, 'longneck neck kCap = 0.12 (design probe: the melty-neck fix is live)');
assert(Math.abs(smin(1, 1, effK(0.25, neck.kCap)) - 0.97) < 1e-9, 'capped smin at slider 0.25 = 0.97 (hand-computed)');
assert(Math.abs(smin(1, 1, effK(0.6, neck.kCap)) - 0.97) < 1e-9, 'capped smin at slider 0.60 = 0.97 — the cap HOLDS against the slider');
assert(Math.abs(smin(1, 1, effK(0.6, 1e3)) - 0.85) < 1e-9, 'uncapped smin at slider 0.60 = 0.85 (sentinel does not clamp)');
assert(longneck.prims.find((p) => p.id === 'tail').kCap === 0.07, 'longneck tail kCap = 0.07');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
