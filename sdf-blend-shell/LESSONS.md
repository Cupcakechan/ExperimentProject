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
