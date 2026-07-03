// ============================================================
// blendMaterial.js — the heart of the experiment.
//
// The vertex shader receives every SDF primitive as uniforms,
// combines them with smooth-min, and slides each mesh vertex
// onto the combined zero-surface. Vertices from different
// primitive meshes converge onto the SAME surface, so seams
// cease to exist. Normals come from the SDF gradient, not from
// the mesh, so lighting is continuous across every join.
// ============================================================

import * as THREE from 'three';
import { BLEND_K, SNAP_ITERS, MAX_PRIMS, SHELL_COLOR } from '../config.js';

// NOTE: three.js auto-prepends `attribute vec3 position`, the matrices,
// and precision headers to ShaderMaterial shaders — we must not redeclare them.
const VERT = /* glsl */ `
uniform vec3 uA[MAX_PRIMS];
uniform vec3 uB[MAX_PRIMS];
uniform float uR[MAX_PRIMS];
uniform int uCount;
uniform float uK;

varying vec3 vNormal;

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

void main() {
  // Geometry is baked in world space, so 'position' is already a world point
  // sitting on its OWN primitive's surface — i.e. already close to the target.
  vec3 p = position;

  // Slide onto the combined surface: step along the gradient by the
  // signed distance. Converges in a few iterations because we start close.
  for (int i = 0; i < SNAP_ITERS; i++) {
    p -= sdfNormal(p) * mapSDF(p);
  }

  vNormal = sdfNormal(p);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
varying vec3 vNormal;

void main() {
  vec3 n = normalize(vNormal);
  vec3 lightDir = normalize(vec3(0.6, 1.0, 0.5));
  float diff = max(dot(n, lightDir), 0.0);

  // Quantize the diffuse term into bands for the toon look.
  // If lighting shows ANY visible line at a primitive join, the experiment failed.
  float toon = floor(diff * 3.0 + 0.5) / 3.0;

  vec3 col = uColor * (0.35 + 0.65 * toon);
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
  for (let i = 0; i < MAX_PRIMS; i++) {
    const prim = prims[i];
    uA.push(new THREE.Vector3(...(prim ? prim.a : [0, 0, 0])));
    uB.push(new THREE.Vector3(...(prim ? prim.b ?? prim.a : [0, 0, 0])));
    uR.push(prim ? prim.r : 0.0);
  }

  return new THREE.ShaderMaterial({
    defines: { MAX_PRIMS, SNAP_ITERS },
    uniforms: {
      uA: { value: uA },
      uB: { value: uB },
      uR: { value: uR },
      uCount: { value: Math.min(prims.length, MAX_PRIMS) },
      uK: { value: BLEND_K },
      uColor: { value: new THREE.Color(SHELL_COLOR) },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
}
