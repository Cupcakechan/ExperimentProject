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
//   k (per prim, optional) — ABSOLUTE blend radius (world units) for
//               that prim's folds: authored final intent, holds against
//               the slider (which keeps driving unauthored prims). kCap
//               still ceilings it. Use kCap for "never wider than";
//               use k for "exactly this, always". Must be > 0 if set.
//   inflate (per CREATURE, optional) — whole-body dilate (world units):
//               the skin sits this far outside the raw field everywhere
//               ("plumpness" — same skeleton, chubbier species, one
//               number). 0/absent = none. Keep it well under the
//               thinnest prim radius and mind the stage bounds: the
//               whole silhouette grows by this amount, including
//               downward past y=0 (hidden by the ground disc).
//   negative (per prim, optional) — CARVE prim (smooth difference):
//               subtracted from the union of ALL solids, so its registry
//               position never changes the result. No mesh, no burial,
//               never a foot. Optional color = the bowl's interior tint
//               (mouth darkness); colorless = the host's color lines
//               the dent.
//   anim        optional single-prim wave:
//               { primId, axis, amplitude (rad), speed (rad/s) }
//               The prim's endpoint b rotates about its endpoint a.
//   step        optional reactive gait: { feet: [leg prim ids],
//               groups: [[feet indices]] }. Feet PLANT in the world and
//               step when their home drifts past STEP_TRIGGER; only one
//               group swings at a time (diagonal pairs for quadrupeds,
//               alternating singles for bipeds — leg count is pure data).
//               A foot prim must be a capsule whose b is the GROUND end.
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
//   - Carves: DENT, don't pierce — keep the carve shallower than its
//     host (a tunnel is topology the host mesh cannot express; verts
//     would fold). Give carves a kCap ~0.7*r like thin parts, or high
//     k erases the feature. Keep the carve's surface footprint
//     comfortably wider than the host's inter-vertex spacing or the
//     bowl looks starved (levers: sphere segments in buildShell,
//     CAPSULE_RINGS_PER_UNIT for capsule hosts).
// ============================================================

