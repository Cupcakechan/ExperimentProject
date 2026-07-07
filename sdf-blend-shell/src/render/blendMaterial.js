// ============================================================
// blendMaterial.js — the heart of the experiment.
//
// The vertex shader receives every SDF primitive as uniforms,
// combines them with smooth-min, and slides each mesh vertex
// onto the combined zero-surface. Vertices from different
// primitive meshes converge onto the SAME surface, so seams
// cease to exist.
//
// Buried-geometry tuck: a vertex that STARTS inside a DIFFERENT
// primitive would otherwise snap onto the same surface another
// mesh already covers — two coincident triangle layers z-fight as
// a faint stitched seam at glancing angles. Such vertices instead
// sink TUCK_DEPTH beneath the skin, hidden. Checked against live
// uniforms, so it stays correct while the arm swings into the body.
//
// Polish pass (per-pixel shading): normals and colors are now
// computed in the FRAGMENT shader. Previously they were computed
// per-vertex and linearly interpolated across triangles, so the
// quantized toon bands wobbled along the tessellation. The SDF is
// a continuous field — evaluating it per pixel makes band edges
// and color gradients smooth curves regardless of mesh density.
// Geometry cost stays per-vertex; shading adds ~5 field
// evaluations per pixel (still nowhere near raymarching).
// ============================================================

import * as THREE from 'three';
import { BLEND_K, SNAP_ITERS, MAX_PRIMS, SHELL_COLOR, COLOR_SOFT, COLOR_POW, TUCK_DEPTH, BURY_EPS, BURY_BAND, PAINT_EDGE, SHADE_AMBIENT, SPEC_POWER, SPEC_STRENGTH, CONTACT_AO, CONTACT_AO_H } from '../config.js';

// NOTE: three.js auto-prepends 'position', the matrices, and precision
// headers to ShaderMaterial shaders (never redeclare those) — but CUSTOM
// attributes like aPrim must be declared by us.
// NOTE: no backticks inside these template literals — a backtick in a GLSL
// comment terminates the JS string early (already bitten once; suite catches it).

