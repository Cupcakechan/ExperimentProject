# PROJECT_HANDOFF — SDF Blend-Shell Experiment

_Last updated: 2026-07-04 (pudge goggles fix CONFIRMED + pushed; A5 + limb groups in;
act two in; ACT THREE
(capless knee ends) DELIVERED — awaiting confirm; next: C-track. A5 completes
the A-track: the flagged SKILL-HARVEST checkpoint — Daniel's timing)_

## What this is
The "SDF blend-shell" character technique (capsule/sphere prims whose mesh
vertices snap onto the combined smooth-min SDF in a vertex shader) — **end
goal: a game-creation tool; the harvest into a dev-method SKILL is Daniel's
call on timing** (natural checkpoint flagged: A-track completion). Harvest
sources: this handoff, LESSONS.md (12 entries), REFERENCE_FOGLEMAN.md,
creatures.js authoring rules, the suite's measured tables.

**Stack:** Three.js pinned 0.170.0 (CDN import map, no bundler), VS Code
Live Server, Windows/Node-only. **Repo:**
https://github.com/Cupcakechan/ExperimentProject, subfolder
`sdf-blend-shell\` (git runs from the container root).

## The locked roadmap (Daniel-approved order)
A1 hop ✅ -> A2 breathing ✅ (+ idle rests ✅) -> A3.1 step-bob+lean ✅ ->
A3.2 squash-stretch ✅ -> A4 stage 1 (debts, resolved by MEASUREMENT) ✅
-> **A4 STAGE 2 blink + jaw-drop (DELIVERED, unconfirmed)** -> A5
two-segment knees -> C-track: JSON import/export, SEEDED CREATURE
GENERATOR (suite-graded), terrarium; B-track breathers: slice viewer,
Pass-5 morphing. REFERENCE-CREATURE QUEUE (from the original post's
screenshots): floater (hover locomotion mini-pass), propeller flyer
(continuous-spin anim mode + hover); six-legs + protruding ball eyes
DONE (Skitter).

## Current state (confirmed + pushed unless noted)
- Fogleman harvest Passes 1-4 (field inspector w/ measured ceilings +
  ASCII failure dumps; per-prim absolute k; per-creature dilate; two-phase
  negative prims), field expansion (~1.6x, count-spaced spawns), FIVE
  creatures (Critter, Hopper, Longneck, Pudge = inflate 0.04 + carve,
  Shelby = absolute-k shell + no anim/step by design), pause ([P]/Space,
  camera stays live), the four-defect MOUTH SAGA closed (capsule slits,
  composite carve color, ink-ignores-carves, dilate-shifted edge).
- A1 HOP: src/hop.js — PAUSE->CROUCH->AIR->LAND, DRIFT-TRIGGERED off the
  logical roam point (the LOGICAL/DISPLAYED SPLIT: roam untouched as the
  continuous mover others steer around; displayed body bursts between
  points on its path — avg speed self-regulates, MEASURED 6.97 vs 7.00
  over 20s, 13 hops). Feet owned by the hop through the same anchors/
  aim-stretch/setPrimTransform lockstep; continuous arc hopArcY (launches
  from -dip, peak = height exactly). Hop beats gait in main when both
  exist. hopper: `hop: {}` (all config defaults, per-field overridable).
- A2 BREATHING: pure breathInflate in anim.js (0.5*(1-cos): rest identity
  at t=0, inhale to inflate+amplitude); main writes BOTH draws' uInflate
  (phase = bobPhase). Adopters: pudge 0.02@1.6, hopper 0.012@2.2, snail
  0.012@0.9; critter/longneck deliberately still (contrast + the field-
  neutral control group). **The inspector audits breathing creatures at
  BREATH PEAK** (it caught pudge at 0.1221 vs the 0.122 ceiling on its
  first run — margin eaten exactly by the amplitude). All consumers
  follow by construction (burial shift, carve edge, outline, decals).
- IDLE RESTS: roam.js idleSpeedMul — deterministic schedule on the
  (seed-offset) wander clock; smoothstep shoulders; EXACTLY 0 on the
  plateau (suite: position bit-identical for a full second, walking
  resumes, heading keeps drifting = looking around). Wander turn
  attenuated while idle; boundary/separation steering + push FULL
  strength. Per-creature `idle` overrides (snail rests 4.5s/11s).
  Drift-triggered gait/hop stop automatically — zero changes there.
  Also: free bob removed from non-gait creatures (Shelby hovered 0.035
  over a 0.012 breath — drowned 3:1).
- A3.1 FEEL: src/feel.js pure helpers — stridePulse (step-synced body
  lift; sin^2 after the micro-jump report — zero-slope endpoints),
  leanTarget + approach + headingDelta (banked turns: roll about LOCAL X,
  creatures face -X; rig rotation.order YXZ; wrap-safe smoothed omega;
  clamp against steering spikes). Free bob RETIRED (BOB_* deleted;
  bobPhase survives as the breath decorrelator). Lean sign confirmed in
  browser.
- A3.2 SQUASH-STRETCH + BOB SUSPENSION:
  (1) squashEndpoints in feel.js — anisotropic squash/stretch via
  ENDPOINT splits (X = wider/flatter, Y = taller), r untouched, no new
  uniform, NO shader change: uPrimMat stays identity and the vertex SNAP
  absorbs the deformed field (the technique's thesis). **The uR-channel
  framing was retracted: per-prim radius is isotropic — shrinking r
  reads as deflating, not squashing.** Hop drives it: CROUCH loads a
  squash (dip's ease), AIR stretch follows |vertical speed| (zero at
  apex exactly), LAND impact squash easing out; the CROUCH->AIR and
  AIR->LAND flips are DELIBERATE one-frame shape pops (cartoon
  anticipation/impact). Absolute-from-rest writes each frame; suite sim
  verifies squash/stretch live + BIT-EXACT rest restoration; deformed
  mouth endpoints stay submerged both extremes (-0.083/-0.035 — safe
  direction). Sphere prims only (a capsule's own segment would be
  overwritten); hop.squashPrim ?? 'body', graceful -1 if absent.
  (2) The bob "convulsing" fix: sin^2 was insufficient — discrete
  full-range humps at irregular drift-triggered cadence still twitch;
  the body is a MASS: actor.lift = approach(lift, target, LIFT_SMOOTH
  5.0, dt) — the suspension. Lever: lower = heavier.
- SKITTER (the reference six-legger, PURE DATA — zero engine code):
  15 prims -> MAX_PRIMS 12->16; TRIPOD gait groups [[0,3,4],[1,2,5]]
  (leg-count-is-data proven at 2/4/6); thin kCap'd pointy legs (r 0.055,
  kCap 0.04); green-tipped antennae; PROTRUDING BALL EYES = solid white
  eyeballs (r 0.085, kCap 0.03, pure white after the eye tune — the
  fixed-width ink ring reads huge on small balls) + 'iris_*' decals
  hosted ON the eyeballs (nearest-solid hosting; the iris_ name dodges
  the pupil/sclera layering probe by design). Suite graded it COLD:
  120 steps, drift 0.297, 6-actor field closest 1.291. First FULLY
  AUTHORED-BLEND creature: inflation identical at both k (0.0097 —
  every close pair capped, slider-immune by design; the growth probe is
  now conditional on slider-governed pairs).
- A4 STAGE 1 (debts, resolved by MEASUREMENT — no shader surgery):
  (1) capped-measured carve compensation KILLED by probe (floods pudge
  at k=0.6: threshold 0.12 on a 0.26 head); (2) the high-k mouth fade
  closed as a MEASURED DESIGN BOUNDARY — at extreme k the union deficit
  (~0.15+) EXCEEDS the carve r (0.068): the mouth GEOMETRY is swallowed;
  no color model paints dissolved geometry (authoring rule: mouth r
  comfortably above the site's expected inflation); (3) the decal-rework
  debt DISSOLVED (the balloon was on the never-shipped decal-mouth;
  shipped decals sound — rule: decals on low-inflation sites); (4) FOLD
  DETECTOR shipped as a permanent probe: full ink-pipeline mirror over
  indexed triangles at every carve — it discovered 7 pre-existing
  BENIGN folds at hopper's body-foot junction (the offset surface
  pinches at any concave junction; slivers nest in the join's dark
  crevice) -> the probe CLASSIFIES: OPEN-SKIN folds asserted ZERO,
  junction-crease folds reported as INFO. Perf scare resolved: system/
  driver state, not the app (memory flat, snipping-tool lag was
  system-wide; restart fixed it — zero code changed).
- A4 STAGE 2: (1) BLINK, decal-driven:
  src/blink.js — eye decals SUBMERGE into their host (depth 2r + edge,
  direction = toward the closest point on the nearest solid — capsule
  hosts need the segment point, snail stalks); the 'lid' is the skin
  returning, zero shader change; deterministic schedule (BLINK_PERIOD
  4.2 / BLINK_TIME 0.18, sine close-open, per-actor phase stagger);
  absolute-from-rest via setPrimTransform, both draws. All six
  creatures blink (skitter's irises submerge into the solid eyeballs =
  a beat of blank white ball — browser judges). (2) JAW-DROP: hopper's
  carve opens through the AIR arc — sin(pi*u), widest at the apex
  (where stretch is zero: the reads trade off) — as a ROTATION about
  the body center (0.22 rad; constant depth, the corner-run-off guard)
  + 0.012 outward push; hand-computed apex midpoint y 0.3806 MEASURED
  EXACTLY in the sim; endpoints stay >= 0.005 submerged every frame
  (suite invariant); hop.mouthPrim ?? 'mouth', graceful -1.
- A4 STAGE 2.1 — CAST BALL-EYES + BLINK v2 (**awaiting browser
  confirm**): all six creatures now wear the reference ball eyes (solid
  white sphere rooted 0.015-0.02 in the host, kCap 0.03, iris_* decal
  ON the eyeball); sclera_*/pupil_* decal eyes deleted registry-wide
  (the layered-decal probe now guards a legacy pattern). Snail got tiny
  stalk-tip balls (r 0.05) — PROVISIONAL, revert to dots if they read
  worse. blink.js v2: SOLID prims blink too (a retracting eyeball is
  buried and the vertex tuck hides it — the lid via existing
  machinery); submerge target = nearest solid EXCLUDING self and other
  blink-listed prims (an iris retargets the body behind its departing
  eyeball — else a dark dot pokes the closed lid); depth = hostSd + 2r
  + PAINT_EDGE lands every eye EXACTLY 2r+edge under its lid (hopper
  hand-anchors: eyeball closed at 0.220 from the body center, iris at
  0.370 — both measured exact). 727 probes ALL PASS FIRST RUN; all
  INFL ceilings held (kCap'd eyeballs add ~nothing; pudge 0.1219 vs
  0.122); fold scans 0 open-skin (crease counts grew — the bboxes now
  contain eyeball junctions, benign class).
- PUDGE GOGGLES FIX — the BALL-EYE DILATE BOUNDARY (browser-caught,
  probe-killed solid-iris attempt, see LESSONS 13): a constant dilate
  compresses small-feature contrast toward 1, so ball eyes are valid
  only where peak dilate <= ~r/3 (suite-enforced); pudge (0.06 peak)
  sits past it and is REVERTED to his proven flat sclera+pupil decals
  (both balloon together — the painted read). Skitter great, blink v2
  cast-wide confirmed. 742 probes ALL PASS.
- A5 TWO-SEGMENT KNEES (**awaiting browser confirm**), Option 2 — the
  true walkers: critter + longneck legs split thigh+shin (shin keeps
  the old leg id: feet/groups/anim/blink all id-stable), knee solved
  by two-bone IK per frame. DESIGN: no pole field — the bend direction
  is the REST pose's knee offset off the hip-foot line (authored
  intent; suite requires >= 0.02 and rest reach < ~97% of L1+L2).
  gait.js: solveKnee + segmentMatrix (pure, hand-anchored: the shin
  needs both ends placed, so segmentMatrix = aimStretch + carry);
  DUAL-MODE dispatch — feet with a step.knees entry get the reach
  clamp (KNEE_STRAIGHT_FRAC 0.995 / KNEE_MIN_GAP 1.05, pin slips
  beyond) + IK; feet without keep the proven aim-stretch (hopper by
  design; SKITTER by CAPACITY: 6 knees = 21 > MAX_PRIMS 16, documented
  boundary). Walk-sim invariants at float epsilon: knee joint never
  separates (2.3e-16), NEITHER segment stretches (2.8e-16 — bend
  replaced stretch, the feature's claim), knee articulates (cos range
  1.09). INFL ceilings re-MEASURED (the knee crotch is a new uncapped
  pair): critter 0.083/0.26 -> 0.115/0.33, longneck 0.114/0.317 ->
  0.14/0.38. Longneck now 16/16 prims — zero headroom. 809 probes ALL
  PASS. Taste lever if knees read melty at high slider: kCap ~0.1 on
  the shins.
- KNEE-SEAM FIX (**awaiting browser confirm**): browser-caught black
  seam ring at every knee; MEASURED root cause = thigh/shin MUTUAL
  BURIAL (841 tucked verts + 600-vert transition rim per knee) atop a
  near-pinch concave crease (radius 0.0399 vs OUTLINE_WIDTH 0.035).
  Fix: LIMB GROUPS — uLimb[MAX_PRIMS] derived automatically from
  step.knees; same-limb prims skip each other in the burial loop (one
  continuous surface: coincident fragments shade identically — the
  skin-fold-invisibility reasoning). Body-limb roots unchanged. Fold
  detector now scans KNEE regions permanently (0 open-skin at every
  knee; crease baselines recorded). Possible residual: a THIN crease
  accent at deep bends (pinch margin 14%) — reads as toon knee
  language; levers if not: OUTLINE_WIDTH down or shallower bend.
  831 probes ALL PASS. See LESSONS 14.
- KNEE-SEAM ACT TWO (**awaiting browser confirm**, LESSONS 15): the
  limb-group fix made the seam MORE visible — hypothesis wrong. POSED
  measurement (the rest-only fold detector's blind spot): visible-zone
  folds identical exemption on/off; the slash = the INK CUSPING at deep
  folds (84 deg mid-swing), driven by STEP_LIFT 0.09 compressing the
  hip-foot distance to 69% of rest — no two-bone split survives that.
  Fix (Option 1, Daniel's pick): step.lift 0.05 data override for the
  kneed walkers (one gait line) + the reference look for free — deeper
  authored bends (0.07/0.06, reach 0.92-0.95, the knee reads in the
  silhouette) and HOOF-DARK shins (critter 0x2a8a67, longneck 0x9c6b2a
  — 'feet' at zero prim cost; capacity forbids foot prims). MEASURED:
  deepest fold 96/100 deg, ZERO frames under 90 (was 84 deg / 43
  frames). New guard: max knee cos < 0 through every simulated walk.
  Limb groups KEPT (measured: halves partial-tuck shells). 833 probes
  ALL PASS. Escalation if a faint line survives the browser: ink-only
  k floor (Option 2, designed, kCap-respecting).
- KNEE-SEAM ACT THREE (**awaiting browser confirm**, LESSONS 16): the
  ring was never the knee crease — it wraps each leg at the BODY-EXIT
  line: the burial transition rim, QUADRUPLED by the interior knee
  caps (provenance-measured: 13 ring verts pre-A5 -> 51 post, 80% cap
  fans at a joint buried in the belly). Fix: CAPLESS KNEE ENDS —
  buildShellGeometry(prims, knees): thigh loses its b cap, shin its a
  cap (auto-derived, no shader change, less geometry). MEASURED: ring
  16 (floor ~13). Suite: no-cap-verts-beyond-knee assert per kneed
  prim + the validity boundary EXECUTABLE (knee stays inside the body
  every walk frame; measured -0.019/-0.018 worst) + the fold detector
  and generic geometry probes mirror the capless render path. 851
  probes ALL PASS.
- Suite: 727 probes ALL PASS. Sections: 0 imports, 1 creature invariants
  + measured sims (walk, hop w/ deformation, field w/ idle) + carve rules
  (midpoint dent/pierce, SUBMERSION, decal clearance, donors), 2 field
  inspector (operator anchors, measured INFL_CEILING / CARVE_BOUNDS at
  breath peak, ASCII dump on failure).

## Architecture pointers (delta)
- src/feel.js — pure presentation helpers (stridePulse, leanTarget,
  approach, headingDelta, squashEndpoints). main.js consumes; hop.js
  consumes squashEndpoints.
- src/hop.js — the state machine + feet + squash-stretch + jaw-drop.
- src/blink.js — decal-submersion blinking (deterministic, per-actor phase).
- roam.js — createRoam(seed, total, idle); idleSpeedMul exported.
- anim.js — + breathInflate.
- config.js — + HOP_*, IDLE_*, STRIDE_LIFT/LEAN_*/LIFT_SMOOTH,
  SQUASH_AMOUNT/STRETCH_AMOUNT, BLINK_PERIOD/BLINK_TIME,
  MOUTH_OPEN_ANGLE/MOUTH_OPEN_PUSH, MAX_PRIMS 16; BOB_* deleted.
- Resources: fogleman/sdf (harvested); GLSL Noises gist
  (patriciogonzalezvivo) bookmarked for a possible texture pass;
  awesome-threejs list reviewed — otherwise low direct value (React-
  ecosystem heavy).

## Gotchas (project-specific, additions)
- All prior gotchas hold (no GLSL backticks; measured ceilings never
  loosened blind; carve rules; instruments must sample what the GPU
  samples; k/4 is wrong).
- Deformation/animation writes are ABSOLUTE FROM REST every frame — the
  suite asserts bit-exact rest restoration; never accumulate.
- Constant surface offsets compensate with constants (dilate/breath ->
  uInflate-shifted thresholds); measured offsets with measurements
  (decals -> dSkin). Mismatching the natures balloons or blurs.
- The rig's forward axis is LOCAL X (creatures face -X); rotation.order
  YXZ for banking.
- Scripted edits: exact anchors from the CURRENT file; verify the end
  state in-file (a silent no-op shipped a ReferenceError this arc —
  caught by the suite run, per the GI rule).

## Open items
1. **Daniel: browser-verify the knee-seam fix** (the black ring at
   each knee is gone; a thin crease accent at deep bends may remain —
   verdict wanted) + checkpoint.
2. A-TRACK COMPLETE at A5 confirm — the flagged SKILL-HARVEST
   checkpoint (Daniel's timing, no pressure): dev-method session over
   LESSONS.md (13 entries) + this handoff -> the creature-generation
   skill.
3. Next build track: C-track (JSON import/export, seeded creature
   generator, terrarium) or B-track breathers (slice viewer, Pass-5
   morphing) — options round on request.
4. Reference queue: floater (hover mini-pass), propeller flyer
   (continuous-spin anim + hover).
5. Walker stride squash: one-value experiment IF the hop version earns
   it (deferred by design).

