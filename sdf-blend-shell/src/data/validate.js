// ============================================================
// validate.js — the AUTHORING RULES, executable (C1).
//
// One function: validateCreature(c) -> { ok, errors, warnings }.
// ERRORS reject (the crash/garbage classes: NaN geometry, broken
// references, capacity, out-of-band decals — anything that would
// reach the shader wrong or crash a consumer). WARNINGS allow
// (taste rules a hand-author may knowingly bend: stage bounds).
//
// Pure by design: no THREE, no DOM — the same module runs in the
// browser as the IMPORT GATE, in Node as the suite's parity probe,
// and later inside the C2 generator as its GRADING function. The
// rules mirror the suite's section-1 invariants; where the suite
// owns a MEASURED or aesthetic-tier check (disc-fit trig, INFL
// ceilings, simulated walks), it stays suite-only — this module
// holds the structural rules a single creature can satisfy alone.
// ============================================================

import { MAX_PRIMS, KNEE_STRAIGHT_FRAC, IDLE_RAMP } from '../config.js';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(isNum);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (v) => Math.hypot(v[0], v[1], v[2]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Point-to-prim signed distance — the suite's sdPrim, mirrored (a sphere
// is the degenerate b === a case; the max() guards divide-by-zero).
// EXPORTED (C2): the generator verifies its own construction (knee
// placement, eye rooting) with the SAME math that will grade it.
export function sdPrim(p, prim) {
  const a = prim.a;
  const b = prim.b ?? prim.a;
  const pa = sub(p, a);
  const ba = sub(b, a);
  const h = Math.min(Math.max(dot(pa, ba) / Math.max(dot(ba, ba), 1e-8), 0), 1);
  return len([pa[0] - ba[0] * h, pa[1] - ba[1] * h, pa[2] - ba[2] * h]) - prim.r;
}

// Nearest SOLID to a point — the decal/carve host rule (nearest-solid
// hosting, exactly as the suite and blink.js resolve it).
function nearestSolid(p, solids) {
  let host = null;
  let hostSd = Infinity;
  for (const s of solids) {
    const sd = sdPrim(p, s);
    if (sd < hostSd) {
      hostSd = sd;
      host = s;
    }
  }
  return { host, hostSd };
}

export function validateCreature(c) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);

  // --- structure: without this, the geometric rules below are meaningless ---
  if (!c || typeof c !== 'object' || Array.isArray(c)) {
    return { ok: false, errors: ['creature must be an object'], warnings };
  }
  if (typeof c.id !== 'string' || c.id.length === 0) err("'id' must be a non-empty string");
  if (c.name != null && typeof c.name !== 'string') err("'name' must be a string when present");
  if (!Array.isArray(c.prims) || c.prims.length === 0) {
    err("'prims' must be a non-empty array");
    return { ok: false, errors, warnings };
  }

  // --- per-prim well-formedness (the shader-garbage gate) ---
  c.prims.forEach((p, i) => {
    const tag = `prims[${i}]${p && typeof p.id === 'string' ? ` '${p.id}'` : ''}`;
    if (!p || typeof p !== 'object') return err(`${tag}: must be an object`);
    if (typeof p.id !== 'string' || p.id.length === 0) err(`${tag}: 'id' must be a non-empty string`);
    if (p.type !== 'sphere' && p.type !== 'capsule') err(`${tag}: 'type' must be 'sphere' or 'capsule'`);
    if (!isVec3(p.a)) err(`${tag}: 'a' must be [x, y, z] finite numbers`);
    if (p.type === 'capsule' && !isVec3(p.b)) err(`${tag}: a capsule needs 'b' as [x, y, z] finite numbers`);
    if (p.type === 'sphere' && p.b !== undefined) err(`${tag}: a sphere must not carry 'b' (author a capsule instead)`);
    if (!isNum(p.r) || p.r <= 0) err(`${tag}: 'r' must be a finite number > 0`);
    if (p.kCap != null && (!isNum(p.kCap) || p.kCap <= 0)) err(`${tag}: 'kCap' must be > 0 when present`);
    if (p.k != null && (!isNum(p.k) || p.k <= 0)) err(`${tag}: 'k' must be > 0 when present (smin divides by it)`);
    if (p.color != null && !isNum(p.color)) err(`${tag}: 'color' must be a number when present`);
    if (p.paint != null && p.paint !== true) err(`${tag}: 'paint' must be true or absent`);
    if (p.negative != null && p.negative !== true) err(`${tag}: 'negative' must be true or absent`);
    if (p.paint && p.negative) err(`${tag}: cannot be both paint and negative`);
  });
  if (errors.length) return { ok: false, errors, warnings }; // geometry rules need sane prims

  // --- registry-level rules ---
  const ids = c.prims.map((p) => p.id);
  if (new Set(ids).size !== ids.length) err('prim ids must be unique');
  if (c.prims.length > MAX_PRIMS) err(`too many prims (${c.prims.length} > shader capacity ${MAX_PRIMS})`);
  const solids = c.prims.filter((p) => !p.paint && !p.negative);
  if (solids.length === 0) err('at least one SOLID prim required (paints and carves have no surface of their own)');
  if (errors.length) return { ok: false, errors, warnings };

  const byId = new Map(c.prims.map((p) => [p.id, p]));

  // --- decal band: every PAINT endpoint anchored inside its host AND
  // poking through (-r < sd < 0) — a floating decal paints nothing, a
  // sunken one is invisible; a capsule slit must hold at BOTH ends ---
  for (const paint of c.prims.filter((p) => p.paint)) {
    const { host } = nearestSolid(paint.a, solids);
    const ends = paint.b ? [['a', paint.a], ['b', paint.b]] : [['a', paint.a]];
    for (const [endLabel, pt] of ends) {
      const sd = sdPrim(pt, host);
      if (!(sd < 0)) err(`paint '${paint.id}' endpoint ${endLabel} floats OUTSIDE its host '${host.id}' (sd ${sd.toFixed(4)} — must anchor inside)`);
      else if (!(sd > -paint.r)) err(`paint '${paint.id}' endpoint ${endLabel} is sunk too deep in '${host.id}' (sd ${sd.toFixed(4)} <= -r — it cannot poke through the skin)`);
    }
  }

  // --- carve rules (live vocabulary — this cast carries none since R3) ---
  for (const neg of c.prims.filter((p) => p.negative)) {
    const { host, hostSd } = nearestSolid(neg.a, solids);
    if (!(hostSd < neg.r)) err(`carve '${neg.id}' does not reach into its host '${host.id}' (sd ${hostSd.toFixed(4)} >= r)`);
    if (!(neg.r - hostSd < host.r)) err(`carve '${neg.id}' pierces its host '${host.id}' (a tunnel is topology the host mesh cannot express)`);
    const ends = neg.b ? [['a', neg.a], ['b', neg.b]] : [['a', neg.a]];
    for (const [endLabel, pt] of ends) {
      const sd = sdPrim(pt, host);
      if (!(sd < -0.005)) err(`carve '${neg.id}' endpoint ${endLabel} grazes the surface (sd ${sd.toFixed(4)} — grazing slit ends smear)`);
    }
  }

  // --- anim: one prim's wave; a broken reference is a silent no-op in
  // the engine, but an IMPORTED creature deserves the loud version ---
  if (c.anim != null) {
    const a = c.anim;
    if (!byId.has(a.primId)) err(`anim.primId '${a.primId}' is not a prim id`);
    if (!isVec3(a.axis) || len(a.axis) < 1e-8) err('anim.axis must be a non-zero [x, y, z]');
    if (!isNum(a.amplitude) || !isNum(a.speed)) err('anim.amplitude and anim.speed must be finite numbers');
  }

  // --- step: feet, groups, knees (the gait's structural contract) ---
  if (c.step != null) {
    const feet = c.step.feet;
    if (!Array.isArray(feet) || feet.length === 0) err('step.feet must be a non-empty array of prim ids');
    else {
      feet.forEach((id) => {
        const f = byId.get(id);
        if (!f) return err(`step foot '${id}' is not a prim id`);
        if (f.paint || f.negative || f.type !== 'capsule' || !f.b) err(`step foot '${id}' must be a SOLID capsule with a b end (b is the ground end)`);
      });
      const groups = c.step.groups;
      if (!Array.isArray(groups) || groups.length === 0) err('step.groups must be a non-empty array of index arrays');
      else {
        const seen = groups.flat();
        const valid = seen.every((i) => Number.isInteger(i) && i >= 0 && i < feet.length);
        const exact = valid && seen.length === feet.length && new Set(seen).size === feet.length;
        if (!exact) err('step.groups must partition the feet indices exactly (every foot in exactly one group)');
      }
      if (c.step.lift != null && (!isNum(c.step.lift) || c.step.lift <= 0)) err('step.lift must be > 0 when present');
      if (c.step.knees != null) {
        for (const [shinId, thighId] of Object.entries(c.step.knees)) {
          if (!feet.includes(shinId)) { err(`knees key '${shinId}' must be a declared foot`); continue; }
          const shin = byId.get(shinId);
          const thigh = byId.get(thighId);
          if (!thigh || thigh.paint || thigh.negative || thigh.type !== 'capsule' || !thigh.b) { err(`thigh '${thighId}' must be a SOLID capsule`); continue; }
          if (!shin || !shin.b) continue; // already reported by the foot rule
          const gap = len(sub(thigh.b, shin.a));
          if (gap !== 0) err(`knee '${shinId}': thigh.b must equal shin.a EXACTLY (gap ${gap.toExponential(1)} — thigh and shin write one shared point)`);
          // The authored pole: the rest knee's offset off the hip-foot line
          // IS the bend direction — a straight rest leg declares none.
          const H = thigh.a;
          const Kn = thigh.b;
          const F = shin.b;
          const L1 = len(sub(Kn, H));
          const L2 = len(sub(F, Kn));
          const hf = sub(F, H);
          const hfLen = Math.max(len(hf), 1e-8);
          const u = [hf[0] / hfLen, hf[1] / hfLen, hf[2] / hfLen];
          const off = sub(Kn, H);
          const along = dot(off, u);
          const perp = len(sub(off, [u[0] * along, u[1] * along, u[2] * along]));
          if (perp < 0.02) err(`knee '${shinId}': rest bend ${perp.toFixed(3)} < 0.02 off the hip-foot line (the authored pole — a straight rest leg has no declared fold direction)`);
          const reach = hfLen / Math.max(L1 + L2, 1e-8);
          if (!(reach < KNEE_STRAIGHT_FRAC - 0.015)) err(`knee '${shinId}': rest reach ${reach.toFixed(3)} starts at the straight lock (keep under ${(KNEE_STRAIGHT_FRAC - 0.015).toFixed(3)})`);
          // The CAPLESS VALIDITY BOUNDARY (A5.2, executable at rest):
          // knee ends carry no caps, so a knee that exits the skin shows
          // a hole. The knee point must sit inside some OTHER solid
          // (the body) by >= 0.01; the through-the-walk version stays a
          // suite sim probe for the authored cast.
          const others = solids.filter((p) => p !== thigh && p !== shin);
          const cover = others.length ? Math.min(...others.map((p) => sdPrim(Kn, p))) : 1;
          if (!(cover < -0.01)) err(`knee '${shinId}' exits the skin at rest (sd ${cover.toFixed(3)} — capless knee ends need the body to cover them)`);
        }
      }
    }
  }

  // --- hop / hover / blink / body-level fields ---
  if (c.hop != null && (typeof c.hop !== 'object' || Array.isArray(c.hop))) err('hop must be an object (empty = all config defaults)');
  if (c.hover != null) {
    const h = c.hover;
    if (!isNum(h.height) || h.height <= 0 || !isNum(h.amp) || h.amp < 0 || !isNum(h.speed) || h.speed <= 0) {
      err('hover must be { height > 0, amp >= 0, speed > 0 }');
    }
    // A floater neither walks nor jumps: hover owns the rig's vertical.
    if (c.step != null || c.hop != null) err('hover excludes step and hop (one system owns the rig)');
  }
  if (c.blink != null) {
    if (!Array.isArray(c.blink.eyes)) err('blink.eyes must be an array of prim ids');
    else {
      for (const id of c.blink.eyes) {
        const p = byId.get(id);
        if (!p || p.negative) err(`blink eye '${id}' must be a non-negative prim (decal or solid — both blink)`);
      }
    }
  }
  if (c.inflate != null && (!isNum(c.inflate) || c.inflate < 0)) err('inflate must be a non-negative number');
  if (c.breath != null) {
    if (!isNum(c.breath.amplitude) || c.breath.amplitude < 0 || !isNum(c.breath.speed) || c.breath.speed <= 0) {
      err('breath must be { amplitude >= 0, speed > 0 }');
    }
  }
  if (c.idle != null) {
    const period = c.idle.period;
    const duration = c.idle.duration;
    const ramp = c.idle.ramp ?? IDLE_RAMP;
    if (!isNum(period) || !isNum(duration) || !isNum(ramp) || !(duration > 0 && period > duration && duration >= 2 * ramp)) {
      err('idle override must satisfy 0 < 2*ramp <= duration < period');
    }
  }

  // --- breath peak vs the thinnest solid (the ballooning boundary): the
  // skin rides inflate + amplitude above EVERY solid at peak — past the
  // thinnest radius, thin parts drown (Shelby's bob lesson, generalized) ---
  const peak = (c.inflate ?? 0) + (c.breath?.amplitude ?? 0);
  if (solids.length && peak > 0) {
    const minR = Math.min(...solids.map((p) => p.r));
    if (!(peak < minR)) err(`breath peak ${peak.toFixed(3)} reaches the thinnest solid r ${minR} (the skin would balloon past it)`);
  }

  // --- ball-eye dilate boundary (MEASURED, suite-established): a constant
  // dilate compresses small-feature contrast; solid eyeballs are only
  // valid where peak dilate <= r/3 — past it, author flat decals ---
  for (const eb of solids.filter((p) => p.id.startsWith('eyeball_'))) {
    if (!(peak <= eb.r / 3 + 1e-9)) err(`ball eye '${eb.id}' violates the dilate boundary (peak ${peak.toFixed(3)} > r/3 = ${(eb.r / 3).toFixed(3)} — use flat sclera+pupil decals instead)`);
  }

  // --- pupil/sclera layering (the paint-order rule; the disc-fit trig
  // stays suite-only — aesthetic tier, measured on the authored cast) ---
  for (const pupil of c.prims.filter((p) => p.paint && p.id.startsWith('pupil_'))) {
    const side = pupil.id.slice('pupil_'.length);
    const si = c.prims.findIndex((p) => p.id === 'sclera_' + side);
    const pi = c.prims.indexOf(pupil);
    if (si < 0 || !c.prims[si].paint) err(`'${pupil.id}' needs a paint 'sclera_${side}' partner`);
    else if (pi < si) err(`'${pupil.id}' must come AFTER 'sclera_${side}' (decals composite in registry order — later wins)`);
  }

  // --- warnings: the shared stage (one global camera serves everyone).
  // Hover-aware: a floater's DISPLAYED extent is rest + height +- amp —
  // rest-only bounds would pass a creature that hovers into the camera
  // ceiling or dips its tendrils through the stage. ---
  const hoverLift = c.hover && isNum(c.hover.height) ? c.hover.height : 0;
  const hoverAmp = c.hover && isNum(c.hover.amp) ? c.hover.amp : 0;
  for (const s of solids) {
    const pts = s.b ? [s.a, s.b] : [s.a];
    for (const pt of pts) {
      if (
        Math.abs(pt[0]) + s.r > 1.3 + 1e-9 ||
        pt[1] + s.r + hoverLift + hoverAmp > 1.7 + 1e-9 ||
        pt[1] - s.r + hoverLift - hoverAmp < -0.05
      ) {
        warnings.push(`'${s.id}' may exceed the shared stage (fit within x -1.3..1.3, ground y=0, top y < 1.7${c.hover ? ', displayed at hover height' : ''})`);
        break;
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
