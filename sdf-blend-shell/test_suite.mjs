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
const { rotateAboutPivot, updateAnim, animPrimIndex, breathInflate } = await import('./src/anim.js');

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
  // CUBIC C2 mirror (R2) — must stay formula-identical to FIELD_GLSL.
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * h * k * (1 / 6);
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
assert(Math.abs(smin(1.0, 1.0, 0.25) - (1 - 0.25 / 6)) < 1e-9, 'cubic smin(1,1,0.25) = 1 - k/6 = 0.9583 (hand-computed)');
assert(smin(1.0, 1.25, 0.25) === 1.0, 'cubic influence ends EXACTLY at |a-b| = k (bounded — the quadratic never truly ended)');
assert(smin(5.0, 1.0, 0.25) === 1.0, 'smin far apart degrades to plain min');
assert(colorWeight(0) > 50 * colorWeight(0.1), 'contact color dominates at the surface (w0 > 50*w0.1)');
const bRot = rotateAboutPivot([0.45, 0.25, 0], [1.25, 0.9, 0.15], [0, 0, 1], Math.PI / 2);
assert(
  Math.abs(bRot.x - -0.2) < 1e-9 && Math.abs(bRot.y - 1.05) < 1e-9 && Math.abs(bRot.z - 0.15) < 1e-9,
  'rotateAboutPivot 90deg about Z = (-0.2, 1.05, 0.15) (hand-computed)'
);
assert(new Set(CREATURES.map((c) => c.id)).size === CREATURES.length, 'creature ids are unique');
// Breathing (A2), hand-computed: rest identity at t=0 (a breathing
// creature starts EXACTLY at its authored inflate), peak = base +
// amplitude exactly at t*speed = PI, and creatures without breath pass
// their base straight through (the ?? guard).
const BREATHER = { inflate: 0.04, breath: { amplitude: 0.02, speed: 1.6 } };
assert(breathInflate(0, BREATHER) === 0.04, 'breath at t=0 = the rest inflate exactly (rest identity)');
assert(Math.abs(breathInflate(Math.PI / 1.6, BREATHER) - 0.06) < 1e-12, 'breath peak = inflate + amplitude exactly (hand-computed)');
assert(breathInflate(3.7, { inflate: 0.04 }) === 0.04, 'no breath: base inflate passes through untouched');
assert(breathInflate(3.7, {}) === 0, 'no breath, no inflate: zero (the raw field)');

