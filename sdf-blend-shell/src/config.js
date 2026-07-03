// ============================================================
// config.js — all tunables for the blend-shell experiment.
// Change values here; no other file hardcodes these.
// ============================================================

// How "melty" the joins are, in world units. Bigger = wider, softer fillets
// where primitives meet. 0.05 is nearly a hard union; 0.5 is very blobby.
export const BLEND_K = 0.25;

// How many times each vertex slides toward the blended surface per frame.
// 5 converges cleanly for shapes this size; raise it only if you see vertices
// visibly hovering off the surface.
export const SNAP_ITERS = 5;

// Uniform array capacity compiled into the shader. The creature may define
// FEWER primitives than this, never more.
export const MAX_PRIMS = 8;

// Single shell color for Stage A (per-primitive colors arrive in Stage B).
export const SHELL_COLOR = 0x4fd1a5;

// Scene / camera
export const BACKGROUND_COLOR = 0x14161a;
export const CAMERA_FOV = 50;
export const CAMERA_START = [0, 1.1, 3.8]; // x, y, z
export const ORBIT_TARGET = [0, 0.25, 0]; // roughly the creature's center of mass
