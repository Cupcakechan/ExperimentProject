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
// FEWER primitives than this, never more. Raised 12 -> 16 for the
// reference six-legged spider (15 prims); the uCount guard makes unused
// slots near-free per pixel, and the uniform budget (16 mat4 + the vec3
// arrays) stays comfortably inside desktop limits.
export const MAX_PRIMS = 16;

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
export const BACKGROUND_COLOR = 0xeef6f4; // LOOK pass A: pale horizon — the sky dome covers it; this is the fallback clear (resize frames)
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


// The ink line color — read by the R1 screen-space ink pass. (The hull
// draw's world-unit OUTLINE_WIDTH retired with the hull at R-SIMPLIFY.)
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
// The body is a MASS: it low-passes the stride. sin^2 softened each
// hump's endpoints, but discrete full-range humps at the irregular
// drift-triggered step cadence still read as convulsing — the
// suspension smoothing turns them into one continuous sway.
// Lower = heavier body.
export const LIFT_SMOOTH = 5.0;

// Squash & stretch (A3.2), hop-driven via endpoint deformation (see
// feel.js squashEndpoints). Amounts are the endpoint HALF-splits in
// world units; per-creature overridable via hop.squash / hop.stretch /
// hop.squashPrim (?? these defaults / 'body').
export const SQUASH_AMOUNT = 0.07;
export const STRETCH_AMOUNT = 0.09;

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

// The stage floor color (the terrarium's inner flat band uses it, so the
// old disc's look survives seamlessly). LOOK pass A: pastel mint (the
// reference's day key) — trails, shadows, and the terrain band all fade
// toward THIS constant, so the whole ground family re-keys from one line.
export const GROUND_COLOR = 0xc6e7d2; // feel round: one saturation step (was 0xd2ecdc — read white between the dots even unfogged)

// C3 TERRARIUM. The load-bearing value is WORLD_FLAT_RADIUS: terrain
// height is EXACTLY 0 inside it, and it must exceed the roam hard clamp
// (suite-enforced) — the locomotion stack lives on a flat y=0 plane and
// the world is built AROUND that plane, never through it. Hills and
// props are scenery beyond creature reach.
export const WORLD_SEED = 1; // the world is data too: one seed, one world
export const WORLD_RADIUS = 9;
export const WORLD_FLAT_RADIUS = 4.2; // > ROAM_HARD_RADIUS 4 (replaces GROUND_RADIUS 4.6)
export const WORLD_HILL_HEIGHT = 0.55; // gentle: tall enough to silhouette, low enough to keep the cast the skyline
export const WORLD_COLOR_MOSS = 0xb2ddc0; // height bands (palette discipline): GROUND_COLOR -> moss -> rock — LOOK pass A: pastel family, moss a step deeper than the floor
export const WORLD_COLOR_ROCK = 0xc9d6cf; // pale sage crest: aerial-perspective light, the fog finishes the fade
export const WORLD_ROCK_COUNT = 26;
export const WORLD_GRASS_COUNT = 90;
export const WORLD_PROP_MIN_R = 4.4; // props strictly outside creature space — no collision question exists
export const WORLD_PINE_COUNT = 18; // conifer ring accents (the banked LAAS pattern)
export const WORLD_PINE_MIN_H = 0.1; // terrain-AWARE band: pines accept MID-SLOPE sites only —
export const WORLD_PINE_MAX_H = 0.45; // not the flat skirt, not the crests (rocks/grass keep their judged placement)
export const WORLD_PINE_SPACING = 2.2; // min pine-to-pine distance: crowns at max scale (r ~1.0) never merge, so the ink draws each tree its OWN silhouette
export const ACTOR_CAP = 24; // populate/generate/import all respect it (perf: one draw + heavy fragment work per actor)

// Footprint trails (the banked sand-tracks technique): an instanced
// ring buffer of ground decals fading BY COLOR into GROUND_COLOR —
// no textures, no transparency. Grounded creatures only.
export const TRAIL_CAP = 240; // ring size: a crowded stage recycles faster (a lever, not a flaw)
export const TRAIL_LIFETIME = 9; // seconds from strike to seamless vanish
export const TRAIL_COLOR = 0xb4d9c2; // print-dark, LOW contrast (the first-round lesson holds: an imprint whispers) — re-keyed to the mint stage, fades to GROUND_COLOR exactly
export const TRAIL_Y = 0.002; // above the stage: ~50x below the ink threshold, no line
export const TRAIL_SLIDE_SPACING = 0.35; // slug drag-dab interval (world units)

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

// Blink (A4 stage 2): eye decals submerge into their host briefly — the
// "lid" is just the skin color returning (zero shader change; pure
// setPrimTransform lockstep, absolute from rest). Deterministic schedule:
// one blink per PERIOD, lasting BLINK_TIME (sine close-open), phase-offset
// per actor so the field never blinks in unison.
export const BLINK_PERIOD = 4.2;
export const BLINK_TIME = 0.18;

// Hop-mouth (A4 stage 2; R3: the mouth is a PAINT DECAL): hopper's mouth
// JAW-DROPS through the AIR arc — a rotation about the body center
// (sd-neutral on the spherical body) plus a small outward PUSH that makes
// the open mouth poke HARDER (rest sd -0.024; full open -0.012 — the arc
// stays inside the decal band, hand-computed, suite-walked live).
export const MOUTH_OPEN_ANGLE = 0.22; // rad, at the apex
export const MOUTH_OPEN_PUSH = 0.012; // world units outward, at the apex

