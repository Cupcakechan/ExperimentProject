// ============================================================
// generate.js — the SEEDED CREATURE GENERATOR (C2, suite-graded).
//
// One entry point: generateCreature(seed) -> { creature, archetype,
// attempts }. Same seed, same creature, every time — seeds are
// shareable. Assembly is ARCHETYPE-DRIVEN: a data table of body
// plans (kneed quadruped, pudgy quadruped, hopper biped, six-legger,
// slug, longneck), each a builder that samples its parameter ranges
// from the seeded stream.
//
// The load-bearing idea: the project's MEASURED boundaries are
// CONSTRUCTION RULES here, not documentation —
//   - ball vs flat eyes CHOSEN by the dilate boundary (peak <= r/3),
//   - knee rest poses authored with the pole >= 0.02 off the line
//     and reach off the straight lock (bend = max(0.05, 0.12*D)),
//   - knees kept INSIDE the body at rest (the capless validity
//     boundary), verified with the same sd math the validator uses,
//   - decals rooted in the band (-r < sd < 0) at every endpoint,
//   - breath peaks under the thinnest solid, thin parts kCap'd.
//
// GRADING: every candidate passes through validateCreature (the same
// module that gates imports and anchors the suite). A rejection
// retries on a DETERMINISTIC sub-stream (seed x attempt), capped —
// the suite proves the whole seed range lands valid in few attempts.
// Pure module: no THREE, no DOM (browser button, Node suite, both).
// ============================================================

import { validateCreature, sdPrim } from './validate.js';

export const GENERATE_MAX_ATTEMPTS = 10;

// mulberry32 — small, seedable, deterministic (the project rule: no
// unseeded RNG anywhere; a generated creature is reproducible data).
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(seed, attempt) {
  // Hash seed + attempt into one 32-bit state: attempt streams are
  // independent, so a retry is a fresh roll, not a nudged one.
  const s = (Math.imul(seed | 0, 0x9e3779b9) ^ Math.imul(attempt + 1, 0x85ebca6b)) >>> 0;
  const rng = mulberry32(s);
  rng.range = (lo, hi) => lo + (hi - lo) * rng();
  rng.int = (lo, hi) => Math.floor(rng.range(lo, hi + 1));
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length) % arr.length];
  rng.chance = (p) => rng() < p;
  return rng;
}

// --- palette: seeded HSL, converted to the registry's hex ints ---
function hsl2hex(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  const to255 = (x) => Math.round(Math.min(Math.max(x, 0), 1) * 255);
  return (to255(f(0)) << 16) | (to255(f(8)) << 8) | to255(f(4));
}

function makePalette(rng) {
  const h = rng(); // base hue, 0..1
  const s = rng.range(0.42, 0.62);
  const l = rng.range(0.5, 0.6);
  const shift = rng.range(0.06, 0.14) * (rng.chance(0.5) ? 1 : -1);
  return {
    body: hsl2hex(h, s, l),
    head: hsl2hex(h + shift * 0.4, s, Math.min(l + 0.07, 0.68)),
    limb: hsl2hex(h, s + 0.04, l * 0.8),
    shin: hsl2hex(h + shift * 0.5, s + 0.05, l * 0.5), // hoof-dark (the A5.1 reference look)
    accent: hsl2hex(h + shift, s, l),
    tip: hsl2hex(h + 0.33, s + 0.05, 0.55), // the Skitter green-tip trick, hue-rotated
    iris: hsl2hex(h, 0.25, 0.12),
    mouth: hsl2hex(h + 0.5, 0.2, 0.15),
  };
}

// --- naming: seeded syllables; id carries the seed for provenance ---
const NAME_A = ['Bop', 'Gru', 'Ska', 'Mog', 'Fli', 'Twi', 'Dob', 'Pip', 'Waz', 'Zub', 'Kip', 'Nib', 'Lom', 'Fen', 'Qua', 'Yol'];
const NAME_B = ['ble', 'bin', 'per', 'zle', 'mot', 'nik', 'loo', 'pit', 'dle', 'ver', 'goo', 'wig'];

// ============================================================
// Shared anatomy helpers — each returns prims (and side data) and
// keeps its own measured boundary by construction.
// ============================================================

