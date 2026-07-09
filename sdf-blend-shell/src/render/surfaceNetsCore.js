// surfaceNetsCore.js — the SDF field mirror + naive Surface Nets + the
// creature bake, with NO THREE dependency. Split out of surfaceNets.js so
// a Web Worker can import it directly: module workers don't inherit the
// page's import map, so anything the worker touches must be THREE-free.
// surfaceNets.js re-exports these and adds the THREE.BufferGeometry wrapper
// for the main thread; the worker calls meshCreature and ships the raw
// typed arrays back. ONE mesher, two callers — no drift.

// --- SDF field (mirror of blendMaterial's FIELD_GLSL) -----------------

function sdCapsule(px, py, pz, a, b, r) {
  const ax = a[0], ay = a[1], az = a[2];
  const bax = b[0] - ax, bay = b[1] - ay, baz = b[2] - az;
  const pax = px - ax, pay = py - ay, paz = pz - az;
  const baLen2 = bax * bax + bay * bay + baz * baz;
  let h = (pax * bax + pay * bay + paz * baz) / Math.max(baLen2, 1e-8);
  h = h < 0 ? 0 : h > 1 ? 1 : h;
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}

// CUBIC smin (R2, C2): influence ends exactly at |a-b| = k, deficit k/6.
function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * h * k * (1 / 6);
}

// Smooth-difference (carving) — matches the GLSL sdiff.
function sdiff(d1, d2, k) {
  let h = 0.5 - 0.5 * (d2 + d1) / k;
  h = h < 0 ? 0 : h > 1 ? 1 : h;
  return d1 * (1 - h) + (-d2) * h + k * h * (1 - h);
}

// Blend radius, authoring-priority order: absolute kPrim (if > 0) beats the
// slider; kCap is a ceiling over either.
function primK(prim, uK) {
  const base = prim.kPrim && prim.kPrim > 0 ? prim.kPrim : uK;
  const cap = prim.kCap ?? Infinity;
  return Math.min(base, cap);
}

// The whole-creature field: smooth-union the solids, THEN smooth-subtract
// the negatives from the finished union, then dilate (mirror of mapSDF).
export function createCreatureField(prims, { inflate = 0, blendK = 0.25 } = {}) {
  const solids = prims.filter((p) => !p.paint && !p.negative);
  const carves = prims.filter((p) => p.negative);
  return (x, y, z) => {
    let d = 1e9;
    for (const p of solids) d = smin(d, sdCapsule(x, y, z, p.a, p.b ?? p.a, p.r), primK(p, blendK));
    for (const p of carves) d = sdiff(d, sdCapsule(x, y, z, p.a, p.b ?? p.a, p.r), primK(p, blendK));
    return d - inflate;
  };
}

// --- Naive Surface Nets (two passes; watertight closed manifold) --------

const CORNERS = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
];
const EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

