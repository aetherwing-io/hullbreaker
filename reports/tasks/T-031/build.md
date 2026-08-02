# T-031 — the docs-truth backlog (I-001, I-002, I-015, I-016, I-017, I-021, I-027)

Worktree `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-031`,
branch `task/T-031`, based on `ebd71eb`. Docs/tooling only — **no file under
`src/` was touched**, and none of the files I edited differ between my base and
`main` (`git diff --stat ebd71eb main -- README.md docs/DESIGN.md
tools/assets/ tools/playtest/palette-capture.mjs tools/playtest/scripts/` is
empty), so nothing here inherits or fights a merged lane's change.

Scoreboard: **2 already fixed** (I-001, I-002), **3 fixed here** (I-015, I-021,
I-017), **1 fixed in the only place this lane may write** (I-016 — one of its
three sites is a doc, two are in `src/`), **1 blocked by a live lane** (I-027).

---

## I-001 — sampler comment about testapi and hostiles → ALREADY FIXED, no edit

Fixed by `4b8e53c` ("harness: read hostiles from the primary testapi channel
(I-001)"), which landed after the issue was filed. `tools/playtest/lib/sampler.mjs`
now says exactly what the code does: `hostiles` rides the primary channel and
`capsules` is still HB-only. Verified against the game side, not just the
comment:

- `src/main.js:455` — `telemetry()` maps `hostiles`, so `?testapi=1` publishes it.
- `src/main.js:~617` — `snapshot()` spreads `telemetry()` and adds `capsules`
  itself, so capsules really are HB-only and the two channels cannot drift on
  the hostile field set.

The file is also inside T-025/T-027's fence, so no edit was made or needed.

## I-002 — `check.mjs` printing static imports under "runtime, not imports" → ALREADY FIXED, no edit

Fixed by the T-026 scanner rewrite (`tools/assets/check.mjs:274-299` excludes a
rejected import's whole statement span from the info list; `:514-521` prints the
count of rejected imports beside the header instead of inside it). Verified
empirically rather than by reading, on a fixture tree with both a static import
and a genuine runtime reference in `src/`:

```
$ node tools/assets/check.mjs --root <scratchpad>/i002
  game references to assets/ (runtime, not imports): 1 (1 static import rejected below, not counted here)
    src/render/badimport.js:6: runtime asset reference — const RUNTIME_URL = new URL('assets/generated/deck.png', ...)
2 problems:
  - src/render/badimport.js:2: static import of "../../assets/x.png" makes an asset a hard dependency …
FAIL   (exit 1)
```

The import appears only as an error; the header lists only the line that
belongs there. On the real repo the same command is `PASS`, exit 0.

## I-015 — palette-capture overwrote committed artifacts before it threw → REPRODUCED, FIXED IN CODE

Reproduced first, then fixed, because the accept box is about behaviour, not
wording. `tools/playtest/palette-capture.mjs`:

- **before:** `shot()` was `page.screenshot({ path: <final artifact path> })`,
  so every unverified retry wrote straight over the committed frame and a total
  failure left the last bad frames on disk under a "nothing committed" error.
- **after:** `shot()` captures to memory into a per-scene `pending` map and
  returns the buffer (verification is unchanged); the buffers are written with
  `writeFileSync` only after **both** palette runs of that scene return. A scene
  that throws writes nothing, and a scene's two sides can never be half-updated.

Proof, both directions, on this worktree (`artifacts/palette-v1/` is committed,
so `git status` is the oracle):

| run | command | result | artifacts touched |
| --- | --- | --- | --- |
| success path | `node palette-capture.mjs transform-boot` | exit 0, pair composed | 3 files rewritten, as intended |
| failure path, **pre-fix** | `TELL_MIN_WARMER_PX = 99999999` in a copy of the committed file, `node palette-capture.PRE.mjs polyp-cycle` | throws "nothing committed" | ` M artifacts/palette-v1/polyp-tell--concept.png` — **the bug** |
| failure path, **post-fix** | same forced-failure threshold, patched file | throws the same error | *(none — `git status artifacts/` empty, mtimes unchanged)* |

Both scratch copies and the temporary threshold were reverted; `git checkout --
artifacts/palette-v1` restored the success-path files, and the only tracked
change in the file is the fix itself.

Two doc consequences:

- `tools/playtest/README.md`'s claim ("the rig throws rather than write evidence
  that does not show what its name claims") is now literally true, so I did
  **not** edit it — which also keeps this lane out of T-025's and T-027's
  README changes.
- The header comment pointed at `verifyTellFrame/verifyBeamFrame`, which do not
  exist (the code is `measure()` + `captureIrisCycle`). Corrected in passing —
  same file, same class of defect as the task.

## I-016 — `?juice=0` "byte-identical" → 1 of 3 sites fixed here, 2 are in `src/` and fenced

All three still reproduce. This is a docs-only lane, so only the doc was changed.

- **Fixed:** `docs/DESIGN.md` "Feedback pass (juice)" now says
  *simulation-identical* (the `README.md:70` wording), and names why: `samplePerf`
  runs every frame unconditionally (`src/main.js:540`) and `telemetry()` carries
  the `juice`/`perf` keys unconditionally (`src/main.js:474-475`). I verified
  both against the code rather than trusting the issue text.
- **Not fixed, out of scope for this lane:** `src/render/juice.js:27` still says
  colours are "role names resolved by fx.js (optional lazy palette import)" —
  `src/render/fx.js:37` is a plain static `import { PAL } from './palette.js'`,
  so the comment sends the next agent looking for an import that must not come
  back. And `src/mode.js:183` still promises the run is "byte-identical to the
  pre-juice game". Both are one-line comment edits for whoever next has a
  legitimate reason to touch those files.

## I-017 — mortar script's 3/3 beat stated as a contract → REPRODUCED, FIXED (wording)

`tools/playtest/scripts/mortar-zone-deny.json`'s `description` still carried
"Measured 3/3 on this tree: … one full lob -> fuse -> burst cycle observed with
the bot held at the lip through it and crossing the strip inside the reload
window", immediately above "Regression signals".

Rewritten to keep what reproduces and hedge what does not, using only committed
evidence:

- kept: completed (TRAVERSAL CLEAR), 0 kills, hp 3/3, all five emplacement
  states — and I re-ran the script on this worktree as a third independent
  data point: `outcome: completed`, 1 attempt, 0 falls, 0 kills, 0 hits.
- hedged: which beat the bot crosses on. The two committed, disagreeing runs are
  now both cited in the file — `reports/tasks/T-014/evidence/README.md` (waited
  ~830 ms at the lip, stepped off as the mortar entered `cool`) and
  `reports/tasks/T-014/playtest.md` (paused ~150 ms, crossed during
  `fuse`/`burst`, clear of the slab at x = 62.21, hp 3/3).
- the "Regression signals" list is untouched: those are what held in both runs,
  and they are the contract.

No policy rule, event or timing field was changed — the diff is the description
string only.

## I-021 — README/DESIGN vs `SHARE = { glyph: 1, cue: 1, pose: 0.6 }` → REPRODUCED, FIXED

Still true on this tree: `src/render/legibility.js:85` has
`SHARE = { glyph: 1, cue: 1, pose: 0.6 }`, and pathcheck asserts both the full
glyph gain and `LEG_POSE_GAIN < LEG_CUE_GAIN` (`tools/pathcheck.mjs:6062,
6067, 6069`). Both docs claimed the blanket "same factor".

- `README.md` now reads "information whole, a pose partly": a letter or a lamp
  gets the full factor; a tell pose takes 60% of the compensation by design and
  still lands smaller at FAR than at near.
- `docs/DESIGN.md`'s view-scale bullet carries the same clause plus the two
  gains, **1.9** and **1.54**, which are arithmetic over committed constants
  (`CONFIG.viewScales.far.depthMult = 1.9` in `src/config.js:32`, `SHARE.pose =
  0.6`) that pathcheck itself asserts — not a measurement I took.

No other copy of this claim exists in `docs/` or `README.md` (grepped for
"pull-back factor", "back up by the same", "screen size the near view").

## I-027 — spaced-run numbers → **BLOCKED**, not edited (T-027 holds the same line)

Still reproduces on `main`, but `task/T-027` (live, unmerged) already edits the
**same one-line `description` string** in
`tools/playtest/scripts/six-face-spaced-run.json` — `git diff main...task/T-027`
shows it appending a long "(3) CHANGED BY T-027 (I-028)" block and changing the
personal-space guard to `edgeMargin>8`. Two branches editing one JSON line is a
guaranteed conflict, so per the lane fences I left it alone.

T-027's own text already says "THE TIMING BAND ABOVE HAS NOT BEEN RE-MEASURED
with this guard … Treat 50.2-55.1 s as the pre-change number", which weakens the
band but leaves the absolute claim untouched: **"reaches wave gate 2 / scroll 140
of 415 EVERY time"** is still there, and it is the sentence I-027 falsifies.

Proposed edit for whoever picks this up after T-027 merges — replace

> and reaches wave gate 2 / scroll 140 of 415 EVERY time without clearing it

with

> and usually reaches wave gate 2 / scroll 140 of 415 without clearing it —
> USUALLY, not always: three independent gate runs of this script on the same
> pinned tree landed at 58.9 s / scroll 140, 54.3 s / scroll 140 and 38.2 s
> dying inside wave gate **1** at scroll 79 (`reports/tasks/T-019/playtest.md`
> §2), one above the band above, one inside it and one that never reached the
> gate. Read gate 1-or-2 and the GAME_OVER, never one run's decimals.

Every number there is read from committed evidence
(`reports/tasks/T-019/playtest.md:118-120`); the raw run directories the issue
cites (`tools/playtest/runs/gate-T-019-spaced-{1,2,3}/analysis.txt`) are
**gitignored** and are deliberately not cited.

---

## Claims dropped or refused for lack of evidence

- I-017's "~150 ms" and "x = 62.21", and I-027's three timings, are quoted only
  because they appear in committed `reports/tasks/**` files; the gitignored
  `tools/playtest/runs/**` paths both issues name were not used and are not
  cited anywhere in the edits.
- I did not re-measure anything and did not add a single new number to a
  shipped doc. The two numbers I did add (gains 1.9 / 1.54) are derived from
  committed constants that pathcheck asserts.
- The mortar description's flat "3/3" was not replaced with a bigger count even
  though my own run makes it 4 — my run is not committed evidence, so it stays
  out of the file and is reported here only as verification.

## Found in passing, needs an Inbox entry I cannot write (SPRINT.md is fenced)

`tools/playtest/legibility-capture.mjs:180` has the *same* shape I-015 fixed:
`page.screenshot({ path: … })` writes the final artifact and the verify runs
after (`:182`), with up to 6 shutters. It is less severe — an unverifiable
scene writes a distinct `-FALLBACK` file (`:359`) and the README documents that —
but a retried scene still overwrites its committed artifact with an unverified
frame before superseding it. Same one-line fix (capture to a buffer, write on
success) if someone opens that file.

## Verification

| command | result |
| --- | --- |
| `node tools/pathcheck.mjs` | **1704 passed, 0 failed**, exit 0 |
| `node tools/assets/check.mjs` | PASS, exit 0 |
| `node tools/assets/check.mjs --root <fixture with a static import>` | FAIL, exit 1, import listed only as an error (I-002 proof) |
| `node palette-capture.mjs transform-boot` | exit 0, both frames + pair written (I-015 success path) |
| `node palette-capture.PRE.mjs polyp-cycle` (pre-fix copy, forced verify failure) | throws; **overwrote** `polyp-tell--concept.png` (I-015 reproduced) |
| `node palette-capture.mjs polyp-cycle` (fixed, forced verify failure) | throws; `git status artifacts/` clean (I-015 fixed) |
| `node run.mjs scripts/mortar-zone-deny.json --deterministic --max-runtime-ms 17000 --base-url http://127.0.0.1:8757` | `outcome: completed`, 1 attempt, 0 falls, 0 kills, 0 hits |
| `node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 30000 --base-url http://127.0.0.1:8757` | `outcome: completed` (smoke, unchanged) |

Served with `node tools/serve.mjs 8757 --root <this worktree> --quiet`; the
operator's 8741/8742 were not used. Playtest output went to the scratchpad, not
`tools/playtest/runs/`.

## Open questions for the operator (feel — not judged here)

None. Nothing in this task changes what a player sees or does: no `src/` file,
no policy rule, no timing, no artifact. The only runtime-adjacent change is when
a dev-only screenshot rig writes its files.