// Ball eyes (cast standard) or flat decals (past the dilate boundary):
// the CHOICE is the measured rule — peak dilate <= r/3 for solids.
function makeEyes(rng, host, peak, pal, out) {
  const front = [-1, rng.range(0.15, 0.35), 0];
  const fl = Math.hypot(...front);
  const dir = front.map((v) => v / fl);
  const sideZ = rng.range(0.42, 0.55) * host.r;
  const rEye = rng.range(0.07, Math.min(0.12, host.r * 0.45));
  if (peak <= rEye / 3 - 0.004) {
    // BALL EYES: solid whites rooted 0.015-0.02 inside, iris decals ON
    // the eyeball (nearest-solid hosting finds it; root 0.008 keeps the
    // iris in its band against the ball).
    const root = rng.range(0.015, 0.02);
    for (const sign of [1, -1]) {
      const sideDir = [dir[0], dir[1], (sign * sideZ) / host.r];
      const sl = Math.hypot(...sideDir);
      const u = sideDir.map((v) => v / sl);
      const c = [host.a[0] + u[0] * (host.r - root), host.a[1] + u[1] * (host.r - root), host.a[2] + u[2] * (host.r - root)];
      const rIris = rEye * rng.range(0.34, 0.44);
      const ic = [c[0] + u[0] * (rEye - 0.008), c[1] + u[1] * (rEye - 0.008), c[2] + u[2] * (rEye - 0.008)];
      const s = sign > 0 ? 'l' : 'r';
      out.prims.push({ id: `eyeball_${s}`, type: 'sphere', a: c.map(round3), r: round3v(rEye), kCap: 0.03, color: 0xffffff });
      out.irisQueue.push({ id: `iris_${s}`, type: 'sphere', a: ic.map(round3), r: round3v(rIris), color: pal.iris, paint: true });
    }
    out.blink = { eyes: ['eyeball_l', 'eyeball_r', 'iris_l', 'iris_r'] };
  } else {
    // FLAT DECALS (the Pudge rule): sclera + pupil balloon together and
    // keep the painted read where a ball's contrast would compress.
    const rS = rng.range(0.06, 0.085);
    for (const sign of [1, -1]) {
      const sideDir = [dir[0], dir[1], (sign * sideZ) / host.r];
      const sl = Math.hypot(...sideDir);
      const u = sideDir.map((v) => v / sl);
      const sc = [host.a[0] + u[0] * (host.r - 0.018), host.a[1] + u[1] * (host.r - 0.018), host.a[2] + u[2] * (host.r - 0.018)];
      const pc = [host.a[0] + u[0] * (host.r - 0.006), host.a[1] + u[1] * (host.r - 0.006), host.a[2] + u[2] * (host.r - 0.006)];
      const s = sign > 0 ? 'l' : 'r';
      out.prims.push({ id: `sclera_${s}`, type: 'sphere', a: sc.map(round3), r: round3v(rS), color: 0xf2f4f6, paint: true });
      out.irisQueue.push({ id: `pupil_${s}`, type: 'sphere', a: pc.map(round3), r: round3v(rS * 0.42), color: pal.iris, paint: true });
    }
    out.blink = { eyes: ['sclera_l', 'sclera_r', 'pupil_l', 'pupil_r'] };
  }
}

// Mouth: a PAINT capsule slit on the host's face front (R3 model),
// sized PROPORTIONAL to its host: the cast's judged read is a mouth
// at ~18-26% of the host radius. The first litters sized in ABSOLUTE
// units — on a slug-scale head that was up to 57% of the face, a
// void, not a mouth (the generator's first browser lesson). Endpoint
// band still held by construction: half-span capped so both slit
// ends stay inside the host (-r < sd < 0).
function makeMouth(rng, host, pal, out) {
  const rM = round3v(host.r * rng.range(0.17, 0.26));
  const root = Math.min(0.03, host.r * 0.12, rM * 0.6);
  const dirRaw = [-1, rng.range(-0.15, 0.05), 0];
  const dl = Math.hypot(...dirRaw);
  const u = dirRaw.map((v) => v / dl);
  const c = [host.a[0] + u[0] * (host.r - root), host.a[1] + u[1] * (host.r - root), host.a[2] + u[2] * (host.r - root)];
  const sMax = 0.8 * Math.sqrt(Math.max(2 * host.r * root - root * root, 1e-6));
  const half = Math.min(host.r * rng.range(0.16, 0.3), sMax);
  out.prims.push({
    id: 'mouth',
    type: 'capsule',
    a: [round3(c[0]), round3(c[1]), round3(half)],
    b: [round3(c[0]), round3(c[1]), round3(-half)],
    r: rM,
    paint: true,
    color: pal.mouth,
  });
}

