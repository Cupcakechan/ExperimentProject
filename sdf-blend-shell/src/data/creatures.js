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
//   breath (per CREATURE, optional) — the inflate ANIMATES:
//               { amplitude (world units), speed (rad/s) }. The creature
//               inhales from its rest inflate up to inflate + amplitude
//               (0.5*(1-cos): rest at t=0, never deflates below rest).
//               Every consumer follows automatically (burial boundary,
//               carve edge, outline). The suite audits the field at the
//               BREATH PEAK; keep inflate + amplitude under the thinnest
//               solid r.
//   idle (per CREATURE, optional) — roam-level rest schedule override:
//               { period?, duration?, ramp? } (?? config defaults).
//               Roamers stop walking for `duration` out of every
//               `period` seconds (smooth shoulders) — feet plant and
//               hops cease automatically (both are drift-triggered),
//               so breathing gets stage time. duration >= 2*ramp.
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
//   - LEGACY (flat decal eyes): pupils sit ON the sclera's ray, pupil
//     entries AFTER sclera entries (decal order) — still suite-enforced
//     if the pupil_/sclera_ naming is used; the cast now uses BALL EYES.
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
//   - MOUTHS are CAPSULE carves spanning z (a wide slit) — a sphere
//     carve intersects the host in a circle, which reads as a shocked
//     hole, not a mouth (browser-confirmed on the first two carves).
//   - BALL EYES (the CAST STANDARD): a small SOLID white sphere rooted
//     0.015-0.02 inside the head (kCap ~0.03 so it stays a ball), the
//     dark iris a PAINT decal hosted ON the eyeball (nearest-solid
//     hosting finds it). Name irises 'iris_*', not 'pupil_*' (the
//     layering probe assumes a paint pair; here the sclera is solid).
//     BLINK both: eyes: [eyeball_l, eyeball_r, iris_l, iris_r] — a
//     blinked prim submerges toward the nearest solid EXCLUDING other
//     blinked prims, so the iris automatically retargets the body
//     behind its departing eyeball.
//   - KNEES (A5): step.knees maps foot id -> thigh id; the foot prim is
//     the SHIN (keeps its id: feet/groups stay stable), thigh runs
//     hip->knee with thigh.b EXACTLY equal to shin.a. Author the rest
//     pose with a VISIBLE bend (knee >= 0.02 off the hip-foot line) —
//     that offset IS the IK pole; a straight rest leg has no declared
//     fold direction. Keep rest reach under ~97% of L1+L2 so the knee
//     never starts locked. Shins slightly thinner than thighs read
//     leggy. Legs without a knees entry keep single-segment
//     aim-stretch (hopper by design; Skitter by CAPACITY — 6 knees =
//     21 prims > 16, a documented boundary).
//   - BALL-EYE DILATE BOUNDARY (measured): a constant dilate adds to
//     dark and white alike, compressing small-feature contrast toward 1
//     — dark/white = (iris+d)/(ball+d). Ball eyes are only valid where
//     peak dilate (inflate + breath) <= ~1/3 of the eyeball r; beyond
//     it (pudge: 0.06 peak) use FLAT sclera+pupil DECALS, which balloon
//     together and keep the painted read. Suite-enforced.
//   - DECALS BELONG ON LOW-INFLATION SITES (head fronts, tips): decal
//     coverage compensates MEASURED local inflation uncapped, which is
//     correct at sane sites but balloons at high-inflation joins
//     (measured on the abandoned decal-mouth design — probe-killed).
//   - MOUTH K-VALIDITY (measured boundary): a carve reads correctly
//     while union inflation at its site stays UNDER the carve's radius;
//     beyond (pudge near slider k=0.6) the carve geometry is swallowed
//     by the fattened skin and no color model can paint it — that's
//     melt territory, the slider extreme's whole point. Author mouths
//     with r comfortably above the site's expected inflation.
// ============================================================

