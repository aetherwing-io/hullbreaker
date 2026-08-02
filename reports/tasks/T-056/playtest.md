PASS

# T-056 playtest — one haze band (fog-constant reconciliation)

Worktree `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-056`,
branch `task/T-056`, HEAD `6cbd2d9`. Compared against **current main**
`985d499` (merge-base `71f3062ae1da0c3bbd33f22c6b846e7709c4c973` — confirmed
via `git merge-base main HEAD`; no commit between merge-base and current main
touches `src/render/camera.js` or `src/config.js`, so main HEAD is a valid,
non-stale "before"). Every number below is re-derived by me, not inherited
from `reports/tasks/T-056/build.md`.

## Setup (pinned, non-destructive)

```sh
git archive HEAD | tar -x -C /tmp/.../t056        # this task's tree
git archive main | tar -x -C /tmp/.../t056-main   # current main
node tools/serve.mjs 8760 --root /tmp/.../t056 --quiet       # "after"
node tools/serve.mjs 8761 --root /tmp/.../t056-main --quiet  # "before"
```
Both servers killed at the end of this gate. 8741/8742 never touched. The
worktree itself was never written to except this report and its own
`evidence/qa/` subfolder (`git status --short` in the worktree shows only
that new, untracked directory — confirmed before and after).

## 1. Fences

Diff vs `main...HEAD` touches exactly `src/config.js`, `src/render/camera.js`,
`tools/pathcheck/t-035-value-ladder.mjs`, plus `reports/tasks/T-056/**` and a
new dev-only `tools/playtest/fogband-capture.mjs`. No other `src/` file. This
matches the task's stated scope (config.js/camera.js retire `shadeFog`, the
S2 pathcheck domain re-targets the live band).

## 2. pathcheck — recomputed, not trusted

- Merge-base (`71f3062`, scratch copy): **3195 passed, 0 failed**.
- This tree (`6cbd2d9`): **3194 passed, 0 failed**.
- Label reconciliation (`tools/pathcheck-labels.mjs --tree <each>` +
  `comm` on the sorted label sets): **exactly 8 removed / 7 added, and every
  one of the 15 changed lines is tagged `T-035/S2`** — `grep -v "T-035/S2"`
  on both the removed and added sets returns nothing. No other lane's
  assertion moved. Matches the build report's claim, independently
  reproduced.

## 3. The recorded LIMIT — verified, with one precision gap found

Re-derived the play-band screen-edge fog factor straight from each tree's own
`CONFIG` (camera geometry + `probe()`/`factor()`, copied verbatim from
`tools/pathcheck/t-035-value-ladder.mjs` into a standalone script, run against
both trees' `src/config.js` — no browser, no trust in the printed pathcheck
message):

| aspect checked | AFTER (live band, `limb.fog`) | BEFORE (shipped, `shadeFog`) |
|---|---|---|
| 16:10 only (`1.6`, the aspect the new LIMIT assertion actually checks) | **4.60% near / 3.79% mid / 3.31% FAR** | 0.00% at every view |
| 16:10 **and** 16:9 (`1.6`+`1.7778`, what the *old* S2(iii) assertion checked) | **5.60% near / 4.72% mid / 4.21% FAR** | 0.00% at every view |

The `3.31%/4.60%` figure in `src/config.js`'s comment and the new
`tools/pathcheck/t-035-value-ladder.mjs` LIMIT assertion **reproduces exactly**
— but only at 16:10. At 16:9 (a real reachable aspect: `src/main.js:744`
asserts `camera.aspect` tracks `innerWidth/innerHeight` on resize, so a player
maximized on a 16:9 panel gets this aspect, not 16:10) the true worst case is
about a point higher, 4.21%/5.60%. The LIMIT is still small in absolute terms
either way and I found no visible legibility cost at either aspect (see §4),
but the number as recorded is aspect-specific and doesn't say so. Filed as
I-??? below (S3, doc precision — not a functional regression).

## 4. Readability, judged moving

