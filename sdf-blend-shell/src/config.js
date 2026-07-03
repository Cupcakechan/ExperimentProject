// ============================================================
// config.js — all tunables for the blend-shell experiment.
// Change values here; no other file hardcodes these.
// ============================================================

// How "melty" the joins are, in world units. Bigger = wider, softer fillets
// where primitives meet. 0.05 is nearly a hard union; 0.5 is very blobby.
export const BLEND_K = 0.25;

// Slider range for uK (Stage B). Min stays above 0 — smin divides by k.
export const K_MIN = 0.02;
export const K_MAX = 0.6;
export const K_STEP = 0.01;

// How many times each vertex slides toward the blended surface per frame.
// 5 converges cleanly for shapes this size; raise it only if you see vertices
// visibly hovering off the surface.
export const SNAP_ITERS = 5;

// Uniform array capacity compiled into the shader. The creature may define
// FEWER primitives than this, never more.
export const MAX_PRIMS = 8;

// Fallback color for any primitive that omits its own (guards hand-authored
// registry entries — a colorless prim must never break the shader).
export const SHELL_COLOR = 0x4fd1a5;

// Color blending by SDF proximity (Stage B). Weight = 1 / (d + SOFT)^POW.
// SOFT is the "contact sharpness" floor: smaller = crisper color ownership
// right at a primitive's surface. POW is how fast influence falls off with
// distance: higher = narrower color gradients at the joins.
export const COLOR_SOFT = 0.015;
export const COLOR_POW = 2.0;

// Procedural wave (Stage B): which primitive moves, and how.
// The prim's endpoint b rotates around its endpoint a — a shoulder joint.
export const ANIM_PRIM_ID = 'arm';
export const WAVE_AXIS = [0, 0, 1]; // rotate in the XY plane (arm waves up/down)
export const WAVE_AMPLITUDE = 0.5; // radians each way from rest pose
export const WAVE_SPEED = 1.6; // wave frequency (radians of phase per second)

// Scene / camera
export const BACKGROUND_COLOR = 0x14161a;
export const CAMERA_FOV = 50;
export const CAMERA_START = [0, 1.1, 3.8]; // x, y, z
export const ORBIT_TARGET = [0, 0.25, 0]; // roughly the creature's center of mass
// Buried-geometry tuck (seam fix). A vertex starting inside a DIFFERENT
// primitive sinks this far beneath the skin instead of z-fighting the mesh
// that owns that patch of surface. BURY_EPS is the dead-zone so vertices
// merely TOUCHING another primitive's surface don't flicker between states.
export const TUCK_DEPTH = 0.02;
export const BURY_EPS = 0.005;
