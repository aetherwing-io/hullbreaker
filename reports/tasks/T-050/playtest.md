PASS

# T-050 playtest — verify-served.mjs (I-037 correction + the stale-build gate)

Worktree `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-050`, branch
`task/T-050`, HEAD `29f851d`. Everything below was constructed fresh in this
session — new scratch trees, a new warm profile, a fresh Node process for the
piece-count check — not a re-read of `build.md`'s or `review.md`'s own runs,
though the numbers land on the same values, which is itself part of the
evidence.

## 1. Break it — both mechanisms, constructed independently, both FAIL loudly and NAME the staleness

**Scratch trees built for this gate** (both removed after; neither reused
from `build.md`'s deleted `/private/tmp/hb-pin-*` pins):

- `git worktree add --detach <scratch>/pre-t045 36a540c` — confirmed by
  `git show 36a540c:src/pure/limb.js` to declare
  `function limbBakePlan(cfg, groundH)` (no third parameter).
- A copy of this worktree with `src/sim/pace.js` replaced by
  `git show 2bc919a^1:src/sim/pace.js` (the pre-T-022 tree, 32 lines,
  confirmed by grep to have zero occurrences of `momentumScrollSpeed`) — this
  reconstructs the *other* named incident, the operator's blank page.

**1a. Server rooted on the pre-T-045 tree** (port 8952, `node tools/serve.mjs`):

```
node tools/playtest/verify-served.mjs http://127.0.0.1:8952
```

```
FAIL  http://127.0.0.1:8952/index.html?shell=0
      ! the page's own modules emit 0 scale-pass pieces and still carry `silhouette` — this is the I-037 fingerprint of a pre-T-045 limb.js
      ! /index.html: ... THE SERVER IS ROOTED ON ANOTHER TREE (matching commit c0743d9)
      ! /src/main.js: ... THE SERVER IS ROOTED ON ANOTHER TREE (matching commit 2732563)
      ! /src/config.js: ... THE SERVER IS ROOTED ON ANOTHER TREE (matching commit 2732563)
      ! /src/pure/limb.js: ... THE SERVER IS ROOTED ON ANOTHER TREE (matching commit 36a540c)
      ! /src/render/limb.js: ... THE SERVER IS ROOTED ON ANOTHER TREE (matching commit 2732563)
      ! /src/sim/level.js: ... THE SERVER IS ROOTED ON ANOTHER TREE (matching commit ef16f84)
```

Two independent mechanisms inside the tool both fire and both name the actual
stale file/commit: the semantic fingerprint check (no `src/pure/limb.js` byte
comparison needed — it re-derives the plan in the page and recognizes the
829/0/`silhouette` shape by name) *and* the byte-diff check, which finds the
exact commit for `pure/limb.js` (`36a540c`, correct) and for the other five
watched files independently.

**1b. Cache mechanism** (the one that actually fooled the integrator), full
end-to-end reproduction on my own scratch tree, not the author's:

1. Backdated the pre-T-045 scratch tree's mtimes (`touch -t 202506010000`,
   needed for Chrome's heuristic-freshness window) and served it on port 8954
   with plain `python3 -m http.server` (confirmed via `curl -D-`: no
   `Cache-Control` header).
2. Warmed a fresh Playwright profile against it:
   `verify-served.mjs http://127.0.0.1:8954 --profile <scratch>/warm-profile`
   → FAIL with the same fingerprint as 1a (this visit populates the cache).
3. Killed that server, started a **new** plain `python3 -m http.server 8954`
   rooted at the current (correct) worktree on the **same port** (confirmed
   via `curl -D-`: `Content-Length: 20217`, the current `index.html`).
4. Re-ran `verify-served.mjs http://127.0.0.1:8954 --profile <same warm-profile>`
   — no hard reload, no new profile:

```
FAIL  http://127.0.0.1:8954/index.html?shell=0
      ! the page's own modules emit 0 scale-pass pieces and still carry `silhouette` — this is the I-037 fingerprint of a pre-T-045 limb.js
      ! /index.html: the browser used 2828 chars, the network returns 20205 — CACHED BYTES (matching commit c0743d9). ...
      ! /src/pure/limb.js: the browser used 13326 chars, the network returns 25319 — CACHED BYTES (matching commit 36a540c). ...
      (4 more watched files, same shape, each naming its stale commit)
```

This is exactly the mechanism the LEAD's background describes, reproduced
from scratch (my own backdated tree, my own profile, my own port swap), and
the tool correctly labels it `CACHED BYTES` — distinct from `THE SERVER IS
ROOTED ON ANOTHER TREE` in 1a — which is the right distinction, since the fix
differs (hard-reload vs. restart-with-right-root).

**Verdict on "does it only catch the case its author already knew about":
no.** Both constructed scenarios used fresh trees/ports/profiles the author's
own report never touched, and both fire with named, specific evidence, not a
generic "something is wrong."

## 2. False positive check — clean

Correctly served current tree, port 8951 (`node tools/serve.mjs`), cold
profile:

```
PASS  http://127.0.0.1:8951/index.html?shell=0
      · limb bake plan matches this tree (1633 pieces)
      · scale pass live in the page: 818 mark/backdrop pieces
```

No false alarm on a clean serve.

## 3. Would it have caught tonight's two real incidents?

- **I-037 (pre-T-045 `limb.js`): YES**, shown above (1a/1b) — named by
  commit and by the I-037 fingerprint sentence.
- **The operator's blank page (pre-T-022 `pace.js`): YES, and it names the
  file**, though by a different path than the byte-diff table. `pace.js` is
  not in `WATCHED`, so I expected only a generic "did not boot." Measured
  result, port 8953, the reconstructed pre-T-022 tree:

```
FAIL  http://127.0.0.1:8953/index.html?shell=0
      ! the page never exposed window.HB — it did not boot (first error: The requested module './pace.js' does not provide an export named 'momentumScrollSpeed')
      ! the page could not re-import its own modules: SyntaxError: The requested module './pace.js' does not provide an export named 'momentumScrollSpeed'
```

The browser's own ES-module linking error names the exact file and the exact
missing export — as diagnostic as the byte-diff table would have been, and it
did not require `pace.js` to be enumerated in `WATCHED`. This generalizes: any
import-breaking staleness anywhere in the module graph trips the same
unconditional boot check (A), not just the two files this task happened to
investigate. Worth being precise about the boundary, which the tool's own
HONESTY section already states and I confirm holds: a stale file that is
**not** watched, does **not** break an import, and does **not** change the
limb plan length (e.g., a subtly wrong constant in an unrelated module) would
still be invisible to this tool. That is a real, disclosed scope limit, not a
functional gap in what was tested tonight — I am not filing it as a new issue
since `README.md`'s honesty item 1 and the review's finding already state it
plainly, and it does not change either of tonight's two verdicts above.

## 4. I-037 scale-pass claim — reproduced independently, not inherited

Fresh `node --input-type=module` process (no reuse of `build.md`'s numbers),
importing this worktree's own `config.js`/`generator.js`/`limb.js`:

```
groundH length 445
withScale        1633  markbd 818  hasSilhouette false
{scale:true}     1633  markbd 818
{scale:false}     829  markbd   0  hasSilhouette true
delta 804
```

Matches the claimed table exactly, driven from the real level (`groundH`
length 445, never a synthetic array — checked). Cross-checked from the
browser side too: `verify-served.mjs` against the correctly-served worktree
(§2 above) independently reports the same 1633/818 pair by asking the running
page, which is the harder-to-fake channel (page-internal re-import + the
renderer's own published `window.HB.g1.pieces`), not just a Node import.

**Screenshots, looked at directly** (`artifacts/t-050/01-03*.png`, 1440x900):
`01-shipped-default.png` visibly shows several ladder-rung patterns down the
lower-right hull-skirt wall segments and a detailed elevated structure at top
right (windows, a catwalk/railing silhouette). `02-scale0-escape-hatch.png`
and `03-stale-build-pre-T-045.png` both lack the hull-skirt ladders entirely
(the wall segments are flat) and show a much plainer, blank dark shape at top
right with no catwalk/window detail — visually consistent with the claimed
16–40%-of-frame pixel delta and with 829/818 in the piece counts. No glitches,
no visible anatomy-assembly (static single frames, nothing mid-construction),
no obvious style break in any of the three.

`pathcheck` domain module (`tools/pathcheck/t-050-shipped-plan-carries-the-scale-pass.mjs`)
reads clean: built from `buildLevel(CONFIG).groundH`, asserts per-facet floors
(not just a run total, closing the averaging hole the report's own second
break demonstrates), and asserts the renderer/main.js/verify-served.mjs chain
stays wired. `node tools/pathcheck.mjs` in this worktree: **2425 passed, 0
failed**, matching the report's own number.

## 5. Zero runtime change, gates, smoke, selftest

- `git diff main...HEAD -- src/` — **0 lines**, confirmed directly.
- `git diff main...HEAD -- '*.json'` — 0 lines (no new runtime dependency).
- `git status --short` in the worktree — only the untracked `reports/tasks/T-050/review.md`.
- `node tools/pathcheck.mjs` (worktree) — **2425 passed, 0 failed**.
- `node tools/pathcheck.mjs` (main checkout, currently `cb3a39d`, a docs-only
  commit past the `627fec6` the reports cite) — **2448 passed, 0 failed**,
  reconciling correctly: `627fec6` is an ancestor of current `main`
  (confirmed via `git merge-base --is-ancestor`) and no `src/`/pathcheck
  commit landed between them, so the count is unchanged from what the review
  already reconciled. This branch's own base (`8c9f3b9`) is behind both.
- **Manifest conflict, reproduced independently** in a scratch clone
  (`git merge --no-commit --no-ff task/T-050` onto current `main`): real
  `CONFLICT (content): Merge conflict in tools/pathcheck/manifest.mjs`, at the
  `d47` slot — confirms the review's correction that **T-042**, not T-049, is
  today's actual contender (T-042 already claimed `d47` on `main`). Trivial,
  documented rename-to-`d48` fix; not blocking.
- Smoke scripts, run from the **main checkout's** harness against
  `--base-url http://127.0.0.1:8951` (this worktree, `--deterministic`):
  - `scripts/mid-route.json` → `outcome: completed`, 0 deaths, `pageErrors: []`, no `bootError`, `stopReason: victory`.
  - `scripts/transform-slice.json` → `outcome: completed`, 0 deaths, `pageErrors: []`, no `bootError`, `stopReason: victory`.
- `index.html?selftest=1` on this worktree's served build → **`SELFTEST PASS
  (39 checks)`**. One console line, `Failed to load resource: 404` — traced
  to `/favicon.ico` (confirmed via `curl`), an ordinary browser-chrome request
  unrelated to game asset loading, not a defect.

## Conclusion

Every claim in `build.md` and `review.md` reproduces independently, on fresh
scratch trees and a fresh warm-profile cache lab this session built itself
rather than replaying. The detector fires correctly and names the staleness
on two constructed fault scenarios plus both named historical incidents, does
not false-positive on a clean serve, and the underlying I-037 scale-pass
claim holds on the real shipped level. Zero `src/` change, pathcheck green,
smoke suite completes, selftest passes. No new defects found; the one
already-known, already-disclosed scope limit (files outside `WATCHED` that
neither break an import nor move the limb-plan length are invisible to this
tool) does not affect either of tonight's two real incidents and does not
change the verdict.

No new `## PROPOSED INBOX ISSUES` from this pass — the two already proposed
in `build.md` (pin-tracking/lifecycle, and the `main.js`-fenced in-page
mixed-staleness check) still stand as written; nothing here adds to or
weakens them.

## Evidence paths

- `reports/tasks/T-050/build.md`, `reports/tasks/T-050/review.md` — build + review under gate.
- `artifacts/t-050/01-shipped-default.png`, `02-scale0-escape-hatch.png`, `03-stale-build-pre-T-045.png` — viewed directly this pass.
- `tools/playtest/verify-served.mjs`, `tools/pathcheck/t-050-shipped-plan-carries-the-scale-pass.mjs`, `tools/pathcheck/manifest.mjs` — read and exercised directly.
- Scratch trees/logs for this pass (all removed after): `<scratchpad>/t050qa/pre-t045` (worktree, `git worktree remove`d), `<scratchpad>/t050qa/pre-t022-tree` (plain copy, `rm -rf`d), `<scratchpad>/t050qa/warm-profile` (`rm -rf`d), `<scratchpad>/t050qa/smoke-mid-route/report.json`, `<scratchpad>/t050qa/smoke-transform-slice/report.json` (left in scratchpad).
- Ports used, all ephemeral and killed after: 8951 (this worktree, `node tools/serve.mjs`), 8952/8953 (scratch trees, `node tools/serve.mjs`), 8954 (`python3 -m http.server`, twice, for the cache lab). `:8741`/`:8742` never touched.

## Run commands (for reproduction)

```sh
# correct-tree serve + false-positive check
node tools/serve.mjs 8951 --root <T-050 worktree> --quiet &
node tools/playtest/verify-served.mjs http://127.0.0.1:8951

# pre-T-045 scratch tree (server-rooted-elsewhere)
git worktree add --detach <scratch>/pre-t045 36a540c
node tools/serve.mjs 8952 --root <scratch>/pre-t045 --quiet &
node tools/playtest/verify-served.mjs http://127.0.0.1:8952

# pre-T-022 pace.js scratch tree (boot-failure path)
cp -R <T-050 worktree> <scratch>/pre-t022-tree   # then replace src/sim/pace.js
git show 2bc919a^1:src/sim/pace.js > <scratch>/pre-t022-tree/src/sim/pace.js
node tools/serve.mjs 8953 --root <scratch>/pre-t022-tree --quiet &
node tools/playtest/verify-served.mjs http://127.0.0.1:8953

# cache mechanism
cd <scratch>/pre-t045 && find . -name "*.js" -o -name "*.html" | xargs touch -t 202506010000
python3 -m http.server 8954 &            # from <scratch>/pre-t045
node tools/playtest/verify-served.mjs http://127.0.0.1:8954 --profile <scratch>/warm-profile
# kill that python, then:
python3 -m http.server 8954 &            # from <T-050 worktree>
node tools/playtest/verify-served.mjs http://127.0.0.1:8954 --profile <scratch>/warm-profile

# smoke (from the main checkout)
cd tools/playtest
node run.mjs scripts/mid-route.json --deterministic --base-url http://127.0.0.1:8951
node run.mjs scripts/transform-slice.json --deterministic --base-url http://127.0.0.1:8951
```