export const CREATURES = [
  {
    id: 'critter',
    name: 'Critter',
    anim: { primId: 'tail', axis: [1, 0, 0], amplitude: 0.6, speed: 2.5 },
    step: {
      feet: ['leg_fl', 'leg_fr', 'leg_bl', 'leg_br'],
      groups: [[0, 3], [1, 2]],
      // A5: two-segment legs — foot id -> thigh id. The foot prim is the
      // SHIN; the rest pose's knee offset authors the bend direction.
      knees: { leg_fl: 'thigh_fl', leg_fr: 'thigh_fr', leg_bl: 'thigh_bl', leg_br: 'thigh_br' },
      lift: 0.05, // A5.1: lower step — deep lifts fold knees past the ink's crease limit
    },
    blink: { eyes: ['eyeball_l', 'eyeball_r', 'iris_l', 'iris_r'] },
    prims: [
      { id: 'body', type: 'capsule', a: [-0.5, 0.55, 0.0], b: [0.5, 0.55, 0.0], r: 0.42, color: 0x4fd1a5 },
      { id: 'head', type: 'sphere', a: [-0.85, 0.95, 0.0], r: 0.32, color: 0xf2b05a },
      // A5 knees: each leg = thigh (hip->knee) + shin (knee->foot; keeps
      // the original leg id so feet/groups stay id-stable). Knees bend
      // 0.05 toward the face (-X) at rest — the authored offset IS the
      // IK pole. Thigh.b MUST equal shin.a exactly (suite-enforced).
      // A5.1 reference look: DEEPER rest bend (0.07 — the knee reads in
      // the silhouette and juts forward at steps) + HOOF-DARK shins (the
      // reference's 'feet' at zero prim cost; capacity forbids foot prims).
      { id: 'thigh_fl', type: 'capsule', a: [-0.42, 0.45, 0.22], b: [-0.51, 0.265, 0.25], r: 0.13, color: 0x3bbd8e },
      { id: 'leg_fl', type: 'capsule', a: [-0.51, 0.265, 0.25], b: [-0.46, 0.08, 0.26], r: 0.115, color: 0x2a8a67 },
      { id: 'thigh_fr', type: 'capsule', a: [-0.42, 0.45, -0.22], b: [-0.51, 0.265, -0.25], r: 0.13, color: 0x3bbd8e },
      { id: 'leg_fr', type: 'capsule', a: [-0.51, 0.265, -0.25], b: [-0.46, 0.08, -0.26], r: 0.115, color: 0x2a8a67 },
      { id: 'thigh_bl', type: 'capsule', a: [0.42, 0.45, 0.22], b: [0.37, 0.265, 0.25], r: 0.13, color: 0x3bbd8e },
      { id: 'leg_bl', type: 'capsule', a: [0.37, 0.265, 0.25], b: [0.46, 0.08, 0.26], r: 0.115, color: 0x2a8a67 },
      { id: 'thigh_br', type: 'capsule', a: [0.42, 0.45, -0.22], b: [0.37, 0.265, -0.25], r: 0.13, color: 0x3bbd8e },
      { id: 'leg_br', type: 'capsule', a: [0.37, 0.265, -0.25], b: [0.46, 0.08, -0.26], r: 0.115, color: 0x2a8a67 },
      { id: 'tail', type: 'capsule', a: [0.5, 0.7, 0.0], b: [1.05, 1.05, 0.0], r: 0.14, color: 0x6f8cff },
      // Ball eyes (the cast standard since the reference screenshots):
      // solid whites rooted 0.02 inside the head, poking 0.08; irises
      // are decals ON the eyeballs.
      { id: 'eyeball_l', type: 'sphere', a: [-1.084, 1.043, 0.164], r: 0.1, kCap: 0.03, color: 0xffffff },
      { id: 'eyeball_r', type: 'sphere', a: [-1.084, 1.043, -0.164], r: 0.1, kCap: 0.03, color: 0xffffff },
      { id: 'iris_l', type: 'sphere', a: [-1.156, 1.072, 0.214], r: 0.045, color: 0x1b1f26, paint: true },
      { id: 'iris_r', type: 'sphere', a: [-1.156, 1.072, -0.214], r: 0.045, color: 0x1b1f26, paint: true },
    ],
  },
  {
    id: 'hopper',
    name: 'Hopper',
    // Ears wiggle (a neck-free prim — safe to animate; see authoring rules).
    anim: { primId: 'ear_l', axis: [1, 0, 0], amplitude: 0.3, speed: 3.2 },
    // Two feet, alternating — the "same system handles 2 or 4 legs" claim.
    step: { feet: ['foot_l', 'foot_r'], groups: [[0], [1]] },
    // The HOP state machine (A1) replaces the reactive gait for this
    // creature (main picks hop over gait when both exist); the feet list
    // above stays the single source of truth for which prims are legs.
    // Empty object = all config defaults; any field overrides (trigger,
    // crouchTime, airTime, landTime, restMin, height, dip, leadTime,
    // footTuck).
    hop: {},
    blink: { eyes: ['eyeball_l', 'eyeball_r', 'iris_l', 'iris_r'] },
    // Subtle, quick breath — continues mid-hop (alive in the air too).
    breath: { amplitude: 0.012, speed: 2.2 },
    prims: [
      { id: 'body', type: 'sphere', a: [0.0, 0.62, 0.0], r: 0.5, color: 0xcf6fc9 },
      { id: 'foot_l', type: 'capsule', a: [-0.05, 0.16, 0.18], b: [-0.38, 0.12, 0.22], r: 0.15, color: 0x9b4f96 },
      { id: 'foot_r', type: 'capsule', a: [-0.05, 0.16, -0.18], b: [-0.38, 0.12, -0.22], r: 0.15, color: 0x9b4f96 },
      { id: 'ear_l', type: 'capsule', a: [-0.05, 1.0, 0.15], b: [-0.12, 1.38, 0.22], r: 0.16, color: 0xe09ade },
      { id: 'ear_r', type: 'capsule', a: [-0.05, 1.0, -0.15], b: [-0.12, 1.38, -0.22], r: 0.16, color: 0xe09ade },
      // The demo CARVE, a WIDE slit — SUBMERGED: both endpoints sit well
      // inside the face (old geometry grazed with the midpoint 0.019
      // OUTSIDE the surface — grazing coverage smears into corner
      // run-offs; measured analytically, suite-enforced below).
      // K-VALIDITY (A4, measured): at extreme slider k the union deficit
      // exceeds the carve's radius and the mouth GEOMETRY is swallowed —
      // a design boundary (see the authoring rules), not a color bug.
      { id: 'mouth', type: 'capsule', a: [-0.455, 0.48, 0.08], b: [-0.455, 0.48, -0.08], r: 0.09, kCap: 0.06, negative: true, color: 0x2b1626 },
      // Ball eyes: rooted 0.02 inside the body, poking 0.11 (clear of
      // the mouth carve by 0.09 raw).
      { id: 'eyeball_l', type: 'sphere', a: [-0.423, 0.781, 0.161], r: 0.13, kCap: 0.03, color: 0xffffff },
      { id: 'eyeball_r', type: 'sphere', a: [-0.423, 0.781, -0.161], r: 0.13, kCap: 0.03, color: 0xffffff },
      { id: 'iris_l', type: 'sphere', a: [-0.529, 0.821, 0.201], r: 0.055, color: 0x241a28, paint: true },
      { id: 'iris_r', type: 'sphere', a: [-0.529, 0.821, -0.201], r: 0.055, color: 0x241a28, paint: true },
    ],
  },
  {
    id: 'longneck',
    name: 'Longneck',
    // Tail wags — NOT the neck: the head would not follow it (see rules).
    anim: { primId: 'tail', axis: [1, 0, 0], amplitude: 0.7, speed: 2.8 },
    step: {
      feet: ['leg_fl', 'leg_fr', 'leg_bl', 'leg_br'],
      groups: [[0, 3], [1, 2]],
      // A5: two-segment legs — foot id -> thigh id. The foot prim is the
      // SHIN; the rest pose's knee offset authors the bend direction.
      knees: { leg_fl: 'thigh_fl', leg_fr: 'thigh_fr', leg_bl: 'thigh_bl', leg_br: 'thigh_br' },
      lift: 0.05, // A5.1: lower step — see critter's note
    },
    blink: { eyes: ['eyeball_l', 'eyeball_r', 'iris_l', 'iris_r'] },
    prims: [
      { id: 'body', type: 'capsule', a: [-0.35, 0.55, 0.0], b: [0.45, 0.55, 0.0], r: 0.38, color: 0xe8b04b },
      { id: 'neck', type: 'capsule', a: [-0.35, 0.6, 0.0], b: [-0.75, 1.35, 0.0], r: 0.17, kCap: 0.12, color: 0xe8b04b },
      { id: 'head', type: 'sphere', a: [-0.85, 1.45, 0.0], r: 0.22, color: 0xdf9b3f },
      // A5 knees (sauropod columns: slight 0.045 forward bend). 16 prims
      // — EXACTLY at MAX_PRIMS: zero headroom left on this creature.
      // A5.1: deeper bend (0.06) + hoof-dark shins (see critter's note).
      { id: 'thigh_fl', type: 'capsule', a: [-0.28, 0.45, 0.18], b: [-0.35, 0.265, 0.2], r: 0.11, color: 0xcf8f39 },
      { id: 'leg_fl', type: 'capsule', a: [-0.35, 0.265, 0.2], b: [-0.3, 0.08, 0.21], r: 0.095, color: 0x9c6b2a },
      { id: 'thigh_fr', type: 'capsule', a: [-0.28, 0.45, -0.18], b: [-0.35, 0.265, -0.2], r: 0.11, color: 0xcf8f39 },
      { id: 'leg_fr', type: 'capsule', a: [-0.35, 0.265, -0.2], b: [-0.3, 0.08, -0.21], r: 0.095, color: 0x9c6b2a },
      { id: 'thigh_bl', type: 'capsule', a: [0.38, 0.45, 0.18], b: [0.31, 0.265, 0.2], r: 0.11, color: 0xcf8f39 },
      { id: 'leg_bl', type: 'capsule', a: [0.31, 0.265, 0.2], b: [0.4, 0.08, 0.21], r: 0.095, color: 0x9c6b2a },
      { id: 'thigh_br', type: 'capsule', a: [0.38, 0.45, -0.18], b: [0.31, 0.265, -0.2], r: 0.11, color: 0xcf8f39 },
      { id: 'leg_br', type: 'capsule', a: [0.31, 0.265, -0.2], b: [0.4, 0.08, -0.21], r: 0.095, color: 0x9c6b2a },
      { id: 'tail', type: 'capsule', a: [0.45, 0.62, 0.0], b: [0.85, 0.85, 0.0], r: 0.1, kCap: 0.07, color: 0xdf9b3f },
      // Ball eyes: rooted 0.015 inside the head, poking 0.06.
      { id: 'eyeball_l', type: 'sphere', a: [-1.019, 1.506, 0.101], r: 0.075, kCap: 0.03, color: 0xffffff },
      { id: 'eyeball_r', type: 'sphere', a: [-1.019, 1.506, -0.101], r: 0.075, kCap: 0.03, color: 0xffffff },
      { id: 'iris_l', type: 'sphere', a: [-1.075, 1.525, 0.135], r: 0.032, color: 0x2a2118, paint: true },
      { id: 'iris_r', type: 'sphere', a: [-1.075, 1.525, -0.135], r: 0.032, color: 0x2a2118, paint: true },
    ],
  },
  {
    id: 'pudge',
    name: 'Pudge',
    // First user of INFLATE (Pass 3): same skeleton reads chubbier by one
    // number. 0.04 stays well under the thinnest solid r (tail 0.11).
    inflate: 0.04,
    // Deep, slow breath — the chubby creature breathes like one.
    breath: { amplitude: 0.02, speed: 1.6 },
    blink: { eyes: ['sclera_l', 'sclera_r', 'pupil_l', 'pupil_r'] },
    anim: { primId: 'tail', axis: [0, 1, 0], amplitude: 0.5, speed: 3.0 },
    step: { feet: ['leg_fl', 'leg_fr', 'leg_bl', 'leg_br'], groups: [[0, 3], [1, 2]] },
    // 12 prims (the old MAX_PRIMS ceiling; capacity is 16 since Skitter).
    prims: [
      { id: 'body', type: 'sphere', a: [0.05, 0.5, 0.0], r: 0.4, color: 0x8fb4e3 },
      { id: 'head', type: 'sphere', a: [-0.52, 0.72, 0.0], r: 0.26, color: 0xa7c7ec },
      { id: 'leg_fl', type: 'capsule', a: [-0.28, 0.38, 0.2], b: [-0.3, 0.08, 0.23], r: 0.12, kCap: 0.08, color: 0x6f9bd1 },
      { id: 'leg_fr', type: 'capsule', a: [-0.28, 0.38, -0.2], b: [-0.3, 0.08, -0.23], r: 0.12, kCap: 0.08, color: 0x6f9bd1 },
      { id: 'leg_bl', type: 'capsule', a: [0.34, 0.38, 0.2], b: [0.36, 0.08, 0.23], r: 0.12, kCap: 0.08, color: 0x6f9bd1 },
      { id: 'leg_br', type: 'capsule', a: [0.34, 0.38, -0.2], b: [0.36, 0.08, -0.23], r: 0.12, kCap: 0.08, color: 0x6f9bd1 },
      { id: 'tail', type: 'capsule', a: [0.42, 0.55, 0.0], b: [0.62, 0.68, 0.0], r: 0.11, kCap: 0.08, color: 0x7fa8dd },
      // Wide mouth slit — SUBMERGED with a SHORT span: on this curvier
      // head the chord-sag left the old slit's corners near-grazing, and
      // grazing coverage smears into corner run-offs (measured
      // analytically; picked from a probe sweep). Same known high-k
      // fade limit as hopper's mouth.
      { id: 'mouth', type: 'capsule', a: [-0.73, 0.63, 0.05], b: [-0.73, 0.63, -0.05], r: 0.068, kCap: 0.048, negative: true, color: 0x2d2438 },
      // FLAT DECAL EYES, deliberately — the BALL-EYE DILATE BOUNDARY
      // (browser-caught scary-goggles, then a probe-killed solid-iris
      // fix): a constant dilate compresses every small-feature contrast
      // toward 1 (dark/white = (i+d)/(w+d)); at pudge's 0.06 peak vs
      // this eye scale NO ball-eye proportions survive, and a solid iris
      // small enough violates the thinnest-solid rule. Flat sclera +
      // pupil decals balloon TOGETHER and keep the painted-cute read —
      // the proven pre-conversion authoring, restored.
      { id: 'sclera_l', type: 'sphere', a: [-0.72, 0.8, 0.11], r: 0.075, color: 0xf2f4f6, paint: true },
      { id: 'sclera_r', type: 'sphere', a: [-0.72, 0.8, -0.11], r: 0.075, color: 0xf2f4f6, paint: true },
      { id: 'pupil_l', type: 'sphere', a: [-0.73, 0.804, 0.1155], r: 0.032, color: 0x1e2430, paint: true },
      { id: 'pupil_r', type: 'sphere', a: [-0.73, 0.804, -0.1155], r: 0.032, color: 0x1e2430, paint: true },
    ],
  },
  {
    id: 'snail',
    name: 'Shelby',
    // Very slow breath — a snail's tempo (base inflate 0: pure breath).
    breath: { amplitude: 0.012, speed: 0.9 },
    // Snails rest long: a bigger idle window inside a longer cycle
    // (the per-creature override path — others use config defaults).
    idle: { period: 11, duration: 4.5 },
    blink: { eyes: ['eyeball_l', 'eyeball_r', 'iris_l', 'iris_r'] },
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
      // Ball eyes ON the stalk tips (rooted 0.015 into the tip, poking
      // 0.035) — replaces the flat dots; PROVISIONAL: revert to dots if
      // tiny balls read worse than decals at this scale.
      { id: 'eyeball_l', type: 'sphere', a: [-0.821, 0.739, 0.106], r: 0.05, kCap: 0.03, color: 0xffffff },
      { id: 'eyeball_r', type: 'sphere', a: [-0.821, 0.739, -0.106], r: 0.05, kCap: 0.03, color: 0xffffff },
      { id: 'iris_l', type: 'sphere', a: [-0.842, 0.778, 0.112], r: 0.022, color: 0x2a2430, paint: true },
      { id: 'iris_r', type: 'sphere', a: [-0.842, 0.778, -0.112], r: 0.022, color: 0x2a2430, paint: true },
    ],
  },
  {
    id: 'skitter',
    name: 'Skitter',
    // The reference six-legger, built from EXISTING vocabulary only:
    // TRIPOD gait (two groups of three — "leg count is pure data",
    // now proven at 2, 4, and 6), thin kCap'd legs for the pointy read,
    // green-tipped antennae, and the reference's PROTRUDING BALL EYES
    // (solid eyeballs + iris decals hosted on them). 15 prims — the
    // creature that raised MAX_PRIMS to 16. No anim: the antennae carry
    // tip prims (attached prims don't follow), and the legs belong to
    // the gait.
    step: {
      feet: ['leg_fl', 'leg_fr', 'leg_ml', 'leg_mr', 'leg_bl', 'leg_br'],
      groups: [[0, 3, 4], [1, 2, 5]], // alternating tripods: fl+mr+bl / fr+ml+br
    },
    // Irises submerge into the solid eyeballs — a beat of blank white
    // ball, the cartoon eye-roll blink. Browser judges whether it reads.
    blink: { eyes: ['eyeball_l', 'eyeball_r', 'iris_l', 'iris_r'] },
    prims: [
      { id: 'body', type: 'capsule', a: [-0.3, 0.42, 0.0], b: [0.28, 0.46, 0.0], r: 0.26, color: 0x7b5fc9 },
      { id: 'leg_fl', type: 'capsule', a: [-0.2, 0.36, 0.14], b: [-0.3, 0.06, 0.3], r: 0.055, kCap: 0.04, color: 0x52418f },
      { id: 'leg_fr', type: 'capsule', a: [-0.2, 0.36, -0.14], b: [-0.3, 0.06, -0.3], r: 0.055, kCap: 0.04, color: 0x52418f },
      { id: 'leg_ml', type: 'capsule', a: [0.0, 0.36, 0.15], b: [0.02, 0.06, 0.34], r: 0.055, kCap: 0.04, color: 0x52418f },
      { id: 'leg_mr', type: 'capsule', a: [0.0, 0.36, -0.15], b: [0.02, 0.06, -0.34], r: 0.055, kCap: 0.04, color: 0x52418f },
      { id: 'leg_bl', type: 'capsule', a: [0.2, 0.36, 0.14], b: [0.32, 0.06, 0.3], r: 0.055, kCap: 0.04, color: 0x52418f },
      { id: 'leg_br', type: 'capsule', a: [0.2, 0.36, -0.14], b: [0.32, 0.06, -0.3], r: 0.055, kCap: 0.04, color: 0x52418f },
      { id: 'antenna_l', type: 'capsule', a: [-0.24, 0.6, 0.07], b: [-0.38, 0.86, 0.12], r: 0.05, kCap: 0.035, color: 0x6b53b8 },
      { id: 'antenna_r', type: 'capsule', a: [-0.24, 0.6, -0.07], b: [-0.38, 0.86, -0.12], r: 0.05, kCap: 0.035, color: 0x6b53b8 },
      { id: 'tip_l', type: 'sphere', a: [-0.38, 0.86, 0.12], r: 0.055, kCap: 0.04, color: 0x3bbd8e },
      { id: 'tip_r', type: 'sphere', a: [-0.38, 0.86, -0.12], r: 0.055, kCap: 0.04, color: 0x3bbd8e },
      // The reference's PROTRUDING eyes: solid white balls rooted just
      // inside the body, poking 0.071 out (r 0.085: OUTLINE_WIDTH is a FIXED
      // 0.035, so small balls wear a proportionally huge ink ring — bigger
      // + pure white reads as eyes, not borders); irises are decals ON
      // the eyeballs (their nearest solid).
      { id: 'eyeball_l', type: 'sphere', a: [-0.49, 0.54, 0.1], r: 0.085, kCap: 0.03, color: 0xffffff },
      { id: 'eyeball_r', type: 'sphere', a: [-0.49, 0.54, -0.1], r: 0.085, kCap: 0.03, color: 0xffffff },
      { id: 'iris_l', type: 'sphere', a: [-0.565, 0.545, 0.115], r: 0.03, color: 0x201a30, paint: true },
      { id: 'iris_r', type: 'sphere', a: [-0.565, 0.545, -0.115], r: 0.03, color: 0x201a30, paint: true },
    ],
  },
];