Drove `six-face-spaced-run.json`'s policy (real reflex input, not a staged
shot) for a continuous 23s against **both** pinned servers with the same
script, screenshotting at t=3/8/13/18/23s (true 1280x800 size, no scaling) —
`reports/tasks/T-056/evidence/qa/{before,after}-t{3000,8000,13000,18000,23000}.png`.
Both runs tracked closely (scrollX within 0.5 tiles of each other at every
checkpoint, comparable hostile counts), so the pairs are a fair look at the
same moments.

Observations across all 5 pairs: the far backdrop (sister-limb debris field,
spine drums) still reads as receding distance in both — no flattening into a
wall, no perceptible difference in how "thick" the air looks between RIG and
the backdrop. RIG, hostiles (green hound/wasp sprites), muzzle flashes,
tracers and the HUD text are equally crisp in both. One pair (`t13000`) has
RIG standing directly at the extreme right screen-edge column next to the
dare-pocket capsule marker (`[S]`) — exactly the geometry the recorded LIMIT
describes — and both the capsule glyph and RIG's silhouette are fully legible
in both variants, no wash.

Also captured a dedicated `?view=near` frame (where the LIMIT is largest,
4.60%/5.60%) mid-wave-gate-fight, 5 hostiles on screen, muzzle flash and
tracers live: `evidence/qa/{before,after}-viewnear.png`. Same result — no
legible difference, nothing washed toward the haze color at the frame edges.

I am not offering a verdict on whether the atmosphere looks *better* — that's
the operator's call (see §8). What I can say: nothing became less readable.

## 5. Dose parity — play surfaces provably unchanged

- `CONFIG.shade.dose === 0.5` on both trees (confirmed by direct read).
- Independently re-ran `limbBakePlan`/`limbShadePlan`/`deckShadePlan` (the pure
  plan builders every InstancedMesh is built from) in plain Node against both
  trees' own `CONFIG`/`groundH`, SHA-256'd the full plan and every per-`kind`
  bucket (1633 pieces, 24 buckets): **byte-identical in every bucket, both
  trees.** This is a stronger check than trusting the build report's own hash
  — I recomputed it from scratch rather than re-printing their number.
- Draw calls / instance counts are therefore structurally unchanged too (both
  are pure functions of the plan just proven identical).

Only the fog constant moved; every baked/instanced surface is pixel-for-pixel
what main ships today.

## 6. Durability

- `mid-route.json --deterministic`: **completed** (victory), 0 pageErrors, no
  bootError, `deterministicDispatch.fatal: null`.
- `transform-slice.json --deterministic`: **completed** (victory), 0
  pageErrors, no bootError, fatal: null.
- `six-face-spaced-run.json --deterministic --stop-on-game-over`, 3 runs per
  tree: outcomes were a died/not-completed mix on **both** trees (after: died
  once, not-completed twice; before: died twice, not-completed once) — the
  same qualitative spread the harness's own README documents for this exact
  script (wide run-to-run variance, same ceiling gate both sides). 0
  pageErrors, no bootError, `fatal: null`, `policy.missingFieldWarnings: []`
  on every run, either side. No regression signal — a fog constant has no
  mechanism to touch sim/collision/combat, and the data agrees.
- `?selftest=1` checked across 9 flag combinations (`plain`, `shade=0`,
  `shade=1`, `scale=0`, `palette=classic`, `g1=1`, `view=near`, `view=mid`,
  `slice=traversal`) on **both** servers: **SELFTEST PASS, identical check
  counts (39, 41 for the traversal slice) on every combination, both trees.**
  Zero page errors anywhere in this pass.

No blank page, no softlock, no crash, no lost camera tracking observed in any
run across either tree.

## 7. Perf

`tools/playtest/juice-stress.mjs` (256 saturated projectiles + full spark
pool), run standalone against each archived tree:

| | control | stress (256 proj) | stress, juice off |
|---|---|---|---|
| AFTER  | 121.6 fps, worst 9.4ms | 120.3 fps, worst 9.4ms | 119.9 fps, worst 9.3ms |
| BEFORE | 120.4 fps, worst 9.4ms | 120.0 fps, worst 9.3ms | 120.0 fps, worst 9.4ms |