// --- per-creature invariants: EVERY creature must satisfy EVERY rule ---
for (const creature of CREATURES) {
  const tag = `[${creature.id}]`;
  const prims = creature.prims;
  const solids = prims.filter((p) => !p.paint && !p.negative); // meshed, unioned prims (carves are neither)

  // registry shape
  for (const prim of prims) {
    const ok =
      typeof prim.id === 'string' && prim.id.length > 0 &&
      Array.isArray(prim.a) && prim.a.length === 3 &&
      (prim.b === undefined || (Array.isArray(prim.b) && prim.b.length === 3)) &&
      typeof prim.r === 'number' && prim.r > 0 &&
      (prim.color === undefined || typeof prim.color === 'number') &&
      (prim.paint === undefined || typeof prim.paint === 'boolean') &&
      (prim.kCap === undefined || (typeof prim.kCap === 'number' && prim.kCap > 0)) &&
      (prim.k === undefined || (typeof prim.k === 'number' && prim.k > 0)) && // smin divides by k
      (prim.negative === undefined || typeof prim.negative === 'boolean') &&
      !(prim.paint && prim.negative); // a decal has no surface to carve with
    assert(ok, `${tag} ${prim.id}: well-formed prim`);
  }
  assert(prims.length <= MAX_PRIMS, `${tag} fits shader capacity (${prims.length} <= ${MAX_PRIMS})`);
  assert(creature.inflate === undefined || (typeof creature.inflate === 'number' && creature.inflate >= 0), `${tag} inflate is absent or a non-negative number`);
  assert(creature.breath === undefined || (typeof creature.breath.amplitude === 'number' && creature.breath.amplitude >= 0 && typeof creature.breath.speed === 'number' && creature.breath.speed > 0), `${tag} breath is absent or { amplitude >= 0, speed > 0 }`);
  if (creature.breath) {
    const peak = (creature.inflate ?? 0) + creature.breath.amplitude;
    const minR = Math.min(...prims.filter((p) => !p.paint && !p.negative).map((p) => p.r));
    assert(peak < minR, `${tag} breath peak ${peak.toFixed(3)} stays under the thinnest solid r ${minR} (no ballooning past a limb)`);
  }
  if (creature.idle) {
    const ip = creature.idle;
    const period = ip.period ?? 9;
    const duration = ip.duration ?? 2.8;
    const ramp = ip.ramp ?? 0.6;
    assert(duration > 0 && period > duration && duration >= 2 * ramp, `${tag} idle override is coherent (0 < 2*ramp <= duration < period)`);
  }
  assert(new Set(prims.map((p) => p.id)).size === prims.length, `${tag} prim ids are unique`);

  // geometry: solids meshed, paints not, aPrim carries registry indices
  const geo = buildShellGeometry(prims, creature.step?.knees); // mirror the render path
  const aPrim = geo.getAttribute('aPrim');
  assert(geo.getAttribute('position').count > 0 && aPrim !== undefined, `${tag} merged geometry + aPrim exist`);
  const seen = new Set(aPrim.array);
  assert(seen.size === solids.length, `${tag} aPrim covers all ${solids.length} solid prims (saw ${seen.size})`);

  // A5.2 capless knees: the interior hemisphere fans at buried joints
  // painted a black ink ring at the body-exit line (MEASURED: ring verts
  // 13 -> 51 when the caps appeared; 80% cap provenance). Assert the
  // caps are actually GONE: no vertex of a kneed prim lies beyond its
  // knee end along the axis.
  for (const [shinId, thighId] of Object.entries(creature.step?.knees ?? {})) {
    for (const [id, end] of [[shinId, 'a'], [thighId, 'b']]) {
      const pi = prims.findIndex((p) => p.id === id);
      const pr = prims[pi];
      const A = pr.a;
      const B = pr.b;
      const ba = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
      const bb = ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2];
      let beyond = 0;
      const pos2 = geo.getAttribute('position');
      for (let i = 0; i < pos2.count; i++) {
        if (aPrim.array[i] !== pi) continue;
        const t = ((pos2.getX(i) - A[0]) * ba[0] + (pos2.getY(i) - A[1]) * ba[1] + (pos2.getZ(i) - A[2]) * ba[2]) / bb;
        if (end === 'a' ? t < -1e-4 : t > 1 + 1e-4) beyond++;
      }
      assert(beyond === 0, `${tag} ${id} has NO cap verts beyond its knee end (${beyond} — the ring's source is gone)`);
    }
  }
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

  // carve prims (negatives): dent-don't-pierce, clear of every decal,
  // bowl lined by donor vertices — GENERALIZED: any future carve on any
  // creature flows through these with no extra wiring.
  for (const neg of prims.filter((p) => p.negative)) {
    // Anchor checks at the carve's MIDPOINT — for a capsule negative,
    // neg.a is one END of the slit, not its center (spheres: identical).
    const nb = neg.b ?? neg.a;
    const negMid = [(neg.a[0] + nb[0]) / 2, (neg.a[1] + nb[1]) / 2, (neg.a[2] + nb[2]) / 2];
    let host = null;
    let hostSd = Infinity;
    for (const s of solids) {
      const sd = sdPrim(negMid, s);
      if (sd < hostSd) { hostSd = sd; host = s; }
    }
    assert(hostSd < neg.r, `${tag} ${neg.id} reaches into its host '${host?.id}' (sd ${hostSd.toFixed(4)} < r ${neg.r})`);
    assert(neg.r - hostSd < host.r, `${tag} ${neg.id} is a dent, not a pierce (penetration ${(neg.r - hostSd).toFixed(4)} < host r ${host.r})`);
    // Capsule slits must be SUBMERGED at both ends: a grazing endpoint
    // (sd near/above zero — hopper's first slit sat +0.019 OUTSIDE)
    // smears thresholded coverage into corner "run-offs" (measured
    // analytically on the field, browser-confirmed as the defect).
    if (neg.b) {
      for (const [end, label] of [[neg.a, 'a'], [neg.b, 'b']]) {
        const sdEnd = sdPrim(end, host);
        assert(sdEnd < -0.005, `${tag} ${neg.id} endpoint ${label} is submerged (sd ${sdEnd.toFixed(4)} < -0.005 — grazing slit ends smear)`);
      }
    }
    // A carve's influence reaches ~kCap beyond its surface; decals must
    // sit clear of it or the bowl eats the eyes.
    for (const paint of prims.filter((p) => p.paint)) {
      const sdP = sdPrim(paint.a, neg);
      assert(sdP > (neg.kCap ?? 0), `${tag} ${neg.id} stays clear of ${paint.id} (sd ${sdP.toFixed(3)} > reach ${(neg.kCap ?? 0).toFixed(3)})`);
    }
    // Donor density: the bowl is lined by HOST vertices snapping inward
    // (detached-legs lesson, sphere edition — floor MEASURED, hopper 14).
    let donors = 0;
    const gpos = geo.getAttribute('position');
    for (let i = 0; i < gpos.count; i++) {
      if (sdPrim([gpos.getX(i), gpos.getY(i), gpos.getZ(i)], neg) < 0) donors++;
    }
    assert(donors >= 11, `${tag} ${neg.id}'s bowl has donor vertices (${donors} >= 11)`);
  }

  // material: padding + honest flags
  const mat = createBlendMaterial(prims, creature.inflate);
  assert(mat.uniforms.uInflate.value === (creature.inflate ?? 0), `${tag} uInflate mirrors the registry (absent = 0)`);
  assert(mat.uniforms.uA.value.length === MAX_PRIMS && mat.uniforms.uPaint.value.length === MAX_PRIMS, `${tag} uniforms padded to MAX_PRIMS`);
  assert(mat.uniforms.uCount.value === prims.length, `${tag} uCount matches`);
  assert(prims.every((p, i) => mat.uniforms.uPaint.value[i] === (p.paint ? 1.0 : 0.0)), `${tag} uPaint flags mirror the registry`);
  assert(mat.uniforms.uKCap.value.length === MAX_PRIMS, `${tag} uKCap padded to MAX_PRIMS`);
  assert(prims.every((p, i) => mat.uniforms.uKCap.value[i] === (p.kCap != null ? p.kCap : 1e3)), `${tag} uKCap mirrors the registry (uncapped = sentinel 1e3)`);
  // A5 limb groups: thigh and shin share a nonzero uLimb id (they never
  // bury each other — one continuous surface); everything else is 0.
  {
    const limbMat = createBlendMaterial(prims, creature.inflate, creature.step?.knees);
    assert(limbMat.uniforms.uLimb.value.length === MAX_PRIMS, `${tag} uLimb padded to MAX_PRIMS`);
    const kneesMap = creature.step?.knees ?? {};
    for (const [shinId, thighId] of Object.entries(kneesMap)) {
      const si = prims.findIndex((p) => p.id === shinId);
      const ti = prims.findIndex((p) => p.id === thighId);
      const v = limbMat.uniforms.uLimb.value;
      assert(v[si] > 0 && v[si] === v[ti], `${tag} ${shinId}+${thighId} share limb group ${v[si]}`);
    }
    const kneeIdxs = new Set(Object.entries(kneesMap).flatMap(([a, b]) => [a, b]).map((id) => prims.findIndex((p) => p.id === id)));
    assert(limbMat.uniforms.uLimb.value.every((v, i) => kneeIdxs.has(i) ? v > 0 : v === 0), `${tag} non-limb prims carry uLimb 0 (burial unchanged for them)`);
  }
  assert(mat.uniforms.uKPrim.value.length === MAX_PRIMS, `${tag} uKPrim padded to MAX_PRIMS`);
  assert(prims.every((p, i) => mat.uniforms.uKPrim.value[i] === (p.k != null ? p.k : -1.0)), `${tag} uKPrim mirrors the registry (unauthored = sentinel -1, follows the slider)`);
  assert(mat.uniforms.uNeg.value.length === MAX_PRIMS, `${tag} uNeg padded to MAX_PRIMS`);
  assert(prims.every((p, i) => mat.uniforms.uNeg.value[i] === (p.negative ? (p.color != null ? 2.0 : 1.0) : 0.0)), `${tag} uNeg mirrors the registry (0 solid / 1 carve / 2 colored carve)`);
  assert(mat.uniforms.uSnapOffset.value === 0.0, `${tag} skin material snaps to the zero surface`);
  const IDENTITY = new THREE.Matrix4();
  assert(mat.uniforms.uPrimMat.value.length === MAX_PRIMS, `${tag} uPrimMat padded to MAX_PRIMS`);
  assert(mat.uniforms.uPrimMat.value.every((m) => m.equals(IDENTITY)), `${tag} every prim starts at identity (rest pose)`);
  assert(new Set(mat.uniforms.uPrimMat.value).size === MAX_PRIMS, `${tag} uPrimMat slots are SEPARATE instances (no shared matrix)`);
  assert(mat.uniforms.uAnimPrim === undefined, `${tag} old single-slot uAnimPrim is gone`);

  // outline material: same field, offset snap target, back faces only
  const ink = createOutlineMaterial(prims, creature.inflate);
  assert(ink.uniforms.uInflate.value === mat.uniforms.uInflate.value, `${tag} skin and ink dilate by the SAME amount (or the outline detaches)`);
  assert(ink.uniforms.uSnapOffset.value === OUTLINE_WIDTH, `${tag} outline snaps to the +${OUTLINE_WIDTH} offset surface`);
  assert(ink.side === THREE.BackSide, `${tag} outline renders BACK faces only (inverted hull on the offset surface)`);
  assert(ink.uniforms.uA.value.length === MAX_PRIMS && ink.uniforms.uKCap.value.length === MAX_PRIMS, `${tag} outline uniforms padded to MAX_PRIMS`);
  assert(ink.uniforms.uB.value !== mat.uniforms.uB.value, `${tag} skin and outline own SEPARATE uniform instances (anim writes both explicitly)`);
  // The ink IGNORES carves (folds impossible by construction): negatives
  // are surface-less in the OUTLINE's uniforms only — measured 16 folded
  // ink triangles at pudge's mouth on the carved field, 0 without it.
  assert(prims.every((p, i) => !p.negative || (ink.uniforms.uPaint.value[i] === 1.0 && ink.uniforms.uNeg.value[i] === 0.0)), `${tag} ink treats carves as surface-less (uPaint=1, uNeg=0 — no crease to fold into)`);
  assert(prims.every((p, i) => mat.uniforms.uNeg.value[i] === (p.negative ? (p.color != null ? 2.0 : 1.0) : 0.0)), `${tag} the SKIN keeps its carves (uNeg unchanged)`);
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
const pudge = CREATURES.find((c) => c.id === 'pudge');
const snail = CREATURES.find((c) => c.id === 'snail');
assert(critter && hopper && longneck && pudge && snail, 'gallery holds critter, hopper, longneck, pudge, snail');
function paintSd(creature, paintId, hostId) {
  const paint = creature.prims.find((p) => p.id === paintId);
  const host = creature.prims.find((p) => p.id === hostId);
  return sdPrim(paint.a, host);
}
// Ball-eye rooting anchors (the cast conversion): eyeball CENTERS sit
// this far inside their host — solid, so paintSd doubles as a rooting
// probe. Hand-computed from the constructed placements (tol 3e-3 for
// coordinate rounding).
assert(Math.abs(paintSd(critter, 'eyeball_l', 'head') - -0.0195) < 3e-3, 'critter eyeball_l rooted -0.0195 in the head (hand-computed)');
assert(Math.abs(paintSd(hopper, 'eyeball_l', 'body') - -0.0196) < 3e-3, 'hopper eyeball_l rooted -0.0196 in the body (hand-computed)');
assert(Math.abs(paintSd(longneck, 'eyeball_l', 'head') - -0.0153) < 3e-3, 'longneck eyeball_l rooted -0.0153 in the head (hand-computed)');
assert(Math.abs(paintSd(pudge, 'sclera_l', 'head') - -0.0181) < 1e-3, 'pudge sclera_l sd vs head = -0.0181 (hand-computed — FLAT eyes: the ball-eye dilate boundary)');
assert(Math.abs(paintSd(snail, 'eyeball_l', 'antenna_l') - -0.0151) < 3e-3, 'snail eyeball_l rooted -0.0151 in the stalk tip (hand-computed, capsule end-cap host)');
// Every eyeball must POKE (protrude past its host) and every iris must
// poke ITS eyeball — the generic paint probes cover irises; this covers
// the solid balls across the whole cast.
for (const c of CREATURES) {
  for (const eb of c.prims.filter((p) => p.id.startsWith('eyeball_'))) {
    let hostSd = Infinity;
    for (const s2 of c.prims.filter((p) => !p.paint && !p.negative && p !== eb && !p.id.startsWith('eyeball_'))) {
      hostSd = Math.min(hostSd, sdPrim(eb.a, s2));
    }
    assert(hostSd < 0 && hostSd > -eb.r, `[${c.id}] ${eb.id} rooted AND poking (sd ${hostSd.toFixed(4)} in (-${eb.r}, 0))`);
  }
}
// The BALL-EYE DILATE BOUNDARY (browser-caught scary-goggles, then a
// probe-killed solid-iris fix — see LESSONS): a constant dilate
// compresses small-feature contrast toward 1, so ball eyes are only
// valid where the peak dilate is small against the ball. Dilated
// creatures past the boundary use flat sclera+pupil decals (they
// balloon together, keeping the painted read — pudge's proven eyes).
for (const c of CREATURES) {
  const peak = (c.inflate ?? 0) + (c.breath?.amplitude ?? 0);
  for (const eb of c.prims.filter((p) => p.id.startsWith('eyeball_'))) {
    assert(peak <= eb.r / 3 + 1e-9, `[${c.id}] ball eye '${eb.id}' respects the dilate boundary (peak ${peak.toFixed(3)} <= r/3 = ${(eb.r / 3).toFixed(3)})`);
  }
}

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
// Test point (HISTORICAL GEOMETRY — the defect's original decal eyes,
// preserved as the bug-then-fix record): gaze-ray point on a skin
// inflated by 0.15 (~k=0.6 deficit). Hand-computed paint distances:
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
const { createRoam, idleSpeedMul } = await import('./src/roam.js');
const { ROAM_SPEED, ROAM_HARD_RADIUS, ROAM_SEP_RADIUS, GROUND_RADIUS, STRIDE_LIFT, LEAN_MAX } = await import('./src/config.js');
const { IDLE_PERIOD, IDLE_DURATION, IDLE_RAMP } = await import('./src/config.js');
const { stridePulse, leanTarget, approach, headingDelta, squashEndpoints } = await import('./src/feel.js');
assert(ROAM_SPEED > 0 && STRIDE_LIFT > 0 && LEAN_MAX > 0, 'roam/feel constants are live');
// Gait feel (A3.1), hand-computed:
assert(stridePulse([{ swingT: -1 }, { swingT: -1 }]) === 0, 'stridePulse: all planted = 0 (an idle walker is genuinely still)');
assert(stridePulse([{ swingT: 0.5 }, { swingT: -1 }]) === 1, 'stridePulse: mid-swing = 1 exactly (hand-computed)');
assert(Math.abs(stridePulse([{ swingT: 0.25 }]) - 0.5) < 1e-12, 'stridePulse: quarter-swing = 0.5 exactly (sin^2(PI/4), hand-computed)');
assert(Math.abs(stridePulse([{ swingT: 0.25 }, { swingT: 0.5 }]) - 1) < 1e-12, 'stridePulse: max over swinging feet');
// The micro-jump fix: at 10% into the swing the OLD sine pulse was
// already at 0.309 (full-velocity attack); sin^2 is 0.0955 — the body
// eases in (zero endpoint slope, hand-computed).
assert(Math.abs(stridePulse([{ swingT: 0.1 }]) - 0.09549150281252627) < 1e-12, 'stridePulse: soft onset (0.0955 at 10% vs the old 0.309 attack, hand-computed)');
assert(leanTarget(0.2, 0.35, 0.18) === 0.2 * 0.35, 'leanTarget: proportional below the clamp (hand-computed)');
assert(leanTarget(9, 0.35, 0.18) === 0.18 && leanTarget(-9, 0.35, 0.18) === -0.18, 'leanTarget: clamped both ways (steering spikes cannot flip the body)');
assert(approach(0.7, 1, 6, 0) === 0.7, 'approach: dt=0 is an exact identity (pause-safe)');
assert(Math.abs(approach(0, 1, 6, Math.LN2 / 6) - 0.5) < 1e-12, 'approach: half-life = ln2/rate exactly (hand-computed)');
assert(Math.abs(headingDelta(3.1, -3.1) - (2 * Math.PI - 6.2)) < 1e-12, 'headingDelta: shortest way across the PI wrap (hand-computed)');
assert(Math.abs(headingDelta(0.5, 0.7) - 0.2) < 1e-12 && headingDelta(0.5, 0.7) > 0, 'headingDelta: plain small turns pass through');
// Squash & stretch (A3.2), hand-computed. Endpoint deformation: squash
// splits along X (wider/flatter), stretch along Y (taller), rest is a
// bit-exact identity (the drift rule made assertable).
const SQ_PRIM = { id: 'body', a: [0, 0.62, 0], r: 0.5 };
assert(JSON.stringify(squashEndpoints(SQ_PRIM, 0)) === JSON.stringify({ a: [0, 0.62, 0], b: [0, 0.62, 0] }), 'squashEndpoints: s=0 is the exact rest sphere (bit-exact identity)');
assert(JSON.stringify(squashEndpoints(SQ_PRIM, 0.07)) === JSON.stringify({ a: [-0.07, 0.62, 0], b: [0.07, 0.62, 0] }), 'squashEndpoints: +0.07 splits along X (wider + flatter, hand-computed)');
assert(JSON.stringify(squashEndpoints(SQ_PRIM, -0.09)) === JSON.stringify({ a: [0, 0.53, 0], b: [0, 0.71, 0] }), 'squashEndpoints: -0.09 splits along Y (taller, hand-computed)');
// The deformed field, exact: a squashed sphere's flank sits at exactly
// split + r; and under BOTH extremes hopper's mouth endpoints stay
// SUBMERGED (both deformations bulge the face OUTWARD past the slit —
// the safe direction; the run-off rule holds mid-hop).
{
  const sq = squashEndpoints(SQ_PRIM, 0.07);
  assert(Math.abs(sdCapsule([0.57, 0.62, 0], sq.a, sq.b, 0.5)) < 1e-12, 'squashed flank at exactly split + r = 0.57 (hand-computed)');
  const mouthH = hopper.prims.find((p) => p.id === 'mouth');
  const bodyRest = hopper.prims.find((p) => p.id === 'body');
  for (const s of [0.07, -0.09]) {
    const d = squashEndpoints(bodyRest, s);
    const deformed = { a: d.a, b: d.b, r: bodyRest.r };
    for (const end of [mouthH.a, mouthH.b]) {
      assert(sdPrim(end, deformed) < -0.005, `mouth endpoint stays submerged under deformation s=${s} (sd ${sdPrim(end, deformed).toFixed(4)})`);
    }
  }
}
assert(GROUND_RADIUS > ROAM_HARD_RADIUS, `the ground outreaches the roamers (${GROUND_RADIUS} > ${ROAM_HARD_RADIUS}) — nobody walks off the world`);

