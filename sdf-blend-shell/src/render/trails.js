// ============================================================
// trails.js — FOOTPRINT TRAILS (the banked sand-tracks technique,
// in this stack's idiom).
//
// RENDERER: an InstancedMesh RING BUFFER of flat ellipse quads
// sitting 2mm above the stage, fading BY COLOR — each print's
// instance color interpolates from print-dark to exactly
// GROUND_COLOR over its lifetime, then the slot recycles. Opaque
// quads: no transparency sorting, and no canvas/render-target
// texture (the usual demo technique uploads megabytes of texture
// per frame; per-instance colors cost TRAIL_CAP x 3 floats). The
// ink pass never sees the prints — a 0.002 depth step is ~50x
// below its threshold. Colors are RAW channels (the R1 parity
// rule: the render target skips the sRGB transform).
//
// STAMP SOURCES — the data this engine uniquely owns:
//   'step'  walkers: per-foot SWING -> PLANTED transitions (gait
//           feet expose anchor + swingT; a fresh plant IS a step)
//   'hop'   hoppers: both feet on the hop machine's LAND transition
//   'slide' slugs: distance-interval drag dabs (they do not step)
//   null    hover creatures: NOTHING — they never touch the ground
//
// Per-actor bookkeeping lives in a WeakMap — no actor shape change,
// and imported/generated actors work with zero registration.
// ============================================================

import * as THREE from 'three';
import {
  GROUND_COLOR,
  TRAIL_CAP,
  TRAIL_LIFETIME,
  TRAIL_COLOR,
  TRAIL_Y,
  TRAIL_SLIDE_SPACING,
} from '../config.js';

// Pure classifier (suite-anchored): which stamp source a creature uses.
export function trailMode(creature) {
  if (creature.hover) return null; // never touches the ground
  if (creature.hop) return 'hop';
  if (creature.step?.feet?.length) return 'step';
  return 'slide';
}

const raw = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

// Pure stamp ARTWORK (suite-anchored): a radial soft blob as RGBA bytes —
// white RGB (print color comes from the instances alone), alpha solid in
// the core easing smoothly to zero at the rim. Per-pixel softness is what
// separates an IMPRINT from the hard-cornered sticker the first pass
// shipped (browser-caught: the prints read as torn paper scraps).
export function makeBlobAlpha(size) {
  const data = new Uint8Array(size * size * 4);
  const half = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r01 = Math.hypot(x - half, y - half) / half;
      const t = Math.min(Math.max((1 - r01) / 0.55, 0), 1); // solid core to ~45%, smooth rim
      const a = Math.round(255 * t * t * (3 - 2 * t));
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = a;
    }
  }
  return data;
}
const PRINT_RGB = raw(TRAIL_COLOR);
const GROUND_RGB = raw(GROUND_COLOR);

// Pure fade (suite-anchored at both endpoints): a fresh print is exactly
// TRAIL_COLOR; an expired one is exactly GROUND_COLOR — prints vanish
// seamlessly into the stage, never pop. Smoothstep eases the tail.
export function fadeColor(age, lifetime) {
  const t = Math.min(Math.max(age / lifetime, 0), 1);
  const e = t * t * (3 - 2 * t);
  return [
    PRINT_RGB[0] + (GROUND_RGB[0] - PRINT_RGB[0]) * e,
    PRINT_RGB[1] + (GROUND_RGB[1] - PRINT_RGB[1]) * e,
    PRINT_RGB[2] + (GROUND_RGB[2] - PRINT_RGB[2]) * e,
  ];
}

