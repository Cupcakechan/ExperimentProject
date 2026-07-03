// ============================================================
// roam.js — root motion: a smooth, DETERMINISTIC wander.
// Heading integrates a sum-of-sines turn rate (no RNG — same
// path every run, per the seeded-generation convention), plus a
// steering term that bends the creature back toward center once
// it drifts past the soft radius. Creatures face -X in local
// space, so at heading h the world facing is (-cos h, 0, sin h),
// and rig.rotation.y = h aligns the face with the motion.
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
} from './config.js';

// Shortest signed angle from a to b, in (-PI, PI] — steering must turn the
// short way around or the creature pirouettes at the boundary.
function angleDiff(a, b) {
  return ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
}

export function createRoam() {
  let x = 0;
  let z = 0;
  let h = 0;
  let t = 0;

  return {
    reset() {
      x = 0;
      z = 0;
      h = 0;
      t = 0;
    },
    update(dt) {
      t += dt;

      // Wander: bounded, smooth, deterministic turn rate.
      let rate =
        ROAM_TURN_A * Math.sin(t * ROAM_TURN_W1) +
        ROAM_TURN_B * Math.sin(t * ROAM_TURN_W2 + ROAM_TURN_PHASE);

      // Boundary steering: proportional to how far past the soft radius we
      // are, toward the heading whose facing points at the center.
      const r = Math.hypot(x, z);
      if (r > ROAM_SOFT_RADIUS) {
        const hToCenter = Math.atan2(-z, x); // facing (-cos h, sin h) = (-x, -z)/r
        rate += ROAM_STEER_GAIN * (r - ROAM_SOFT_RADIUS) * angleDiff(h, hToCenter);
      }

      h += rate * dt;
      x += -Math.cos(h) * ROAM_SPEED * dt;
      z += Math.sin(h) * ROAM_SPEED * dt;
      return { x, z, heading: h };
    },
  };
}
