# PROJECT_HANDOFF — SDF Blend-Shell Experiment

_Last updated: 2026-07-10 (R4 narrow-band Surface Nets SHIPPED at 13-22x;
the HUMANOID prototype exists — iterated v1 -> v4.2 by screenshot rounds,
15/16 prims, walking with spring-driven arms and gait-phase body motion
from the animation-principles research. Suite: 1410 probes ALL PASS at
HEAD 4365d0a. Next is Pass C of the animation plan — see "Next steps".)_

## What this is — and the PURPOSE (clarified 2026-07-07)
The "SDF blend-shell" character technique: capsule/sphere prims whose
mesh vertices snap onto the combined smooth-min SDF in a vertex shader,
toon-shaded, outlined by a screen-space depth-ink pass, animated by
data. **Daniel's stated end goal: a set of SKILLS that let a future
Claude build good-looking game creatures fast — "design a flying
creature" should resolve in minutes because this project already
measured what works. The first skill EXISTS: creature-forge (delivered
2026-07-07); this repo remains the laboratory, and each research build
feeds a recipe back into it.** The suite is what makes the knowledge
trustworthy (every claim traces to a probe).

**Stack:** Three.js pinned 0.170.0 (CDN import map pinning BOTH `three`
and `three/addons/` to 0.170.0), no bundler, VS Code Live Server,
Windows/Node-only (no Python). **Repo:**
https://github.com/Cupcakechan/ExperimentProject, subfolder
`sdf-blend-shell/`. Container clones read-only for Claude; **Daniel
pushes, Claude pulls** — the standing gate every round: `git fetch` +
`reset --hard origin/main` (NEVER blind-reset over uncommitted container
work — reconcile first), byte-diff any delivered files vs HEAD,
`node test_suite.mjs`, PROBE COUNT = the certification number.
Deliveries are FULL files staged in `/mnt/user-data/outputs/` +
present_files. Method: Daniel's General Instructions (userPreferences)
+ the dev-method skill; options round -> Daniel picks -> one tested
pass per commit; feel reports get mechanism + ONE lever; bug reports
get the debugging protocol (instrument, one focused fix).

## Current state
- **Pre-R4 tracks** (see git history + LESSONS for detail): R1
  screen-space depth ink (two-tier, INK_INTERIOR 0.45), R2 cubic C2
  smin, R3 mouths off the field (paint decals; k-validity CLOSED),
  C1 JSON import/export (`validate.js` = the rules, executable),
  C2 seeded archetype generator (8 archetypes, 120-seed sweep 100%),
  C3 terrarium (flat locomotion plane, ACTOR_CAP 24), footprint
  trails, pine props, hover/spin reference creatures.
- **R4 — Surface Nets (SHIPPED, un-banked 2026-07-09/10):**
  `surfaceNetsCore.js` is THREE-free (suite-probeable, worker-
  importable); thin THREE wrapper `surfaceNets.js`;
  `surfaceNetsWorker.js` module worker re-meshes animated poses off
  the main thread. **Narrow-band mesher** floods surface cells through
  mixed-sign faces (~3.4% of the grid), byte-identical output to full
  grid, **13-22x speedup** (strider @0.02: 241 -> 18 ms). The mesher
  self-reports `usedMethod: 'narrow'|'full-fallback'|'full'` and the
  suite asserts the taken path (LESSONS 2026-07-10: a silent fallback
  hid a dead optimization behind passing identity probes).
- **HUMANOID prototype (proto-local, NOT in the cast):** lives as an
  OVERRIDE table + appended arm prims in `src/proto-strider-anim.js`
  and `src/proto-strider.js` (the strider cast entry is UNTOUCHED).
  15/16 prims. Key measured values at v4.2 — torso a[0.11,1.00,0]
  b[0.11,1.20,0] r 0.18; head [0.02,1.56,0] r 0.20 (eyes re-rooted at
  HEAD_R - 0.045); hips y 0.92 z ±0.09; knees [-0.03, 0.45, ±0.14]
  (thigh r 0.08 k 0.07, shin r 0.08 k 0.06 — zero radius step at the
  knee); legs track z ±0.14; arms: SHOULDER [0.11,1.20,0.14] (torso
  top corner, sd -0.04), ELBOW [0.082,0.84,0.314] COLLINEAR (the
  lay-straight ask), HAND [0.06,0.56,0.45] — straight 26-deg rays,
  weld ends y 0.93 (ABOVE the hip: "arms come from the torso"),
  leg-zone corridor +0.023. Rest reach 0.949 (headroom is LOAD-
  BEARING — see the limp lessons). The corridor-PEAK metric (max
  field along an inward ray) is the arm/limb separation instrument;
  chi==2 alone is NOT a weld detector (a full-length weld is a lump,
  not a ring).