// Idle envelope, hand-computed: exactly 1 outside the window, exactly 0
// on the plateau (a genuine stop), smooth shoulders in between.
const IP = { period: IDLE_PERIOD, duration: IDLE_DURATION, ramp: IDLE_RAMP };
assert(idleSpeedMul(IDLE_DURATION, IP) === 1, 'idle envelope = 1 exactly at the window end (hand-computed)');
assert(idleSpeedMul(IDLE_PERIOD - 0.1, IP) === 1, 'idle envelope = 1 outside the window');
assert(idleSpeedMul(IDLE_RAMP, IP) === 0, 'idle envelope = 0 exactly once the shoulder completes (hand-computed)');
assert(idleSpeedMul(IDLE_DURATION / 2, IP) === 0, 'idle envelope = 0 on the plateau (a genuine stop, not a creep)');
assert(Math.abs(idleSpeedMul(IDLE_RAMP / 2, IP) - 0.5) < 1e-12, 'idle shoulder midpoint = 0.5 exactly (smoothstep, hand-computed)');
// The stop is REAL: seed 0 spawns at wander-clock 0 — inside the idle
// window — so with no neighbors its position must be BIT-IDENTICAL
// across the plateau, then walking must resume after the window.
{
  const r0 = createRoam(0);
  let pA = null;
  let pB = null;
  let pEnd = null;
  for (let i = 1; i <= 300; i++) {
    const p = r0.update(1 / 60);
    if (i === 60) pA = { ...p }; // t = 1.0s (plateau)
    if (i === 120) pB = { ...p }; // t = 2.0s (still plateau)
    if (i === 300) pEnd = { ...p }; // t = 5.0s (walking again)
  }
  assert(pA.x === pB.x && pA.z === pB.z, 'idle plateau: position bit-identical for a full second (stopped)');
  assert(Math.hypot(pEnd.x - pB.x, pEnd.z - pB.z) > 0.3, `walking resumes after the window (moved ${Math.hypot(pEnd.x - pB.x, pEnd.z - pB.z).toFixed(3)} by t=5s)`);
  assert(pA.heading !== pB.heading, 'idle keeps looking around (heading still drifts while stopped)');
}

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

// The field simulation, MEASURED (one seeded roamer PER GALLERY CREATURE —
// the sim grows with the gallery automatically — mutual separation, ~100
// simulated seconds at the EXPANDED field scale). Thresholds set from
// measurement with margin; re-measure whenever the gallery or the roam
// constants change (the labels carry the live numbers).
const N_ACTORS = CREATURES.length;
// Spawn ring: count-spaced — the old hardcoded /3 spacing made seed 3 wrap
// onto seed 0's exact angle (two creatures spawning inside each other).
// Chord at N on the 1.9 ring: 2*1.9*sin(PI/N) — holds > 1.2 through N~8.
const spawnPoses = Array.from({ length: N_ACTORS }, (_, i) => createRoam(i, N_ACTORS).update(1 / 60));
for (let a = 0; a < N_ACTORS; a++) {
  for (let b = a + 1; b < N_ACTORS; b++) {
    const d = Math.hypot(spawnPoses[a].x - spawnPoses[b].x, spawnPoses[a].z - spawnPoses[b].z);
    assert(d > 1.2, `spawns ${a} and ${b} are distinct (${d.toFixed(3)} > 1.2 — the seed-wrap regression guard)`);
  }
}
const fieldRoams = Array.from({ length: N_ACTORS }, (_, i) => createRoam(i, N_ACTORS));
const fieldPos = fieldRoams.map(() => ({ x: 0, z: 0 }));
let minPair = Infinity;
let fieldMaxR = 0;
for (let i = 0; i < 6000; i++) {
  fieldRoams.forEach((r, j) => {
    const p = r.update(1 / 60, fieldPos.filter((_, k) => k !== j));
    fieldPos[j] = { x: p.x, z: p.z };
    fieldMaxR = Math.max(fieldMaxR, Math.hypot(p.x, p.z));
  });
  for (let a = 0; a < N_ACTORS; a++) {
    for (let b = a + 1; b < N_ACTORS; b++) {
      minPair = Math.min(minPair, Math.hypot(fieldPos[a].x - fieldPos[b].x, fieldPos[a].z - fieldPos[b].z));
    }
  }
}
console.log(`  INFO  field sim: ${N_ACTORS} actors, closest approach ${minPair.toFixed(3)}, max radius ${fieldMaxR.toFixed(3)} (hard clamp ${ROAM_HARD_RADIUS})`);
assert(minPair > 1.0, `actors never touch (closest approach ${minPair.toFixed(3)} > 1.0, MEASURED at this scale — see INFO)`);
assert(fieldMaxR <= ROAM_HARD_RADIUS + 1e-9, `hard clamp holds (max radius ${fieldMaxR.toFixed(3)} <= ${ROAM_HARD_RADIUS})`);
assert(ROAM_SEP_RADIUS > 1.0, 'personal space exceeds the touch threshold');

// ---- Gait (stage 3): aim-and-stretch math, step data, and a measured walk ----
const { createGait, aimStretchMatrix, solveKnee, segmentMatrix } = await import('./src/gait.js');
const { KNEE_STRAIGHT_FRAC } = await import('./src/config.js');
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

// solveKnee, hand-computed: hip (0,1,0), foot (0,0,0), L1 = L2 = 0.6,
// pole +X. d = 1, along = 0.5, height = sqrt(0.36 - 0.25) = 0.33166 ->
// knee at (0.33166, 0.5, 0).
const K1 = solveKnee(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), 0.6, 0.6, new THREE.Vector3(1, 0, 0));
assert(K1.distanceTo(new THREE.Vector3(Math.sqrt(0.11), 0.5, 0)) < 1e-9, 'solveKnee symmetric case = (0.33166, 0.5, 0) (hand-computed)');
assert(Math.abs(K1.distanceTo(new THREE.Vector3(0, 1, 0)) - 0.6) < 1e-9 && Math.abs(K1.distanceTo(new THREE.Vector3(0, 0, 0)) - 0.6) < 1e-9, 'solveKnee preserves BOTH segment lengths exactly');
// Pole flipped -> the knee mirrors (the bend direction is the pole's).
const K2 = solveKnee(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), 0.6, 0.6, new THREE.Vector3(-1, 0, 0));
assert(K2.x < 0 && Math.abs(K2.x + K1.x) < 1e-9, 'solveKnee bends toward the pole (mirrored pole = mirrored knee)');
// segmentMatrix: maps a0->a1 AND b0->b1 (the shin: both ends placed).
const segA0 = new THREE.Vector3(0, 0.5, 0);
const segB0 = new THREE.Vector3(0, 0, 0);
const segA1 = new THREE.Vector3(0.3, 0.6, 0.1);
const segB1 = new THREE.Vector3(0.5, 0.2, 0.1);
const MS = segmentMatrix(segA0, segB0, segA1, segB1);
assert(segA0.clone().applyMatrix4(MS).distanceTo(segA1) < 1e-9, 'segmentMatrix maps a0 exactly onto a1');
assert(segB0.clone().applyMatrix4(MS).distanceTo(segB1) < 1e-9, 'segmentMatrix maps b0 exactly onto b1');

for (const creature of CREATURES) {
  if (!creature.step) continue;
  const tag = `[${creature.id}]`;
  const { feet: feetIds, groups } = creature.step;

  // step data: every foot resolves to a capsule with a ground end; groups
  // partition the feet exactly (every foot in exactly one group).
  for (const id of feetIds) {
    const prim = creature.prims.find((p) => p.id === id);
    assert(prim && Array.isArray(prim.b) && !prim.paint && !prim.negative, `${tag} foot '${id}' is a solid capsule with a b end`);
  }
  const covered = groups.flat().sort((a, b) => a - b);
  assert(covered.length === feetIds.length && covered.every((v, i) => v === i), `${tag} groups partition the feet exactly`);

  // A5 knees registry rules: thigh resolves, JOINT CONTINUITY is exact
  // (thigh.b === shin.a — the knee is one point), the rest pose declares
  // a visible bend (>= 0.02 off the hip-foot line: that offset IS the
  // IK pole), and the rest knee is never near-locked.
  for (const [footId, thighId] of Object.entries(creature.step.knees ?? {})) {
    assert(feetIds.includes(footId), `${tag} knees key '${footId}' is a declared foot`);
    const shin = creature.prims.find((p) => p.id === footId);
    const thigh = creature.prims.find((p) => p.id === thighId);
    assert(thigh && Array.isArray(thigh.b) && !thigh.paint && !thigh.negative, `${tag} thigh '${thighId}' is a solid capsule`);
    if (!thigh || !shin) continue;
    const joint = Math.hypot(thigh.b[0] - shin.a[0], thigh.b[1] - shin.a[1], thigh.b[2] - shin.a[2]);
    assert(joint < 1e-9, `${tag} ${footId}: thigh.b === shin.a exactly (joint gap ${joint.toExponential(1)})`);
    const H = new THREE.Vector3(...thigh.a);
    const Kn = new THREE.Vector3(...thigh.b);
    const F = new THREE.Vector3(...shin.b);
    const L1 = Kn.distanceTo(H);
    const L2 = F.distanceTo(Kn);
    const u = F.clone().sub(H).normalize();
    const off = Kn.clone().sub(H);
    off.addScaledVector(u, -off.dot(u));
    assert(off.length() >= 0.02, `${tag} ${footId}: rest knee bends >= 0.02 off the line (${off.length().toFixed(3)}) — the authored pole`);
    const reach = F.distanceTo(H) / (L1 + L2);
    assert(reach < KNEE_STRAIGHT_FRAC - 0.015, `${tag} ${footId}: rest reach ${reach.toFixed(3)} keeps the knee off the straight lock`);
  }

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
  // A5 knee invariants, tracked live through the walk: the knee joint
  // never separates (thigh.b written === shin.a written), NEITHER
  // segment stretches (the feature's whole claim: bend replaces
  // stretch), and the knee actually articulates (bend angle varies).
  let kneeGapMax = 0;
  let segLenDevMax = 0;
  let kneeCosMin = 2;
  let kneeCosMax = -2;
  let kneeCoverMax = -9; // max sd of the knee vs non-limb solids (must stay < 0: covered)
  const limbIds = new Set(Object.entries(creature.step.knees ?? {}).flat());
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
      if (f.knee) {
        const tA = gMat.uniforms.uA.value[f.knee.idx];
        const tB = gMat.uniforms.uB.value[f.knee.idx];
        const sA = gMat.uniforms.uA.value[f.idx];
        const sB = gMat.uniforms.uB.value[f.idx];
        kneeGapMax = Math.max(kneeGapMax, tB.distanceTo(sA));
        segLenDevMax = Math.max(segLenDevMax, Math.abs(tA.distanceTo(tB) - f.knee.L1), Math.abs(sA.distanceTo(sB) - f.len0));
        const cos = tA.clone().sub(tB).normalize().dot(sB.clone().sub(sA).normalize());
        kneeCosMin = Math.min(kneeCosMin, cos);
        kneeCosMax = Math.max(kneeCosMax, cos);
        const kneeP = [tB.x, tB.y, tB.z];
        let kneeMinSd = 1e9; // nearest non-limb solid THIS frame
        for (const pr of creature.prims) {
          if (pr.paint || pr.negative || limbIds.has(pr.id)) continue;
          kneeMinSd = Math.min(kneeMinSd, sdPrim(kneeP, pr));
        }
        kneeCoverMax = Math.max(kneeCoverMax, kneeMinSd); // worst (shallowest) frame
      }
    });
  }
  assert(steps >= feetIds.length * 15, `${tag} the gait is not inert (${steps} steps >= ${feetIds.length * 15} over 20s)`);
  assert(maxGroups === 1, `${tag} at most ONE group airborne at a time (the trot invariant)`);
  assert(!plantedMoved, `${tag} planted feet are world-fixed between steps`);
  assert(maxDrift < STEP_TRIGGER + 0.13, `${tag} feet keep up (max planted drift ${maxDrift.toFixed(3)} < ${(STEP_TRIGGER + 0.13).toFixed(2)}, MEASURED 0.298)`);
  assert(minS >= STRETCH_MIN - 1e-6 && maxS <= STRETCH_MAX + 1e-6, `${tag} leg stretch stays in the clamp band (${minS.toFixed(2)}-${maxS.toFixed(2)} within ${STRETCH_MIN}-${STRETCH_MAX})`);
  if (creature.step.knees) {
    assert(kneeGapMax < 1e-6, `${tag} the knee joint NEVER separates (max gap ${kneeGapMax.toExponential(1)} — thigh and shin write one shared point)`);
    assert(segLenDevMax < 1e-6, `${tag} neither segment stretches through the whole walk (max deviation ${segLenDevMax.toExponential(1)} — bend replaced stretch)`);
    assert(kneeCosMax - kneeCosMin > 0.05, `${tag} the knee ARTICULATES (bend-cos range ${(kneeCosMax - kneeCosMin).toFixed(3)} > 0.05 — not a rigid L)`);
    assert(kneeCosMax < 0.0, `${tag} the walk never folds a knee past 90 deg (max cos ${kneeCosMax.toFixed(3)} < 0 — MEASURED 96/100 deg at lift 0.05; deep folds cusp the ink: the knee-seam mechanism)`);
    assert(kneeCoverMax < -0.01, `${tag} the knee stays INSIDE the body through the whole walk (max sd ${kneeCoverMax.toFixed(3)} < -0.01 — the capless-knee validity boundary, executable)`);
  }
}
assert(createGait({ prims: [] }) === null, 'creatures without step data get no gait (graceful null)');

