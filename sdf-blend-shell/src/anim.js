// ============================================================
// anim.js — Stage B procedural wave: one primitive's endpoint b
// rotates around its endpoint a (a shoulder joint), driven by a
// sine, ABSOLUTE from the rest pose each frame (never accumulated,
// so it can't drift). Two things must move in lockstep:
//   1. the SDF primitive (uB uniform)  — where the surface IS
//   2. the mesh vertices (uAnimMat)    — where snapping STARTS
// ============================================================

import * as THREE from 'three';
import { CREATURE } from './data/creature.js';
import { ANIM_PRIM_ID, WAVE_AXIS, WAVE_AMPLITUDE, WAVE_SPEED } from './config.js';

// Pure helper (probed by the suite): rotate point b around pivot a by
// angle (radians) about axis. Arrays in, Vector3 out.
export function rotateAboutPivot(a, b, axis, angle) {
  const pivot = new THREE.Vector3(...a);
  const ax = new THREE.Vector3(...axis).normalize();
  return new THREE.Vector3(...b).sub(pivot).applyAxisAngle(ax, angle).add(pivot);
}

// -1 when the configured id isn't in the registry — animation becomes a
// silent no-op instead of a crash (graceful fallback).
export const ANIM_PRIM_INDEX = CREATURE.findIndex((p) => p.id === ANIM_PRIM_ID);

// Scratch objects — reused every frame, zero per-frame allocation.
const _rot = new THREE.Matrix4();
const _toOrigin = new THREE.Matrix4();
const _back = new THREE.Matrix4();
const _axis = new THREE.Vector3();
const _b = new THREE.Vector3();

export function updateAnim(material, tSec) {
  if (ANIM_PRIM_INDEX < 0) return;
  const prim = CREATURE[ANIM_PRIM_INDEX];
  const [ax, ay, az] = prim.a;

  const angle = Math.sin(tSec * WAVE_SPEED) * WAVE_AMPLITUDE;

  // World-space rotation about the pivot point a: T(a) * R * T(-a).
  _axis.set(...WAVE_AXIS).normalize();
  _rot.makeRotationAxis(_axis, angle);
  _toOrigin.makeTranslation(-ax, -ay, -az);
  _back.makeTranslation(ax, ay, az);

  const animMat = material.uniforms.uAnimMat.value;
  animMat.copy(_back).multiply(_rot).multiply(_toOrigin);

  // Move the SDF primitive itself with the same transform (b from the
  // REST pose in the registry — the registry is never mutated).
  _b.set(...(prim.b ?? prim.a)).applyMatrix4(animMat);
  material.uniforms.uB.value[ANIM_PRIM_INDEX].copy(_b);
}
