FAIL

Gate: T-021 (THE SPLIT DECISION, `?split=1` on the six-face run).
Tree under test: `.claude/worktrees/T-021` at **bb6bdd1** (whole diff
`main...HEAD`, 12 commits, two authors — reviewed as one change, not as the
last commit). Control tree: main checkout at **da29af5**.
Both smoke scripts pass, pathcheck is green, `?selftest=1` passes, the flag is
genuinely inert when off. **The gate fails on deciding test (1): the reward is
collectable from the main line with one jump, so the fork is free.**

---

## 0. Servers and commands

Worktree pinned on 8999, main pinned on 8998 (`--directory`, no `cd`), harness
run from the MAIN checkout's `tools/playtest` in every case.

```sh
# pinned worktree
(python3 -m http.server 8999)                      # cwd = .claude/worktrees/T-021
node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000 \
     --base-url http://127.0.0.1:8999 --out runs/gate-T-021-mid           # exit 0
node run.mjs scripts/transform-slice.json --deterministic --max-runtime-ms 20000 \
     --base-url http://127.0.0.1:8999 --out runs/gate-T-021-transform     # exit 0
# control (main, da29af5)
python3 -m http.server 8998 --directory /Users/scottmeyer/projects/hullbreaker
node run.mjs scripts/mid-route.json      … --base-url http://127.0.0.1:8998 --out runs/gate-T-021-mid-MAIN
node run.mjs scripts/transform-slice.json … --base-url http://127.0.0.1:8998 --out runs/gate-T-021-transform-MAIN
# the flag ON, through the shipped harness and the shipped best-measured policy
node run.mjs scripts/six-face-spaced-run.json --deterministic --stop-on-game-over \
     --max-runtime-ms 60000 --url 'http://127.0.0.1:8999/index.html?split=1&testapi=1' \
     --out runs/gate-T-021-split-policy
node tools/pathcheck.mjs                           # in the worktree: 1887 passed, 0 failed
```