// ---- Hop (roadmap A1): arc math, state machine, and a measured 20s hop ----
const { createHop, hopArcY } = await import('./src/hop.js');
const { HOP_TRIGGER, HOP_AIR_TIME, HOP_HEIGHT, HOP_CROUCH_DIP } = await import('./src/config.js');

// Arc anchors, hand-computed: the arc is CONTINUOUS with the crouch —
// it starts AND ends at -dip, and the peak is exactly height at u=0.5.
assert(Math.abs(hopArcY(0, 0.24, 0.07) - -0.07) < 1e-12, 'hop arc launches FROM the crouch depth (-dip, hand-computed)');
assert(Math.abs(hopArcY(1, 0.24, 0.07) - -0.07) < 1e-12, 'hop arc lands AT the crouch depth (continuous with LAND)');
assert(Math.abs(hopArcY(0.5, 0.24, 0.07) - 0.24) < 1e-12, 'hop arc peak = height exactly at u=0.5 (hand-computed)');
assert(createHop({}) === null, 'creatures without hop data get no hop (graceful null)');
assert(hopper.hop && hopper.step && hopper.step.feet.length === 2, 'hopper hops (hop block present; feet come from the same step data)');

// The hop, simulated: 20s of straight-line logical motion at roam speed.
// Thresholds encode MEASURED values (see the INFO line); the walk-sim
// above still exercises hopper's reactive gait as machinery, but main
// gives the HOP precedence for creatures that have both.
{
  const hMat = createBlendMaterial(hopper.prims);
  const hop = createHop(hopper);
  let hops = 0;
  let prevState = 'PAUSE';
  let maxY = -9;
  let minY = 9;
  let maxStep = 0;
  let plantedMoved = false;
  let airFeetOk = true;
  let groundFeetOk = true;
  let sawSquash = false; // CROUCH: endpoints split along X (wider)
  let sawStretch = false; // AIR: endpoints split along Y (taller)
  let restRestored = false; // PAUSE after >= 1 hop: exact rest sphere back
  const bodyIdx = hopper.prims.findIndex((p) => p.id === 'body');
  const bodyRestA = new THREE.Vector3(...hopper.prims[bodyIdx].a);
  // Jaw-drop (A4 stage 2): the mouth carve through the arc.
  const mouthIdx = hopper.prims.findIndex((p) => p.id === 'mouth');
  const mouthRestMid = new THREE.Vector3(...hopper.prims[mouthIdx].a)
    .add(new THREE.Vector3(...hopper.prims[mouthIdx].b))
    .multiplyScalar(0.5);
  let mouthMinY = 9; // lowest midpoint y — the drop, hand-computed 0.3806 at the apex
  let mouthMaxDist = 0; // farthest endpoint from the body center — the submersion invariant
  let mouthRested = false; // PAUSE after >= 1 hop: exact registry pose back
  let prevD = null;
  const prevAnchor = hop.feet.map(() => null);
  let disp = null;
  for (let i = 0; i < 1200; i++) {
    const tt = i / 60;
    disp = hop.update(1 / 60, { x: -tt * 0.35, z: 0, heading: 0 }, [hMat]);
    const st = hop.current();
    if (st === 'AIR' && prevState !== 'AIR') hops++;
    const uA = hMat.uniforms.uA.value[bodyIdx];
    const uB = hMat.uniforms.uB.value[bodyIdx];
    if (st === 'CROUCH' && uB.x - uA.x > 0.05) sawSquash = true;
    if (st === 'AIR' && uB.y - uA.y > 0.05) sawStretch = true;
    if (st === 'PAUSE' && hops >= 1 && uA.distanceTo(uB) === 0 && uA.distanceTo(bodyRestA) === 0) restRestored = true;
    const mA = hMat.uniforms.uA.value[mouthIdx];
    const mB = hMat.uniforms.uB.value[mouthIdx];
    mouthMinY = Math.min(mouthMinY, (mA.y + mB.y) / 2);
    mouthMaxDist = Math.max(mouthMaxDist, mA.distanceTo(bodyRestA), mB.distanceTo(bodyRestA));
    if (st === 'PAUSE' && hops >= 1 && (mA.x + mB.x) / 2 === mouthRestMid.x && (mA.y + mB.y) / 2 === mouthRestMid.y) mouthRested = true;
    maxY = Math.max(maxY, disp.y);
    minY = Math.min(minY, disp.y);
    if (prevD) maxStep = Math.max(maxStep, Math.hypot(disp.x - prevD.x, disp.z - prevD.z));
    prevD = { x: disp.x, z: disp.z };
    hop.feet.forEach((f, j) => {
      if (st === 'AIR') {
        // mid-air (body clearly up): the feet must be off the ground
        if (disp.y > 0.1 && f.anchor.y < f.restY + 0.05) airFeetOk = false;
        prevAnchor[j] = null; // anchors are rig-carried in the air
      } else {
        if (f.anchor.y !== f.restY) groundFeetOk = false;
        if (prevAnchor[j] && f.anchor.distanceTo(prevAnchor[j]) > 1e-9 && prevState === st) plantedMoved = true;
        prevAnchor[j] = (prevAnchor[j] ?? new THREE.Vector3()).copy(f.anchor);
      }
    });
    prevState = st;
  }
  const travel = Math.abs(disp.x);
  console.log(`  INFO  hop sim: ${hops} hops in 20s, displayed travel ${travel.toFixed(2)} (logical 7.00), y ${minY.toFixed(3)}..${maxY.toFixed(3)}, max frame step ${maxStep.toFixed(4)}`);
  assert(hops >= 10, `the hop is not inert (${hops} hops >= 10 over 20s, MEASURED)`);
  assert(Math.abs(travel - 7.0) < HOP_TRIGGER + 0.35, `displayed speed self-regulates to roam speed (travel ${travel.toFixed(2)} ~ 7.00, lag < trigger + a hop of drift)`);
  assert(minY >= -HOP_CROUCH_DIP - 1e-9 && maxY <= HOP_HEIGHT + 1e-9, `displayed y stays in [-dip, height] (${minY.toFixed(3)}..${maxY.toFixed(3)})`);
  assert(maxStep < 0.05, `the burst is continuous, never a teleport (max frame step ${maxStep.toFixed(4)} < 0.05, MEASURED)`);
  assert(airFeetOk, 'mid-air, both feet are off the ground (tucked with the body)');
  assert(groundFeetOk, 'grounded, both anchors sit exactly at rest height (planted on the ground)');
  assert(!plantedMoved, 'planted anchors are world-fixed within a grounded state');
  assert(sawSquash, 'CROUCH squashes the body (endpoints split along X — anticipation, measured live)');
  assert(sawStretch, 'AIR stretches the body (endpoints split along Y — measured live)');
  assert(restRestored, 'PAUSE restores the EXACT rest sphere (absolute-from-rest writes cannot drift, bit-exact)');
  // Jaw-drop (A4 stage 2), hand-computed at full open (angle 0.22 about
  // the body center + push 0.012 outward): mouth midpoint y drops from
  // 0.48 to 0.62 - 0.4550*sin(.22) - 0.14*cos(.22)... = 0.3806, and the
  // farthest endpoint reaches |rel| 0.4827 + 0.012 = at most 0.4947 from
  // the body center — always >= 0.005 INSIDE the r=0.5 body: the carve
  // stays SUBMERGED at any openness (the corner-run-off guard, live).
  assert(mouthMinY < 0.40 && mouthMinY > 0.36, `the mouth jaw-drops through the arc (lowest midpoint y ${mouthMinY.toFixed(4)}, hand-computed 0.3806 at the apex)`);
  assert(mouthMaxDist < 0.5 - 0.004, `the open mouth stays SUBMERGED every frame (max endpoint dist ${mouthMaxDist.toFixed(4)} < 0.496 — never grazes)`);
  assert(mouthRested, 'PAUSE restores the EXACT registry mouth (jaw writes are absolute from rest, bit-exact)');
  assert(HOP_AIR_TIME > 0 && HOP_TRIGGER > 0, 'hop constants are live');

// ---- Blink (A4 stage 2): decal submersion, deterministic, drift-proof ----
const { createBlink } = await import('./src/blink.js');
const { BLINK_PERIOD, BLINK_TIME } = await import('./src/config.js');
assert(createBlink({ prims: [] }) === null, 'creatures without blink data get no blink (graceful null)');
assert(BLINK_TIME < BLINK_PERIOD, 'a blink is shorter than its period');
// Every declared blink eye must resolve to a PAINT prim (registry rule).
for (const creature of CREATURES) {
  if (!creature.blink) continue;
  for (const id of creature.blink.eyes) {
    const prim = creature.prims.find((p) => p.id === id);
    assert(prim && !prim.negative, `[${creature.id}] blink eye '${id}' is a non-negative prim (decal or solid — both blink)`);
  }
}
{
  const bMat = createBlendMaterial(hopper.prims);
  const blink = createBlink(hopper, 0);
  const ei = hopper.prims.findIndex((p) => p.id === 'eyeball_l');
  const ii = hopper.prims.findIndex((p) => p.id === 'iris_l');
  const restE = new THREE.Vector3(...hopper.prims[ei].a);
  const bodyC = new THREE.Vector3(0, 0.62, 0);
  assert(blink.closeT(0) === 0, 'blink closeT(0) = 0 — eyes open at rest (the t=0 convention)');
  assert(Math.abs(blink.closeT(BLINK_TIME / 2) - 1) < 1e-9, 'blink closeT(mid) = 1 — fully closed (sine peak, hand-computed)');
  assert(blink.closeT(BLINK_TIME + 0.01) === 0, 'blink closeT past the window = 0');
  blink.update(BLINK_TIME / 2, [bMat]);
  // Depth = hostSd + 2r + edge lands every eye EXACTLY 2r+edge below its
  // target's surface. Hand-computed at full close:
  //   eyeball_l (solid, r 0.13): rest 0.4804 from the body center ->
  //     depth 0.2604 -> closed at 0.2200; sd -0.28: BURIED 0.15 under
  //     the skin (the tuck hides its mesh — the lid).
  //   iris_l (decal, r 0.055): its eyeball is ALSO blinking, so it
  //     retargets the BODY behind it (rest sd +0.1005) -> depth 0.2305
  //     -> closed at 0.3700 from the body center; sd -0.13 = -(2r+edge)
  //     exactly: under the lid, no dark dot.
  const closedE = bMat.uniforms.uA.value[ei].distanceTo(bodyC);
  const closedI = bMat.uniforms.uA.value[ii].distanceTo(bodyC);
  assert(Math.abs(closedE - 0.22) < 3e-3, `closed eyeball center 0.220 from the body center (hand-computed, got ${closedE.toFixed(4)})`);
  assert(closedE + hopper.prims[ei].r < 0.5 - 0.1, 'closed eyeball is BURIED >= 0.1 under the skin (the tuck is the lid)');
  assert(Math.abs(closedI - 0.37) < 3e-3, `closed iris center 0.370 from the body center (hand-computed, got ${closedI.toFixed(4)})`);
  assert(closedI + hopper.prims[ii].r + PAINT_EDGE <= 0.5 + 1e-9, 'closed iris sits >= r+edge under the lid — no dark dot pokes through');
  // Reopen: bit-exact registry restoration (absolute-from-rest writes).
  blink.update(BLINK_TIME + 0.01, [bMat]);
  assert(bMat.uniforms.uA.value[ei].distanceTo(restE) === 0, 'reopened eye is the EXACT registry pose (bit-exact — blinking cannot drift)');
}

}

