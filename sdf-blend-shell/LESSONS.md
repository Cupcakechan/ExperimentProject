# LESSONS.md — error record (feeds the dev-method)

## 2026-07-03 — backtick inside a GLSL template literal
- What broke / what happened: a backtick in a shader comment terminated the JS
  template literal early; the module failed to parse.
- Root cause: GLSL lives inside JS template literals, so ANY backtick in shader
  code/comments ends the string.
- Verification gap it exposed: none new — the committed module-import suite
  caught it pre-delivery, exactly as designed. `node --check` alone also caught
  it here, but only by luck of where the terminated string landed.
- Plug shipped: comment convention ("no backticks in GLSL literals") noted in
  blendMaterial.js + handoff gotchas; suite remains the guard.
- Route: skill reference candidate (html-game.md — template-literal DSLs).

## 2026-07-03 — .gitignore copied with leading spaces
- What broke / what happened: `package.json` / `package-lock.json` were
  committed despite being listed in .gitignore.
- Root cause: the .gitignore content was presented in an INDENTED chat code
  block; copy-paste carried three leading spaces into every line, and git
  treats leading whitespace as part of the pattern — only the flush-left first
  line (`node_modules/`) matched.
- Verification gap it exposed: no post-setup check that ignored files are
  actually ignored (`git status` review was specified but the indent survived
  it unnoticed).
- Plug shipped: corrected flush-left .gitignore files at both levels +
  `git rm --cached` for the two committed files; lesson: deliver
  copy-paste file content flush-left (or as downloadable files), never
  inside indented list blocks.
- Route: GI candidate (delivery formatting rule).

## 2026-07-03 — legs detached: CapsuleGeometry has no length subdivisions
- What broke / what happened: the critter's legs met the belly with a hard
  boundary — no fillet — while tail/head (joining near end caps) blended fine.
- Root cause: a snapped shell can only express fillets where vertices exist;
  three r170 CapsuleGeometry's cylindrical wall has ZERO interior rings
  (MEASURED empirically against node_modules source), so the belly had no
  vertices to bend toward the legs.
- Verification gap it exposed: no probe tied mesh density to the technique's
  core requirement (fillets need vertices).
- Plug shipped: custom cylinder+hemispheres capsule builder with
  CAPSULE_RINGS_PER_UNIT (config) + suite probe asserting interior belly rings.
- Route: project-only (three-version-specific measured fact; the general rule
  "the artifact wins — measure it" already lives in the skill).

## 2026-07-03 — saved setup snippet kept re-creating a nested git repo
- What broke / what happened: a nested `.git` reappeared inside the project
  subfolder; VS Code showed two repositories, terminal and UI disagreed, and
  two commits landed in the wrong (inner) repo.
- Root cause: delivered instructions bundled a ONE-TIME setup command
  (`git init`) with a REPEATABLE command (`node test_suite.mjs`) in one block;
  Daniel saved the block and re-ran all of it later — as saved snippets get
  re-run.
- Verification gap it exposed: none automatable in-repo; the guard is a
  delivery rule.
- Plug shipped: nested repo confirmed stale (2 duplicate commits) and deleted;
  snippet retired; rule: never ship run-once and run-every-time commands in
  the same block — label lifecycle explicitly.
- Route: GI candidate (delivery formatting rule).

## 2026-07-03 — decals vanished at high blend radius (k=0.6)
- What broke / what happened: Hopper's pupils and Longneck's whole eyes
  disappeared as the uK slider approached 0.6; Critter's eyes survived.
- Root cause: paint decals measured coverage against their ABSOLUTE sphere
  position, but the smin skin INFLATES outward with k (deficit up to k/4)
  wherever prims are within k of each other — the skin ballooned past the
  decals' poke margins. Severity ordered exactly by margin size and local
  prim crowding (the diagnostic fingerprint).
- Verification gap it exposed: no probe covered paint visibility at
  non-default k; all decal math assumed the k=0.25 skin.
- Plug shipped: coverage now subtracts the local inflation (min solid
  distance at the shaded point — free from the existing phase-1 loop), so
  decals ride the skin at any k; suite gained bug-then-fix coverage probes
  at inflation 0.15 (hand-computed).