- **ANIMATION-PRINCIPLES track (research 2026-07-10, artifact in
  chat/compass):** verdict — first-order low-pass has no velocity
  memory = the stiffness mechanism; adopt second-order springs; do
  NOT adopt THREE AnimationMixer (PropertyBinding needs an Object3D
  per prim — pure friction for a uniform rig). Plan: A springs ->
  B body motion -> C counter-rotation + head -> D squash.
  - **Pass A (SHIPPED):** `src/secondOrder.js` — the f/zeta/r spring
    (t3ssel8r formulation, semi-implicit Euler + k2 stability clamp),
    THREE-free, suite Section A pins its behaviors (crit never
    overshoots; z0.6 overshoots 8.9% vs theory 9.5%; r=-1 =
    anticipation; clamp tames 5x undersampling; pause drift 0). Arms:
    shoulder spring 1.2 Hz z0.6 on the differential foot signal;
    forearm spring 1.0 Hz z0.5 CHASES the shoulder output (chained
    lag = overlapping action); overshoot measured in 208/480 frames.
  - **Pass B (SHIPPED):** gait-phase body motion, all signals derived
    ALGEBRAICALLY from foot state (no phase clock — sync-proof).
    Vertical bob rides pose.y (the gait was BUILT for a rig-level bob;
    planted feet IK-compensate): ±0.022, 2x/stride, high at
    mid-stance. Sway ±0.035 toward the stance foot 1x/stride
    (39/39 sign) — target = -sign(d) saturated, the spring's ~75-deg
    lag IS the phase corrector (d is a STAIRCASE, flat in double
    support — two drives failed measurement first; see LESSONS).
    Pelvic tilt 4.3 deg + yaw 4.0 deg (Saunders/Inman/Eberhart).
    Sway/tilt/yaw = ONE pelvis-centered matrix on the upper body;
    the arm matrices COMPOSE it, preserving all measured corridors.
  - **Limp fixes (both measured, both nonlinear):** (1) reach
    headroom — knee x -0.03; at 0.982 the legs were clamp-pinned 83%
    and the step trigger formed an asymmetric stretched/catch-up limit
    cycle; partial headroom is WORSE, don't split. (2) walk radius
    2.5 — R 1.2 curvature drove inner-foot double-stepping (35/67),
    bifurcates sharply at R~2.0.
- **Anim proto plumbing:** OVERRIDE block -> prims flatMap -> arms
  pushed -> simMat (gait sink, never rendered) + snMat -> gait ->
  bob -> bodyMotion -> armSwing -> snapshotPrims -> worker -> swap
  geometry + apply pose. Anim default cellSize 0.015 (the armpit
  corridor is ~one 0.02 cell: coarse grids pinhole there — and the
  watertight metric must SEPARATE boundary edges from benign
  non-manifold pinches; see LESSONS).