// World-space lighting: the fragment shader must rotate the creature-space
// SDF normal by the model matrix, or the light turns with the roamer.
const litMat = createBlendMaterial(critter.prims);
assert(litMat.fragmentShader.includes('mat3(modelMatrix)'), 'fragment lighting rotates normals into world space (mat3(modelMatrix))');

// Per-prim blend caps (the thin-part trick). Effective k = min(slider, cap).
// Hand-computed with the shipped CUBIC smin: smin(1,1,k) = 1 - k/6.
//   Longneck neck (kCap 0.12): slider 0.25 -> k 0.12 -> smin(1,1) = 0.98
//   Slider cranked to 0.60    -> k STILL 0.12 -> 0.98 (the cap holds)
//   An uncapped prim (sentinel 1e3): slider 0.60 -> k 0.60 -> 0.90
function effK(slider, cap) { return Math.min(slider, cap); }
const neck = longneck.prims.find((p) => p.id === 'neck');
assert(neck.kCap === 0.12, 'longneck neck kCap = 0.12 (design probe: the melty-neck fix is live)');
assert(Math.abs(smin(1, 1, effK(0.25, neck.kCap)) - 0.98) < 1e-9, 'capped smin at slider 0.25 = 0.98 (hand-computed, cubic 1 - k/6)');
assert(Math.abs(smin(1, 1, effK(0.6, neck.kCap)) - 0.98) < 1e-9, 'capped smin at slider 0.60 = 0.98 — the cap HOLDS against the slider');
assert(Math.abs(smin(1, 1, effK(0.6, 1e3)) - 0.9) < 1e-9, 'uncapped smin at slider 0.60 = 0.90 (sentinel does not clamp)');
assert(longneck.prims.find((p) => p.id === 'tail').kCap === 0.07, 'longneck tail kCap = 0.07');

// ---------- Section 2: field inspector ----------
// A JS mirror of the shader's mapSDF plus a plane-slice sampler (the
// fogleman show_slice idea, Node-only): sample the field on axis-aligned
// slices through every solid prim, bisect the zero contour, and MEASURE
// how far the smin skin inflates above the raw primitives. Every later
// field-mutating pass (per-prim k, dilate, subtraction) gets audited
// against these measured numbers. See REFERENCE_FOGLEMAN.md.
console.log('Section 2: field inspector');

const { K_MAX } = await import('./src/config.js');

// Test tunables (suite-local: these tune the PROBES, not the runtime).
const FIELD_RES = 96; // grid nodes per slice axis (~0.03 world units/cell)
const FIELD_PAD = 0.35; // bbox padding: contour bulge never exceeds this
const BISECT_ITERS = 30; // zero-crossing precision ~ cell / 2^30

// Mirror of the shader's mapSDF: TWO PHASES (union all positive solids,
// then subtract all negatives from the finished union — carve registry
// position never matters), sequential folds in REGISTRY ORDER within each
// phase, per-prim k resolution (authored k beats slider; kCap ceilings
// either), paint skipped — semantics must match character-for-character
// or every measurement below audits the wrong field.
function sdiff(d1, d2, k) {
  // fogleman dn.py verbatim: TWO sign flips vs smin — (d2 + d1) inside h,
  // correction ADDED (carving pushes the wall outward-of-the-cut).
  const h = Math.min(Math.max(0.5 - (0.5 * (d2 + d1)) / k, 0), 1);
  return d1 + (-d2 - d1) * h + k * h * (1 - h);
}
function primKJs(prim, k) {
  const base = prim.k != null ? prim.k : k;
  return Math.min(base, prim.kCap != null ? prim.kCap : 1e3);
}
function mapField(p, prims, k, inflate = 0) {
  let d = 1e9;
  for (const prim of prims) {
    if (prim.paint || prim.negative) continue;
    d = smin(d, sdPrim(p, prim), primKJs(prim, k));
  }
  for (const prim of prims) {
    if (!prim.negative) continue;
    d = sdiff(d, sdPrim(p, prim), primKJs(prim, k));
  }
  return d - inflate; // whole-creature dilate (Pass 3); 0 = the raw field
}
function rawMinSolid(p, prims) {
  let m = Infinity;
  for (const s of prims) {
    if (s.paint || s.negative) continue; // POSITIVE union only (inflation is measured above it)
    m = Math.min(m, sdPrim(p, s));
  }
  return m;
}
// The EXACT hard-CSG field: max(min over positives, max over -negatives).
// With no negatives this IS rawMinSolid, so one banded invariant covers
// carved and uncarved creatures alike: the smooth contour must stay
// within a measured band of the hard surface.
function hardCSG(p, prims) {
  let d = rawMinSolid(p, prims);
  for (const n of prims) {
    if (!n.negative) continue;
    d = Math.max(d, -sdPrim(p, n));
  }
  return d;
}

