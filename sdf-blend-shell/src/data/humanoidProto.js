// humanoidProto.js — the PROTO-LOCAL humanoid authoring (v4.2), single-
// sourced. This block previously lived as a BYTE-IDENTICAL duplicate at
// the top of BOTH proto pages (proto-strider.js and proto-strider-anim.js)
// — a hand-authored-data divergence trap. It now lives here once; both
// pages (and the suite's rig probes) consume it. NOT in the cast: the
// humanoid stays proto-local until validate.js grows its SN branch and
// creature #10 is authored append-only (plan-of-record items 2-3).
// Every value and comment below is the measured history — moved verbatim.
import { CREATURES } from './creatures.js';

export function buildHumanoidProto() {
const strider = CREATURES.find((c) => c.id === 'strider');
// PROTO-LOCAL HUMANOID PASS v3.2 (not authored into the cast; the proto
// is deliberately veering creature -> humanoid). Explicit values — every
// line is one lever.
// v3.2 changes: HEAD 0.26 -> 0.20 (was reading big on the slim body);
// the eye group SCALES with it so the balls stay rooted EYE_ROOT into
// the head surface and each iris keeps its exact on-ball offset (paint
// band preserved). LEG DE-FUSE (MEASURED, three culprits): the torso
// bottom hung to y 0.70 — knee height — so the crotch WAS at the knees;
// the thigh k bridged the knee cluster (four capsule ends stack their
// smin deficits); and the shins bridged at global k. Fix (sweep-picked
// against the live field): torso bottom raised to 1.00 with the hips up
// at 0.92 (burial -0.047), THIGH_K 0.10, SHIN_K 0.08, leg track z 0.14.
// Walk midline field between the legs: -0.068 (v3.1) -> +0.021 = an
// open gap through the whole stride (0/240 frames fused, MEASURED).
// v3.3 BULGE FIX: the de-fuse first shipped with track z 0.17 — the
// thighs splayed hip 0.13 -> knee 0.17 and read as an upper-leg bulge
// (outer 0.27 vs torso 0.20). Sweep-picked replacement buys the gap
// from slimmer legs (r 0.09/0.08) + tighter fold k instead of track
// width: outer now 0.23, splay 0.01.
// v3.4 KNEE HEIGHT: kneecaps lowered 0.71 -> 0.40, then v3.5 nudged
// back up to 0.45 (per screenshot). Thigh is the long bone. Knee
// forward bias 0.08 keeps rest reach ~0.983 against the 0.995 limit.
// v3.5 KNEE DE-BULGE: the joint swelled because the thigh end cap was
// fatter than the shin (0.09 vs 0.08) AND both fold radii inflate the
// shared point. Thigh r -> 0.085 (halves the step) and THIGH_K 0.07 /
// SHIN_K 0.06 (joint stays smooth at any k: shared endpoint, zero
// divergence). Knee local radius 0.117 -> 0.104 MEASURED vs shin 0.09. A dedicated pelvis prim was tried and measured WORSE (a
// sphere that buries the thighs hangs into the crotch itself). Body
// 0.22 -> 0.20, neck 0.10 -> 0.09 ride the overall slim.
// Straight leg column kept from v3.1: hip + foot aligned at x 0.11,
// knee 0.06 forward as the IK pole; rest reach ~0.98, the gait
// self-regulates at its 0.995 straight limit (MEASURED).
// NOTE: SN is the truth view; the static-proto SHELL toggle shows rim
// artifacts at the untucked knees and slim body — expected.
const THIGH_K = 0.07; // knee de-bulge; low k is safe (thigh is buried -0.047, joint is a shared point)
const SHIN_K = 0.06; // anti-fuse + knee de-bulge
const HEAD = [0.02, 1.56, 0];
const HEAD_R = 0.20;
const EYE_ROOT = 0.045; // authored ball rooting depth into the head
const OVERRIDE = {
  body: { a: [0.11, 1.00, 0], b: [0.11, 1.20, 0], r: 0.18 }, // bottom raised off the crotch; r 0.20 -> 0.18 buys the ARM corridor (and more slim)
  neck: { a: [0.11, 1.20, 0], b: [0.05, 1.40, 0], r: 0.09 },
  head: { a: HEAD, r: HEAD_R },
  thigh_l: { a: [0.11, 0.92, 0.09], b: [-0.03, 0.45, 0.14], r: 0.08, kPrim: THIGH_K }, // hip z in + r 0.08: shrinks the flare the arm must clear (and zeroes the knee radius step). Knee x -0.03 (v4.2): reach headroom 0.949 — at 0.982 the legs ran pinned to the 0.995 straight-leg clamp ~83% of the walk, and the step trigger + saturated reach formed an ASYMMETRIC LIMIT CYCLE (one leg stretched, one catch-up stepping = the left-leg drag; straight-line air frames 414/270 MEASURED). With headroom: 216/216, clamp ~0. Partial headroom is WORSE (nonlinear limit cycle) — do not split the difference.
  thigh_r: { a: [0.11, 0.92, -0.09], b: [-0.03, 0.45, -0.14], r: 0.08, kPrim: THIGH_K },
  leg_l: { a: [-0.03, 0.45, 0.14], b: [0.11, 0.06, 0.14], r: 0.08, kPrim: SHIN_K },
  leg_r: { a: [-0.03, 0.45, -0.14], b: [0.11, 0.06, -0.14], r: 0.08, kPrim: SHIN_K },
  tail: null, // removed: humanoid
};
const headSrc = strider.prims.find((p) => p.id === 'head');
const prims = strider.prims.flatMap((p) => {
  if (OVERRIDE[p.id] === null) return [];
  if (p.id.startsWith('eyeball')) {
    const o = [p.a[0] - headSrc.a[0], p.a[1] - headSrc.a[1], p.a[2] - headSrc.a[2]];
    const s = (HEAD_R - EYE_ROOT) / Math.hypot(o[0], o[1], o[2]); // keep the rooting depth on the smaller head
    return [{ ...p, a: [HEAD[0] + o[0] * s, HEAD[1] + o[1] * s, HEAD[2] + o[2] * s] }];
  }
  if (p.id.startsWith('iris')) {
    const eye = strider.prims.find((q) => q.id === 'eyeball' + p.id.slice(4)); // iris_l -> eyeball_l
    const o = [eye.a[0] - headSrc.a[0], eye.a[1] - headSrc.a[1], eye.a[2] - headSrc.a[2]];
    const s = (HEAD_R - EYE_ROOT) / Math.hypot(o[0], o[1], o[2]);
    // the scaled ball center + the EXACT authored iris-on-ball offset: paint band preserved
    return [{ ...p, a: [HEAD[0] + o[0] * s + (p.a[0] - eye.a[0]), HEAD[1] + o[1] * s + (p.a[1] - eye.a[1]), HEAD[2] + o[2] * s + (p.a[2] - eye.a[2])] }];
  }
  return [{ ...p, ...(OVERRIDE[p.id] ?? {}) }];
});
// ARMS (v4): two-segment, elbow = a SHARED endpoint (the leg contract:
// zero divergence, smooth at any k). MEASURED reality: with any torso
// wide enough to read as a chest, a near-hanging arm WELDS through the
// widest band — full armpit daylight would need starfish arms (elbow z
// 0.40+) or a 0.15 torso. Shipped compromise (corridor-peak sweep):
// v4.1 (arms off the legs, per feedback): shoulder moved to the TORSO
// TOP corner, hip flare pulled in (thigh z 0.09, r 0.08 — knee step now
// zero), and the straight ray widened to 26 deg. MEASURED: the weld now
// ends at y 0.93 — ABOVE the hip point — so the arm attaches to torso
// only, with a +0.023 gap through the entire leg zone. (chi==2 alone is NOT a weld detector: a full-
// length weld is a lump, not a ring; the corridor-peak profile is the
// real one.) Prim budget: 15/16.
const ARM_UP_R = 0.06, ARM_FORE_R = 0.055, ARM_UP_K = 0.05, ARM_FORE_K = 0.05; // elbow de-bulge (the knee treatment): halve the radius step + lower both fold k's
const SHOULDER = [0.11, 1.20, 0.14]; // torso TOP corner (sd -0.04): higher root = the straight ray clears the hip sooner
const ELBOW = [0.082, 0.84, 0.314];  // ON the shoulder->hand line (0 deg kink, the lay-straight ask)
const HAND = [0.06, 0.56, 0.45];     // sweep-picked: weld ends y 0.93 (above the hip), leg-zone gap +0.023
const mirrorZ = (v) => [v[0], v[1], -v[2]];
prims.push(
  { id: 'arm_l', type: 'capsule', a: SHOULDER, b: ELBOW, r: ARM_UP_R, kPrim: ARM_UP_K, color: 0x2e8478 },
  { id: 'fore_l', type: 'capsule', a: ELBOW, b: HAND, r: ARM_FORE_R, kPrim: ARM_FORE_K, color: 0x256e63 },
  { id: 'arm_r', type: 'capsule', a: mirrorZ(SHOULDER), b: mirrorZ(ELBOW), r: ARM_UP_R, kPrim: ARM_UP_K, color: 0x2e8478 },
  { id: 'fore_r', type: 'capsule', a: mirrorZ(ELBOW), b: mirrorZ(HAND), r: ARM_FORE_R, kPrim: ARM_FORE_K, color: 0x256e63 },
);
return { ...strider, prims }; // same ids/indices/step as the cast strider — only the humanoid overrides differ
}
