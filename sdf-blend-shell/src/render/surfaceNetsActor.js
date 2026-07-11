// surfaceNetsActor.js — an SN-rendered actor for main: the sink-material
// + worker + geometry-swap pattern proven in the anim proto, packaged so
// spawnActor can branch on `creature.render === 'sn'`.
//
// Shape of the thing: gait/anim/blink write creature-space transforms
// into a NEVER-RENDERED blend material (the sink) exactly as they do for
// shell actors — the write paths take a materials list and cannot tell
// the difference. We snapshot the sink's live uA/uB/uR, ship them to the
// shared Surface Nets worker, and swap the returned geometry onto a mesh
// that rides the actor's rig (pose is the rig's job, so the displayed
// pose NEVER lags; only the pose-internal shape lags by the mesh
// interval). The snapshot carries LIVE uR — Pass D squash modulates
// radii, and the worker must mesh what the sink says (the proto lesson).
//
// Scheduling v1: ONE shared worker, round-robin over queued actors,
// always-dirty while spawned (an idle-skip optimization is a follow-up
// WITH measurement — see the handoff). One SN actor therefore meshes
// back-to-back like the proto (~45 Hz at cell 0.015 on the dev box);
// N actors divide that fairly.
//
// The worker is created LAZILY on first need: this module must import
// headless (the suite imports everything under a DOM stub), and tests
// inject a fake via `workerFactory`.

import * as THREE from 'three';
import { createBlendMaterial, createSurfaceNetsMaterial } from './blendMaterial.js';

let sharedWorker = null;
let inFlight = null;         // the actor whose bake the worker is running
const queue = [];            // actors waiting for a bake

function defaultWorkerFactory() {
  return new Worker(new URL('./surfaceNetsWorker.js', import.meta.url), { type: 'module' });
}

function ensureWorker(factory) {
  if (sharedWorker) return;
  sharedWorker = factory();
  sharedWorker.onmessage = (e) => {
    const actor = inFlight;
    inFlight = null;
    if (actor) actor._receive(e.data);
    pump();
  };
}

function pump() {
  if (inFlight || queue.length === 0) return;
  inFlight = queue.shift();
  inFlight._post();
}

export function createSurfaceNetsActor(creature, opts = {}) {
  const cellSize = opts.cellSize ?? 0.015;
  let blendK = opts.blendK ?? 0.25;
  const workerFactory = opts.workerFactory ?? defaultWorkerFactory;

  // The sink: gait/anim/blink write here; it is never on a rendered mesh.
  const simMat = createBlendMaterial(creature.prims, creature.inflate, creature.step?.knees);
  const snMat = createSurfaceNetsMaterial(creature.prims, creature.inflate);
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), snMat);
  mesh.frustumCulled = false; // geometry changes every bake; CPU bounds are meaningless

  let dirty = true;   // v1: spawned = dirty (see header)
  let queued = false;
  let pendingSnap = null;
  const stats = { ms: 0, verts: 0, bakes: 0 };

  function snapshot() {
    const uA = simMat.uniforms.uA.value;
    const uB = simMat.uniforms.uB.value;
    const uR = simMat.uniforms.uR.value;
    return creature.prims.map((p, i) => ({
      type: p.type,
      r: uR[i], // LIVE radius (squash and friends), never rest
      kCap: p.kCap,
      kPrim: p.kPrim,
      paint: p.paint,
      negative: p.negative,
      a: [uA[i].x, uA[i].y, uA[i].z],
      b: [uB[i].x, uB[i].y, uB[i].z],
    }));
  }

  const actor = {
    simMat,
    mesh,
    stats,
    markDirty() { dirty = true; },
    setK(k) {
      blendK = k;
      snMat.uniforms.uK.value = k;
      dirty = true;
    },
    // Call once per frame: enqueues a bake when there is something new
    // and this actor is not already waiting or in flight.
    update() {
      if (!dirty || queued) return;
      ensureWorker(workerFactory);
      queued = true;
      dirty = false; // writes after this instant re-mark and re-queue
      queue.push(actor);
      pump();
    },
    _post() {
      pendingSnap = snapshot();
      sharedWorker.postMessage({
        prims: pendingSnap,
        opts: { cellSize, blendK, inflate: creature.inflate ?? 0 },
      });
    },
    _receive({ positions, indices, vertexCount, ms }) {
      const old = mesh.geometry;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setIndex(new THREE.BufferAttribute(indices, 1));
      mesh.geometry = geo;
      old.dispose();
      // Shade with THE SNAPSHOT that produced this geometry, not the sink's
      // newest state — paint and toon bands must match the surface they ride.
      const uA = snMat.uniforms.uA.value;
      const uB = snMat.uniforms.uB.value;
      const uR = snMat.uniforms.uR.value;
      pendingSnap.forEach((p, i) => {
        uA[i].set(p.a[0], p.a[1], p.a[2]);
        uB[i].set(p.b[0], p.b[1], p.b[2]);
        uR[i] = p.r;
      });
      pendingSnap = null;
      stats.ms = ms;
      stats.verts = vertexCount;
      stats.bakes++;
      queued = false;
    },
    dispose() {
      const qi = queue.indexOf(actor);
      if (qi >= 0) queue.splice(qi, 1);
      mesh.geometry.dispose();
    },
  };
  return actor;
}

// Test hook: the suite injects a fake worker and must be able to reset
// the module-level scheduler between probe groups.
export function _resetSchedulerForTests() {
  sharedWorker = null;
  inFlight = null;
  queue.length = 0;
}
