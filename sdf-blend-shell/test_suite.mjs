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
const THREE = await import('three');
const { rotateAboutPivot, updateAnim, animEntries, breathInflate } = await import('./src/anim.js');

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
    // SPACING-based since the tendril bend pass: the builder keeps ring
    // spacing constant, so a halved segment legitimately carries fewer
    // rings — the starving class is governed by the DISTANCE between
    // donor rings, not their count (0.32/4 = 0.08 then; 0.16/2 = 0.08 now).
    const spacing = longestLen / (interior.size + 1);
    assert(spacing <= 0.1, `${tag} longest capsule '${longest.id}' keeps donor-ring spacing tight (${spacing.toFixed(3)} <= 0.1 over ${interior.size} interior rings — joins along it never starve)`);
  }

  // paint prims: anchored inside a solid host AND poking through its skin:
  // -r < dist(point, host surface) < 0. Host = nearest solid. R3: paints
  // can be CAPSULES now (the mouth slits) — EVERY authored endpoint must
  // sit in the band, or one end of the slit grazes/sinks while the other
  // reads fine (the capsule cousin of the corner-sag lesson).
  const hostOf = {};
  for (const paint of prims.filter((p) => p.paint)) {
    let host = null;
    let hostSd = Infinity;
    for (const s of solids) {
      const sd = sdPrim(paint.a, s);
      if (sd < hostSd) { hostSd = sd; host = s; }
    }
    hostOf[paint.id] = { host, hostSd };
    const ends = paint.b ? [['a', paint.a], ['b', paint.b]] : [['a', paint.a]];
    for (const [endLabel, pt] of ends) {
      const sdEnd = sdPrim(pt, host);
      assert(sdEnd < 0, `${tag} ${paint.id} endpoint ${endLabel} anchored inside a solid ('${host?.id}', sd ${sdEnd.toFixed(4)} < 0)`);
      assert(sdEnd > -paint.r, `${tag} ${paint.id} endpoint ${endLabel} pokes through the skin (sd ${sdEnd.toFixed(4)} > -r ${-paint.r})`);
    }
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

  // R-SIMPLIFY: the inverted-hull outline material and its probe block
  // retired (the ink is the screen-space pass since R1; hull-era probes
  // live in git history). The SKIN's burial/tuck machinery stays — its
  // subject, coincident donor layers z-fighting, predates the hull.
  assert(prims.every((p, i) => mat.uniforms.uNeg.value[i] === (p.negative ? (p.color != null ? 2.0 : 1.0) : 0.0)), `${tag} the SKIN mirrors carves (uNeg — live vocabulary since R3)`);
  assert(mat.uniforms.uTuck.value === TUCK_DEPTH, `${tag} skin tucks buried verts (uTuck = TUCK_DEPTH)`);
  assert(mat.uniforms.uBuryBand.value > 0, `${tag} the skin carries the burial ramp (uBuryBand > 0)`);

  // anim: every entry resolves, rest pose at t=0, each entry moves at
  // its own peak — generalized to the anims ARRAY (tendril sway): a
  // single object is the array-of-one case, and every entry owns its
  // own prim slot.
  if (creature.anim) {
    const entries = animEntries(creature);
    const declared = Array.isArray(creature.anim) ? creature.anim.length : 1;
    assert(entries.length === declared, `${tag} every anim entry resolves its prim (${entries.length}/${declared})`);
    const rests = entries.map(({ idx }) => mat.uniforms.uB.value[idx].clone());
    updateAnim(mat, 0, entries);
    entries.forEach(({ idx }, i) => {
      assert(mat.uniforms.uB.value[idx].distanceTo(rests[i]) < 1e-9, `${tag} anim[${i}] t=0 keeps rest pose`);
      assert(mat.uniforms.uPrimMat.value[idx].equals(IDENTITY), `${tag} anim[${i}] t=0 writes identity`);
    });
    entries.forEach(({ anim, prim, idx }, i) => {
      // Each entry judged at ITS OWN quarter period (speeds may differ).
      updateAnim(mat, Math.PI / 2 / anim.speed, entries);
      const moved = mat.uniforms.uB.value[idx].distanceTo(rests[i]);
      assert(moved > 0.01, `${tag} anim[${i}] moves '${anim.primId}' at its peak (${moved.toFixed(3)} > 0.01)`);
      // Pivot invariant, PIVOT-AWARE: the fixed point is pivot ?? a.
      const fixedPt = new THREE.Vector3(...(anim.pivot ?? prim.a));
      assert(fixedPt.clone().applyMatrix4(mat.uniforms.uPrimMat.value[idx]).distanceTo(fixedPt) < 1e-9, `${tag} anim[${i}] fixed point (pivot ?? a) never moves`);
      assert(!mat.uniforms.uPrimMat.value[idx].equals(IDENTITY), `${tag} anim[${i}] peak writes non-identity`);
    });
    updateAnim(mat, 0.7, entries);
    const animIdxSet = new Set(entries.map((e) => e.idx));
    assert(mat.uniforms.uPrimMat.value.every((m, i) => animIdxSet.has(i) || m.equals(IDENTITY)), `${tag} non-animated prims stay at identity`);
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
const { ROAM_SPEED, ROAM_HARD_RADIUS, ROAM_SEP_RADIUS, WORLD_FLAT_RADIUS, STRIDE_LIFT, LEAN_MAX } = await import('./src/config.js');
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
assert(WORLD_FLAT_RADIUS > ROAM_HARD_RADIUS, `the flat stage outreaches the roamers (${WORLD_FLAT_RADIUS} > ${ROAM_HARD_RADIUS}) — nobody walks off the world or onto a hill`);

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
  let mouthMaxDist = 0; // farthest endpoint from the body center — the decal band's INNER wall (sd < 0)
  let mouthMinDist = 99; // nearest endpoint to the body center — the band's OUTER wall (sd > -r: it must keep painting)
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
    mouthMinDist = Math.min(mouthMinDist, mA.distanceTo(bodyRestA), mB.distanceTo(bodyRestA));
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
  // Jaw-drop (A4 stage 2; R3 decal mouth), hand-computed at full open
  // (angle 0.22 about the body center + push 0.012 outward): midpoint y
  // drops 0.48 -> 0.3806, and the farthest endpoint reaches at most
  // 0.4947 from the body center. THE DECAL BAND, walked live over every
  // simulated frame: each endpoint stays ANCHORED inside the body
  // (dist < 0.5: sd < 0 — an escaped decal detaches from its host) AND
  // keeps POKING (dist > 0.5 - r = 0.41: sd > -r — a sunken decal fades
  // like a blink, and an open mouth that stops painting is inert).
  assert(mouthMinY < 0.40 && mouthMinY > 0.36, `the mouth jaw-drops through the arc (lowest midpoint y ${mouthMinY.toFixed(4)}, hand-computed 0.3806 at the apex)`);
  assert(mouthMaxDist < 0.5 - 0.004, `the open mouth stays ANCHORED every frame (max endpoint dist ${mouthMaxDist.toFixed(4)} < 0.496 — the decal band's inner wall)`);
  assert(mouthMinDist > 0.5 - 0.09, `the open mouth keeps PAINTING every frame (min endpoint dist ${mouthMinDist.toFixed(4)} > 0.41 — the decal band's outer wall)`);
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
// The material carries it, and its absence is guarded — existing
// creatures behave exactly as before the field existed.
const dMat = createBlendMaterial(PAIR, 0.05);
assert(dMat.uniforms.uInflate.value === 0.05, 'the material mirrors an explicit inflate (0.05)');
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
  floater: { 0.25: 0.038, 0.6: 0.038 }, // Bloop: MEASURED 0.0172 at BOTH k (tendril kCaps govern every close pair — slider-immune like Skitter)
  flyer: { 0.25: 0.037, 0.6: 0.037 }, // Whirr: MEASURED 0.0163 at BOTH k (mast/prop kCaps govern — slider-immune)
};
// Carved creatures: MEASURED bounds (+0.02 margin) for the generalized
// invariants. hardBand = how far the smooth contour may sit inside the
// exact hard-CSG surface (MEASURED -0.0273 at k=0.25, -0.0099 at k=0.6 —
// the band SHRINKS at high k because the plumper union pushes the smooth
// wall outward relative to hard); carveFloor = deepest legitimate dip
// below the POSITIVE union (MEASURED -0.1066 at both k — the mouth's
// hand-computed penetration depth 0.1068, confirmed by the field).
const CARVE_BOUNDS = {
  // R3: the cast carries no field carves (mouths are paint decals now).
  // The carved inspector branch below stays live vocabulary — a future
  // carved creature gets a MEASURED entry here (the hopper/pudge era's
  // values live in git history at the R2 commit).
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

// --- mouth anchors (R3: mouths are PAINT DECALS — features off the field) ---
// The carve era's generalizable checks retired with the carves (the
// per-creature negative loop is vacuous on this cast; the carve MATH
// keeps its synthetic anchors above as live vocabulary). What lives here:
// design probes that the conversion happened and MATTERS — zero negatives
// cast-wide, the skin restored at the old carve point, and the decal
// mouth still PAINTING in the exact regime that swallowed the carves
// (slider k=0.6 at breath peak: the k-validity class, closed).
{
  assert(CREATURES.every((c) => c.prims.every((p) => !p.negative)), 'the cast carries ZERO field carves (R3: features off the field — nothing left to swallow)');
  const mouthH = hopper.prims.find((p) => p.id === 'mouth');
  const bodyH = hopper.prims.find((p) => p.id === 'body');
  assert(mouthH && mouthH.paint === true && typeof mouthH.color === 'number', "hopper's mouth is a PAINT decal (colored, surface-riding)");
  const mb = mouthH.b ?? mouthH.a;
  const mMid = [(mouthH.a[0] + mb[0]) / 2, (mouthH.a[1] + mb[1]) / 2, (mouthH.a[2] + mb[2]) / 2];
  const dir = [mMid[0] - bodyH.a[0], mMid[1] - bodyH.a[1], mMid[2] - bodyH.a[2]];
  const dl = Math.hypot(...dir);
  const P = [bodyH.a[0] + (dir[0] / dl) * bodyH.r, bodyH.a[1] + (dir[1] / dl) * bodyH.r, bodyH.a[2] + (dir[2] / dl) * bodyH.r];
  assert(Math.abs(mapField(P, hopper.prims, BLEND_K)) < 0.01, `the skin is BACK at the old carve point (field ${mapField(P, hopper.prims, BLEND_K).toFixed(4)} ~ 0 — the mouth no longer removes geometry)`);

  // The swallowing regime, survived: at slider k=0.6 AND breath peak,
  // bisect the outward ray to the LIVE skin, measure the site's actual
  // inflation, and run the shader's coverage mirror there. Bounds are
  // MEASURED (+0.02 margin) — the decal-rule probe: mouths sit on
  // low-inflation sites, with numbers instead of hope.
  const SITE_INFL_BOUND = { hopper: 0.08, pudge: 0.085 }; // MEASURED 0.0572 / 0.0632 at k=0.6 breath peak (+0.02 margin); pudge rides near its mouth r 0.068 — the footprint balloons WITH his flat eyes at the extreme, the proven decal read
  function skinPointOnRay(creature, mouth, k, inflate) {
    const solidsC = creature.prims.filter((p) => !p.paint && !p.negative);
    let host = null, hostSd = Infinity;
    for (const s of solidsC) { const sd = sdPrim(mouth.a, s); if (sd < hostSd) { hostSd = sd; host = s; } }
    const b2 = mouth.b ?? mouth.a;
    const mid = [(mouth.a[0] + b2[0]) / 2, (mouth.a[1] + b2[1]) / 2, (mouth.a[2] + b2[2]) / 2];
    const hc = host.a; // both mouth hosts are spheres on this cast
    const d0 = [mid[0] - hc[0], mid[1] - hc[1], mid[2] - hc[2]];
    const l0 = Math.hypot(...d0);
    const u = [d0[0] / l0, d0[1] / l0, d0[2] / l0];
    let lo = host.r - 0.05, hi = host.r + 0.6;
    for (let i = 0; i < 60; i++) {
      const t = (lo + hi) / 2;
      const q = [hc[0] + u[0] * t, hc[1] + u[1] * t, hc[2] + u[2] * t];
      if (mapField(q, creature.prims, k, inflate) < 0) lo = t; else hi = t;
    }
    const t = (lo + hi) / 2;
    return [hc[0] + u[0] * t, hc[1] + u[1] * t, hc[2] + u[2] * t];
  }
  for (const [cid, peak] of [['hopper', 0.012], ['pudge', 0.06]]) {
    const c = CREATURES.find((x) => x.id === cid);
    const mouth = c.prims.find((p) => p.id === 'mouth');
    const skin = skinPointOnRay(c, mouth, 0.6, peak);
    const siteInfl = rawMinSolid(skin, c.prims);
    const cov = coverage(sdPrim(skin, mouth), siteInfl);
    assert(siteInfl < SITE_INFL_BOUND[cid], `[${cid}] mouth sits on a LOW-INFLATION site (skin rides ${siteInfl.toFixed(4)} above the raw host at k=0.6 breath peak, < ${SITE_INFL_BOUND[cid]} MEASURED bound)`);
    assert(cov > 0.99, `[${cid}] mouth still PAINTS at k=0.6 breath peak (coverage ${cov.toFixed(4)} > 0.99 — the regime that swallowed the carve mouths)`);
  }
}

// ---- Fold detector: RETIRED at R-SIMPLIFY ----
// Its subject — folded inverted-hull ink triangles showing back faces —
// cannot occur since R1 replaced the hull draw with the screen-space ink
// pass. The detector's lessons (black domes, the junction-crease
// taxonomy, the knee-ring provenance work) live in LESSONS 12-16 and in
// git history, where the full instrument can be revived if an offset-
// surface draw ever returns.

// ---- Hover locomotion (reference queue, pass 1): the Floater ----
// The rig math mirrored from main's hover branch, walked over time:
// deterministic, bounded to [height - amp, height + amp], never inert.
// Plus the Bloop design anchors (hand-computed displayed extents).
{
  const floater = CREATURES.find((c) => c.id === 'floater');
  assert(floater && floater.hover && !floater.step && !floater.hop, 'the cast has a FLOATER: hover data, no step, no hop (one system owns the rig)');
  const { height, amp, speed } = floater.hover;
  let lo = Infinity;
  let hi = -Infinity;
  for (let t = 0; t < 12; t += 0.016) {
    const y = height + amp * Math.sin(t * speed + 6 * 2.1); // actor index 6: the same bobPhase main derives
    lo = Math.min(lo, y);
    hi = Math.max(hi, y);
  }
  assert(lo >= height - amp - 1e-9 && hi <= height + amp + 1e-9, `hover stays in [height - amp, height + amp] ([${lo.toFixed(3)}, ${hi.toFixed(3)}] within [${(height - amp).toFixed(3)}, ${(height + amp).toFixed(3)}])`);
  assert(hi - lo > amp, `hover is not inert (range ${(hi - lo).toFixed(3)} > amp over 12s)`);
  const bell = floater.prims.find((p) => p.id === 'bell');
  assert(Math.abs(bell.a[1] + bell.r + height + amp - 1.44) < 1e-9, 'Bloop displayed crown = 1.44 < 1.7 (hand-computed: 0.83 + 0.55 + 0.06 — the shared camera keeps everyone)');
  const tip = floater.prims.find((p) => p.id === 'tendril_fl_lo').b;
  assert(tip[1] + height - amp > 0.4, `tendril tips clear the stage at the bob's low point (${(tip[1] + height - amp).toFixed(2)} > 0.4)`);
}

// ---- Spin anim (reference queue, pass 2): the Propeller Flyer ----
// The first non-oscillating anim mode, anchored in exact math: angle is
// t * speed about an authored PIVOT (the blade's midpoint hub — the one
// thing endpoint-a rotation cannot express), absolute from rest, closing
// a full circle within float noise.
{
  const flyer = CREATURES.find((c) => c.id === 'flyer');
  assert(flyer && flyer.anim?.mode === 'spin' && flyer.hover && !flyer.step && !flyer.hop, 'the cast has a PROPELLER FLYER: spin anim + hover, no step, no hop');
  const [flyerEntry] = animEntries(flyer);
  const idx = flyerEntry.idx;
  const prop = flyer.prims[idx];
  const mid = [(prop.a[0] + prop.b[0]) / 2, (prop.a[1] + prop.b[1]) / 2, (prop.a[2] + prop.b[2]) / 2];
  assert(prop.id === 'prop' && flyer.anim.pivot.every((v, i) => v === mid[i]), 'the pivot IS the blade midpoint (the hub — not endpoint a)');
  const mat = createBlendMaterial(flyer.prims);
  updateAnim(mat, 0, [flyerEntry]);
  assert(mat.uniforms.uA.value[idx].distanceTo(new THREE.Vector3(...prop.a)) === 0, 'spin at t=0 is the EXACT registry pose (bit-exact rest, the absolute-from-rest law)');
  updateAnim(mat, 1, [flyerEntry]);
  const expect = rotateAboutPivot(flyer.anim.pivot, prop.b, flyer.anim.axis, flyer.anim.speed);
  assert(mat.uniforms.uB.value[idx].distanceTo(expect) < 1e-9, 'spin angle = t * speed exactly (endpoint b hand-rotated about the hub matches at t=1)');
  const P = new THREE.Vector3(...flyer.anim.pivot);
  assert(mat.uniforms.uA.value[idx].distanceTo(new THREE.Vector3(...prop.a)) > 0.1, 'endpoint a ORBITS too (the hub is the fixed point, not a)');
  assert(Math.abs(mat.uniforms.uA.value[idx].distanceTo(P) - P.distanceTo(new THREE.Vector3(...prop.a))) < 1e-9, 'the spin conserves blade radius about the hub');
  updateAnim(mat, (2 * Math.PI) / flyer.anim.speed, [flyerEntry]);
  assert(mat.uniforms.uB.value[idx].distanceTo(new THREE.Vector3(...prop.b)) < 1e-6, 'a full circle closes (t = 2pi/speed returns to rest within float noise)');
}

// ---- Tendril sway (feel pass): the anims-array's first customer ----
{
  const floater = CREATURES.find((c) => c.id === 'floater');
  assert(Array.isArray(floater.anim) && floater.anim.length === 8, "Bloop's tendrils sway in TWO SEGMENTS each (8 anim entries — the bend pass)");
  assert(floater.anim.every((a) => a.primId.startsWith('tendril_') && (a.mode ?? 'wave') === 'wave'), 'all sway entries are tendril waves');
  assert(new Set(floater.anim.map((a) => a.speed)).size === 4, 'four distinct speeds, SHARED within each tendril pair — segments must swing at one rate or the elbow shears over time');
  for (const side of ['fl', 'fr', 'bl', 'br']) {
    const up = floater.prims.find((p) => p.id === `tendril_${side}_up`);
    const lo = floater.prims.find((p) => p.id === `tendril_${side}_lo`);
    const aUp = floater.anim.find((a) => a.primId === `tendril_${side}_up`);
    const aLo = floater.anim.find((a) => a.primId === `tendril_${side}_lo`);
    assert(up.b.every((v, i) => v === lo.a[i]), `[${side}] segments share the joint EXACTLY at rest (bit-exact t=0)`);
    assert(aLo.pivot.every((v, i) => v === up.a[i]), `[${side}] the lower segment pivots about the tendril TOP, not its own a`);
    assert(aUp.speed === aLo.speed && aLo.amplitude > aUp.amplitude, `[${side}] one speed per pair, lower amplitude LARGER (the bend's whole mechanism)`);
    // The illusion's load-bearing number: worst joint divergence =
    // |ampLo - ampUp| * dist(joint, top). It must stay far inside the
    // segment radii so the joint stays physically overlapped — an
    // ELBOW, never a tear.
    const dJT = Math.hypot(up.b[0] - up.a[0], up.b[1] - up.a[1], up.b[2] - up.a[2]);
    const gap = Math.abs(aLo.amplitude - aUp.amplitude) * dJT;
    assert(gap < Math.min(up.r, lo.r) * 0.5, `[${side}] worst joint divergence ${gap.toFixed(4)} < half the thinner segment radius ${(Math.min(up.r, lo.r) * 0.5).toFixed(3)} — an elbow, never a tear`);
  }
  const angles = floater.anim.filter((a) => a.primId.endsWith('_lo')).map((a) => Math.sin(30 * a.speed) * a.amplitude);
  assert(new Set(angles.map((x) => x.toFixed(3))).size >= 3, 'by t=30 the tendrils are genuinely out of step (the beat-note survives the split)');
}

// ---- Footprint trails: stamp sources + the fade (the banked technique) ----
// trailMode is the pure classifier main polls with; fadeColor's endpoints
// ARE the seamless-vanish guarantee. The plant detector is proven on a
// real gait sim with the exact polling main uses.
{
  const { trailMode, fadeColor, makeBlobAlpha } = await import('./src/render/trails.js');
  const { TRAIL_COLOR, TRAIL_LIFETIME, TRAIL_CAP, GROUND_COLOR: GC } = await import('./src/config.js');
  assert(trailMode(CREATURES.find((c) => c.id === 'critter')) === 'step', 'walkers stamp per FOOTFALL');
  assert(trailMode(CREATURES.find((c) => c.id === 'hopper')) === 'hop', 'hoppers stamp on LANDING');
  assert(trailMode(CREATURES.find((c) => c.id === 'snail')) === 'slide', 'slugs leave a DRAG line (they do not step)');
  assert(trailMode(CREATURES.find((c) => c.id === 'floater')) === null && trailMode(CREATURES.find((c) => c.id === 'flyer')) === null, 'hover creatures leave NOTHING (they never touch the ground)');
  const rawc = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
  assert(fadeColor(0, TRAIL_LIFETIME).every((v, i) => v === rawc(TRAIL_COLOR)[i]), 'a fresh print is exactly TRAIL_COLOR (raw channels — the parity rule)');
  assert(fadeColor(TRAIL_LIFETIME, TRAIL_LIFETIME).every((v, i) => v === rawc(GC)[i]), 'an expired print is exactly GROUND_COLOR — prints vanish seamlessly, never pop');
  assert(TRAIL_CAP > 0 && TRAIL_LIFETIME > 0, 'trail config is sane');
  const blob = makeBlobAlpha(64);
  const A = (x, y) => blob[(y * 64 + x) * 4 + 3];
  assert(A(32, 32) === 255 && A(0, 0) === 0, 'the stamp blob is opaque at the core, nothing at the corner (per-pixel soft imprint, pure math)');
  let mono = true;
  for (let x = 32; x < 63; x++) if (A(x + 1, 32) > A(x, 32)) mono = false;
  assert(mono, 'the blob alpha falls off monotonically core -> rim (no ring artifacts)');
  assert(blob[(32 * 64 + 32) * 4] === 255 && blob[(32 * 64 + 32) * 4 + 2] === 255, 'the blob RGB is pure white — print color comes from the instances alone');
  const critter = CREATURES.find((c) => c.id === 'critter');
  const g = createGait(critter);
  const matG = createBlendMaterial(critter.prims, critter.inflate, critter.step?.knees);
  let plants = 0;
  const prev = g.feet.map((f) => f.swingT < 0);
  for (let t = 0; t < 6; t += 1 / 60) {
    g.update(1 / 60, { x: -t * 0.4, y: 0, z: 0, heading: Math.PI }, [matG]);
    g.feet.forEach((f, i) => {
      const planted = f.swingT < 0;
      if (planted && !prev[i]) plants++;
      prev[i] = planted;
    });
  }
  assert(plants >= 4, `the plant detector sees real footfalls over a 6s walk (${plants} >= 4 — the exact polling main uses)`);
}

// ---- Contact shadows (research build 1): the analytic blob law ----
// shadowFootprint is the blob's rest geometry (an overhead projection
// of the SOLIDS); the altitude law (fade/spread/color) is what lets
// ONE mechanism serve walkers, hoppers, and hover creatures with no
// per-mode branches. Anchors are hand-computed; the law's tolerance
// (negative-altitude clamp) lives IN the code, not softened probes.
{
  const { shadowFootprint, shadowFade, shadowSpread, shadowColor } = await import('./src/render/shadows.js');
  const { SHADOW_COLOR, SHADOW_FADE_H, SHADOW_SCALE, SHADOW_Y, TRAIL_Y: TY, GROUND_COLOR: GC2 } = await import('./src/config.js');
  const rawSh = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

  // Hand-computed synthetic anchor (exact): sphere a[0.1,0.5,0] r0.3
  // -> x [-0.2,0.4] z [-0.3,0.3]; capsule a[-0.2,0.4,-0.1]
  // b[0.4,0.4,0.3] r0.1 -> x [-0.3,0.5] z [-0.2,0.4]. Union extent
  // x [-0.3,0.5], z [-0.3,0.4] -> cx 0.1 rx 0.4, cz 0.05 rz 0.35.
  // The paint and the carve sit at x=99: EXCLUDED (no surface casts).
  const synth = { prims: [
    { id: 's', type: 'sphere', a: [0.1, 0.5, 0], r: 0.3 },
    { id: 'c', type: 'capsule', a: [-0.2, 0.4, -0.1], b: [0.4, 0.4, 0.3], r: 0.1 },
    { id: 'p', type: 'sphere', a: [99, 0.5, 0], r: 0.3, paint: true },
    { id: 'n', type: 'sphere', a: [99, 0.5, 9], r: 0.3, negative: true },
  ] };
  const fp = shadowFootprint(synth);
  assert(Math.abs(fp.cx - 0.1) < 1e-12 && Math.abs(fp.rx - 0.4) < 1e-12, 'footprint x: hand-computed extent (paints and carves cast NOTHING)');
  assert(Math.abs(fp.cz - 0.05) < 1e-12 && Math.abs(fp.rz - 0.35) < 1e-12, 'footprint z: hand-computed extent');
  assert(shadowFootprint({ prims: [{ id: 'p', type: 'sphere', a: [0, 0, 0], r: 0.1, paint: true }] }) === null, 'no solids -> null, never a crash (a shadow-less actor is graceful)');

  // Cast regression anchor (hand-computed from creatures.js): critter's
  // x extent runs eyeball tip -1.184 to tail tip 1.19; in z the body's
  // own radius governs (0.42 — the legs reach only 0.375/0.38).
  const critFp = shadowFootprint(CREATURES.find((c) => c.id === 'critter'));
  assert(Math.abs(critFp.cx - 0.003) < 1e-9 && Math.abs(critFp.rx - 1.187) < 1e-9, 'critter footprint x: eyeball tip to tail tip (hand-computed anchor)');
  assert(critFp.cz === 0 && Math.abs(critFp.rz - 0.42) < 1e-12, 'critter footprint z: the body radius governs');
  for (const c of CREATURES) {
    const fc = shadowFootprint(c);
    assert(fc && fc.rx > 0 && fc.rz > 0 && fc.rx <= 1.5 && fc.rz <= 1.5, `${c.id}: a finite, stage-scaled blob exists`);
  }

  // The altitude law: exact anchors first, then the shape.
  assert(shadowFade(0) === 0, 'fade(0) = 0 exactly: a grounded blob is FULL strength');
  assert(shadowFade(SHADOW_FADE_H) === 0.5, 'fade(SHADOW_FADE_H) = 0.5 exactly (the half-fade altitude — the tuning anchor)');
  assert(shadowFade(-0.07) === 0, 'negative altitude clamps IN the law: the hop crouch dip never OVER-darkens past rest');
  let fadeMono = true;
  for (let h = 0; h < 1; h += 0.05) if (shadowFade(h + 0.05) <= shadowFade(h)) fadeMono = false;
  assert(fadeMono && shadowFade(10) < 1, 'fade rises monotonically and never reaches 1: a hover creature KEEPS a faint blob');
  assert(shadowSpread(0) === 1 && shadowSpread(0.55) > 1, 'spread(0) = 1 exactly; a lifted body throws a wider blob');
  const bloopHover = CREATURES.find((c) => c.id === 'floater').hover;
  const bloopFade = shadowFade(bloopHover.height);
  assert(bloopFade > 0.5 && bloopFade < 0.8, `Bloop at rest hover height fades to ${bloopFade.toFixed(4)} (faint, PRESENT — the grounding read survives altitude)`);

  // The color walk: the trails fade-by-color mechanism turned vertical.
  assert(shadowColor(0).every((v, i) => v === rawSh(SHADOW_COLOR)[i]), 'a grounded blob is exactly SHADOW_COLOR (raw channels — the parity rule)');
  const midCol = shadowColor(SHADOW_FADE_H);
  assert(midCol.every((v, i) => Math.abs(v - (rawSh(SHADOW_COLOR)[i] + rawSh(GC2)[i]) / 2) < 1e-12), 'at the half-fade altitude the blob is the exact midpoint mix toward GROUND_COLOR');

  // The layering contract: shadows live UNDER the prints.
  assert(SHADOW_Y > 0 && SHADOW_Y < TY, 'SHADOW_Y sits above the stage and BELOW TRAIL_Y: prints read on top of shadows');
  assert(SHADOW_SCALE > 0 && SHADOW_SCALE <= 1, 'the inset scale is a fraction: contact darkness concentrates under mass');
}

// ---- C1 creature I/O: the executable authoring rules + the round trip ----
// validate.js is the AUTHORING RULES as one pure function — the import
// gate, this suite, and the C2 generator's grader are the SAME module,
// so a rule can never drift between Node and the browser. Parity here:
// (1) every authored creature passes with zero errors and zero warnings,
// (2) a rogue's gallery of hand-built bad creatures is rejected FOR THE
// RIGHT REASON (label-matched — a validator that rejects everything
// would pass a weaker probe), (3) the JSON round trip is bit-faithful
// and preserves fields the tool does not manage.
{
  const { validateCreature } = await import('./src/data/validate.js');
  const { exportCreature, parseCreatureJSON, CREATURE_FORMAT } = await import('./src/data/creatureIO.js');

  for (const c of CREATURES) {
    const v = validateCreature(c);
    assert(v.ok && v.errors.length === 0, `[${c.id}] passes the executable authoring rules${v.errors.length ? ' — ' + v.errors[0] : ''}`);
    assert(v.warnings.length === 0, `[${c.id}] fits the shared stage (zero warnings${v.warnings.length ? ' — ' + v.warnings[0] : ''})`);
  }

  // The rogue's gallery: each bad creature trips its OWN rule.
  const base = () => JSON.parse(JSON.stringify(CREATURES.find((c) => c.id === 'critter')));
  const rejects = (mutate, keyword, label) => {
    const c = base();
    mutate(c);
    const v = validateCreature(c);
    assert(!v.ok && v.errors.some((e) => e.includes(keyword)), `validator rejects ${label} (${v.ok ? 'PASSED it' : `"${v.errors[0]}"`})`);
  };
  rejects((c) => { while (c.prims.length <= 16) c.prims.push({ id: 'x' + c.prims.length, type: 'sphere', a: [0, 0.5, 0], r: 0.1 }); }, 'shader capacity', 'an over-capacity creature');
  rejects((c) => { c.prims[1].id = 'body'; }, 'unique', 'duplicate prim ids');
  rejects((c) => { c.prims[0].a[1] = NaN; }, 'finite', 'a NaN coordinate');
  rejects((c) => { c.prims[0].r = 0; }, "'r' must be", 'a zero radius');
  rejects((c) => { c.prims[1].b = [0, 0, 0]; }, 'must not carry', 'a sphere carrying b');
  rejects((c) => { c.prims[1].paint = true; c.prims[1].negative = true; }, 'both paint and negative', 'a paint+negative prim');
  rejects((c) => { c.prims.find((p) => p.id === 'iris_l').a = [-3, 3, 0]; }, 'floats OUTSIDE', 'a floating decal');
  rejects((c) => { c.blink.eyes.push('ghost'); }, "blink eye 'ghost'", 'an unresolved blink id');
  rejects((c) => { c.step.groups = [[0, 1], [1, 2, 3]]; }, 'partition', 'groups that do not partition the feet');
  rejects((c) => { c.prims.find((p) => p.id === 'thigh_fl').b = [-0.52, 0.265, 0.25]; }, 'EXACTLY', 'a knee joint gap');
  rejects((c) => { for (const p of c.prims) if (!p.paint) p.paint = true; }, 'SOLID prim required', 'a creature of only decals');
  rejects((c) => { const th = c.prims.find((p) => p.id === 'thigh_bl'); const sh = c.prims.find((p) => p.id === 'leg_bl'); th.b = [0.42, 0.265, 0.7]; sh.a = [0.42, 0.265, 0.7]; }, 'exits the skin', 'a knee outside the body (the capless validity boundary)');
  rejects((c) => { c.breath = { amplitude: 0.2, speed: 2.0 }; }, 'thinnest solid', 'a breath peak that balloons past the thinnest solid');
  rejects((c) => { c.hover = { height: 0.5, amp: 0.05, speed: 1.0 }; }, 'hover excludes', 'a hovering walker (one system owns the rig)');
  rejects((c) => { delete c.step; delete c.anim; c.hover = { height: -1, amp: 0.05, speed: 1.0 }; }, 'hover must be', 'a malformed hover block');
  rejects((c) => { c.anim.mode = 'wobble'; }, 'anim.mode', 'an unknown anim mode');
  rejects((c) => { c.anim.pivot = [1, 2]; }, 'anim.pivot', 'a malformed anim pivot');
  rejects((c) => { delete c.anim.amplitude; }, 'wave anim needs', 'a wave anim without an amplitude');
  rejects((c) => { c.anim = [c.anim, { ...c.anim }]; }, 'two anim entries target', 'two anim entries fighting over one prim');
  rejects((c) => { c.anim = []; }, 'must not be empty', 'an empty anim array');

  // Round trip: envelope in, RAW object out — bit-faithful for the cast,
  // and a field the tool does not manage survives export -> import.
  assert(CREATURES.every((c) => JSON.stringify(JSON.parse(JSON.stringify(c))) === JSON.stringify(c)), 'the whole cast is pure JSON-serializable data (the registry carries no live objects)');
  const rt = parseCreatureJSON(exportCreature(CREATURES[0]));
  assert(rt.ok && JSON.stringify(rt.creature) === JSON.stringify(CREATURES[0]), 'export -> import is bit-faithful (the raw object flows through, never a reconstruction)');
  const custom = base();
  custom.author_note = 'hand-written, not mine to drop';
  custom.prims[0].flavor = 'extra crunchy';
  const rt2 = parseCreatureJSON(exportCreature(custom));
  assert(rt2.ok && rt2.creature.author_note === custom.author_note && rt2.creature.prims[0].flavor === 'extra crunchy', 'fields the tool does not manage SURVIVE the round trip (the preserve-hand-authored-data rule, executable)');
  assert(parseCreatureJSON(JSON.stringify(CREATURES[0])).ok, 'a BARE creature object imports (hand-made files need no envelope)');
  assert(!parseCreatureJSON('{ not json').ok, 'garbage text is rejected as not-JSON, never thrown');
  const future = JSON.stringify({ format: CREATURE_FORMAT, version: 99, creature: CREATURES[0] });
  assert(!parseCreatureJSON(future).ok && parseCreatureJSON(future).errors[0].includes('version'), 'a future format version is refused politely (never half-read)');
}

// ---- C2 seeded generator: suite-graded creatures from a number ----
// generateCreature builds from the archetype table and grades with the
// SAME validateCreature that gates imports — so a generated creature is
// valid by the same law as a hand-authored one. Probed here: exact
// determinism (seeds are shareable), the full seed sweep lands valid in
// few attempts with ZERO warnings, every archetype actually occurs, the
// measured boundaries act as CONSTRUCTION rules (a pudgy archetype gets
// FLAT eyes; a kneed one authors the shared knee point EXACTLY), and a
// generated creature is ordinary data (round-trips through creatureIO).
{
  const { generateCreature, GENERATE_MAX_ATTEMPTS, ARCHETYPE_NAMES } = await import('./src/data/generate.js');
  const { exportCreature: exportG, parseCreatureJSON: parseG } = await import('./src/data/creatureIO.js');
  const { validateCreature: vc } = await import('./src/data/validate.js');

  assert(JSON.stringify(generateCreature(7).creature) === JSON.stringify(generateCreature(7).creature), 'same seed, same creature — bit-exact (seeds are shareable)');
  assert(JSON.stringify(generateCreature(7).creature) !== JSON.stringify(generateCreature(8).creature), 'different seeds differ');

  const sweep = [];
  let attemptsTotal = 0;
  let attemptsMax = 0;
  const byArch = {};
  for (let seed = 1; seed <= 120; seed++) {
    const r = generateCreature(seed);
    sweep.push(r);
    if (r.creature) {
      attemptsTotal += r.attempts;
      attemptsMax = Math.max(attemptsMax, r.attempts);
      byArch[r.archetype] = (byArch[r.archetype] ?? 0) + 1;
    }
  }
  console.log(`  INFO  generator sweep: 120 seeds, attempts avg ${(attemptsTotal / 120).toFixed(2)} / max ${attemptsMax} (cap ${GENERATE_MAX_ATTEMPTS}), archetypes ${JSON.stringify(byArch)}`);
  assert(sweep.every((r) => r.creature !== null), 'every seed 1..120 lands a valid creature within the attempt cap');
  assert(sweep.every((r) => { const v = vc(r.creature); return v.ok && v.warnings.length === 0; }), 'every generated creature passes the executable authoring rules with ZERO warnings (graded by the import gate itself)');
  assert(ARCHETYPE_NAMES.every((a) => byArch[a] > 0), `all ${ARCHETYPE_NAMES.length} archetypes occur across the sweep (the table is fully live)`);

  const pudgy = sweep.find((r) => r.archetype === 'pudgyQuad').creature;
  assert(pudgy.prims.some((p) => p.id === 'sclera_l') && !pudgy.prims.some((p) => p.id === 'eyeball_l'), 'the inflate archetype generates FLAT eyes (the dilate boundary as a CONSTRUCTION rule, not a rejection)');
  const kneed = sweep.find((r) => r.archetype === 'kneedQuad' || r.archetype === 'longneck').creature;
  const shin = kneed.prims.find((p) => p.id === 'leg_fl');
  const thigh = kneed.prims.find((p) => p.id === kneed.step.knees.leg_fl);
  assert(thigh.b[0] === shin.a[0] && thigh.b[1] === shin.a[1] && thigh.b[2] === shin.a[2], 'a generated knee authors thigh.b === shin.a EXACTLY (one shared point, by construction)');
  // The mouth decisions, encoded: slug + six-legger are MOUTHLESS (cast
  // parity with Shelby/Skitter, Daniel's call after the first litters),
  // and every generated mouth is PROPORTIONAL to its host (the absolute
  // sizing turned small heads into voids — browser-caught, 2026-07-05).
  assert(sweep.filter((r) => r.archetype === 'slug' || r.archetype === 'sixLegger').every((r) => !r.creature.prims.some((p) => p.id === 'mouth')), 'slug and six-legger generate MOUTHLESS (cast parity with the judged originals)');
  assert(sweep.filter((r) => ['pudgyQuad', 'hopper', 'kneedQuad', 'floater', 'flyer'].includes(r.archetype)).every((r) => r.creature.prims.some((p) => p.id === 'mouth')), 'the mouthed archetypes still carry their mouths');
  assert(sweep.every((r) => {
    const m = r.creature.prims.find((p) => p.id === 'mouth');
    if (!m) return true;
    const solids = r.creature.prims.filter((p) => !p.paint && !p.negative);
    let host = solids[0];
    for (const s of solids) if (Math.hypot(m.a[0] - s.a[0], m.a[1] - s.a[1], m.a[2] - s.a[2]) - s.r < Math.hypot(m.a[0] - host.a[0], m.a[1] - host.a[1], m.a[2] - host.a[2]) - host.r) host = s;
    return m.r <= 0.3 * host.r;
  }), 'every generated mouth is PROPORTIONAL (r <= 30% of its host — voids stay dead)');
  // Knee fidelity (the leg-cuts analysis, Daniel's call): generated
  // kneed legs carry the CAST's expressive fold — bends off the old
  // 0.05 formula floor (cast: 0.060-0.070) and front feet planted
  // FORWARD of their hips (the A5.1 Z-fold), so generated knees read
  // in the silhouette like the authored ones.
  const kneedGens = sweep.filter((r) => r.creature.step?.knees);
  assert(kneedGens.length > 0, 'the sweep contains kneed creatures to judge');
  const foldStats = kneedGens.map((r) => {
    const th = r.creature.prims.find((p) => p.id === 'thigh_fl');
    const sh = r.creature.prims.find((p) => p.id === 'leg_fl');
    const H = th.a, K = th.b, F = sh.b;
    const hf = [F[0] - H[0], F[1] - H[1], F[2] - H[2]];
    const L = Math.hypot(...hf);
    const u = hf.map((v) => v / L);
    const d = (K[0] - H[0]) * u[0] + (K[1] - H[1]) * u[1] + (K[2] - H[2]) * u[2];
    return {
      bend: Math.hypot(K[0] - H[0] - u[0] * d, K[1] - H[1] - u[1] * d, K[2] - H[2] - u[2] * d),
      splayF: F[0] - H[0],
    };
  });
  const minBend = Math.min(...foldStats.map((f) => f.bend));
  assert(minBend > 0.052, `generated knees are OFF the old 0.05 floor (min bend ${minBend.toFixed(3)} — cast-parity fold, MEASURED)`);
  assert(foldStats.every((f) => f.splayF < 0), 'generated FRONT feet plant FORWARD of their hips (the Z-fold splay, like the cast)');
  // Floater/flyer archetypes (reference parity): generated floaters get
  // the JUDGED tendril look — two segments, amplitude-delta bend — with
  // the joint-divergence invariant held by construction; generated
  // flyers spin about the blade's authored midpoint hub.
  const genFloaters = sweep.filter((r) => r.archetype === 'floater');
  const genFlyers = sweep.filter((r) => r.archetype === 'flyer');
  assert(genFloaters.length > 0 && genFlyers.length > 0, `the sweep grows floaters AND flyers (${genFloaters.length} / ${genFlyers.length})`);
  assert(genFloaters.every((r) => r.creature.hover && !r.creature.step && !r.creature.hop && Array.isArray(r.creature.anim) && r.creature.anim.length === 8), 'generated floaters hover with two-segment sway on all four tendrils');
  assert(genFloaters.every((r) => ['fl', 'fr', 'bl', 'br'].every((side) => {
    const up = r.creature.prims.find((p) => p.id === `tendril_${side}_up`);
    const lo = r.creature.prims.find((p) => p.id === `tendril_${side}_lo`);
    const aUp = r.creature.anim.find((a) => a.primId === up.id);
    const aLo = r.creature.anim.find((a) => a.primId === lo.id);
    const dJT = Math.hypot(up.b[0] - up.a[0], up.b[1] - up.a[1], up.b[2] - up.a[2]);
    return up.b.every((v, i) => v === lo.a[i]) && aUp.speed === aLo.speed && Math.abs(aLo.amplitude - aUp.amplitude) * dJT < Math.min(up.r, lo.r) * 0.5;
  })), 'every generated floater holds the joint invariant: shared joints, one speed per pair, divergence under half the thinner radius (an elbow, never a tear — by construction)');
  assert(genFlyers.every((r) => {
    const prop = r.creature.prims.find((p) => p.id === 'prop');
    const a = r.creature.anim;
    return a.mode === 'spin' && a.pivot.every((v, i) => v === (prop.a[i] + prop.b[i]) / 2);
  }), 'every generated flyer spins about the blade MIDPOINT hub (by construction)');
  const rt = parseG(exportG(generateCreature(42).creature));
  assert(rt.ok && JSON.stringify(rt.creature) === JSON.stringify(generateCreature(42).creature), 'a generated creature is ordinary data: it round-trips through the C1 pipeline bit-faithfully');
}

// ---- C3 terrarium: the world is scenery, the locomotion plane is law ----
// world.js is probed on its PURE exports. The load-bearing invariant:
// terrain height is EXACTLY zero everywhere a creature can stand — the
// roam/gait/hop stack assumes the y=0 plane and a dozen sims above
// certify it, so the world must never reach into creature space. Props
// obey the same border. Everything is seed-deterministic: a world is
// data, like a creature.
{
  const { terrainHeight, propPlacements, buildTerrainGeometry, bandColor } = await import('./src/render/world.js');
  const { WORLD_SEED, WORLD_RADIUS, WORLD_FLAT_RADIUS: FLAT, WORLD_HILL_HEIGHT, WORLD_PROP_MIN_R, ROAM_HARD_RADIUS: HARD, WORLD_PINE_COUNT, WORLD_PINE_MIN_H, WORLD_PINE_MAX_H, WORLD_PINE_SPACING, GROUND_COLOR: GC3 } = await import('./src/config.js');

  let flatOk = true;
  for (let ri = 0; ri <= 20; ri++) {
    for (let ti = 0; ti < 24; ti++) {
      const r = (ri / 20) * FLAT; // the invariant's own boundary: the mask is identically 0 through r = FLAT inclusive
      const th = (ti / 24) * Math.PI * 2;
      if (terrainHeight(Math.cos(th) * r, Math.sin(th) * r, WORLD_SEED) !== 0) flatOk = false;
    }
  }
  assert(flatOk, `terrain is EXACTLY flat through r = ${FLAT} (the locomotion plane, sampled 21x24, zero by construction — and FLAT > hard clamp is asserted above with margin)`);

  let maxH = 0;
  let minH = 0;
  for (let i = 0; i < 900; i++) {
    const r = FLAT + 0.2 + ((WORLD_RADIUS - FLAT - 0.4) * (i % 30)) / 30;
    const th = (i / 900) * Math.PI * 2 * 7;
    const h = terrainHeight(Math.cos(th) * r, Math.sin(th) * r, WORLD_SEED);
    maxH = Math.max(maxH, h);
    minH = Math.min(minH, h);
  }
  assert(maxH > 0.15, `the hills exist (max sampled height ${maxH.toFixed(3)} > 0.15 — the ring is not inert)`);
  assert(minH >= 0 && maxH <= WORLD_HILL_HEIGHT + 1e-9, `hills stay in [0, ${WORLD_HILL_HEIGHT}] (no pits below the stage plane, ceiling held)`);
  assert(terrainHeight(6.2, 3.1, WORLD_SEED) === terrainHeight(6.2, 3.1, WORLD_SEED), 'terrain is deterministic (same inputs, same height)');
  // REGRESSION GUARD (the invisible-terrain incident): every terrain
  // triangle must wind to an UPWARD normal (+y). As first authored they
  // all faced DOWN, so the overhead camera back-face-culled the entire
  // mesh — the terrain was invisible for many rounds and the "ground" was
  // the background/sky showing through it. Winding, not color, not
  // renderOrder.
  {
    const g = buildTerrainGeometry(WORLD_SEED);
    const pos = g.getAttribute('position'), idx = g.getIndex();
    let up = 0, down = 0;
    for (let n = 0; n < idx.count / 3; n++) {
      const a = idx.getX(n * 3), b = idx.getX(n * 3 + 1), c = idx.getX(n * 3 + 2);
      const P = (i) => [pos.getX(i), pos.getY(i), pos.getZ(i)];
      const [p0, p1, p2] = [P(a), P(b), P(c)];
      const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
      const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
      const ny = e1[2] * e2[0] - e1[0] * e2[2]; // y-component of e1 x e2
      if (ny > 1e-9) up++; else if (ny < -1e-9) down++;
    }
    assert(down === 0 && up > 0, `every terrain triangle faces UP (+y): ${up} up / ${down} down — a downward winding back-face-culls the whole ground (the invisible-terrain incident)`);
  }
  assert(terrainHeight(6.2, 3.1, WORLD_SEED) !== terrainHeight(6.2, 3.1, WORLD_SEED + 1), 'a different world seed is a different world');

  const props = propPlacements(WORLD_SEED);
  const all = [...props.rocks, ...props.grass];
  assert(all.every((p) => Math.hypot(p.x, p.z) >= WORLD_PROP_MIN_R && WORLD_PROP_MIN_R > HARD), `all ${all.length} props sit at r >= ${WORLD_PROP_MIN_R}, strictly outside creature space (hard clamp ${HARD})`);
  assert(all.every((p) => p.y === terrainHeight(p.x, p.z, WORLD_SEED)), 'every prop sits ON the terrain (y from the same height function)');
  assert(JSON.stringify(propPlacements(WORLD_SEED)) === JSON.stringify(props), 'prop placement is deterministic');
  assert(props.pines.length > 0 && props.pines.length <= WORLD_PINE_COUNT, `pines placed (${props.pines.length} of ${WORLD_PINE_COUNT} — deterministic rejection sampling may skip)`);
  assert(props.pines.every((p) => Math.hypot(p.x, p.z) >= WORLD_PROP_MIN_R), 'every pine sits outside creature space');
  assert(props.pines.every((p) => p.y === terrainHeight(p.x, p.z, WORLD_SEED) && p.y >= WORLD_PINE_MIN_H && p.y <= WORLD_PINE_MAX_H), `every pine roots ON terrain INSIDE the mid-slope band [${WORLD_PINE_MIN_H}, ${WORLD_PINE_MAX_H}] — the terrain-AWARE scatter, proven`);
  assert(props.pines.every((p, i) => props.pines.every((q, j) => i === j || Math.hypot(p.x - q.x, p.z - q.z) >= WORLD_PINE_SPACING)), `every pine pair stands >= ${WORLD_PINE_SPACING} apart — separated silhouettes, each tree its own ink line`);

  const geo = buildTerrainGeometry(WORLD_SEED);
  const pos = geo.getAttribute('position');
  let meshOk = true;
  for (let i = 0; i < pos.count; i += 97) {
    if (Math.abs(pos.getY(i) - terrainHeight(pos.getX(i), pos.getZ(i), WORLD_SEED)) > 1e-6) meshOk = false;
  }
  assert(meshOk && geo.getAttribute('color') !== undefined, 'the terrain mesh mirrors terrainHeight exactly and carries band colors');
  const low = bandColor(0);
  const gRaw = [((GC3 >> 16) & 255) / 255, ((GC3 >> 8) & 255) / 255, (GC3 & 255) / 255];
  assert(low.every((v, i) => v === gRaw[i]), 'the flat band is EXACTLY GROUND_COLOR (probe refined at pass A: the invariant was always the CONSTANT, never the old hex — raw channels)');
}

// ---- LOOK pass A: the stage re-key (sky, fog, dots — the pure laws) ----
// skyColor is anchored at both ends (the horizon end IS the fog color,
// so ground and sky meet seamlessly by construction); the dot lane is
// its own seeded stream, so its determinism and the prop streams' are
// independent by design, not by append-discipline.
{
  const { skyColor, dotPlacements } = await import('./src/render/world.js');
  const { SKY_TOP, SKY_HORIZON, FOG_NEAR, FOG_FAR, WORLD_DOT_COUNT, WORLD_DOT_MIN_S, WORLD_DOT_MAX_S, DOT_Y, SHADOW_Y: SHY2, WORLD_FLAT_RADIUS: FLAT3, WORLD_SEED: WS2 } = await import('./src/config.js');
  const rawLk = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

  assert(skyColor(0).every((v, i) => v === rawLk(SKY_HORIZON)[i]), 'skyColor(0) is exactly SKY_HORIZON (raw channels — and the fog fades into the SAME constant: ground meets sky seamlessly)');
  assert(skyColor(1).every((v, i) => v === rawLk(SKY_TOP)[i]), 'skyColor(1) is exactly SKY_TOP (the zenith anchor)');
  assert(skyColor(-2).every((v, i) => v === rawLk(SKY_HORIZON)[i]), 'skyColor clamps below: the lower hemisphere is all horizon (any orbit angle is safe)');
  let skyMono = true;
  for (let t = 0; t < 1; t += 0.1) {
    const a = skyColor(t);
    const b = skyColor(t + 0.1);
    // The blue channel falls horizon -> zenith in this key; each step must move toward the top, never back.
    if ((b[2] - a[2]) * (rawLk(SKY_TOP)[2] - rawLk(SKY_HORIZON)[2]) < -1e-12) skyMono = false;
  }
  assert(skyMono, 'the sky gradient walks monotonically horizon -> zenith (no bands doubling back)');

  const dd = dotPlacements(WS2);
  assert(dd.length === WORLD_DOT_COUNT, `the floor carries exactly WORLD_DOT_COUNT dots (${dd.length})`);
  assert(JSON.stringify(dotPlacements(WS2)) === JSON.stringify(dd), 'dot placement is deterministic (same seed, same floor)');
  assert(JSON.stringify(dotPlacements(WS2 + 1)) !== JSON.stringify(dd), 'a different seed patterns a different floor');
  assert(dd.every((d) => { const r = Math.hypot(d.x, d.z); return r >= 0.4 - 1e-9 && r <= FLAT3 - 0.2 + 1e-9; }), 'every dot lies in the FLAT region (a horizontal quad on a slope would clip into it)');
  assert(dd.every((d) => d.s >= WORLD_DOT_MIN_S && d.s <= WORLD_DOT_MAX_S), 'every dot size sits inside the authored range');

  assert(DOT_Y > 0 && DOT_Y < SHY2, 'the layer ladder holds: dots UNDER shadows (and shadows under prints, asserted above) — the floor pattern never covers a read');
  assert(FOG_NEAR > 0 && FOG_NEAR < FOG_FAR, 'fog planes are sane (near before far)');
}

// ---- LOOK pass B: the shading model (soft wrap + gloss — the contract) ----
// No CPU consumer mirrors the LIGHTING (color has a mirror; light does
// not), so the contract is probed the ink-pass way: the shader SOURCE
// carries the model, and the material carries the levers LIVE at their
// config values.
{
  const { SHADE_AMBIENT, SPEC_POWER, SPEC_STRENGTH } = await import('./src/config.js');
  const mB = createBlendMaterial([{ id: 'b', type: 'sphere', a: [0, 0.5, 0], r: 0.3 }], 0);
  assert(mB.uniforms.uAmbient.value === SHADE_AMBIENT && SHADE_AMBIENT > 0 && SHADE_AMBIENT < 1, 'the lighting floor rides a LIVE uniform at its config value (a feel lever, not a bake)');
  assert(mB.uniforms.uSpecPow.value === SPEC_POWER && SPEC_POWER > 1, 'gloss tightness is live');
  assert(mB.uniforms.uSpecStrength.value === SPEC_STRENGTH && SPEC_STRENGTH >= 0, 'gloss intensity is live (0 = matte revert, one value)');
  assert(mB.fragmentShader.includes('* 0.5 + 0.5') && mB.fragmentShader.includes('hl * hl'), 'the fragment carries the half-Lambert wrap (soft shading, dark rim never crushed)');
  assert(!mB.fragmentShader.includes('floor(diff'), 'the 3-band quantize is GONE (SS1 reconstructed the reference wrong; the screenshots won)');
  assert(mB.fragmentShader.includes('uSpecPow') && mB.fragmentShader.includes('cameraPosition'), 'the gloss rides the world-space view vector (cameraPosition: the r170 fragment prelude, source-verified)');
  const { CONTACT_AO, CONTACT_AO_H } = await import('./src/config.js');
  assert(mB.uniforms.uContactAO.value === CONTACT_AO && CONTACT_AO > 0 && CONTACT_AO < 1, 'contact occlusion rides a live uniform (pass B.1: the dead-ink band at ground contact gets a shading answer, never a threshold one)');
  assert(mB.uniforms.uContactAOH.value === CONTACT_AO_H && CONTACT_AO_H > 0, 'the contact fade band is live');
  assert(mB.fragmentShader.includes('smoothstep(0.0, uContactAOH, worldPos.y)') && mB.fragmentShader.includes('* groundAO'), 'the fragment darkens color AND gloss toward y = 0 (no glint survives inside the contact)');
}

// ---- FLOOR DECALS: transparent pass + the terrain regression guard ----
// The floor-paint "opaque decals on a negative-renderOrder ladder"
// contract was REVERTED: it required the terrain at a negative
// renderOrder, and an opaque depth-WRITER below zero does not render
// through the ink pass's MSAA + depth-texture target on the target GPU
// (the white-ground incident, caught with a solo-terrain instrument).
// Decals are back in the transparent pass; the terrain is back at
// renderOrder 0. The guard below is the executable memory of that.
{
  const T = await import('three');
  const { createTrails: mkTrails } = await import('./src/render/trails.js');
  const { createShadows: mkShadows } = await import('./src/render/shadows.js');
  const { createWorld: mkWorld } = await import('./src/render/world.js');
  const decalOk = (mesh) => mesh.material.transparent === true && mesh.material.depthWrite === false;
  const s1 = new T.Scene();
  mkTrails(s1);
  const printMesh = s1.children[0];
  assert(decalOk(printMesh) && printMesh.renderOrder === 0, 'prints are transparent-pass decals at renderOrder 0 (drawn after opaque, depth-tested)');
  const s2 = new T.Scene();
  mkShadows(s2);
  const shadowMesh = s2.children[0];
  assert(decalOk(shadowMesh) && shadowMesh.renderOrder === -1, 'shadows are transparent-pass decals at renderOrder -1 (under prints, so a footprint inside a shadow stays visible)');
  const s3 = new T.Scene();
  mkWorld(s3);
  const floor = s3.children.find((c) => c.isMesh && !c.isInstancedMesh && c.material.side !== T.BackSide);
  assert(floor !== undefined && floor.material.vertexColors === true, 'the terrain is present, opaque, vertex-colored');
  assert(floor.renderOrder >= 0, 'REGRESSION GUARD: the terrain is NOT at a negative renderOrder — an opaque depth-writer below zero does not render through the ink pass (the white-ground incident)');
  const dotMesh = s3.children.find((c) => c.isInstancedMesh && c.renderOrder < 0);
  assert(dotMesh !== undefined && decalOk(dotMesh) && dotMesh.renderOrder === -2, 'dots are transparent-pass decals at renderOrder -2 (under shadows and prints)');
  assert(dotMesh.renderOrder < shadowMesh.renderOrder && shadowMesh.renderOrder < printMesh.renderOrder, 'the decal sort holds among the transparent layers: dots -> shadows -> prints');
  const skyMesh = s3.children.find((c) => c.isMesh && c.material.side === T.BackSide);
  assert(skyMesh !== undefined && skyMesh.renderOrder === -100 && skyMesh.material.depthWrite === false && skyMesh.material.depthTest === false, 'the sky is depth-INERT background BY CONSTRUCTION: first (renderOrder -100), no depth write, no depth test — painted over by the opaque terrain (the dome-covers-terrain incident)');
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
  const { INK_PX, INK_DEPTH_THRESHOLD, INK_INTERIOR } = await import('./src/config.js');
  // Hand-computed anchors at the app's real planes (near 0.1, far 100):
  assert(Math.abs(linearizeDepth(0, 0.1, 100) - 0.1) < 1e-12, 'ink linearizeDepth(0) = near (hand-computed)');
  assert(Math.abs(linearizeDepth(1, 0.1, 100) - 100) < 1e-9, 'ink linearizeDepth(1) = far (hand-computed)');
  assert(Math.abs(linearizeDepth(0.5, 0.1, 100) - 10 / 50.05) < 1e-12, 'ink linearizeDepth(0.5) = 10/50.05 = 0.1998 (hand-computed: nf / (f - 0.5(f-n)))');
  assert(linearizeDepth(0.2, 0.1, 100) < linearizeDepth(0.8, 0.1, 100), 'ink linearizeDepth is monotonic (deeper buffer value = farther surface)');
  const BACKTICK = '\u0060';
  assert(!INK_FRAG.includes(BACKTICK) && !INK_VERT.includes(BACKTICK), 'ink GLSL contains no backticks (the template-literal termination lesson)');
  for (const u of ['tColor', 'tDepth', 'uResolution', 'uInkPx', 'uNear', 'uFar', 'uThreshold', 'uInkColor', 'uInteriorInk']) {
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

  // Limb-read fade (feel pass): JS mirror of the two-tier classification,
  // hand-computed at the measured edge classes. Interior contours (the
  // clustered limb lines, rel 1-4x threshold) ink at INK_INTERIOR;
  // silhouettes (background ~1000x, ground/creature-vs-creature 10x+)
  // keep full weight. INK_INTERIOR = 1.0 is the exact pre-pass look.
  {
    const T = INK_DEPTH_THRESHOLD;
    const ss = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
    const factor = (rel) => INK_INTERIOR + (1 - INK_INTERIOR) * ss(T * 4, T * 12, rel);
    assert(INK_INTERIOR > 0 && INK_INTERIOR <= 1, 'INK_INTERIOR is a sane strength (0..1]; 1.0 = uniform ink, the revert');
    assert(Math.abs(factor(T * 2) - INK_INTERIOR) < 1e-12, 'a limb-class contour (rel 2x threshold) inks at exactly INK_INTERIOR strength (the reported clutter, quieted)');
    assert(factor(T * 25) === 1, 'a creature-vs-creature / ground edge (rel 25x) keeps FULL ink (separation lines stay bold)');
    assert(factor(1000) === 1, 'a background silhouette keeps FULL ink');
    assert(INK_FRAG.includes('mix(uInteriorInk, 1.0, outerness)'), 'ink fragment carries the two-tier fade (the limb-read regression guard)');
  }
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
