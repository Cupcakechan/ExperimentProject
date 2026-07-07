// ============================================================
// world.js — C3: the TERRARIUM scenery.
//
// The design constraint that shapes everything: the LOCOMOTION
// STACK (roam, gait planting, hop arcs) assumes a flat y=0 plane,
// and a dozen suite sims certify it. So the world is built AROUND
// that plane, never through it:
//   - terrainHeight() is EXACTLY 0 everywhere creatures can reach
//     (r <= WORLD_FLAT_RADIUS > the roam hard clamp, suite-enforced),
//     and rises into gentle seeded hills only beyond it;
//   - props (rocks, grass tufts) place at r >= WORLD_PROP_MIN_R,
//     outside creature space — no collision question exists.
//
// The inner flat region IS the stage floor (it replaces the old
// ground disc): same plane, same GROUND_COLOR, so the feet-dip
// trick survives — feet dipping a hair below y=0 stay hidden by it,
// which reads as planted, for free.
//
// Everything is UNLIT (the toon look wants flat), so relief reads
// through two channels only: HEIGHT-BANDED vertex colors (palette
// discipline: stage tone -> moss -> rock) and the ink pass's
// depth-edge silhouettes, which hills and props inherit for free.
// Colors are written RAW into vertex attributes (plain /255 floats,
// no THREE.Color conversion) — the ink pass renders into a target
// where three skips the sRGB transform (the R1 parity rule), so
// raw-in = authored-out.
//
// Deterministic throughout: one WORLD_SEED, value noise + the same
// mulberry32 the creature generator uses. A world is data too.
// ============================================================

import * as THREE from 'three';
import { mulberry32 } from '../data/generate.js';
import {
  GROUND_COLOR,
  WORLD_SEED,
  WORLD_RADIUS,
  WORLD_FLAT_RADIUS,
  WORLD_HILL_HEIGHT,
  WORLD_COLOR_MOSS,
  WORLD_COLOR_ROCK,
  WORLD_ROCK_COUNT,
  WORLD_GRASS_COUNT,
  WORLD_PROP_MIN_R,
  WORLD_PINE_COUNT,
  WORLD_PINE_MIN_H,
  WORLD_PINE_MAX_H,
  WORLD_PINE_SPACING,
} from '../config.js';

// --- seeded value noise (pure, suite-anchored) ---
function hash2(ix, iz, seed) {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iz, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10); // quintic: C2 across cells (no mach bands in the color ramp)

