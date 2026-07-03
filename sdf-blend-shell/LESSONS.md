# LESSONS.md — error record (feeds the dev-method)

## 2026-07-03 — backtick inside a GLSL template literal
- What broke / what happened: a backtick in a shader comment terminated the JS
  template literal early; the module failed to parse.
- Root cause: GLSL lives inside JS template literals, so ANY backtick in shader
  code/comments ends the string.
- Verification gap it exposed: none new — the committed module-import suite
  caught it pre-delivery, exactly as designed. `node --check` alone also caught
  it here, but only by luck of where the terminated string landed.
- Plug shipped: comment convention ("no backticks in GLSL literals") noted in
  blendMaterial.js + handoff gotchas; suite remains the guard.
- Route: skill reference candidate (html-game.md — template-literal DSLs).

## 2026-07-03 — .gitignore copied with leading spaces
- What broke / what happened: `package.json` / `package-lock.json` were
  committed despite being listed in .gitignore.
- Root cause: the .gitignore content was presented in an INDENTED chat code
  block; copy-paste carried three leading spaces into every line, and git
  treats leading whitespace as part of the pattern — only the flush-left first
  line (`node_modules/`) matched.
- Verification gap it exposed: no post-setup check that ignored files are
  actually ignored (`git status` review was specified but the indent survived
  it unnoticed).
- Plug shipped: corrected flush-left .gitignore files at both levels +
  `git rm --cached` for the two committed files; lesson: deliver
  copy-paste file content flush-left (or as downloadable files), never
  inside indented list blocks.
- Route: GI candidate (delivery formatting rule).

## 2026-07-03 — legs detached: CapsuleGeometry has no length subdivisions
- What broke / what happened: the critter's legs met the belly with a hard
  boundary — no fillet — while tail/head (joining near end caps) blended fine.
- Root cause: a snapped shell can only express fillets where vertices exist;
  three r170 CapsuleGeometry's cylindrical wall has ZERO interior rings
  (MEASURED empirically against node_modules source), so the belly had no
  vertices to bend toward the legs.
- Verification gap it exposed: no probe tied mesh density to the technique's
  core requirement (fillets need vertices).
- Plug shipped: custom cylinder+hemispheres capsule builder with
  CAPSULE_RINGS_PER_UNIT (config) + suite probe asserting interior belly rings.
- Route: project-only (three-version-specific measured fact; the general rule
  "the artifact wins — measure it" already lives in the skill).

## 2026-07-03 — saved setup snippet kept re-creating a nested git repo
- What broke / what happened: a nested `.git` reappeared inside the project
  subfolder; VS Code showed two repositories, terminal and UI disagreed, and
  two commits landed in the wrong (inner) repo.
- Root cause: delivered instructions bundled a ONE-TIME setup command
  (`git init`) with a REPEATABLE command (`node test_suite.mjs`) in one block;
  Daniel saved the block and re-ran all of it later — as saved snippets get
  re-run.
- Verification gap it exposed: none automatable in-repo; the guard is a
  delivery rule.
- Plug shipped: nested repo confirmed stale (2 duplicate commits) and deleted;
  snippet retired; rule: never ship run-once and run-every-time commands in
  the same block — label lifecycle explicitly.
- Route: GI candidate (delivery formatting rule).