- Route: project-only mechanics; the general rule (features authored against
  a rest state must track the state that actually varies) is skill-worthy.

## 2026-07-03 — outline painted black domes at every limb root
- What broke / what happened: with the toon outline on, solid black
  dome-shaped blobs appeared at limb roots (legs/tail/ears/neck) plus thin
  black cracks along smooth areas.
- Root cause: the ink material reused the skin's vertex logic wholesale,
  including the buried-geometry TUCK. Tucked ink verts land at
  OUTLINE_WIDTH - TUCK_DEPTH (0.015) ABOVE the skin — flat-black patches
  hovering in front of it, back faces visible. The tuck's reason (coincident
  skin layers z-fight with mismatched colors) does not exist for flat-color
  ink, where coincident layers fight invisibly.
- Verification gap it exposed: reuse of a shader across materials carried a
  mechanism whose purpose was never re-derived for the new target surface.
- Plug shipped (SECOND attempt — the first was wrong): attempt 1 set ink
  uTuck = 0, reasoning about hover height; blobs persisted. TRUE root cause:
  a buried cap FOLDS when projected onto the target surface — part of it
  lands with INVERTED winding, and inverted triangles show back faces (=
  drawn by the BackSide ink) from outside, wherever the patch sits OUTSIDE
  the skin. Correct fix: ink tuck = OUTLINE_WIDTH + TUCK_DEPTH, sinking
  buried ink to -TUCK_DEPTH (inside the creature, occluded). Suite asserts
  the SIGN of the final position, not a chosen magnitude.
- Extra lesson: identical symptoms across two fixes meant the hypothesis,
  not the application, was wrong — revise the mechanism when a fix that
  verifiably shipped changes nothing. Rules: (1) when reusing a shader with
  a different target, re-justify EACH mechanism against the new context;
  (2) for culling-based passes, reason about WINDING under projection, not
  just position.
- Route: skill reference candidate (both rules) + project-only mechanics.

## 2026-07-03 — two gait defects caught by pre-delivery simulation
- What broke / what happened: (1) both diagonal leg groups launched swings
  in the SAME frame (all four feet airborne — gallop glitch, measured max
  concurrent groups = 2); (2) Hopper's horizontal feet crumpled to 0.18x
  rest length when the hip walked over a planted toe.
- Root causes: (1) the "whose turn" gate was a SNAPSHOT taken before the
  foot loop — stale the moment the first foot lifted; shared turn-taking
  state must be claimed AT MUTATION TIME, not read once. (2) a pin axis
  parallel to travel lets the hip overtake the anchor — pinned-length
  systems need a stretch clamp (pin slips along the axis past the band).
- Verification gap it exposed: none — the measure-before-encode pattern
  (established in the field pass) caught both before the browser existed
  as a test. The suite now RUNS the 20s walk per creature every execution.
- Plug shipped: live gate claim + stretch clamp (STRETCH_MIN/MAX); suite
  walk-sim asserts trot invariant, world-fixed planted feet, drift bound,
  clamp band — thresholds MEASURED (drift 0.298, hopper floor 0.55).
- Route: skill reference candidates (stale-snapshot gates; pinned-length
  clamps; simulate stateful systems before shipping).

## 2026-07-03 — the pairwise k/4 inflation bound was the wrong mental model
- What broke / what happened: nothing in the browser — a wrong assumption
  ("smin inflation <= k/4") lived in comments and reasoning since the decal
  bug, and was one keystroke from being encoded as suite ceilings in the
  field-inspector pass.
- Root cause: the k/4 bound is a PAIRWISE fact, but mapSDF folds smin
  SEQUENTIALLY — each fold can deepen the deficit against the already-
  deficited running minimum, so 3+ mutually-close prims exceed it.
  MEASURED: hopper 0.0969 at k=0.25 (k/4 = 0.0625, +55%: body + both feet
  folding under the belly); longneck 0.2969 at k=0.6 (~2x k/4).
- Verification gap it exposed: no instrument measured the FIELD itself —
  every existing guard watched field CONSUMERS (decals, outline, gait).
