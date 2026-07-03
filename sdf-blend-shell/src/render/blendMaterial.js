// ============================================================
// blendMaterial.js — the heart of the experiment.
//
// The vertex shader receives every SDF primitive as uniforms,
// combines them with smooth-min, and slides each mesh vertex
// onto the combined zero-surface. Vertices from different
// primitive meshes converge onto the SAME surface, so seams
// cease to exist.
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
import { BLEND_K, SNAP_ITERS, MAX_PRIMS, SHELL_COLOR, COLOR_SOFT, COLOR_POW } from '../config.js';

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

// Polynomial smooth minimum — the "clay smoothing" operator.
// k is the blend radius: how far from an intersection the surfaces
// start melting into each other.
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// The combined field of the whole creature.
// Loop bound must be the compile-time constant (GLSL ES rule);
// the uCount check skips unused uniform slots.
float mapSDF(vec3 p) {
  float d = 1e9;
  for (int i = 0; i < MAX_PRIMS; i++) {
    if (i < uCount) {
      d = smin(d, sdCapsule(p, uA[i], uB[i], uR[i]), uK);
    }
  }
  return d;
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
  vec3 c = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < MAX_PRIMS; i++) {
    if (i < uCount) {
      float d = max(sdCapsule(p, uA[i], uB[i], uR[i]), 0.0);
      float w = 1.0 / pow(d + uColorSoft, uColorPow);
      c += uColors[i] * w;
      wsum += w;
    }
  }
  return c / max(wsum, 1e-6);
}
`;

const VERT = /* glsl */ `
attribute float aPrim;

uniform mat4 uAnimMat;
uniform int uAnimPrim;

varying vec3 vPos;

${FIELD_GLSL}

void main() {
  // Geometry is baked in world space, so 'position' is already a world point
  // sitting on its OWN primitive's REST surface.
  vec3 p = position;

  // If this vertex belongs to the animated primitive, rigidly follow it
  // first (aPrim is a float attribute; +0.5 makes the int cast robust).
  if (int(aPrim + 0.5) == uAnimPrim) {
    p = (uAnimMat * vec4(p, 1.0)).xyz;
  }

  // Slide onto the combined surface: step along the gradient by the
  // signed distance. Converges in a few iterations because we start close.
  for (int i = 0; i < SNAP_ITERS; i++) {
    p -= sdfNormal(p) * mapSDF(p);
  }

  // Hand the snapped surface point to the fragment shader; interpolated
  // points stay close enough to the surface for field evaluation.
  vPos = p;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const FRAG = /* glsl */ `
varying vec3 vPos;

${FIELD_GLSL}

void main() {
  // Per-pixel: evaluate the field HERE, not at the nearest vertex.
  vec3 n = sdfNormal(vPos);
  vec3 lightDir = normalize(vec3(0.6, 1.0, 0.5));
  float diff = max(dot(n, lightDir), 0.0);

  // Quantize the diffuse term into bands for the toon look.
  // If lighting shows ANY visible line at a primitive join, the experiment failed.
  float toon = floor(diff * 3.0 + 0.5) / 3.0;

  vec3 col = blendColor(vPos) * (0.35 + 0.65 * toon);
  gl_FragColor = vec4(col, 1.0);
}
`;

// Builds the material with the creature's primitives baked into uniform arrays,
// padded to MAX_PRIMS (GLSL uniform arrays are fixed-size).
export function createBlendMaterial(prims) {
  if (prims.length > MAX_PRIMS) {
    console.warn(`Creature has ${prims.length} primitives; only the first ${MAX_PRIMS} will blend.`);
  }
  const uA = [];
  const uB = [];
  const uR = [];
  const uColors = [];
  for (let i = 0; i < MAX_PRIMS; i++) {
    const prim = prims[i];
    uA.push(new THREE.Vector3(...(prim ? prim.a : [0, 0, 0])));
    uB.push(new THREE.Vector3(...(prim ? prim.b ?? prim.a : [0, 0, 0])));
    uR.push(prim ? prim.r : 0.0);
    // ?? guard: a registry entry without a color must never break the shader.
    uColors.push(new THREE.Color(prim ? prim.color ?? SHELL_COLOR : 0x000000));
  }

  return new THREE.ShaderMaterial({
    defines: { MAX_PRIMS, SNAP_ITERS },
    uniforms: {
      uA: { value: uA },
      uB: { value: uB },
      uR: { value: uR },
      uColors: { value: uColors },
      uCount: { value: Math.min(prims.length, MAX_PRIMS) },
      uK: { value: BLEND_K },
      uColorSoft: { value: COLOR_SOFT },
      uColorPow: { value: COLOR_POW },
      uAnimMat: { value: new THREE.Matrix4() }, // identity = rest pose
      uAnimPrim: { value: -1 }, // -1 = nothing animated until main.js wires it
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
}