// --- mirror parity, hand-computed on a synthetic pair (exact theory) ---
// Two spheres r=0.3 at x=+-0.3, k=0.25. At the origin both raw distances
// are 0, so the pair fold hits the cubic's h=1 midpoint: field = -k/6.
const PAIR = [
  { id: 's1', type: 'sphere', a: [-0.3, 0, 0], r: 0.3 },
  { id: 's2', type: 'sphere', a: [0.3, 0, 0], r: 0.3 },
];
assert(Math.abs(mapField([0, 0, 0], PAIR, 0.25) - -(0.25 / 6)) < 1e-12, 'mapField mirror: pair midpoint = -k/6 = -0.0417 (hand-computed)');
// On the equidistant ridge the contour sits where raw d = k/6: at
// y = sqrt((r + k/6)^2 - 0.09) the field is exactly zero and the local
// inflation (min raw distance) is exactly k/6 = 0.0417.
const RIDGE_Y = Math.sqrt((0.3 + 0.25 / 6) ** 2 - 0.09);
assert(Math.abs(mapField([0, RIDGE_Y, 0], PAIR, 0.25)) < 1e-12, 'mapField mirror: ridge contour point is on the zero surface (hand-computed)');
assert(Math.abs(rawMinSolid([0, RIDGE_Y, 0], PAIR) - 0.25 / 6) < 1e-12, 'ridge inflation = k/6 exactly (hand-computed)');
// kCap parity: capping the SECOND prim caps the pair fold: field = -kCap/6.
const PAIR_CAPPED = [PAIR[0], { ...PAIR[1], kCap: 0.1 }];
assert(Math.abs(mapField([0, 0, 0], PAIR_CAPPED, 0.25) - -(0.1 / 6)) < 1e-12, 'mapField mirror honors kCap: capped pair midpoint = -0.0167 (hand-computed)');
// Absolute per-prim k (Pass 2): authored k governs that prim's fold —
// wider OR narrower than the slider — and HOLDS when the slider moves
// (authored beats ambient). kCap still ceilings it. All hand-computed
// from field(midpoint) = -kEff/6.
const PAIR_ABS = [PAIR[0], { ...PAIR[1], k: 0.4 }];
assert(Math.abs(mapField([0, 0, 0], PAIR_ABS, 0.25) - -(0.4 / 6)) < 1e-12, 'absolute k=0.4 overrides slider 0.25: pair midpoint = -0.0667 (hand-computed)');
assert(Math.abs(mapField([0, 0, 0], PAIR_ABS, 0.6) - -(0.4 / 6)) < 1e-12, 'absolute k HOLDS against slider 0.6: pair midpoint still -0.0667');
const PAIR_ABS_NARROW = [PAIR[0], { ...PAIR[1], k: 0.08 }];
assert(Math.abs(mapField([0, 0, 0], PAIR_ABS_NARROW, 0.25) - -(0.08 / 6)) < 1e-12, 'absolute k=0.08 narrows below slider 0.25: pair midpoint = -0.0133 (hand-computed)');
const PAIR_ABS_CAPPED = [PAIR[0], { ...PAIR[1], k: 0.4, kCap: 0.1 }];
assert(Math.abs(mapField([0, 0, 0], PAIR_ABS_CAPPED, 0.25) - -(0.1 / 6)) < 1e-12, 'kCap ceilings an authored k: min(0.4, 0.1) -> midpoint = -0.0167 (hand-computed)');
// The shader carries the same resolution order (the mirror above is only
// trustworthy if the GLSL it mirrors actually does this).
const kMat = createBlendMaterial(PAIR_ABS);
assert(kMat.vertexShader.includes('uKPrim[i] > 0.0 ? uKPrim[i] : uK'), 'GLSL resolves authored k over the slider (uKPrim override expression present)');
assert(kMat.uniforms.uKPrim.value[0] === -1.0 && kMat.uniforms.uKPrim.value[1] === 0.4, 'material mirrors a synthetic authored k (sentinel -1 beside 0.4)');
// Dilate (Pass 3), hand-computed: a lone r=0.3 sphere dilated by 0.05 has
// its skin at exactly 0.35; a dilated pair midpoint deepens to -k/6 - 0.05;
// the equidistant ridge contour moves out to where raw d = k/6 + inflate.
const LONE = [{ id: 's', type: 'sphere', a: [0, 0, 0], r: 0.3 }];
assert(Math.abs(mapField([0.35, 0, 0], LONE, 0.25, 0.05)) < 1e-12, 'dilated lone sphere: skin at exactly r + inflate = 0.35 (hand-computed)');
assert(Math.abs(mapField([0, 0, 0], PAIR, 0.25, 0.05) - -(0.25 / 6 + 0.05)) < 1e-12, 'dilated pair midpoint = -k/6 - inflate = -0.0917 (hand-computed)');
const RIDGE_Y_DIL = Math.sqrt((0.3 + 0.25 / 6 + 0.05) ** 2 - 0.09); // raw d = k/6 + 0.05
assert(Math.abs(mapField([0, RIDGE_Y_DIL, 0], PAIR, 0.25, 0.05)) < 1e-12, 'dilated ridge contour is on the zero surface (hand-computed)');
// Materials carry it on BOTH draws (outline must ride the plumped skin),
// and its absence is guarded — existing creatures behave exactly as before.
const dMat = createBlendMaterial(PAIR, 0.05);
const dInk = createOutlineMaterial(PAIR, 0.05);
assert(dMat.uniforms.uInflate.value === 0.05 && dInk.uniforms.uInflate.value === 0.05, 'skin AND ink mirror an explicit inflate (0.05)');
assert(createBlendMaterial(PAIR).uniforms.uInflate.value === 0, 'inflate defaults to 0 (?? guard — a creature without the field is unchanged)');
assert(dMat.vertexShader.includes('return d - uInflate'), 'GLSL mapSDF subtracts the dilate');
assert(dMat.vertexShader.includes('dOther - uInflate'), 'GLSL burial boundary shifts with the dilated skin (the raw-band tuck gap)');
// Smooth difference (Pass 4), hand-computed — the sign flips are exactly
// where a silent bug would live, so every regime gets an exact anchor:
//   double boundary (d1=d2=0): h=0.5 -> +k/4 (pushed OUT — union's mirror)
//   deep inside the cut:  degrades to -d2 exactly (hard difference)
//   cut far away:         degrades to d1 exactly (no-op)
//   mid-band (d2 = -d1):  hard wall -0.3 pushed out by k/4 -> -0.2375
assert(sdiff(0, 0, 0.25) === 0.0625, 'sdiff at the double boundary = +k/4 = 0.0625 (hand-computed)');
assert(sdiff(0, -5, 0.25) === 5, 'sdiff deep inside the cut degrades to -d2 (hard difference)');
assert(sdiff(0, 5, 0.25) === 0, 'sdiff with the cut far away degrades to d1 (no-op)');
assert(Math.abs(sdiff(-0.3, 0.3, 0.25) - -0.2375) < 1e-12, 'sdiff mid-band: hard -0.3 pushed out to -0.2375 (hand-computed)');
// A carve actually carves: solid r=0.3 at origin, cut r=0.15 centered ON
// its surface, near-hard k=0.05. At the cut's center the raw solid says 0
// (on the surface) but the field says +0.15 = -d2 exactly: that skin is
// GONE and the point sits 0.15 outside the carved wall (hand-computed).
const CUT = [{ id: 's', type: 'sphere', a: [0, 0, 0], r: 0.3 }, { id: 'c', type: 'sphere', a: [0.3, 0, 0], r: 0.15, negative: true }];
assert(Math.abs(mapField([0.3, 0, 0], CUT, 0.05) - 0.15) < 1e-12, 'the field flips POSITIVE inside a carve (skin removed, hand-computed)');
// Two-phase fold: a carve's registry POSITION never changes the field —
// probe several points with the negative first vs last.
const CUT_R = [CUT[1], CUT[0]];
const ORDER_PTS = [[0.3, 0, 0], [0, 0.3, 0], [0.25, 0.1, 0.05], [-0.3, 0, 0], [0.4, 0.1, 0]];
assert(ORDER_PTS.every((p) => mapField(p, CUT, 0.25) === mapField(p, CUT_R, 0.25)), 'carve registry position never changes the field (two-phase fold)');
// GLSL carries the same structure (the mirror is only trustworthy if the
// shader actually does this).
assert(dMat.vertexShader.includes('float sdiff('), 'GLSL has the smooth-difference operator');
assert(dMat.vertexShader.includes('uPaint[i] < 0.5 && uNeg[i] < 0.5'), 'GLSL phase 1 unions positives only');
assert(dMat.vertexShader.includes('uNeg[i] > 1.5'), 'GLSL COMPOSITES colored carves as decals (colorless bowls keep the host color)');
assert(dMat.vertexShader.includes('i != own && uPaint[i] < 0.5 && uNeg[i] < 0.5'), 'GLSL burial ignores carves (the host must line its own bowl)');
// The mouth-shadow defect, bug-then-fix (hand-computed): a weighted blend
// cannot CONTAIN a color. OLD model at Pudge's face, 0.05 from the mouth:
// host weight 1/(0.04+SOFT)^2 = 330.6 (0.04 = his dilate weakening the
// contact weight — the diagnostic fingerprint), mouth weight 1/(0.05+
// SOFT)^2 = 236.7 -> the near-black holds 42% of clean skin. NEW model:
// composite coverage there is EXACTLY zero.
function shadowShare(dHost, dMouth) {
  const wH = 1 / Math.pow(Math.max(dHost, 0) + COLOR_SOFT, COLOR_POW);
  const wM = 1 / Math.pow(Math.max(dMouth, 0) + COLOR_SOFT, COLOR_POW);
  return wM / (wH + wM);
}
assert(shadowShare(0.04, 0.05) > 0.4, `OLD model: mouth held ${(shadowShare(0.04, 0.05) * 100).toFixed(0)}% of skin 0.05 away under dilate (reproduces the shadow)`);
assert(coverage(0.05, 0) === 0, 'NEW model: composite coverage 0.05 away is EXACTLY zero (the fix)');
assert(coverage(-0.04, 0) === 1, 'NEW model: on the bowl wall (inside the carve volume) coverage saturates');
assert(Math.abs(coverage(PAINT_EDGE / 2, 0) - 0.5) < 1e-12, 'NEW model: coverage at the half-edge = 0.5 exactly (hand-computed smoothstep midpoint)');
// Dilate-compensated carve edge (the pudge-blur fix, hand-computed): the
// threshold shifts by the CONSTANT dilate, so the coverage boundary lands
// on the DILATED carve (where the dilated skin actually crosses) with the
// raw pair's crisp dihedral. covCarve mirrors the shader exactly.
function covCarve(d, inflate) {
  return 1 - smoothstep(inflate, inflate + PAINT_EDGE, d);
}
assert(covCarve(0.04, 0.04) === 1, 'carve edge under dilate 0.04: the dilated boundary (d = inflate) is fully covered');
assert(covCarve(0.04 + PAINT_EDGE, 0.04) === 0, 'carve edge under dilate: exactly zero one edge-width past the dilated boundary');
assert(Math.abs(covCarve(0.04 + PAINT_EDGE / 2, 0.04) - 0.5) < 1e-12, 'carve edge under dilate: half-edge midpoint = 0.5 exactly');
assert(covCarve(0.03, 0) === 0 && coverage(0.03, 0) === 0, 'inflate 0 degrades to the uncompensated edge (hopper unchanged)');
assert(dMat.vertexShader.includes('smoothstep(uInflate, uInflate + uPaintEdge'), 'GLSL carve coverage threshold shifts by the dilate');

// --- the slice sampler ---
// Grid-sample one axis-aligned plane, bisect every sign-change edge to the
// zero contour, and measure the inflation (min raw solid distance) there.
function solidBBox(prims, pad) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const s of prims) {
    if (s.paint || s.negative) continue; // carves never extend the surface
    for (const e of [s.a, s.b ?? s.a]) {
      for (let i = 0; i < 3; i++) {
        lo[i] = Math.min(lo[i], e[i] - s.r - pad);
        hi[i] = Math.max(hi[i], e[i] + s.r + pad);
      }
    }
  }
  return { lo, hi };
}

function sampleSlice(prims, k, axis, value, inflate = 0) {
  const box = solidBBox(prims, FIELD_PAD);
  const [u, v] = [0, 1, 2].filter((i) => i !== axis);
  const point = (uu, vv) => {
    const p = [0, 0, 0];
    p[axis] = value;
    p[u] = uu;
    p[v] = vv;
    return p;
  };
  const du = (box.hi[u] - box.lo[u]) / (FIELD_RES - 1);
  const dv = (box.hi[v] - box.lo[v]) / (FIELD_RES - 1);
  const f = new Float64Array(FIELD_RES * FIELD_RES);
  for (let j = 0; j < FIELD_RES; j++) {
    for (let i = 0; i < FIELD_RES; i++) {
      f[j * FIELD_RES + i] = mapField(point(box.lo[u] + i * du, box.lo[v] + j * dv), prims, k, inflate);
    }
  }
  // Bisect a sign-change edge to the contour. The endpoint kept is the one
  // whose sign matches fA, so the return converges onto the zero surface.
  function crossing(pA, pB, fA) {
    let a = pA;
    let b = pB;
    for (let it = 0; it < BISECT_ITERS; it++) {
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      if (mapField(m, prims, k, inflate) < 0 === fA < 0) a = m;
      else b = m;
    }
    return a;
  }
  let count = 0;
  let maxInfl = -Infinity;
  let minInfl = Infinity;
  let maxAt = null;
  let minHard = Infinity;
  for (let j = 0; j < FIELD_RES; j++) {
    for (let i = 0; i < FIELD_RES; i++) {
      const idx = j * FIELD_RES + i;
      const here = point(box.lo[u] + i * du, box.lo[v] + j * dv);
      const edges = [];
      if (i + 1 < FIELD_RES && f[idx] < 0 !== f[idx + 1] < 0) edges.push(point(box.lo[u] + (i + 1) * du, box.lo[v] + j * dv));
      if (j + 1 < FIELD_RES && f[idx] < 0 !== f[idx + FIELD_RES] < 0) edges.push(point(box.lo[u] + i * du, box.lo[v] + (j + 1) * dv));
      for (const there of edges) {
        const p = crossing(here, there, f[idx]);
        const infl = rawMinSolid(p, prims);
        count++;
        if (infl > maxInfl) {
          maxInfl = infl;
          maxAt = p;
        }
        minInfl = Math.min(minInfl, infl);
        minHard = Math.min(minHard, hardCSG(p, prims));
      }
    }
  }
  return { axis, value, f, count, maxInfl, minInfl, maxAt, minHard };
}

// ASCII field dump — printed ONLY when a slice's probe fails, so the field
// is visible in the terminal instead of reverse-engineered from symptoms.
// '#' deep inside, '+' just inside, 'o' the near-contour band, '.' outside.
function dumpSlice(slice) {
  const AXIS = 'xyz';
  console.log(`  ---- field slice ${AXIS[slice.axis]}=${slice.value.toFixed(2)} ----`);
  for (let j = FIELD_RES - 1; j >= 0; j -= 2) {
    let line = '';
    for (let i = 0; i < FIELD_RES; i++) {
      const d = slice.f[j * FIELD_RES + i];
      line += d < -0.05 ? '#' : d < 0 ? '+' : d < 0.05 ? 'o' : '.';
    }
    console.log('  ' + line);
  }
}

// Sampler validated against the synthetic pair before it measures anything
// real: on the z=0 slice its measured max inflation must land on the
// hand-computed ridge value k/6 (grid can only UNDERSHOOT the ridge peak).
const pairSlice = sampleSlice(PAIR, 0.25, 2, 0);
assert(pairSlice.count > 100, `sampler finds the pair contour (${pairSlice.count} crossings)`);
assert(pairSlice.minInfl > -1e-6, `sampler: pair contour never dips below a raw surface (min ${pairSlice.minInfl.toExponential(2)})`);
// Crossings live on grid EDGES, and inflation falls off steeply along the
// contour away from the ridge crease — so the sampler UNDERSHOOTS the true
// peak by up to ~a cell (MEASURED 0.0545 at res 96) and must never exceed
// it. The exact ridge value itself is anchored analytically above.
assert(pairSlice.maxInfl > 0.03 && pairSlice.maxInfl <= 0.25 / 6 + 1e-9, `sampler lands within a cell of the pair ridge (${pairSlice.maxInfl.toFixed(4)}, true peak 0.0417, MEASURED 0.0335 at res 96)`);
// Dilated sampling: on a dilated field the contour's raw-min distance is
// smin + inflate >= inflate everywhere — the sampler must see the whole
// contour floating at least the dilate above every raw surface.
const dilSlice = sampleSlice(PAIR, 0.25, 2, 0, 0.05);
assert(dilSlice.count > 100, `sampler finds the dilated pair contour (${dilSlice.count} crossings)`);
assert(dilSlice.minInfl > 0.05 - 1e-6, `dilated contour floats at least the dilate above raw surfaces (min ${dilSlice.minInfl.toFixed(4)} >= 0.05)`);

