// ============================================================
// anim.js — prim animation on the PER-PRIM transform plumbing.
// Every prim owns a mat4 in uPrimMat (identity = rest); this
// module writes the transforms AND keeps the SDF endpoints
// (uA/uB) in lockstep with them — the mesh and the field must
// always agree about where a prim is.
//
// Today's only animation is still the single-prim wave (BEHAVIOR
// PARITY with the old uAnimMat path — same sine, same pivot,
// ABSOLUTE from rest each frame so it cannot drift). The plumbing
// is what changed: IK stepping (stage 3) will write many prims'
// transforms per frame through this same lockstep helper.
// ============================================================

import * as THREE from 'three';

// Pure helper (probed by the suite): rotate point b around pivot a by
// angle (radians) about axis. Arrays in, Vector3 out.
export function rotateAboutPivot(a, b, axis, angle) {
  const pivot = new THREE.Vector3(...a);
  const ax = new THREE.Vector3(...axis).normalize();
  return new THREE.Vector3(...b).sub(pivot).applyAxisAngle(ax, angle).add(pivot);
}

// -1 when the creature has no anim, or names a prim that isn't there —
// animation becomes a silent no-op instead of a crash.
export function animPrimIndex(creature) {
  if (!creature || !creature.anim) return -1;
  return creature.prims.findIndex((p) => p.id === creature.anim.primId);
}

// Scratch objects — reused every frame, zero per-frame allocation.
const _rot = new THREE.Matrix4();
const _toOrigin = new THREE.Matrix4();
const _back = new THREE.Matrix4();
const _axis = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

// Write one prim's transform AND its SDF endpoints from the rest pose.
// The lockstep lives HERE so no future caller can move a mesh without
// moving its field (the registry is never mutated).
function setPrimTransform(material, idx, prim, mat) {
  material.uniforms.uPrimMat.value[idx].copy(mat);
  _a.set(...prim.a).applyMatrix4(mat);
  _b.set(...(prim.b ?? prim.a)).applyMatrix4(mat);
  material.uniforms.uA.value[idx].copy(_a);
  material.uniforms.uB.value[idx].copy(_b);
}

// idx is animPrimIndex(creature), cached by the caller at switch time.
export function updateAnim(material, tSec, creature, idx) {
  if (idx < 0 || !creature || !creature.anim) return;
  const prim = creature.prims[idx];
  const { axis, amplitude, speed } = creature.anim;
  const [ax, ay, az] = prim.a;

  const angle = Math.sin(tSec * speed) * amplitude;

  // World-space rotation about the pivot point a: T(a) * R * T(-a).
  _axis.set(...axis).normalize();
  _rot.makeRotationAxis(_axis, angle);
  _toOrigin.makeTranslation(-ax, -ay, -az);
  _back.makeTranslation(ax, ay, az);
  _back.multiply(_rot).multiply(_toOrigin);

  setPrimTransform(material, idx, prim, _back);
}
