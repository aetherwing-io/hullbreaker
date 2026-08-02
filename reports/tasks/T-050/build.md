# T-050 — the scale pass is not broken; the build the browser was running was

**Worktree** `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-050`
**Branch** `task/T-050` (base `8c9f3b9`; `main` has since moved to `627fec6`)
**Runtime change: none.** `git diff main...HEAD -- src/` is empty.

## LEAD: the root cause, and the correction it forces

**I-037's evidence is real and reproducible. Its conclusion is wrong.** The
shipped default run on `main` bakes the scale pass and renders it. What the
browser was executing was a **pre-T-045 copy of `src/pure/limb.js`**, in which
`limbBakePlan` has **arity 2** and ignores its third argument entirely — so
`{scale:true}` and `{scale:false}` both return the legacy plan, `silhouette` is
still in it, and there are no `mark*`/`bd*` kinds. That is the whole fingerprint
I-037 reported, and it is not producible from this tree by any input.

Driven from the REAL level's `groundH` (`buildLevel(CONFIG).groundH`, 445
columns — never a synthetic array):

| | `main` / `task/T-050` | pre-T-045 tree | I-037 reported |
|---|---|---|---|
| `limbBakePlan(CONFIG, gH)` | **1633** | 829 | 829 |
| `limbBakePlan(CONFIG, gH, {scale:true})` | **1633** | 829 | 829 |
| `limbBakePlan(CONFIG, gH, {scale:false})` | 829 | 829 | 829 |
| `mark*`/`bd*` pieces | **818** | 0 | 0 |
| `silhouette` in the default plan | **no** | yes | yes |
| `limbBakePlan.length` (arity) | 3 | 2 | — |

Two pre-T-045 trees are sitting on this machine right now and reproduce I-037's
numbers exactly: `/private/tmp/hb-pin-main-cd37b91` (`cd37b91`) and
`/private/tmp/hb-pin-t009fix` — pinned gate worktrees from earlier in the
session. Either can reach a browser two ways, and **both mechanisms are
indistinguishable from a console**:

1. **the server was rooted on one of them** — every file is self-consistently
   old, so nothing looks wrong; or
2. **the browser was executing cached bytes.** I reproduced this end to end
   (`scratchpad/t050-cache-lab.mjs`): warm a profile against the pin on port P
   (`python3 -m http.server`, no `Cache-Control`), then serve the current tree on
   the same port and do a **plain fresh navigation to the plain URL** — the page
   still baked 829, `{scale:true}`/`{scale:false}` still both returned 829,
   `silhouette` still present. `fetch('/src/pure/limb.js')` returned **13,326**
   chars from cache while `fetch(…, {cache:'reload'})` returned **25,319** from
   the wire.

I cannot tell which of the two produced the specific session that filed I-037 —
that browser and that server are gone, and they leave identical evidence. Both
are outside `src/`. What I can state as measured fact: **"reproduced on a fresh
load of the plain URL" does not rule out the cache.** It is the one thing that
does not clear it. Two further measurements from that lab, both load-bearing:

- The **document itself** came from cache too (9,894-char pre-T-045 `index.html`
  in the DOM while the server was serving the 20,205-char current one). So
  **nothing shipped inside the page can detect this** — a canary in
  `index.html` or a selftest check would have been stale along with everything
  else. The check has to run outside the page.
- Switching that origin to the `no-store` `tools/serve.mjs` afterwards does
  **not** dislodge an entry an earlier python session stored. Only a hard reload
  or a cold profile does.

### Why the pathcheck coverage was green the whole time, honestly

It was green because it was **right**. T-045's own block already builds its plan
from `buildLevel(CONFIG).groundH`, not a synthetic array. To prove the tree
never had the defect, I injected it — `const scale = opts.scale === true;` in
`src/pure/limb.js`, which makes the shipped call emit the legacy plan exactly as
I-037 described — and the gate went **red on 22 assertions, 9 of them
pre-existing T-045 ones** (`FAIL reference objects exist on BOTH the limb RIG
runs on (0) and the backdrop limb behind it (0)`, `FAIL the far body overlaps
every column of the run`, …). A tree carrying I-037's defect could not have
passed the gate it passed.