export const CREATURES = [
  {
    id: 'critter',
    name: 'Critter',
    anim: { primId: 'tail', axis: [1, 0, 0], amplitude: 0.6, speed: 2.5 },
    step: { feet: ['leg_fl', 'leg_fr', 'leg_bl', 'leg_br'], groups: [[0, 3], [1, 2]] },
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
    // Two feet, alternating — the "same system handles 2 or 4 legs" claim.
    step: { feet: ['foot_l', 'foot_r'], groups: [[0], [1]] },
    prims: [
      { id: 'body', type: 'sphere', a: [0.0, 0.62, 0.0], r: 0.5, color: 0xcf6fc9 },
      { id: 'foot_l', type: 'capsule', a: [-0.05, 0.16, 0.18], b: [-0.38, 0.12, 0.22], r: 0.15, color: 0x9b4f96 },
      { id: 'foot_r', type: 'capsule', a: [-0.05, 0.16, -0.18], b: [-0.38, 0.12, -0.22], r: 0.15, color: 0x9b4f96 },
      { id: 'ear_l', type: 'capsule', a: [-0.05, 1.0, 0.15], b: [-0.12, 1.38, 0.22], r: 0.16, color: 0xe09ade },
      { id: 'ear_r', type: 'capsule', a: [-0.05, 1.0, -0.15], b: [-0.12, 1.38, -0.22], r: 0.16, color: 0xe09ade },
      // The demo CARVE: a dark mouth dented into the face. Center sits
      // 0.053 OUTSIDE the body surface with r 0.16 -> a 0.107-deep,
      // ~0.30-wide bowl (dent, not pierce); kCap 0.11 (~0.7*r) keeps it
      // from being erased at high slider k; the color tints the bowl and
      // fades at the rim. Delete this one line to remove the mouth.
      { id: 'mouth', type: 'sphere', a: [-0.54, 0.5, 0.0], r: 0.16, kCap: 0.11, negative: true, color: 0x2b1626 },
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
    step: { feet: ['leg_fl', 'leg_fr', 'leg_bl', 'leg_br'], groups: [[0, 3], [1, 2]] },
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
  {
    id: 'pudge',
    name: 'Pudge',
    // First user of INFLATE (Pass 3): same skeleton reads chubbier by one
    // number. 0.04 stays well under the thinnest solid r (tail 0.11).
    inflate: 0.04,
    anim: { primId: 'tail', axis: [0, 1, 0], amplitude: 0.5, speed: 3.0 },
    step: { feet: ['leg_fl', 'leg_fr', 'leg_bl', 'leg_br'], groups: [[0, 3], [1, 2]] },
    // 12 prims — exactly at MAX_PRIMS: the capacity ceiling, demonstrated.
    prims: [
      { id: 'body', type: 'sphere', a: [0.05, 0.5, 0.0], r: 0.4, color: 0x8fb4e3 },
      { id: 'head', type: 'sphere', a: [-0.52, 0.72, 0.0], r: 0.26, color: 0xa7c7ec },
      { id: 'leg_fl', type: 'capsule', a: [-0.28, 0.38, 0.2], b: [-0.3, 0.08, 0.23], r: 0.12, kCap: 0.08, color: 0x6f9bd1 },
      { id: 'leg_fr', type: 'capsule', a: [-0.28, 0.38, -0.2], b: [-0.3, 0.08, -0.23], r: 0.12, kCap: 0.08, color: 0x6f9bd1 },
      { id: 'leg_bl', type: 'capsule', a: [0.34, 0.38, 0.2], b: [0.36, 0.08, 0.23], r: 0.12, kCap: 0.08, color: 0x6f9bd1 },
      { id: 'leg_br', type: 'capsule', a: [0.34, 0.38, -0.2], b: [0.36, 0.08, -0.23], r: 0.12, kCap: 0.08, color: 0x6f9bd1 },
      { id: 'tail', type: 'capsule', a: [0.42, 0.55, 0.0], b: [0.62, 0.68, 0.0], r: 0.11, kCap: 0.08, color: 0x7fa8dd },
      // Second carve in the gallery, first CARVE + DILATE combo: the dent
      // survives dilation because the whole surface offsets together.
      { id: 'mouth', type: 'sphere', a: [-0.78, 0.64, 0.0], r: 0.1, kCap: 0.07, negative: true, color: 0x2d2438 },
      { id: 'sclera_l', type: 'sphere', a: [-0.72, 0.8, 0.11], r: 0.075, color: 0xf2f4f6, paint: true },
      { id: 'sclera_r', type: 'sphere', a: [-0.72, 0.8, -0.11], r: 0.075, color: 0xf2f4f6, paint: true },
      { id: 'pupil_l', type: 'sphere', a: [-0.73, 0.804, 0.1155], r: 0.032, color: 0x1e2430, paint: true },
      { id: 'pupil_r', type: 'sphere', a: [-0.73, 0.804, -0.1155], r: 0.032, color: 0x1e2430, paint: true },
    ],
  },
  {
    id: 'snail',
    name: 'Shelby',
    // NO anim and NO step — a snail SLIDES (roam moves the rig; the gait
    // null path and the animPrimIndex -1 no-op get their first live users,
    // by design not omission). The antennae carry eye decals, so per the
    // authoring rules they must never be the animated prim.
    prims: [
      { id: 'body', type: 'capsule', a: [-0.55, 0.18, 0.0], b: [0.45, 0.18, 0.0], r: 0.18, color: 0xd9c47a },
      { id: 'head', type: 'sphere', a: [-0.62, 0.35, 0.0], r: 0.16, color: 0xdfcc85 },
      // First user of ABSOLUTE k (Pass 2): the shell-body join blends at
      // 0.06, PERIOD — crank the slider to 0.6 and the shell stays a
      // crisp, distinct shell while everything else melts (authored
      // intent holding against ambient control, visible in one look).
      { id: 'shell', type: 'sphere', a: [0.1, 0.52, 0.0], r: 0.34, k: 0.06, color: 0x9a6fb8 },
      { id: 'antenna_l', type: 'capsule', a: [-0.66, 0.44, 0.06], b: [-0.8, 0.7, 0.1], r: 0.06, kCap: 0.04, color: 0xcbb56e },
      { id: 'antenna_r', type: 'capsule', a: [-0.66, 0.44, -0.06], b: [-0.8, 0.7, -0.1], r: 0.06, kCap: 0.04, color: 0xcbb56e },
      // Dot eyes ON the stalk tips (single dark decals, not sclera+pupil
      // layering: the pupil-fits-in-sclera math assumes a SPHERICAL host,
      // and these ride capsules — the id prefix 'eye_' keeps them out of
      // the layered-decal probe on purpose).
      { id: 'eye_l', type: 'sphere', a: [-0.815, 0.725, 0.11], r: 0.045, color: 0x2a2430, paint: true },
      { id: 'eye_r', type: 'sphere', a: [-0.815, 0.725, -0.11], r: 0.045, color: 0x2a2430, paint: true },
    ],
  },
];
