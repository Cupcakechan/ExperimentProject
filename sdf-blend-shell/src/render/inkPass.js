// ============================================================
// inkPass.js — R1: the ink line, SCREEN-SPACE (depth-only).
//
// Replaces the inverted-hull ink DRAW. The scene renders once into
// an offscreen target with a depth texture; a fullscreen pass then
// inks every DEPTH DISCONTINUITY: silhouettes against background
// and ground, creature over creature, a near leg over the body
// behind it.
//
// Why this deletes the seam family: the smin surface is SMOOTH —
// depth-CONTINUOUS across concave creases (knee, body-exit, neck
// join) — so no discontinuity exists there and nothing inks, by
// construction. The old artifacts were the hull's offset surface
// pinching at exactly those creases (RESEARCH_TECHNIQUE.md §1:
// structural to inverted-hull outlining).
//
// The edge test is RELATIVE (depth step / nearest sample), so one
// threshold serves the whole stage depth range; the line weight is
// in SCREEN pixels — constant on screen, unlike the world-width
// hull line, which grew as the camera zoomed in.
//
// R-SIMPLIFY (post-R1): createOutlineMaterial and the hull-era probe
// blocks are gone; the skin keeps its tuck/limb/capless machinery
// because it serves the SKIN itself (coincident donor layers
// z-fighting), not the retired hull.
// ============================================================

import * as THREE from 'three';
import { OUTLINE_COLOR, INK_PX, INK_DEPTH_THRESHOLD } from '../config.js';

// Pure (suite-anchored): perspective depth-buffer value [0..1] -> world
// distance along the view ray. linearDepth() in INK_FRAG mirrors this —
// the GLSL and this function must stay the same formula.
export function linearizeDepth(d, near, far) {
  return (near * far) / (far - d * (far - near));
}

export const INK_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  // The quad is authored in clip space already — no matrices.
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const INK_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uResolution; // device pixels
uniform float uInkPx;     // line weight, device pixels
uniform float uNear;
uniform float uFar;
uniform float uThreshold; // relative depth step that inks
uniform vec3 uInkColor;

varying vec2 vUv;

// Depth-buffer value -> world distance (mirrors linearizeDepth in the
// module — same formula by contract, suite-anchored there).
float linearDepth(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  return (uNear * uFar) / (uFar - d * (uFar - uNear));
}

void main() {
  // 5-tap SECOND difference (a depth Laplacian), R1.1. The first-
  // difference Roberts cross measured depth SLOPE, and slope is huge on
  // any surface viewed near edge-on even when it is continuous — with
  // T = 0.02 at stage depth, every patch within ~15.6 deg of edge-on
  // inked (2 o cot(theta) / d > T), painting short strokes on crease
  // shoulders and limb exits as they slid through oblique view: the
  // joint-cut artifact. A ramp has slope but ~zero CURVATURE; the second
  // difference reads ~0 on it, while a true occlusion step still reads
  // at FULL size — so wanted lines keep the identical threshold response
  // (a step S measures ~S in both schemes; suite-anchored).
  vec2 o = (uInkPx * 0.5) / uResolution;
  float dC = linearDepth(vUv);
  float dL = linearDepth(vUv - vec2(o.x, 0.0));
  float dR = linearDepth(vUv + vec2(o.x, 0.0));
  float dB = linearDepth(vUv - vec2(0.0, o.y));
  float dT = linearDepth(vUv + vec2(0.0, o.y));
  float g = max(abs(dL + dR - 2.0 * dC), abs(dB + dT - 2.0 * dC));
  // RELATIVE test, normalized by the NEAREST sample: the line belongs to
  // the closer surface, and one threshold holds whether the edge sits 3
  // or 30 units deep. The 2x span makes the line edge soft (cheap AA).
  float dMin = min(dC, min(min(dL, dR), min(dB, dT)));
  float edge = smoothstep(uThreshold, uThreshold * 2.0, g / dMin);
  vec3 col = texture2D(tColor, vUv).rgb;
  gl_FragColor = vec4(mix(col, uInkColor, edge), 1.0);
}
`;

export function createInkPass(renderer, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const pr = renderer.getPixelRatio();

  // 24-bit depth, explicitly: 16-bit quantization at stage distances is
  // the same order of magnitude as the relative steps the edge test
  // measures — the line would sparkle.
  const depthTexture = new THREE.DepthTexture(size.x * pr, size.y * pr);
  depthTexture.type = THREE.UnsignedIntType;

  // samples: 4 = MSAA parity with the old antialiased canvas. r170
  // resolves BOTH color and depth on blit (verified in the pinned
  // source: the multisample resolve masks in DEPTH_BUFFER_BIT).
  const target = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, {
    samples: 4,
    depthTexture,
  });

  const uniforms = {
    tColor: { value: target.texture },
    tDepth: { value: depthTexture },
    uResolution: { value: new THREE.Vector2(size.x * pr, size.y * pr) },
    uInkPx: { value: INK_PX * pr }, // INK_PX is CSS px; device px on the target
    uNear: { value: camera.near }, // static by design: this camera never changes planes
    uFar: { value: camera.far },
    uThreshold: { value: INK_DEPTH_THRESHOLD },
    // Same construction as the hull's uOutlineColor — identical ink color.
    uInkColor: { value: new THREE.Color(OUTLINE_COLOR) },
  };

  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: INK_VERT,
      fragmentShader: INK_FRAG,
      depthTest: false,
      depthWrite: false,
    })
  );
  quad.frustumCulled = false; // clip-space quad: CPU bounds are meaningless
  const quadScene = new THREE.Scene();
  quadScene.add(quad);
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  return {
    uniforms, // exposed: the weight/threshold levers write here (and future probes read it)
    setSize(width, height) {
      const p = renderer.getPixelRatio();
      target.setSize(width * p, height * p); // resizes the depth texture too (r170 RenderTarget.setSize)
      uniforms.uResolution.value.set(width * p, height * p);
      uniforms.uInkPx.value = INK_PX * p;
    },
    render(scene, cam) {
      renderer.setRenderTarget(target);
      renderer.render(scene, cam);
      renderer.setRenderTarget(null);
      renderer.render(quadScene, quadCamera);
    },
  };
}