// The SDF field: shared by BOTH shaders (vertex snaps with it, fragment
// shades with it). One source of truth — the two stages can never drift.
const FIELD_GLSL = /* glsl */ `
uniform vec3 uA[MAX_PRIMS];
uniform vec3 uB[MAX_PRIMS];
uniform float uR[MAX_PRIMS];
uniform vec3 uColors[MAX_PRIMS];
uniform float uPaint[MAX_PRIMS]; // 1.0 = color-only prim: no surface, no mesh
uniform float uKCap[MAX_PRIMS]; // per-prim blend-radius ceiling (thin-part trick)
uniform float uKPrim[MAX_PRIMS]; // ABSOLUTE per-prim blend radius; <= 0.0 = unset (follow the slider)
uniform float uInflate; // whole-creature dilate (plumpness): the skin sits this far OUTSIDE the raw field; 0 = none
uniform float uNeg[MAX_PRIMS]; // 0 = solid; 1 = CARVE (host color lines the bowl); 2 = carve with authored interior color
uniform float uPaintEdge; // decal edge softness, world units
uniform int uCount;
uniform float uK;
uniform float uColorSoft;
uniform float uColorPow;

// Distance from point p to a capsule (segment a-b, radius r).
// A sphere is the degenerate case a == b (the max() guards divide-by-zero).
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a;
  vec3 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

// CUBIC smooth minimum (R2, C2-continuous — RESEARCH_TECHNIQUE.md 2b).
// k is the blend radius: how far from an intersection the surfaces
// start melting into each other. The quadratic version was C1 only
// (curvature JUMPED at the blend boundary — toon-band kinks at every
// join) and non-local (influence never truly ended). Cubic: influence
// ends EXACTLY at abs(a - b) = k, and the equal-pair deficit shrinks
// k/4 -> k/6, so blends read TIGHTER at the same slider value (every
// INFL ceiling re-MEASURED in the suite against this field).
float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * h * k * (1.0 / 6.0);
}

// Polynomial smooth DIFFERENCE (carving) — fogleman dn.py verbatim, see
// REFERENCE_FOGLEMAN.md. Note the TWO sign flips vs smin: (d2 + d1)
// inside h, and the correction term is ADDED — carving pushes the wall
// outward-of-the-cut, the mirror of union's inward deficit.
float sdiff(float d1, float d2, float k) {
  float h = clamp(0.5 - 0.5 * (d2 + d1) / k, 0.0, 1.0);
  return mix(d1, -d2, h) + k * h * (1.0 - h);
}

// Blend-radius resolution, in authoring-priority order:
//   1. uKPrim (absolute, authored): this prim blends THIS wide, period —
//      the slider does not move it (authored beats ambient).
//   2. uK (the slider): the global mood for unauthored prims.
//   3. uKCap: a CEILING over either — the thin-part trick; thin parts AND
//      small carves keep their shape no matter what 1 or 2 say.
float primK(int i) {
  float base = uKPrim[i] > 0.0 ? uKPrim[i] : uK;
  return min(base, uKCap[i]);
}

// The combined field of the whole creature — TWO PHASES:
//   1. smooth-union every positive solid;
//   2. smooth-subtract every negative from the FINISHED union.
// Two phases so a carve's registry position never changes the result —
// a mixed fold would make holes depend on authoring order in ways no
// author could reason about (fogleman: difference(union(...), cuts)).
// Loop bound must be the compile-time constant (GLSL ES rule);
// the uCount check skips unused uniform slots.
float mapSDF(vec3 p) {
  float d = 1e9;
  for (int i = 0; i < MAX_PRIMS; i++) {
    if (i < uCount && uPaint[i] < 0.5 && uNeg[i] < 0.5) {
      d = smin(d, sdCapsule(p, uA[i], uB[i], uR[i]), primK(i));
    }
  }
  for (int i = 0; i < MAX_PRIMS; i++) {
    if (i < uCount && uNeg[i] > 0.5) {
      d = sdiff(d, sdCapsule(p, uA[i], uB[i], uR[i]), primK(i));
    }
  }
  // Dilate (the fogleman offset trick): a constant subtraction moves the
  // zero surface uniformly outward — plumpness as one number. Snap,
  // normals, and the outline all consume mapSDF, so they ride the plumped
  // skin with no further changes; decals measure REAL local inflation
  // (raw distances), which now naturally includes the dilate.
  return d - uInflate;
}

// SDF gradient via the 4-sample tetrahedron trick — this IS the
// surface normal, and it is continuous everywhere (no seams in lighting).
vec3 sdfNormal(vec3 p) {
  const float h = 0.02;
  const vec2 k = vec2(1.0, -1.0);
  return normalize(
    k.xyy * mapSDF(p + k.xyy * h) +
    k.yyx * mapSDF(p + k.yyx * h) +
    k.yxy * mapSDF(p + k.yxy * h) +
    k.xxx * mapSDF(p + k.xxx * h)
  );
}

// Per-primitive colors weighted by proximity: on the shell every primitive
// distance is >= 0 (smin <= min), so the touching primitive gets a huge
// weight and distant ones fade — soft gradients at every join, for free.
vec3 blendColor(vec3 p) {
  // Phase 1: SOLID prims blend by proximity weight (the skin's base color).
  // dSkin tracks the distance to the NEAREST solid: on the shell this is
  // exactly how far the smin skin has INFLATED above its nearest primitive
  // (smin <= min, so at the surface every solid distance is >= 0).
  vec3 c = vec3(0.0);
  float wsum = 0.0;
  float dSkin = 1e9;
  for (int i = 0; i < MAX_PRIMS; i++) {
    if (i < uCount && uPaint[i] < 0.5 && uNeg[i] < 0.5) {
      float dRaw = sdCapsule(p, uA[i], uB[i], uR[i]);
      // dSkin is the POSITIVE union's inflation only — the decal
      // compensation rides the skin above its solid host.
      dSkin = min(dSkin, dRaw);
      float d = max(dRaw, 0.0);
      float w = 1.0 / pow(d + uColorSoft, uColorPow);
      c += uColors[i] * w;
      wsum += w;
    }
  }
  c /= max(wsum, 1e-6);

  // Carve interiors COMPOSITE like decals — a weighted proximity blend
  // cannot CONTAIN a color, only attenuate it: a near-black mouth joining
  // the weight soup held ~42% of the mix on clean skin 0.05 away (the
  // mouth-shadow defect; worst under dilate, which weakens the host's
  // contact weight from ~4400 to ~330). The bowl wall sits INSIDE the
  // carve volume, so coverage saturates there and dies within uPaintEdge
  // past the rim. Colorless carves (uNeg == 1) composite nothing — the
  // host's blended color lines them.
  for (int i = 0; i < MAX_PRIMS; i++) {
    if (i < uCount && uNeg[i] > 1.5) {
      float d = sdCapsule(p, uA[i], uB[i], uR[i]);
      // The threshold shifts by the DILATE: the dilated skin crosses the
      // RAW carve boundary at a grazing angle (blurred rim on inflated
      // creatures — hopper crisp, pudge soft, the diagnostic pair), but
      // two co-dilated surfaces cross at the raw pair's dihedral. The
      // CONSTANT uInflate compensates exactly (unlike measured local
      // inflation, which balloons near joins); a future animated inflate
      // (breathing) reads this same uniform and stays compensated free.
      // NOTE (A4, measured): at extreme slider k the union deficit at a
      // mouth site can exceed the carve's radius — the carve GEOMETRY is
      // swallowed, and no color model (constant, measured, or capped)
      // can paint dissolved geometry. Mouth k-validity is an authoring
      // boundary, not a shader problem.
      float cov = 1.0 - smoothstep(uInflate, uInflate + uPaintEdge, d);
      c = mix(c, uColors[i], cov);
    }
  }

  // Phase 2: PAINT prims composite on top as decals, in REGISTRY ORDER
  // (later wins). Weighted blending can't layer paints: a pupil over a
  // sclera saturates both weights and ties 50/50 (gray).
  // Decals RIDE THE INFLATED SKIN: subtracting the local inflation keeps
  // a decal's footprint glued to the surface at ANY blend radius — paint
  // prims are authored against the primitives, but at high k the skin
  // balloons past their absolute reach (the k=0.6 vanishing-eyes defect).
  float infl = max(dSkin, 0.0);
  for (int i = 0; i < MAX_PRIMS; i++) {
    if (i < uCount && uPaint[i] > 0.5) {
      float d = sdCapsule(p, uA[i], uB[i], uR[i]) - infl;
      float cov = 1.0 - smoothstep(0.0, uPaintEdge, d);
      c = mix(c, uColors[i], cov);
    }
  }
  return c;
}
`;

