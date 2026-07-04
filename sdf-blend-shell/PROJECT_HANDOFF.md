# PROJECT_HANDOFF — SDF Blend-Shell Experiment

_Last updated: 2026-07-03 (fogleman harvest Passes 1–3 browser-confirmed + pushed; PASS 4 NEGATIVE PRIMS delivered — awaiting browser confirmation)_

## What this is
An experiment replicating the "SDF blend-shell" character technique from a
Reddit post (r/aigamedev) — **with an explicit end goal: build transferable
knowledge for a future dev-method SKILL so Claude can procedurally generate
new creatures from data alone — a tool Daniel (and others) can build games
with, not just a demo.** The registry schema, the invariants proven by the
suite, the measured field numbers, and LESSONS.md are the raw material for
that harvest. **Harvest timing is Daniel's call** — Claude notes candidates
as they appear and reminds occasionally; Daniel decides when.

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
- **Option 2 — "the living blob"**, staged in two passes — BOTH DONE.
- Per-pixel shading polish, buried-geometry tuck, CRITTER, gallery
  (3 creatures), decal-inflation fix, kCap, toon outline + burial ramp,
  roam+bob, per-prim transform plumbing, THE FIELD, STAGE 3 GAIT — ALL
  DONE and browser-confirmed (see Current state).
- **FOGLEMAN HARVEST ROADMAP (locked options round, this session):** mined
  https://github.com/fogleman/sdf for operator vocabulary. Their engine is
  the inverse pipeline (offline marching-cubes bake — nothing portable),
  but their operators transfer; their smooth union is character-identical
  to ours and their per-operand `.k()` + sequential fold matches our
  architecture. Verified formulas live in `REFERENCE_FOGLEMAN.md` (in the
  project root, committed) — written because Claude's container resets
  between sessions. Roadmap: Pass 1 field inspector -> Pass 2 per-prim k
  -> Pass 3 dilate -> Pass 4 negative prims -> (shelf) Pass 5 creature
  morphing via mix(dA,dB,t). PARKED: domain warps (twist/bend) — warped
  fields break the Lipschitz-1 assumption the raw snap step relies on;
  extra capsules are cheaper. REJECTED: per-PAIR k tables — sequential
  smin has no "pairs" in the math; faking it (k switched by nearest prim)
  makes the field discontinuous. Per-prim absolute k IS the endpoint.

## Current state
- Everything through STAGE 3 GAIT: browser-confirmed and pushed (gait
  confirmed at the start of this session, before the harvest passes;
  earlier hashes in git history: `95e09ab`, `54fcc20`, `2e98d0c`,
  `8bca4b8`, `f20a89a`, `bae461c`, `2e9fd82`, `53c1d76`, `bc3d97`->
  `bc3ad97`, `35a9f07`, `4b05142`, `d49dbab`; session hashes for the
  harvest passes not recorded in-chat — see `git log`).
- PASS 1 — FIELD INSPECTOR delivered, browser/suite-confirmed, pushed:
  `test_suite.mjs` Section 2. A JS mirror of `mapSDF` + a plane-slice
  sampler (the fogleman `show_slice` idea, Node-only): y/z slices through
  every solid prim's midpoint, sign-change edges bisected (30 iters) to
  the zero contour, inflation (min raw solid distance) measured there.
  Hand-computed synthetic-pair anchors validate the pipeline against
  exact theory (pair midpoint = -k/4; ridge inflation = k/4; kCap parity).
  ASCII field dump prints ONLY on probe failure. **FINDING (harvest
  material): the pairwise k/4 inflation bound is WRONG here — mapSDF
  folds smin sequentially, so 3+ close prims compound the deficit.
  MEASURED: hopper 0.0969 at k=0.25 (k/4=0.0625, +55%; body + both feet
  under the belly); longneck 0.2969 at k=0.6 (~2x k/4). Ceilings in
  `INFL_CEILING` are MEASURED + 0.02 margin; the INFO lines re-measure
  every run.** Also observed: at k=0.6 the skin balloons below y=0
  (hidden by the ground disc — legit field behavior).
