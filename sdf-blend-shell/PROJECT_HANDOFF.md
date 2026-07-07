# PROJECT_HANDOFF — SDF Blend-Shell Experiment

_Last updated: 2026-07-07 (SESSION CLOSE. Everything below is confirmed
in-browser AND pushed. Suite: 1149 probes ALL PASS at HEAD. The build
queue is EMPTY — next is the HARVEST SESSION, then the research builds;
see "Next steps," which is the section this document exists for.)_

## What this is — and the PURPOSE (clarified 2026-07-07)
The "SDF blend-shell" character technique: capsule/sphere prims whose
mesh vertices snap onto the combined smooth-min SDF in a vertex shader,
toon-shaded, outlined by a screen-space depth-ink pass, animated by
data. **Daniel's stated end goal: a set of SKILLS that let a future
Claude build good-looking game creatures fast — "design a flying
creature" should resolve in minutes because this project already
measured what works.** This repo is the laboratory that produced that
knowledge; the suite is what makes the knowledge trustworthy (every
claim traces to a probe).

**Stack:** Three.js pinned 0.170.0 (CDN import map — note: NO
`three/addons` mapping; hand-build or extend the map deliberately), no
bundler, VS Code Live Server, Windows/Node-only (no Python). **Repo:**
https://github.com/Cupcakechan/ExperimentProject, subfolder
`sdf-blend-shell/`. Container clones read-only for Claude; **Daniel
pushes, Claude pulls** — the standing gate every round: `git fetch` +
`reset --hard origin/main`, byte-diff any delivered files vs HEAD
(normalize CRLF via `tr -d '\r'`; trailing-newline diffs are noise),
`node test_suite.mjs`, and treat the PROBE COUNT as the certification
number. Deliveries are FULL files staged in `/mnt/user-data/outputs/`.
Method: Daniel's General Instructions (userPreferences) + the
dev-method skill; options round -> Daniel picks -> one tested pass per
commit; feel reports get mechanism + ONE lever.

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
1. **HARVEST SESSION (next; run in a FRESH session).** Deliverable: the
   **creature-forge content skill** — a folder of downloadable files:
   `SKILL.md` (sections: architecture overview; the authoring rules;
   archetype recipes; the measured-boundaries table; the artifact
   taxonomy — what fails, why, which fix class; feel levers; locomotion
   vocabulary: gait/knees, hop, hover, spin, sway-bend) plus
   `reference/` carrying the known-good modules from this repo
   (validate.js, generate.js, blendMaterial.js, inkPass.js, anim.js,
   gait.js, hop.js, world.js, trails.js, creatures.js as the worked
   cast). Sources: this handoff + LESSONS.md + RESEARCH_TECHNIQUE.md +
   the repo itself. **IMPORTANT: produce skill CONTENT only.** Daniel
   has a separate "special Claude" that integrates skills into his
   dev-method — do NOT attempt that integration. Also produce for that
   special Claude a short "process additions" note distilling LESSONS
   17, 18, and 20 (certified provenance; edit-script discipline;
   probe-invariant refinement) — those belong in dev-method, not
   creature-forge.
2. **Research builds (after the harvest; each feeds a recipe back into
   the skill):**
   - **CONTACT-SHADOW** first — one pass; mechanism verified in
     RESEARCH SS9 (depth to a small RT, two-pass blur, shown under the
     subject); the grounding read the unlit creatures lack; fits the
     flat stage exactly.
   - **EXPORT-BAKE track** second — multi-pass; the bridge to "creatures
     leave the tool" (GLTF/OBJ/STL/USDZ exporters verified present).
     Honest complexity recorded: the suite's CPU vertex-pipeline mirror
     makes baking snapped SHELL geometry cheap, but donor shells
     overlap (poor asset topology) and eyes/mouths are painted
     PER-PIXEL in the fragment shader (decals need their own answer:
     flattened decal geometry, dense vertex colors, or a texture bake).
     **Strongly coupled to un-banking R4 Surface Nets** — meshing the
     field directly yields the clean watertight mesh export wants. Open
     the track with an options round: R4-first vs bake-first.
   - Banked beyond that: PICKING (ID-texture GPU picking — the only
     selection that works for shader-moved vertices), GPGPU flocking,
     contact ambience — RESEARCH SS9 Tiers B/C.

## Gotchas (live)
- No backticks inside GLSL template literals — and edit-script
  replacement text has the SAME rule (LESSON 18).
- The import map has NO `three/addons`: hand-build geometry (world.js
  does) or extend index.html deliberately.
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
