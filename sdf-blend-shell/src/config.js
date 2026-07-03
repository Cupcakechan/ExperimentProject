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
export const MAX_PRIMS = 12;

// Fallback color for any primitive that omits its own (guards hand-authored
// registry entries — a colorless prim must never break the shader).
export const SHELL_COLOR = 0x4fd1a5;

// Color blending by SDF proximity (Stage B). Weight = 1 / (d + SOFT)^POW.
// SOFT is the "contact sharpness" floor: smaller = crisper color ownership
// right at a primitive's surface. POW is how fast influence falls off with
// distance: higher = narrower color gradients at the joins.
export const COLOR_SOFT = 0.015;
export const COLOR_POW = 2.0;

// (The wave animation is now per-creature data — see creatures.js anim.)

// Scene / camera
export const BACKGROUND_COLOR = 0x14161a;
export const CAMERA_FOV = 50;
export const CAMERA_START = [-1.6, 1.3, 3.2]; // x, y, z — angled toward the face
export const ORBIT_TARGET = [0, 0.6, 0]; // roughly the critter's center of mass
// Buried-geometry tuck (seam fix). A vertex starting inside a DIFFERENT
// primitive sinks this far beneath the skin instead of z-fighting the mesh
// that owns that patch of surface. BURY_EPS is the dead-zone so vertices
// merely TOUCHING another primitive's surface don't flicker between states.
export const TUCK_DEPTH = 0.02;
export const BURY_EPS = 0.005;
// Mesh density along a capsule's length (rings per world unit). three r170's
// CapsuleGeometry has NO length subdivisions (measured: zero interior rings),
// so limbs joining a long body mid-cylinder had no vertices to bend into the
// blend fillet — buildShell constructs capsules from cylinder + hemispheres
// using this. Raise it if a join on a LONG capsule still looks starved.
export const CAPSULE_RINGS_PER_UNIT = 14;
// Decal edge softness for PAINT prims, in world units: how far outside a
// paint prim's surface its color fades to nothing. Small = crisp cartoon
// edges (the reference look); larger = airbrushed.
export const PAINT_EDGE = 0.02;
// Toon outline: a second draw of the shell snapped to the surface this far
// OUTSIDE the skin (world units), flat-colored, back faces only. Keep it
// SMALLER than the thinnest solid prim radius or the ink swallows thin
// parts (suite-enforced per creature).
export const OUTLINE_WIDTH = 0.035;
export const OUTLINE_COLOR = 0x0d0f12;