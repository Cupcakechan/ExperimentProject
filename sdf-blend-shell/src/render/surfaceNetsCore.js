// surfaceNetsCore.js — the SDF field mirror + Surface Nets meshers + the
// creature bake, with NO THREE dependency. Split out of surfaceNets.js so
// a Web Worker can import it directly: module workers don't inherit the
// page's import map, so anything the worker touches must be THREE-free.
// surfaceNets.js re-exports these and adds the THREE.BufferGeometry wrapper
// for the main thread. ONE mesher, two callers — no drift.
//
// TWO extraction paths, ONE output:
//   surfaceNetsMesh        — naive full grid. Samples every lattice point,
//                            scans every cell. The REFERENCE implementation.
//   surfaceNetsMeshNarrow  — narrow-band surface-following (the animation
//                            optimization). MEASURED: only ~3.4% of cells
//                            straddle the surface; the full grid spends
//                            ~96% of its time sampling empty air and solid
//                            interior. This path seeds on the surface and
//                            flood-fills ALONG it, sampling only the cells
//                            the surface actually passes through — on the
//                            SAME grid, with the SAME field math, emitting
//                            the SAME vertices and quads. The suite proves
//                            the two paths produce IDENTICAL meshes.
// meshCreature defaults to the narrow path; opts.method 'full' keeps the
// reference reachable (and is the automatic fallback if seeding fails).

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

// Flatten prims to typed arrays for the narrow path's inlined field: same
// values, same fold ORDER as createCreatureField (solids in prim order,
// then carves in prim order), so every sample is the identical double —
// stored to the same Float32Array — as the reference path produces.
function flattenPrims(prims, blendK) {
  const solids = prims.filter((p) => !p.paint && !p.negative);
  const carves = prims.filter((p) => p.negative);
  const pack = (list) => {
    const F = new Float64Array(list.length * 8);
    list.forEach((p, m) => {
      const b = p.b ?? p.a;
      const o = m * 8;
      F[o] = p.a[0]; F[o + 1] = p.a[1]; F[o + 2] = p.a[2];
      F[o + 3] = b[0]; F[o + 4] = b[1]; F[o + 5] = b[2];
      F[o + 6] = p.r; F[o + 7] = primK(p, blendK);
    });
    return F;
  };
  return { S: pack(solids), nSol: solids.length, C: pack(carves), nCar: carves.length };
}

// --- Naive Surface Nets (two passes; watertight closed manifold) --------
// The REFERENCE implementation — every claim about the narrow path is
// "identical to this", enforced by the suite.

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