const VERT = /* glsl */ `
attribute float aPrim;

// Every prim owns a transform (identity = rest). This replaces the single
// uAnimMat/uAnimPrim slot: four legs stepping at once is four prims moving
// independently — the prerequisite for IK.
uniform mat4 uPrimMat[MAX_PRIMS];
uniform float uLimb[MAX_PRIMS]; // limb group id (0 = none): same-limb prims never bury each other
uniform float uTuck;
uniform float uBuryEps;
uniform float uBuryBand;
uniform float uSnapOffset; // the skin targets the zero surface (0); the offset machinery survives as vocabulary

varying vec3 vPos;

${FIELD_GLSL}

void main() {
  // Geometry is baked in world space, so 'position' is already a world point
  // sitting on its OWN primitive's REST surface.
  vec3 p = position;
  int own = int(aPrim + 0.5); // +0.5 makes the float->int cast robust

  // Every vertex rigidly follows ITS OWN prim's transform first (identity
  // for prims at rest — a no-op). Dynamic uniform-array indexing is legal
  // in VERTEX shaders (GLSL ES restricts it in fragment shaders only).
  p = (uPrimMat[own] * vec4(p, 1.0)).xyz;

  // Burial check BEFORE snapping: does this vertex start inside a
  // primitive that is not its own? Then another mesh owns this patch of
  // skin, and this vertex must hide beneath it instead of z-fighting it.
  float dOther = 1e9;
  for (int i = 0; i < MAX_PRIMS; i++) {
    // Paint prims bury nothing; NEGATIVE prims bury nothing either — a
    // carve owns no mesh, so no coincident layer exists to z-fight, and
    // the host's own vertices must stay live to line the bowl.
    // SAME-LIMB prims (thigh/shin, A5) don't bury each other: they are
    // ONE continuous surface, and their coincident fragments shade
    // identically from identical positions (the same reasoning that
    // makes the skin's own folds invisible). Mutual burial painted a
    // black tuck-rim RING around every knee on the ink (measured: 841
    // fully-tucked verts, 600+ in the transition band, per knee).
    bool sameLimb = uLimb[own] > 0.5 && abs(uLimb[i] - uLimb[own]) < 0.5;
    if (i < uCount && i != own && uPaint[i] < 0.5 && uNeg[i] < 0.5 && !sameLimb) {
      dOther = min(dOther, sdCapsule(p, uA[i], uB[i], uR[i]));
    }
  }
  // CONTINUOUS burial: 0 at the boundary (-uBuryEps), 1 once uBuryBand
  // deeper. Binary tucking made 0.055-tall triangle cliffs across the
  // boundary whose back faces flashed as black slivers in the ink pass;
  // the ramp turns cliffs into slopes that hug the surface.
  // Dilate shift: "inside another prim's SKIN" now means dOther < uInflate
  // (the skin sits uInflate above the raw surface) — without the shift,
  // vertices in the raw-surface..plumped-skin band would skip the tuck
  // and the z-fighting seam the tuck exists to kill would return.
  float buryT = 1.0 - smoothstep(-uBuryEps - uBuryBand, -uBuryEps, dOther - uInflate);

  // Slide onto the target surface: step along the gradient by the signed
  // distance MINUS the snap offset — offset 0 converges on the skin,
  // offset w converges on the shell w OUTSIDE it (the post's outline
  // trick: an offset surface is smooth even in concave joints, where
  // normal-inflated hulls self-intersect).
  for (int i = 0; i < SNAP_ITERS; i++) {
    p -= sdfNormal(p) * (mapSDF(p) - uSnapOffset);
  }

  // Buried vertices tuck themselves under the skin (the post's trick),
  // proportionally to burial depth (buryT is 0 for exposed verts — no-op).
  p -= sdfNormal(p) * (uTuck * buryT);

  // Hand the surface point to the fragment shader; interpolated points
  // stay close enough to the surface for field evaluation.
  vPos = p;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const FRAG = /* glsl */ `