- Plug shipped: field inspector (suite Section 2) measures per-creature
  inflation on every run; ceilings are MEASURED values + margin, never
  derived bounds; INFO lines re-measure automatically on any field change.
  Retroactive validation: the decal fix subtracts MEASURED local inflation
  rather than an assumed k/4 — which is why it survived this correction
  untouched.
- Route: skill reference candidate (pairwise bounds do not survive
  sequential folds — instrument the invariant, measure, THEN encode).

## 2026-07-03 — carve donor density measured AT the probe floor pre-delivery
- What broke / what happened: nothing shipped — the donor-density probe
  written WITH the negative-prims feature measured exactly 8 host vertices
  inside hopper's mouth bowl, precisely the probe's minimum: the bowl was
  about to ship starved (the detached-legs defect class, sphere edition).
- Root cause: sphere meshes at 24x16 segments have ~0.13 inter-vertex
  spacing against a 0.30-wide bowl; a snapped shell can only line a bowl
  where host vertices exist to snap inward.
- Verification gap it exposed: none — the probe caught it before delivery
  (the gait-sim pattern again: ship the probe WITH the feature it guards).
- Plug shipped: sphere density raised to 32x24 (14 donors measured, floor
  encoded at 11); authoring rule added (carve footprint comfortably wider
  than host inter-vertex spacing; levers named: sphere segments,
  CAPSULE_RINGS_PER_UNIT).
- Route: skill reference candidate (when a feature depends on donor
  geometry, its density probe ships in the same pass — never after).

## 2026-07-03 — carve color bled a dark "shadow" around the mouths
- What broke / what happened: the browser showed a diffuse dark smudge
  around both mouths, several times larger than the slit — worst on Pudge.
- Root cause: colored carves joined the phase-1 WEIGHTED proximity blend,
  and a weighted blend cannot CONTAIN a color, only attenuate it. Hand-
  computed at 0.05 from the mouth: mouth weight 1/(0.05+SOFT)^2 = 237 vs
  host weight 1/(dSkin+SOFT)^2 where dSkin = local inflation — on Pudge
  the 0.04 DILATE weakened the host's contact weight from ~4400 to ~330,
  so the near-black held ~42% of clean skin (the diagnostic fingerprint:
  worst on the inflated creature). The decal system exists because of
  this exact limitation (the pupil-over-sclera gray lesson); the carve
  color re-introduced the class from the other side.
- Verification gap it exposed: no probe bounded a color's spatial REACH —
  coverage probes checked presence, never containment.
- Plug shipped: carve interiors now COMPOSITE like decals (crisp
  smoothstep edge, PAINT_EDGE wide, saturated on the bowl wall which sits
  inside the carve volume); phase 1 is pure solids again. Bug-then-fix
  probes hand-computed: 42% share OLD vs exactly-zero coverage NEW at
  0.05, saturation on-wall, half-edge = 0.5 exactly.
- Route: skill reference candidate — HIGH-CONTRAST ACCENT colors must
  composite with an edge; weighted blends are for kin colors only.

## 2026-07-03 — mouth "run-offs": grazing slit corners smear thresholded coverage
- What broke / what happened: after the composite fix, thin dark tails
  ("run-offs") extended from both mouths' corners.
- Root cause: a straight capsule slit against a curved head is always
  SHALLOWEST at its ends (chord vs arc), and where the surface crosses a
  distance threshold at grazing incidence, the coverage iso-band smears.
  Hopper's slit was worst-in-class: its MIDPOINT sat +0.019 OUTSIDE the
  face (a pure graze). Confirmed by an ANALYTIC footprint probe (bisect
  the exact smooth surface, evaluate coverage there — no mesh involved),
  which reproduced the corner lobes and ruled out mesh interpolation.
