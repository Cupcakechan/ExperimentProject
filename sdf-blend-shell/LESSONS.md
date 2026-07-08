# LESSONS.md — error record (feeds the dev-method)

> **HARVESTED — 2026-07-07.** Every entry below through
> "2026-07-07 — probes encode assumptions; refine the invariant, don't
> delete the probe" (the original 20) has been included downstream:
> process lessons (17 certified provenance, 18 edit-script discipline,
> 20 probe-invariant refinement) into the dev-method skill; content
> lessons (including 19, the displayed-read rule) into the
> creature-forge skill. Entries AFTER that one are NEW since the
> harvest — the unharvested queue starts there.

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

## 2026-07-04 — A4 Stage 1: two debts resolved by measurement, not surgery
- The plan was a shader rework (capped-measured carve compensation).
  THREE probe measurements killed or reframed it before any browser run:
  1. clamp(dSkin, inflate, inflate + 0.08) FLOODS pudge's lower face at
     k=0.6 — threshold 0.12 against a 0.26 head; a distance-threshold
     color model conflates "along the surface" with "off the surface",
     and no scalar cap fixes that on small heads.
  2. Even the SHIPPED constant compensation smears at k=0.6 — because
     the union's inflation deficit at the mouth site (~0.15+) EXCEEDS
     the carve's radius (0.068): the carve GEOMETRY is swallowed under
     the fattened skin. No color model — constant, measured, or capped —
     can paint a feature whose geometry has dissolved. High-k mouth
     fade closes as a MEASURED DESIGN BOUNDARY: a mouth reads correctly
     while union inflation at its site stays under the carve's radius;
     beyond that is melt territory, which is what the slider's extreme
     demonstrates anyway.
  3. The "decal-compensation rework" debt DISSOLVED on inspection: the
     balloon was measured on the never-shipped decal-mouth design; the
     shipped decal system (eyes, tips) has no defect. Its constraint —
     decals belong on low-inflation sites — became an authoring rule.
- The fold detector, generalized into a PERMANENT suite probe,
  discovered 7 pre-existing folds at hopper's body-foot junction — a
  TRUE-BUT-BENIGN class (the offset surface pinches at ANY concave
  junction; the slivers nest invisibly in the join's own dark crevice).
  The probe now classifies: OPEN-SKIN folds (the run-off defect class,
  asserted ZERO) vs junction-crease folds (measured, reported as INFO).
- Route: skill reference candidates — (1) measure a feature's GEOMETRY
  validity range, not just its color model; (2) an instrument
  generalized beyond its original scan region will find true-but-benign
  signal: define the defect class precisely and CLASSIFY before
  asserting zero; (3) three more fixes died in the terminal, zero in
  the browser.

## 2026-07-04 — pudge's scary goggles: the ball-eye dilate boundary
- What broke: the cast ball-eye conversion made pudge's eyes read as
  huge, dark, merged goggles (browser-caught — "very scary"); Skitter,
  identical construction, read great. The one field difference again:
  pudge's dilate (inflate 0.04, breath peak 0.06).
- Mechanism, three layers deep: (1) a decal iris's painted footprint
  grows by ~the dilate (coverage compensates measured inflation, so its
  floor IS the dilate — no decal size can author dark smaller than it);
  (2) the dilated eyeballs merged across the bridge at breath peak;
  (3) the first fix (SOLID iris) was PROBE-KILLED in the terminal: at
  r 0.04 it became the thinnest solid and pudge's 0.06 peak violates
  the A2 ballooning rule — and the ratio arithmetic closes every door:
  a constant dilate compresses ALL small-feature contrast toward 1
  (dark/white = (iris+d)/(ball+d) = 0.77 even solid; an authored 0.5
  needs a sub-visible r 0.005).
- Resolution: the BALL-EYE DILATE BOUNDARY — ball eyes are valid only
  where peak dilate <= ~r/3 (suite-enforced across the cast); beyond
  it, FLAT sclera+pupil decals are the correct vocabulary (both layers
  balloon together, keeping the painted-cute read). Pudge's original
  eyes — which survived weeks of browsing unflagged — were correct
  authoring all along; restored verbatim, fold scan byte-identical to
  pre-conversion (467/0/0).
- Verification gap: no probe models VISUAL proportion on dilated skin;
  the browser caught what the suite could not see. The boundary probe
  is the narrow guard.
- Also this pass: an over-broad script slice (assumed-adjacent
  endpoints) deleted the decal-coverage block — smoothstep, coverage,
  the historical bug-then-fix anchors — crashing the suite; caught by
  the immediate run. Third scripted-edit strike this project: slice
  endpoints must be VERIFIED adjacent, never assumed.
- Route: skill reference candidates — (1) constant surface offsets
  compress small-feature contrast (an authoring boundary, not a bug);
  (2) design vocabularies carry VALIDITY RANGES (ball eyes: dilate;
  mouths: k; decals: inflation sites) — encode the range, don't force
  uniformity; (3) verify slice-edit endpoints.

## 2026-07-04 — the knee seam: same-limb burial was foreign-body treatment
- What broke: A5 knees browser-confirmed working, but each knee wore a
  black seam ring on the ink.
- Measured (before hypothesizing): per knee region — 841 fully-tucked
  verts + 600+ in the burial transition band (the ring), 152
  crease-class folded ink triangles, and the concave crease radius
  0.0399 vs OUTLINE_WIDTH 0.035 (near-pinch). The dominant component:
  the thigh and shin bury each other's overlapping ends, and the
  tuck's transition rim wraps the joint at eye level.
- Root cause: the burial machinery treats EVERY other-prim overlap as a
  foreign-body junction — but thigh+shin are ONE continuous limb whose
  coincident fragments shade identically from identical positions (the
  code's own documented reasoning for why the skin's folds are
  invisible). Mutual burial inside a limb is pure harm.
- Fix: LIMB GROUPS — uLimb[MAX_PRIMS], derived automatically from
  step.knees (never authored twice); same-limb prims skip each other in
  the burial loop. Body-limb roots keep the proven treatment.
  Mirror-measured first: transition band halved, freed verts +450,
  0 open-skin folds with the exemption on.
- Extra finding: the fold detector's "benign — nests in the join's dark
  crevice" class was a LOCATION assumption (true at body roots, false
  at an eye-level knee). The detector now scans knee regions
  permanently; residual thin crease-accent ink at deep bends is
  possible (pinch margin 14%) — levers if it bothers: OUTLINE_WIDTH
  down, or shallower authored bend.
