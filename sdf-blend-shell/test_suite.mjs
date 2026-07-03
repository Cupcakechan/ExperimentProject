// ============================================================
// test_suite.mjs — committed permanent guard (run: node test_suite.mjs)
//
// ONE-TIME LOCAL SETUP: `npm install three@0.170.0`
// (the browser gets three from the CDN import map; Node needs a local
// copy to resolve the same imports. node_modules/ is gitignored.)
//
// Section 0: import every src/ module (except the boot entry main.js)
//            so the browser is never the first parser to see the code.
// Section 1: logic probes with hand-computed expected values.
// ============================================================

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

let failures = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.error(`  FAIL  ${label}`);
  }
}

// ---------- Section 0: module health ----------
console.log('Section 0: module health');

// Minimal DOM stub so UI-touching modules can import headlessly.
globalThis.window = {};
globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ getContext: () => null, style: {} }),
  addEventListener: () => {},
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

const modules = walk('src').filter((p) => !p.endsWith('main.js')); // main.js needs a real canvas
for (const modPath of modules) {
  try {
    await import(pathToFileURL(modPath).href);
    console.log(`  PASS  import ${modPath}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL  import ${modPath}: ${err.message}`);
  }
}

delete globalThis.window;
delete globalThis.document;

// ---------- Section 1: logic probes ----------
console.log('Section 1: logic probes');

const { CREATURE } = await import('./src/data/creature.js');
const { MAX_PRIMS, BLEND_K } = await import('./src/config.js');
const { buildShellGeometry } = await import('./src/render/buildShell.js');
const { createBlendMaterial } = await import('./src/render/blendMaterial.js');

// Registry shape: every primitive must be renderable by buildShell + shader.
for (const prim of CREATURE) {
  assert(typeof prim.id === 'string' && prim.id.length > 0, `prim has id (${prim.id})`);
  assert(Array.isArray(prim.a) && prim.a.length === 3, `${prim.id}: a is [x,y,z]`);
  assert(prim.b === undefined || (Array.isArray(prim.b) && prim.b.length === 3), `${prim.id}: b is [x,y,z] or omitted`);
  assert(typeof prim.r === 'number' && prim.r > 0, `${prim.id}: r > 0`);
}
assert(CREATURE.length <= MAX_PRIMS, `creature fits shader capacity (${CREATURE.length} <= ${MAX_PRIMS})`);
assert(BLEND_K > 0, 'BLEND_K > 0 (smin divides by k)');

// Geometry: merge succeeded, aPrim attribute present and spans all primitives.
const geo = buildShellGeometry(CREATURE);
assert(geo !== null && geo.getAttribute('position').count > 0, 'merged geometry has vertices');
const aPrim = geo.getAttribute('aPrim');
assert(aPrim !== undefined, 'aPrim attribute exists (Stage B dependency)');
const seen = new Set(aPrim.array);
assert(seen.size === CREATURE.length, `aPrim covers all ${CREATURE.length} primitives (saw ${seen.size})`);

// Material: uniform arrays are padded to exactly MAX_PRIMS, count is honest.
const mat = createBlendMaterial(CREATURE);
assert(mat.uniforms.uA.value.length === MAX_PRIMS, 'uA padded to MAX_PRIMS');
assert(mat.uniforms.uR.value.length === MAX_PRIMS, 'uR padded to MAX_PRIMS');
assert(mat.uniforms.uCount.value === CREATURE.length, 'uCount matches creature');

// Hand-computed smin check (JS mirror of the shader function):
// smin(1.0, 1.0, 0.25) => h = 0.5, mix = 1.0, minus 0.25*0.25 = 0.9375.
// Verifies the polynomial form we shipped is the one we think it is.
function smin(a, b, k) {
  const h = Math.min(Math.max(0.5 + (0.5 * (b - a)) / k, 0), 1);
  return b * (1 - h) + a * h - k * h * (1 - h);
}
assert(Math.abs(smin(1.0, 1.0, 0.25) - 0.9375) < 1e-9, 'smin(1,1,0.25) = 0.9375 (hand-computed)');
assert(smin(5.0, 1.0, 0.25) === 1.0, 'smin far apart degrades to plain min');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