export function surfaceNetsMesh(ns, bounds, field, flip = false) {
  const [nx, ny, nz] = ns;
  const [lo, hi] = bounds;
  const dx = (hi[0] - lo[0]) / (nx - 1);
  const dy = (hi[1] - lo[1]) / (ny - 1);
  const dz = (hi[2] - lo[2]) / (nz - 1);

  const V = new Float32Array(nx * ny * nz);
  const sIdx = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) {
    const wz = lo[2] + k * dz;
    for (let j = 0; j < ny; j++) {
      const wy = lo[1] + j * dy;
      for (let i = 0; i < nx; i++) V[sIdx(i, j, k)] = field(lo[0] + i * dx, wy, wz);
    }
  }

  const cnx = nx - 1, cny = ny - 1, cnz = nz - 1;
  const cellVert = new Int32Array(cnx * cny * cnz).fill(-1);
  const cIdx = (i, j, k) => i + cnx * (j + cny * k);
  const positions = [];
  const cv = new Float32Array(8);
  for (let k = 0; k < cnz; k++) {
    for (let j = 0; j < cny; j++) {
      for (let i = 0; i < cnx; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const off = CORNERS[c];
          const val = V[sIdx(i + off[0], j + off[1], k + off[2])];
          cv[c] = val;
          if (val < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, cnt = 0;
        for (let e = 0; e < 12; e++) {
          const a = EDGES[e][0], b = EDGES[e][1];
          const va = cv[a], vb = cv[b];
          if ((va < 0) === (vb < 0)) continue;
          const t = va / (va - vb);
          const ca = CORNERS[a], cb = CORNERS[b];
          sx += ca[0] + t * (cb[0] - ca[0]);
          sy += ca[1] + t * (cb[1] - ca[1]);
          sz += ca[2] + t * (cb[2] - ca[2]);
          cnt++;
        }
        cellVert[cIdx(i, j, k)] = positions.length / 3;
        positions.push(
          lo[0] + (i + sx / cnt) * dx,
          lo[1] + (j + sy / cnt) * dy,
          lo[2] + (k + sz / cnt) * dz,
        );
      }
    }
  }

  const indices = [];
  const quad = (a, b, c, d, rev) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (rev) indices.push(a, c, b, a, d, c);
    else indices.push(a, b, c, a, c, d);
  };
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const v0 = V[sIdx(i, j, k)];
        const in0 = v0 < 0;
        if (i < nx - 1 && j >= 1 && k >= 1) {
          if (in0 !== (V[sIdx(i + 1, j, k)] < 0)) {
            quad(cellVert[cIdx(i, j - 1, k - 1)], cellVert[cIdx(i, j, k - 1)],
              cellVert[cIdx(i, j, k)], cellVert[cIdx(i, j - 1, k)], in0 === flip);
          }
        }
        if (j < ny - 1 && i >= 1 && k >= 1) {
          if (in0 !== (V[sIdx(i, j + 1, k)] < 0)) {
            quad(cellVert[cIdx(i - 1, j, k - 1)], cellVert[cIdx(i, j, k - 1)],
              cellVert[cIdx(i, j, k)], cellVert[cIdx(i - 1, j, k)], in0 !== flip);
          }
        }
        if (k < nz - 1 && i >= 1 && j >= 1) {
          if (in0 !== (V[sIdx(i, j, k + 1)] < 0)) {
            quad(cellVert[cIdx(i - 1, j - 1, k)], cellVert[cIdx(i, j - 1, k)],
              cellVert[cIdx(i, j, k)], cellVert[cIdx(i - 1, j, k)], in0 === flip);
          }
        }
      }
    }
  }

  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

export function creatureBounds(prims, inflate, pad) {
  let lo = [Infinity, Infinity, Infinity];
  let hi = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) {
    if (p.paint || p.negative) continue;
    for (const e of [p.a, p.b ?? p.a]) {
      for (let ax = 0; ax < 3; ax++) {
        lo[ax] = Math.min(lo[ax], e[ax] - p.r - inflate - pad);
        hi[ax] = Math.max(hi[ax], e[ax] + p.r + inflate + pad);
      }
    }
  }
  return [lo, hi];
}

// Bake a creature's field to raw typed arrays (positions + indices) plus
// metadata. THREE-free, so the worker returns straight from here; the main
// thread wraps it in a BufferGeometry (surfaceNets.js).
export function meshCreature(prims, opts = {}) {
  const { cellSize = 0.015, padding = 0.06, inflate = 0, blendK = 0.25, flip = false } = opts;
  // Padding must contain the smin INFLATION, which grows with k (MEASURED
  // ~k*0.25); a fixed pad clips the plumped surface into a hole at high k.
  const pad = Math.max(padding, cellSize * 2, blendK * 0.3);
  const bounds = creatureBounds(prims, inflate, pad);
  const ns = [0, 1, 2].map((ax) => Math.max(4, Math.ceil((bounds[1][ax] - bounds[0][ax]) / cellSize) + 1));
  const field = createCreatureField(prims, { inflate, blendK });
  const { positions, indices } = surfaceNetsMesh(ns, bounds, field, flip);
  return { positions, indices, ns, bounds, vertexCount: positions.length / 3, triCount: indices.length / 3 };
}