- PASS 2 — PER-PRIM ABSOLUTE k delivered, confirmed, pushed: optional
  `k` per prim (world units); effective k = min(k ?? slider, kCap ?? inf).
  `uKPrim[MAX_PRIMS]`, sentinel -1 = follow the slider (legal k is always
  > 0). Semantics: **authored beats ambient** — the slider is the global
  mood for unauthored prims; an explicit k is final intent and holds
  against it. kCap unchanged, ceilings both. No creature adopts k yet.
  Field-neutral, PROVEN: INFO lines byte-identical across the pass.
  Note: the decal compensation needed NO change (it subtracts MEASURED
  local inflation, k-agnostic — retract the earlier planning claim).
- PASS 3 — PER-CREATURE DILATE delivered, confirmed, pushed: optional
  `inflate` per creature (?? 0); `mapSDF` returns d - uInflate (the
  fogleman offset trick). Snap/normals/outline consume mapSDF -> ride
  the plumped skin free; decals measure real inflation -> free; the ONE
  consumer needing surgery was the BURIAL check (raw-distance threshold):
  boundary shifted to dOther - uInflate or the z-fighting seam returns in
  the raw-surface..plumped-skin band. main.js passes creature.inflate to
  BOTH draws (skin and ink must dilate equally or the outline detaches).
  No creature adopts inflate yet. Field-neutral, inspector-proven.