**So the brief's instruction "the new assertion must fail on current `main`"
cannot be met honestly, and I did not try to manufacture it.** There is no true
statement about the plan built from the real `groundH` that is false on `main` —
the plan is correct there. Writing an assertion that fails on `main` would mean
asserting something untrue. What I built instead is below: the assertion that
would actually have caught this failure, whose subject is the build a person is
looking at rather than the files on disk, plus the per-facet plan assertions
that close a real hole T-045's block left.

## What changed

| File | Change |
|---|---|
| `tools/playtest/verify-served.mjs` | **new.** Asks a RUNNING page which build it is: compares `window.HB.g1.pieces` (the plan the page actually baked) against the plan this tree bakes from the real level, re-derives the scale pass inside the page, and separates a wrong server `--root` from cached browser bytes, naming the commit a served copy matches. `PASS`/`FAIL` on line 1, exit 0/1. |
| `tools/pathcheck/t-050-shipped-plan-carries-the-scale-pass.mjs` | **new domain module, +21 assertions**, all over `buildLevel(CONFIG).groundH`. |
| `tools/pathcheck/manifest.mjs` | registers it as `d47` (the runner refuses to run an unlisted module). |
| `tools/playtest/README.md` | the tool's section: usage, the two mechanisms, and five honesty limits. |
| `docs/ORCHESTRATION.md` | merge-playbook entry for the SILENT half of the T-024 cache class — a stale page that boots fine — with this tool as the first move. |
| `artifacts/t-050/` | three matched frames + a README stating exactly what each is and is not evidence for. |

**No `src/` file is touched.** Nothing here can move a movement constant, a
palette token, or the value of a frame.

**Merge note.** The only contended file is `tools/pathcheck/manifest.mjs`, where
`task/T-049` also appends a line. Both edits are pure appends (`import * as d47`
+ one list entry); compose both sides and keep both `d47`/`d48` numbering
consistent — the runner refuses to start if a module in `tools/pathcheck/` is
missing from the list, so a dropped line fails loudly rather than silently.

### The new assertions, and what each is for

1. **The pass survives every way a caller can omit the flag** — no opts, `{}`,
   `{scale: undefined}`, `{scale: true}` all bake the shipped plan; the default
   plan carries no `silhouette`; `?scale=0` is a strictly smaller plan (by 804
   pieces, floor 200) that carries none of the new kinds and restores the
   silhouette pair.
2. **Every facet, not the run on average.** A player sees one facet at a time.
   Near-limb marks (`depth > 0`) and sister-limb marks (`depth < 0`) are counted
   **separately** per facet, floor 8 each, plus 8 backdrop pieces. Today:
   40-88 near, 20 sister, 23-53 backdrop per facet. Plus the opening 40 tiles —
   the frame every single run shows — and a door's size against
   `CONFIG.player.height` (2.9 tiles vs 1.7 = 1.71x).
3. **The chain an outside observer reads cannot be cut silently**: the renderer
   bakes from `src/sim/level.js`'s real `groundH` with the shipped flag,
   `limbPieces` IS `plan.length`, `window.HB.g1.pieces` publishes it, and
   `verify-served.mjs` still compares both halves.

## Verification — every command and its result

