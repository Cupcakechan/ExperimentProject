// ============================================================
// creatures.js — the GALLERY. Each entry is one self-contained
// creature (the post's "endless critters from JSON" idea):
//
//   id / name   internal id, display name
//   prims       SDF primitives (schema unchanged from creature.js:
//               id, type, a, b?, r, color?, paint?)
//   kCap (per prim, optional) — blend-radius CEILING for that prim:
//               it never blends wider than this, no matter the global k.
//               The post's thin-part trick: thin appendages keep their
//               shape instead of dissolving into big neighbors.
//   anim        optional single-prim wave:
//               { primId, axis, amplitude (rad), speed (rad/s) }
//               The prim's endpoint b rotates about its endpoint a.
//
// AUTHORING RULES (the constraints that make a creature come out
// right — this list is skill material):
//   - Shared stage: fit within x -1.3..1.3, ground y=0, top y < 1.7
//     (one global camera serves every creature).
//   - Creatures FACE -X (camera opens angled toward the face).
//   - Solid + paint prims combined <= MAX_PRIMS (12).
//   - Paint decal on a host: -r < dist(center, host surface) < 0
//     (anchored inside, poking through) — suite-enforced.
//   - Pupils sit ON the sclera's ray, slightly further out; pupil
//     entries come AFTER sclera entries (decal order) — suite-enforced.
//   - Anim moves ONE prim; attached prims do NOT follow (don't
//     animate a neck that carries a head — animate tails/ears).
//   - Thin parts near big masses melt unless capped: give any prim
//     with r < ~0.18 that joins a bigger mass a kCap of roughly its
//     own r * 0.7 — below that the cap starts to read as a hard seam.
// ============================================================

