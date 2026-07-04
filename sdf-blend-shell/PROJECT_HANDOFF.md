# PROJECT_HANDOFF — SDF Blend-Shell Experiment

_Last updated: 2026-07-03 (five-creature gallery live; mouth saga closed — dilate-compensated
carve edge delivered, awaiting browser confirmation; ROADMAP proposal pending Daniel's ordering)_

## What this is
An experiment replicating the "SDF blend-shell" character technique from a
Reddit post (r/aigamedev) — **with an explicit end goal: a tool Daniel (and
others) can build games with — transferable knowledge for a future
dev-method SKILL so Claude can procedurally generate creatures from data
alone.** The registry schema, the suite's proven invariants, the measured
field tables, and LESSONS.md are the harvest's raw material. **Harvest
timing is Daniel's call** — Claude notes candidates and reminds
occasionally; Daniel decides when.

The technique: capsule/sphere primitive meshes whose vertices snap, in a
vertex shader, onto the smooth-min SDF surface of all primitives combined —
seamless bodies, SDF-gradient normals, ordinary mesh rendering.

**Stack:** Three.js (pinned 0.170.0 via CDN import map; no bundler; VS Code
Live Server on Windows). **Repo:**
https://github.com/Cupcakechan/ExperimentProject — this project is the
`sdf-blend-shell\` subfolder; git runs from the CONTAINER root.

## Current state (all browser-confirmed + pushed unless noted)
- Everything through STAGE 3 GAIT + the FOGLEMAN HARVEST Passes 1-4:
  field inspector (suite Section 2 — slice sampler, MEASURED inflation
  ceilings, ASCII dump on failure), per-prim absolute k (authored beats
  ambient; sentinel -1), per-creature dilate (inflate; burial boundary
  shifted), negative prims (two-phase mapSDF, sdiff verbatim from
  REFERENCE_FOGLEMAN.md, colorless-or-colored carves, no mesh/burial).
- FIELD EXPANSION: radii/camera scaled ~1.6x (SOFT 3.0, HARD 4.0, GROUND
  4.6, SPAWN 1.9, camera [-4.4,3.6,8.6]); spawn ring COUNT-SPACED
  (createRoam(seed, total) — the hardcoded /3 wrapped seed 3 onto seed 0);
  suite field sim sized by the gallery; MEASURED at 5 actors: closest
  approach 1.269, max radius 3.628 (clamp now a safety net, not a wall).
- GALLERY = FIVE creatures: Critter, Hopper, Longneck, + PUDGE (first
  inflate user 0.04, carved mouth, 12 prims = capacity demo) + SHELBY the
  snail (first absolute-k user: shell k 0.06 stays crisp at slider 0.6;
  no anim + no step BY DESIGN — slides; eye decals on capsule stalk tips,
  'eye_' prefix skips the sphere-host pupil math on purpose).
- THE MOUTH SAGA (four defects, all root-caused, all suite-guarded):
  1) sphere carves read as shocked holes -> mouths are CAPSULE slits;
  2) colored carves in the weighted blend leaked a dark SHADOW (~42%
     of clean skin under dilate) -> carve interiors COMPOSITE like
     decals;
  3) "run-offs" = INK TRIANGLES FOLDING at the carve crease (black-domes
     class, third appearance; measured 16 folds -> 0) -> THE INK IGNORES
     CARVES (outline uniforms: negatives get uPaint=1/uNeg=0 — no crease
     exists to fold into); slits also SUBMERGED (endpoint sd < -0.005,
     suite-enforced) after grazing-corner analysis;
  4) pudge's edge BLURRED (hopper crisp — the one-difference diagnostic:
     dilate) -> carve coverage threshold shifts by the CONSTANT uInflate
     (co-dilated surfaces cross at the raw dihedral). NOT yet
     browser-confirmed (flip this line + checkpoint when verified).
  KNOWN LIMIT (queued, living-face pass): at extreme slider k the
  union-inflated skin outruns the carve's color reach — mouths fade;
  related: decal compensation reads MEASURED local inflation, which
  balloons capsule decals near joins/dilate (measured, deferred).
- PAUSE: [P] or Space freezes the SIM, camera stays live (screenshots);
  getDelta still called while paused (no resume spike); dt=0 verified
  safe through roam/gait/anim.
- Sphere meshes 32x24 (donor density for carve bowls). MAX_PRIMS still 12.
- Suite: 556 probes ALL PASS. Pattern: Section 0 imports, Section 1
  creature invariants + measured sims + generalized carve rules
  (dent/pierce at the MIDPOINT, submersion, decal clearance, donor
  density), Section 2 field inspector + operator anchors + measured
  tables (INFL_CEILING, CARVE_BOUNDS).

## Architecture (delta from before the harvest)
- `REFERENCE_FOGLEMAN.md` — verified operator formulas (exists because
  Claude's environment resets between sessions).
- `blendMaterial.js` — FIELD_GLSL: sdCapsule, smin, sdiff, primK(i),
  TWO-PHASE mapSDF (union positives -> subtract negatives -> - uInflate),
  sdfNormal, blendColor (solids weighted; COLORED carves composite with
  the dilate-shifted edge; paint decals last, inflation-compensated).
  buildUniforms(prims, snapOffset, inflate): ink hides negatives
  (uPaint=1/uNeg=0 when snapOffset > 0).
- `creatures.js` — schema: creature { id, name, prims, anim?, step?,
  inflate? }; prim { id, type, a, b?, r, color?, paint?, kCap?, k?,
  negative? }. The header's AUTHORING RULES are the core skill material
  (incl. mouths-are-submerged-capsule-slits + carve rules).
- `roam.js` — createRoam(seed, total): count-spaced spawn ring.
- `main.js` — pause state + keydown; passes creature.inflate to both
  draws; actors auto-flow from CREATURES.
- Instruments built this session (one-off scripts, patterns worth
  keeping): analytic surface-footprint probe (bisect the exact field,
  evaluate coverage), MESH-SAMPLED fragment probe (real geometry + snap
  mirror + barycentric interpolation), WINDING-FOLD detector (full
  pipeline mirror incl. burial+tuck, walks geo.index — raw position
  triplets are NOT triangles on indexed geometry). Candidate: fold
  detector as a permanent suite probe (roadmap: inspector upgrades).

## Gotchas (project-specific)
- No backticks in GLSL template literals; three auto-prepends built-ins;
  GLSL ES loop bounds compile-time; .gitignore flush-left.
- Pairwise k/4 inflation bound is WRONG (sequential folding, ~2x with
  crowding) — read the suite's INFO lines; re-measure INFL_CEILING /
  CARVE_BOUNDS (+0.02 margin) whenever the field or a creature changes;
  never loosen a ceiling blind (the ASCII dump above a FAIL shows why).
- Carves: dent don't pierce; SUBMERGE slit endpoints; kCap ~0.7r;
  footprint >> host inter-vertex spacing; the ink never sees them.
- Instruments must sample what the GPU samples (indexed triangles,
  interpolated fragments) — a clean analytic surface probe can pass
  while the render fails.
- Suite needs one-time `npm install three@0.170.0`; run `node
  test_suite.mjs`.

## Open items / next steps
1. **Daniel: browser-verify the dilate-compensated mouth edge** (pudge
   crisp like hopper; hopper unchanged) + checkpoint.
2. **ROADMAP (proposal below, Daniel reorders freely):**
   - A1 Hopper HOP state machine (the post's last unlearned concept —
     state machines; gates the harvest).
   - A2 BREATHING (animate uInflate; the carve edge auto-compensates —
     one-pass charm).
   - A3 Gait FEEL pass (step-synced bob, lean into turns).
   - A4 LIVING FACE (expressive/animated mouths via setPrimTransform on
     carves; blink; PLUS the deferred items: decal-compensation rework,
     high-k mouth fade, fold-detector suite probe).
   - A5 Two-segment knees.
   - B1 In-browser field slice viewer; B2 Pass 5 creature morphing.
   - C1 Creature JSON import/export; C2 SEEDED CREATURE GENERATOR
     (suite-graded — the skill executed as code); C3 Terrarium.
3. SKILL HARVEST — Daniel's timing; sources: this handoff, LESSONS.md
   (11 entries), REFERENCE_FOGLEMAN.md, creatures.js authoring rules,
   the suite's measured tables.
