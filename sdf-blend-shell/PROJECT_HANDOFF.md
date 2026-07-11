# PROJECT_HANDOFF — SDF Blend-Shell Experiment

_Last updated: 2026-07-11 (the ANIMATION-PRINCIPLES PLAN IS COMPLETE —
Passes A-D all shipped and measured; squash feel-tuned to 0.025. SN-INTO-
MAIN SHIPPED as the Option 1 hybrid: surfaceNetsActor + a per-creature
render flag, the cast strider as proof creature, 33 meshes/s benchmarked.
Suite: 1422 ALL PASS at HEAD 28d9024. NEXT AGREED: biped rig extraction —
"Next steps" item 1.)_

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
- **Pre-R4 tracks** (git history + LESSONS for detail): R1 screen-space
  depth ink (two-tier, INK_INTERIOR 0.45), R2 cubic C2 smin, R3 mouths
  off the field (paint decals; k-validity CLOSED), C1 JSON import/export
  (`validate.js` = the rules, executable), C2 seeded archetype generator
  (8 archetypes, 120-seed sweep 100%), C3 terrarium (ACTOR_CAP 24),
  footprint trails, pine props, hover/spin reference creatures, and
  **contact shadows (SHIPPED research build 1, f8eebb8): analytic blob
  decals with an altitude fade law — `src/render/shadows.js`,
  one per actor.** (Earlier handoffs wrongly carried this as queued.)
- **R4 — Surface Nets (SHIPPED):** `surfaceNetsCore.js` THREE-free
  (suite-probeable, worker-importable); thin THREE wrapper; module
  worker. **Narrow-band mesher**: floods surface cells through mixed-
  sign faces (~3.4% of the grid), byte-identical to full grid,
  **13-22x speedup**. Self-reports `usedMethod` and the suite asserts
  the taken path (a silent fallback once hid the whole optimization).
- **HUMANOID prototype (proto-local, NOT in the cast):** an OVERRIDE
  table + appended arm prims in `src/proto-strider-anim.js` and
  `src/proto-strider.js` (the cast strider is UNTOUCHED — the chunky
  forward-leaning biped in main is the ORIGINAL, by design). 15/16
  prims. v4.2 values — torso a[0.11,1.00,0] b[0.11,1.20,0] r 0.18;
  head [0.02,1.56,0] r 0.20 (eyes re-rooted at HEAD_R - 0.045); hips
  y 0.92 z ±0.09; knees [-0.03, 0.45, ±0.14] (thigh r 0.08 k 0.07,
  shin r 0.08 k 0.06); arms SHOULDER [0.11,1.20,0.14], ELBOW
  [0.082,0.84,0.314] COLLINEAR, HAND [0.06,0.56,0.45] — straight
  26-deg rays, weld ends y 0.93 (above the hip), leg-zone corridor
  +0.023. Rest reach 0.949 — the headroom is LOAD-BEARING (limp
  lessons). Instruments that live here: corridor-PEAK separation
  metric; chi==2 alone is NOT a weld detector.
