// ============================================================
// anim.js — prim animation on the PER-PRIM transform plumbing.
// Every prim owns a mat4 in uPrimMat (identity = rest); this
// module writes the transforms AND keeps the SDF endpoints
// (uA/uB) in lockstep with them — the mesh and the field must
// always agree about where a prim is.
//
// Animation is data: 'anim' accepts ONE entry or an ARRAY of them
// (the tendril-sway generalization — a single object is just the
// array-of-one case everywhere downstream). Each entry is a wave
// (sine) or a spin (t * speed), rotating about pivot ?? prim.a,
// ABSOLUTE from rest each frame so nothing can drift.
// ============================================================

import * as THREE from 'three';

// Pure helper (probed by the suite): rotate point b around pivot a by
// angle (radians) about axis. Arrays in, Vector3 out.
export function rotateAboutPivot(a, b, axis, angle) {
  const pivot = new THREE.Vector3(...a);
  const ax = new THREE.Vector3(...axis).normalize();
  return new THREE.Vector3(...b).sub(pivot).applyAxisAngle(ax, angle).add(pivot);
}

// Pure (suite-anchored): the breathing inflate. 0.5*(1 - cos) so the
// creature starts exactly at its authored rest inflate (t=0, phase=0)
// and INHALES up to base + amplitude — breath expands from rest, never
// deflates below it. Every field consumer follows automatically: the
// burial boundary, the carve-edge compensation, and the outline all read
// uInflate or the field it shifts (the Pass 3 / mouth-saga payoff).
export function breathInflate(tSec, creature, phase = 0) {
  const base = creature.inflate ?? 0;
  if (!creature.breath) return base; // most creatures hold still
  const { amplitude, speed } = creature.breath;
  return base + amplitude * 0.5 * (1 - Math.cos(tSec * speed + phase));
}

// Normalized anim entries with resolved prims — [] when the creature has
// no anim, and entries naming missing prims are dropped (animation stays
// a silent no-op instead of a crash). Callers cache this at spawn time:
// findIndex is spawn work, not frame work.
export function animEntries(creature) {
  if (!creature || !creature.anim) return [];
  const list = Array.isArray(creature.anim) ? creature.anim : [creature.anim];
  const out = [];
  for (const anim of list) {
    const idx = creature.prims.findIndex((p) => p.id === anim.primId);
    if (idx >= 0) out.push({ anim, prim: creature.prims[idx], idx });
  }
  return out;
}

// Scratch objects — reused every frame, zero per-frame allocation.
const _rot = new THREE.Matrix4();
const _toOrigin = new THREE.Matrix4();
const _back = new THREE.Matrix4();
const _axis = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

// Write one prim's transform AND its SDF endpoints from the rest pose.
// The lockstep lives HERE so no caller can move a mesh without moving its
// field (the registry is never mutated). EXPORTED: gait.js writes the leg
// prims through this same path.
export function setPrimTransform(material, idx, prim, mat) {
  material.uniforms.uPrimMat.value[idx].copy(mat);
  _a.set(...prim.a).applyMatrix4(mat);
  _b.set(...(prim.b ?? prim.a)).applyMatrix4(mat);
  material.uniforms.uA.value[idx].copy(_a);
  material.uniforms.uB.value[idx].copy(_b);
}

// entries = animEntries(creature), cached by the caller at spawn time.
// Every entry writes its OWN prim slot — the validator guarantees no two
// entries target one prim (two matrices cannot share a slot).
export function updateAnim(material, tSec, entries) {
  if (!entries || entries.length === 0) return;
  for (const { anim, prim, idx } of entries) {
    const { axis, amplitude, speed, mode, pivot } = anim;
    // SPIN: angle = t * speed — unbounded and monotonic, but still
    // ABSOLUTE from rest each frame (pause-safe and drift-proof by the
    // same law as the wave). pivot overrides the rotation center: a
    // propeller's hub is its blade's MIDPOINT, which endpoint-a rotation
    // cannot express. Both fields ??-guard to the old behavior.
    const [ax, ay, az] = pivot ?? prim.a;
    const angle = (mode ?? 'wave') === 'spin' ? tSec * speed : Math.sin(tSec * speed) * amplitude;

    // World-space rotation about the pivot point: T(p) * R * T(-p).
    _axis.set(...axis).normalize();
    _rot.makeRotationAxis(_axis, angle);
    _toOrigin.makeTranslation(-ax, -ay, -az);
    _back.makeTranslation(ax, ay, az);
    _back.multiply(_rot).multiply(_toOrigin);

    setPrimTransform(material, idx, prim, _back);
  }
}