// Quadruped legs. kneed = two segments per leg with the rest pose
// carrying the IK pole (bend toward the face, -X) and the knee held
// INSIDE the body (capless validity) — verified with sd, clamped in z.
function makeQuadLegs(rng, body, yBody, rBody, half, kneed, pal, out) {
  const rThigh = rng.range(0.1, 0.135);
  const rShin = rThigh * 0.87;
  const hipY = yBody - rng.range(0.08, 0.12);
  const footY = 0.08;
  const zHip = rBody * rng.range(0.42, 0.52);
  const xF = -(half - rng.range(0.02, 0.08));
  const xB = half - rng.range(0.02, 0.08);
  const feet = [];
  const knees = {};
  for (const [px, tagX] of [[xF, 'f'], [xB, 'b']]) {
    for (const [sign, tagZ] of [[1, 'l'], [-1, 'r']]) {
      const legId = `leg_${tagX}${tagZ}`;
      const hip = [px, hipY, sign * zHip];
      const foot = [px + rng.range(-0.02, 0.06) * (tagX === 'f' ? 1 : 1), footY, sign * (zHip + 0.02)];
      if (kneed) {
        const D = Math.hypot(foot[0] - hip[0], foot[1] - hip[1], foot[2] - hip[2]);
        const bend = Math.max(0.05, 0.12 * D); // reach <= ~0.972: off the straight lock by construction
        let knee = [(hip[0] + foot[0]) / 2 - bend, (hip[1] + foot[1]) / 2, sign * (zHip + 0.01)];
        // Capless validity: the knee must sit INSIDE the body at rest.
        // Clamp z inward until sd(knee, body) <= -0.03 (same sd math as
        // the validator; deterministic clamp, no retry burned).
        for (let guard = 0; guard < 20 && sdPrim(knee, body) > -0.03; guard++) {
          knee = [knee[0], knee[1], knee[2] * 0.92];
        }
        knee = knee.map(round3);
        out.prims.push({ id: `thigh_${tagX}${tagZ}`, type: 'capsule', a: hip.map(round3), b: knee, r: round3v(rThigh), color: pal.limb });
        out.prims.push({ id: legId, type: 'capsule', a: knee, b: foot.map(round3), r: round3v(rShin), color: pal.shin });
        knees[legId] = `thigh_${tagX}${tagZ}`;
      } else {
        out.prims.push({ id: legId, type: 'capsule', a: hip.map(round3), b: foot.map(round3), r: round3v(rThigh), kCap: round3v(rThigh * 0.7), color: pal.limb });
      }
      feet.push(legId);
    }
  }
  // Registry order above is fl, fr, bl, br — diagonal trot pairs.
  out.step = { feet: ['leg_fl', 'leg_fr', 'leg_bl', 'leg_br'], groups: [[0, 3], [1, 2]] };
  if (kneed) {
    out.step.knees = knees;
    out.step.lift = 0.05; // the A5.1 measured lift: deep lifts fold knees past the ink's crease limit
  }
  void feet;
}

const round3 = (x) => Math.round(x * 1000) / 1000;
const round3v = round3;

