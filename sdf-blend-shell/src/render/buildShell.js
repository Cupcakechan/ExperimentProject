// ============================================================
// buildShell.js — turns the creature registry into ONE merged
// geometry (the post's "one draw call"). Each primitive gets an
// ordinary three.js mesh, baked into world space, so the shader
// receives vertices that already sit on their own primitive's
// surface — a good starting point for the snap iterations.
// ============================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const UP = new THREE.Vector3(0, 1, 0); // CapsuleGeometry's built-in axis

function primGeometry(prim) {
  const a = new THREE.Vector3(...prim.a);
  const b = new THREE.Vector3(...(prim.b ?? prim.a));

  // Sphere, or a degenerate zero-length capsule — same thing.
  if (prim.type === 'sphere' || a.distanceTo(b) < 1e-6) {
    const geo = new THREE.SphereGeometry(prim.r, 24, 16);
    geo.translate(a.x, a.y, a.z);
    return geo;
  }

  // CapsuleGeometry is authored along +Y and centered at the origin,
  // so: build at the right length, rotate Y onto the a→b direction,
  // then move to the segment midpoint.
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CapsuleGeometry(prim.r, len, 6, 16);
  const quat = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  const bake = new THREE.Matrix4().compose(mid, quat, new THREE.Vector3(1, 1, 1));
  geo.applyMatrix4(bake);
  return geo;
}

export function buildShellGeometry(prims) {
  const geos = prims.map((prim, idx) => {
    const geo = primGeometry(prim);
    // aPrim: which primitive each vertex belongs to. Unused in Stage A,
    // but Stage B needs it so vertices can follow their primitive when it moves —
    // adding it now means the merge never has to be redone.
    const count = geo.getAttribute('position').count;
    geo.setAttribute('aPrim', new THREE.BufferAttribute(new Float32Array(count).fill(idx), 1));
    return geo;
  });

  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose()); // merged owns copies; source geos are done
  return merged;
}