export function createTrails(scene) {
  // Unit quad on the XZ plane; instances scale it into ellipse-ish
  // prints (local x = the long axis, aligned to the body via heading).
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const tex = new THREE.DataTexture(makeBlobAlpha(64), 64, 64, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  // Transparent + NO depth write: prints never enter the depth buffer,
  // so the ink pass is blind to them BY CONSTRUCTION (not by margin),
  // and overlapping coplanar prints cannot z-fight.
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }), TRAIL_CAP);
  // Instances are placed at runtime across the stage; the geometry's own
  // bounds are a unit quad — default culling would drop them (the same
  // rule as the snap-shader creatures).
  mesh.frustumCulled = false;
  const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _UP = new THREE.Vector3(0, 1, 0);
  const _c = new THREE.Color();
  for (let i = 0; i < TRAIL_CAP; i++) {
    mesh.setMatrixAt(i, _zero); // invisible until stamped
    mesh.setColorAt(i, _c.setRGB(...GROUND_RGB));
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);

  const born = new Float64Array(TRAIL_CAP);
  const active = new Uint8Array(TRAIL_CAP);
  let head = 0;

  function stamp(x, z, heading, len, wid, now) {
    const i = head;
    head = (head + 1) % TRAIL_CAP; // ring buffer: the oldest print yields its slot
    _q.setFromAxisAngle(_UP, heading);
    _m.compose(new THREE.Vector3(x, TRAIL_Y, z), _q, new THREE.Vector3(len, 1, wid));
    mesh.setMatrixAt(i, _m);
    mesh.setColorAt(i, _c.setRGB(...PRINT_RGB));
    born[i] = now;
    active[i] = 1;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }

  const mem = new WeakMap();
  function memFor(actor) {
    let m = mem.get(actor);
    if (!m) {
      const byId = new Map(actor.creature.prims.map((p) => [p.id, p]));
      m = {
        mode: trailMode(actor.creature),
        footR: (actor.creature.step?.feet ?? []).map((id) => byId.get(id)?.r ?? 0.1),
        footPrims: (actor.creature.step?.feet ?? []).map((id) => byId.get(id)),
        bodyR: actor.creature.prims.find((p) => !p.paint && !p.negative)?.r ?? 0.2,
        planted: null, // null = first sight; initialize WITHOUT stamping (no spawn prints)
        lastHop: actor.hop?.current?.() ?? null,
        lastX: null,
        lastZ: null,
      };
      mem.set(actor, m);
    }
    return m;
  }

  return {
    // Called once per actor per frame, AFTER its locomotion update —
    // detection is pure polling: no gait/hop code was touched.
    trackActor(actor, now) {
      const m = memFor(actor);
      if (m.mode === null) return;
      const heading = actor.rig.rotation.y;

      if (m.mode === 'step') {
        const feet = actor.gait?.feet;
        if (!feet) return;
        if (!m.planted) {
          m.planted = feet.map((f) => f.swingT < 0);
          return;
        }
        feet.forEach((f, i) => {
          const plantedNow = f.swingT < 0;
          if (plantedNow && !m.planted[i]) {
            // A fresh plant IS a footfall; the anchor is already WORLD.
            stamp(f.anchor.x, f.anchor.z, heading, m.footR[i] * 1.6, m.footR[i] * 1.05, now);
          }
          m.planted[i] = plantedNow;
        });
        return;
      }

      if (m.mode === 'hop') {
        const state = actor.hop?.current?.();
        if (state === 'LAND' && m.lastHop !== 'LAND') {
          // Both feet strike together: rest b rotated by heading + rig.
          const cs = Math.cos(heading);
          const sn = Math.sin(heading);
          for (let i = 0; i < m.footPrims.length; i++) {
            const b = m.footPrims[i]?.b;
            if (!b) continue;
            const wx = actor.rig.position.x + b[0] * cs + b[2] * sn;
            const wz = actor.rig.position.z - b[0] * sn + b[2] * cs;
            stamp(wx, wz, heading, m.footR[i] * 1.6, m.footR[i] * 1.05, now);
          }
        }
        m.lastHop = state;
        return;
      }

      // 'slide': distance-interval drag dabs under the body.
      const x = actor.rig.position.x;
      const z = actor.rig.position.z;
      if (m.lastX === null) {
        m.lastX = x;
        m.lastZ = z;
        return;
      }
      if (Math.hypot(x - m.lastX, z - m.lastZ) >= TRAIL_SLIDE_SPACING) {
        stamp(x, z, heading, m.bodyR * 0.9, m.bodyR * 0.55, now);
        m.lastX = x;
        m.lastZ = z;
      }
    },

    // Age every active print; expired slots collapse to zero scale and
    // wait for the ring to recycle them.
    update(now) {
      let touched = false;
      for (let i = 0; i < TRAIL_CAP; i++) {
        if (!active[i]) continue;
        const age = now - born[i];
        if (age >= TRAIL_LIFETIME) {
          mesh.setMatrixAt(i, _zero);
          active[i] = 0;
          mesh.instanceMatrix.needsUpdate = true;
          touched = true;
        } else {
          mesh.setColorAt(i, _c.setRGB(...fadeColor(age, TRAIL_LIFETIME)));
          touched = true;
        }
      }
      if (touched) mesh.instanceColor.needsUpdate = true;
    },
  };
}
