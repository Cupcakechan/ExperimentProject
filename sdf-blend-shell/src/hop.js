// ============================================================
// hop.js — roadmap A1: the hop state machine.
//
// The LOGICAL/DISPLAYED split: roam keeps moving a continuous
// logical point (separation, boundary steering, and what other
// creatures see all stay untouched), while this module renders
// the body BURSTING between points on that logical path:
//
//   PAUSE --drift > trigger--> CROUCH --> AIR --> LAND --> PAUSE
//
// Displacement is slaved to logical drift, so average speed
// self-regulates to ROAM_SPEED with no tuning coupling. The
// displayed body lags the logical point by at most ~trigger plus
// a crouch's worth of drift — well inside ROAM_SEP_RADIUS slack.
//
// The vertical arc is CONTINUOUS end to end:
//   y(u) = -dip + (height + dip) * sin(PI * u)
// launches FROM the crouch depth and lands back AT it (LAND then
// eases the dip out) — no teleport frame between states, and the
// peak equals height exactly at u = 0.5 (hand-computable anchor).
//
// Feet: grounded states keep both anchors WORLD-FIXED (the rig
// sinking in CROUCH compresses the legs through the same
// aim-stretch pins gait uses); AIR releases both anchors to a
// TUCKED offset carried by the rig; LAND plants both together.
// All writes go through anim.js's setPrimTransform lockstep.
// ============================================================

import * as THREE from 'three';
import { setPrimTransform } from './anim.js';
import { aimStretchMatrix } from './gait.js';
import { squashEndpoints } from './feel.js';
import {
  HOP_TRIGGER,
  HOP_CROUCH_TIME,
  HOP_AIR_TIME,
  HOP_LAND_TIME,
  HOP_REST_MIN,
  HOP_HEIGHT,
  HOP_CROUCH_DIP,
  HOP_LEAD_TIME,
  HOP_FOOT_TUCK,
  SQUASH_AMOUNT,
  STRETCH_AMOUNT,
  STRETCH_MIN,
  STRETCH_MAX,
  MOUTH_OPEN_ANGLE,
  MOUTH_OPEN_PUSH,
} from './config.js';

// Pure (suite-anchored): the continuous hop arc. u in [0,1].
export function hopArcY(u, height, dip) {
  return -dip + (height + dip) * Math.sin(Math.PI * u);
}

// Scratch — reused every frame, zero per-frame allocation.
const _rig = new THREE.Matrix4();
const _rigInv = new THREE.Matrix4();
const _home = new THREE.Vector3();
const _local = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _mat = new THREE.Matrix4();
const _jaw = new THREE.Matrix4();
const _jawRot = new THREE.Matrix4();
const _jawBack = new THREE.Matrix4();

