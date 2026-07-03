# PROJECT_HANDOFF — SDF Blend-Shell Experiment

_Last updated: 2026-07-03 (legs browser-confirmed + repo untangled; EYE UPGRADE delivered — layered decals, awaiting browser confirmation)_

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
- EYE UPGRADE delivered (this pass): each eye = white sclera + dark pupil.
  Required a paint-model change: paint prims now composite as ORDERED DECALS
  (registry order, later wins, smoothstep edge = PAINT_EDGE) on top of the
  weighted solid-prim skin — the weighted model ties layered paints 50/50
  (a pupil over a sclera reads gray). Bonus: crisp decal edges (the
  reference look). Registry at 11/12 of MAX_PRIMS. Suite ALL PASS incl.
  decal-order probe and pupil-fits-inside-sclera disc math (hand-computed
  angular radii). NOT yet browser-confirmed.
- Cost note: shading is now ~5 field evaluations per pixel (was per-vertex).
  Fine on desktop; would need measuring before any mobile claim.
- History quirk (accepted, left alone): Stage A commit appears twice
  (`1e10576`, `95e09ab`) from the init detours — harmless, not worth a
  history rewrite.

## Architecture
- `src/data/creature.js` — the creature IS data: array of
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
- `src/render/blendMaterial.js` — the heart: FIELD_GLSL (sdCapsule +
  polynomial smin + mapSDF + sdfNormal + blendColor and their uniforms) is
  ONE shared chunk injected into BOTH shaders. Vertex: optional uAnimMat
  transform for the animated prim (`aPrim == uAnimPrim`), then SNAP_ITERS
  steps of `p -= normal * d`; passes snapped world pos as vPos. Fragment:
  per-pixel sdfNormal(vPos) + blendColor(vPos) (`w = 1/(d+SOFT)^POW`; on the
  shell all prim distances are >= 0, so the touching prim dominates), 4-band
  toon lambert.
- `src/anim.js` — the wave: arm's `b` rotates about its `a` (Z axis, sine,
  ABSOLUTE from rest pose each frame — never accumulated, cannot drift).
  Updates `uB[i]` (the SDF) and `uAnimMat` (the mesh) in lockstep. Registry is
  never mutated. Exports pure `rotateAboutPivot` for the suite.
- `src/ui/controls.js` — DOM layer: the `uK` slider (range K_MIN..K_MAX),
  live uniform update, graceful no-op if the container is missing.
- `src/config.js` — all tunables: BLEND_K 0.25 (slider 0.02–0.6), SNAP_ITERS 5,
  MAX_PRIMS 12, COLOR_SOFT 0.015, COLOR_POW 2.0, wave: 'tail' about X,
  0.6 rad @ 2.5, TUCK_DEPTH 0.02, BURY_EPS 0.005, colors, camera (start
  [-1.6,1.3,3.2], target [0,0.6,0]).
- `src/main.js` — scene/camera/OrbitControls/loop; wires `uAnimPrim`, calls
  `updateAnim(material, clock.getElapsedTime())` per frame;
  `frustumCulled = false` on the shell.

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
1. **Daniel:** run the critter in the browser — quadruped standing, tail
   wagging seamlessly, dark eyes painted on the head, no seams anywhere
   (legs join the belly, tail joins the rump), console clean.
2. On confirmation: git checkpoint (from `Experiment Project\` root).
3. Queued menu (each its own options round): per-prim blend caps (kCap —
   unlocks 3D bulging eyes, ears, antennae), toon outline via SDF offset
   surface, multi-creature gallery from JSON (the natural stage for "Claude
   generates a creature cold" practice runs), IK leg stepping.
4. SKILL harvest (end goal, when the technique feels complete): dev-method
   skill session over LESSONS.md + this handoff -> a creature-generation
   skill reference (schema, invariants, tuning levers, gotchas).