// ============================================================
// The archetype table — each row is a builder over the seeded rng.
// A new body plan is a new row; nothing else needs wiring.
// ============================================================
const ARCHETYPES = {
  kneedQuad(rng, pal) {
    const rBody = rng.range(0.34, 0.44);
    const half = rng.range(0.4, 0.55);
    const yBody = rBody + rng.range(0.08, 0.16);
    const body = { id: 'body', type: 'capsule', a: [round3(-half), round3(yBody), 0], b: [round3(half), round3(yBody), 0], r: round3v(rBody), color: pal.body };
    const rHead = rng.range(0.26, 0.32);
    const head = { id: 'head', type: 'sphere', a: [round3(-(half + rHead * 0.85)), round3(yBody + rng.range(0.3, 0.42)), 0], r: round3v(rHead), color: pal.head };
    const out = { prims: [body, head], irisQueue: [] };
    makeQuadLegs(rng, body, yBody, rBody, half, true, pal, out);
    // Budget: 2 + 8 legs = 10; eyes 2 + irises 2 = 14; mouth 15; tail 16.
    const breath = rng.chance(0.5) ? { amplitude: round3v(rng.range(0.01, 0.018)), speed: round3v(rng.range(1.8, 2.6)) } : null;
    makeEyes(rng, head, breath ? breath.amplitude : 0, pal, out);
    makeMouth(rng, head, pal, out);
    out.prims.push({ id: 'tail', type: 'capsule', a: [round3(half), round3(yBody + 0.12), 0], b: [round3(half + rng.range(0.4, 0.55)), round3(yBody + rng.range(0.3, 0.45)), 0], r: round3v(rng.range(0.11, 0.14)), kCap: 0.09, color: pal.accent });
    out.prims.push(...out.irisQueue);
    const c = { anim: { primId: 'tail', axis: [1, 0, 0], amplitude: round3v(rng.range(0.4, 0.7)), speed: round3v(rng.range(2.2, 3.0)) }, step: out.step, blink: out.blink, prims: out.prims };
    if (breath) c.breath = breath;
    return c;
  },

  pudgyQuad(rng, pal) {
    // The inflate archetype — which is exactly why its eyes come out
    // FLAT: peak dilate blows the ball-eye boundary by construction.
    const rBody = rng.range(0.36, 0.42);
    const yBody = rBody + rng.range(0.08, 0.14);
    const body = { id: 'body', type: 'sphere', a: [round3(rng.range(0, 0.08)), round3(yBody), 0], r: round3v(rBody), color: pal.body };
    const rHead = rng.range(0.24, 0.28);
    const head = { id: 'head', type: 'sphere', a: [round3(-(rBody + rHead * 0.55)), round3(yBody + rng.range(0.16, 0.26)), 0], r: round3v(rHead), color: pal.head };
    const out = { prims: [body, head], irisQueue: [] };
    makeQuadLegs(rng, body, yBody, rBody, rBody * 0.75, false, pal, out);
    const inflate = round3v(rng.range(0.02, 0.04));
    const breath = { amplitude: round3v(rng.range(0.014, 0.02)), speed: round3v(rng.range(1.4, 1.9)) };
    makeEyes(rng, head, inflate + breath.amplitude, pal, out);
    makeMouth(rng, head, pal, out);
    out.prims.push({ id: 'tail', type: 'capsule', a: [round3(body.a[0] + rBody * 0.9), round3(yBody + 0.05), 0], b: [round3(body.a[0] + rBody * 0.9 + 0.2), round3(yBody + 0.18), 0], r: 0.11, kCap: 0.08, color: pal.accent });
    out.prims.push(...out.irisQueue);
    return { inflate, breath, anim: { primId: 'tail', axis: [0, 1, 0], amplitude: round3v(rng.range(0.4, 0.6)), speed: round3v(rng.range(2.6, 3.2)) }, step: out.step, blink: out.blink, prims: out.prims };
  },

  hopper(rng, pal) {
    const rBody = rng.range(0.44, 0.52);
    const yBody = rBody + rng.range(0.08, 0.14);
    const body = { id: 'body', type: 'sphere', a: [0, round3(yBody), 0], r: round3v(rBody), color: pal.body };
    const out = { prims: [body], irisQueue: [] };
    const zF = rBody * rng.range(0.3, 0.4);
    for (const [sign, s] of [[1, 'l'], [-1, 'r']]) {
      out.prims.push({ id: `foot_${s}`, type: 'capsule', a: [-0.05, 0.16, round3(sign * zF)], b: [round3(-rng.range(0.34, 0.42)), 0.12, round3(sign * (zF + 0.04))], r: round3v(rng.range(0.13, 0.16)), color: pal.limb });
    }
    for (const [sign, s] of [[1, 'l'], [-1, 'r']]) {
      out.prims.push({ id: `ear_${s}`, type: 'capsule', a: [-0.05, round3(yBody + rBody * 0.72), round3(sign * 0.15)], b: [round3(-rng.range(0.1, 0.18)), round3(Math.min(yBody + rBody * 0.72 + rng.range(0.32, 0.42), 1.5)), round3(sign * 0.22)], r: round3v(rng.range(0.14, 0.17)), color: pal.accent });
    }
    const breath = { amplitude: 0.012, speed: round3v(rng.range(2.0, 2.5)) };
    makeEyes(rng, body, breath.amplitude, pal, out);
    makeMouth(rng, body, pal, out);
    out.prims.push(...out.irisQueue);
    return { breath, hop: {}, anim: { primId: 'ear_l', axis: [1, 0, 0], amplitude: round3v(rng.range(0.25, 0.35)), speed: round3v(rng.range(2.8, 3.4)) }, step: { feet: ['foot_l', 'foot_r'], groups: [[0], [1]] }, blink: out.blink, prims: out.prims };
  },

  sixLegger(rng, pal) {
    const rBody = rng.range(0.22, 0.28);
    const yBody = rng.range(0.4, 0.46);
    const half = rng.range(0.26, 0.32);
    const body = { id: 'body', type: 'capsule', a: [round3(-half), round3(yBody), 0], b: [round3(half), round3(yBody + 0.04), 0], r: round3v(rBody), color: pal.body };
    const out = { prims: [body], irisQueue: [] };
    const rLeg = rng.range(0.05, 0.06);
    const zR = rng.range(0.28, 0.36);
    const xs = [[-half * 0.7, 'f'], [0.0, 'm'], [half * 0.7, 'b']];
    for (const [x, tx] of xs) {
      for (const [sign, tz] of [[1, 'l'], [-1, 'r']]) {
        out.prims.push({ id: `leg_${tx}${tz}`, type: 'capsule', a: [round3(x), round3(yBody - 0.06), round3(sign * rBody * 0.55)], b: [round3(x + rng.range(-0.1, 0.12)), 0.06, round3(sign * zR)], r: round3v(rLeg), kCap: 0.04, color: pal.limb });
      }
    }
    for (const [sign, s] of [[1, 'l'], [-1, 'r']]) {
      const bx = round3(-(half * 0.8 + 0.14));
      const by = round3(yBody + rBody + rng.range(0.16, 0.26));
      out.prims.push({ id: `antenna_${s}`, type: 'capsule', a: [round3(-half * 0.8), round3(yBody + rBody * 0.7), round3(sign * 0.07)], b: [bx, by, round3(sign * 0.12)], r: 0.05, kCap: 0.035, color: pal.accent });
      out.prims.push({ id: `tip_${s}`, type: 'sphere', a: [bx, by, round3(sign * 0.12)], r: 0.055, kCap: 0.04, color: pal.tip });
    }
    makeEyes(rng, { id: 'body', a: [round3(-half), round3(yBody), 0], r: rBody }, 0, pal, out);
    // NO mouth: cast parity (Skitter, the judged reference, is mouthless
    // — Daniel's call after the first litters; do not re-add in a range pass).
    out.prims.push(...out.irisQueue);
    return { step: { feet: ['leg_fl', 'leg_fr', 'leg_ml', 'leg_mr', 'leg_bl', 'leg_br'], groups: [[0, 3, 4], [1, 2, 5]] }, blink: out.blink, prims: out.prims };
  },

  slug(rng, pal) {
    const rBody = rng.range(0.16, 0.2);
    const half = rng.range(0.45, 0.55);
    const body = { id: 'body', type: 'capsule', a: [round3(-half), round3(rBody), 0], b: [round3(half * 0.85), round3(rBody), 0], r: round3v(rBody), color: pal.body };
    const head = { id: 'head', type: 'sphere', a: [round3(-half - 0.07), round3(rBody + 0.15), 0], r: round3v(rng.range(0.14, 0.17)), color: pal.head };
    const out = { prims: [body, head], irisQueue: [] };
    if (rng.chance(0.6)) {
      out.prims.push({ id: 'shell', type: 'sphere', a: [round3(rng.range(0.05, 0.15)), round3(rBody + rng.range(0.3, 0.36)), 0], r: round3v(rng.range(0.3, 0.36)), k: 0.06, color: pal.accent });
    }
    // Stalk eyes (the Shelby pattern): antennae carry BALL eyes at their
    // tips — which is also why a slug never animates its antennae (the
    // attached-prims rule: eyes would be left behind).
    const rAnt = 0.06;
    for (const [sign, s] of [[1, 'l'], [-1, 'r']]) {
      const A = [round3(head.a[0] - 0.04), round3(head.a[1] + 0.09), round3(sign * 0.06)];
      const B = [round3(head.a[0] - 0.18), round3(Math.min(head.a[1] + rng.range(0.3, 0.38), 1.1)), round3(sign * 0.1)];
      out.prims.push({ id: `antenna_${s}`, type: 'capsule', a: A, b: B, r: rAnt, kCap: 0.04, color: pal.limb });
      const dir = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
      const dl = Math.hypot(...dir);
      const u = dir.map((v) => v / dl);
      const root = 0.015;
      const rEye = 0.05;
      const c = [B[0] + u[0] * (rAnt - root), B[1] + u[1] * (rAnt - root), B[2] + u[2] * (rAnt - root)];
      const ic = [c[0] + u[0] * (rEye - 0.008), c[1] + u[1] * (rEye - 0.008), c[2] + u[2] * (rEye - 0.008)];
      out.prims.push({ id: `eyeball_${s}`, type: 'sphere', a: c.map(round3), r: rEye, kCap: 0.03, color: 0xffffff });
      out.irisQueue.push({ id: `iris_${s}`, type: 'sphere', a: ic.map(round3), r: 0.022, color: pal.iris, paint: true });
    }
    // NO mouth: cast parity (Shelby, the judged reference, is mouthless
    // — Daniel's call after the first litters; do not re-add in a range pass).
    out.prims.push(...out.irisQueue);
    return {
      breath: { amplitude: 0.012, speed: round3v(rng.range(0.8, 1.1)) },
      idle: { period: round3v(rng.range(9.5, 12)), duration: round3v(rng.range(3.5, 5)) },
      blink: { eyes: ['eyeball_l', 'eyeball_r', 'iris_l', 'iris_r'] },
      prims: out.prims,
    };
  },

  longneck(rng, pal) {
    // Budget forces the trade the cast discovered: neck + kneed legs +
    // eyes = 16 exactly, so NO mouth and the tail stays (parity with
    // the authored Longneck's 16/16 zero-headroom shape).
    const rBody = rng.range(0.34, 0.4);
    const half = rng.range(0.36, 0.44);
    const yBody = rBody + rng.range(0.1, 0.16);
    const body = { id: 'body', type: 'capsule', a: [round3(-half), round3(yBody), 0], b: [round3(half), round3(yBody), 0], r: round3v(rBody), color: pal.body };
    const topY = rng.range(1.28, 1.42);
    const neck = { id: 'neck', type: 'capsule', a: [round3(-half), round3(yBody + 0.05), 0], b: [round3(-half - 0.38), round3(topY), 0], r: round3v(rng.range(0.15, 0.18)), kCap: 0.12, color: pal.body };
    const rHead = rng.range(0.2, 0.23);
    const head = { id: 'head', type: 'sphere', a: [round3(-half - 0.48), round3(topY + 0.1), 0], r: round3v(rHead), color: pal.head };
    const out = { prims: [body, neck, head], irisQueue: [] };
    makeQuadLegs(rng, body, yBody, rBody, half, true, pal, out);
    out.prims.push({ id: 'tail', type: 'capsule', a: [round3(half), round3(yBody + 0.07), 0], b: [round3(half + rng.range(0.32, 0.42)), round3(yBody + rng.range(0.2, 0.3)), 0], r: 0.1, kCap: 0.07, color: pal.head });
    makeEyes(rng, head, 0, pal, out);
    out.prims.push(...out.irisQueue);
    return { anim: { primId: 'tail', axis: [1, 0, 0], amplitude: round3v(rng.range(0.5, 0.7)), speed: round3v(rng.range(2.4, 3.0)) }, step: out.step, blink: out.blink, prims: out.prims };
  },
};

export const ARCHETYPE_NAMES = Object.keys(ARCHETYPES);

export function generateCreature(seed) {
  for (let attempt = 0; attempt < GENERATE_MAX_ATTEMPTS; attempt++) {
    const rng = makeRng(seed, attempt);
    const archetype = rng.pick(ARCHETYPE_NAMES);
    const pal = makePalette(rng);
    const c = ARCHETYPES[archetype](rng, pal);
    c.id = `gen-${seed}` + (attempt ? `-${attempt}` : '');
    c.name = rng.pick(NAME_A) + rng.pick(NAME_B);
    const v = validateCreature(c);
    if (v.ok && v.warnings.length === 0) {
      return { creature: c, archetype, attempts: attempt + 1 };
    }
  }
  // Deterministically unlucky seed: the caller surfaces this as a
  // rejection, never a crash. The suite proves the seed range in use
  // never gets here.
  return { creature: null, archetype: null, attempts: GENERATE_MAX_ATTEMPTS };
}
