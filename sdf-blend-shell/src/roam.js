// ============================================================
// roam.js — root motion: a smooth, DETERMINISTIC wander with
// boundary steering AND neighbor separation.
// Heading integrates a sum-of-sines turn rate (no RNG — same
// paths every run); the seed offsets spawn position and wander
// phase so multiple roamers share the math without sharing the
// path. Creatures face -X locally, so at heading h the world
// facing is (-cos h, 0, sin h) and rig.rotation.y = h aligns
// the face with the motion.
// ============================================================

import {
  ROAM_SPEED,
  ROAM_SOFT_RADIUS,
  ROAM_STEER_GAIN,
  ROAM_TURN_A,
  ROAM_TURN_W1,
  ROAM_TURN_B,
  ROAM_TURN_W2,
  ROAM_TURN_PHASE,
  ROAM_SEP_RADIUS,
  ROAM_SEP_GAIN,
  ROAM_SEP_PUSH,
  ROAM_SPAWN_RADIUS,
  ROAM_HARD_RADIUS,
  IDLE_PERIOD,
  IDLE_DURATION,
  IDLE_RAMP,
  IDLE_TURN_FACTOR,
} from './config.js';

function smoothstep(a, b, x) {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

// Pure (suite-anchored): the idle speed envelope. Inside each period a
// window of `duration` ramps speed 1 -> 0 -> 1 with `ramp`-wide
// smoothstep shoulders; the multiplier is EXACTLY 0 on the window's
// plateau (a genuine stop, not a slow creep) and exactly 1 outside.
export function idleSpeedMul(t, P) {
  const u = ((t % P.period) + P.period) % P.period;
  if (u >= P.duration) return 1;
  const down = smoothstep(0, P.ramp, u);
  const up = smoothstep(P.duration - P.ramp, P.duration, u);
  return 1 - down * (1 - up);
}

// Shortest signed angle from a to b, in (-PI, PI] — steering must turn the
// short way around or the creature pirouettes at the boundary.
function angleDiff(a, b) {
  return ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
}

export function createRoam(seed = 0, total = 3, idle = {}) {
  // Per-creature idle character with config defaults (the hop/breath
  // pattern) — a missing field must never change the plain case.
  const P = {
    period: idle.period ?? IDLE_PERIOD,
    duration: idle.duration ?? IDLE_DURATION,
    ramp: idle.ramp ?? IDLE_RAMP,
  };
  let x = 0;
  let z = 0;
  let h = 0;
  let t = 0;

  function reset() {
    // Spawn on a ring, evenly spaced by seed — nobody starts inside anybody.
    // Spacing divides by the ACTOR COUNT (total), not a constant: with the
    // old hardcoded 3, seed 3 wrapped onto seed 0's exact angle — two
    // creatures spawning inside each other the moment the gallery grew.
    const spawnAngle = seed * ((2 * Math.PI) / total) + 0.7;
    x = Math.cos(spawnAngle) * ROAM_SPAWN_RADIUS;
    z = Math.sin(spawnAngle) * ROAM_SPAWN_RADIUS;
    h = spawnAngle;
    // Phase offset: same wander math, different point along it — without
    // this, every creature turns in eerie unison.
    t = seed * 7.3;
  }
  reset();

  return {
    reset,
    // others: [{x, z}] of the OTHER roamers (last frame's positions are
    // fine — one frame of lag is invisible at these speeds).
    update(dt, others = []) {
      t += dt;

      // The idle envelope (keyed to t, which is already seed-offset —
      // idles decorrelate for free). Only the WANDER turn attenuates
      // while idle (slow looking-around reads as attention); boundary
      // and separation steering below stay at FULL strength — an idle
      // creature being walked at must still defend its space.
      const mul = idleSpeedMul(t, P);

      // Wander: bounded, smooth, deterministic turn rate.
      let rate =
        (IDLE_TURN_FACTOR + (1 - IDLE_TURN_FACTOR) * mul) *
        (ROAM_TURN_A * Math.sin(t * ROAM_TURN_W1) +
          ROAM_TURN_B * Math.sin(t * ROAM_TURN_W2 + ROAM_TURN_PHASE));

      // Boundary steering: proportional to how far past the soft radius we
      // are, toward the heading whose facing points at the center.
      const r = Math.hypot(x, z);
      if (r > ROAM_SOFT_RADIUS) {
        const hToCenter = Math.atan2(-z, x); // facing (-cos h, sin h) = (-x, -z)/r
        rate += ROAM_STEER_GAIN * (r - ROAM_SOFT_RADIUS) * angleDiff(h, hToCenter);
      }

      // Separation: turn away from each neighbor inside the personal-space
      // radius, harder the deeper the intrusion (same pattern as boundary).
      for (const o of others) {
        const dx = x - o.x;
        const dz = z - o.z;
        const d = Math.hypot(dx, dz);
        if (d > 1e-6 && d < ROAM_SEP_RADIUS) {
          const hAway = Math.atan2(dz, -dx); // facing (-cos h, sin h) = away dir
          rate += ROAM_SEP_GAIN * (ROAM_SEP_RADIUS - d) * angleDiff(h, hAway);
        }
      }

      h += rate * dt;
      x += -Math.cos(h) * ROAM_SPEED * mul * dt;
      z += Math.sin(h) * ROAM_SPEED * mul * dt;

      // Positional separation: heading steering makes them TURN politely,
      // but only a direct shove GUARANTEES they never interpenetrate
      // (measured failure without it: 0.008 apart).
      for (const o of others) {
        const dx = x - o.x;
        const dz = z - o.z;
        const d = Math.hypot(dx, dz);
        if (d > 1e-6 && d < ROAM_SEP_RADIUS) {
          const push = (ROAM_SEP_PUSH * (ROAM_SEP_RADIUS - d) * dt) / d;
          x += dx * push;
          z += dz * push;
        }
      }

      // Hard boundary: steering terms can fight each other outward
      // (measured overshoot to r=3.29, past the ground disc) — clamp.
      const rOut = Math.hypot(x, z);
      if (rOut > ROAM_HARD_RADIUS) {
        const s = ROAM_HARD_RADIUS / rOut;
        x *= s;
        z *= s;
      }
      return { x, z, heading: h };
    },
  };
}
