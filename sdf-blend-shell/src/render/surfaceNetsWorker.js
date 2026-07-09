// surfaceNetsWorker.js — module Web Worker. Meshes a creature's field OFF
// the render thread, so the main thread holds 60fps while the walking pose
// is re-meshed behind it. Imports the THREE-free core directly (a module
// worker has no page import map, so it cannot pull in THREE).
//
// Protocol: main posts { prims, opts, seq } — prims already carry the
// CURRENT animated endpoints (the gait kept uA/uB in lockstep). We mesh and
// post { positions, indices, ... , seq } back, TRANSFERRING the array
// buffers (zero-copy). seq lets the main thread ignore a stale result.

import { meshCreature } from './surfaceNetsCore.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

self.onmessage = (e) => {
  const { prims, opts, seq } = e.data;
  const t0 = now();
  const { positions, indices, vertexCount, triCount, ns } = meshCreature(prims, opts);
  const ms = now() - t0;
  self.postMessage(
    { positions, indices, vertexCount, triCount, ns, ms, seq },
    [positions.buffer, indices.buffer], // transfer, don't copy
  );
};