- Route: skill reference candidates — (1) machinery that keys on
  "other prim" needs a SAME-BODY-PART concept the moment multi-prim
  limbs exist; (2) "benign" classifications carry location assumptions:
  re-verify them when the geometry class that produced them grows.

## 2026-07-04 — the knee seam, act two: the compressor was the step lift
- What broke: the limb-group fix shipped and the seams got MORE visible.
  The hypothesis was wrong — posed measurement (which the rest-only fold
  detector could never see) showed visible-zone folds IDENTICAL with the
  exemption on or off: the slash was never the tuck ring.
- Measured chain: (1) the suite's own articulation range said knees fold
  to 84 deg interior mid-swing; (2) the swing compresses hip-foot
  distance to 0.259 = 69% of rest — and NO two-bone split that reaches
  the rest foot avoids sub-90 folds at that compression (symmetric is
  the optimum; a 'visible knee' asymmetric candidate measured WORSE,
  71 deg); (3) the compressor is STEP_LIFT 0.09 — a high-step prance on
  0.37 legs; (4) the ink cusps at deep folds (crease radius under
  OUTLINE_WIDTH) — THAT is the slash.
- Fix (Option 1, Daniel's pick): per-creature step.lift (0.05 for the
  kneed walkers; data override, one gait line) + reference-look levers
  for free: deeper authored bend (0.07/0.06 — knee reads in silhouette,
  stronger pole, reach 0.92-0.95) and HOOF-DARK shins (the reference's
  'feet' at zero prim cost — capacity forbids foot prims at 16/16).
  Measured after: deepest fold 96/100 deg, ZERO frames under 90 (was
  43). Suite guard: max knee cos < 0 every walk.
- Verification gap named: the fold detector scans the REST pose only;
  this defect existed only posed. Posed-pipeline scans are the eventual
  upgrade (route: instrument at the pose where the defect lives).
- Route: skill candidates — (1) when a fix ships and the symptom
  worsens, the hypothesis (not the application) is wrong: measure at
  the state where the defect APPEARS; (2) two-bone folding depth is set
  by swing compression, not segment split — tune the compressor;
  (3) reference looks often decompose into free levers (color, authored
  bend) before they cost prims.

## 2026-07-04 — the knee seam, act three: the ring was interior cap geometry
- The actual issue (after two mechanism-adjacent fixes): the black rings
  wrap each leg AT THE BODY-EXIT LINE — the burial transition rim,
  QUADRUPLED by A5. Provenance measurement per leg: pre-A5 single
  capsule = 13 ring verts (the thin rim never noticed); post-A5 = 51,
  of which 41 (80%) were the INTERIOR KNEE CAPS — two hemisphere fans
  per leg at a joint that lives inside the belly, serving no rendering
  purpose, parked exactly in the partial-tuck band.
