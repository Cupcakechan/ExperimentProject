// bipedRig.js — the BIPED ANIMATION RIG: Passes A-D of the animation-
// principles track, lifted out of proto-strider-anim.js into a reusable
// module (plan-of-record item 1). This is the artifact creature-forge
// wants and what creature #10 needs to walk.
//
// What it owns (per pass, with the measured mechanism):
//   PASS A — arm swing on SECOND-ORDER SPRINGS. A low-pass has no velocity
//     memory and turns instantly at reversals (the measured stiff read);
//     the shoulder spring overshoots ~9% and settles (follow-through), and
//     the forearm spring CHASES the shoulder output so elbow lag + catch-up
//     emerge from the chain (overlapping action).
//   PASS B — gait-phase BODY MOTION from FOOT-STATE signals (no parallel
//     phase clock => structurally sync-proof through turns and speed
//     changes). d = fore-aft foot differential — a rounded STAIRCASE, flat
//     in double support. Bob rides pose.y (the gait was BUILT for a
//     rig-level bob; planted feet IK-compensate). Sway targets the FRONT
//     foot (-sign(d) saturated); the sway spring IS the phase corrector —
//     its lag lands the peak at mid-stance. One pelvis-centered matrix.
//   PASS C — counter-rotation + the moving hold. A vertical capsule torso
//     is rotationally near-invisible, so counter-rotation is carried by
//     the ARM matrices (chest-centered counter-yaw over the pelvis matrix).
//     The HEAD group gets its own stabilizer about the neck top — a
//     cancellation spring must OUT-BANDWIDTH the disturbance (f 2.2 vs the
//     ~0.9 Hz stride; f 0.8 AMPLIFIED at reversals — LESSONS 2026-07-11).
//   PASS D — footfall SQUASH & STRETCH: landings pulse a fast underdamped
//     spring compressing the torso VERTICALLY ABOUT THE PELVIS (legs keep
//     their IK) while uR fattens by 1/sqrt(lengthScale) to preserve volume
//     (measured 1.003 at peak). The spring dips ~1.3x the target on entry.
//
// CONTRACT with the caller (the proto page or a future spawn path):
//   const rig = createBipedRig(creature, sink, config?)
//     creature — prims must carry the humanoid ids: body, neck, head,
//       eyeball*/iris*, thigh_l/r, plus the foot prims (default leg_l/r)
//       and two-segment arms arm_l/fore_l, arm_r/fore_r with the elbow a
//       SHARED endpoint (arm.b === fore.a).
//     sink — the material whose uA/uB/uR the gait keeps in lockstep
//       (setPrimTransform law). The rig READS foot state from it (the
//       material IS the gait state) and WRITES the upper-body transforms
//       and squash radii back into it. One sink: reads and writes must
//       come from one coherent source. Snapshots taken off this sink
//       carry LIVE uR — squash reaches the worker (SN-into-main law).
//   Per frame, in this order (matches the proto's step()):
//     rig.updateBob(pose);            // BEFORE gait.update: reads LAST
//                                     // frame's feet, writes pose.y so the
//                                     // gait consumes the bobbed pose
//     gait.update(dt, pose, [sink]);  // external — legs + lockstep uA/uB
//     rig.update(dt);                 // AFTER: squash + sway/tilt/yaw +
//                                     // counter-rotation + head hold + arms
//   Pause-safety: update(0) recomputes from held spring state — uniforms
//   come out bit-identical (suite-pinned). Skipping both calls while
//   paused (the proto's pattern) is equally safe.
//
// Every tunable lives in the config object; the DEFAULTS ARE THE MEASURED
// VALUES (byte-behavior parity with the pre-extraction proto is trace-
// certified). Geometry anchors (pelvis/chest/neck-top, arm pivots) DERIVE
// from the creature's prims — for the v4.2 humanoid the derived values are
// float-EXACT against the old hand literals (suite-pinned) — so a C2
// archetype variant's skeleton carries its rig anchors with it. Any anchor
// can still be overridden via config.
//
// THREE dependency is DELIBERATE (Option 2, 2026-07-11): the rig composes
// THREE.Matrix4 and writes through anim.js's setPrimTransform; it never
// runs in a worker, and the suite imports THREE modules fine. THREE-free
// (Option 3) was judged rewrite-risk for zero current need.

import * as THREE from 'three';
import { setPrimTransform } from './anim.js';
import { createSecondOrder } from './secondOrder.js';

