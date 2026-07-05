# RESEARCH_TECHNIQUE.md — Deep-research findings & decision document
_Distilled 2026-07-05 from the full research dive (video/CC analysis, repo
review, Spore/Dreams literature, SDF rendering references). This is the
repo's source of truth for the technique going forward and raw material
for the SKILL harvest._

## 1. The "secret" — there isn't one trick; it's a stack
The hand-made look people are amazed by decomposes into exactly the stack
we independently rebuilt:
capsule/sphere primitives → polynomial smooth-min blending → normals from
the SDF gradient (not the mesh) → quantized toon shading → an outline.
The smoothness comes from SDF-GRADIENT NORMALS (continuous everywhere, so
lighting never shows the part boundaries) and the hand-made read comes
from AUTHORED PROPORTIONS, not the renderer. The likely ecosystem source:
RujiK the Comatose (Critter Crosser) and TheSnidr's GameMaker 3D work —
sphere/capsule bodies along a spine, procedural walk animation, software
skinning. Their creatures read hand-made for anatomy reasons (see §5),
not renderer reasons. Verdict: our engine half is essentially AT the
state of the art for this class; our remaining problems are two known,
STRUCTURAL artifact families — not implementation bugs.

## 2. Root causes of our two artifact families (research-confirmed)
### 2a. The ink seams — inverted hull is the wrong outline for soft bodies
Inverted-hull outlines are known to fail at CONCAVE CREASES: the offset
surface pinches/cusps, back faces become visible, and any buried or
overlapping geometry (caps, tuck bands, folds) paints black shells. Every
"act" we fought (black domes, run-off, tuck rings, knee slashes, exit
rings) is one family: mesh-space outlining of a blended surface whose
topology the outline mesh does not match. The industry answer for smooth
blobby characters is SCREEN-SPACE outlining: a post-process edge detect
on DEPTH + NORMALS (Sobel/Roberts cross). Image-space outlines are
topology-independent — the entire artifact family becomes impossible, and
the tuck/limb-group/capless machinery becomes REMOVABLE.

### 2b. Feature swallowing — non-local smin inflation
Polynomial smin is non-local: N overlapping prims compound inflation
(deficit up to k/4 per pair), which is what swallowed mouths at high k,
ballooned decals on the dilate, and drove every INFL ceiling. Mitigations
in priority order: (1) cubic C2 smin (smoother second derivative =
cleaner toon bands at blends; well-characterized bounds), (2) per-pair k
discipline (our kCap — keep), (3) FEATURES OFF THE FIELD: Spore's model —
the body is the blended implicit surface, but eyes/mouths/feet are
ATTACHED PARTS ("rigblocks") placed ON the surface, never carved INTO the
field. Our ball-eye conversion was independently the right instinct; the
research says finish the thought: mouths as attached geometry too, ending
the k-validity boundary class entirely.

Reference formulas (canonical, Inigo Quilez):
- quadratic smin (current): h = clamp(0.5 + 0.5*(b-a)/k, 0, 1);
  mix(b,a,h) - k*h*(1-h)          // C1 continuous
- cubic smin (recommended):  h = max(k - abs(a-b), 0.0)/k;
  min(a,b) - h*h*h*k*(1.0/6.0)    // C2 continuous, bounded influence

## 3. Prioritized fix-path (decision-ready)
R1. SCREEN-SPACE OUTLINE (the big unlock): render depth+normal targets,
    Sobel edge detect, composite. Deletes the ink draw, its artifact
    family, and eventually the burial machinery. Three.js addons ship
    EffectComposer/RenderPass — CDN-importable, no bundler.
R2. CUBIC SMIN + inflation re-measure: one FIELD_GLSL function swap;
    suite ceilings re-anchor; toon bands smoother at every blend.
R3. FEATURES OFF THE FIELD: mouths become attached geometry (or bounded
    decals on the outlined surface) — closes the swallowing class.
R4. (Optional, bigger) SURFACE NETS MESHING: mesh the SDF on a worker
    into a real BufferGeometry instead of snapping donor shells —
    removes vertex-donor artifacts wholesale (folds, ring density,
    burial) at the cost of meshing time on pose changes. Bank unless
    R1-R3 leave residuals.

## 4. Spore & Dreams — transferable lessons
- Spore: metaball/implicit BODY + attached rigblock FEATURES + a spine
  graph; procedural animation authored once and RETARGETED to arbitrary
  morphologies (Hecker et al., "Real-time motion retargeting to highly
  varied user-created morphologies"). Transfer: keep the body implicit,
  keep features as parts, and treat animation as functions of the BODY
  PLAN (leg count, spine length) — which our gait already does.
- Dreams (Media Molecule, Alex Evans "Learning from Failure"): SDFs as
  the AUTHORING format with a renderer built to consume them (splats/
  bricks). Transfer: the authoring insight (sculpt-by-primitives is a
  great UX; the registry IS a sculpting format), not the renderer.

## 5. Creature anatomy — the skill-grade rules (from the RujiK-style
   breakdowns + reference study)
- Bodies decompose as SPINE (1-3 masses: hips/chest/head) + LIMB CHAINS
  hung off spine points + FEATURES on the head. Our registry already
  encodes this; name it in the schema docs.
- Cute/readable proportions: head 30-50% of body mass; eyes large, on
  the head's front third, gaze slightly convergent; legs SHORT relative
  to body (torso 2-3x leg length); feet/hooves darker or bigger than
  the shin (ground anchor). Silhouette test: the creature must read in
  flat black.
- Joints: knees/elbows sit at ~55-60% down the limb, bend authored INTO
  the rest pose (our no-pole-field rule — validated).
- Motion sells anatomy more than shape: step-synced bob, lean into
  turns, squash/stretch on hops (all shipped) + the spine counter-wave
  (queued idea) are the RujiK signature moves.

## 6. Provided-repo triage
- procedural-snake (Sujenphea): RELEVANT — spine-following segment chain,
  the pattern behind snake/tail/spine-wave locomotion.
- Feed-the-Animal Medium article: basic Three.js scene/creature wiring;
  beginner-level, nothing to adopt.
- small-world / cube-world (paulrobello), threejs-procedural-planets
  (dgreenheck), Procedural-City-Generator, THREE.Terrain: NOT creature
  tech — worldgen (noise, LOD, palettes, instancing). Bank for the
  TERRARIUM pass: noise-displaced ground, instanced props, palette
  discipline.

## 7. Caveats
- The Reddit author's exact code remains unpublished; §1 is the
  evidence-based reconstruction, not a confirmed source.
- Some ecosystem attributions (which creator inspired whom) are
  inference; the TECHNIQUES are verified against primary references
  even where lineage is not.
