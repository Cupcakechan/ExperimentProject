// ============================================================
// shadows.js — CONTACT SHADOWS (research build 1): one soft blob
// decal per actor, the grounding read the unlit creatures lack.
//
// ANALYTIC, not a render target: the SS9 depth-RT mechanism stays
// banked — at this art style the grounding read IS a soft dark
// ellipse, and pure math keeps the whole feature suite-probeable.
// The blob is the creature's REST solids' XZ extent (an overhead
// projection — paint and carve prims own no surface and cast
// nothing), rotated with the heading, centered on the DISPLAYED
// rig position.
//
// ONE altitude law serves every locomotion mode, unbranched:
//   h      = max(displayed rig y, 0)  (the hop's crouch dip must
//                                      never OVER-darken past rest)
//   spread = 1 + SHADOW_SPREAD * h    (a lifted body throws a
//                                      wider, softer blob)
//   fade   = h / (h + SHADOW_FADE_H)  (0 on the ground, exactly
//                                      0.5 at the half-fade
//                                      altitude, asymptotic below
//                                      1 — a hover creature KEEPS
//                                      a faint blob)
//   color  = mix(SHADOW, GROUND, fade) (the trails fade-by-color
//                                      mechanism turned vertical:
//                                      at full fade the quad IS
//                                      the stage)
// So a hop reads "left the ground" through its arc and Bloop holds
// a faint wide blob at 0.55 — the same three lines of math.
//
// RENDERING mirrors trails.js exactly: InstancedMesh of unit quads,
// the makeBlobAlpha soft-edge texture (IMPORTED — one blob artwork,
// one source of truth), transparent + depthWrite OFF (shadows never
// enter the depth buffer, so the ink pass is blind BY CONSTRUCTION),
// raw color channels (the R1 parity rule), frustumCulled off
// (instances place at runtime; the unit quad's own bounds would
// cull them). renderOrder -1 draws shadows BEFORE the prints:
// a footprint inside a shadow stays visible — transparent sorting
// alone is unstable for two near-coplanar layers.
//
// Per-actor footprint lives in a WeakMap — no actor shape change;
// imported and generated creatures get shadows with ZERO
// registration (the trails bookkeeping pattern). Instance slot i
// belongs to actor i for life (the cast is append-only by law).
// ============================================================

import * as THREE from 'three';
import { makeBlobAlpha } from './trails.js';
import {
  GROUND_COLOR,
  ACTOR_CAP,
  SHADOW_COLOR,
  SHADOW_Y,
  SHADOW_SCALE,
  SHADOW_SPREAD,
  SHADOW_FADE_H,
} from '../config.js';

const raw = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const SHADOW_RGB = raw(SHADOW_COLOR);
const GROUND_RGB = raw(GROUND_COLOR);

// Pure (suite-anchored): the blob's rest geometry — the XZ box extent
// of every SOLID prim (endpoints +- r) as an ellipse { cx, cz, rx, rz }
// in creature space. An overhead projection: paints and carves own no
// surface, so they cast nothing. Returns null when no solid exists —
// the validator forbids that, but a shadow must never be the crash.
export function shadowFootprint(creature) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of creature.prims) {
    if (p.paint || p.negative) continue;
    for (const pt of p.b ? [p.a, p.b] : [p.a]) {
      minX = Math.min(minX, pt[0] - p.r);
      maxX = Math.max(maxX, pt[0] + p.r);
      minZ = Math.min(minZ, pt[2] - p.r);
      maxZ = Math.max(maxZ, pt[2] + p.r);
    }
  }
  // NaN/empty-safe: any failed comparison (no solids, bad numbers)
  // yields null instead of a degenerate quad.
  if (!(minX < maxX) || !(minZ < maxZ)) return null;
  return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, rx: (maxX - minX) / 2, rz: (maxZ - minZ) / 2 };
}

// Pure (suite-anchored): the altitude fade — 0 on the ground, exactly
// 0.5 at SHADOW_FADE_H, asymptotic below 1 (the grounding read never
// fully vanishes). Negative altitude clamps to rest by contract, IN
// the code, so no caller can over-darken a crouching body.
export function shadowFade(h) {
  const a = Math.max(h, 0);
  return a / (a + SHADOW_FADE_H);
}

// Pure (suite-anchored): altitude spread — mild by design (Bloop at
// 0.55 reads ~1.19x); the fade carries most of the altitude story.
export function shadowSpread(h) {
  return 1 + SHADOW_SPREAD * Math.max(h, 0);
}

// Pure (suite-anchored at both endpoints): the blob's color walks from
// SHADOW_COLOR toward exactly GROUND_COLOR as altitude rises — raw
// channels (the R1 parity rule: the render target skips the sRGB
// transform, so raw-in = authored-out).
export function shadowColor(h) {
  const f = shadowFade(h);
  return [
    SHADOW_RGB[0] + (GROUND_RGB[0] - SHADOW_RGB[0]) * f,
    SHADOW_RGB[1] + (GROUND_RGB[1] - SHADOW_RGB[1]) * f,
    SHADOW_RGB[2] + (GROUND_RGB[2] - SHADOW_RGB[2]) * f,
  ];
}

export function createShadows(scene) {
  // Unit quad on the XZ plane; instances scale it into the footprint
  // ellipse (PlaneGeometry(1,1) spans +-0.5, so FULL sizes = 2r).
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const tex = new THREE.DataTexture(makeBlobAlpha(64), 64, 64, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  const mesh = new THREE.InstancedMesh(
    geo,
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
    ACTOR_CAP
  );
  mesh.frustumCulled = false; // instances place at runtime (the trails rule)
  mesh.renderOrder = -1; // shadows draw BEFORE prints: a footprint inside a shadow stays visible
  const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _UP = new THREE.Vector3(0, 1, 0);
  const _v = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const _c = new THREE.Color();
  for (let i = 0; i < ACTOR_CAP; i++) {
    mesh.setMatrixAt(i, _zero); // invisible until an actor owns the slot
    mesh.setColorAt(i, _c.setRGB(...GROUND_RGB));
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);

  const mem = new WeakMap();
  const footFor = (actor) => {
    let f = mem.get(actor);
    if (f === undefined) {
      f = shadowFootprint(actor.creature); // may cache null (shadow-less, graceful)
      mem.set(actor, f);
    }
    return f;
  };

  return {
    // Once per frame, AFTER every actor's locomotion has set its rig —
    // the update reads only the DISPLAYED pose (hop burst, hover bob,
    // stride lift all included for free).
    update(actors) {
      const n = Math.min(actors.length, ACTOR_CAP);
      for (let i = 0; i < n; i++) {
        const actor = actors[i];
        const f = footFor(actor);
        if (!f) continue;
        const heading = actor.rig.rotation.y;
        const h = actor.rig.position.y;
        const s = SHADOW_SCALE * shadowSpread(h);
        // The footprint center is creature-space: rotate it with the
        // heading (the same rotation convention as the trails hop stamp).
        const cs = Math.cos(heading);
        const sn = Math.sin(heading);
        const wx = actor.rig.position.x + f.cx * cs + f.cz * sn;
        const wz = actor.rig.position.z - f.cx * sn + f.cz * cs;
        _q.setFromAxisAngle(_UP, heading);
        _m.compose(_v.set(wx, SHADOW_Y, wz), _q, _s.set(2 * f.rx * s, 1, 2 * f.rz * s));
        mesh.setMatrixAt(i, _m);
        mesh.setColorAt(i, _c.setRGB(...shadowColor(h)));
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    },
  };
}