export function createBipedRig(creature, sink, config = {}) {
  const cfg = {
    // --- PASS A: arm swing ---
    swingPerUnit: 2.2,  // rad per unit of foot-forward offset (excursion ~0.15 -> ~19 deg)
    swingMax: 0.35,     // hard rail: 20 deg (clamps the APPLIED angle, not the spring state)
    shoulderF: 1.2, shoulderZ: 0.6, // Hz / damping (z 0.6 => ~9% overshoot, suite-anchored)
    foreF: 1.0, foreZ: 0.5,         // slower + looser than the shoulder => natural drag
    foreGain: 1.6,                  // scales the chain lag into readable elbow sway
    foreFlexMax: 0.30,   // forward flex clamp (17 deg)
    foreHyperMax: 0.06,  // backward clamp (3 deg): elbows do not bend backward
    // --- PASS B: body motion ---
    dNorm: 0.16,   // measured fore-aft foot excursion
    bobAmp: 0.022, // ~2.5% leg length
    swayAmp: 0.04, // ~5% leg: shift over the stance foot
    tiltAmp: 5 * Math.PI / 180, // pelvic drop toward the swing side
    yawAmp: 4 * Math.PI / 180,  // pelvic rotation, swing side forward
    dSoft: 0.10, // d saturates here: most of the stride sits at the +-0.16 extremes
    swayF: 1.2, swayZ: 0.9, // rounds the staircase AND phase-lags the peak to mid-stance
    // --- PASS C: counter-rotation + moving hold ---
    counterGain: 1.5, // net shoulder yaw = -(GAIN-1) x pelvis yaw
    headStab: 0.8,    // fraction of pelvis rotation the head undoes
    headF: 2.2, // MEASURED sweep: f0.8 AMPLIFIED at reversals (RMS 0.84, worst 1.22 — a stabilizer must out-bandwidth the ~0.9 Hz stride); f2.2 halves the motion with no amplification (RMS 0.48, worst 0.73) while the lag keeps the late-arrival read
    headZ: 0.9, // near-critical: heads do not wobble
    // --- PASS D: footfall squash & stretch ---
    squashAmp: 0.025,   // feel-tuned down twice from 0.07 (the spring dips PAST the target on entry, felt dip ~1.3x this — so ~3.3% here)
    squashPulseT: 0.09, // s the impact target holds before releasing
    squashF: 4, squashZ: 0.4, // fast + underdamped: dip, REBOUND past rest (the stretch), settle
    footAirEps: 0.005,  // a foot is "airborne" when its b.y exceeds the other's by this
    // --- prim-id contract (override for a differently-named biped) ---
    footL: 'leg_l', footR: 'leg_r',
    torsoIds: ['body', 'neck'], // shared point body.b === neck.a: one matrix
    // --- geometry anchors: null => DERIVE from the prims (see below) ---
    pelvis: null, chest: null, neckTop: null,
    ...config,
  };

  const prims = creature.prims;
  const IDX = Object.fromEntries(prims.map((p, i) => [p.id, i]));
  const iFootL = IDX[cfg.footL], iFootR = IDX[cfg.footR];

  // Derived anchors — the skeleton carries its rig anchors with it. For
  // the v4.2 humanoid every derived value is float-EXACT against the old
  // hand literals ((1.00+1.20)/2 === 1.10 in doubles; the rest are shared
  // array values), which is what made the parity trace bit-exact.
  const hipL = prims[IDX.thigh_l].a, hipR = prims[IDX.thigh_r].a;
  const bodyP = prims[IDX.body], neckP = prims[IDX.neck];
  const PELVIS = cfg.pelvis ?? [(hipL[0] + hipR[0]) / 2, (hipL[1] + hipR[1]) / 2, (hipL[2] + hipR[2]) / 2]; // rotation center: the hip line
  const CHEST = cfg.chest ?? [(bodyP.a[0] + bodyP.b[0]) / 2, (bodyP.a[1] + bodyP.b[1]) / 2, (bodyP.a[2] + bodyP.b[2]) / 2]; // counter-rotation center (mid-torso)
  const NECK_TOP = cfg.neckTop ?? neckP.b; // head-stabilizer pivot
  // Arm pivots ARE the rest joints of the arm prims (a = shoulder,
  // b = elbow; the elbow is the SHARED endpoint with the forearm).
  const SHOULDER_L = prims[IDX.arm_l].a, ELBOW_L = prims[IDX.arm_l].b;
  const SHOULDER_R = prims[IDX.arm_r].a, ELBOW_R = prims[IDX.arm_r].b;

  // --- spring + pulse state (instance-local) ---
  const armSpring = { l: createSecondOrder(cfg.shoulderF, cfg.shoulderZ, 1, 0), r: createSecondOrder(cfg.shoulderF, cfg.shoulderZ, 1, 0) };
  const foreSpring = { l: createSecondOrder(cfg.foreF, cfg.foreZ, 1, 0), r: createSecondOrder(cfg.foreF, cfg.foreZ, 1, 0) };
  const swaySpring = createSecondOrder(cfg.swayF, cfg.swayZ, 1, 0);
  const headTiltSpring = createSecondOrder(cfg.headF, cfg.headZ, 1, 0);
  const headYawSpring = createSecondOrder(cfg.headF, cfg.headZ, 1, 0);
  const squashSpring = createSecondOrder(cfg.squashF, cfg.squashZ, 1, 0);
  let squashPulse = 0;
  const footWasAir = { l: false, r: false };
  const REST_R = Object.fromEntries(cfg.torsoIds.map((id) => [id, prims[IDX[id]].r]));

  // --- matrix scratch (instance-local; _bodyM identity until the first
  //     update — frame-0 safe) ---
  const _chestM = new THREE.Matrix4();
  const _headM = new THREE.Matrix4();
  const _cR = new THREE.Matrix4(), _cT = new THREE.Matrix4();
  const _hRx = new THREE.Matrix4(), _hRy = new THREE.Matrix4(), _hT = new THREE.Matrix4();
  const _bS = new THREE.Matrix4();
  const _bodyM = new THREE.Matrix4();
  const _bRx = new THREE.Matrix4(), _bRy = new THREE.Matrix4(), _bT = new THREE.Matrix4();
  const _rot = new THREE.Matrix4();
  const _toPivot = new THREE.Matrix4();
  const _m = new THREE.Matrix4();
  const _rotE = new THREE.Matrix4();
  const _toPivotE = new THREE.Matrix4();
  const _m2 = new THREE.Matrix4();

  const HEAD_GROUP = prims.filter((p) => p.id === 'head' || p.id.startsWith('eyeball') || p.id.startsWith('iris')).map((p) => p.id);

  // Probe surface (the gait exposes `feet` for the same reason): the
  // suite's Section RIG reads these per-frame internals to pin the
  // measured behaviors. Numbers only — writing them never perturbs the
  // math. Not a caller API.
  const debug = { d: 0, bobY: 0, sway: 0, tilt: 0, yaw: 0, hT: 0, hY: 0, squash: 0, thL: 0, thR: 0, relL: 0, relR: 0 };

  // d ~ dNorm*cos(2 pi phase), so d^2 is the 2x/stride signal: HIGH at
  // mid-stance (feet passing, d ~ 0), LOW at double support (|d| max).
  // Reads LAST frame's feet; the caller runs this BEFORE gait.update so
  // the gait consumes the bobbed pose (planted feet IK-compensate).
  function updateBob(pose) {
    const uB = sink.uniforms.uB.value;
    const d = (uB[iFootL].x - uB[iFootR].x) / 2;
    pose.y = cfg.bobAmp * (1 - 2 * Math.min(1, (d / cfg.dNorm) * (d / cfg.dNorm)));
    debug.bobY = pose.y;
  }

  function updateBodyMotion(dt) {
    const uB = sink.uniforms.uB.value;
    const d = (uB[iFootL].x - uB[iFootR].x) / 2;
    // front foot = smaller x = the incoming stance: sway toward it is
    // -sign(d). The spring's lag then holds that sway through the single
    // support. Tilt drops toward the SWING side = opposite the sway
    // (Rx(+) lowers +z, so tilt takes the negated normalized sway).
    // footfall: an airborne -> planted transition of either foot pulses the squash
    for (const side of ['l', 'r']) {
      const li = side === 'l' ? iFootL : iFootR, oi = side === 'l' ? iFootR : iFootL;
      const air = uB[li].y > uB[oi].y + cfg.footAirEps;
      if (footWasAir[side] && !air) squashPulse = cfg.squashPulseT;
      footWasAir[side] = air;
    }
    squashPulse = Math.max(0, squashPulse - dt);
    const squash = squashSpring.update(squashPulse > 0 ? -cfg.squashAmp : 0, dt);
    const lenS = 1 + squash;
    const radS = 1 / Math.sqrt(Math.max(0.5, lenS)); // volume: r scales by 1/sqrt(length)
    for (const id of cfg.torsoIds) sink.uniforms.uR.value[IDX[id]] = REST_R[id] * radS;
    const swayTarget = -cfg.swayAmp * Math.max(-1, Math.min(1, d / cfg.dSoft));
    const sway = swaySpring.update(swayTarget, dt);
    const tilt = -cfg.tiltAmp * (sway / cfg.swayAmp);
    const yaw = cfg.yawAmp * Math.max(-1, Math.min(1, d / cfg.dNorm)); // Ry(-) sends +z forward; d<0 = left forward
    _bRx.makeRotationX(tilt);
    _bRy.makeRotationY(yaw);
    _bT.makeTranslation(-PELVIS[0], -PELVIS[1], -PELVIS[2]);
    _bS.makeScale(1, lenS, 1); // pelvis-anchored vertical squash (T(-P) is applied first)
    _bodyM.makeTranslation(PELVIS[0], PELVIS[1], PELVIS[2] + sway).multiply(_bRx).multiply(_bRy).multiply(_bS).multiply(_bT);
    // chest counter-yaw for the shoulder line (arms compose this one)
    _cR.makeRotationY(-cfg.counterGain * yaw);
    _cT.makeTranslation(-CHEST[0], -CHEST[1], -CHEST[2]);
    _chestM.makeTranslation(CHEST[0], CHEST[1], CHEST[2]).multiply(_cR).multiply(_cT).premultiply(_bodyM);
    // head stabilizer: spring-lagged UNDO of the pelvis rotation (moving hold)
    const hT = headTiltSpring.update(-cfg.headStab * tilt, dt);
    const hY = headYawSpring.update(-cfg.headStab * yaw, dt);
    _hRx.makeRotationX(hT);
    _hRy.makeRotationY(hY);
    _hT.makeTranslation(-NECK_TOP[0], -NECK_TOP[1], -NECK_TOP[2]);
    _headM.makeTranslation(NECK_TOP[0], NECK_TOP[1], NECK_TOP[2]).multiply(_hRx).multiply(_hRy).multiply(_hT).premultiply(_bodyM);
    for (const id of cfg.torsoIds) setPrimTransform(sink, IDX[id], prims[IDX[id]], _bodyM);
    for (const id of HEAD_GROUP) setPrimTransform(sink, IDX[id], prims[IDX[id]], _headM);
    debug.d = d; debug.sway = sway; debug.tilt = tilt; debug.yaw = yaw;
    debug.hT = hT; debug.hY = hY; debug.squash = squash;
  }

  function swingArm(armId, foreId, pivotS, pivotE, theta, rel) {
    _rot.makeRotationZ(theta);
    _toPivot.makeTranslation(-pivotS[0], -pivotS[1], -pivotS[2]);
    _m.makeTranslation(pivotS[0], pivotS[1], pivotS[2]).multiply(_rot).multiply(_toPivot);
    // forearm = shoulder transform COMPOSED with an elbow-relative rotation;
    // the rest elbow is fixed under its own pivot rotation, so the joint
    // stays exactly shared with the upper arm after both transforms.
    _rotE.makeRotationZ(rel);
    _toPivotE.makeTranslation(-pivotE[0], -pivotE[1], -pivotE[2]);
    _m2.makeTranslation(pivotE[0], pivotE[1], pivotE[2]).multiply(_rotE).multiply(_toPivotE).premultiply(_m);
    // arms ride the CHEST: swing in pelvis space, then body motion + counter-yaw
    _m.premultiply(_chestM);
    _m2.premultiply(_chestM);
    setPrimTransform(sink, IDX[armId], prims[IDX[armId]], _m);
    setPrimTransform(sink, IDX[foreId], prims[IDX[foreId]], _m2);
  }

  function updateArmSwing(dt) {
    const uB = sink.uniforms.uB.value;
    // DIFFERENTIAL drive: d > 0 when the RIGHT foot is ahead (forward =
    // -x). Zero-centered by construction; mirrored targets into identical
    // linear springs => outputs are exactly anti-phase.
    const d = (uB[iFootL].x - uB[iFootR].x) / 2;
    const target = -cfg.swingPerUnit * d;
    const swL = armSpring.l.update(target, dt);
    const swR = armSpring.r.update(-target, dt);
    const thL = Math.max(-cfg.swingMax, Math.min(cfg.swingMax, swL));
    const thR = Math.max(-cfg.swingMax, Math.min(cfg.swingMax, swR));
    // the forearm chases the UNCLAMPED shoulder spring: the chain lag IS
    // the elbow sway; the elbow rail clamps only the applied angle
    const relL = Math.max(-cfg.foreFlexMax, Math.min(cfg.foreHyperMax, cfg.foreGain * (foreSpring.l.update(swL, dt) - swL)));
    const relR = Math.max(-cfg.foreFlexMax, Math.min(cfg.foreHyperMax, cfg.foreGain * (foreSpring.r.update(swR, dt) - swR)));
    swingArm('arm_l', 'fore_l', SHOULDER_L, ELBOW_L, thL, relL);
    swingArm('arm_r', 'fore_r', SHOULDER_R, ELBOW_R, thR, relR);
    debug.thL = thL; debug.thR = thR; debug.relL = relL; debug.relR = relR;
  }

  return {
    updateBob,
    // One call, fixed internal order (body motion computes _chestM; the
    // arms compose it — every measured arm-torso corridor is preserved
    // by construction).
    update(dt) {
      updateBodyMotion(dt);
      updateArmSwing(dt);
    },
    debug,
    config: cfg,
    anchors: { pelvis: PELVIS, chest: CHEST, neckTop: NECK_TOP }, // suite-pinned derivation
  };
}
