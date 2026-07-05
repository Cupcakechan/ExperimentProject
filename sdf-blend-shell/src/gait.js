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
import { STEP_TRIGGER, STEP_TIME, STEP_LIFT, STEP_LEAD_TIME, STRETCH_MIN, STRETCH_MAX, KNEE_STRAIGHT_FRAC, KNEE_MIN_GAP } from './config.js';

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

// Pure (suite-probed): map segment a0->b0 onto a1->b1 — aimStretch about
// a0 toward a translated target, then carry a0 onto a1. Used for SHINS,
// whose hip end (the knee) moves every frame; by IK construction the
// length ratio is 1, so in practice this is rotation + translation.
const _segTmp = new THREE.Vector3();
const _segT = new THREE.Matrix4();
export function segmentMatrix(a0, b0, a1, b1, out = new THREE.Matrix4()) {
  _segTmp.copy(b1).sub(a1).add(a0); // b1 as seen from a0
  aimStretchMatrix(a0, b0, _segTmp, out);
  _segT.makeTranslation(a1.x - a0.x, a1.y - a0.y, a1.z - a0.z);
  return out.premultiply(_segT);
}

// Pure (suite-probed): two-bone IK. Places the knee at distance L1 from
// the hip H and L2 from the foot F (law of cosines along the hip-foot
// line, height off it), bending toward the POLE direction — which comes
// from the REST pose's knee offset, so the leg always folds the way it
// was authored. The caller guarantees |F - H| is inside the reachable
// annulus (the reach clamp).
const _u = new THREE.Vector3();
const _perp = new THREE.Vector3();
export function solveKnee(H, F, L1, L2, pole, out = new THREE.Vector3()) {
  _u.copy(F).sub(H);
  const d = _u.length();
  if (d < 1e-8) return out.copy(H); // degenerate: foot at the hip
  _u.divideScalar(d);
  const a1 = (d * d + L1 * L1 - L2 * L2) / (2 * d);
  const h = Math.sqrt(Math.max(L1 * L1 - a1 * a1, 0));
  _perp.copy(pole).addScaledVector(_u, -pole.dot(_u));
  if (_perp.lengthSq() < 1e-12) {
    // Pole parallel to the leg (should not happen with an authored rest
    // bend) — any perpendicular beats a NaN.
    _perp.set(_u.y, -_u.x, 0);
    if (_perp.lengthSq() < 1e-12) _perp.set(0, -_u.z, _u.y);
  }
  _perp.normalize();
  return out.copy(H).addScaledVector(_u, a1).addScaledVector(_perp, h);
}

// Scratch — reused every frame, zero per-frame allocation.
const _rig = new THREE.Matrix4();
const _rigInv = new THREE.Matrix4();
const _home = new THREE.Vector3();
const _foot = new THREE.Vector3();
const _local = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _mat = new THREE.Matrix4();
const _knee = new THREE.Vector3();

export function createGait(creature) {
  if (!creature.step) return null; // creatures without feet just slide (by design)

  const feet = creature.step.feet.map((id, i) => {
    const idx = creature.prims.findIndex((p) => p.id === id);
    const prim = creature.prims[idx];
    const f = {
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
      knee: null, // two-segment chain, resolved below when declared
    };
    // A5: an entry in step.knees (foot id -> thigh id) upgrades this leg
    // to two segments: the foot prim becomes the SHIN (knee->foot), the
    // thigh runs hip->knee. The bend direction is the REST knee's offset
    // off the hip-foot line — authored intent, no pole field. Missing or
    // bad thigh id -> single-segment fallback (graceful).
    const thighId = creature.step.knees?.[id];
    if (thighId) {
      const tIdx = creature.prims.findIndex((p) => p.id === thighId && !p.paint && !p.negative && p.b);
      if (tIdx >= 0) {
        const tPrim = creature.prims[tIdx];
        const H0 = new THREE.Vector3(...tPrim.a);
        const knee0 = new THREE.Vector3(...tPrim.b);
        const L1 = knee0.distanceTo(H0);
        const restU = f.b0.clone().sub(H0).normalize();
        const pole = knee0.clone().sub(H0);
        pole.addScaledVector(restU, -pole.dot(restU)); // perpendicular part only
        if (L1 > 1e-8 && pole.lengthSq() > 1e-12) {
          f.knee = { idx: tIdx, prim: tPrim, H0, knee0, L1, pole: pole.normalize() };
        }
      }
    }
    return f;
  });

  // A5.1: per-creature step lift. STEP_LIFT 0.09 compresses the hip-foot
  // distance to 69% of rest mid-swing, folding knees to 84 deg — where
  // the ink cusps (the measured knee-seam mechanism). Kneed walkers
  // override it in data; creatures without knees keep the springy default.
  const stepLift = creature.step.lift ?? STEP_LIFT;

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
          f.anchor.y = f.restY + stepLift * Math.sin(Math.PI * t);
          if (t >= 1) {
            f.anchor.y = f.restY;
            f.swingT = -1;
          }
        }

        // Pin: world anchor -> creature space, then leg-kind dispatch.
        _local.copy(f.anchor).applyMatrix4(_rigInv);

        if (f.knee) {
          // TWO SEGMENTS: clamp the pin to the reachable annulus (a knee
          // never locks straight — STRAIGHT_FRAC — and never folds past
          // MIN_GAP of |L1 - L2|; beyond either, the pin SLIPS along the
          // hip-foot ray, the same pattern as the stretch clamp), then
          // solve the knee and write BOTH prims through the lockstep path.
          const k = f.knee;
          _dir.subVectors(_local, k.H0);
          const L = _dir.length();
          if (L > 1e-8) {
            const dMax = (k.L1 + f.len0) * KNEE_STRAIGHT_FRAC;
            const dMin = Math.max(Math.abs(k.L1 - f.len0) * KNEE_MIN_GAP, 0.02);
            const Lc = Math.min(Math.max(L, dMin), dMax);
            if (Lc !== L) _local.copy(k.H0).addScaledVector(_dir.divideScalar(L), Lc);
          }
          solveKnee(k.H0, _local, k.L1, f.len0, k.pole, _knee);
          aimStretchMatrix(k.H0, k.knee0, _knee, _mat); // thigh: pure rotation (|K-H| = L1)
          for (const m of materials) {
            setPrimTransform(m, k.idx, k.prim, _mat);
          }
          segmentMatrix(k.knee0, f.b0, _knee, _local, _mat); // shin: knee->foot, both ends placed
          for (const m of materials) {
            setPrimTransform(m, f.idx, f.prim, _mat);
          }
        } else {
          // SINGLE SEGMENT (the proven path): stretch clamp + aim-stretch.
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
      }
    },
  };
}
