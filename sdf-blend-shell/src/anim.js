// ============================================================
// anim.js — the single-prim wave, now CREATURE-AWARE: parameters
// come from creature.anim, not global config. The prim's endpoint
// b rotates around its endpoint a, driven by a sine, ABSOLUTE from
// the rest pose each frame (never accumulated, so it can't drift).
// Two things move in lockstep:
//   1. the SDF primitive (uB uniform)  — where the surface IS
//   2. the mesh vertices (uAnimMat)    — where snapping STARTS
// Limitation (by design, documented in creatures.js): only the
// named prim moves — attached prims do NOT follow.
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
const _b = new THREE.Vector3();

// idx is animPrimIndex(creature), cached by the caller at switch time —
// recomputing a findIndex every frame would be waste.
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

  const animMat = material.uniforms.uAnimMat.value;
  animMat.copy(_back).multiply(_rot).multiply(_toOrigin);

  // Move the SDF primitive with the same transform (b from the REST pose
  // in the registry — the registry is never mutated).
  _b.set(...(prim.b ?? prim.a)).applyMatrix4(animMat);
  material.uniforms.uB.value[idx].copy(_b);
}