- It explained every browser report the knee-crease theory could not:
  A5 made the ring appear (13->51); the limb exemption SHALLOWED the
  shin cap's burial (its dOther lost the thigh) pushing more cap verts
  into the visible band ("more visible"); lift/bends never touched the
  band ("still the same").
- Fix: CAPLESS KNEE ENDS — buildShellGeometry(prims, knees) skips the
  thigh's b cap and the shin's a cap (same auto-derived map as limb
  groups; no shader change; less geometry). MEASURED after: 16 ring
  verts (floor ~13). The validity boundary is EXECUTABLE: a suite walk
  guard asserts the knee stays inside the body every frame (measured
  -0.019/-0.018 at worst) — a future exposed-knee creature fails it and
  is told to restore caps.
- Route: skill reference candidates — (1) when several fixes each help
  a mechanism but the symptom persists, measure the artifact's
  POPULATION BY PROVENANCE (which geometry, from which source, sits in
  the offending state) before the next hypothesis; (2) builders that
  always generate closed geometry create pure-interior surfaces at
  multi-prim joints — interior geometry is not neutral, it parks in
  transition bands; (3) turn authoring boundaries into executable
  probes at the moment they're discovered.

## 2026-07-07 — stale state wore three disguises in one session (certify before judging)
- What broke / what happened: a morning "regression" (knee seams back +
  Longneck's eyes missing) was a stale browser cache; an R1.1 "strokes
  still visible" verdict was judged against a stale shader (suite count
  867 vs 872 exposed it); and one delivered suite file was silently
  dropped during a re-file.
- Root cause: verdicts were formed on renders whose PROVENANCE was
  unproven — nothing bound "what I'm looking at" to "what was delivered."
- Verification gap it exposed: no ritual connected the serving folder,
  the repo HEAD, and the delivered bytes.
- Plug shipped: THE STANDING GATE, every round — `git fetch` +
  `reset --hard origin/main`; byte-diff delivered files vs HEAD with
  line endings normalized (`tr -d '\r'` — one push differed only by a
  dropped trailing newline, harmless, and the gate proved it); run
  `node test_suite.mjs` and treat the PROBE COUNT as the certification
  number. No browser verdict counts without the count + Ctrl+F5 first.
- Route: dev-method (process) — "no verdict without certified provenance."

## 2026-07-07 — the GLSL-backtick lesson repeated in tooling (edit scripts are code too)
- What broke / what happened: a Node heredoc edit script died at PARSE
  time — replacement text contained a template literal whose backticks
  terminated the outer literal; separately, a refined probe shipped with
  a wrong variable name (longLen vs longestLen) and crashed the suite.
- Root cause: generated edit scripts are programs with the same failure
  modes as shipped code, written with less care.
- Verification gap it exposed: a parse-dead script applies ZERO edits,
  yet independently chained commands after it still run — "style
  appended" printed while the main edits never happened.
- Plug shipped: escape inner backticks in all replacement text;
  unique-anchor replacements that THROW on 0 or 2+ matches; after any
  script, verify the END STATE in the file (grep + node --check + the
  suite), never the script's exit code alone.
- Route: dev-method (process) — folds into "scripted edits must verify
  their landing zone."

## 2026-07-07 — author the DISPLAYED read, not the authored value
- What broke / what happened, three ways: generated mouths authored at
  cast proportions displayed as eye-swallowing blobs on the inflate
  archetype (decal footprints balloon with peak dilate); ring pines at
  "creature scale" read as shrubs (a foreground creature out-subtends a
  distant prop); footprint quads authored as "small dark marks" read as
  torn paper (a hard-edged rectangle has no imprint read at ANY size).
- Root cause: values were authored in registry units but judged after
  TRANSFORMS — inflation compensation, perspective, edge rendering. The
  transform gap is the bug.
- Plug shipped: the constructors encode the transform — mouth r =
  host-proportional MINUS peak dilate (floored at 10%); pines scaled for
  the ring-distance read (2.1-4.1 world, ~1.7x the tallest creature
  after the perspective penalty); prints stamped through a per-pixel
  soft-alpha blob (makeBlobAlpha, suite-anchored). Each value carries
  its reasoning in a comment.
- Route: creature-forge (content skill) — the displayed-read authoring
  rule plus these three worked examples.

