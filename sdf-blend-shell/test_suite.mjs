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
const { createBlendMaterial } = await import('./src/render/blendMaterial.js');
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
      (prim.paint === undefined || typeof prim.paint === 'boolean');
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

  // anim: named prim exists, rest pose at t=0, actually moves at peak
  if (creature.anim) {
    const idx = animPrimIndex(creature);
    assert(idx >= 0, `${tag} anim prim '${creature.anim.primId}' found`);
    if (idx >= 0) {
      const restB = mat.uniforms.uB.value[idx].clone();
      updateAnim(mat, 0, creature, idx);
      assert(mat.uniforms.uB.value[idx].distanceTo(restB) < 1e-9, `${tag} updateAnim(t=0) keeps rest pose`);
      updateAnim(mat, Math.PI / 2 / creature.anim.speed, creature, idx);
      const moved = mat.uniforms.uB.value[idx].distanceTo(restB);
      assert(moved > 0.01, `${tag} updateAnim(peak) moves '${creature.anim.primId}' (${moved.toFixed(3)} > 0.01) — the wave is not inert`);
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

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