export function createHop(creature) {
  if (!creature.hop) return null; // most creatures walk or slide
  const h = creature.hop;
  // Per-creature overrides with config defaults — a missing field must
  // never change behavior for the plain `hop: {}` case.
  const P = {
    trigger: h.trigger ?? HOP_TRIGGER,
    crouchTime: h.crouchTime ?? HOP_CROUCH_TIME,
    airTime: h.airTime ?? HOP_AIR_TIME,
    landTime: h.landTime ?? HOP_LAND_TIME,
    restMin: h.restMin ?? HOP_REST_MIN,
    height: h.height ?? HOP_HEIGHT,
    dip: h.dip ?? HOP_CROUCH_DIP,
    leadTime: h.leadTime ?? HOP_LEAD_TIME,
    footTuck: h.footTuck ?? HOP_FOOT_TUCK,
    squash: h.squash ?? SQUASH_AMOUNT,
    stretch: h.stretch ?? STRETCH_AMOUNT,
  };

  // Squash & stretch target: a SPHERE prim (a == b — endpoint deformation
  // would overwrite a capsule's own segment). Missing or non-sphere ->
  // -1: the hop works without juice rather than crashing (graceful).
  const sIdx = creature.prims.findIndex(
    (p) => p.id === (h.squashPrim ?? 'body') && !p.paint && !p.negative && (p.b === undefined)
  );
  const sPrim = sIdx >= 0 ? creature.prims[sIdx] : null;

  // Jaw-drop target (A4 stage 2; R3: the mouth is a PAINT DECAL now).
  // "Open" is a ROTATION about the body center — sd-NEUTRAL on the
  // spherical body, so rotating cannot graze or sink the decal — plus a
  // small outward PUSH that makes the open mouth POKE harder (rest sd
  // -0.024, full open -0.012: the whole arc stays inside the decal band
  // -r < sd < 0, suite-walked live over every simulated frame). The
  // mechanism is prim-agnostic (setPrimTransform moves uA/uB; the paint
  // phase reads them) — only this lookup knew the mouth was a carve.
  // negative kept as an alternative: a future carved mouth still drops.
  // Needs the squash prim as the rotation center; missing either -> -1,
  // hop works without the mouth (graceful).
  const mIdx = sPrim
    ? creature.prims.findIndex((p) => p.id === (h.mouthPrim ?? 'mouth') && (p.paint || p.negative))
    : -1;
  const mPrim = mIdx >= 0 ? creature.prims[mIdx] : null;
  const _mCenter = sPrim ? new THREE.Vector3(...sPrim.a) : null;
  const _mOut = mPrim
    ? new THREE.Vector3(...mPrim.a)
        .add(new THREE.Vector3(...(mPrim.b ?? mPrim.a)))
        .multiplyScalar(0.5)
        .sub(_mCenter)
        .normalize()
    : null;

  // The hop OWNS the feet, but the foot DEFINITIONS are the same step
  // data the gait uses — one source of truth for which prims are legs.
  const feet = creature.step.feet.map((id) => {
    const idx = creature.prims.findIndex((p) => p.id === id);
    const prim = creature.prims[idx];
    return {
      idx,
      prim,
      a0: new THREE.Vector3(...prim.a),
      b0: new THREE.Vector3(...(prim.b ?? prim.a)),
      len0: new THREE.Vector3(...(prim.b ?? prim.a)).distanceTo(new THREE.Vector3(...prim.a)),
      restY: prim.b[1],
      anchor: new THREE.Vector3(), // WORLD
    };
  });

  let state = 'PAUSE';
  let tState = 0;
  let dx = 0; // displayed XZ (the burst position)
  let dz = 0;
  let y = 0;
  const from = { x: 0, z: 0 }; // air lerp endpoints, set at launch
  const to = { x: 0, z: 0 };
  let prevLx = 0; // logical deltas -> logical velocity for the lead
  let prevLz = 0;
  let initialized = false;

  function plantFeet(heading) {
    _rig.makeRotationY(heading);
    _rig.setPosition(dx, 0, dz);
    for (const f of feet) {
      f.anchor.copy(f.b0).applyMatrix4(_rig);
      f.anchor.y = f.restY; // on the ground, not on the crouched body
    }
  }

  return {
    feet, // exposed for the suite's hop simulation probes
    current: () => state,
    // logical: roam's continuous pose; materials: [skin, ink].
    // Returns the DISPLAYED pose for the rig.
    update(dt, logical, materials) {
      tState += dt;
      const vx = dt > 0 ? (logical.x - prevLx) / dt : 0;
      const vz = dt > 0 ? (logical.z - prevLz) / dt : 0;
      prevLx = logical.x;
      prevLz = logical.z;

      if (!initialized) {
        initialized = true;
        dx = logical.x;
        dz = logical.z;
        plantFeet(logical.heading);
      }

      if (state === 'PAUSE') {
        y = 0;
        const drift = Math.hypot(logical.x - dx, logical.z - dz);
        if (tState >= P.restMin && drift > P.trigger) {
          state = 'CROUCH';
          tState = 0;
        }
      } else if (state === 'CROUCH') {
        // Ease into the dip (sin ramp: zero velocity at the bottom).
        y = -P.dip * Math.sin((Math.PI / 2) * Math.min(tState / P.crouchTime, 1));
        if (tState >= P.crouchTime) {
          state = 'AIR';
          tState = 0;
          from.x = dx;
          from.z = dz;
          // Target: where the logical point will roughly BE at landing,
          // plus a lead — retargeting mid-air would read as steering.
          to.x = logical.x + vx * (P.airTime + P.leadTime);
          to.z = logical.z + vz * (P.airTime + P.leadTime);
        }
      } else if (state === 'AIR') {
        const u = Math.min(tState / P.airTime, 1);
        dx = from.x + (to.x - from.x) * u;
        dz = from.z + (to.z - from.z) * u;
        y = hopArcY(u, P.height, P.dip);
        if (u >= 1) {
          state = 'LAND';
          tState = 0;
          dx = to.x;
          dz = to.z;
          plantFeet(logical.heading); // both feet plant together
        }
      } else {
        // LAND: ease the crouch depth back out to zero.
        const u = Math.min(tState / P.landTime, 1);
        y = -P.dip * (1 - Math.sin((Math.PI / 2) * u));
        if (u >= 1) {
          state = 'PAUSE';
          tState = 0;
          y = 0;
        }
      }

      // --- feet: pin through the SDF-lockstep path on BOTH draws ---
      _rig.makeRotationY(logical.heading);
      _rig.setPosition(dx, y, dz);
      _rigInv.copy(_rig).invert();

      for (const f of feet) {
        if (state === 'AIR') {
          // Tucked: the anchor rides the rig at the rest spot pulled UP
          // toward the body — legs visibly gather for the jump.
          _home.copy(f.b0).applyMatrix4(_rig);
          f.anchor.copy(_home);
          f.anchor.y = _home.y + P.footTuck;
        }
        // Grounded states: the anchor stays exactly where it was planted;
        // the rig sinking in CROUCH/LAND compresses the legs through the
        // pin — squash for free.
        _local.copy(f.anchor).applyMatrix4(_rigInv);

        // Same stretch clamp as gait.js (see the pinned-length lesson):
        // past the band the pin SLIPS along the leg axis, never crumples.
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

      // --- squash & stretch (A3.2): shape follows the state ---
      // CROUCH loads a squash with the dip's ease; the CROUCH->AIR flip
      // to full stretch is a DELIBERATE one-frame shape pop (the classic
      // anticipation release), as is the stretch->squash impact at LAND.
      // In AIR, stretch follows |vertical speed|: full at launch and
      // touchdown, EXACTLY zero at the apex.
      if (sPrim) {
        let s = 0;
        if (state === 'CROUCH') {
          s = P.squash * Math.sin((Math.PI / 2) * Math.min(tState / P.crouchTime, 1));
        } else if (state === 'AIR') {
          s = -P.stretch * Math.abs(Math.cos(Math.PI * Math.min(tState / P.airTime, 1)));
        } else if (state === 'LAND') {
          s = P.squash * (1 - Math.sin((Math.PI / 2) * Math.min(tState / P.landTime, 1)));
        }
        // ABSOLUTE from rest every frame (the drift rule) — s = 0 restores
        // the exact rest sphere bit-for-bit. uPrimMat stays identity: the
        // mesh starts at the rest sphere and the SNAP absorbs the deformed
        // field, the same way it absorbs breathing.
        const d = squashEndpoints(sPrim, s);
        for (const m of materials) {
          m.uniforms.uA.value[sIdx].set(d.a[0], d.a[1], d.a[2]);
          m.uniforms.uB.value[sIdx].set(d.b[0], d.b[1], d.b[2]);
        }
      }

      // --- jaw-drop (A4 stage 2): the mouth opens through the arc ---
      // openT = sin(pi*u) in AIR: closed at launch, widest at the apex
      // (where the stretch is zero — the two reads trade off cleanly),
      // closed again exactly at touchdown. ABSOLUTE from rest each frame
      // (openT = 0 writes the registry pose bit-for-bit).
      if (mPrim) {
        let o = 0;
        if (state === 'AIR') {
          o = Math.sin(Math.PI * Math.min(tState / P.airTime, 1));
        }
        _jaw.makeTranslation(-_mCenter.x, -_mCenter.y, -_mCenter.z);
        _jawRot.makeRotationZ(MOUTH_OPEN_ANGLE * o);
        _jawBack.makeTranslation(
          _mCenter.x + _mOut.x * MOUTH_OPEN_PUSH * o,
          _mCenter.y + _mOut.y * MOUTH_OPEN_PUSH * o,
          _mCenter.z + _mOut.z * MOUTH_OPEN_PUSH * o
        );
        _jawBack.multiply(_jawRot).multiply(_jaw);
        for (const m of materials) {
          setPrimTransform(m, mIdx, mPrim, _jawBack);
        }
      }

      return { x: dx, y, z: dz, heading: logical.heading };
    },
  };
}
