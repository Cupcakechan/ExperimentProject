// secondOrder.js — a second-order spring-damper ("second order dynamics"):
// the de-stiffening primitive from the animation-principles research pass.
// A first-order low-pass has NO velocity memory — it moves straight at the
// target and reverses instantly, which reads stiff/robotic. This system
// carries velocity, so it overshoots and settles (follow-through), lags
// naturally when chained (overlapping action), eases in and out of every
// reversal (slow in / slow out), and can even wind up backward before
// moving (anticipation, r < 0). THREE-free on purpose: pure math, usable
// anywhere (protos, gait, a worker) and exactly probeable by the suite.
//
// Parameters (the f / zeta / r formulation, t3ssel8r):
//   f    natural frequency in Hz — how fast it responds
//   zeta damping: 1 = critical (fastest, no overshoot); < 1 overshoots
//        then settles (the "spring" look); > 1 sluggish
//   r    initial response: 1 tracks immediately; > 1 overreacts;
//        NEGATIVE winds up in the opposite direction first (anticipation)
// Constants: k1 = zeta/(pi f), k2 = 1/(2 pi f)^2, k3 = r zeta/(2 pi f)
// (equivalently k1 = 2 zeta/w, k2 = 1/w^2, k3 = r zeta/w with w = 2 pi f).
//
// Integration is semi-implicit Euler with a k2 stability clamp
// (max(k2, dt^2/2 + dt*k1/2, dt*k1)) so an undersampled stiff spring
// degrades gracefully instead of exploding. Update cost: a handful of
// FLOPs — thousands of springs cost less than one Surface Nets cell.
//
// Pause-safety contract (the absolute-from-rest law's corollary): the
// spring only moves while update() is called with dt > 0; with a frozen
// target it settles to that constant and stays. Callers keep targets
// phase- or rest-derived so a paused rig holds a static pose.

export function createSecondOrder(f, zeta, r, x0 = 0) {
  const k1 = zeta / (Math.PI * f);
  const k2 = 1 / ((2 * Math.PI * f) * (2 * Math.PI * f));
  const k3 = (r * zeta) / (2 * Math.PI * f);
  let xp = x0; // previous input (for input velocity)
  let y = x0;  // output position
  let yd = 0;  // output velocity
  return {
    update(x, dt) {
      if (!(dt > 0)) return y; // dt <= 0 / NaN: hold (pause-safe)
      const xd = (x - xp) / dt;
      xp = x;
      const k2s = Math.max(k2, (dt * dt) / 2 + (dt * k1) / 2, dt * k1);
      y = y + dt * yd;
      yd = yd + (dt * (x + k3 * xd - y - k1 * yd)) / k2s;
      return y;
    },
    reset(x = x0) { xp = x; y = x; yd = 0; },
    get value() { return y; },
    get velocity() { return yd; },
  };
}
