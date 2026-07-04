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
export const CAMERA_START = [-4.4, 3.6, 8.6]; // x, y, z — same angle, distance scaled to the expanded field
export const ORBIT_TARGET = [0, 0.45, 0]; // center of the field
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

// Burial ramp width (world units of depth): the tuck fades IN over this
// band instead of switching on at BURY_EPS. Binary tucking made 0.055-tall
// triangle cliffs at every burial boundary, whose back faces flashed as
// black slivers in the ink pass. Bigger = softer creases; smaller = crisper.
export const BURY_BAND = 0.04;

// Roaming (root motion): the whole creature drifts around the stage.
// Heading integrates a sum-of-sines turn rate (deterministic — no RNG),
// plus a steering term that bends it back toward center beyond the soft
// radius. Speeds are world units / second; turn params are rad/s.
export const ROAM_SPEED = 0.35;
export const ROAM_SOFT_RADIUS = 3.0; // beyond this, steering ramps in (field-sized)
export const ROAM_STEER_GAIN = 2.2;
export const ROAM_TURN_A = 1.2;
export const ROAM_TURN_W1 = 0.7;
export const ROAM_TURN_B = 0.9;
export const ROAM_TURN_W2 = 1.9;
export const ROAM_TURN_PHASE = 2.0;

// Idle bob is RETIRED (A3.1): walkers' body lift is now STEP-SYNCED —
// it derives from the actual stride, so resting creatures are genuinely
// still and the breath shows. (actor.bobPhase survives as the breath
// decorrelator.)
// STRIDE_LIFT: body rise at mid-swing. LEAN_*: banking into turns —
// roll = clamp(GAIN * heading angular velocity, +-LEAN_MAX), smoothed
// at LEAN_SMOOTH (1/s) so wander jitter never wobbles the body.
export const STRIDE_LIFT = 0.03;
export const LEAN_GAIN = 0.35;
export const LEAN_MAX = 0.18; // rad (~10 degrees)
export const LEAN_SMOOTH = 6.0;

// The field (all creatures share one stage). Separation steering: each
// roamer turns away from any neighbor inside SEP_RADIUS, gain scaled by
// how deep the intrusion is — same proportional-steering pattern as the
// boundary. Spawns sit on a ring so nobody starts inside anybody.
export const ROAM_SEP_RADIUS = 1.4;
export const ROAM_SEP_GAIN = 3.0;
// Heading steering alone cannot GUARANTEE separation (measured: two
// roamers reached 0.008 apart) — the positional push is the guarantee:
// units/second of shove per unit of intrusion depth.
export const ROAM_SEP_PUSH = 2.5;
export const ROAM_SPAWN_RADIUS = 1.9;
// Hard clamp: steering fights (boundary vs separation) can push a roamer
// well past the soft radius (measured at the ORIGINAL scale: overshoot to
// r=3.29 vs soft 1.8 — past the then-2.9 ground disc). The clamp is the
// guarantee at any scale; the suite re-measures the max every run.
export const ROAM_HARD_RADIUS = 4.0;

// Ground disc: a flat, unlit stage floor (toon look wants flat). Radius
// must exceed the roamers' hard extent (soft radius + overshoot) so nobody
// ever wanders off the edge of the world — suite-enforced.
export const GROUND_RADIUS = 4.6;
export const GROUND_COLOR = 0x1b1f24;

// Reactive gait (stage 3). A planted foot steps when its HOME (rest spot
// carried by the body) drifts more than STEP_TRIGGER away; the swing takes
// STEP_TIME seconds, arcs STEP_LIFT high, and lands STEP_LEAD_TIME of body
// velocity AHEAD of home (so feet keep up instead of always trailing).
export const STEP_TRIGGER = 0.22;
export const STEP_TIME = 0.22;
export const STEP_LIFT = 0.09;
export const STEP_LEAD_TIME = 0.15;

// Leg stretch clamp: the pin may stretch/compress the leg only this far
// (ratio of rest length). Beyond it the pin SLIPS along the leg axis
// instead — measured failure without it: Hopper's horizontal feet crumpled
// to 0.18x rest length when the hip walked over a planted toe.
export const STRETCH_MIN = 0.55;
export const STRETCH_MAX = 1.6;

// Hop state machine (roadmap A1). The creature RESTS until its logical
// roam position drifts HOP_TRIGGER ahead, then CROUCH -> AIR -> LAND ->
// back to rest. The displayed body bursts between points on the logical
// path, so average speed self-regulates to ROAM_SPEED and roam's
// separation/boundary math stays untouched (it steers the LOGICAL point;
// the displayed body lags it by at most ~trigger + a crouch of drift).
export const HOP_TRIGGER = 0.32; // logical drift that launches a hop
export const HOP_CROUCH_TIME = 0.16;
export const HOP_AIR_TIME = 0.34;
export const HOP_LAND_TIME = 0.14;
export const HOP_REST_MIN = 0.2; // minimum grounded time between hops
// Peak height above ground. NOTE: mid-hop the creature briefly exceeds
// the stage's REST-pose top bound (a framing rule, not a physics one) —
// hopper's ear tips peak ~1.78 for a few frames; accepted.
export const HOP_HEIGHT = 0.24;
export const HOP_CROUCH_DIP = 0.07; // body sink while loading + absorbing
export const HOP_LEAD_TIME = 0.1; // land this much logical velocity AHEAD
export const HOP_FOOT_TUCK = 0.07; // feet pull up toward the body in AIR

// Idle (A2 follow-up): roamers periodically stop walking so life that
// only shows at rest (breathing!) gets stage time. A deterministic
// schedule keyed to the wander clock (already seed-offset, so idles
// decorrelate for free); the speed envelope ramps 1 -> 0 -> 1 with
// smoothstep shoulders — creatures decelerate into the idle and ease
// back out instead of slamming to a statue. Because gait steps and hops
// launch on LOGICAL DRIFT, both stop automatically when roam stops —
// zero changes in gait.js or hop.js. Separation (turn + push) and
// boundary steering stay at FULL strength while idle.
export const IDLE_PERIOD = 9.0; // seconds per walk+idle cycle
export const IDLE_DURATION = 2.8; // idle window inside each cycle
export const IDLE_RAMP = 0.6; // decelerate/accelerate shoulder
export const IDLE_TURN_FACTOR = 0.35; // wander turning kept while idle (looking around)