- **ANIMATION-PRINCIPLES TRACK — COMPLETE (research artifact in chat;
  verdict: springs over low-pass, no THREE AnimationMixer):**
  - **Pass A:** `src/secondOrder.js` — f/zeta/r spring (t3ssel8r,
    semi-implicit Euler + k2 stability clamp), THREE-free, suite
    Section A pins behaviors (crit never overshoots; z0.6 ~9%;
    r=-1 anticipation; clamp tames 5x undersampling; pause drift 0).
    Arms: shoulder spring 1.2 Hz z0.6 on the differential foot signal;
    forearm 1.0 Hz z0.5 CHASES the shoulder output (chained lag).
  - **Pass B:** gait-phase body motion from FOOT-STATE signals (no
    phase clock — sync-proof; d is a STAIRCASE, two drives failed
    measurement first). Bob rides pose.y ±0.022 (2x/stride, high at
    mid-stance — the gait was built for a rig-level bob). Sway ±0.035
    toward the stance foot (spring lag = the phase corrector). Tilt
    4.3 deg, yaw 4.0 deg. One pelvis-centered matrix; arms compose it.
  - **Limp fixes (both nonlinear):** knee headroom (reach 0.982 ->
    0.949; the clamp-saturated step trigger formed an asymmetric limit
    cycle; PARTIAL headroom is worse) and walk radius 2.5 (R 1.2
    curvature drove inner-foot double-stepping 35/67; bifurcates ~2.0).
  - **Pass C:** shoulder counter-rotation carried by the ARM matrices
    (a vertical capsule torso can't show yaw) — chest-centered
    -1.5x pelvis yaw, measured shoulder/pelvis ratio exactly -0.50.
    Neck stays on the pelvis matrix (shared point with the torso).
    Head group (head+eyes) on its own stabilizer about the neck top:
    HEAD_F 2.2 BY SWEEP — the research's f 0.8 AMPLIFIED at reversals
    (see LESSONS 2026-07-11: cancellation springs must out-bandwidth
    the disturbance); RMS halved, worst 0.73, lag keeps the hold read.
  - **Pass D:** footfall squash & stretch — landings pulse a spring
    (f 4, z 0.4) compressing the torso VERTICALLY ABOUT THE PELVIS
    (legs keep their IK) with uR x 1/sqrt(lengthScale); VOLUME
    MEASURED 1.003 at peak. SQUASH_AMP feel-tuned 0.07 -> 0.04 ->
    **0.025** (the spring dips ~1.3x the target on entry). The
    snapshot carries LIVE uR — squash must reach the worker.
- **SN-INTO-MAIN (SHIPPED, Option 1 hybrid):**
  `src/render/surfaceNetsActor.js` — sink material + shared lazy
  worker + round-robin queue + geometry swap; snapshots carry live
  uA/uB/uR; the swap shades with THE SNAPSHOT that produced the
  geometry. `spawnActor` branches on `creature.render === 'sn'`; the
  sink slots in as actor.material so gait/anim/blink write paths are
  renderer-blind. The SN mesh rides the rig (pose never lags; shape
  lags at the mesh rate). The CAST STRIDER carries `render: 'sn'` as
  the proof creature (shell-valid = A/B-able; delete the one line to
  compare). Suite Section SN-ACTOR: 11 probes under an injected fake
  worker. **Benchmark (container, cell 0.015): 33 meshes/s sustained
  -> 1 actor ~33 Hz, 3 ~11 Hz, 8 ~4 Hz — design against these.**
  KNOWN DIVERGENCES (deliberate, this pass): SN actors do NOT breathe
  (a field change would force constant idle re-meshing; shader-side
  breath is queued); scheduling is v1 always-dirty (idle-skip is a
  measured follow-up).
- **Anim proto plumbing:** OVERRIDE block -> prims flatMap -> arms
  pushed -> simMat sink + snMat -> gait -> bob -> bodyMotion (sway/
  tilt/yaw + counter-rotation + head springs + squash) -> armSwing ->
  snapshotPrims (live uR) -> worker -> swap. Anim default cellSize
  0.015 (0.02 pinholes the armpit corridor; separate boundary from
  pinch — LESSONS).
- **Cast (9, registry order = actor index order — APPEND ONLY):**
  Critter, Hopper, Longneck, Pudge, Shelby ('snail'), Skitter, Bloop
  ('floater'), Whirr ('flyer'), Strider (now SN-rendered in main).

## IDEA SHELF (banked, not scheduled)
- **FPS game** ("wield a gun, shoot alien creatures") — scoped
  2026-07-11: the cost structure inverts in our favor (enemies are the
  solved part). Prims ARE the hitboxes (ray-vs-capsule closed-form,
  per-part identity = headshots free); the C2 generator is the enemy
  bestiary; the squash spring is a flinch primitive; shell renderer
  proven at 24 actors covers grunt waves; the humanoid = the one SN
  boss. New work = the FPS shell (pointer-lock controller, arena,
  hitscan, waves, deflate-and-sink deaths) ~4-6 sessions to a slice.
- **Creature sanctuary/collector** — earlier survey's Option 1;
  reuses the terrarium almost wholesale; architected for breeding.

## Architecture map (one line each)
- `src/main.js` — scene, spawnActor (shell OR SN branch), locomotion,
  trails, shadows, ink.
- `src/config.js` — every tunable; SOURCE OF TRUTH for constants.
- `src/anim.js` — entries-array anim + setPrimTransform (absolute-
  from-rest, pause-safe by law).
- `src/secondOrder.js` — the f/zeta/r spring-damper (THREE-free);
  carried-set candidate for the creature-forge refresh.
- `src/gait.js` (feet/knees; pose.y is a rig-level bob input),
  `src/hop.js`, `src/blink.js`, `src/roam.js`, `src/feel.js`.
- `src/render/surfaceNetsCore.js` (THREE-free mesher: full + narrow-
  band + createCreatureField; usedMethod self-report),
  `surfaceNets.js`, `surfaceNetsWorker.js`,
  `surfaceNetsActor.js` (NEW: the SN actor for main; carried-set
  candidate), `buildShell.js`, `blendMaterial.js` (both materials),
  `inkPass.js`, `shadows.js` (contact blobs), `world.js`, `trails.js`.
- `src/proto-strider.js` / `strider.html` — humanoid STATIC pose page.
- `src/proto-strider-anim.js` / `strider-anim.html` — humanoid WALK
  page: the FULL animation stack lives here (extraction pending).
- `src/data/creatures.js` (render flag lives here), `validate.js`,
  `creatureIO.js`, `generate.js`; `src/ui/controls.js`.
- `test_suite.mjs` — **1422 probes**; import filter excludes main.js,
  proto-*, *Worker.js; newest sections: Section A (springs) and
  Section SN-ACTOR (fake-worker scheduler probes).
- Docs: this file, `LESSONS.md` (32 entries; harvest marker for the
  first 20), `RESEARCH_TECHNIQUE.md` (SS1-9).

## The measured boundaries (the skill-critical digest)
Executable form: `validate.js`. Proof: the suite. Highlights —
- Decal band: every paint endpoint at -r < sd(host) < 0.
- Ball-eye dilate boundary: peak dilate <= eyeball r/3 else flat decals.
- Knee contract: thigh.b === shin.a exactly; reach headroom is not
  cosmetic; knee INSIDE some solid at rest for SHELL validity — the
  humanoid VIOLATES this by design and is SN-only until the validate
  SN branch exists (Next steps item 2).
- Breath peak < thinnest solid r; INFL ceilings measured per creature.
- Humanoid-era instruments (proto-measured, not yet in validate.js):
  corridor-PEAK arm separation; per-leg gait symmetry stats; the
  two-class watertight metric (boundary vs pinch); stabilizer
  bandwidth rule; SN benchmark budget (33/N Hz).

## Next steps (in order — this is the plan of record)
1. **Biped rig extraction (AGREED NEXT, 2026-07-11):** lift Passes
   A-D out of `proto-strider-anim.js` into a reusable module (working
   name `src/bipedRig.js`): takes a creature with the humanoid prim
   ids + a sink material, owns the springs/body motion/counter-
   rotation/head hold/squash, exposes update(dt, gaitState). THREE-
   free where possible; suite section with the measured behaviors
   (anti-phase, bob shape, stabilizer ratios) as probes. The proto
   then CONSUMES the module (byte-behavior parity check). This is the
   artifact creature-forge wants and what creature #10 needs to walk.
2. **validate.js SN branch:** `render: 'sn'` creatures skip shell
   validity (buried knees) and get the watertight-class rules
   (boundary===0 at authoring cell; pinches tolerated). Suite-heavy.
3. **Author creature #10 — the humanoid** into the cast (append-only)
   once 1+2 exist; spawns in main via the SN path with the rig.
4. **SN follow-ups (design against the 33/N benchmark):** idle-skip
   dirty detection (uniform version counters — touches anim.js, a
   CARRIED module: flag the refresh), shader-side breath for SN
   materials, worker pool / LOD cells if N grows.
5. **Humanoid C2 archetype** — seeded variants; the generator must
   enforce the arm-corridor and reach-headroom rules.
6. **EXPORT-BAKE track** — unblocked by R4 (narrow-band IS the export
   geometry); open question is decals (flatten vs vertex colors vs
   texture bake). Options round.
7. **Creature-forge refresh (dedicated harvest session):** carried
   modules touched since harvest: NONE — but the carried-set grew two
   candidates (secondOrder.js, surfaceNetsActor.js) and the routing
   backlog is rich: LESSONS 2026-07-10 x3 + 2026-07-11 x1, the
   corridor-PEAK instrument, per-leg symmetry, the two-class
   watertight metric, staircase signals + spring-lag phase correction,
   stabilizer bandwidth, the SN budget numbers, and the humanoid
   screenshot-round build story.
8. Banked beyond: PICKING (ID-texture GPU picking), GPGPU flocking —
   RESEARCH SS9 Tiers B/C. Plus the IDEA SHELF above.

## Gotchas (live)
- No backticks inside GLSL template literals — edit-script replacement
  text has the SAME rule.
- The import map pins `three` AND `three/addons/` to 0.170.0.
- Modules must import headless (suite DOM stub): no canvas/DOM/Worker
  at module top level — surfaceNetsActor creates its worker LAZILY;
  keep it that way.
- Prop placement determinism: new prop classes APPEND in the seed
  stream.
- Watertight certs: boundary edges (c===1) and pinches (c>2) are
  SEPARATE classes — only boundaries are defects.
- Gait symmetry is a MEASURED property; both known limit-cycle
  bifurcations are sharp — clear them with margin (LESSONS 2026-07-10).
- Cancellation springs must OUT-BANDWIDTH the disturbance; lag is for
  character axes only (LESSONS 2026-07-11).
- SN actors: no breath (deliberate, this pass), always-dirty v1
  scheduling, the swap shades with the snapshot — keep that contract.
- Anim proto default cellSize 0.015; coarser dials are preview quality.
- three.js examples on master target r18x and drift to WebGPU/TSL —
  pattern reference only; verify any API against r170.
- Reddit is unreachable from Claude's tools; Daniel pastes content.