`over20ms: 0` in all six readings. fps is vsync-locked to this machine's
~120Hz panel (see the harness's own honesty note — this proves no frame was
late, not raw headroom), but `worstMs`/`over20ms` are the load-bearing fields
and they are statistically indistinguishable before/after, as expected for a
fog-constant-only change with no new geometry, materials or draw calls (see
§5).

## 8. Smoke scripts

Both named smoke scripts complete cleanly on the pinned "after" build:
`mid-route.json` → victory, `minEdgeMargin` 35.28, idle fraction 5.3%.
`transform-slice.json` → victory, idle fraction 0%. Zero non-completing runs
sampled (I-040 terms).

## What I did not adjudicate

Whether the backdrop looks *better* receding at the new band, or whether the
air itself reads as thinner — those are feel calls for the operator, not
mine. `build.md`'s own three open questions (does the backdrop read as more/
less distant; is the haze itself thinner; is the recorded LIMIT worth
chasing) stand as written and are not duplicated here.

**Operator checkpoint** (already queued by the lane, still open):
`http://127.0.0.1:8749/index.html` on this worktree — 3 questions in
`build.md`'s "Open feel questions" section.

## Verdict

**PASS.** Fences respected. pathcheck and the label reconciliation reproduce
exactly on independent re-derivation. The stated LIMIT reproduces exactly at
16:10 and is confirmed small (and visually inconsequential at true size,
moving) at both shipped aspects. Play-surface geometry/shading is proven
byte-identical, not just claimed. Durability, perf and smoke are all clean
with zero regressions on either tree. The one real finding (the LIMIT's
number being aspect-specific) is a documentation-precision gap, not a
functional defect, and is filed below rather than failing the gate over it.

## PROPOSED INBOX ISSUES

## I-??? | docs | S3 | repro: `node -e` re-derivation of `tools/pathcheck/t-035-value-ladder.mjs`'s `probe()`/`factor()` against `CONFIG.limb.fog` at aspect 1.7778 (16:9) vs the checked 1.6 (16:10), commit `6cbd2d9` | evidence: this report §3
The recorded LIMIT ("the protected play band's screen-edge column carries
3.31% haze at FAR / 4.60% at `?view=near`") in `src/config.js`'s comment block
and the LIMIT assertion in `tools/pathcheck/t-035-value-ladder.mjs` is exactly
correct **at 16:10 only** — the one aspect the new assertion checks. The prior
S2(iii) assertion it replaced checked both 16:10 and 16:9; at 16:9 the true
worst case is **4.21% FAR / 5.60% near**, about a point higher. `src/main.js`
tracks `camera.aspect` to the live window on resize (asserted: `'resize
handled'`), so a player on a 16:9 panel is a real, reachable case, not a
synthetic one. Still a small number either way and I found no visible
legibility cost at either aspect (moving, at true size — see this report's
§4), so this is a documentation/assertion-coverage gap, not a functional
regression: either restate the LIMIT as "at 16:10" explicitly, or widen the
LIMIT assertion's aspect loop back to match the assertion it replaced.

## I-??? | tooling | S3 | repro: `cd tools/playtest && node fogband-capture.mjs shots` on a clean checkout of `task/T-056` HEAD `6cbd2d9` | evidence: error text below
`fogband-capture.mjs` (new in this diff) throws immediately on the very tree
it ships in: `Error: camera.js does not contain the expected shipped fog-select
line`. Its `SHIPPED_LINE` constant is the *pre-change* two-way conditional
(`SHADE_GAIN > 0 ? CONFIG.limb.shadeFog : CONFIG.limb.fog`), which this same
commit deletes from `src/render/camera.js` — so the tool's own documented
usage (`node fogband-capture.mjs shots`) cannot be re-run standalone on the
committed branch to regenerate `reports/tasks/T-056/evidence/{before,after,
approved}*.png`. It fails loudly rather than silently mismeasuring (an honest
failure mode, and it is why I built an independent capture script for this
report instead of trusting a re-run), but a future re-verification attempt
following the tool's own header will hit this immediately. Zero effect on the
shipped game (dev-only harness file, per the project's harness/tooling DoD) —
worth a one-line follow-up noting the rig is now a historical-capture record,
not a repeatable one, or updating `SHIPPED_LINE`/the variant list to branch on
whether the conditional is present.