- PASS 4 — NEGATIVE PRIMS (smooth difference) delivered — **NOT yet
  browser-confirmed** (flip this line + checkpoint when Daniel verifies).
  `negative: true` per prim; TWO-PHASE mapSDF: union all positive solids,
  THEN subtract all negatives from the finished union (carve registry
  position can never matter — fogleman's difference(union(...), cuts)).
  sdiff = fogleman dn.py verbatim (two sign flips vs smin: (d2+d1) in h,
  correction ADDED). Negatives: NO mesh (host verts snap inward to line
  the bowl), NO burial (nothing coincident to z-fight), never a foot.
  Colored negatives join phase-1 proximity blending -> the bowl darkens
  and fades at the rim (uNeg encoding 0/1/2: solid / colorless carve /
  colored carve — encoding exists because the SHELL_COLOR fallback must
  not tint colorless bowls). dSkin stays POSITIVES-only (decal
  compensation must never see carves). DEMO CARVE: hopper `mouth` (r 0.16
  sphere, 0.107-deep 0.30-wide dark bowl, kCap 0.11, suite-checked clear
  of the eyes; delete the one registry line to remove). Sphere density
  raised 24x16 -> 32x24: the donor probe measured exactly 8 host verts in
  the bowl at old density (the floor — detached-legs class, sphere
  edition); now 14, floor encoded 11. Inspector GENERALIZED: uncarved
  creatures keep the exact smin<=min invariant; carved creatures get
  MEASURED hard-CSG band bounds (`CARVE_BOUNDS`: hopper hardBand
  0.048@k0.25 / 0.030@k0.6, carveFloor 0.127 — measured min inflation
  -0.1066 vs hand-computed penetration 0.1068: the field confirmed the
  hand math). Suite ~360 probes ALL PASS; critter/longneck INFO lines
  byte-identical (their fields untouched).
- Suite pattern now: Section 0 module imports, Section 1 creature
  invariants + measured sims, Section 2 field inspector (mirror parity,
  hand-computed operator anchors for smin/sdiff/dilate/kCap/k, slice
  measurements, MEASURED ceilings/bounds tables, ASCII dump on failure).
- Cost notes: shading ~5 field evals/pixel; mapSDF now two loops (still
  MAX_PRIMS-bounded); spheres ~2x verts (tiny meshes). Desktop-fine;
  measure before any mobile claim.
- History quirk (accepted): Stage A commit appears twice (`1e10576`,
  `95e09ab`) — harmless.

## Architecture
- `REFERENCE_FOGLEMAN.md` — verified operator formulas from fogleman/sdf
  (smooth difference/intersection, dilate/erode, blend, shell; caveats;
  the meta-lesson "inexact SDFs break consumers"). Exists because
  Claude's environment resets — no future session re-derives from memory.
- `src/data/creatures.js` — the GALLERY. Creature = { id, name, prims,
  anim?, step?, inflate? }. Prim = { id, type, a, b?, r, color?, paint?,
  kCap?, k?, negative? }. The header documents ALL authoring rules
  (stage bounds, face -X, capacity, paint poke-through, decal order,
  thin-part kCap ~0.7r, k vs kCap semantics, inflate sizing, carve rules:
  dent-don't-pierce / carve kCap / donor density) — core skill material.
- `src/render/buildShell.js` — one mesh per prim that OWNS surface (paint
  AND negative prims skipped), baked world-space, merged; aPrim = registry
  index. Custom cylinder+hemisphere capsules (CAPSULE_RINGS_PER_UNIT);
  spheres 32x24 (donor density for carve bowls).
- `src/render/blendMaterial.js` — the heart. FIELD_GLSL shared by both
  shaders: sdCapsule, smin, sdiff, primK(i) (authored k ?? slider, kCap
  ceilings), TWO-PHASE mapSDF (union positives, subtract negatives,
  - uInflate), sdfNormal (tetrahedron), blendColor (phase 1: solids +
  COLORED carves by proximity weight, dSkin positives-only; phase 2:
  paint decals composited in registry order riding measured inflation).
  Vertex: per-prim uPrimMat transform, burial check (positives only,
  boundary shifted by uInflate), snap to uSnapOffset, continuous
  bury-ramp tuck. Uniforms per material instance (skin + ink separate).
- `src/anim.js` — setPrimTransform lockstep (uPrimMat + uA/uB together);
  single-prim wave. NOTE: negatives sit in the same uniform arrays, so
  setPrimTransform can move a CARVE (animated mouth = future feature,
  zero new plumbing).
- `src/gait.js` — reactive stepping; aimStretchMatrix pure/exported.
- `src/roam.js`, `src/ui/controls.js`, `src/main.js`, `src/config.js` —
  unchanged roles; main.js passes creature.inflate to both materials.
- `test_suite.mjs` — committed permanent guard, ~360 probes, run:
  `node test_suite.mjs` (one-time: `npm install three@0.170.0`).

## Gotchas (project-specific)
- **No backticks inside the GLSL template literals.**
- three.js auto-prepends position/matrices/precision — never redeclare;
  custom attributes (aPrim) must be declared.
- GLSL ES loop bounds are compile-time constants (loop MAX_PRIMS, guard
  with uCount).
- `.gitignore` patterns flush-left.
- **The pairwise k/4 inflation bound is WRONG (up to ~2x with 3+ close
  prims — sequential folding). Never encode it; read the suite's INFO
  lines instead.** When any pass changes the field OR a creature adopts
  k/inflate/negative, re-measure and update INFL_CEILING / CARVE_BOUNDS
  from the INFO lines (+0.02 margin) — never loosen a ceiling blind; the
  ASCII dump above a FAIL shows the field.
- Carves: dent don't pierce; kCap ~0.7r or high k erases them; footprint
  comfortably wider than host inter-vertex spacing (levers: sphere segs,
  CAPSULE_RINGS_PER_UNIT).

## Open items / next steps
1. **Daniel: browser-verify PASS 4** — hopper has a small dark mouth
   below the eyes: smooth dent, dark tint fading at the rim, no faceting;
   check the INK at the mouth rim at grazing angles (winding defect
   class); slider to 0.6 — mouth softens but survives (kCap), eyes
   intact. Then git checkpoint (from `Experiment Project\` root).
2. Queued menu (each its own options round): hopper HOP state machine
   (the post's remaining animation concept — it waddles for now);
   gait FEEL pass (step-synced bob, lean into turns); two-segment knees;
   BREATHING (animate uInflate — unlocked by Pass 3, zero new plumbing);
   LIVING FACE (blink via decal anim / mouth motion via setPrimTransform
   on the carve — unlocked by Pass 4); Pass 5 creature morphing (shelf);
   in-browser field slice viewer (deferred half of Pass 1); terrarium
   (population); tool-facing: creature JSON import/export, seeded
   creature GENERATOR graded by the suite; OUTLINE_WIDTH/COLOR taste
   pass (one-value tunes).
3. SKILL HARVEST — **Daniel's timing; do not push.** The post's technique
   list is fully implemented except procedural animation systems
   (state machines/IK); harvest sources: this handoff + LESSONS.md +
   REFERENCE_FOGLEMAN.md + the creatures.js authoring rules + the suite's
   measured tables.