| Command | Result |
|---|---|
| `node tools/pathcheck.mjs` (worktree) | **2425 passed, 0 failed** |
| `node tools/pathcheck.mjs` at base `8c9f3b9` (temp detached worktree) | 2404 / 0 — so **+21**, all mine |
| `node tools/pathcheck.mjs` in the main checkout (`627fec6`) | 2448 / 0 (T-042 landed after my base; the merge should land 2469) |
| `node run.mjs scripts/mid-route.json --deterministic --base-url …8936` | **completed, 0 deaths**, served build `traversal-slice (traversal-v1)` |
| `node run.mjs scripts/six-face-spaced-run.json --deterministic --stop-on-game-over --max-runtime-ms 145000` (worktree) | died at game-over, 3 deaths, 10 kills, 43.0 s, 560 samples @ 76.4 ms |
| …the same script against the **main checkout** (control) | died at game-over, 3 deaths, 12 kills, 51.4 s |
| `verify-served.mjs` → server rooted at this worktree | **PASS** — plan matches (1633), 818 scale pieces |
| `verify-served.mjs` → server rooted at the pre-T-045 pin | **FAIL** — I-037 fingerprint + 5 files named with their commits |
| `verify-served.mjs` → correct server root, poisoned profile | **FAIL** — 4 files "CACHED BYTES", commits named |

**On the two six-face numbers.** My branch changes no `src/` file, so the 43.0 s
vs 51.4 s gap is run-to-run variance in this harness (deterministic input
dispatch, not a deterministic sim replay), not an effect of this branch — the
control run is there so the number is not inherited. Both runs end the same way:
game-over at 3 deaths. I did **not** compare either against T-045's documented
50.2-55.1 s band: that band predates T-043's wasp aim-lock and squad stagger,
which changes how long this policy survives, and inheriting it across that change
would be exactly the error the lane brief names.

### Proving the new assertions bind (break → red → restore)

Each break was applied to the committed tree, `node tools/pathcheck.mjs` run,
then restored. Tree verified clean after each; gate back to 2425/0.