// Two-segment knees (A5). A kneed leg = thigh + shin; the knee is solved
// by two-bone IK (law of cosines) with the bend direction taken from the
// REST POSE (the authored knee offset off the hip-foot line — no pole
// field: intent lives in the data). The pin clamps to the reachable
// annulus: never straighter than STRAIGHT_FRAC of full extension (a
// locked knee pops), never more folded than MIN_GAP of |L1 - L2|.
export const KNEE_STRAIGHT_FRAC = 0.995;
export const KNEE_MIN_GAP = 1.05;

// R1 screen-space ink (depth-only). The inverted-hull ink DRAW is replaced
// by a post-process edge detect on the depth buffer: smooth blends are
// depth-continuous, so the concave-crease seam family (knee rings,
// body-exit slashes) cannot ink — deleted by construction, not by tuning.
// OUTLINE_COLOR still supplies the line color.
export const INK_PX = 6.0; // line weight in CSS pixels (the old 0.035-world hull reads ~7 px at the default camera — near parity; screen-constant, so it no longer thickens on zoom)
export const INK_DEPTH_THRESHOLD = 0.02; // relative depth step that inks: step/nearest > this (lower = more interior lines + ground-noise risk; higher = silhouettes only)
// Limb-read feel pass: INTERIOR lines (creature-depth on both sides —
// leg-over-leg crescents, belly-overhang lines, eye rings) render at this
// strength; OUTER silhouettes (background/ground behind the edge) stay
// full black. The clustered leg contours are REAL occlusion edges, so no
// threshold can quiet them without killing wanted lines — class-based
// fading can. 1.0 = uniform ink (the exact pre-pass look, the revert).
export const INK_INTERIOR = 0.45;

// CONTACT SHADOWS (research build 1): one soft blob decal per actor —
// the grounding read the unlit creatures lack. Analytic (no render
// target; the SS9 depth-RT mechanism stays banked): the blob is the
// rest solids' XZ extent, and ONE altitude law drives spread + a
// color-fade toward GROUND_COLOR (the trails mechanism turned
// vertical) — a hop reads "left the ground" mid-arc, a hover creature
// keeps a faint wide blob. depthWrite OFF = ink-blind by construction.
export const SHADOW_COLOR = 0x93bda4; // darker than TRAIL_COLOR: the anchor outranks the whisper (prints stay readable INSIDE a shadow) — re-keyed gray-green for the mint stage
export const SHADOW_Y = 0.001; // above the stage, BELOW TRAIL_Y 0.002 — prints layer on top of shadows
export const SHADOW_SCALE = 0.9; // inset vs the raw extent: contact darkness concentrates under mass, not at the silhouette's outermost tip
export const SHADOW_SPREAD = 0.35; // extra size per world unit of altitude (a lifted body throws a wider, softer blob; mild — the fade carries the story)
export const SHADOW_FADE_H = 0.25; // the HALF-FADE altitude: fade = h/(h + this). Hop peak 0.24 ~ half-faded at the apex; Bloop's 0.55 hover keeps a ~1/3-strength blob

// LOOK TRACK pass A — the stage re-key (reference: the original post's
// pastel day). The sky is a vertex-gradient dome (horizon -> zenith);
// distance fog fades the ground and props INTO the horizon color
// (aerial perspective — creatures are ShaderMaterial, fog-IMMUNE by
// construction, and live inside the fog's near plane anyway); soft
// blob dots pattern the flat floor. Ink weight/color is PASS C's
// subject; the shading model (bands, ambient, specular) is PASS B's.
export const SKY_TOP = 0x87c8ec; // zenith blue (sampled from the reference key)
export const SKY_HORIZON = 0xeef6f4; // the pale band the world fades into — also the fog color and the fallback clear
export const FOG_NEAR = 13; // camera-relative — MEASURED at the default orbit (camera ~10.3 from center): the shipped 7 fogged the field CENTER 30% and the pine ring 87% toward near-white (the white-out report); 13 puts the play area at 0%
export const FOG_FAR = 24; // far pine ring lands ~32% faded: aerial softening only where it belongs
export const GROUND_DOT_COLOR = 0xa6d6b9; // a step deeper than the floor: pattern, not obstacle
export const WORLD_DOT_COUNT = 150; // seeded, own stream (never reshuffles the props)
export const WORLD_DOT_MIN_S = 0.14; // dot diameter range, world units —
export const WORLD_DOT_MAX_S = 0.42; // varied enough to read hand-placed
export const DOT_Y = 0.0005; // the floor-pattern layer: UNDER shadows (0.001) and prints (0.002)

// LOOK TRACK pass B — the shading model. The research doc's SS1
// reconstruction ("quantized toon shading") was WRONG: Daniel's
// reference screenshots show SOFT airbrushed shading with a glossy
// specular (the vinyl-toy read), no banding anywhere. The artifact
// wins — half-Lambert wrap (bodies stay round and bright, darkness
// pools only at the lower rim, never crushed) + Blinn-Phong gloss.
// All three ride LIVE uniforms so feel rounds can drive them like uK.
export const SHADE_AMBIENT = 0.55; // the lighting floor: bottom-of-body brightness relative to full light (reference bottoms read ~0.55-0.65)
export const SPEC_POWER = 48; // Blinn-Phong exponent: higher = tighter, glassier streak
export const SPEC_STRENGTH = 0.35; // highlight intensity — the vinyl gloss (0 = matte revert, one value)
