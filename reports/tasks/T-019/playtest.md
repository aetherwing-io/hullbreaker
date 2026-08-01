PASS

# T-019 playtest gate

Gate for T-019 (harness, P2 — "the last unproven delivery box: a bot run that
reaches VICTORY"). The builder's answer is the **negative** branch of the task's
own accept list: no reflex policy reaches VICTORY, the wall is wave gate 2, and
the box must be answered by an operator run. That claim is well evidenced by the
builder *and independently reproduced by this gate*, so it passes on the "a
well-evidenced 'a human must play this' is a pass" clause. Two S3 issues filed
(I-027, I-028); neither touches the finding's conclusion.

Tree under test: worktree `.claude/worktrees/T-019` at `6ad3fc5`, pinned and
served with `python3 -m http.server 8991` (curl-proven: `HTTP 200` on
`/index.html`, and `/tools/playtest/scripts/six-face-spaced-run.json` — a file
that exists only on this branch — served from the pin, so every run below is
against this build and not the moving main checkout).

## Run commands

Required smoke set — the MAIN checkout's harness against the pin:

```sh
cd /Users/scottmeyer/projects/hullbreaker/tools/playtest
node run.mjs scripts/mid-route.json       --deterministic --max-runtime-ms 15000 \
  --base-url http://127.0.0.1:8991 --out runs/gate-T-019-mid
node run.mjs scripts/transform-slice.json --deterministic --max-runtime-ms 20000 \
  --base-url http://127.0.0.1:8991 --out runs/gate-T-019-transform
```

Both exited 0, both `"result": "completed"` in `report.json`, `testapi` fidelity,
`bootError: null`, zero page/console errors, no retry needed.

Claim verification — the shipped policy, run by this gate (worktree harness, the
one whose sampler/threat changes are under review):

```sh
cd /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-019/tools/playtest
for i in 1 2 3; do node run.mjs scripts/six-face-spaced-run.json --deterministic \
  --stop-on-game-over --max-runtime-ms 145000 --base-url http://127.0.0.1:8991 \
  --out .../gate-T-019-spaced-$i; done
```

Cross-check with the **unmodified main-checkout harness** (no T-019 sampler
change) on the same pin, to isolate a variable the finding says it did not:

```sh
cd /Users/scottmeyer/projects/hullbreaker/tools/playtest
node run.mjs scripts/six-face-aimed-run.json --deterministic --stop-on-game-over \
  --max-runtime-ms 145000 --base-url http://127.0.0.1:8991 --out runs/gate-T-019-aimed-mainharness
```

Demo-script regression under the changed harness:

```sh
cd /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-019/tools/playtest
node run.mjs scripts/mid-route.json       --deterministic --max-runtime-ms 15000 --base-url http://127.0.0.1:8991 --out .../gate-T-019-mid-t019harness
node run.mjs scripts/transform-slice.json --deterministic --max-runtime-ms 20000 --base-url http://127.0.0.1:8991 --out .../gate-T-019-transform-t019harness
```

Headless gate: `node tools/pathcheck.mjs` in the worktree — **1529 passed, 0
failed, exit 0**.

## Evidence

- `tools/playtest/runs/gate-T-019-mid/`, `.../gate-T-019-transform/` — required smoke set (report.json, summary.md, screenshot.png)
- `tools/playtest/runs/gate-T-019-spaced-{1,2,3}/` — this gate's three runs of the shipped policy, with `analysis.txt` from `analyze-run.mjs`
- `tools/playtest/runs/gate-T-019-aimed-mainharness/` — the same fight driven by the unmodified main harness
- `tools/playtest/runs/gate-T-019-{mid,transform}-t019harness/` — demo scripts replayed through the changed harness
- Builder's committed evidence, read and cross-checked: `docs/playtests/2026-08-victory-box.md`, `tools/playtest/reports/t019/{README.md,all-runs.md,gate2-cleared/,six-face-{aimed,spaced}-run/}`

## 1. Integrity

- `git diff --stat main...HEAD -- src/` is **empty**, and so is the two-dot
  `git diff main HEAD -- src/` — the worktree's `src/` is byte-identical to
  current `main` (`17142b2`), not merely to the merge base. The game under test
  is main's game; no CONFIG constant, no wave gate, no movement constant is
  touched anywhere in the diff (`git diff --name-only` has zero `src/` entries).
- **Every new policy clause is relative geometry.** The three clauses
  `six-face-spaced-run.json` adds over T-018's script are
  `threat.dist<2.2 && threat.dx>0 && edgeMargin>6`, `threat.dist<2.2 && threat.dx<0`,
  and `pinned && terrain.stepUp>0.5` (replacing a bare `pinned`). No literal x,
  scroll distance, clock time or step index appears in either six-face script;
  the only static timeline in both is `hold fire`.
- **The anti-scripting guard has teeth beyond its own self-test.** I planted
  three cheat scripts as real `six-face-*.json` files in the worktree and ran
  pathcheck: an absolute-position clause (`grounded && x>140`), a timed raw
  movement event (`{t:900, keydown, ArrowRight}`), and a clock-time clause
  (`gameMs>45000`) each drove pathcheck to **exit 1**, e.g.
  `FAIL T-019: six-face-gatecheck-TEMP.json is driven by relative geometry and
  body state only … [clause "x>140" names something that is not relative geometry
  or body state]`. Temp files removed; worktree `git status` clean afterwards.
- **Misfire hunt on the new geometry.** The one threshold that could silently
  fail elsewhere on the run is `terrain.stepUp>0.5` — if the level contained a
  step in `(0, 0.5]`, RIG would be pinned by it and the rule would never answer.
  Computed from the shipped generator itself
  (`buildLevel(CONFIG)`, `src/pure/generator.js`): the level's **only** nonzero
  ground deltas are `-2, -1, +1, +2` (7/24/24/7 occurrences over 445 columns).
  The 0.5 threshold sits in an empty dead band, so on this generator the clause
  cannot fail to answer a real step or fire on a non-step. The level is seeded,
  so this holds for the whole run, every run.
- The one misfire I *could* construct is a rule-cancellation window, not a
  scripting violation: `edgeMargin<8 → hold right` and
  `threat.dist<2.2 && threat.dx>0 && edgeMargin>6 → hold left` overlap in
  `6 < edgeMargin < 8`, where both keys go down and RIG stands still — inside
  the crush-avoid rule's own emergency window. Measured on my run 1: **3 of 777
  PLAYING ticks** (min `edgeMargin` there 7.37; run minimum 3.52), no death
  attributable to the edge. Filed as I-028 (S3).

## 2. Honesty of the claim

The builder claims a reflex policy **cannot** do it. Verified three ways.

**(a) Reproduced the wall, four independent runs, both harness versions.**

| run | harness | survived | scroll | gates seen | kills | lives | terminal state | VICTORY samples |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| spaced-1 | T-019 | 58.9 s | 140 | 1,2 | 14 | 3→0 | GAME_OVER | 0 |
| spaced-2 | T-019 | 54.3 s | 140 | 1,2 | 14 | 3→0 | GAME_OVER | 0 |
| spaced-3 | T-019 | 38.2 s | 79 | 1 | 8 | 3→0 | GAME_OVER | 0 |
| aimed | **main (unmodified)** | 47.7 s | 140 | 1,2 | 9 | 3→0 | GAME_OVER | 0 |

No run produced a single `state === 'VICTORY'` sample; every one ended on the
`SIGNAL LOST` overlay with all three lives spent. The game's own end screen
corroborates the trace independently of the harness: `WAVE 2/6 — 5 HOSTILES`,
`DISTANCE 140m`, `DEATHS 3` (`gate-T-019-spaced-1/screenshot.png`).

**(b) The arithmetic checks against the source, not just the report.**
`CONFIG.waves.baseSize 3 + sizePerWave 1` with the authored `comp` table gives
4+5+6+7+8+9 = **39** gating bodies; `maxHealth: 3, lives: 3` = **9** hits;
`gateDiveCooldownMs: 1100` is the 1.1 s re-dive the finding cites; and
`HALT_S = 75,140,205,270,335,400` (asserted at `tools/pathcheck.mjs:213`), so
"scroll 140" really does mean "reached gate 2, never cleared it" and T-018's
"scroll 205" meant gate 3. The claimed exchange rate (needs ~6 kills per hit,
measures ~1.3) follows from numbers that are all authored, and my own runs land
in the same band (0.9–1.6 kills per hit).

**(c) They did not give up early.** 53 runs across 13 policy variants, plus a
`--sample-ms 40` latency control, each variant differing by one idea — including
the strafe-lock servo that produced the single gate-2 clear and is committed with
its script even though it lost. `tools/playtest/reports/t019/all-runs.md` carries
one row per run, and the four post-review re-verification runs are listed apart
from the corpus rather than folded into its medians.

**One variable the finding left open, now half-closed.** §4.2 says T-018's
unreproduced gate-3 run differs from T-019's runs in two uncontrolled ways: a
different tree, and T-019's own `terrain.gapDist` change. My aimed-run
cross-check used the **unmodified main-checkout harness** (old `gapDist`
semantics) against the current tree and still died in gate 2 at scroll 140. That
does not prove which variable mattered, but it does exonerate the probe change
as a sufficient explanation: with T-018's exact harness behaviour, the current
build still walls at gate 2.

## 3. Regression: committed demo scripts

`mid-route` and `transform-slice` compared three ways — the committed
`reports/demo/` baseline, the main harness against the pin, and the changed
T-019 harness against the pin. Every structural field is identical in all three:
`result` (completed), `attempts` 1, `falls` 0, fidelity `testapi`, `deaths` 0,
route `routeIds` and the full matched-connector list, dare-pocket entered/reward,
final kills, zero `missingFieldWarnings`, no `bootError`. The only deltas are
`minEdgeMargin` within **0.08 tiles** (35.44/35.44/35.41 and 30.13/30.17/30.09)
and the pacing band the README already documents as run-to-run noise (idle
fraction, protoScore, air jumps). Nothing in the changed sampler/driver moved a
structural outcome.

## 4. Screenshots

Judged `gate-T-019-mid`, `gate-T-019-transform`, and `gate-T-019-spaced-1`.
Since `src/` is byte-identical to main, these can only differ from main's frames
by run variance, and they do not: flat-shaded connected hull decks with the rust
checker reading cleanly at the FAR default, wasps legible as acid-green wedges
against the teal ground plane at a few percent of screen height, RIG within the
3–5 % invariant, HUD and overlay type crisp at 1280×800 and 1440×900. No
z-fighting, no popping, no floating fragments, and **nothing assembling** — the
deck and the far hull are simply present at every frame, consistent with
`decisions.md` entry 3 and boards 13/14. No style break to report.

## 5. Not gated here — routed to the operator

Feel is not this gate's call, and nothing below is a defect:

- The builder's operator packet (`docs/playtests/2026-08-victory-box.md` §6) has
  the URL and five questions. It still needs a SPRINT checkpoint-queue entry —
  integrator scope, and the reviewer already flagged it.
- My runs add one datum for question 2: the run reaches the gate-2 wall having
  spent all three lives in 38–59 s, and in my three runs 6 of 9 hp losses landed
  while airborne inside a gate, mostly to `wasp/dive` at 1.0–2.4 tiles.
- Question for the same packet, from run spaced-3: a full life can also go in
  **gate 1** (scroll 79) on the same build and script — the fight's outcome
  varies by a whole gate between identical runs. Whether gate 1 should be that
  swingy is a feel call, not a bot call.