function valueNoise(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = fade(x - ix);
  const fz = fade(z - iz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

const smooth01 = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

// Terrain height at (x, z) — THE INVARIANT lives here: the radial mask
// is EXACTLY 0 up to WORLD_FLAT_RADIUS (smoothstep is identically zero
// at and below its lower edge), so the locomotion plane is untouched by
// construction, not by tuning. Hills are >= 0 only (no pits below the
// stage plane — a dip would read as a hole against nothing).
export function terrainHeight(x, z, seed = WORLD_SEED) {
  const r = Math.hypot(x, z);
  // The boundary is INCLUSIVE and rounding-proof: hypot returns
  // FLAT + 1e-16 for a point authored exactly ON the rim (measured —
  // an inclusive compare alone still leaked a 1e-34 height), so the
  // flat region carries a nanometer of slack. The suite asserts EXACT
  // zero at the rim; continuity is untouched (the smoothstep's own
  // value at FLAT + 1e-9 is ~2e-19 — clamping it to 0 is nothing).
  if (r <= WORLD_FLAT_RADIUS + 1e-9) return 0;
  const mask = smooth01(WORLD_FLAT_RADIUS, WORLD_FLAT_RADIUS + 1.8, r);
  if (mask === 0) return 0;
  const n = 0.6 * valueNoise(x * 0.55, z * 0.55, seed) + 0.3 * valueNoise(x * 1.35, z * 1.35, seed + 1) + 0.1 * valueNoise(x * 3.1, z * 3.1, seed + 2);
  return n * WORLD_HILL_HEIGHT * mask;
}

// Raw color channels from a hex int — deliberately NOT THREE.Color
// (which would color-manage the value; see the header's parity note).
const raw = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Height-banded terrain color: stage tone on the flat, moss on the
// slopes, rock on the crests — soft 0.08-wide band edges (hard steps
// would hand the ink pass's color image visible stair lines).
export function bandColor(h) {
  const low = raw(GROUND_COLOR);
  const moss = raw(WORLD_COLOR_MOSS);
  const rock = raw(WORLD_COLOR_ROCK);
  const h01 = Math.min(Math.max(h / WORLD_HILL_HEIGHT, 0), 1);
  if (h01 < 0.5) return mix3(low, moss, smooth01(0.06, 0.22, h01));
  return mix3(moss, rock, smooth01(0.5, 0.78, h01));
}

// Polar terrain grid: rings x sectors, displaced by terrainHeight.
// A polar grid (not a plane) keeps the world edge a clean CIRCLE and
// puts vertex density where the camera lives.
export function buildTerrainGeometry(seed = WORLD_SEED) {
  const RINGS = 44;
  const SECTORS = 96;
  const positions = [];
  const colors = [];
  const index = [];
  for (let i = 0; i <= RINGS; i++) {
    const r = (i / RINGS) * WORLD_RADIUS;
    for (let j = 0; j <= SECTORS; j++) {
      const th = (j / SECTORS) * Math.PI * 2;
      const x = Math.cos(th) * r;
      const z = Math.sin(th) * r;
      const y = terrainHeight(x, z, seed);
      positions.push(x, y, z);
      colors.push(...bandColor(y));
    }
  }
  const row = SECTORS + 1;
  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < SECTORS; j++) {
      const a = i * row + j;
      index.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(index);
  return geo;
}

// Merge already-baked parts (position + color only — MeshBasicMaterial
// never reads normals, and bakeTopLight consumed them during the bake).
// Hand-merged deliberately: no addon import, the import map stays
// untouched, and this module already builds geometry by hand.
function mergeBaked(parts) {
  const pos = [];
  const col = [];
  for (const g of parts) {
    pos.push(...g.getAttribute('position').array);
    col.push(...g.getAttribute('color').array);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

// The pine (the banked LAAS pattern, our idiom): trunk + three stacked
// crown cones, each part baked in its OWN two-tone (bark vs needles),
// merged into one geometry, instanced per class. Template ~1.35 tall.
function buildPineGeometry() {
  const BARK_D = 0x241d18;
  const BARK_L = 0x3a2f24;
  const NEEDLE_D = 0x18261f; // deeper green than the grass tufts, so pines READ as their own class
  const NEEDLE_L = 0x2e5040;
  const trunk = bakeTopLight(new THREE.CylinderGeometry(0.05, 0.075, 0.4, 6).translate(0, 0.2, 0), BARK_D, BARK_L);
  const c1 = bakeTopLight(new THREE.ConeGeometry(0.42, 0.55, 7).translate(0, 0.55, 0), NEEDLE_D, NEEDLE_L);
  const c2 = bakeTopLight(new THREE.ConeGeometry(0.3, 0.5, 7).translate(0, 0.85, 0), NEEDLE_D, NEEDLE_L);
  const c3 = bakeTopLight(new THREE.ConeGeometry(0.2, 0.45, 7).translate(0, 1.12, 0), NEEDLE_D, NEEDLE_L);
  return mergeBaked([trunk, c1, c2, c3]);
}

// Prop placements (pure, suite-anchored): everything at r >= PROP_MIN_R,
// strictly outside creature space, sitting ON the terrain.
export function propPlacements(seed = WORLD_SEED) {
  const rng = mulberry32((Math.imul(seed | 0, 0x9e3779b9) ^ 0x517cc1b7) >>> 0);
  const range = (lo, hi) => lo + (hi - lo) * rng();
  const place = (count, sMin, sMax) => {
    const out = [];
    for (let i = 0; i < count; i++) {
      const th = range(0, Math.PI * 2);
      const r = WORLD_PROP_MIN_R + Math.sqrt(rng()) * (WORLD_RADIUS - 0.5 - WORLD_PROP_MIN_R);
      const x = Math.cos(th) * r;
      const z = Math.sin(th) * r;
      out.push({ x, z, y: terrainHeight(x, z, seed), scale: range(sMin, sMax), rot: range(0, Math.PI * 2) });
    }
    return out;
  };
  const rocks = place(WORLD_ROCK_COUNT, 0.14, 0.38);
  const grass = place(WORLD_GRASS_COUNT, 0.08, 0.16);
  // PINES are terrain-AWARE (the banked scatter upgrade): each accepts
  // only a MID-SLOPE site, rejection-sampled against the same height
  // function with a deterministic cap — an exhausted pine is SKIPPED,
  // never mis-placed. Placed AFTER rocks/grass so their draws (and thus
  // the judged world) are byte-identical.
  const pines = [];
  for (let i = 0; i < WORLD_PINE_COUNT; i++) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const th = range(0, Math.PI * 2);
      const r = WORLD_PROP_MIN_R + Math.sqrt(rng()) * (WORLD_RADIUS - 0.5 - WORLD_PROP_MIN_R);
      const x = Math.cos(th) * r;
      const z = Math.sin(th) * r;
      const y = terrainHeight(x, z, seed);
      // ...AND clear of every placed pine (Poisson-style): overlapping
      // crowns merge into one inked silhouette — the blended-forest
      // read, browser-caught after the size arc grew crowns to ~1.0.
      const clear = pines.every((p) => Math.hypot(x - p.x, z - p.z) >= WORLD_PINE_SPACING);
      if (y >= WORLD_PINE_MIN_H && y <= WORLD_PINE_MAX_H && clear) {
        // scale 1.6-2.4 (second feel round — at ring distance a tree must
        // be DISPROPORTIONATELY tall to read taller than a foreground
        // creature): world heights ~2.1-4.1, median ~2.9, ~1.7x the
        // tallest creature after the perspective penalty. Same draw
        // count: every tree keeps its exact accepted site. Known trade:
        // the camera now occasionally passes behind a tree (peek-through
        // framing); the NEXT lever if that annoys is a dedicated pine
        // minimum radius, not more height.
        pines.push({ x, z, y, scale: range(1.6, 2.4), sy: range(0.95, 1.25), rot: range(0, Math.PI * 2) });
        break;
      }
    }
  }
  return { rocks, grass, pines };
}

// Bake a fake top-light into a prop geometry's vertex colors: unlit
// materials show no facets, so relief is painted in — mix(dark, light)
// by the LOCAL +Y normal. Instances rotate about Y only, so the baked
// light stays overhead for every instance.
function bakeTopLight(geo, darkHex, lightHex) {
  const g = geo.toNonIndexed(); // per-face verts: faceted two-tone, the low-poly read
  g.computeVertexNormals();
  const n = g.getAttribute('normal');
  const dark = raw(darkHex);
  const light = raw(lightHex);
  const colors = [];
  for (let i = 0; i < n.count; i++) {
    const t = Math.min(Math.max(n.getY(i) * 0.5 + 0.5, 0), 1);
    colors.push(...mix3(dark, light, t * t));
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return g;
}

// Assemble the world into the scene (browser side; everything above is
// Node-probeable). Static meshes, real CPU bounds — default culling is
// correct here, unlike the snap-shader creatures.
export function createWorld(scene) {
  const terrain = new THREE.Mesh(buildTerrainGeometry(WORLD_SEED), new THREE.MeshBasicMaterial({ vertexColors: true }));
  scene.add(terrain);

  const { rocks, grass, pines } = propPlacements(WORLD_SEED);
  const rockGeo = bakeTopLight(new THREE.IcosahedronGeometry(1, 0), 0x22252b, 0x3c414b);
  const rockMesh = new THREE.InstancedMesh(rockGeo, new THREE.MeshBasicMaterial({ vertexColors: true }), rocks.length);
  const grassGeo = bakeTopLight(new THREE.ConeGeometry(1, 1, 5), 0x1d3226, 0x2c4a38);
  grassGeo.translate(0, 0.5, 0); // cone base on the ground, not its midpoint
  const grassMesh = new THREE.InstancedMesh(grassGeo, new THREE.MeshBasicMaterial({ vertexColors: true }), grass.length);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);
  rocks.forEach((p, i) => {
    q.setFromAxisAngle(UP, p.rot);
    // Rocks squash to 70% height and sink a little — boulders sit IN
    // ground, they don't balance on it.
    m.compose(new THREE.Vector3(p.x, p.y - p.scale * 0.18, p.z), q, new THREE.Vector3(p.scale, p.scale * 0.7, p.scale));
    rockMesh.setMatrixAt(i, m);
  });
  grass.forEach((p, i) => {
    q.setFromAxisAngle(UP, p.rot);
    m.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.scale * 0.5, p.scale * rangeless(p.rot), p.scale * 0.5));
    grassMesh.setMatrixAt(i, m);
  });
  const pineMesh = new THREE.InstancedMesh(buildPineGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true }), Math.max(pines.length, 1));
  pines.forEach((p, i) => {
    q.setFromAxisAngle(UP, p.rot);
    // Trunks bed 0.05*scale into the slope — trees grow FROM ground.
    m.compose(new THREE.Vector3(p.x, p.y - p.scale * 0.05, p.z), q, new THREE.Vector3(p.scale, p.scale * p.sy, p.scale));
    pineMesh.setMatrixAt(i, m);
  });
  pineMesh.count = pines.length; // rejection sampling may land fewer than the budget
  scene.add(rockMesh);
  scene.add(grassMesh);
  scene.add(pineMesh);
}

// Grass height varies with the (already-seeded) rotation draw instead of
// spending another stream draw: deterministic, and tufts read less uniform.
function rangeless(rot) {
  return 1.6 + 1.2 * (0.5 + 0.5 * Math.sin(rot * 7.3));
}
