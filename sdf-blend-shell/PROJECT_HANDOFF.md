# PROJECT_HANDOFF — SDF Blend-Shell Experiment

_Last updated: 2026-07-03 (Stage B delivered, awaiting browser confirmation)_

## What this is
An experiment replicating the "SDF blend-shell" character technique from a
Reddit post (r/aigamedev): characters built from capsule/sphere primitive
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
- **Option 2 — "the living blob"**, staged in two passes:
  - **Stage A: static blend proof — DONE, browser-confirmed** (no seam or
    lighting crease at either join; committed `95e09ab`).
  - **Stage B (this pass): motion + color.** Per-primitive colors blended by
    SDF proximity; the arm waves via uniforms (its vertices follow through
    the `aPrim` attribute + `uAnimMat`); a blend-radius (`uK`) slider.
- Option 3 (mini-critter: JSON character + IK stepping + toon outlines) is
  shelved as "what this grows into if Stage B delights."

## Current state
- Stage B code complete; `node --check` + committed `test_suite.mjs` ALL PASS
  (36 probes incl. hand-computed wave rotation and color-weight checks).
- NOT yet confirmed in a real browser (GLSL only truly compiles there).
- Known cosmetic (accepted, untouched): toon band edges are wobbly — coarse
  mesh tessellation showing through the quantized bands; per-pixel normals
  would fix it. Candidate for a later polish pass.
- Housekeeping delivered with this pass: corrected both `.gitignore` files
  (previous ones had leading spaces from a chat copy-paste — patterns never
  matched; see LESSONS.md) + `git rm --cached` for the two files that slipped
  through (`package.json`, `package-lock.json`).

## Architecture
- `src/data/creature.js` — the creature IS data: array of
  `{ id, type: 'capsule'|'sphere', a:[x,y,z], b?:[x,y,z], r, color? }`.
  `color` is optional (SHELL_COLOR fallback guards every read site).
- `src/render/buildShell.js` — one three.js geometry per primitive, baked into
  WORLD space, merged into a single geometry. Bakes `aPrim` (per-vertex
  primitive index).
- `src/render/blendMaterial.js` — the heart: vertex shader = sdCapsule +
  polynomial smin, SNAP_ITERS steps of `p -= normal * d`, SDF-gradient
  normals, proximity-weighted vertex colors (`w = 1/(d+SOFT)^POW`; on the
  shell all prim distances are >= 0, so the touching prim dominates).
  Animated prim: vertices with `aPrim == uAnimPrim` are transformed by
  `uAnimMat` BEFORE snapping. Fragment: 4-band toon lambert on vColor.
- `src/anim.js` — the wave: arm's `b` rotates about its `a` (Z axis, sine,
  ABSOLUTE from rest pose each frame — never accumulated, cannot drift).
  Updates `uB[i]` (the SDF) and `uAnimMat` (the mesh) in lockstep. Registry is
  never mutated. Exports pure `rotateAboutPivot` for the suite.
- `src/ui/controls.js` — DOM layer: the `uK` slider (range K_MIN..K_MAX),
  live uniform update, graceful no-op if the container is missing.
- `src/config.js` — all tunables: BLEND_K 0.25 (slider 0.02–0.6), SNAP_ITERS 5,
  MAX_PRIMS 8, COLOR_SOFT 0.015, COLOR_POW 2.0, WAVE_AMPLITUDE 0.5 rad,
  WAVE_SPEED 1.6, colors, camera.
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
1. **Daniel:** run Stage B in the browser — see the test plan in the delivery
   message (wave seamlessness while moving, color gradients at joins, slider).
2. On confirmation: git checkpoint (from `Experiment Project\` root; includes
   the two `git rm --cached` commands), then decide: stop here, polish pass
   (band wobble), or Option 3 territory (more primitives / outlines / IK).
3. Later candidates (unscoped): per-pixel normals for crisp toon bands, toon
   outline via SDF offset surface, thin-part blend-radius caps, JSON-driven
   multi-creature gallery, IK stepping.
