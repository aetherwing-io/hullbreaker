PASS

# T-015 playtest gate — codex asset pipeline (`tools/assets/`)

- Worktree: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-015`
  (branch `task/T-015`, HEAD `28b8ba2`), clean tree.
- Gate run: 2026-07-31, playtester agent.

## 1. Pipeline verification (all inside the worktree, all exit 0)

```sh
node tools/assets/check.mjs --selftest
# selftest PASS — 23 palette cases (14 must-pass, 9 must-fail); exit 0

node tools/assets/check.mjs
# PASS — palette 8/8 roles, selftest re-run inline, manifest 1 asset
# (capsule-letter-h 128x128 PoT, palette recomputed: hot-magenta 83% /
# ink 15% / warm-white 2%), "src/ contains no reference to assets/ at
# all"; exit 0

node tools/assets/rasterize.mjs assets/generated/glyphs/capsule-letter-h.svg --size 128 --out <scratch>
# 128x128, 0.8kB, 8 unique colors, palette ok; exit 0.
# The fresh PNG is BYTE-IDENTICAL (cmp) to the committed
# assets/generated/glyphs/capsule-letter-h.png — the demo round-trip
# reproduces exactly on this machine/Chrome (README limitation 5 notes
# byte-identity is not promised across Chrome builds; on the same build
# it held).

node tools/assets/view.mjs assets/generated/glyphs/capsule-letter-h.png --tiles 0.55 --out <scratch>
# view=far (RIG 3.7% of 800px), asset 9.6px beside a 29.6px RIG bar; exit 0
```

Bonus check, not required by the task: `node tools/pathcheck.mjs` in the
worktree — **620 passed, 0 failed** with every T-015 file present, matching
the README's claim.

## 2. Game-unaffected proof

Served the worktree (`python3 -m http.server 8786`, killed after) and ran
the MAIN checkout's harness against it:

```sh
cd /Users/scottmeyer/projects/hullbreaker/tools/playtest
node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000 \
  --base-url http://127.0.0.1:8786 --out runs/gate-T-015-mid
```

- Outcome **completed**, fidelity testapi, no bootError, `consoleErrors: []`,
  `pageErrors: []`. No retry needed.
- Metrics in family with the deterministic baseline: minEdgeMargin **35.42**
  tiles (baseline 35.44), idle fraction **0.024**, protoScore 82.1 (proxy,
  README caveat applies), victory in one attempt.
- Evidence: `tools/playtest/runs/gate-T-015-mid/report.json` + `summary.md`.
- Diff-scope confirmation (`git diff --stat main...HEAD`): 20 files, all
  under `tools/assets/` and `assets/` (+2 gitignored spec files under
  `tools/assets/runs/`). `src/`, `index.html`, `tools/pathcheck.mjs`,
  `tools/playtest/` untouched. `assets/manifest.json` gained one entry;
  grep confirms no game code (`src/`, `index.html`, pathcheck) references
  the manifest or `assets/` at all, so the game cannot see the change —
  and the completed bot run proves it boots and plays with all of it
  present.

## 3. Screenshot judgment (actually looked)

`tools/assets/reports/demo/capsule-letter-h/viewer-far.png` (committed) and
a freshly generated copy are visually identical, and show exactly what the
builder claims: the magenta capsule glyph at its true in-game FAR size
(9.6px) beside a RIG-height reference bar (labeled 30px, i.e. 29.6 rounded),
with a 2x/4x/8x/native ramp and the honest footer "flat composite ... no
fog, perspective, lighting or mipmapping". Scale arithmetic cross-checked
against `src/config.js`: 0.037 x 800 x 0.55 / 1.7 = 9.58px — the tool's
number is the game's own. At 9.6px the chamfers and all four rivets are
gone and the ink H is an unreadable dark fleck — the README/manifest/SPRINT
readability finding is truthful, correctly framed as operator evidence
(checkpoint-queue entry already present in SPRINT.md), not resolved by the
machine. No style break: the demo asset uses shades of one role plus
neutrals per the measured palette table.

## 4. Adversarial poke at the gate itself

Built a corrupted fixture tree in scratch (off-palette pure-blue SVG, lying
manifest size, missing palette block, static `import` of an asset in
`src/`) and ran `check.mjs --root <fixture>`: **5 distinct problems, exit
1**. The gate demonstrably rejects, so a green check is meaningful — the
selftest also runs on every invocation as documented. One cosmetic mislabel
found on the failure path (filed as I-002 in SPRINT Inbox, S3): static
imports are correctly raised as errors but are *also* listed under the info
header "game references to assets/ (runtime, not imports)".

## Acceptance vs verdict

- check.mjs validates manifest + palette + PoT: **yes** (and selftest 23).
- Rasterizer round-trips the demo SVG; viewer screenshot works: **yes**
  (byte-identical PNG; both exit 0).
- Zero effect on the shipped game; dev-deps only under tools/: **yes**
  (diff scope + pathcheck green + completed bot run against the worktree;
  `tools/assets/package.json` is dev-only and resolves tools/playtest's
  existing playwright-core, no new install).
- README honesty section: **yes** — 10 numbered items, including the
  coverage-gate escape hatch (small off-palette accents can pass) and
  "a green palette check is not an art verdict".

Not judged here, per doctrine: whether the glyph direction is *good* — that
is the operator's call via the queued "Glyph scale at FAR" checkpoint.
