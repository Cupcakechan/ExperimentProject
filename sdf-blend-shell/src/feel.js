// ============================================================
// feel.js — A3.1: gait feel. PURE helpers only (suite-anchored);
// main.js consumes them. This is presentation-layer math — no
// system in gait/hop/roam changes behavior because of this file.
// ============================================================

// Body lift from the ACTUAL stride: the max arc over currently
// swinging feet (gait exposes swingT: -1 planted, 0..1 swinging).
// All feet planted -> 0, so an idle walker is genuinely still —
// the old free-sine bob bounced through idles and masked breath.
// sin^2, not sin: sine's slope at its endpoints is MAXIMUM (+-PI),
// so each bump attacked at full velocity — reported as "micro
// jumps". sin^2 has ZERO slope at both ends: the body eases into
// and out of every rise, same exact peak at mid-swing.
export function stridePulse(feet) {
  let s = 0;
  for (const f of feet) {
    if (f.swingT >= 0) {
      const w = Math.sin(Math.PI * f.swingT);
      s = Math.max(s, w * w);
    }
  }
  return s;
}

// Bank angle from heading angular velocity, clamped — the clamp is the
// guard against steering spikes (separation shoves can jerk omega).
export function leanTarget(omega, gain, max) {
  return Math.min(Math.max(omega * gain, -max), max);
}

// Frame-rate-independent exponential approach (the smoothing that keeps
// wander jitter out of the body roll): k = 1 - exp(-rate*dt), so dt=0 is
// an exact identity (pause-safe) and the half-life is ln2/rate exactly.
export function approach(current, target, rate, dt) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

// Shortest signed heading delta — omega must be computed wrap-safe or a
// heading crossing PI reads as a full-circle spin (max lean spike).
export function headingDelta(a, b) {
  return ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
}

// Cartoon squash & stretch via ENDPOINT deformation (A3.2). A per-prim
// radius is isotropic — shrinking r reads as DEFLATING — but splitting a
// sphere's endpoints is anisotropic for free: along creature-space X
// (the facing axis) the shape goes wider + flatter (SQUASH, s > 0);
// along Y it goes taller (STRETCH, s < 0). r untouched, no new uniform,
// no shader change — the vertex snap absorbs the deformed field exactly
// like it absorbs breathing. SPHERE prims only (a == b): a capsule's own
// segment would be overwritten; walker squash is a future pass if the
// hop version earns it.
export function squashEndpoints(prim, s) {
  const [x, y, z] = prim.a;
  if (s > 0) return { a: [x - s, y, z], b: [x + s, y, z] };
  if (s < 0) return { a: [x, y + s, z], b: [x, y - s, z] };
  return { a: [x, y, z], b: [x, y, z] };
}
