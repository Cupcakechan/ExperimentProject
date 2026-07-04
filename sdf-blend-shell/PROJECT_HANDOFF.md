# PROJECT_HANDOFF — SDF Blend-Shell Experiment

_Last updated: 2026-07-04 (roadmap A-track: A1 hop + A2 breathing/idle + A3.1 feel
CONFIRMED + pushed; A3.2 squash-stretch + bob-suspension fix DELIVERED — awaiting
browser confirmation; next: A4 living face, A5 knees)_

## What this is
The "SDF blend-shell" character technique (capsule/sphere prims whose mesh
vertices snap onto the combined smooth-min SDF in a vertex shader) — **end
goal: a game-creation tool; the harvest into a dev-method SKILL is Daniel's
call on timing** (natural checkpoint flagged: A-track completion). Harvest
sources: this handoff, LESSONS.md (11 entries), REFERENCE_FOGLEMAN.md,
creatures.js authoring rules, the suite's measured tables.

**Stack:** Three.js pinned 0.170.0 (CDN import map, no bundler), VS Code
Live Server, Windows/Node-only. **Repo:**
https://github.com/Cupcakechan/ExperimentProject, subfolder
`sdf-blend-shell\` (git runs from the container root).

## The locked roadmap (Daniel-approved order)
A1 hop ✅ -> A2 breathing ✅ (+ idle rests ✅, an unplanned insert) ->
A3.1 step-bob+lean ✅ -> **A3.2 squash-stretch (DELIVERED, unconfirmed)**
-> A4 LIVING FACE (expressive/animated mouths via setPrimTransform on
carves; blink; + the deferred debts: decal-compensation rework, high-k
mouth fade, fold-detector as a permanent probe) -> A5 two-segment knees
-> C-track: JSON import/export, SEEDED CREATURE GENERATOR (suite-graded),
terrarium; B-track breathers: in-browser slice viewer, Pass-5 morphing.

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
- A3.2 SQUASH-STRETCH + BOB SUSPENSION (**awaiting browser confirm**):
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
- Suite: 614 probes ALL PASS. Sections: 0 imports, 1 creature invariants
  + measured sims (walk, hop w/ deformation, field w/ idle) + carve rules
  (midpoint dent/pierce, SUBMERSION, decal clearance, donors), 2 field
  inspector (operator anchors, measured INFL_CEILING / CARVE_BOUNDS at
  breath peak, ASCII dump on failure).

## Architecture pointers (delta)
- src/feel.js — pure presentation helpers (stridePulse, leanTarget,
  approach, headingDelta, squashEndpoints). main.js consumes; hop.js
  consumes squashEndpoints.
- src/hop.js — the state machine + feet + squash-stretch writes.
- roam.js — createRoam(seed, total, idle); idleSpeedMul exported.
- anim.js — + breathInflate.
- config.js — + HOP_*, IDLE_*, STRIDE_LIFT/LEAN_*/LIFT_SMOOTH,
  SQUASH_AMOUNT/STRETCH_AMOUNT; BOB_* deleted.
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
1. **Daniel: browser-verify A3.2** (hopper squashes/stretches through
   hops; walkers' sway now slow and smooth) + checkpoint.
2. A4 LIVING FACE options round (carries: decal-compensation rework,
   high-k mouth fade, fold-detector suite probe).
3. Walker stride squash: one-value experiment IF the hop version earns
   it (deferred by design).
4. SKILL HARVEST — Daniel's timing; A-track completion (after A5) is the
   flagged natural checkpoint.
