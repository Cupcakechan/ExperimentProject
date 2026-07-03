// ============================================================
// gait.js — stage 3: reactive foot stepping.
//
// Each foot has a HOME (its rest-pose spot, carried around by the
// roaming body) and an ANCHOR (where it is actually planted, in
// WORLD space). A planted foot stays put while the body moves
// over it; when its home drifts past STEP_TRIGGER — and its phase
// group has the turn — it swings along a lifted arc to a target
// just AHEAD of home. Only one group swings at a time, so
// quadrupeds trot on diagonal pairs and bipeds alternate, purely
// from data.
//
// The leg prim connects hip to planted foot via an AIM-AND-STRETCH
// affine: hip (a) stays rigid with the body, foot (b) pins to the
// anchor, the capsule re-aims and stretches along its own axis
// (cross-section preserved). Written through anim.js's
// setPrimTransform, so mesh and SDF can never disagree.
// ============================================================

import * as THREE from 'three';
import { setPrimTransform } from './anim.js';
import { STEP_TRIGGER, STEP_TIME, STEP_LIFT, STEP_LEAD_TIME, STRETCH_MIN, STRETCH_MAX } from './config.js';

// Pure (suite-probed): the affine that maps the rest segment a0->b0 onto
// a0->b1 — rotate the rest direction onto the new one and scale along the
// REST axis by the length ratio, pivoting at a0. The hip is invariant and
// the cross-section is untouched (scale happens along the axis only).
export function aimStretchMatrix(a0, b0, b1, out = new THREE.Matrix4()) {
  const d0 = new THREE.Vector3().subVectors(b0, a0);
  const len0 = d0.length();
  const d1 = new THREE.Vector3().subVectors(b1, a0);
  const len1 = d1.length();
  if (len0 < 1e-8 || len1 < 1e-8) return out.identity(); // degenerate: leave at rest

  const dir0 = d0.clone().divideScalar(len0);
  const dir1 = d1.clone().divideScalar(len1);
  const s = len1 / len0;

  // Scale along dir0: S = I + (s - 1) * dir0 dir0^T
  const k = s - 1;
  const { x, y, z } = dir0;
  const S = new THREE.Matrix4().set(
    1 + k * x * x, k * x * y, k * x * z, 0,
    k * y * x, 1 + k * y * y, k * y * z, 0,
    k * z * x, k * z * y, 1 + k * z * z, 0,
    0, 0, 0, 1
  );
  const R = new THREE.Matrix4().makeRotationFromQuaternion(
    new THREE.Quaternion().setFromUnitVectors(dir0, dir1)
  );
  const toOrigin = new THREE.Matrix4().makeTranslation(-a0.x, -a0.y, -a0.z);
  const back = new THREE.Matrix4().makeTranslation(a0.x, a0.y, a0.z);
  return out.copy(back).multiply(R).multiply(S).multiply(toOrigin);
}

// Scratch — reused every frame, zero per-frame allocation.
const _rig = new THREE.Matrix4();
const _rigInv = new THREE.Matrix4();
const _home = new THREE.Vector3();
const _foot = new THREE.Vector3();
const _local = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _mat = new THREE.Matrix4();

export function createGait(creature) {
  if (!creature.step) return null; // creatures without feet just slide (by design)

  const feet = creature.step.feet.map((id, i) => {
    const idx = creature.prims.findIndex((p) => p.id === id);
    const prim = creature.prims[idx];
    return {
      idx,
      prim,
      group: creature.step.groups.findIndex((g) => g.includes(i)),
      a0: new THREE.Vector3(...prim.a),
      b0: new THREE.Vector3(...(prim.b ?? prim.a)),
      len0: new THREE.Vector3(...(prim.b ?? prim.a)).distanceTo(new THREE.Vector3(...prim.a)),
      restY: prim.b[1], // planted feet live at their rest height, on the ground
      anchor: new THREE.Vector3(), // WORLD
      from: new THREE.Vector3(), // swing start (world)
      swingT: -1, // -1 = planted; 0..1 = swinging
    };
  });

  let initialized = false;
  let prevX = 0;
  let prevZ = 0;

  return {
    feet, // exposed for the suite's gait simulation probes
    // pose: { x, y, heading } (the rig transform); materials: [skin, ink].
    update(dt, pose, materials) {
      _rig.makeRotationY(pose.heading);
      _rig.setPosition(pose.x, pose.y, pose.z ?? 0);
      // pose is {x, y(bob), z, heading}
      _rigInv.copy(_rig).invert();

      // Body velocity (XZ) for the step lead — from position deltas.
      const vx = dt > 0 ? (pose.x - prevX) / dt : 0;
      const vz = dt > 0 ? (pose.z - prevZ) / dt : 0;
      prevX = pose.x;
      prevZ = pose.z;

      if (!initialized) {
        initialized = true;
        for (const f of feet) {
          f.anchor.copy(f.b0).applyMatrix4(_rig);
          f.anchor.y = f.restY; // plant on the ground, not on the bobbed body
        }
      }

      // LIVE gate, not a snapshot: the first foot to start swinging this
      // frame must claim the turn immediately, or a foot from the OTHER
      // group launches in the same loop pass (measured: 2 groups airborne
      // at once — a gallop glitch, not a trot).
      let swingingGroup = feet.find((f) => f.swingT >= 0)?.group ?? -1;

      for (const f of feet) {
        // Home: where this foot's rest spot currently is, in the world.
        _home.copy(f.b0).applyMatrix4(_rig);
        _home.y = f.restY;

        if (f.swingT < 0) {
          // PLANTED: step when home drifts too far AND our group may swing.
          const drift = Math.hypot(_home.x - f.anchor.x, _home.z - f.anchor.z);
          const mays = swingingGroup === -1 || swingingGroup === f.group;
          if (drift > STEP_TRIGGER && mays) {
            f.swingT = 0;
            f.from.copy(f.anchor);
            swingingGroup = f.group; // claim the turn NOW (see note above)
          }
        }

        if (f.swingT >= 0) {
          // SWINGING: arc from where we lifted toward a spot AHEAD of home
          // (retargeted every frame so turns land accurately).
          f.swingT = Math.min(f.swingT + dt / STEP_TIME, 1);
          const t = f.swingT;
          const tx = _home.x + vx * STEP_LEAD_TIME;
          const tz = _home.z + vz * STEP_LEAD_TIME;
          f.anchor.x = f.from.x + (tx - f.from.x) * t;
          f.anchor.z = f.from.z + (tz - f.from.z) * t;
          f.anchor.y = f.restY + STEP_LIFT * Math.sin(Math.PI * t);
          if (t >= 1) {
            f.anchor.y = f.restY;
            f.swingT = -1;
          }
        }

        // Pin: world anchor -> creature space -> aim-and-stretch the leg,
        // through the SDF-lockstep write path, on BOTH draws.
        _local.copy(f.anchor).applyMatrix4(_rigInv);

        // Stretch clamp: beyond the band, the pin SLIPS along the leg axis
        // rather than crumpling the leg (measured: 0.18x on horizontal
        // feet when the hip walks over a planted toe).
        _dir.subVectors(_local, f.a0);
        const L = _dir.length();
        if (L > 1e-8) {
          const Lc = Math.min(Math.max(L, f.len0 * STRETCH_MIN), f.len0 * STRETCH_MAX);
          if (Lc !== L) _local.copy(f.a0).addScaledVector(_dir.divideScalar(L), Lc);
        }
        aimStretchMatrix(f.a0, f.b0, _local, _mat);
        for (const m of materials) {
          setPrimTransform(m, f.idx, f.prim, _mat);
        }
      }
    },
  };
}