// --- Narrow-band Surface Nets (the animation-speed path) ----------------
// Same grid, same field, same output — different TRAVERSAL. Seeds a cell
// on the surface (walking a lattice row out of each solid's interior),
// then flood-fills cell-to-cell through MIXED-SIGN FACES only. A cell the
// surface passes through always exits through at least one face whose
// four corners change sign, and the neighbor across that face straddles
// too — so the flood visits exactly the straddling cells of each surface
// component and never wades into empty air or solid interior.
//
// Correctness notes (why the output is IDENTICAL, suite-enforced):
// - Lattice values are computed by the same math and stored through the
//   same Float32 rounding, so every corner classifies identically.
// - Vertices use the reference's exact mass-point expression per cell.
// - Every sign-changing lattice edge is "owned" by the cell at its max
//   corner (the reference's quad loop indexes cells the same way); that
//   owner straddles, so iterating owned edges of visited cells emits
//   exactly the reference's quads, same winding.
// - Multi-seed (one per solid) covers hypothetical multi-component
//   fields; if no seed is found the caller falls back to the full grid.
export function surfaceNetsMeshNarrow(ns, bounds, prims, { inflate = 0, blendK = 0.25 } = {}, flip = false) {
  const [nx, ny, nz] = ns;
  const [lo, hi] = bounds;
  const dx = (hi[0] - lo[0]) / (nx - 1);
  const dy = (hi[1] - lo[1]) / (ny - 1);
  const dz = (hi[2] - lo[2]) / (nz - 1);
  const lo0 = lo[0], lo1 = lo[1], lo2 = lo[2];

  const { S, nSol, C, nCar } = flattenPrims(prims, blendK);

  // Inlined field — identical ops and order to createCreatureField.
  const fieldAt = (x, y, z) => {
    let d = 1e9;
    for (let m = 0; m < nSol; m++) {
      const o = m * 8;
      const ax = S[o], ay = S[o + 1], az = S[o + 2];
      const bax = S[o + 3] - ax, bay = S[o + 4] - ay, baz = S[o + 5] - az;
      const pax = x - ax, pay = y - ay, paz = z - az;
      const baLen2 = bax * bax + bay * bay + baz * baz;
      let h = (pax * bax + pay * bay + paz * baz) / Math.max(baLen2, 1e-8);
      h = h < 0 ? 0 : h > 1 ? 1 : h;
      const qx = pax - bax * h, qy = pay - bay * h, qz = paz - baz * h;
      const dist = Math.sqrt(qx * qx + qy * qy + qz * qz) - S[o + 6];
      const k = S[o + 7];
      const hs = Math.max(k - Math.abs(d - dist), 0) / k;
      d = Math.min(d, dist) - hs * hs * hs * k * (1 / 6);
    }
    for (let m = 0; m < nCar; m++) {
      const o = m * 8;
      const ax = C[o], ay = C[o + 1], az = C[o + 2];
      const bax = C[o + 3] - ax, bay = C[o + 4] - ay, baz = C[o + 5] - az;
      const pax = x - ax, pay = y - ay, paz = z - az;
      const baLen2 = bax * bax + bay * bay + baz * baz;
      let h = (pax * bax + pay * bay + paz * baz) / Math.max(baLen2, 1e-8);
      h = h < 0 ? 0 : h > 1 ? 1 : h;
      const qx = pax - bax * h, qy = pay - bay * h, qz = paz - baz * h;
      const dist = Math.sqrt(qx * qx + qy * qy + qz * qz) - C[o + 6];
      const k = C[o + 7];
      let hc = 0.5 - 0.5 * (dist + d) / k;
      hc = hc < 0 ? 0 : hc > 1 ? 1 : hc;
      d = d * (1 - hc) + (-dist) * hc + k * hc * (1 - hc);
    }
    return d - inflate;
  };

  // Lazy lattice sampling: value cache + seen flags. Same Float32 storage
  // as the reference's V, so classifications match bit-for-bit.
  const V = new Float32Array(nx * ny * nz);
  const seen = new Uint8Array(nx * ny * nz);
  const sample = (i, j, k) => {
    const idx = i + nx * (j + ny * k);
    if (!seen[idx]) {
      V[idx] = fieldAt(lo0 + i * dx, lo1 + j * dy, lo2 + k * dz);
      seen[idx] = 1;
    }
    return V[idx];
  };

  const cnx = nx - 1, cny = ny - 1, cnz = nz - 1;
  const cIdx = (i, j, k) => i + cnx * (j + cny * k);

  // Mask of a cell from its 8 corners (samples on demand).
  const cellMask = (i, j, k) => {
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      const off = CORNERS[c];
      if (sample(i + off[0], j + off[1], k + off[2]) < 0) mask |= 1 << c;
    }
    return mask;
  };

  // --- seeds: for each solid, walk the lattice row through its interior
  // until a sign flip, then take a straddling cell around that edge.
  const visited = new Uint8Array(cnx * cny * cnz);
  let queue = new Int32Array(4096);
  let qLen = 0;
  const enqueue = (ci, cj, ck) => {
    const idx = cIdx(ci, cj, ck);
    if (visited[idx]) return;
    visited[idx] = 1;
    if (qLen === queue.length) {
      const bigger = new Int32Array(queue.length * 2);
      bigger.set(queue);
      queue = bigger;
    }
    queue[qLen++] = idx;
  };
  const clampI = (v, max) => (v < 0 ? 0 : v > max ? max : v);
  for (let m = 0; m < nSol; m++) {
    const o = m * 8;
    if (fieldAt(S[o], S[o + 1], S[o + 2]) >= 0) continue; // endpoint not interior (carved away) — try next
    const j0 = clampI(Math.floor((S[o + 1] - lo1) / dy), ny - 1);
    const k0 = clampI(Math.floor((S[o + 2] - lo2) / dz), nz - 1);
    // Scan the whole row: it passes through this solid's interior, so it
    // holds at least one sign flip unless the feature slips between
    // lattice points (in which case the full grid misses it identically).
    let prev = sample(0, j0, k0);
    for (let i = 0; i < nx - 1; i++) {
      const next = sample(i + 1, j0, k0);
      if ((prev < 0) !== (next < 0)) {
        // Mixed x-edge at lattice (i, j0, k0): its adjacent cells straddle.
        for (const cj of [j0 - 1, j0]) {
          for (const ck of [k0 - 1, k0]) {
            if (cj < 0 || ck < 0 || cj >= cny || ck >= cnz) continue;
            const msk = cellMask(i, cj, ck);
            if (msk !== 0 && msk !== 255) enqueue(i, cj, ck);
          }
        }
        break; // one seed per solid is enough; the flood does the rest
      }
      prev = next;
    }
  }

  // No seed at all (nothing interior on any row) — surrender to the
  // reference full grid rather than return a wrong (empty) mesh.
  if (qLen === 0) {
    const fb = surfaceNetsMesh(ns, bounds, createCreatureField(prims, { inflate, blendK }), flip);
    return { ...fb, usedMethod: 'full-fallback' };
  }

  // --- flood along the surface through mixed-sign faces.
  // Face corner-bit sets, indexed [-x, +x, -y, +y, -z, +z]:
  const FACE_BITS = [0x99, 0x66, 0x33, 0xcc, 0x0f, 0xf0];
  let head = 0;
  while (head < qLen) {
    const cell = queue[head];
    const ci = cell % cnx;
    const t = (cell - ci) / cnx;
    const cj = t % cny;
    const ck = (t - cj) / cny;
    const mask = cellMask(ci, cj, ck); // corners cached; cheap
    head++;
    // Mixed face => the neighbor across it straddles: enqueue it.
    let f = mask & FACE_BITS[0];
    if (f !== 0 && f !== FACE_BITS[0] && ci > 0) enqueue(ci - 1, cj, ck);
    f = mask & FACE_BITS[1];
    if (f !== 0 && f !== FACE_BITS[1] && ci < cnx - 1) enqueue(ci + 1, cj, ck);
    f = mask & FACE_BITS[2];
    if (f !== 0 && f !== FACE_BITS[2] && cj > 0) enqueue(ci, cj - 1, ck);
    f = mask & FACE_BITS[3];
    if (f !== 0 && f !== FACE_BITS[3] && cj < cny - 1) enqueue(ci, cj + 1, ck);
    f = mask & FACE_BITS[4];
    if (f !== 0 && f !== FACE_BITS[4] && ck > 0) enqueue(ci, cj, ck - 1);
    f = mask & FACE_BITS[5];
    if (f !== 0 && f !== FACE_BITS[5] && ck < cnz - 1) enqueue(ci, cj, ck + 1);
  }

  // --- vertices: exact reference mass-point per visited cell, BFS order.
  const cellVert = new Int32Array(cnx * cny * cnz).fill(-1);
  const positions = new Float32Array(qLen * 3);
  const cv = new Float32Array(8);
  for (let n = 0; n < qLen; n++) {
    const cell = queue[n];
    const i = cell % cnx;
    const t = (cell - i) / cnx;
    const j = t % cny;
    const k = (t - j) / cny;
    for (let c = 0; c < 8; c++) {
      const off = CORNERS[c];
      cv[c] = V[(i + off[0]) + nx * ((j + off[1]) + ny * (k + off[2]))];
    }
    let sx = 0, sy = 0, sz = 0, cnt = 0;
    for (let e = 0; e < 12; e++) {
      const a = EDGES[e][0], b = EDGES[e][1];
      const va = cv[a], vb = cv[b];
      if ((va < 0) === (vb < 0)) continue;
      const tt = va / (va - vb);
      const ca = CORNERS[a], cb = CORNERS[b];
      sx += ca[0] + tt * (cb[0] - ca[0]);
      sy += ca[1] + tt * (cb[1] - ca[1]);
      sz += ca[2] + tt * (cb[2] - ca[2]);
      cnt++;
    }
    cellVert[cell] = n;
    positions[n * 3] = lo0 + (i + sx / cnt) * dx;
    positions[n * 3 + 1] = lo1 + (j + sy / cnt) * dy;
    positions[n * 3 + 2] = lo2 + (k + sz / cnt) * dz;
  }

  // --- quads: each visited cell owns the three lattice edges leaving its
  // min corner; a sign change there emits the reference's exact quad.
  const indices = new Uint32Array(qLen * 18); // worst case: 3 edges * 2 tris * 3
  let ni = 0;
  const sIdxN = (i, j, k) => i + nx * (j + ny * k);
  const quad = (a, b, c, d, rev) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (rev) {
      indices[ni++] = a; indices[ni++] = c; indices[ni++] = b;
      indices[ni++] = a; indices[ni++] = d; indices[ni++] = c;
    } else {
      indices[ni++] = a; indices[ni++] = b; indices[ni++] = c;
      indices[ni++] = a; indices[ni++] = c; indices[ni++] = d;
    }
  };
  for (let n = 0; n < qLen; n++) {
    const cell = queue[n];
    const i = cell % cnx;
    const t = (cell - i) / cnx;
    const j = t % cny;
    const k = (t - j) / cny;
    const v0 = V[sIdxN(i, j, k)];
    const in0 = v0 < 0;
    if (i < nx - 1 && j >= 1 && k >= 1) {
      if (in0 !== (V[sIdxN(i + 1, j, k)] < 0)) {
        quad(cellVert[cIdx(i, j - 1, k - 1)], cellVert[cIdx(i, j, k - 1)],
          cellVert[cIdx(i, j, k)], cellVert[cIdx(i, j - 1, k)], in0 === flip);
      }
    }
    if (j < ny - 1 && i >= 1 && k >= 1) {
      if (in0 !== (V[sIdxN(i, j + 1, k)] < 0)) {
        quad(cellVert[cIdx(i - 1, j, k - 1)], cellVert[cIdx(i, j, k - 1)],
          cellVert[cIdx(i, j, k)], cellVert[cIdx(i - 1, j, k)], in0 !== flip);
      }
    }
    if (k < nz - 1 && i >= 1 && j >= 1) {
      if (in0 !== (V[sIdxN(i, j, k + 1)] < 0)) {
        quad(cellVert[cIdx(i - 1, j - 1, k)], cellVert[cIdx(i, j - 1, k)],
          cellVert[cIdx(i, j, k)], cellVert[cIdx(i - 1, j, k)], in0 === flip);
      }
    }
  }

  return { positions, indices: indices.slice(0, ni), usedMethod: 'narrow' };
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
  const { cellSize = 0.015, padding = 0.06, inflate = 0, blendK = 0.25, flip = false, method = 'narrow' } = opts;
  // Padding must contain the smin INFLATION, which grows with k (MEASURED
  // ~k*0.25); a fixed pad clips the plumped surface into a hole at high k.
  const pad = Math.max(padding, cellSize * 2, blendK * 0.3);
  const bounds = creatureBounds(prims, inflate, pad);
  const ns = [0, 1, 2].map((ax) => Math.max(4, Math.ceil((bounds[1][ax] - bounds[0][ax]) / cellSize) + 1));
  const res = method === 'full'
    ? { ...surfaceNetsMesh(ns, bounds, createCreatureField(prims, { inflate, blendK }), flip), usedMethod: 'full' }
    : surfaceNetsMeshNarrow(ns, bounds, prims, { inflate, blendK }, flip);
  // usedMethod makes a silent fallback OBSERVABLE: the suite asserts the
  // narrow route actually ran for the cast (a fallback that fires quietly
  // is an optimization that died without anyone noticing — it did, once).
  return { positions: res.positions, indices: res.indices, ns, bounds, vertexCount: res.positions.length / 3, triCount: res.indices.length / 3, usedMethod: res.usedMethod };
}