- **Cast (9, registry order = actor index order — APPEND ONLY):**
  Critter, Hopper, Longneck, Pudge, Shelby ('snail'), Skitter, Bloop
  ('floater'), Whirr ('flyer'), Strider (12-prim forward-leaning
  biped — the humanoid's donor, itself unchanged).

## Architecture map (one line each)
- `src/main.js` — scene, spawnActor, locomotion branch, trails hooks.
- `src/config.js` — every tunable; SOURCE OF TRUTH for constants.
- `src/anim.js` — entries-array anim + setPrimTransform (absolute-
  from-rest, pause-safe by law).
- `src/secondOrder.js` — the f/zeta/r spring-damper (THREE-free); the
  animation-principles workhorse. NEW since the harvest — carried-set
  candidate for the next creature-forge refresh.
- `src/gait.js` (feet/knees; `feet` + per-foot swingT exposed;
  pose.y is a rig-level bob input), `src/hop.js`, `src/blink.js`,
  `src/roam.js`, `src/feel.js`.
- `src/render/surfaceNetsCore.js` (THREE-free mesher: full grid +
  narrow-band + createCreatureField; `usedMethod` self-report),
  `surfaceNets.js` (THREE wrapper), `surfaceNetsWorker.js` (module
  worker), `buildShell.js`, `blendMaterial.js`, `inkPass.js`,
  `world.js`, `trails.js`.
- `src/proto-strider.js` / `strider.html` — humanoid STATIC pose page.
- `src/proto-strider-anim.js` / `strider-anim.html` — humanoid WALK
  page (worker re-meshing, HUD Hz dial, springs + body motion).
- `src/data/creatures.js`, `validate.js`, `creatureIO.js`,
  `generate.js`; `src/ui/controls.js`.
- `test_suite.mjs` — 1410 probes; import filter excludes main.js,
  proto-*, *Worker.js; newest sections: R4 SN identity (+usedMethod)
  and Section A spring behaviors.
- Docs: this file, `LESSONS.md` (31 entries; harvest marker for the
  first 20), `RESEARCH_TECHNIQUE.md` (SS1-9).

## The measured boundaries (the skill-critical digest)
Executable form: `validate.js`. Proof: the suite. Highlights —
- Decal band: every paint endpoint at -r < sd(host) < 0.
- Ball-eye dilate boundary: peak dilate <= eyeball r/3 else flat decals.
- Knee contract: thigh.b === shin.a exactly; reach headroom is not
  cosmetic (the limp lessons); knee INSIDE some solid at rest for
  SHELL validity — the humanoid VIOLATES this by design (exposed
  knees) and is therefore SN-only until a validity branch exists.
- Breath peak < thinnest solid r; INFL ceilings measured per creature.
- Mouths: paint slits sized MINUS peak dilate, below the eyes.
- Humanoid-era additions (proto-measured, not yet in validate.js):
  corridor-PEAK arm separation; per-leg gait symmetry stats; the
  two-class watertight metric (boundary vs pinch).

## Next steps (in order — this is the plan of record)
1. **Pass C — torso counter-rotation + head stabilization** (NEXT):
   chest-centered counter-yaw ~1.5x pelvis yaw anti-phase; head/neck/
   eyes on a near-critical secondOrder spring (f ~0.8, z ~0.9)
   targeting world-upright — the moving hold. Proto-local, usual cert.
2. **Pass D — footfall squash & stretch:** impact spring f 3-5 Hz
   z 0.3-0.5 driving volume-preserving radius/length modulation
   (r x 1/sqrt(lengthScale)) off gait footfall events. The signature
   move — the SDF makes it nearly free.
3. **Humanoid promotion decision** (options round when Passes C/D
   land): SN-into-main (worker scheduling for N actors is UNMEASURED —
   its own scoping round) -> cast promotion (blocked on shell validity:
   needs an SN-validity branch or SN-in-main first) -> humanoid C2
   archetype (the arms introduced new validity classes the generator
   must enforce).
4. **CONTACT-SHADOW** (options round on record from 2026-07-07;
   recommendation: analytic blob decals in the trails idiom).
5. **EXPORT-BAKE track** — now UNBLOCKED on the R4 side: the narrow-
   band mesher IS the clean watertight geometry export wants; the
   remaining open question is decals (flattened geometry vs vertex
   colors vs texture bake). Open with an options round.
6. **Creature-forge refresh (harvest session, dedicated):** carried
   modules are UNTOUCHED since the harvest, but the session banked
   real additions — secondOrder.js (carried-set candidate), the
   corridor-PEAK instrument, per-leg gait symmetry, the two-class
   watertight metric, the staircase-signal + spring-lag pattern, and
   the three 2026-07-10 LESSONS entries route there. Also fold the
   proto->skill story of the humanoid build (screenshot-round
   iteration on pure data).
7. Banked beyond: PICKING (ID-texture GPU picking), GPGPU flocking,
   contact ambience — RESEARCH SS9 Tiers B/C.

## Gotchas (live)
- No backticks inside GLSL template literals — edit-script replacement
  text has the SAME rule.
- The import map pins `three` AND `three/addons/` to 0.170.0.
- Modules must import headless (suite DOM stub): no canvas/DOM at
  module top level.
- Prop placement determinism: new prop classes APPEND in the seed
  stream.
- Watertight certs: count boundary edges (c===1) and pinches (c>2)
  SEPARATELY — only boundaries are defects; pinches are closed
  tangencies (benign, resolution-dependent).
- Gait symmetry is a MEASURED property: threshold-triggered stepping
  forms asymmetric limit cycles under reach saturation or path
  curvature; both observed bifurcations are sharp — clear them with
  margin, never split the difference (LESSONS 2026-07-10).
- Anim proto default cellSize 0.015; coarser dials are preview
  quality (armpit-corridor pinholes at 0.02).
- three.js examples on master target r18x and drift to WebGPU/TSL —
  pattern reference only; verify any API against r170.
- Reddit is unreachable from Claude's tools; Daniel pastes content.