// --- per-creature measurement: y- and z-slices through every solid prim ---
// (creatures are elongated along x, so y/z slices are the ones that cut
// across joins; slices dedupe at 0.01 world units).
function creatureSlices(prims) {
  const seen = new Map();
  for (const s of prims) {
    if (s.paint) continue;
    const b = s.b ?? s.a;
    const mid = [(s.a[0] + b[0]) / 2, (s.a[1] + b[1]) / 2, (s.a[2] + b[2]) / 2];
    for (const axis of [1, 2]) {
      const key = axis + ':' + mid[axis].toFixed(2);
      if (!seen.has(key)) seen.set(key, { axis, value: mid[axis] });
    }
  }
  return [...seen.values()];
}

// MEASURED inflation ceilings (max over the sampled slices, +0.02 margin).
// FINDING: the pairwise theory bound (k/6, cubic since R2) is WRONG for
// 3+ close prims — mapSDF folds smin sequentially, so each fold can
// deepen the deficit again. Measured (cubic): critter 0.0638 at k=0.25
// (k/6 = 0.0417, +53%: the knee crotch); longneck 0.2176 at k=0.6
// (k/6 = 0.10, ~2.2x) — same compounding shape as the quadratic era, at
// about two-thirds the magnitude. This is why
// the decal fix subtracts ACTUAL local inflation, never an assumed bound.
// Re-measure (the INFO lines print live values) whenever a pass changes
// the field, and update this table.
const INFL_CEILING = {
  critter: { 0.25: 0.084, 0.6: 0.219 }, // re-MEASURED after R2 cubic smin (0.0638/0.1984); quadratic era was 0.0974/0.3088
  hopper: { 0.25: 0.098, 0.6: 0.189 }, // at breath peak (+0.012); re-MEASURED after R2 (0.0776/0.1689)
  longneck: { 0.25: 0.082, 0.6: 0.238 }, // re-MEASURED after R2 (0.0615/0.2176); the knee crotch still compounds
  pudge: { 0.25: 0.122, 0.6: 0.18 }, // at breath peak (dilate 0.04 + amplitude 0.02); re-MEASURED after R2 (0.1016/0.1598)
  snail: { 0.25: 0.074, 0.6: 0.132 }, // at breath peak (+0.012); re-MEASURED after R2 (0.0534/0.1118)
  skitter: { 0.25: 0.03, 0.6: 0.03 }, // fully authored blends: MEASURED 0.0064 at BOTH k after R2 (every close pair capped)
};
// Carved creatures: MEASURED bounds (+0.02 margin) for the generalized
// invariants. hardBand = how far the smooth contour may sit inside the
// exact hard-CSG surface (MEASURED -0.0273 at k=0.25, -0.0099 at k=0.6 —
// the band SHRINKS at high k because the plumper union pushes the smooth
// wall outward relative to hard); carveFloor = deepest legitimate dip
// below the POSITIVE union (MEASURED -0.1066 at both k — the mouth's
// hand-computed penetration depth 0.1068, confirmed by the field).
const CARVE_BOUNDS = {
  hopper: {
    // MEASURED at breath peak (+0.012), re-MEASURED after R2: min infl
    // -0.1019 (unchanged — the carve depth is sdiff's, and sdiff kept its
    // quadratic math in the union-only swap); min hard -0.0027 at k=0.25
    // / +0.0047 at k=0.6.
    0.25: { hardBand: 0.021, carveFloor: 0.122 },
    0.6: { hardBand: 0.02, carveFloor: 0.122 },
  },
  pudge: {
    // MEASURED at breath peak (dilate 0.04 + amplitude 0.02), re-MEASURED
    // after R2 (identical — every close pair on this face is capped): min infl
    // -0.0387, min hard POSITIVE (+0.0600 — the peak dilate lifts the
    // contour even further outside hard CSG).
    0.25: { hardBand: 0.02, carveFloor: 0.059 },
    0.6: { hardBand: 0.02, carveFloor: 0.059 },
  },
};

for (const creature of CREATURES) {
  const tag = `[${creature.id}]`;
  const prims = creature.prims;
  const solids = prims.filter((p) => !p.paint && !p.negative); // positives only: carve cores are NOT negative-field
  const slices = creatureSlices(prims);
  // Breathing creatures are audited at the BREATH PEAK — the largest
  // field the renderer ever shows (a rest-only audit would guard a field
  // the browser exceeds every inhale).
  const inflPeak = (creature.inflate ?? 0) + (creature.breath?.amplitude ?? 0);

  // Sign sanity at BLEND_K: the field is negative at every solid's core
  // (smin can only deepen the raw -r there) and positive at the padded
  // bbox corner (everything is at least FIELD_PAD away out there).
  for (const s of solids) {
    const b = s.b ?? s.a;
    const mid = [(s.a[0] + b[0]) / 2, (s.a[1] + b[1]) / 2, (s.a[2] + b[2]) / 2];
    assert(mapField(mid, prims, BLEND_K, inflPeak) < 0, `${tag} field is negative inside '${s.id}'`);
  }
  const corner = solidBBox(prims, FIELD_PAD).hi;
  assert(mapField(corner, prims, K_MAX, inflPeak) > 0, `${tag} field is positive at the padded bbox corner (even at k=${K_MAX})`);

  const measured = {};
  const negs = prims.filter((p) => p.negative);
  for (const k of [BLEND_K, K_MAX]) {
    let count = 0;
    let maxInfl = -Infinity;
    let minInfl = Infinity;
    let minHard = Infinity;
    let maxSlice = null;
    let minSlice = null;
    for (const sl of slices) {
      const r = sampleSlice(prims, k, sl.axis, sl.value, inflPeak);
      count += r.count;
      if (r.maxInfl > maxInfl) {
        maxInfl = r.maxInfl;
        maxSlice = r;
      }
      if (r.minInfl < minInfl) {
        minInfl = r.minInfl;
        minSlice = r;
      }
      minHard = Math.min(minHard, r.minHard);
    }
    measured[k] = maxInfl;
    const at = maxSlice.maxAt;
    console.log(`  INFO  ${tag} k=${k}: ${slices.length} slices, ${count} crossings, max inflation ${maxInfl.toFixed(4)} at (${at[0].toFixed(2)}, ${at[1].toFixed(2)}, ${at[2].toFixed(2)})${negs.length ? `, min infl ${minInfl.toFixed(4)}, min hard ${minHard.toFixed(4)}` : ''} [pairwise k/6 = ${(k / 6).toFixed(4)}]`);

    if (!(count > 500)) dumpSlice(maxSlice ?? sampleSlice(prims, k, 2, 0));
    assert(count > 500, `${tag} k=${k}: the slices see the creature (${count} contour crossings > 500)`);
    if (negs.length === 0) {
      // smin <= min means the skin can only sit ON or ABOVE every raw
      // surface — a contour point below one would mean the mirror and the
      // shader disagree about what smin is. EXACT, but only without carves.
      if (!(minInfl > -1e-6)) dumpSlice(minSlice);
      assert(minInfl > -1e-6, `${tag} k=${k}: contour never dips below a raw surface (min inflation ${minInfl.toExponential(2)})`);
    } else {
      // Carved: bowl walls legitimately sit BELOW the positive union (by
      // up to the carve depth + smooth rounding), so the invariant
      // generalizes: the contour must stay within a MEASURED band of the
      // exact hard-CSG surface, and must never dip deeper below the
      // positive union than the carve floor. Both from CARVE_BOUNDS.
      const bounds = CARVE_BOUNDS[creature.id]?.[k];
      if (!(bounds && minHard > -bounds.hardBand)) dumpSlice(minSlice);
      assert(bounds && minHard > -bounds.hardBand, `${tag} k=${k}: contour within the hard-CSG band (min hard ${minHard.toFixed(4)} > -${bounds?.hardBand} MEASURED)`);
      assert(minInfl > -bounds.carveFloor, `${tag} k=${k}: carve depth bounded (min inflation ${minInfl.toFixed(4)} > -${bounds.carveFloor} MEASURED)`);
    }
    // Regression ceiling: MEASURED max + margin. If a pass legitimately
    // moves this, re-measure from the INFO line and update the table.
    const ceiling = INFL_CEILING[creature.id]?.[k] ?? k / 6 + 0.02;
    if (!(maxInfl <= ceiling)) dumpSlice(maxSlice);
    assert(maxInfl <= ceiling, `${tag} k=${k}: max inflation ${maxInfl.toFixed(4)} <= ${ceiling} (MEASURED ceiling)`);
  }
  // The mechanism behind the k=0.6 vanishing-decals defect, now a live
  // probe: inflation must actually GROW with k — UNLESS the creature is
  // fully authored (every close pair kCap'd/k'd below the slider range:
  // Skitter — six thin legs NEED caps, so the slider legitimately has
  // nothing left to govern; measured 0.0064 at BOTH k after R2). Strict growth
  // applies only where >= 2 solids are slider-governed.
  assert(measured[BLEND_K] > 0.005, `${tag} inflation is live at k=${BLEND_K} (${measured[BLEND_K].toFixed(4)} > 0.005 — the sampler is not inert)`);
  const sliderGoverned = solids.filter((p) => p.k == null && (p.kCap == null || p.kCap >= K_MAX)).length >= 2;
  if (sliderGoverned) {
    assert(measured[K_MAX] > measured[BLEND_K], `${tag} inflation grows with k (${measured[K_MAX].toFixed(4)} > ${measured[BLEND_K].toFixed(4)}) — the decal-defect mechanism, measured live`);
  } else {
    assert(measured[K_MAX] >= measured[BLEND_K] - 1e-9, `${tag} fully AUTHORED blends: slider-immune by design (${measured[K_MAX].toFixed(4)} vs ${measured[BLEND_K].toFixed(4)} — every close pair capped)`);
  }
}

// --- carve regression anchors (hopper's mouth: the first carve) ---
// The generalizable checks (dent/pierce, decal clearance, donor density)
// moved into the per-creature Section 1 loop; what stays here is the
// hand-computed skin-removal anchor for the first-ever carve, and the
// design probe that the demo mouth exists at all.
{
  const mouth = hopper.prims.find((p) => p.id === 'mouth');
  const bodyH = hopper.prims.find((p) => p.id === 'body');
  assert(mouth && mouth.negative === true && typeof mouth.color === 'number', 'hopper has the demo mouth carve (negative, colored)');
  // The carve actually removes skin: the body-surface point on the ray
  // toward the mouth's MIDPOINT (it is a capsule slit now) sat ON the
  // skin pre-carve; post-carve the field there must be clearly positive.
  const mb = mouth.b ?? mouth.a;
  const mMid = [(mouth.a[0] + mb[0]) / 2, (mouth.a[1] + mb[1]) / 2, (mouth.a[2] + mb[2]) / 2];
  const dir = [mMid[0] - bodyH.a[0], mMid[1] - bodyH.a[1], mMid[2] - bodyH.a[2]];
  const dl = Math.hypot(...dir);
  const P = [bodyH.a[0] + (dir[0] / dl) * bodyH.r, bodyH.a[1] + (dir[1] / dl) * bodyH.r, bodyH.a[2] + (dir[2] / dl) * bodyH.r];
  assert(mapField(P, hopper.prims, BLEND_K) > 0.02, `the mouth removed skin (field at the old skin point = ${mapField(P, hopper.prims, BLEND_K).toFixed(4)} > 0.02)`);
}

