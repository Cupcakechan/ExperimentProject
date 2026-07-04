# REFERENCE_FOGLEMAN.md — verified operator formulas from fogleman/sdf

Source: https://github.com/fogleman/sdf — `sdf/dn.py` (operators) and `sdf/d3.py`
(primitives), read verbatim on 2026-07-03. This note exists because Claude's
session environment resets: these are the exact formulas the roadmap passes
build on, so no future session re-derives them from memory.

All formulas below are written in GLSL-ready scalar form (their numpy code is a
direct transliteration). `d1` = accumulated field, `d2` = incoming primitive.

## Confirmed identical to our shipped code (no action)

- **Capsule SDF** (`d3.py capsule`): same clamp-projection form as our
  `sdCapsule` — independent confirmation.
- **Smooth union** (`dn.py union`): exactly our `smin`:
  `h = clamp(0.5 + 0.5*(d2 - d1)/k, 0, 1); mix(d2, d1, h) - k*h*(1-h)`.
- **Per-operand k, folded sequentially**: their `_k` attaches to the operand
  and the union folds one prim at a time — structurally identical to our
  `mapSDF` loop with per-prim `kCap`. Our architecture matches the reference.

## Pass 4 — smooth difference (negative prims / carving)

`difference(d1, d2, k)` — subtract shape 2 from shape 1:

    hard:   d = max(d1, -d2)
    smooth: h = clamp(0.5 - 0.5*(d2 + d1)/k, 0.0, 1.0);
            d = mix(d1, -d2, h) + k*h*(1.0 - h);

Note the TWO sign flips vs smin: `(d2 + d1)` inside h (not `d2 - d1`), and the
correction term is ADDED (carving pushes the surface outward-of-the-cut, the
mirror of union's inward deficit). `intersection` (unused for now) is the same
shape with `(d2 - d1)` and `+k*h*(1-h)`.

Known caveats (from our own lessons, restated for the pass):
- Difference worsens field inexactness — snap loop, decals, and outline must be
  re-audited (the field inspector is the measuring tool).
- A carved concavity needs donor-mesh vertices THERE to snap into it (the
  detached-legs lesson: fillets need vertices).

## Pass 3 — dilate / erode (plumpness)

    dilate(d, r) = d - r      // fatter everywhere
    erode(d, r)  = d + r      // thinner everywhere

Trivial, but it moves the skin every consumer rides (decals, outline, tuck) —
which is why it gets its own pass with probes, not a fold-in.

## Pass 5 (shelf) — blend (field morphing)

    blend(d1, d2, t) = mix(d1, d2, t)   // t=0 -> shape 1, t=1 -> shape 2

Linear interpolation of the FIELDS, not the surfaces — creature-to-creature
morphing for one mix per sample. Blended fields are inexact SDFs (same caveat
class as difference).

## Noted, not on the roadmap

- `shell(d, t) = abs(d) - t/2` — hollow shells; no current use.
- `twist`/`bend`/`elongate` domain warps — PARKED: warped fields break the
  Lipschitz-1 assumption our raw snap step `p -= n*d` relies on (overshoot);
  extra capsules are cheaper than a damped snap loop.
- `repeat` — domain repetition; irrelevant to single creatures.
- Their meshing engine (grid sampling + marching cubes, offline) — the inverse
  of our pipeline (live mesh chasing a moving field); nothing portable.

## The transferable meta-lesson

Their README's recurring warning — inexact SDFs break downstream consumers
(bounds estimation, sparse batch skipping -> holes) — is the same defect class
as our k=0.6 vanishing-decals bug. Rule: every consumer of the field (snap,
decals, outline, tuck, anything new) must be audited against "d is not a true
distance", because smin GUARANTEES the field lies near joins. The field
inspector (Pass 1) exists to measure that lie instead of assuming its size.
