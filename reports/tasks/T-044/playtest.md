PASS

## What was gated

Task/T-044 (`task/T-044` @ `03b775e`, worktree
`/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-044`) — ARRIVAL
catwalks and escalating ARENA fighting grounds at each corner reveal /
wave gate. Read `docs/LANE-BRIEF.md`, `reports/tasks/T-044/build.md`, the
APPROVE review at `reports/tasks/T-044/review.md`, and `docs/decisions.md`
entries 3 (static anatomy), 17 (FAR stays), 19 (distribution, not mean)
before gating.

**Pinning.** Worktree HEAD confirmed at `03b775e` (`task/T-044`), `git
status --short` clean before I started except the two items review.md
already flagged as pre-existing debris (`reports/tasks/T-044/review.md`
itself, untracked, and a stray `tools/pathcheck/t-044-corner-reveal-set-
pieces.mjs` — neither mine, neither touched). Served with the worktree's
own `node tools/serve.mjs 8790 --quiet` (port 8790, never 8741/8742),
killed after every use. Ran the **main checkout's** `tools/playtest`
harness against it with `--base-url http://127.0.0.1:8790` throughout, per
my own instructions ("never test a moving tree"). For the merge-base
comparison, `git worktree add --detach /tmp/hb-pin-t044-base
69e1f906262cdebd4bbc7f83f0dd27885e8baa92` (build.md's own merge-base),
served on port 8791, worktree removed after.

## 1) Play it, don't just measure it

Ran real Chrome (Playwright CDP, `channel: 'chrome'`) through `six-face-
aimed-run.json` and `six-face-full-run.json`, `--deterministic`, plus the
worktree's own `tools/playtest/t044-capture.mjs` rig, which drives the same
reflex directly and screenshots RIG's position live. Independently
reproduced (not just re-viewed) the build report's evidence:

- `reports/tasks/T-044/qa-evidence/screenshots/f2-arrival-qa-repro.png` —
  RIG standing on the face-2 ARRIVAL catwalk right after corner 1 (shot at
  x=94.1, scrollX=86.1), pink `H` capsule ahead, a hound below. Matches
  `artifacts/t044-corner-reveal/f2-arrival.png` in kind.
- `reports/tasks/T-044/qa-evidence/screenshots/f2-arena-qa-repro.png` —
  mid-fight inside the face-2 ARENA (x=124.4, scrollX=100.0): several
  catwalk bands visible at once, capsule and hostile markers in frame, the
  deck reads as one connected checkered structure, not floating
  rectangles.
- `artifacts/t044-corner-reveal/f2-arena-wave-death.png` (already
  committed) — checked directly: clean "SIGNAL LOST" overlay, no visual
  glitches, consistent stat block (140m, 13 kills, died in WAVE 2/6).

**Operator-only observation, not part of this verdict:** the face-2 ARENA
screenshot reads to me as a genuine multi-tier fighting space (cover at
different heights, a capsule placed mid-arena) rather than "more
platforms," but that judgment belongs at the operator checkpoint per
build.md's own open question #2 — I am not treating my read as a verdict.

**Same ceiling the build report found, confirmed independently:** no
policy available in this repo — mine included — gets past wave gate 2
(corner 2, x≈152-154); every aimed/full run I drove, on both trees, dies
there or earlier. Faces 3-6 remain screenshot-unverified by me too, for the
same reason build.md discloses. I did not find a way around this
limitation, which corroborates that it is real rather than an artifact of
the build's own bot.

## 2) Reachability proven by PLAY, not by authored geometry

- Reproduced `node tools/pathcheck.mjs` in the worktree: **1759 passed, 0
  failed** — matches build.md and review.md exactly. This run embeds and
  executes the T-044 "driven proof": a headless sim run using only already-
  taught verbs (hold right; jump on a gap or denied step ahead), hostiles
  removed every frame (route-only, explicitly not a combat claim — the
  comments are honest about this per the review's fix). It crosses the
  whole six-face lattice with ARRIVAL/ARENA installed, reaches the outro
  scroll end, and takes genuine `onOneWay` contact on 4 of the 17 new
  platforms (`arena-f5-mid`, `arena-f6-mid`, `arrival-f4`, `arrival-f6`).
  I read this code directly (`tools/pathcheck.mjs:9237-9463`) rather than
  trusting the count: the assertions are real and match what the report
  and review describe.
- Additionally drove a **live browser** run to the same effect
  (`t044-capture.mjs`): RIG genuinely stands on the ARRIVAL catwalk and
  lands inside the ARENA via real jump arcs from a real Chrome physics
  step — not merely present in `buildLevel()`'s output.
- I did **not** personally re-run the build's break/restore proof for the
  clear-then-install regression (reintroducing the bug requires editing
  `src/pure/lattice.js`, which is outside my charter — I don't edit `src/`
  even temporarily). The regression-guard assertion for exactly that
  platform (`tools/pathcheck.mjs`'s named bridge-survival check,
  `x0===319 && x1===326 && y≈4.35`) passed in my own run of pathcheck, and
  I confirmed by reading `latticeInstallSite` that it only ever pushes,
  never clears — same limitation the review noted, unchanged by me.

## 3) The distribution, not a mean (entry 19) — reproduced, with a caveat

Ran my own independent n=5-per-cell batch (not interleaved — a second,
independent non-interleaved session) against the exact same two pinned
commits build.md used. Full numbers, method, and analysis:
`reports/tasks/T-044/qa-evidence/distribution-repro.md`; raw reports under
`reports/tasks/T-044/qa-evidence/{aimed,full}-{base,branch}-{1..5}/`.

| policy | tree | n | values (scrollX) | floor | ceiling | gate-2 clears |
| --- | --- | --- | --- | --- | --- | --- |
| aimed | base | 5 | 95.674, 140, 140, 140, 140 | 95.67 | 140 | 0/5 |
| aimed | branch | 5 | 140, 140, 140, 114.017, 126.652 | 114.02 | 140 | 0/5 |
| full-run (weak) | base | 5 | 140, 75, 75, 75, 75 | 75 | 140 | 0/5 |
| full-run (weak) | branch | 5 | 140, 140, 98.207, 75, 140 | 75 | 140 | 0/5 |

The base weak-policy row is an **exact** match to build.md's own reported
row (`140,75,75,75,75`) — good evidence the setup is faithfully pinned.
But **my batch shows zero gate-2 clears on either tree, for either
policy** — no visible branch advantage this session, including for the
weak policy where build.md reported a 171.7 clear. This does **not**
contradict build.md/review.md, which already document batches with no
effect at all (their own interleaved control: 1/5 both trees; one of their
own aimed-branch batches: `140,140,140,140,140`, zero clears). It is one
more data point in the same noisy picture — read it alongside the existing
batches, not instead of them. Folding it into the pooled aimed-policy count
(previously 18/side): base 2/18→2/23 (8.7%), branch 6/18→6/23 (26.1%) —
same direction, smaller margin, continuing the downward trend the report's
own revision history already shows (~5x→~3x). **This further weakens, but
does not resolve, the "does the branch raise the ceiling" question** —
which decisions.md entry 19 already assigns to the operator, not to this
gate. Per that entry's own text on T-044 ("the operator decides on the
distribution"), I am not treating an unresolved distribution question as a
FAIL condition; I am reporting it plainly so the operator has my numbers
in addition to the report's.

## 4) Softlocks and stuck states — the durability lens

No wedge or stuck-alive state found **in the new ARRIVAL/ARENA geometry
itself** across all 22 runs (20 distribution runs + 2 smoke runs) or the
two live capture runs. The new platforms use the same one-way/droppable
convention (`DROP down+jump on catwalks`, visible in the HUD tooltip in
every screenshot) as every existing catwalk, and pathcheck's own
reachability/stranding sweep (`latticeUnreachable`/`latticeStranded`)
explicitly includes the 17 new platforms at 0/0.

**New finding, filed to Inbox, out of scope for this task's verdict:** 3 of
my 20 distribution runs (`full-base-2`, `full-base-3`, `full-base-4` — the
UNMODIFIED merge-base tree — plus `full-branch-4`) never reached
GAME_OVER: the weak policy spends 2 of 3 lives, then sits alive, pinned at
essentially one x position (58.94-59.99, scrollX=75.0 — **wave gate 1**)
for 160-200+ seconds with flat hp/lives and zero progress, until the run
hits its time cap (`meta.stopReason: "script-window"`, not `"game-over"`).
This reproduces on the **unmodified merge-base**, so it predates T-044 and
is not caused by ARRIVAL/ARENA (which start well past scroll 75). See
`reports/tasks/T-044/qa-evidence/distribution-repro.md` for the full
writeup and caveats (the weak policy structurally has no vertical-aim
verb, so this is evidence of a possible dead spot, not proof a human gets
wedged the same way).

## 5) Static anatomy (entry 3)

Confirmed structurally: `ARRIVAL`/`ARENA` are added once inside
`buildLevel()` (`src/pure/generator.js`), `latticeInstallSite` only ever
pushes (never clears/rewrites `groundH`), and nothing in the diff touches
a per-frame render or update path — same as the review's independent
finding. Empirically: my two separately-driven runs through the same face-2
geometry produced pixel-consistent brick/catwalk shapes at the same
positions (differing only in RIG's pose, hp, kill count — i.e., in
gameplay state, not terrain). I did not do a live headed frame-by-frame
watch session (would need a long headed run); relying on the code-level
absence of any per-frame mutation path plus stable repeated captures.

## 6) Regression

- `node tools/pathcheck.mjs` in the worktree: **1759 passed, 0 failed**
  (reproduced myself, matches build.md/review.md).
- `index.html?selftest=1`: **SELFTEST PASS (29 checks)** (reproduced
  myself via a throwaway Playwright script against the pinned server;
  script discarded after, nothing committed from it).
- Smoke set, run from the **main checkout's** harness against the pinned
  worktree (`--base-url http://127.0.0.1:8790 --deterministic`):
  `scripts/mid-route.json` and `scripts/transform-slice.json` both
  `outcome: completed`, `stopReason: victory`, 0 `pageErrors`.
- Across all 22 runs I collected (20 distribution + 2 smoke): **zero**
  `pageErrors`, `consoleErrors`, `teardownErrors`, or `bootError` anywhere.

**Migration note, deliberately not actioned by me.** The team-lead's brief
flagged that `main` has since split `tools/pathcheck.mjs` into
`tools/pathcheck/` modules and pointed at
`scratchpad/migrate-lane.mjs task/T-044 --commit`. I did not run it:
that script performs a real `git merge` of `main` into the task branch and
`git commit`s the result, which is an integration action outside my
charter ("never edit `src/`, fixtures, or tuning — only report files,
playtest scripts, and SPRINT's Inbox") and outside what a playtest gate
should be doing unilaterally. What I *can* and did verify is that
pathcheck is green **as currently committed** in the worktree, matching
build.md/review.md exactly. The monolith-vs-module reconciliation against
main's later split is exactly what review.md's own top finding already
names as the integrator's job before `merge-task.sh`, not a playtest
concern — I'm not treating it as new information, just confirming I saw
it and left it for whoever runs the merge.

## Verdict: PASS

Every hard-gate item is green and independently reproduced: pathcheck,
selftest, the two smoke scripts, layer purity/determinism (unchanged,
confirmed by the review and by pathcheck's static guards passing in my own
run), static-anatomy compliance, and — the strongest part of this task's
own evidence standard — reachability of the new set pieces proven by real
play (both a headless every-verb-taught policy and a live browser bot),
not merely by authored geometry. No softlock exists in the new terrain
itself. The one open question (does the branch measurably raise the
gate-2 ceiling) is a distribution question decisions.md entry 19 already
assigns to the operator, not a pass/fail gate, and my own data — reported
plainly above, not smoothed over — makes that question a bit more open,
not less, which is exactly the kind of finding this project's evidence
standard asks for rather than penalizes.

## Operator checkpoint items (feel — not decided here)

Carried from build.md's open questions, plus my own read, all unresolved:
1. Does the measured shape (ceiling maybe raised, floor mostly holds, but
   noisier than the previous revision claimed — see my distribution-repro
   numbers above) match "sometimes two or three faces, sometimes not past
   the first" (entry 19), or does the floor need pinning down harder first?
2. Does the face-2 ARENA read as "the ship is fighting me here on purpose"
   rather than "busier platforms" — my own read (not a verdict) leaned yes;
   the operator's is the one that counts.
3. Is the ARRIVAL catwalk legible as "the world already existed, revealed"
   at a glance, at speed?
4. Faces 3-6 remain unverified by screenshot by both the build and this
   gate, for the same documented reason (the wave-gate-2 bot ceiling) —
   worth a manual pass before judging the full escalation.
5/6. Whether ARENA verticality must be proven "never the only path," and
   whether "tallest yet" needs literal Y-monotonicity vs. structural
   escalation (face 6's peak sits lower than face 5's for this seed).

## Commands run (for reproduction)

```
# pathcheck + selftest, in the worktree
cd .claude/worktrees/T-044 && node tools/pathcheck.mjs
node tools/serve.mjs 8790 --quiet &   # then load ?selftest=1 in a browser

# smoke set, from the MAIN checkout, against the pinned worktree
cd tools/playtest
node run.mjs scripts/mid-route.json --deterministic --base-url http://127.0.0.1:8790
node run.mjs scripts/transform-slice.json --deterministic --base-url http://127.0.0.1:8790

# distribution reproduction (5 each), branch on 8790, merge-base 69e1f90 on 8791
node run.mjs scripts/six-face-aimed-run.json --deterministic --stop-on-game-over \
  --max-runtime-ms 245000 --base-url http://127.0.0.1:8790
node run.mjs scripts/six-face-full-run.json  --deterministic --stop-on-game-over \
  --max-runtime-ms 245000 --base-url http://127.0.0.1:8791

# live capture, from the worktree (own ephemeral server, no port conflict)
cd .claude/worktrees/T-044/tools/playtest && node t044-capture.mjs
```

## Evidence paths

- `reports/tasks/T-044/qa-evidence/distribution-repro.md` — full numbers,
  method, and the pre-existing gate-1 wedge writeup.
- `reports/tasks/T-044/qa-evidence/{aimed,full}-{base,branch}-{1..5}/` —
  raw `report.json`/`summary.md` for all 20 distribution runs.
- `reports/tasks/T-044/qa-evidence/smoke-mid-route/`,
  `.../smoke-transform-slice/` — smoke-set raw reports.
- `reports/tasks/T-044/qa-evidence/screenshots/f2-arrival-qa-repro.png`,
  `f2-arena-qa-repro.png` — independently-captured live screenshots.
- `artifacts/t044-corner-reveal/` (already committed by the build) —
  reviewed directly, consistent with the above.

## PROPOSED INBOX ISSUES

## I-??? | bug | S2 | repro: `cd tools/playtest && node run.mjs scripts/six-face-full-run.json --deterministic --stop-on-game-over --max-runtime-ms 245000 --base-url <pinned-server>` against merge-base commit `69e1f906262cdebd4bbc7f83f0dd27885e8baa92` (reproduced 3 of 5 tries; also 1 of 5 on `task/T-044` @ `03b775e`, so pre-existing on `main`-equivalent code, not T-044's terrain) | evidence: reports/tasks/T-044/qa-evidence/distribution-repro.md, reports/tasks/T-044/qa-evidence/full-base-{2,3,4}/report.json, reports/tasks/T-044/qa-evidence/full-branch-4/report.json

The default six-face run's weak (no-vertical-aim) reflex policy can get
wedged ALIVE at wave gate 1 (x≈58.9-60.0, `scrollX`=75.0) for 160-200+
seconds of a 245s run with hp and lives completely flat and zero forward
progress, instead of reaching `GAME_OVER` — `meta.stopReason` reads
`"script-window"` rather than `"game-over"` in the affected runs, and
`trace[]` shows the exact same x to two decimal places for the entire
stall window. This reproduces on the **unmodified merge-base**
(`69e1f90`), so it is not caused by T-044's ARRIVAL/ARENA terrain (which
begins well past scrollX 75). Caveat, stated plainly: the "weak" policy
deliberately has no vertical-aim rule at all (that is what makes it a
stand-in for a weaker player in this project's own difficulty-measurement
methodology, per `reports/tasks/T-044/build.md`), so a real player — who
always has that verb — may not get stuck the same way; this is evidence of
a possible dead spot at wave gate 1 worth a human/stronger-bot check, not
proof of a player-reachable softlock. Given the PLAYER MODEL block in
SPRINT.md explicitly calls out "a safe spot nothing can reach" as a thing
to hunt for, this is worth triaging even with that caveat. Fix direction:
someone with combat/hostiles context (T-043's lane, or a future gate-1
AI/composition pass) should drive `full-base-3` or `-4`'s exact trace
(`reports/tasks/T-044/qa-evidence/full-base-3/report.json`) through
`analyze-run.mjs` to see what's adjacent to RIG during the stall and
whether a real player's aim would actually break it.
