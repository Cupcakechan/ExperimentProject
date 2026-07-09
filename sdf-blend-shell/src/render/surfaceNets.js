// surfaceNets.js — R4: mesh the SDF field itself into ONE watertight
// BufferGeometry, instead of snapping a union of per-primitive donor
// shells onto it (buildShell.js). A union of part-meshes cannot cover the
// blend surface WHERE parts meet — the concave creases and capless limb
// ends — so it seams there (the "cuts"/"missing chunks"); the tuck hides
// most, never all. An isosurface has no part-meshes to seam: a limb and
// the body are literally the same skin.
//
// The pure mesher lives in surfaceNetsCore.js (THREE-free, so the animation
// Web Worker can import it). This file is the main-thread wrapper: it adds
// the THREE.BufferGeometry and the config default, and re-exports the core
// so existing importers keep working unchanged.

import * as THREE from 'three';
import { BLEND_K } from '../config.js';
import { meshCreature } from './surfaceNetsCore.js';

export { createCreatureField, surfaceNetsMesh, meshCreature } from './surfaceNetsCore.js';

// Build a watertight THREE.BufferGeometry for a creature's field.
export function buildSurfaceNetsGeometry(prims, opts = {}) {
  const { positions, indices, ns, bounds, vertexCount, triCount } = meshCreature(prims, {
    blendK: BLEND_K, // config default; callers (proto dial, worker) override
    ...opts,
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  // A per-vertex aPrim is meaningless on an isosurface (a vertex belongs to
  // the blended skin, not one prim), so the SN material reads none — its
  // vertex shader is pass-through and the fragment stage samples the field.
  geo.computeVertexNormals(); // fallback only; the shader uses SDF-gradient normals
  return { geometry: geo, ns, bounds, vertexCount, triCount };
}