export const CREATURES = [
  {
    id: 'critter',
    name: 'Critter',
    anim: { primId: 'tail', axis: [1, 0, 0], amplitude: 0.6, speed: 2.5 },
    prims: [
      { id: 'body', type: 'capsule', a: [-0.5, 0.55, 0.0], b: [0.5, 0.55, 0.0], r: 0.42, color: 0x4fd1a5 },
      { id: 'head', type: 'sphere', a: [-0.85, 0.95, 0.0], r: 0.32, color: 0xf2b05a },
      { id: 'leg_fl', type: 'capsule', a: [-0.42, 0.45, 0.22], b: [-0.46, 0.08, 0.26], r: 0.13, color: 0x3bbd8e },
      { id: 'leg_fr', type: 'capsule', a: [-0.42, 0.45, -0.22], b: [-0.46, 0.08, -0.26], r: 0.13, color: 0x3bbd8e },
      { id: 'leg_bl', type: 'capsule', a: [0.42, 0.45, 0.22], b: [0.46, 0.08, 0.26], r: 0.13, color: 0x3bbd8e },
      { id: 'leg_br', type: 'capsule', a: [0.42, 0.45, -0.22], b: [0.46, 0.08, -0.26], r: 0.13, color: 0x3bbd8e },
      { id: 'tail', type: 'capsule', a: [0.5, 0.7, 0.0], b: [1.05, 1.05, 0.0], r: 0.14, color: 0x6f8cff },
      { id: 'sclera_l', type: 'sphere', a: [-1.05, 1.03, 0.14], r: 0.095, color: 0xf2f4f6, paint: true },
      { id: 'sclera_r', type: 'sphere', a: [-1.05, 1.03, -0.14], r: 0.095, color: 0xf2f4f6, paint: true },
      { id: 'pupil_l', type: 'sphere', a: [-1.09, 1.05, 0.15], r: 0.04, color: 0x1b1f26, paint: true },
      { id: 'pupil_r', type: 'sphere', a: [-1.09, 1.05, -0.15], r: 0.04, color: 0x1b1f26, paint: true },
    ],
  },
  {
    id: 'hopper',
    name: 'Hopper',
    // Ears wiggle (a neck-free prim — safe to animate; see authoring rules).
    anim: { primId: 'ear_l', axis: [1, 0, 0], amplitude: 0.3, speed: 3.2 },
    prims: [
      { id: 'body', type: 'sphere', a: [0.0, 0.62, 0.0], r: 0.5, color: 0xcf6fc9 },
      { id: 'foot_l', type: 'capsule', a: [-0.05, 0.16, 0.18], b: [-0.38, 0.12, 0.22], r: 0.15, color: 0x9b4f96 },
      { id: 'foot_r', type: 'capsule', a: [-0.05, 0.16, -0.18], b: [-0.38, 0.12, -0.22], r: 0.15, color: 0x9b4f96 },
      { id: 'ear_l', type: 'capsule', a: [-0.05, 1.0, 0.15], b: [-0.12, 1.38, 0.22], r: 0.16, color: 0xe09ade },
      { id: 'ear_r', type: 'capsule', a: [-0.05, 1.0, -0.15], b: [-0.12, 1.38, -0.22], r: 0.16, color: 0xe09ade },
      { id: 'sclera_l', type: 'sphere', a: [-0.42, 0.78, 0.16], r: 0.12, color: 0xf2f4f6, paint: true },
      { id: 'sclera_r', type: 'sphere', a: [-0.42, 0.78, -0.16], r: 0.12, color: 0xf2f4f6, paint: true },
      { id: 'pupil_l', type: 'sphere', a: [-0.423, 0.781, 0.161], r: 0.055, color: 0x241a28, paint: true },
      { id: 'pupil_r', type: 'sphere', a: [-0.423, 0.781, -0.161], r: 0.055, color: 0x241a28, paint: true },
    ],
  },
  {
    id: 'longneck',
    name: 'Longneck',
    // Tail wags — NOT the neck: the head would not follow it (see rules).
    anim: { primId: 'tail', axis: [1, 0, 0], amplitude: 0.7, speed: 2.8 },
    prims: [
      { id: 'body', type: 'capsule', a: [-0.35, 0.55, 0.0], b: [0.45, 0.55, 0.0], r: 0.38, color: 0xe8b04b },
      { id: 'neck', type: 'capsule', a: [-0.35, 0.6, 0.0], b: [-0.75, 1.35, 0.0], r: 0.17, kCap: 0.12, color: 0xe8b04b },
      { id: 'head', type: 'sphere', a: [-0.85, 1.45, 0.0], r: 0.22, color: 0xdf9b3f },
      { id: 'leg_fl', type: 'capsule', a: [-0.28, 0.45, 0.18], b: [-0.3, 0.08, 0.21], r: 0.11, color: 0xcf8f39 },
      { id: 'leg_fr', type: 'capsule', a: [-0.28, 0.45, -0.18], b: [-0.3, 0.08, -0.21], r: 0.11, color: 0xcf8f39 },
      { id: 'leg_bl', type: 'capsule', a: [0.38, 0.45, 0.18], b: [0.4, 0.08, 0.21], r: 0.11, color: 0xcf8f39 },
      { id: 'leg_br', type: 'capsule', a: [0.38, 0.45, -0.18], b: [0.4, 0.08, -0.21], r: 0.11, color: 0xcf8f39 },
      { id: 'tail', type: 'capsule', a: [0.45, 0.62, 0.0], b: [0.85, 0.85, 0.0], r: 0.1, kCap: 0.07, color: 0xdf9b3f },
      { id: 'sclera_l', type: 'sphere', a: [-1.0, 1.5, 0.09], r: 0.065, color: 0xf2f4f6, paint: true },
      { id: 'sclera_r', type: 'sphere', a: [-1.0, 1.5, -0.09], r: 0.065, color: 0xf2f4f6, paint: true },
      { id: 'pupil_l', type: 'sphere', a: [-1.015, 1.505, 0.099], r: 0.03, color: 0x2a2118, paint: true },
      { id: 'pupil_r', type: 'sphere', a: [-1.015, 1.505, -0.099], r: 0.03, color: 0x2a2118, paint: true },
    ],
  },
];
