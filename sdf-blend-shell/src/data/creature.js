// ============================================================
// creature.js — the creature IS this data (the post's "~15 lines
// of JSON" idea). Each entry is one SDF primitive:
//
//   id    stable internal name (never shown to a player)
//   type  'capsule' | 'sphere'
//   a     first endpoint [x, y, z]  (sphere: its center)
//   b     second endpoint           (sphere: omit — treated as a)
//   r     radius in world units
//
// The three shapes deliberately OVERLAP — the whole experiment is
// watching those overlaps become seamless.
// ============================================================

export const CREATURE = [
  { id: 'torso', type: 'capsule', a: [-0.55, 0.0, 0.0], b: [0.55, 0.0, 0.0], r: 0.5 },
  { id: 'head', type: 'sphere', a: [-0.95, 0.6, 0.0], r: 0.35 },
  { id: 'arm', type: 'capsule', a: [0.45, 0.25, 0.0], b: [1.25, 0.9, 0.15], r: 0.22 },
];
