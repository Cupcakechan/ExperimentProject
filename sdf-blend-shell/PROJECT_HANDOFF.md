# PROJECT_HANDOFF — SDF Blend-Shell Experiment

_Last updated: 2026-07-03 (Stage A delivered, awaiting browser confirmation)_

## What this is
An experiment replicating the "SDF blend-shell" character technique from a
Reddit post (r/aigamedev): characters built from capsule/sphere primitive
meshes whose vertices are snapped, in a vertex shader, onto the smooth-min
SDF surface of all primitives combined — so overlapping shapes render as one
seamless body. Normals come from the SDF gradient; still ordinary mesh
rendering (per-vertex cost, no raymarching, no skinning).

**Stack:** Three.js (pinned 0.170.0 via CDN import map — a deliberate
deviation from the usual no-framework HTML5 convention; no bundler, no build
step, served with VS Code Live Server on Windows). Repo lives at
`Experiment Project\sdf-blend-shell\`.

## Plan (locked decisions)
- **Option 2 — "the living blob"** was chosen, staged in two passes:
  - **Stage A (this pass): static blend proof.** Torso capsule + head sphere +
    arm capsule, one merged mesh, blend-shell vertex shader, SDF-gradient
    normals, toon-banded single-color lighting, orbit camera. Success = the
    overlaps show NO seam or lighting crease from any angle.
  - **Stage B (next pass): motion + color.** Per-primitive colors blended by
    SDF proximity; one primitive animated via uniforms (vertices follow their
    primitive using the `aPrim` attribute, already baked in); a blend-radius
    (`uK`) slider.
- Option 3 (mini-critter: JSON character + IK stepping + toon outlines) is
  shelved as "what this grows into if Stage B delights."

## Current state
- Stage A code complete; `node --check` + committed `test_suite.mjs` all pass.
- NOT yet confirmed in a real browser (GLSL only truly compiles there).
- No git history yet — repo init is part of Stage A's setup steps.

## Architecture
- `src/data/creature.js` — the creature IS data: array of
  `{ id, type: 'capsule'|'sphere', a:[x,y,z], b?:[x,y,z], r }`. Overlaps are
  intentional.
- `src/render/buildShell.js` — one three.js geometry per primitive, baked into
  WORLD space (so shader `position` is already near the target surface),
  merged into a single geometry. Adds `aPrim` (per-vertex primitive index) for
  Stage B.
- `src/render/blendMaterial.js` — the heart: ShaderMaterial whose vertex
  shader holds `sdCapsule` + polynomial `smin`, iteratively slides each vertex
  onto the combined zero-surface (`SNAP_ITERS` steps of `p -= normal * d`),
  and outputs the SDF gradient as the normal. Fragment shader: 4-band toon
  lambert, single color. Primitives arrive as fixed-size uniform arrays padded
  to `MAX_PRIMS`.
- `src/config.js` — all tunables: `BLEND_K` (0.25), `SNAP_ITERS` (5),
  `MAX_PRIMS` (8), colors, camera.
- `src/main.js` — scene/camera/OrbitControls/loop. `frustumCulled = false` on
  the shell (vertices move in the shader; CPU bounds are wrong).

## Gotchas (project-specific)
- **No backticks inside the GLSL template literals** — one already shipped a
  suite failure (a backtick in a shader comment terminated the JS string
  early). The committed suite catches this class.
- three.js auto-prepends `position`/matrices/precision to ShaderMaterial
  shaders — never redeclare them.
- `test_suite.mjs` needs a one-time local `npm install three@0.170.0`
  (node_modules + package.json are gitignored; the browser uses the CDN).
- GLSL ES loop bounds must be compile-time constants — the primitive loop runs
  to `MAX_PRIMS` with an `i < uCount` guard inside, not a dynamic bound.

## Open items / next steps
1. **Daniel:** run Stage A in the browser (Live Server), orbit the creature,
   confirm zero seams/creases at both joins and no console errors.
2. On confirmation: git checkpoint, then build **Stage B** (motion + color +
   uK slider) as its own pass.
3. Later candidates (unscoped): toon outline via SDF offset surface, thin-part
   blend-radius caps, JSON-driven multi-creature gallery, IK stepping.