## 2026-07-07 — probes encode assumptions; refine the invariant, don't delete the probe
- What broke / what happened: three good probes failed as capabilities
  grew — the anim pivot invariant ("'a' never moves") broke when pivots
  became authorable (a propeller's hub is its blade midpoint); the
  interior-rings count (">= 3") broke when tendril segments halved (the
  builder keeps ring SPACING constant, not count); the terrain flatness
  probe ("exactly 0 at the rim") broke on hypot rounding (a rim point
  measures FLAT + 1e-16).
- Root cause: each probe asserted a PROXY that coincided with the real
  invariant only under old assumptions.
- Plug shipped: each re-expressed at the invariant's real meaning — the
  FIXED POINT (pivot ?? a) never moves; donor-ring SPACING <= 0.1; flat
  through the rim with a measured 1e-9 slack hardened IN THE CODE (the
  contract lives where the contract is, never a softened probe).
- Route: dev-method (process) — when a new feature breaks an old probe,
  find what the probe MEANT before touching it.

## 2026-07-07 — depth ink dies at ground contact (exposed by the pastel re-key)
- What broke / what happened: browser-caught (Daniel: "the feet are
  blending into the ground") — planted feet dissolved into the pale
  floor, with bright/glossy un-contained rims at the contact.
- Root cause: GEOMETRIC, not a tuning miss — the ink's relative depth
  step (foot front vs the ground it occludes) converges to 0 at the
  contact, so a band under ANY threshold always exists (measured ~the
  last 0.04-0.05 world units at the default camera). Pre-existing since
  R1; the dark stage hid it (dark rim on dark ground), and pass A's
  pastel key + pass B's bright glossy rims exposed it.
- Verification gap it exposed: none automatable pre-browser — this is a
  visual-contrast read (the suite cannot see "blends into"); the fix
  ships with source-contract probes instead.
- Plug shipped: CONTACT OCCLUSION in the creature fragment (uContactAO /
  uContactAOH, live uniforms): color AND gloss darken toward y = 0 —
  the reference's own dark-feet read; hop tucks and hover heights fade
  it out for free. Threshold NOT touched (lower thresholds re-admit the
  R1.1 grazing-noise class).
- Route: creature-forge (artifact-taxonomy row: contact reads — the
  depth-ink family's known blind spot and its fix class) + project fix.

## 2026-07-07 — ghost legs: floor decals painted OVER the creatures (act two of the contact read)
- What broke / what happened: the contact-AO fix shipped and verified —
  and the feet still read see-through, now with prints VISIBLE "through"
  the legs (Daniel's report + screenshot). Fix-shipped-symptom-persists:
  the hypothesis, not the application, was wrong (the project's second
  instance of the black-domes rule). The prints were not behind the
  legs — they were drawn ON TOP of them.
- Root cause: every floor decal (shadow blob, prints, dots) was a
  TRANSPARENT-pass quad with a depth test — the transparent pass renders
  AFTER the opaque creatures, so a decal point IN FRONT of a foot
  legitimately passes and blends over the creature's lower pixels. The
  shadow's front lobe reaches past the feet BY CONSTRUCTION, so at low
  camera pitch it tinted the whole lower leg (band = front reach x
  tan(pitch), ~0.3-0.5 at the report's angle). Present since the shadow
  pass; the dark stage hid the tint, the pastel key exposed it. The
  B.1 ink-death mechanism was real but the MINOR term.
- Verification gap it exposed: no probe expressed the LAYER CONTRACT
  ("floor paint never covers a body") — the y-offset probes checked
  stacking WITHIN the floor family, never floor-vs-creature.
- Plug shipped: the FLOOR-PAINT contract — all three decal layers leave
  the transparent pass (transparent: false + CustomBlending with the
  normal alpha equation, honored on opaque-pass materials: r170
  WebGLState.setMaterial only disables blending for NormalBlending +
  transparent:false, source-verified) and render on a ladder between
  the terrain (renderOrder -10) and everything at 0 (dots -3, shadows
  -2, prints -1): creatures drawn later OVERWRITE floor paint wherever
  nearer. Suite: behavior probes on the constructed meshes + the LIVE
  renderOrder ladder. The contact AO stays — independently correct
  (the dead-ink band is real; the reference's feet ARE dark).
- Route: creature-forge (the contact-read taxonomy row gains act two:
  decal passes vs bodies — floor paint belongs in the opaque pass) +
  dev-method candidate (when a VERIFIED fix does not move the symptom,
  re-derive the mechanism from the NEWEST clue, not the old model).

## 2026-07-07 — the sky covered the world (act three; a fix must not depend on a twice-wrong model)
- What broke / what happened: with the floor-paint ladder live, EVERY
  negative-renderOrder object (terrain, dots, shadows, prints) vanished
  — the "floor" was the sky dome's lower hemisphere (floating props
  were the tell). Bisection instrument, one keypress: sky OFF -> ground
  returns. The sky (renderOrder 0, interior wall 30-50 from camera) won
  ground pixels against terrain depth 8-18.
- Root cause, honestly: UNEXPLAINED at the mechanism level. Every
  source-level read of the pinned r170 (list split, renderOrder-first
  sort, setMaterial/setBlending, the OPAQUE define, background clear,
  render flow) says the dome must LOSE that depth test — and a bare-
  scene pixel test (diagnostic 1) confirmed negatives + the blend
  config render correctly outside the real stage. The failure needed
  the real stage (suspect space: the MSAA + depth-texture target and
  driver-level early-z, unproven). Two fixes in this saga were built on
  a source-verified model the GPU then contradicted.
- Verification gap it exposed: the sky mesh was the ONLY unprobed actor
  (pass A probed skyColor and the dots, never the dome's material
  contract); and no probe could have seen this class anyway — it lives
  in the driver, below everything the suite samples.
- Plug shipped: the sky is now depth-INERT BY CONSTRUCTION — draws
  FIRST (renderOrder -100), depthWrite:false, depthTest:false: a pure
  painted backdrop that everything after paints over. Correctness now
  rests on painter's order alone, with no depth contest to win or lose.
  Suite: the dome's contract + the ladder extended to its true floor.
  Bonus: the depth texture at sky pixels stays at the cleared far
  plane, so the rim's ink silhouette is EXACTLY the pre-dome class.
- Instrument notes (paid for tonight): (1) a readback can lie while the
  frame tells the truth — diagnostic 1's readPixels returned all-black
  for a frame that VISIBLY matched prediction; the visible render
  outranks a broken probe. (2) A live-toggle bisection of the REAL
  stage named the killer in one keypress after hours of source reading.
- Route: dev-method candidate (when the source-verified model and the
  GPU disagree TWICE, stop explaining and REBUILD the feature so
  correctness does not depend on the model — by-construction beats
  by-analysis) + creature-forge (skydome recipe: background domes are
  depth-inert, first + no write + no test, never depth contenders).

## 2026-07-08 — the floor-paint contract regressed the terrain to invisible (revert)
- What broke / what happened: the ground read white for MANY rounds; the
  decals (shadows/prints/dots) took every pigment change but the FLOOR
  never did. A solo-terrain instrument settled it: the terrain mesh —
  FOUND, visible, 8448 tris, good bounds, FrontSide, vertex-colored —
  rendered NOTHING.
- Root cause: the floor-paint contract put the terrain at renderOrder -10
  so the decals could ladder beneath it. But an OPAQUE, depth-WRITING
  object at a NEGATIVE renderOrder does not render through the ink pass's
  MSAA + depth-texture target on the target GPU. Cross-check that named it:
  the sky (-100) and the depthWrite:false decals (-3/-2/-1) render fine at
  negative orders; the terrain, the lone opaque depth-writer below zero,
  did not. The trigger is the COMBINATION (opaque + depthWrite + negative
  renderOrder) — a fourth model-vs-GPU disagreement this stretch, left
  unexplained at the GL level.
- Why it hid so long: the missing terrain looks like a pale floor because
  the depth-inert sky's near-white horizon shows through where the ground
  should be. Two "ground too white" pigment passes were spent tuning a
  floor that was not there.
- Verification gap it exposed: no probe asserted the terrain RENDERS —
  only its scene-graph properties (all of which were correct). The suite
  cannot see a driver-level non-render; the instrument had to. A probe
  that checks scene-graph state is NOT a probe that the thing renders.
- Plug shipped: the floor-paint contract is REVERTED. Decals return to the
  transparent pass (transparent + depthWrite:false, depth-tested, drawn
  after opaque); the terrain returns to renderOrder 0 (renders like the
  props, paints over the depth-inert sky). The contact-AO stays. A
  REGRESSION GUARD probe now fails if the terrain is ever put back below
  zero.
- Cost re-opened: the ghost-legs artifact the contract was meant to fix (a
  thin decal band at the foot-ground contact) may return; the contact-AO
  masks the foot bottom. Re-queued as its OWN item, to be solved WITHOUT
  touching the terrain's render path (polygonOffset or a decal-Y nudge,
  not a renderOrder ladder).
- Route: dev-method (negative renderOrder is safe ONLY for
  non-depth-writing objects through a depth-texture post-process; and a
  scene-graph probe is not a render probe) + creature-forge (floor-decal
  recipe: transparent pass, never an opaque negative-renderOrder ladder).
