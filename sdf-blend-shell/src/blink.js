// ============================================================
// blink.js — A4 stage 2: decal-driven blinking.
//
// A blink is the eye decals SUBMERGING into their host: coverage
// fades as the paint prim sinks below poke depth, and what shows
// is simply the host's skin — the "eyelid" for free, no shader
// change, no new color model. Each eye translates along the
// direction toward the CLOSEST POINT on its host (capsule hosts —
// the snail's stalks — need the segment point, not the center),
// by depth = 2r + PAINT_EDGE: enough that coverage is provably
// zero at full close (suite-anchored).
//
// Writes go through anim.js's setPrimTransform (the lockstep
// path), ABSOLUTE from the rest pose every frame — closeT = 0
// restores the registry bit-for-bit, so blinking cannot drift.
//
// The schedule is DETERMINISTIC (project rule: no RNG): one blink
// at the START of every BLINK_PERIOD, sine close-open over
// BLINK_TIME; the per-actor phase offset staggers the field
// (synchronized blinking is uncanny). t = 0 with phase 0 is
// eyes-open rest — same convention as anim's wave.
// ============================================================

import * as THREE from 'three';
import { setPrimTransform } from './anim.js';
import { BLINK_PERIOD, BLINK_TIME, PAINT_EDGE } from './config.js';

// Closest point on a solid host to a point p (sphere: the center;
// capsule: the segment point) — the submerge direction must aim INTO
// the host's core, or a stalk-tip eye could slide along the skin.
function hostPoint(p, host, out) {
  const a = new THREE.Vector3(...host.a);
  if (host.b === undefined) return out.copy(a);
  const b = new THREE.Vector3(...host.b);
  const ab = new THREE.Vector3().subVectors(b, a);
  const t = Math.min(Math.max(new THREE.Vector3(...p).sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-8), 0), 1);
  return out.copy(a).addScaledVector(ab, t);
}

const _mat = new THREE.Matrix4();
const _hp = new THREE.Vector3();

export function createBlink(creature, phase = 0) {
  if (!creature.blink || !Array.isArray(creature.blink.eyes)) return null;

  const eyes = creature.blink.eyes
    .map((id) => {
      const idx = creature.prims.findIndex((p) => p.id === id && p.paint);
      if (idx < 0) return null; // graceful: a bad id is a no-op, not a crash
      const prim = creature.prims[idx];
      // Host = nearest solid (the same rule the paint system lives by).
      let host = null;
      let best = Infinity;
      for (const s of creature.prims) {
        if (s.paint || s.negative) continue;
        hostPoint(prim.a, s, _hp);
        const d = _hp.distanceTo(new THREE.Vector3(...prim.a)) - s.r;
        if (d < best) {
          best = d;
          host = s;
        }
      }
      if (!host) return null;
      const dir = hostPoint(prim.a, host, new THREE.Vector3()).sub(new THREE.Vector3(...prim.a));
      if (dir.lengthSq() < 1e-10) dir.set(0, -1, 0); // degenerate: eye AT the core
      dir.normalize();
      return { idx, prim, dir, depth: prim.r * 2 + PAINT_EDGE };
    })
    .filter(Boolean);

  if (eyes.length === 0) return null;

  return {
    eyes, // exposed for suite probes
    // closeT for a given time — pure, probeable.
    closeT(t) {
      const u = (((t + phase) % BLINK_PERIOD) + BLINK_PERIOD) % BLINK_PERIOD / BLINK_TIME;
      return u < 1 ? Math.sin(Math.PI * u) : 0;
    },
    update(t, materials) {
      const c = this.closeT(t);
      for (const e of eyes) {
        _mat.makeTranslation(e.dir.x * e.depth * c, e.dir.y * e.depth * c, e.dir.z * e.depth * c);
        for (const m of materials) {
          setPrimTransform(m, e.idx, e.prim, _mat);
        }
      }
    },
  };
}
