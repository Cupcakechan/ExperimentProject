# PROJECT_HANDOFF — SDF Blend-Shell Experiment

_Last updated: 2026-07-07 (HARVEST COMPLETE. The creature-forge content
skill — SKILL.md + reference/ of 11 modules byte-pinned at HEAD ad6ed1d —
is delivered, and Daniel's dev-method session has integrated the process
additions (LESSONS 17/18/20 routed there; 19 lives in creature-forge).
Suite: 1149 probes ALL PASS at HEAD. Next is the RESEARCH-BUILD track —
see "Next steps," which also carries ONE standing instruction about
LESSONS.md.)_

## What this is — and the PURPOSE (clarified 2026-07-07)
The "SDF blend-shell" character technique: capsule/sphere prims whose
mesh vertices snap onto the combined smooth-min SDF in a vertex shader,
toon-shaded, outlined by a screen-space depth-ink pass, animated by
data. **Daniel's stated end goal: a set of SKILLS that let a future
Claude build good-looking game creatures fast — "design a flying
creature" should resolve in minutes because this project already
measured what works. The first skill now EXISTS: creature-forge
(delivered 2026-07-07); this repo remains the laboratory, and each
research build feeds a recipe back into it.** The suite is what makes
the knowledge trustworthy (every claim traces to a probe).

**Stack:** Three.js pinned 0.170.0 (CDN import map pinning BOTH `three`
and `three/addons/` to 0.170.0 — addons in use:
BufferGeometryUtils.mergeGeometries in buildShell, OrbitControls in
main; extend the map deliberately and keep the two pins on the SAME
version), no bundler, VS Code Live Server, Windows/Node-only (no
Python). **Repo:** https://github.com/Cupcakechan/ExperimentProject,
subfolder `sdf-blend-shell/`. Container clones read-only for Claude;
**Daniel pushes, Claude pulls** — the standing gate every round:
`git fetch` + `reset --hard origin/main`, byte-diff any delivered files
vs HEAD (normalize CRLF via `tr -d '\r'`; trailing-newline diffs are
noise), `node test_suite.mjs`, and treat the PROBE COUNT as the
certification number. Deliveries are FULL files staged in
`/mnt/user-data/outputs/`. Method: Daniel's General Instructions
(userPreferences) + the dev-method skill; options round -> Daniel picks
-> one tested pass per commit; feel reports get mechanism + ONE lever.

## Current state — all tracks COMPLETE
- **R-track** (rendering): R0 stale-cache diagnosis; R1 screen-space
  depth-ink (MSAA target + depth texture, replaces the inverted hull);
  R1.1 second-difference detector (kills grazing false cuts); R2 cubic
  C2 smin (union only; inflation ~2/3 of quadratic); R3 mouths off the
  field (paint decals — ZERO negatives in the cast, the k-validity
  swallowing class CLOSED); R-SIMPLIFY (hull material, its probes, and
  the fold detector retired; skin machinery kept — its z-fight subject
  predates the hull). Limb-read feel pass: two-tier ink,
  INK_INTERIOR 0.45 fades interior contours, silhouettes full.
- **C-track** (tooling): C1 JSON import/export — `validate.js` is the
  authoring rules as ONE pure executable function (import gate + suite
  parity + generator grader are the same module); envelope round trip
  preserves unmanaged fields. C2 seeded generator — archetype TABLE,
  measured boundaries as CONSTRUCTION rules, deterministic retry
  stream. C3 terrarium — polar noise terrain EXACTLY flat inside
  WORLD_FLAT_RADIUS 4.2 (> roam hard clamp 4; the locomotion plane is
  law), banded vertex colors, instanced rocks/grass, populate button,
  ACTOR_CAP 24.
- **Reference queue**: hover locomotion (+ Bloop the floater), spin
  anim mode with authored pivot (+ Whirr the propeller flyer). Anim
  generalized to an ENTRIES ARRAY (single object = array-of-one);
  tendril sway = two-segment amplitude-delta BEND (flex on pure data —
  joint divergence < half the thinner radius, an elbow never a tear).
