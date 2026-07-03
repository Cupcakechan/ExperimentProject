// ============================================================
// creature.js — the creature IS this data (the post's "~15 lines
// of JSON" idea). Each entry is one SDF primitive:
//
//   id     stable internal name (never shown to a player)
//   type   'capsule' | 'sphere'
//   a      first endpoint [x, y, z]  (sphere: its center)
//   b      second endpoint           (sphere: omit — treated as a)
//   r      radius in world units
//   color  hex color (optional — falls back to SHELL_COLOR)
//   paint  true = COLOR-ONLY prim (optional, default false): tints
//          the skin via proximity color but has NO surface — skipped
//          by the SDF, the burial check, and geometry building.
//          Used for the eyes: dark spheres poking just through the
//          head's skin, painted onto it like a decal.
//
// The critter: body + head + four legs + a wagging tail (solid),
// plus two painted eyes. A paint prim must POKE THROUGH its host's
// skin to be visible: |center - hostCenter| + r > host.r (and stay
// anchored inside: |center - hostCenter| < host.r) — the suite
// checks both, hand-computed.
// ============================================================

export const CREATURE = [
  // body, standing on four legs (belly at y ~0.13, back at y ~0.97)
  { id: 'body', type: 'capsule', a: [-0.5, 0.55, 0.0], b: [0.5, 0.55, 0.0], r: 0.42, color: 0x4fd1a5 },
  // head at the -X end, raised
  { id: 'head', type: 'sphere', a: [-0.85, 0.95, 0.0], r: 0.32, color: 0xf2b05a },
  // four legs: front/back (f/b) x left/right (l/r); slight outward splay
  { id: 'leg_fl', type: 'capsule', a: [-0.42, 0.45, 0.22], b: [-0.46, 0.08, 0.26], r: 0.13, color: 0x3bbd8e },
  { id: 'leg_fr', type: 'capsule', a: [-0.42, 0.45, -0.22], b: [-0.46, 0.08, -0.26], r: 0.13, color: 0x3bbd8e },
  { id: 'leg_bl', type: 'capsule', a: [0.42, 0.45, 0.22], b: [0.46, 0.08, 0.26], r: 0.13, color: 0x3bbd8e },
  { id: 'leg_br', type: 'capsule', a: [0.42, 0.45, -0.22], b: [0.46, 0.08, -0.26], r: 0.13, color: 0x3bbd8e },
  // tail at the +X end, angled up — the animated prim (wags about its a)
  { id: 'tail', type: 'capsule', a: [0.5, 0.7, 0.0], b: [1.05, 1.05, 0.0], r: 0.14, color: 0x6f8cff },
  // eyes: PAINT prims on the head's front-upper surface (critter faces -X).
  // Each eye is TWO layered decals — white sclera, then a dark pupil poking
  // slightly further out along the gaze. REGISTRY ORDER IS THE PAINT ORDER
  // (later entries composite on top), so pupils MUST come after scleras.
  { id: 'sclera_l', type: 'sphere', a: [-1.05, 1.03, 0.14], r: 0.095, color: 0xf2f4f6, paint: true },
  { id: 'sclera_r', type: 'sphere', a: [-1.05, 1.03, -0.14], r: 0.095, color: 0xf2f4f6, paint: true },
  { id: 'pupil_l', type: 'sphere', a: [-1.09, 1.05, 0.15], r: 0.04, color: 0x1b1f26, paint: true },
  { id: 'pupil_r', type: 'sphere', a: [-1.09, 1.05, -0.15], r: 0.04, color: 0x1b1f26, paint: true },
];