| Break | What printed |
|---|---|
| `opts.scale !== false` → `opts.scale === true` (I-037's defect, injected) | 22 fails — 9 pre-existing T-045 ones plus 13 of mine, incl. `FAIL T-050: the shipped plan emits the scale pass over the REAL level: 0 human-scale reference pieces + 0 backdrop-tier pieces` and every facet |
| `markPlan` returns early for facet 3 (that facet loses every near-limb mark) | `FAIL T-050: facet 3 (s 221-284) carries 0 reference pieces on the limb RIG runs on, 20 on the backdrop limb and 42 backdrop-tier pieces` — **the only assertion in 2425 that catches it** |
| `HB.g1` renamed `pieces` → `count` | `FAIL T-050: window.HB.g1.pieces publishes it — the one number that lets an outside observer ask a RUNNING page which build it is` |
| `verify-served.mjs` deleted | `FAIL T-050: tools/playtest/verify-served.mjs still compares the page's baked plan against this tree AND cached bytes against network bytes` |

The second break is worth flagging: my **first** version of that assertion counted
near-limb and sister-limb marks together, and it stayed **green** while a whole
facet lost every reference object under RIG's feet — the sister limb's own ladder
and railing kept the total over the floor. That is this project's signature
failure reproduced in miniature, inside the fix for it. The shipped version
counts the two ends separately, and the comment in the file says why.

## Before/after at the shipped FAR default

`artifacts/t-050/` (1440x900, `?shell=0`, matched on `HB.scrollX() >= 8` — the
shipped scroll is a constant, so the same cursor is the same camera pose):

- `01-shipped-default.png` — `main`, plain URL: **1633** pieces. Rung ladders,
  hatches and personnel doors down the hull skirt; drums and the far body graded
  in the haze band.
- `02-scale0-escape-hatch.png` — same build, `?scale=0`: 829 pieces.
- The A/B between them: **344,711 pixels = 26.6% of the frame** differ (215,485
  in the top third, 100,665 in the bottom third). Across five viewports —
  1440x900, 1920x1080, 1280x720, 1512x750, 2560x1080 — the same A/B moves
  **16.0-39.5%** of pixels, always in both bands, so nothing about the operator's
  window shape hides the pass.
- `03-stale-build-pre-T-045.png` — `/private/tmp/hb-pin-main-cd37b91`, i.e. what
  a stale cache or stale server root serves. **Not a clean A/B**: that tree also
  predates T-035b, T-038, T-039, T-040, T-042, T-047 and T-048, so the seam pips,
  route-lip highlights, contact shadows, light rig, tone mapping and bloom are
  missing from it too. It is here as a picture of the build the I-037 session was
  looking at.

## What I did NOT do, and why

- **No `src/` change, no "fix" to the scale pass.** There is nothing there to
  fix, and loosening or re-plumbing a correct guard to make a symptom go away is
  the one outcome the task explicitly forbade.
- **No assertion engineered to fail on `main`.** See above; it would have to be
  false.
- **No in-page staleness canary.** I measured the reason it cannot work: the
  document is cached too, so the canary would be stale with everything else.
- **I did not touch `:8741`/`:8742`.** Everything here ran on ephemeral ports
  8934-8939, all stopped; `verify-served.mjs` refuses those two ports unless
  `--operator-port` is passed.
- **`src/main.js` is in `task/T-021`'s diff**, so I did not add a browser-side
  selftest check there even though a mixed-staleness case (new `main.js`, old
  `limb.js`) would be caught by one. Recommended as a follow-up, not taken.

## For the operator — what to look at, and what I need judged

**This needs a hard reload before you look.** Whatever URL you have been using,
its cache may still hold the pre-T-045 modules; a normal reload is not enough.
Cmd-Shift-R once, or open a private window.

- shipped default: `http://127.0.0.1:8741/index.html`
- the same build without the scale pass: `http://127.0.0.1:8741/index.html?scale=0`

(If you want certainty about which build you are seeing, the integrator can run
`node tools/playtest/verify-served.mjs http://127.0.0.1:8741 --operator-port` —
it prints PASS/FAIL and names the commit if the page is running an old one.)

Questions I cannot answer and will not guess at:

1. Standing on the deck at the FAR view: do the ladders, hatches and doors on
   the hull below RIG make him read as **small**, or as busy texture that pulls
   the eye off the fight?
2. The masses crossing the upper frame are meant to read as **more of the same
   creature**. Do they read as body, or as scenery floating above the level?
3. Between 01 and 02 (one URL apart, same build): is the scale pass doing the
   job entry 17 asked for, or does it need to be **more** — bigger, closer,
   denser — before it lands?
4. `03-stale-build-pre-T-045.png` is what you have been shown. If that is what
   you have been judging the look against, is there anything you rejected
   earlier that you would like re-asked against the current build?

## PROPOSED INBOX ISSUES

```
## I-??? | bug | S2 | repro: any gate lane; see reports/tasks/T-050/build.md | evidence: scratchpad/t050-cache-lab.mjs measurements
Pinned gate worktrees (/private/tmp/hb-pin-*) and python-served origins are
retired by hand, and nothing ties a served origin to a commit. That is how a
cd37b91 tree stayed reachable on a port people call "the build" long after main
had moved seven merges past it. Fix direction: merge-task.sh (or a small
`tools/orch/pins.sh`) records every pin it creates with its commit and removes
it on completion, and gate agents run tools/playtest/verify-served.mjs against
their own port before believing a boot failure or an absent feature. The
verifier now exists; nothing calls it automatically.
```

```
## I-??? | bug | S3 | repro: mixed staleness — a fresh index.html/main.js with a cached src/pure/*.js | evidence: this report, "the SILENT half" section
The browser selftest (?selftest=1) cannot detect that the page is running an
older module: it asserts the renderer drew a frame and the haze band is armed,
both of which a stale limb.js satisfies. A check comparing window.HB.g1.pieces
against a committed expectation would catch the mixed case (the fully-stale case
is unreachable from inside the page — the document is cached too). It belongs in
src/main.js, which is fenced to task/T-021 this cycle, so T-050 did not take it.
```

## Single best next action

Get the operator in front of `01` vs `02` **after a hard reload** and ask
question 3. Every claim in T-045's report about what the pass does is true of the
build on `main` today and has never been judged by him — he has been looking at
`03`. That answer decides whether the scale work is done or whether it needs a
bigger dose, and it is worth more than any further engineering on this defect,
which has no code left in it.