- **Generator fidelity**: mouths proportional to host MINUS peak dilate
  (displayed-read rule) and placed below the eyes; slug + six-legger
  MOUTHLESS (cast parity, Daniel's call); knee fidelity — cast-range
  bends 0.055-0.075, Z-fold splay, deeper hip insets. 8 archetypes,
  120-seed sweep 100% valid, ~1.05 attempts avg.
- **World content**: footprint trails (`trails.js` — instanced ground
  decals fading BY COLOR into GROUND_COLOR, per-pixel soft blob stamp
  via pure-math DataTexture, depthWrite OFF so the ink pass is blind by
  construction; stamped from REAL footfalls / hop landings / slug drag;
  hover creatures stamp nothing); pine prop (hand-merged two-tone
  conifer, instanced) with terrain-AWARE mid-slope scatter
  (band 0.1-0.45, pairwise spacing 2.2, scale 1.6-2.4 — sized for the
  ring-distance read).
- **HARVEST (2026-07-07)**: creature-forge content skill delivered —
  SKILL.md (architecture, authoring rules, measured-boundaries table,
  artifact taxonomy, feel levers, locomotion vocabulary, 8 archetype
  recipes) + `reference/` carrying validate / generate / creatures /
  blendMaterial / inkPass / anim / gait / hop / world / trails /
  config, all byte-verified at ad6ed1d. Process-additions note
  (LESSONS 17/18/20) integrated into dev-method by Daniel's dev-method
  session. When a future pass changes one of the 11 carried modules,
  FLAG the skill refresh — each research build feeds a recipe back.
- **Cast (8, in registry order = actor index order — APPEND ONLY, seeds
  and phases key off index):** Critter, Hopper, Longneck, Pudge,
  Shelby (id 'snail'), Skitter, Bloop (id 'floater'), Whirr (id
  'flyer').

## Architecture map (one line each)
- `src/main.js` — scene, spawnActor (the single door: cast + imports +
  generated), locomotion branch (hover > hop > gait), trails hooks.
- `src/config.js` — every tunable, commented with its why. SOURCE OF
  TRUTH for constants; read it rather than trusting this doc's memory.
- `src/anim.js` — entries-array anim: wave | spin, pivot ?? prim.a,
  absolute-from-rest (pause-safe by law).
- `src/gait.js` (feet/knees; `feet` exposed), `src/hop.js` (state
  machine; `current()` exposed), `src/blink.js`, `src/roam.js`,
  `src/feel.js`.
- `src/render/buildShell.js` (donor meshes, capless knees),
  `blendMaterial.js` (the heart: snap vertex shader + toon frag; carve
  vocabulary live), `inkPass.js` (screen-space depth ink, two-tier),
  `world.js` (terrain + props; `terrainHeight`/`propPlacements` pure),
  `trails.js` (footprints; `trailMode`/`fadeColor`/`makeBlobAlpha`
  pure).
- `src/data/creatures.js` (the cast + authoring rules comments),
  `validate.js` (THE RULES, executable; exports sdPrim),
  `creatureIO.js` (envelope round trip), `generate.js` (archetype
  table; exports mulberry32).
- `src/ui/controls.js` — slider + I/O row (export/import/seed/
  generate/populate).
- `test_suite.mjs` — 1149 probes; sections: registry -> per-creature ->
  sims -> hover/spin/sway -> trails -> C1/C2/world -> ink.
- Docs: this file, `LESSONS.md` (20 entries), `RESEARCH_TECHNIQUE.md`
  (SS1-9; SS8 = adopted/banked external finds, SS9 = the three.js repo
  triage with the repeatable blobless-clone access method).

## The measured boundaries (the skill-critical digest)
Executable form: `validate.js`. Proof: the suite. Highlights —
- Decal band: every paint endpoint at -r < sd(host) < 0.
- Ball-eye dilate boundary: peak (inflate + breath amp) <= eyeball r/3,
  else author FLAT sclera+pupil decals (Pudge's rule; the generator
  CHOOSES by it).
- Knee contract: thigh.b === shin.a exactly; rest pole >= 0.02 off the
  hip-foot line; reach < KNEE_STRAIGHT_FRAC - 0.015; knee INSIDE some
  other solid by >= 0.01 at rest (capless validity).
- Breath peak < thinnest solid r (ballooning boundary).
- Mouths: paint capsule slits, r = host.r x 0.17-0.26 MINUS peak dilate
  (floor 0.1 x host.r), strictly below the eyes. k-validity is CLOSED —
  decals ride the inflated skin at any k.
- INFL ceilings: MEASURED per creature + 0.02 margin (suite table).
- The displayed-read rule and cast-parity principle: LESSONS 19 + the
  generator-fidelity passes (the cast is the reference).

## Next steps (in order — this is the plan of record)
0. **STANDING INSTRUCTION (Daniel, 2026-07-07): the NEXT LESSONS.md
   update must BEGIN with a harvest marker** — a top-of-file note
   stating that every entry dated <= 2026-07-07 (all 20) has been
   included downstream: process lessons (17, 18, 20) into dev-method,
   content lessons (including 19, the displayed-read rule) into
   creature-forge. Fold it into the next natural LESSONS.md edit; do
   NOT run a dedicated pass for it.
1. **CONTACT-SHADOW** (opened 2026-07-07 with an options round:
   analytic blob decals in the trails idiom vs one shared depth-RT
   pass vs a per-actor RT port of the SS9 mechanism — recommendation
   on record: blobs; the banked RT mechanism in RESEARCH SS9 stays
   available if the browser disagrees). The grounding read the unlit
   creatures lack; fits the flat stage exactly. One pass once picked.
2. **EXPORT-BAKE track** second — multi-pass; the bridge to "creatures
   leave the tool" (GLTF/OBJ/STL/USDZ exporters verified present).
   Honest complexity recorded: the suite's CPU vertex-pipeline mirror
   makes baking snapped SHELL geometry cheap, but donor shells
   overlap (poor asset topology) and eyes/mouths are painted
   PER-PIXEL in the fragment shader (decals need their own answer:
   flattened decal geometry, dense vertex colors, or a texture bake).
   **Strongly coupled to un-banking R4 Surface Nets** — meshing the
   field directly yields the clean watertight mesh export wants. Open
   the track with an options round: R4-first vs bake-first.
3. Banked beyond that: PICKING (ID-texture GPU picking — the only
   selection that works for shader-moved vertices), GPGPU flocking,
   contact ambience — RESEARCH SS9 Tiers B/C.

## Gotchas (live)
- No backticks inside GLSL template literals — and edit-script
  replacement text has the SAME rule (LESSON 18).
- The import map pins `three` AND `three/addons/` to 0.170.0 (addons
  in use: BufferGeometryUtils, OrbitControls). Extend it deliberately
  and keep both pins on the SAME version; world.js hand-builds its
  geometry by choice, not necessity.
- Modules must import headless (the suite imports everything under a
  DOM stub): no canvas/DOM at module top level — trails.js uses a
  pure-math DataTexture for exactly this reason.
- Prop placement determinism: pines draw AFTER rocks/grass in the seed
  stream — new prop classes must APPEND or earlier placements reshuffle.
- three.js examples on master target r18x and are drifting to
  WebGPU/TSL (219 of 594) — pattern reference only; verify any API
  against r170.
- Reddit is unreachable from Claude's tools (blocked + often
  unindexed); Daniel pastes content when it matters.