- Two candidate fixes MEASURED AND REJECTED before the real one: (1)
  deeper + narrower slit — the smooth-difference rounding FILLED the
  narrow slit, hollowing the middle into two eyespots; (2) tighter carve
  kCap — footprint unchanged (the lobes are geometric, not lip-rounding).
  A third design (mouth color as a paint decal) failed its probe too:
  the decal inflation compensation reads the LOCAL skin lift, and under
  a whole-body dilate (Pudge's 0.04) that lifts EVERYWHERE — the decal
  ballooned into a blob. That compensation halo is now a KNOWN,
  measured issue deferred to the living-face pass (also the reason
  mouth color fades at extreme slider k).
- Plug shipped: geometry chosen by probe sweep — both slits SUBMERGED
  (all endpoints sd < -0.005, now suite-enforced for every capsule
  negative) with short spans to minimize chord-sag; bounds re-measured
  (the old ceilings correctly FAILED on the deeper hopper slit before
  re-encoding — the guard working).
- Route: skill reference candidates — (1) thresholded coverage smears at
  grazing incidence: keep feature geometry transversal to the surface;
  (2) when a fix idea is cheap to simulate, probe it analytically BEFORE
  implementing (three wrong fixes died in the terminal, zero in the
  browser).

## 2026-07-03 — run-offs ROOT CAUSE: ink triangles FOLD at the carve crease
- What broke / what happened: the run-offs SURVIVED the submerged-slit
  geometry fix — new evidence that killed the grazing hypothesis as the
  primary cause (the analytic surface footprint was clean; the render
  was not; the only thing between them is the mesh and the second draw).
- Root cause: the BLACK-DOMES defect class, third appearance. On the
  outline's +0.035 offset surface, a slit pinches closed (and always
  pinches at its tapering ends, at ANY slit geometry) — ink triangles
  projected into a pinching feature FOLD, and folded triangles show back
  faces, which is exactly what the BackSide ink draws. MEASURED with a
  mesh-accurate fold detector: 16 folded ink triangles clustered at
  pudge's mouth on the carved field; 0 on the uncarved field.
- Instrument lessons (the detector itself shipped two bugs before it
  told the truth): (1) it must mirror the FULL vertex pipeline — omitting
  burial+tuck counted the known, handled leg-root folds as signal;
  (2) merged geometry is INDEXED — iterating raw position triplets as
  "triangles" produced ~50% coin-flip noise. An instrument must sample
  what the GPU samples: indexed triangles, interpolated fragments. An
  analytic probe of the ideal surface can pass while the render fails.
- Plug shipped: the INK IGNORES CARVES — in the outline material's
  uniforms only, negatives are surface-less (uPaint=1, uNeg=0: absent
  from union, subtraction, and burial), so no crease exists to fold
  into; folds impossible by construction (detector: 16 -> 0). The skin
  keeps its carves. Suite asserts both sides per creature. Cosmetic
  trade accepted: no ink crease line at mouths (they are dark inside).
- Route: skill reference candidates — (1) the black-domes rule
  generalizes: EVERY new concave feature re-triggers the winding audit
  for culling-based passes, and "exclude the feature from the fragile
  pass" beats "tune the feature until the pass survives"; (2) build
  instruments that sample what the GPU samples before trusting a clean
  analytic result.

## 2026-07-03 — carve edge blurred ONLY on the dilated creature
- What broke / what happened: after the ink fix, pudge's mouth edge was
  soft while hopper's was crisp — Daniel's report "hopper is perfect"
  was the diagnostic gift: exactly ONE field difference exists between
  those mouths (pudge's inflate 0.04).
- Root cause: carve color coverage thresholded RAW distance-to-carve,
  but the DILATED skin crosses the raw carve boundary at a grazing angle
  (the rim rounds outward by the dilate) — the 0.02 fringe smeared wide.
  Two co-dilated surfaces cross at the raw pair's dihedral.
- Plug shipped: the coverage threshold shifts by the CONSTANT dilate
  (smoothstep(uInflate, uInflate + edge, d)) — pudge crisp, hopper
  unchanged (inflate 0 degrades to the old formula, suite-anchored).
  The earlier-measured trap avoided: compensating with MEASURED local
  inflation balloons near joins; constant offsets compensate with
  constants. Bonus: a future animated inflate (breathing) reads the
  same uniform, so the mouth stays compensated for free.
- Route: skill reference candidate — every threshold taken against raw
  geometry must shift with AUTHORED surface offsets; match the
  compensation's nature to the offset's nature (constant <-> constant,
  measured <-> measured).
