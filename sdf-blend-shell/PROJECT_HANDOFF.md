# PROJECT_HANDOFF — SDF Blend-Shell Experiment

_Last updated: 2026-07-03 (field browser-confirmed + pushed; STAGE 3 GAIT delivered — reactive foot stepping, awaiting browser confirmation)_

## What this is
An experiment replicating the "SDF blend-shell" character technique from a
Reddit post (r/aigamedev) — **with an explicit end goal: build transferable
knowledge for a future dev-method SKILL so Claude can procedurally generate
new creatures from data alone.** The registry schema, the invariants proven
by the suite (paint poke-through math, decal ordering, capsule ring density,
burial distances), and LESSONS.md are the raw material for that harvest.

The technique: characters built from capsule/sphere primitive
meshes whose vertices are snapped, in a vertex shader, onto the smooth-min
SDF surface of all primitives combined — so overlapping shapes render as one
seamless body. Normals come from the SDF gradient; still ordinary mesh
rendering (per-vertex cost, no raymarching, no skinning).

**Stack:** Three.js (pinned 0.170.0 via CDN import map — a deliberate
deviation from the usual no-framework HTML5 convention; no bundler, no build
step, served with VS Code Live Server on Windows).

**Repo:** https://github.com/Cupcakechan/ExperimentProject — root is
`Experiment Project\` (the container for all experiments); this project is
the `sdf-blend-shell\` subfolder. Git commands run from the CONTAINER root.

## Plan (locked decisions)
- **Option 2 — "the living blob"**, staged in two passes — BOTH DONE,
  browser-confirmed:
  - **Stage A: static blend proof** (no seam or lighting crease at either
    join; committed `95e09ab`).
  - **Stage B: motion + color** (arm wave via `aPrim` + `uAnimMat`, proximity
    color blending, `uK` slider; committed `54fcc20`).
- **Polish pass (this pass): per-pixel shading.** Normals + colors moved from
  the vertex shader to the fragment shader (shared FIELD_GLSL chunk used by
  both stages) to fix the wobbly toon-band edges.
- Option 3 (mini-critter: JSON character + IK stepping + toon outlines) is
  shelved as "what this grows into if Stage B delights."

## Current state
- Stage A + Stage B browser-confirmed and pushed (`95e09ab`, `54fcc20`);
  gitignore housekeeping done (package files untracked, flush-left patterns).
- Per-pixel polish browser-confirmed and pushed. It exposed the next defect:
  a faint stitched seam at glancing angles near the head — DOUBLE COVERAGE
  (buried mesh patches snapping onto skin another mesh owns, z-fighting).
- Buried-geometry tuck browser-confirmed and pushed (`2e98d0c`).
- CRITTER pass delivered (this pass, Option 1 of the shaping round): the
  registry now defines a quadruped — body, head, 4 legs, wagging tail
  (7 solid prims) + 2 PAINTED eyes. New concept: paint prims (`paint: true`)
  tint the skin via proximity color but have NO surface — skipped by mapSDF,
  the burial check, and geometry building; aPrim keeps REGISTRY indices.
  MAX_PRIMS 8 -> 12 (cost note: every field eval loops MAX_PRIMS, now
  per-pixel). Old torso/head/arm creature replaced (lives in git history).
  Suite ALL PASS (burial + eye-visibility probes recomputed, hand-computed,
  for the new geometry).
- Ring-density leg fix browser-confirmed ("legs are great") and pushed
  (`8bca4b8`). Nested-repo incident resolved (stale inner .git deleted,
  remote verified healthy; see LESSONS.md).
- Eye upgrade (layered decals) browser-confirmed and pushed (`f20a89a`).
- GALLERY delivered (this pass, Option 1 of the exploration round):
  `src/data/creatures.js` holds THREE creatures — Critter (ported), plus
  Hopper and Longneck (both GENERATED COLD from data alone, graded by the
  suite before any browser saw them: the end-goal practice loop, run twice).
  Schema v2: creature = { id, name, prims, anim? } — the wave params moved
  from config into per-creature data. Switcher: number keys 1-3 + buttons;
  switching rebuilds geometry+material (disposed properly); slider k
  survives switches. Suite GENERALIZED: every invariant now loops over
  every creature (well-formed prims, capacity, aPrim/solids, ring density
  on the longest capsule, paint anchored-and-poking (-r < sd < 0 vs nearest
  solid host), decal order, pupil-disc-fits-inside-sclera-disc angular
  math, anim rest/peak) + hand-computed regression anchors per creature.
  ~130 probes ALL PASS. `src/data/creature.js` DELETED (replaced by
  creatures.js). Browser-confirmed ("they look great") and pushed
  (`bae461c`).
- DECAL-INFLATION FIX delivered (this pass): at k=0.6 the smin skin
  inflates (up to k/4) past the eyes' poke margins — Hopper kept a ghost
  sclera, Longneck lost its eyes entirely, Critter (uncrowded face)
  survived: severity ordered by margin + prim crowding. Fix: decal
  coverage subtracts the LOCAL INFLATION (min solid distance at the shaded
  point, free from the existing phase-1 loop) so decals ride the skin at
  any k. Side effect: eyes read very slightly larger at k=0.25. Suite has
  bug-then-fix probes at inflation 0.15 (hand-computed). Browser-confirmed
  and pushed (`2e9fd82`).
- kCAP delivered (this pass): optional per-prim `kCap` — a blend-radius
  CEILING (effective k = min(slider, cap)) — the post's thin-part trick,
  the LAST of its robustness tricks. Applied where the design wanted it:
  Longneck neck kCap 0.12 (fixes the observed melty neck base) and tail
  kCap 0.07. Authoring rule added: thin prims (r < ~0.18) joining bigger
  masses get kCap ~= 0.7*r. Suite: uKCap padding/mirroring per creature +
  hand-computed cap-holds-against-slider probes (smin(1,1,0.12) = 0.97 at
  slider 0.25 AND 0.60). Browser-confirmed and pushed (`53c1d76`).
- TOON OUTLINE delivered (this pass): second draw of the SAME geometry with
  an outline material — the shared vertex shader gained uSnapOffset (skin
  snaps to sdf=0, ink to sdf=OUTLINE_WIDTH: the post's offset-surface trick,
  clean in concave joints where normal-inflated hulls self-intersect),
  fragment = flat OUTLINE_COLOR, side = BackSide. main.js drives skin + ink
  in LOCKSTEP (both get uK, uAnimPrim, and per-frame updateAnim — separate
  uniform instances by design). Geometry shared, disposed once. Suite:
  offset/side/separate-instances probes + OUTLINE_WIDTH < thinnest solid r
  per creature (ink must not swallow thin parts).
- Browser result: outline works but painted BLACK DOMES at every limb
  root. Fix v1 (ink uTuck=0) FAILED — same blobs. TRUE root cause: buried
  caps FOLD when projected onto the target surface; part lands with
  INVERTED winding, showing back faces (drawn by BackSide ink) wherever the
  patch is OUTSIDE the skin. Fix v2 (this pass): ink tuck = OUTLINE_WIDTH +
  TUCK_DEPTH — buried ink ends at -TUCK_DEPTH, INSIDE the creature,
  occluded by the skin. Expect a short black rim at burial boundaries
  (reads as crease ink; lever = the ink tuck value if too heavy). Suite
  asserts the final position's SIGN. See LESSONS.md (incl. the
  wrong-fix lesson). Browser result: domes GONE; thin black slivers/ticks
  remained at burial boundaries — the predicted binary-tuck transition
  cliffs (0.055 tall) flashing their back faces.
- BURIAL-RAMP polish delivered (this pass): the tuck is now CONTINUOUS —
  buryT = 1 - smoothstep(-BURY_EPS - BURY_BAND, -BURY_EPS, dOther), full
  tuck only at depth, zero exactly at the boundary. Browser-confirmed
  ("looks better") and pushed (`bc3ad97`). Residual taste levers queued:
  BURY_BAND up = softer crease ink; OUTLINE_WIDTH down = thinner line.
- ANIMATION ROADMAP locked (options round): 1) roam+bob (this pass) ->
  2) per-prim transform plumbing (uPrimMat[MAX_PRIMS], parity-tested) ->
  3) IK foot stepping. Reddit original is fully animated (walking) —
  SKILL HARVEST DEFERRED until the animation half is learned (decision:
  one harvest from a complete technique beats two).
- ROAM+BOB delivered (this pass): src/roam.js — DETERMINISTIC wander
  (heading integrates sum-of-sines turn rate, no RNG) + boundary steering
  past ROAM_SOFT_RADIUS; main.js gains a THREE.Group rig carrying skin+ink
  (root motion moves both; works because snapping is creature-space and
  modelMatrix applies after), clamped-delta clock (tab-restore spike
  guard), idle bob. LIGHTING FIX folded in: fragment now rotates the
  creature-space SDF normal by mat3(modelMatrix) (declared by built-in
  name in the fragment stage) — without it the light turns WITH the
  roamer. Legs slide (known, staged — stepping is stage 3). Suite: roam
  determinism/boundedness/liveness/reset + lighting regression guard.
  Browser-confirmed ("looks decent") and pushed (`35a9f07`).
- STAGE 2 delivered (this pass): PER-PRIM TRANSFORM PLUMBING. The single
  uAnimMat/uAnimPrim slot is replaced by uniform mat4 uPrimMat[MAX_PRIMS]
  (identity = rest; SEPARATE Matrix4 instances per slot); every vertex
  applies ITS OWN prim's transform (dynamic uniform indexing — legal in
  vertex shaders). anim.js rewritten on it with a setPrimTransform()
  lockstep helper: writing a prim's mat ALSO rewrites its uA/uB from the
  rest pose — mesh and field can never disagree. Behavior parity: same
  single-prim wave, suite-proven (rest identity, pivot invariant 'a' never
  moves, non-animated prims stay identity, peak movement unchanged).
  Uniform budget note: 12 mat4s = 48 vec4 slots on top of the prim arrays
  — fine on desktop (1024+), would need auditing for a mobile claim.
  Browser-confirmed ("all set") and pushed (`4b05142`).
- THE FIELD delivered (this pass, Option 2 of the field round): all three
  creatures roam ONE stage. actors[] in main.js (rig + skin/ink materials +
  seeded roam + animIdx + bob phase each; nothing switches, nothing
  disposes); ground disc (CircleGeometry, MeshBasicMaterial — flat/unlit,
  GROUND_RADIUS 2.9); switcher/keys REMOVED, slider drives all six
  materials; camera pulled back. roam.js: createRoam(seed) — seeded spawn
  ring + wander phase; separation = heading steering (polite turning) PLUS
  a positional push (the GUARANTEE) + hard radius clamp 2.4.
  MEASURED (artifact-wins, twice): heading-only separation failed at 0.008
  apart and steering fights overshot to r=3.29 (off the disc) — the push +
  clamp fixed both; re-measured closest approach 1.234, max radius exactly
  2.400; suite encodes the MEASURED thresholds and simulates the 3-actor
  field every run. Separation reads last-frame positions (1-frame lag,
  order-independent). Browser-confirmed ("Perfect") and pushed (`d49dbab`).
- STAGE 3 GAIT delivered (this pass, Option 1 of the stepping round):
  src/gait.js — reactive foot stepping, data-driven (creature.step =
  { feet, groups }; quadrupeds trot on diagonal pairs, Hopper alternates
  two feet — leg count is pure data). Per foot: world ANCHOR (planted) vs
  HOME (rest spot carried by the body); swing triggers past STEP_TRIGGER
  when the group has the turn; lifted arc over STEP_TIME, landing
  STEP_LEAD_TIME of velocity ahead; legs pin hip->anchor via
  aimStretchMatrix (pure, exported: rotate rest axis onto pin + scale
  ALONG the axis only — hip invariant, cross-section preserved), written
  through anim.js's setPrimTransform (now exported) on both draws.
  TWO DEFECTS CAUGHT BY SIMULATION pre-delivery (see LESSONS.md): stale
  turn gate (gallop glitch) -> live claim; horizontal-foot crumple to
  0.18x -> STRETCH_MIN/MAX clamp (pin slips past the band). Suite runs
  the 20s walk per creature every execution (trot invariant, world-fixed
  planted feet, drift < 0.35 MEASURED 0.298, clamp band). Free-sine bob
  retained (step-synced bob = queued Option 2 feel pass). NOT yet
  browser-confirmed.
- Deep Research question answered: deferred as low-ROI for blob critters;
  conditional next steps noted — the original poster's public demo/code
  (primary source) and targeted stylized-proportion research IF creatures
  stop reading as species.
- Cost note: shading is now ~5 field evaluations per pixel (was per-vertex).
  Fine on desktop; would need measuring before any mobile claim.
- History quirk (accepted, left alone): Stage A commit appears twice
  (`1e10576`, `95e09ab`) from the init detours — harmless, not worth a
  history rewrite.

## Architecture
- `src/gait.js` — reactive stepping (see Current state); exports pure
  aimStretchMatrix for the suite; exposes .feet for simulation probes.
- `src/data/creatures.js` — the GALLERY: array of self-contained creatures
  `{ id, name, prims, anim? }`; anim = { primId, axis, amplitude, speed }.
  The file's header documents the AUTHORING RULES (stage bounds, face -X,
  capacity budget, paint poke-through, pupil-on-sclera-ray, decal order,
  single-prim anim limitation, thin-part minimums) — this list is the core
  skill material. Each prim: array of
  `{ id, type: 'capsule'|'sphere', a:[x,y,z], b?:[x,y,z], r, color?, paint? }`.
  `color` optional (SHELL_COLOR fallback); `paint: true` = color-only DECAL
  prim (eyes): no surface/mesh/burial; composited over the skin in REGISTRY
  ORDER (later wins) with smoothstep edge PAINT_EDGE. Layering rule: pupil
  entries must come AFTER sclera entries. A paint prim must poke through its
  host's skin: |offset| + r > host.r; a layered decal must fit inside its
  parent's disc (angular-radius math) — both suite-checked.
- `src/render/buildShell.js` — one geometry per SOLID primitive (paint prims
  skipped), baked into WORLD space, merged. Bakes `aPrim` (per-vertex REGISTRY
  index). Capsules are built as cylinder + 2 hemispheres with
  CAPSULE_RINGS_PER_UNIT rings along the length (three's CapsuleGeometry has
  none — see LESSONS.md).
- `src/render/blendMaterial.js` — the heart, now TWO materials from one
  shared vertex shader (uSnapOffset picks the target surface):
  createBlendMaterial (skin, offset 0) + createOutlineMaterial (ink, offset
  OUTLINE_WIDTH, flat color, BackSide). buildUniforms() gives each material
  its OWN uniform instances — anim.js writes uB/uAnimMat per material, so
  main updates both every frame. FIELD_GLSL (sdCapsule +
  polynomial smin + mapSDF + sdfNormal + blendColor and their uniforms) is
  ONE shared chunk injected into BOTH shaders. Vertex: optional uAnimMat
  transform for the animated prim (`aPrim == uAnimPrim`), then SNAP_ITERS
  steps of `p -= normal * d`; passes snapped world pos as vPos. Fragment:
  per-pixel sdfNormal(vPos) + blendColor(vPos) (`w = 1/(d+SOFT)^POW`; on the
  shell all prim distances are >= 0, so the touching prim dominates), 4-band
  toon lambert.
- `src/anim.js` — prim animation on the PER-PRIM plumbing: uPrimMat[i] per
  prim (identity = rest). setPrimTransform(material, idx, prim, mat) is the
  ONLY write path — it updates the prim's mat AND its uA/uB from the rest
  pose in lockstep. Today's content is still the single-prim wave (sine,
  ABSOLUTE from rest, cannot drift); IK (stage 3) writes many prims per
  frame through the same helper. Registry never mutated.
- `src/ui/controls.js` — DOM layer: the `uK` slider only (switcher removed
  with the gallery); onK callback drives every actor's two materials.
- `src/config.js` — all tunables: BLEND_K 0.25 (slider 0.02–0.6), SNAP_ITERS 5,
  MAX_PRIMS 12, COLOR_SOFT 0.015, COLOR_POW 2.0, wave: 'tail' about X,
  0.6 rad @ 2.5, TUCK_DEPTH 0.02, BURY_EPS 0.005, colors, camera (start
  [-1.6,1.3,3.2], target [0,0.6,0]).
- `src/main.js` — scene/camera/OrbitControls/loop + THE FIELD: actors[]
  built once (per creature: shared geometry, skin+ink materials, rig,
  createRoam(index), animIdx, bob phase, last-frame pos for the others'
  separation); ground disc; loop per actor: updateAnim x2, roam.update(dt,
  others), rig transform + phase-offset bob.

## Gotchas (project-specific)
- **No backticks inside the GLSL template literals** (see LESSONS.md).
- three.js auto-prepends `position`/matrices/precision to ShaderMaterial
  shaders — never redeclare them. CUSTOM attributes (`aPrim`) MUST be declared.
- `test_suite.mjs` needs a one-time local `npm install three@0.170.0`
  (node_modules + package.json are gitignored; the browser uses the CDN).
- GLSL ES loop bounds must be compile-time constants — the primitive loop runs
  to `MAX_PRIMS` with an `i < uCount` guard inside, not a dynamic bound.
- `.gitignore` patterns must be flush-left — leading spaces are part of the
  pattern (see LESSONS.md).

## Open items / next steps
1. **Daniel:** verify the field — three creatures roaming one stage,
   veering politely around each other, never touching, never leaving the
   ground disc; slider melts all three at once; performance smooth.
2. On confirmation: git checkpoint (from `Experiment Project\` root).
3. Queued: gait FEEL pass (step-synced bob, lean into turns — Option 2 of
   the stepping round); two-segment knees (Option 3); hopper HOP state
   machine (the post's real hopper answer — it waddles for now);
   terrarium (population play); then the SKILL HARVEST — with gait
   working, the technique is essentially complete against the post.
3. Queued menu (each its own options round): IK leg stepping (multi-pass,
   staged), more practice creatures exercising the kCap vocabulary
   (antennae, thin ears, 3D-geometry eyes are now legal), OUTLINE_WIDTH /
   OUTLINE_COLOR taste pass (one-value tunes).
4. The post's technique list is now FULLY IMPLEMENTED except procedural
   animation systems (IK/state machines/ropes) — a natural SKILL-harvest
   checkpoint even before IK.
4. SKILL harvest (end goal, when the technique feels complete): dev-method
   skill session over LESSONS.md + this handoff -> a creature-generation
   skill reference (schema, invariants, tuning levers, gotchas).