// ---- Fold detector (A4, permanent): zero folded INK triangles at carves ----
// The black-domes defect class, closed structurally: a folded triangle
// shows its back face, which is exactly what BackSide ink draws. Since
// the ink IGNORES carves (uniform-level), its field has no crease to
// fold into — this probe re-runs the FULL ink vertex pipeline (burial
// ramp, snap iterations, tuck) on the real INDEXED geometry around every
// carve and asserts the invariant holds. Both instrument lessons are
// baked in: walk geo.index (raw position triplets are NOT triangles),
// and mirror every pipeline stage (omitting burial+tuck once counted
// known leg-root folds as signal).
{
  const { SNAP_ITERS } = await import('./src/config.js');
  const H = 0.02; // tetrahedron normal probe step, mirrors FIELD_GLSL
  const TET = [[1, -1, -1], [-1, -1, 1], [-1, 1, -1], [1, 1, 1]];
  for (const creature of CREATURES) {
    const negs = creature.prims.filter((p) => p.negative);
    // Scan regions: every carve bbox AND (A5) every knee — the seam-ring
    // defect lived exactly where the fold/tuck machinery met a new
    // junction class, so kneed creatures joined the detector's beat.
    const kneesMap = creature.step?.knees ?? {};
    const kneeBoxes = Object.values(kneesMap).map((thighId) => {
      const t = creature.prims.find((p) => p.id === thighId);
      return t ? { c: t.b, r: Math.max(t.r, 0.1) + 0.1 } : null;
    }).filter(Boolean);
    if (negs.length === 0 && kneeBoxes.length === 0) continue;
    const tag = `[${creature.id}]`;
    // The limb map, mirrored (same-limb prims never bury each other).
    const limbOf = new Array(creature.prims.length).fill(0);
    Object.entries(kneesMap).forEach(([shinId, thighId], gi) => {
      limbOf[creature.prims.findIndex((p) => p.id === shinId)] = gi + 1;
      limbOf[creature.prims.findIndex((p) => p.id === thighId)] = gi + 1;
    });
    const inflate = creature.inflate ?? 0;
    const inkPrims = creature.prims.filter((p) => !p.negative); // the ink's field: carves hidden
    const F = (p) => mapField(p, inkPrims, BLEND_K, inflate);
    const N = (p) => {
      const n = [0, 0, 0];
      for (const s of TET) {
        const f = F([p[0] + s[0] * H, p[1] + s[1] * H, p[2] + s[2] * H]);
        n[0] += s[0] * f;
        n[1] += s[1] * f;
        n[2] += s[2] * f;
      }
      const l = Math.hypot(n[0], n[1], n[2]);
      return [n[0] / l, n[1] / l, n[2] / l];
    };
    const geo = buildShellGeometry(creature.prims, kneesMap); // mirror the render path: capless knees
    const pos = geo.getAttribute('position');
    const aPrim = geo.getAttribute('aPrim');
    const idx = geo.index;
    const tuck = OUTLINE_WIDTH + TUCK_DEPTH; // the INK's tuck
    const cache = new Map();
    const pipeline = (vi) => {
      if (cache.has(vi)) return cache.get(vi);
      const p = [pos.getX(vi), pos.getY(vi), pos.getZ(vi)];
      const own = aPrim.array[vi];
      let dOther = 1e9;
      creature.prims.forEach((pr, i) => {
        if (i === own || pr.paint || pr.negative) return;
        if (limbOf[own] > 0 && limbOf[i] === limbOf[own]) return; // same limb: no mutual burial
        dOther = Math.min(dOther, sdPrim(p, pr));
      });
      const buryT = 1 - smoothstep(-BURY_EPS - BURY_BAND - inflate, -BURY_EPS - inflate, dOther - inflate);
      let q = [p[0], p[1], p[2]];
      for (let i = 0; i < SNAP_ITERS; i++) {
        const d = F(q) - OUTLINE_WIDTH;
        const n = N(q);
        q = [q[0] - n[0] * d, q[1] - n[1] * d, q[2] - n[2] * d];
      }
      const n = N(q);
      const out = { p: [q[0] - n[0] * tuck * buryT, q[1] - n[1] * tuck * buryT, q[2] - n[2] * tuck * buryT], dOther };
      cache.set(vi, out);
      return out;
    };
    let openFolds = 0; // folds in OPEN SKIN — the actual defect class
    let creaseFolds = 0; // folds inside junction creases — measured benign
    let scanned = 0;
    const regions = negs.map((neg) => {
      const nb = neg.b ?? neg.a;
      return {
        lo: [Math.min(neg.a[0], nb[0]) - neg.r - 0.15, Math.min(neg.a[1], nb[1]) - neg.r - 0.15, Math.min(neg.a[2], nb[2]) - neg.r - 0.15],
        hi: [Math.max(neg.a[0], nb[0]) + neg.r + 0.15, Math.max(neg.a[1], nb[1]) + neg.r + 0.15, Math.max(neg.a[2], nb[2]) + neg.r + 0.15],
      };
    }).concat(kneeBoxes.map((kb) => ({
      lo: [kb.c[0] - kb.r, kb.c[1] - kb.r, kb.c[2] - kb.r],
      hi: [kb.c[0] + kb.r, kb.c[1] + kb.r, kb.c[2] + kb.r],
    })));
    for (const region of regions) {
      const lo = region.lo;
      const hi = region.hi;
      for (let t = 0; t < idx.count; t += 3) {
        const vi = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
        const inBox = vi.every((i) => {
          const x = pos.getX(i);
          const y = pos.getY(i);
          const z = pos.getZ(i);
          return x >= lo[0] && x <= hi[0] && y >= lo[1] && y <= hi[1] && z >= lo[2] && z <= hi[2];
        });
        if (!inBox) continue;
        scanned++;
        const s = vi.map(pipeline);
        const e1 = [s[1].p[0] - s[0].p[0], s[1].p[1] - s[0].p[1], s[1].p[2] - s[0].p[2]];
        const e2 = [s[2].p[0] - s[0].p[0], s[2].p[1] - s[0].p[1], s[2].p[2] - s[0].p[2]];
        const gn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const c = [(s[0].p[0] + s[1].p[0] + s[2].p[0]) / 3, (s[0].p[1] + s[1].p[1] + s[2].p[1]) / 3, (s[0].p[2] + s[1].p[2] + s[2].p[2]) / 3];
        const fn = N(c);
        if (gn[0] * fn[0] + gn[1] * fn[1] + gn[2] * fn[2] < 0) {
          // Classify by crease proximity: the offset surface pinches at
          // ANY concave junction (pre-existing, nestled in the join's
          // darkest crevice — visually crease shadow, MEASURED benign:
          // hopper's body-foot junction carries 7). The DEFECT class is
          // a fold in OPEN skin — where the original run-offs lived and
          // where a back face is nakedly visible.
          if (s.every((v) => v.dOther > 0.08)) openFolds++;
          else creaseFolds++;
        }
      }
    }
    console.log(`  INFO  ${tag} fold scan: ${scanned} ink triangles at carve regions — ${openFolds} OPEN-SKIN folds, ${creaseFolds} junction-crease folds (benign class)`);
    assert(openFolds === 0, `${tag} ZERO folded ink triangles in OPEN SKIN at carves (${openFolds} — the black-domes/run-off class stays closed)`);
  }
}

// ---- R1 ink pass (screen-space, depth-only): the module contract ----
// The pass itself needs a GPU; what Node anchors instead: the depth
// linearization math (the GLSL mirrors linearizeDepth — same formula by
// contract), shader-string cleanliness (a backtick inside a GLSL comment
// terminates the JS template literal — the lesson section 0 catches only
// as a blunt import failure), the uniform contract between the quad
// material and the shader source, and the config levers' sanity.
{
  const { linearizeDepth, INK_FRAG, INK_VERT } = await import('./src/render/inkPass.js');
  const { INK_PX, INK_DEPTH_THRESHOLD } = await import('./src/config.js');
  // Hand-computed anchors at the app's real planes (near 0.1, far 100):
  assert(Math.abs(linearizeDepth(0, 0.1, 100) - 0.1) < 1e-12, 'ink linearizeDepth(0) = near (hand-computed)');
  assert(Math.abs(linearizeDepth(1, 0.1, 100) - 100) < 1e-9, 'ink linearizeDepth(1) = far (hand-computed)');
  assert(Math.abs(linearizeDepth(0.5, 0.1, 100) - 10 / 50.05) < 1e-12, 'ink linearizeDepth(0.5) = 10/50.05 = 0.1998 (hand-computed: nf / (f - 0.5(f-n)))');
  assert(linearizeDepth(0.2, 0.1, 100) < linearizeDepth(0.8, 0.1, 100), 'ink linearizeDepth is monotonic (deeper buffer value = farther surface)');
  const BACKTICK = '\u0060';
  assert(!INK_FRAG.includes(BACKTICK) && !INK_VERT.includes(BACKTICK), 'ink GLSL contains no backticks (the template-literal termination lesson)');
  for (const u of ['tColor', 'tDepth', 'uResolution', 'uInkPx', 'uNear', 'uFar', 'uThreshold', 'uInkColor']) {
    assert(INK_FRAG.includes(u), `ink fragment shader declares ${u} (the quad material's uniform contract)`);
  }
  assert(INK_PX > 0, 'INK_PX is a positive pixel weight');
  assert(INK_DEPTH_THRESHOLD > 0 && INK_DEPTH_THRESHOLD < 1, 'INK_DEPTH_THRESHOLD is a sane relative fraction (0..1)');

  // R1.1 detector (the joint-cut fix): JS mirror of the 5-tap second
  // difference on synthetic view-ray depth profiles, hand-computed. A
  // GRAZING RAMP (slope 3.6 = a surface 15.5 deg from edge-on, 4.5 deep)
  // inked the old FIRST-difference detector (rel 0.0202 >= T 0.02) — the
  // cut class on crease shoulders and limb exits; the SECOND difference
  // reads zero on it (ramps have slope, not curvature). A true occlusion
  // STEP (0.15 world) reads at FULL size in both schemes — wanted lines
  // keep the same threshold response. Design probe by the earned rule:
  // it proves the detector change MATTERS, and a simplification back to
  // first-difference fails here before it reaches the browser.
  {
    const o = 0.0126; // 3 px at the default camera, world units
    const T = 0.02;
    const ramp = (x) => 4.5 + 3.6 * x;
    const stepP = (x) => (x < 0.005 ? 4.5 : 4.65);
    const first = (f) => Math.abs(f(o) - f(-o));
    const second = (f) => Math.abs(f(-o) + f(o) - 2 * f(0));
    assert(first(ramp) / 4.5 >= T, 'grazing ramp inked the first-difference detector (rel 0.0202 — the joint-cut class, hand-computed)');
    assert(second(ramp) / 4.5 < 1e-9, 'grazing ramp reads ZERO in the second difference (slope is not curvature)');
    assert(Math.abs(second(stepP) - 0.15) < 1e-12, 'occlusion step 0.15 reads at FULL size in the second difference (hand-computed)');
    assert(second(stepP) / 4.5 > T, 'occlusion step still inks (rel 0.033 > T — wanted lines keep their response)');
    assert(INK_FRAG.includes('2.0 * dC'), 'ink fragment uses the SECOND-difference detector (the joint-cut regression guard)');
  }
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
