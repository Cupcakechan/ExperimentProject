// ============================================================
// buildShell.js — turns the creature registry into ONE merged
// geometry (the post's "one draw call"). Each primitive gets an
// ordinary three.js mesh, baked into world space, so the shader
// receives vertices that already sit on their own primitive's
// surface — a good starting point for the snap iterations.
// ============================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAPSULE_RINGS_PER_UNIT } from '../config.js';

const UP = new THREE.Vector3(0, 1, 0); // our capsules are authored along +Y
const RADIAL_SEGS = 16;

// three r170's CapsuleGeometry has NO subdivisions along its length
// (MEASURED: zero vertex rings on the cylindrical wall) — and a snapped
// shell can only show fillets where vertices exist to bend, so limbs
// joining a long capsule mid-cylinder looked detached. Build capsules
// ourselves: an open cylinder with explicit rings + two hemisphere caps,
// authored along +Y and centered at the origin like CapsuleGeometry was.
function capsuleGeometry(r, len) {
  const rings = Math.max(1, Math.round(len * CAPSULE_RINGS_PER_UNIT));
  const tube = new THREE.CylinderGeometry(r, r, len, RADIAL_SEGS, rings, true);
  const top = new THREE.SphereGeometry(r, RADIAL_SEGS, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  top.translate(0, len / 2, 0);
  const bottom = new THREE.SphereGeometry(r, RADIAL_SEGS, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  bottom.translate(0, -len / 2, 0);
  const merged = mergeGeometries([tube, top, bottom], false);
  [tube, top, bottom].forEach((g) => g.dispose());
  return merged;
}

function primGeometry(prim) {
  const a = new THREE.Vector3(...prim.a);
  const b = new THREE.Vector3(...(prim.b ?? prim.a));

  // Sphere, or a degenerate zero-length capsule — same thing.
  if (prim.type === 'sphere' || a.distanceTo(b) < 1e-6) {
    const geo = new THREE.SphereGeometry(prim.r, 24, 16);
    geo.translate(a.x, a.y, a.z);
    return geo;
  }

  // Capsules are authored along +Y and centered at the origin, so:
  // build at the right length, rotate Y onto the a→b direction,
  // then move to the segment midpoint.
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = capsuleGeometry(prim.r, len);
  const quat = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  const bake = new THREE.Matrix4().compose(mid, quat, new THREE.Vector3(1, 1, 1));
  geo.applyMatrix4(bake);
  return geo;
}

export function buildShellGeometry(prims) {
  const geos = prims
    .map((prim, idx) => ({ prim, idx }))
    // Paint prims tint the skin via the color field only — they have no
    // surface of their own, so they get no mesh.
    .filter(({ prim }) => !prim.paint)
    .map(({ prim, idx }) => {
      const geo = primGeometry(prim);
      // aPrim: the REGISTRY index (not the filtered index — uniform arrays
      // are indexed by registry position) so animated vertices can follow
      // their primitive when it moves.
      const count = geo.getAttribute('position').count;
      geo.setAttribute('aPrim', new THREE.BufferAttribute(new Float32Array(count).fill(idx), 1));
      return geo;
    });

  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose()); // merged owns copies; source geos are done
  return merged;
}
