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
// capTop/capBottom (A5.2): a KNEE end gets NO cap — the interior
// hemisphere fans at a buried joint serve nothing and park ~40 verts per
// leg in the body's burial transition band, painting a black ink ring
// where the leg exits the belly (MEASURED: ring verts 13 -> 51 when the
// caps appeared; 80% were cap provenance).
function capsuleGeometry(r, len, capTop = true, capBottom = true) {
  const rings = Math.max(1, Math.round(len * CAPSULE_RINGS_PER_UNIT));
  const parts = [new THREE.CylinderGeometry(r, r, len, RADIAL_SEGS, rings, true)];
  if (capTop) {
    const top = new THREE.SphereGeometry(r, RADIAL_SEGS, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    top.translate(0, len / 2, 0);
    parts.push(top);
  }
  if (capBottom) {
    const bottom = new THREE.SphereGeometry(r, RADIAL_SEGS, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    bottom.translate(0, -len / 2, 0);
    parts.push(bottom);
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  return merged;
}

function primGeometry(prim, skipACap = false, skipBCap = false) {
  const a = new THREE.Vector3(...prim.a);
  const b = new THREE.Vector3(...(prim.b ?? prim.a));

  // Sphere, or a degenerate zero-length capsule — same thing.
  // 32x24 segments (was 24x16): carve bowls are lined by the HOST'S
  // vertices snapping inward, and the mouth-sized carve measured only 8
  // donor verts at the old density — the detached-legs lesson (fillets
  // and bowls need vertices) applied to spheres. Cost: ~2x verts per
  // sphere prim, still tiny meshes.
  if (prim.type === 'sphere' || a.distanceTo(b) < 1e-6) {
    const geo = new THREE.SphereGeometry(prim.r, 32, 24);
    geo.translate(a.x, a.y, a.z);
    return geo;
  }

  // Capsules are authored along +Y and centered at the origin, so:
  // build at the right length, rotate Y onto the a→b direction,
  // then move to the segment midpoint. The +Y TOP cap maps onto the
  // b end (the quat rotates UP onto b - a).
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = capsuleGeometry(prim.r, len, !skipBCap, !skipACap);
  const quat = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  const bake = new THREE.Matrix4().compose(mid, quat, new THREE.Vector3(1, 1, 1));
  geo.applyMatrix4(bake);
  return geo;
}

export function buildShellGeometry(prims, knees) {
  // A5.2: knee ends are CAPLESS — thighs (map values) lose their b cap,
  // shins (map keys) lose their a cap. VALIDITY BOUNDARY (suite-walked):
  // this assumes the knee stays INSIDE the body through the whole gait;
  // a creature whose knee exits the skin needs its caps back.
  const skipA = new Set();
  const skipB = new Set();
  if (knees) {
    for (const [shinId, thighId] of Object.entries(knees)) {
      skipA.add(shinId);
      skipB.add(thighId);
    }
  }
  const geos = prims
    .map((prim, idx) => ({ prim, idx }))
    // Paint prims tint the skin via the color field only — they have no
    // surface of their own, so they get no mesh. NEGATIVE prims (carves)
    // get no mesh either: a hole owns no surface patches — the HOST'S
    // vertices snap inward to line the bowl.
    .filter(({ prim }) => !prim.paint && !prim.negative)
    .map(({ prim, idx }) => {
      const geo = primGeometry(prim, skipA.has(prim.id), skipB.has(prim.id));
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