No retry was needed: zero `bootError`, zero `pageErrors`, zero console errors
in every harness run (the only 404 anywhere is `/favicon.ico`, confirmed from
the static server's own log).

Gate-authored probes (mine, not the tree's), all driving the worktree's
`src/sim` with `globalThis.__HB_QUERY__='split=1'`:
`/private/tmp/claude-501/-Users-scottmeyer-projects-hullbreaker/474930e2-7e23-4651-9683-c17c797cb579/scratchpad/`
→ `gate-probe.mjs` (+`probe.json`), `gate-sweep.mjs` (+`sweep.json`),
`default-ab.mjs`, `t021gate-corners.mjs`, `t021gate-selftest.mjs`,
`t021gate-browser.mjs`.

## 1. Smoke set — PASS

| run | result | console errors | idle frac | minEdgeMargin | protoScore |
| --- | --- | --- | --- | --- | --- |
| `gate-T-021-mid` | **completed** | 0 | 0.024 | 35.42 | 86.5 |
| `gate-T-021-transform` | **completed** | 0 | 0 | 30.16 | 288.4 |

Both `"result": "completed"`, both exit 0, fidelity `testapi`, victory reached.

## 2. DECIDING TEST (1) — a main-line policy collects zero rewards — **FAIL**

This is the acceptance box's own falsifying test and CLAUDE.md's definition of
done ("prove it by driving the shipped sim headlessly with a policy that uses
every verb on by default"). Driven by me, three ways, all on the `?split=1`
build:

**(a) A blind main-line runner collects on 4/4 forks.** `gate-probe.mjs`: hold
right, hold nothing else, and tap jump on a fixed **800 ms cadence** — the
shipped `mid-route` demo's own heuristic, with no knowledge of `commitX`,
`spanX0` or `rewardX` beyond the one double jump the main line itself requires
to mount the plate. Run at four cadence phases (0/200/400/600 ms) on each of
the four forks: **16 of 16 runs walked out carrying the fork's letter**
(S / L / H / F), pickup taken in flight at x = 67.8 / 130.8 / 259.8 / 391.8.

**(b) The plate is a collection surface end to end.** `gate-sweep.mjs` sweeps
every take-off along the plate top (the main line) at quarter-tile steps, one
jump each:

| | take-offs that collect | of which land OFF the span |
| --- | --- | --- |
| double jump (jump + air jump) | **28 of 29 on every fork** | 8–9 per fork (deck, or a catwalk past the fork) |
| **single jump, air jump never spent** | **7 of 29 on every fork** | **all 7** (deck on faces 2 and 6) |

The single-jump row is the one that decides this gate. From the last ~1.5
tiles of the plate — the natural motion for leaving a platform — one jump
collects the capsule and comes down on the deck **ahead** of the fork, which is
where the main line lands anyway. Peak height on that jump is **8.61**, i.e.
RIG never even reaches the span's surface (y = 9): it does not "commit a second
time", it does not join the branch, it does not pay a tile of daylight, and the
weapon letter at the finish is the fork's own (verified per row, not inferred
from a capsule count).

**(c) The tree measures the same thing and reports it rather than gating it.**
`tools/pathcheck.mjs`'s own console note: *"swept 52 take-offs … EVERY one of
them reaches the capsule … 20 come down off it"*, routed to the operator as a
feel call. The `main` policy assertion that does gate (`main.every(r => r.took
=== 0 && r.weapon === 'R')`) is true only because that policy never presses
jump while on the plate — an assertion whose subject is the author's intended
route, which is the exact failure mode CLAUDE.md's "assert against what a
PLAYER can do" rule was written for after I-019.

Judgement: the acceptance box says *a policy that always takes the main line
collects zero rewards*, and the gate brief says *if any reaches a reward, the
fork is free and this FAILS*. It does, on all four forks, with a default verb,
without leaving the main line. This is a measured mechanical result, not a feel
call. Filed as **I-031 (S1)**.

Not in scope for this verdict, but worth stating so the fix is not
mis-aimed: entry 9 forbids pricing a reward in reach, so the fix is probably
not "raise the capsule". The measured gap is that the capsule sits over the
span but within a plain jump of the **plate**, i.e. over the main line's own
airspace. Where the reward sits horizontally (past the span's mid-point, out of
the plate's jump arc) is a lattice question for the lane, not a height one.

## 3. DECIDING TEST (2) — daylight kept / lost — **PASS (verified, not quoted)**

Re-measured with my own probe (`gate-probe.mjs`, same finish line `x1-1`, same
30-tile start, scroll advancing at `CONFIG.scrollSpeed`):

| line | daylight at the finish | min daylight | seconds | capsule |
| --- | --- | --- | --- | --- |
| main | **40.62** ×4 forks | 30.08 | 2.283 | 0 |
| reward branch | **40.62** ×4 forks | 30.08 | 2.283 | 1 (S/L/H/F) |
| dead end | **30.67** ×4 forks | 19.77 | 4.583 | 0 |

The reward branch keeps its daylight to the hundredth; the dead end loses
**9.95 tiles / 2.30 s** on every fork and still exits with 19.77 tiles in hand,
so it is a cost and not a trap. The tree's 40.6 / 40.6 / 30.7 headline is
reproduced independently.

## 4. DECIDING TEST (3) — do the assertions evaluate the `?split=1` build — **PASS**

Checked myself rather than taken from the section header:

- `tools/pathcheck.mjs` carries an explicit subject guard before any
  `.every()` over the probe's runs: `sim.split === true`, the played fork set
  pinned to the asserted fork set face-for-face and height-for-height, plus a
  per-policy cardinality check (`sim.runs.length === 7 * forks.length`) so no
  comparison can pass vacuously.
- Independently: my own child process with `__HB_QUERY__='split=1'` reports
  `SPLIT_FORKS_ENABLED = true` and **4 forks** whose geometry matches what
  pathcheck asserts (faces 1/2/4/6; commit 58/121/250/382; deck→plate +4,
  plate→span +3, capsule +1.5).
- The earlier draft's "forks straddled corners" defect is gone, verified by me
  against `wavegate.cornerEvents` (`t021gate-corners.mjs`): corners at
  89/154/219/284/349/414; every fork window ends 15–18 tiles short of its
  corner and behind its gate halt line, and **no fork straddles a bend**.

## 5. Flag off by default — **PASS**

Structural (the strong evidence): built the level in **both trees** with no
flags (`default-ab.mjs`). For the default six-face run *and* for
`?slice=traversal`, `groundH`, `platforms`, `pockets` and `solidRects` are
**identical** between main and this worktree; the only new module export is
`splitForks`, which is `[]` when the flag is off. With `?split=1` the same tree
produces different `groundH` and 4 forks, so the flag is live and is the only
subject.

Behavioural A/B (same script, `--deterministic`, both trees pinned):
`mid-route` protoScore 87.4 → 86.5, airMs 5304 → 5225; `transform-slice`
protoScore 292.3 → 288.4. Route coverage, crush margins, lives and outcome
identical. These deltas are inside the harness's own documented run-to-run band
(README honesty items 2 and 8) — with the level object proven byte-equal, they
are noise, not behaviour.

## 6. Fairness rider — my own read of the FAR screenshots

Asked as posed: *could I tell the dead end might not go through before
committing?*

- At the **commit line, cropped 3× on the fork** (my crop of
  `artifacts/t021-split/face1-commit.png`): **yes.** The deck runs under a
  shelf into a solid vertical block that closes the recess; the plate top and
  the thin span above it both carry on past that block, with the magenta `S`
  on the span. Three lanes, one silhouette, exactly as the proposal draws it.
- At the **actual FAR default, uncropped 1440×900**: **not reliably.** The
  fork is a small rust-brown L among several similar rust-brown L-shapes and
  catwalks; the deck's checkerboard band reads as continuous behind it, and I
  only located the seal after computing where it should be and cropping to it.
  RIG is ~20 px in a 900 px frame (~2.2 %, under the 3–5 % invariant — a
  property of the operator-frozen FAR camera, not of this task).
- The `approach` frame (14 tiles out, the frame the fairness rider is aimed at)
  is the weaker of the two: the capsule reads, the seal does not.

The capsule is a strong "reward up there" mark; what is faint at FAR is the
**risk** mark, which is the half entry 11 actually requires. I am not failing
the gate on this — it is a readability judgement and the operator is the oracle
— but it is filed as **I-032 (S3, art)** with the crops, and it is question 1
below. Note the capture rig's own honesty caveat: RIG is *parked* in those
frames, so they prove what is on screen, not what a moving player can read.

## 7. Screenshots and the render rules

Judged `face1-approach/commit/cave/plate/span`, `face1-zip-*`, `face2-zip-gate`
(the tree's), plus my own crops:

- **Style vs `docs/concept-art/`**: consistent with boards 01/10/13 — deep-teal
  atmosphere, rust-orange metal, magenta pickup, acid-green hostiles. The fork
  introduces no new colour role and no untokenized material. Silhouettes are
  connected to the hull (the plate is carved out of the deck run, not floated).
- **Anatomy that assembles (decisions entry 3)**: none observed. The fork's
  solids are static geometry; `face2-zip-gate.png` is the load-bearing frame —
  under `?zip=1`, at the halt line before an unbuilt face, fork 2's columns are
  **empty**, so no plate or seal hangs in mid-air ahead of the anatomy it
  belongs to. On the shipped default reveal both hooks are short-circuited.
- **Glitches**: none — no z-fighting, no orphan geometry, no missing RIG (the
  earlier invisible-rig capture bug is fixed and disclosed in the rig header).
- **Pacing dead spot, flag ON only**: `runs/gate-T-021-split-policy` — the
  shipped best-measured reflex policy (`six-face-spaced-run.json`, unmodified)
  jams against the seal at **x = 63.649** and spends all three lives there;
  `maxX` 63.649, idle fraction 0.297, never past fork 1. The same policy on a
  flag-off tree reaches wave gate 2 / scroll 140. The tree discloses this in
  `split-main-line.json`'s own description, and I read it as the mechanic
  working (the deck lane *is* the wrong branch, and a reflex bot cannot express
  "reverse 4.5 tiles and double jump") plus T-018's documented bot limit — not
  as a defect, and not as evidence about a human. It does mean **no bot has
  played this fork end to end**, which the operator should know before judging.

## 8. Everything else green

- `node tools/pathcheck.mjs` in the worktree: **1887 passed, 0 failed**, exit 0.
- `?selftest=1`: **SELFTEST PASS (29 checks)** default, **PASS (29)** with
  `&split=1`, **PASS (31)** on `?slice=traversal&selftest=1&split=1`.
- Console: 0 errors on every URL exercised (`?testapi=1`, `?testapi=1&split=1`,
  all three selftest URLs, both smoke runs, the policy run); 19 AudioContext
  autoplay warnings, which are the headless-Chrome norm here, and one
  `/favicon.ico` 404.

## 9. Feel questions for the operator (never gated here)

1. **Fairness rider, at speed:** at the FAR default, 14 tiles out, can you tell
   the deck lane is sealed *before* you commit — or does it only read once you
   are inside it? (`artifacts/t021-split/face1-approach.png`, `-commit.png`.)
2. **Is a free capsule one jump off the main line acceptable?** Entry 9 says
   never price a reward in reach and entry 12 says the price is pressure — if
   so, the acceptance box's "main line collects zero" may be the wrong gate and
   should be replaced by a new decision entry rather than satisfied by geometry.
   That is a call only you can make.
3. **Dead-end cost:** 2.3 s and ~10 tiles of daylight, with hostile-proximity
   frames 1.9× the main line's — too cheap, about right, or too punishing given
   a non-dodging bot loses a life in 3 of 4 dead ends?
4. **Density:** 4 forks on 6 faces (faces 1/2/4/6), one per face where a legal
   window exists. Does that read as "lots of split decisions" (entry 10), or is
   the skipped-face gap noticeable?

## 10. Issues filed

- **I-031 | bug | S1** — the reward is collectable from the main line with one
  jump; the falsifying test in T-021's acceptance box is not met.
- **I-032 | art | S3** — the seal (the risk half of the fairness rider) is hard
  to read at the FAR default, uncropped.