// three declares modelMatrix for VERTEX shaders only; declaring it here by
// its built-in name makes the renderer bind it for the fragment stage too.
// (cameraPosition needs no declaration — it IS in three's fragment prelude,
// verified in the pinned r170 source: WebGLProgram fragment prefix.)
uniform mat4 modelMatrix;
uniform float uAmbient; // LOOK pass B: the lighting floor (live feel lever)
uniform float uSpecPow; // gloss tightness
uniform float uSpecStrength; // gloss intensity (0 = matte revert)
uniform float uContactAO; // pass B.1: contact darkening at y = 0 (the dead-ink band's replacement)
uniform float uContactAOH; // pass B.1: the fade band height

varying vec3 vPos;

${FIELD_GLSL}

void main() {
  // Per-pixel: evaluate the field HERE, not at the nearest vertex.
  // The field lives in CREATURE space; the creature now roams, so rotate
  // the normal into WORLD space or the lighting turns with the body
  // (a sunset that follows you around).
  vec3 n = normalize(mat3(modelMatrix) * sdfNormal(vPos));
  vec3 lightDir = normalize(vec3(0.6, 1.0, 0.5));

  // LOOK pass B: the 3-band quantize RETIRED — the reference read is
  // soft airbrushed shading (RESEARCH SS1's "quantized toon" was the
  // wrong reconstruction; the screenshots won). Half-Lambert wrap: the
  // terminator slides past the equator, so bodies stay round and
  // bright with darkness pooling only at the lower rim — never
  // crushed to black. The old law still holds: if lighting shows ANY
  // visible line at a primitive join, the experiment failed.
  float hl = dot(n, lightDir) * 0.5 + 0.5;
  float shade = uAmbient + (1.0 - uAmbient) * hl * hl;

  // Blinn-Phong gloss: the vinyl-toy highlight (and a free glint on
  // the white eyeballs). vPos is creature-space — lift it through
  // modelMatrix for the world-space view vector.
  vec3 worldPos = (modelMatrix * vec4(vPos, 1.0)).xyz;
  vec3 halfDir = normalize(lightDir + normalize(cameraPosition - worldPos));
  float spec = pow(max(dot(n, halfDir), 0.0), uSpecPow) * uSpecStrength;

  // LOOK pass B.1 (browser-caught): the depth ink dies at ground
  // contact by GEOMETRY — the foot-vs-ground step converges to 0, so a
  // band under any threshold always exists (~the last 0.04 world units
  // at the default camera; measured). Contact occlusion replaces the
  // dead line: darken color AND gloss toward y = 0 — the reference's
  // own dark-feet read. Hop tucks and hover heights fade it out free
  // (worldPos.y is the true displayed height).
  float groundAO = mix(1.0 - uContactAO, 1.0, smoothstep(0.0, uContactAOH, worldPos.y));

  vec3 col = (blendColor(vPos) * shade + vec3(spec)) * groundAO;
  gl_FragColor = vec4(col, 1.0);
}
`;

// Fresh uniform set per material (anim.js writes uB/uPrimMat per material;
// sharing value objects across materials would couple them invisibly).
// R-SIMPLIFY: the inverted-hull OUTLINE material retired here — the ink
// has been the screen-space pass (inkPass.js) since R1, so the hull and
// its snapOffset plumbing were dead weight. The skin's burial/tuck stays:
// its subject (coincident donor layers z-fighting as stitched seams)
// predates the hull ink and outlives it.
function buildUniforms(prims, inflate, knees) {
  // Limb groups from step.knees (foot id -> thigh id): each pair shares a
  // nonzero id; everything else is 0. Derived, never authored twice.
  const limb = new Array(MAX_PRIMS).fill(0.0);
  if (knees) {
    Object.entries(knees).forEach(([shinId, thighId], gi) => {
      const si = prims.findIndex((p) => p.id === shinId);
      const ti = prims.findIndex((p) => p.id === thighId);
      if (si >= 0 && ti >= 0) {
        limb[si] = gi + 1;
        limb[ti] = gi + 1;
      }
    });
  }
  if (prims.length > MAX_PRIMS) {
    console.warn(`Creature has ${prims.length} primitives; only the first ${MAX_PRIMS} will blend.`);
  }
  const uA = [];
  const uB = [];
  const uR = [];
  const uColors = [];
  const uPaint = [];
  const uKCap = [];
  const uKPrim = [];
  const uNeg = [];
  for (let i = 0; i < MAX_PRIMS; i++) {
    const prim = prims[i];
    uA.push(new THREE.Vector3(...(prim ? prim.a : [0, 0, 0])));
    uB.push(new THREE.Vector3(...(prim ? prim.b ?? prim.a : [0, 0, 0])));
    uR.push(prim ? prim.r : 0.0);
    // ?? guard: a registry entry without a color must never break the shader.
    uColors.push(new THREE.Color(prim ? prim.color ?? SHELL_COLOR : 0x000000));
    // paint is optional; absent = solid (existing entries unaffected).
    uPaint.push(prim && prim.paint ? 1.0 : 0.0);
    // kCap is optional; absent = uncapped. The sentinel just has to be
    // larger than any slider value so min(uK, sentinel) === uK.
    uKCap.push(prim && prim.kCap != null ? prim.kCap : 1e3);
    // k is optional; absent = follow the slider. Sentinel must be <= 0
    // (a legal k is always > 0 — smin divides by it), so the shader's
    // "uKPrim > 0.0" test cleanly separates authored from unauthored.
    uKPrim.push(prim && prim.k != null ? prim.k : -1.0);
    // negative: 0 = solid; 1 = carve without a color (the host's blended
    // color lines the bowl — the SHELL_COLOR fallback above must NOT tint
    // it, hence the encoding); 2 = carve WITH an authored interior color.
    uNeg.push(prim && prim.negative ? (prim.color != null ? 2.0 : 1.0) : 0.0);
  }
  return {
    uA: { value: uA },
    uB: { value: uB },
    uR: { value: uR },
    uColors: { value: uColors },
    uPaint: { value: uPaint },
    uKCap: { value: uKCap },
    uKPrim: { value: uKPrim },
    uNeg: { value: uNeg },
    uCount: { value: Math.min(prims.length, MAX_PRIMS) },
    uK: { value: BLEND_K },
    uColorSoft: { value: COLOR_SOFT },
    uColorPow: { value: COLOR_POW },
    // SEPARATE identity per slot — a shared instance would make every
    // prim follow whichever one anim.js writes.
    uPrimMat: { value: Array.from({ length: MAX_PRIMS }, () => new THREE.Matrix4()) },
    // Buried verts sink TUCK_DEPTH beneath the skin: coincident donor
    // layers snapped to one surface z-fight as stitched seams at glancing
    // angles — the class this machinery exists for, older than the
    // retired hull ink. (The skin's own folds are invisible: skin-colored
    // and shaded from the same position as the true skin before them.)
    uTuck: { value: TUCK_DEPTH },
    uBuryBand: { value: BURY_BAND },
    uBuryEps: { value: BURY_EPS },
    uPaintEdge: { value: PAINT_EDGE },
    uLimb: { value: limb },
    // ?? guard: a creature without an inflate field must behave exactly
    // as before this field existed (0 = the raw field, no dilate).
    uInflate: { value: inflate ?? 0 },
    uSnapOffset: { value: 0 }, // the zero surface; the uniform stays as offset-surface vocabulary
    // LOOK pass B shading levers — live uniforms (the uK pattern), so a
    // feel round can drive them without a shader recompile.
    uAmbient: { value: SHADE_AMBIENT },
    uSpecPow: { value: SPEC_POWER },
    uSpecStrength: { value: SPEC_STRENGTH },
    uContactAO: { value: CONTACT_AO },
    uContactAOH: { value: CONTACT_AO_H },
  };
}

// The skin: snaps to the zero surface, toon-shades the blended colors.
export function createBlendMaterial(prims, inflate, knees) {
  return new THREE.ShaderMaterial({
    defines: { MAX_PRIMS, SNAP_ITERS },
    uniforms: buildUniforms(prims, inflate, knees),
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
}

// (createOutlineMaterial retired at R-SIMPLIFY: the ink is inkPass.js
// since R1. Pre-simplify versions live in git history.)
