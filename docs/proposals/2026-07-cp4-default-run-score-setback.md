# CP4 recommendation — score and setback in the default six-face run

**Status: defended proposal, awaiting the CP4 operator verdict. The
promotion is built and gated; nothing here is canon until the operator
picks.** Prepared July 31, 2026 by the `gameplay-engineer` agent (T-016),
**evidence corrected and re-measured August 1, 2026** in that task's fix
cycle (see the Correction box under "Evidence" — the mechanics are unchanged;
the numbers were wrong). It promotes the two CP1 prototypes-for-testing from
[`2026-07-score-and-setback.md`](2026-07-score-and-setback.md) (A.4 CHARGE/
THREAT, B.1 HULL FALLBACK tier 1) out of the traversal slice and into the
default six-face run, per that proposal's own recommendation (A.2's
"Architecture 2 as the spine"; B.8's "top two: B.1 and B.6"). The operator's
standing constraint (decisions.md entry 0a) is honored: stock
lives-and-checkpoints is not the *answer* here — it survives only as the
escalation ceiling under tier 1 until B.6 (or tier 2) replaces it, which is
one of the CP4 questions below.

## What is now runnable

| URL | What it plays |
| --- | --- |
| `index.html` | The shipped run, byte-for-byte: stock 3 lives, no meter. |
| `index.html?score=1` | CHARGE/THREAT in the full run, priced by the **run tune**. |
| `index.html?fallback=1` | HULL FALLBACK tier 1 replaces the death-respawn, with the stock lives path as its ceiling tier. |
| `index.html?score=1&fallback=1` | The CP4 candidate: both together. |

Both flags are **off by default** in the run (hard rule: unjudged behavior
behind query flags). The traversal slice keeps its exact shipped behavior:
its meter stays on the A.4-scaled slice tune, and its fallback stays
on-by-default with the 650 ms retry as *its* ceiling.

## What the promotion actually changed

1. **Two tunes, one grammar** (`src/pure/score.js`). CONFIG.score's gains
   and drain are A.4's table doubled for the 4–12 s slice pass, and A.4 is
   explicit those numbers must not carry to the full game. The run prices
   the same event set with `SCORE_RUN` — A.3's un-doubled table (airborne
   kill +14, drain −7 moving / −22 stopped). Everything structural —
   notches, THREAT prices, classification ladder, windows, ring buffer — is
   byte-identical between the tunes and asserted so in pathcheck, which
   keeps slice and run event streams comparable event-for-event.
   `HB.score.snapshot().tune` says which tune priced a trace.
2. **Fallback with a real ceiling** (`src/sim/player.js`, `src/mode.js`).
   `hullFallback` now reports whether it absorbed the setback; past
   `maxConsecutive` un-recovered fallbacks (or trapped with nowhere lower)
   the caller escalates — the slice retries as before, the run spends a
   stock life. The run tune (`RUN_FALLBACK`, `src/pure/score.js`) is
   value-identical to the slice's fixture tune for this first judged pass —
   one grammar at two timescales, not two grammars — and pathcheck asserts
   the equality so a divergence must be deliberate.
3. **Telemetry made honest in every mode** (`src/main.js`,
   `src/sim/player.js`): setback stats and the closest-crush margin now
   reset per run and track in the default run, so the A.5 snapshot the
   harness reads is real there. The A.5 read surface (`HB.score.events`,
   `HB.score.snapshot()`, `?testapi` `score` block) had already shipped;
   the playtest harness now consumes it (README hook request #3 closed),
   so `protoScore` is the game's own event-derived number on any
   `?score=1` run. **What is still not honest in every mode, stated plainly:**
   the *death* counter. `sliceStats.attempts` is incremented only inside
   `if (ACTIVE_FIXTURE)`, so nothing on a default-run trace counts a stock
   death; the harness now derives that from the HUD's `×N` lives readout
   (`metrics.lives`), and publishing `player.lives`/`hp` on the frozen
   `?testapi` channel is filed as playtest README hook request #9. Fixing it
   game-side is deliberately *not* in this task — it would be an untested
   telemetry change riding a decision packet.

Layering rules hold: CHARGE still gates only the weapon (fire interval,
launch shock), never movement constants; events are emitted at the existing
decision sites; the meter steps on real dt (CHRONO cannot inflate it); no
render/UI file changed.

## Evidence

> **Correction (fix cycle, Aug 1 2026).** The first version of this table
> claimed the flags-off baseline ran "0 deaths". It did not: it spent **two
> of three stock lives**. The error came from reading the playtest report's
> `deaths` field, which is derived from `sliceStats.attempts` — a counter
> `src/main.js` increments only inside `if (ACTIVE_FIXTURE)`, so it is
> structurally `0` on a default six-face run no matter what happens. Every
> number below has been re-measured on this branch's tip with a failure
> counter that works outside fixtures (`metrics.lives`, parsed from the HUD's
> own `RIG ▰▰▰ ×N` readout; see `tools/playtest/README.md`), and the
> artifacts are committed under `tools/playtest/reports/cp4/` rather than the
> gitignored `runs/`. The corrected A/B is a *sharper* argument for the
> promotion than the wrong one was — see "Recommendation".

`node tools/pathcheck.mjs` — 798 assertions green at this branch's tip
(693 were this task's own count before `main` merged in T-004/T-012/T-007/
T-015; the suite is shared), including new ones for:
the run/slice tune relationship (halved gains and drain, identical
structure), the run fallback tune, and two headless default-run children
proving: the run tune actually prices the stream (+14 airborne kill, not
+28); a lethal hit with `?fallback=1` keeps lives and control, refills hp,
pays altitude (or margin on the lowest route), drops CHARGE to the floor,
and emits the A.5 `setback` envelope; the third consecutive un-recovered
death crosses the ceiling into the stock lives tier; and with no flags the
default run is the shipped stock path with a fully inert meter.

Bot runs (~31 s window, `--deterministic`, real Chrome). **Zero console
errors, zero page errors and no bootError in all eleven runs made for this
document** — the five default-run rows below, the repeat that measures the
variance, the slice tune check, and two rounds of the two slice smokes.
Artifacts and a regeneration recipe: `tools/playtest/reports/cp4/`
(`summary.md` for every run, plus the full trace `report.json` for the two
the headline A/B compares; `runs/` is gitignored, which is why they are
copied there).

**How failure is counted here** (the thing the first version got wrong):
`metrics.lives.spent` = stock lives spent, read from the HUD `×N` readout,
which is present on every default-run trace; `metrics.score.setbacks` =
HULL FALLBACK absorptions, present on any `?score=1` run. The two are
different rungs of the same ladder, so both are quoted. `metrics.deaths` and
`outcome.attempts` are **fixture-only** and are quoted nowhere in this
document.

| Script | Flags | Result |
| --- | --- | --- |
| `scored-run.json` (competent heuristic) — artifact: `tools/playtest/reports/cp4/scored-run/report.json` | `score=1&fallback=1` | protoScore **598.0 (source: HB.score, real)** — 3 airborne kills, 1 launch kill, 2 recatches, THREAT 920 (OBSERVE), hot 13.8 s of 31.0 s, **3 setbacks absorbed** (2 in one of five repeats — see variance below), **0 stock lives spent (HUD ×3 at the end)**, final x = max x = **89.25** (no forward ground lost) |
| `scored-run-baseline.json` (identical inputs) — artifact: `tools/playtest/reports/cp4/scored-run-baseline/report.json` | none | stock path intact: no score surface, protoScore falls back to the labeled proxy (924.8), 0 setbacks — and it **died twice**: 2 of 3 stock lives spent (t = 19.1 s, 27.3 s), each respawn snapping x **89.25 → ~51.6**; ends at HUD **×1**, final x 75.48 against a max x of 89.25, 4 hits survived |
| `scored-run-nojump.json` (fall-loop probe) — artifact: `tools/playtest/reports/cp4/scored-run-nojump/summary.md` | `score=1&fallback=1` | **dying is not a shortcut**: never jumps; ends *stalled* with **3 setbacks absorbed** and **1 stock life spent** on a hit the fallback refused (16.0 s, x 41.662 → 44.685, HUD 3 → 2), **22.0 s of its 30.9 s** PLAYING time idle by A.5's stall rule (fraction 0.712), protoScore **−16.5** (real, `HB.score`, stall-dominated); no infinite fall loop. Note the refusal at 16.0 s cannot have been the streak ceiling — only one setback preceded it and `maxConsecutive` is 2 — so it was the sim's other refusal path, "nowhere lower to settle" (`settleFallback` in `src/sim/player.js`). **Setback timestamps and final x are not in this row's committed artifact** and no `report.json` was committed for it; the only committed record of them is the T-016 gate's independent re-run of the same script (`reports/tasks/T-016/playtest.md` § "rows 3–5": setbacks 3.2 / 22.4 / 27.1 s, life at 15.9 s, final x **59.649**, `stallMs` 21888 of `playMs` 30883, protoScore −16.5) |
| `scored-run-nojump.json`, ceiling control — artifact: `tools/playtest/reports/cp4/ceiling-score-only/summary.md` | `score=1` only (fallback disarmed) | the same never-jumping inputs spend **all three lives by t = 9.8 s** — losses at 3.2 s, 6.6 s and 9.8 s, each recorded at x **31.649** — and PLAYING time stops there, inside a 31.2 s window. With the fallback armed the identical script is still playing when that window closes, having spent one life (row above). That is what tier 1 stands in front of, and it is the honest shape of "does dying still cost anything": it costs less, but the run still ends. **Dropped, not restated:** this row used to assert the terminal state `GAME_OVER` / "SIGNAL LOST" and a final x — neither is recorded in the committed artifact (its `outcome.result` reads `not-completed`, which on a default run is I-006's structurally-blind label, not a terminal state) |
| `scored-run-nojump.json`, flag isolation — artifact: `tools/playtest/reports/cp4/fallback-only/summary.md` | `fallback=1` only | no score block in telemetry at all — its protoScore line reads the labelled **proxy** (−15.4) where both `?score=1` rows read REAL — which is correct, the meter is `?score=1`-gated. Where the artifact records the shape it matches row 3: *stalled*, **1 stock life spent at 16.0 s** (x 41.649 → 44.652, HUD 3 → 2), 21.9 s of its 31.0 s idle. So the fallback tier works with the meter off and the meter does not influence it. **Dropped, not restated:** the setback timestamps and final x this row used to quote. With the meter off the run carries no `setbacks` counter at all, so how many setbacks this row absorbed is not recoverable from anything committed |

**Where each row is checkable from, and where it is not** (I-008, closed by
T-028 2026-08-02). Rows 1–2 are full traces: every number in them was
recomputed from `report.json` by the T-016 gate
(`reports/tasks/T-016/playtest.md` § "Defect 1 re-gate", every line "agrees").
Rows 3–5 have only a `summary.md`, which carries lives, stall and score lines
but neither final x nor setback times — so the numbers those summaries do not
contain are now either attributed to the gate's independent re-run (row 3) or
dropped (rows 4–5). `tools/playtest/runs/` is gitignored and is not present in
the tree, so nothing under it is citable evidence here; where a number lived
only there, it has been removed rather than restated. Committing
`scored-run-nojump/report.json`, or adding final x and setback times to those
three summaries, would make the whole table checkable in one place.

The slice smokes (`mid-route.json`, `transform-slice.json`) still complete
(`completed`, 0 errors), and the traversal slice still prices its meter with
its own tune: the same `mid-route.json` under `?slice=traversal&score=1`
reports `tune: "slice"` while every default-run row above reports
`tune: "run"` — the two tunes do not cross-contaminate.

**Run-to-run variance, measured, because it is larger than it looks.**
`--deterministic` pins input to sim time; it does not make real-Chrome runs
identical (playtest README, honesty items 4 and 8). Across **five** repeats of
`scored-run.json`:

- **Stable in all five:** 0 stock lives spent, final x = max x = **89.25**,
  `tune: "run"`, classification OBSERVE, 3 airborne kills, protoScore inside
  a ≈2 % band (586.9 / 597.9 / 598.0 / 598.8 / 600.5).
- **Not stable:** setbacks absorbed were **3 in four repeats and 2 in one**;
  THREAT was 920 in four and 444 in the fifth; recatches 2 or 0; launch kills
  1 or 2; hot time 13.8 s or 17.9 s. The bot fights the same fight slightly
  differently each time, and the meter is sensitive to that even when the
  outcome is not.
- On a marginal-outcome script the score swings much harder still:
  `scored-run-nojump` measured −117.2 and −16.5 on two repeats, because a
  single ground kill lands in one and not the other — while its structural
  facts (a life spent, 3 setbacks, stalled at x 59.65) held both times.

So: read the **structural** facts (lives, forward ground, terminal state) as
evidence — those are what the A/B argument above rests on — and read
protoScore and THREAT as bands, never as targets. Every table row above is
the committed artifact's own numbers, not a best-of.

## Recommendation

Adopt `?score=1&fallback=1` as the default-run composition to judge at CP4,
and if it lands, flip both defaults ON in the run (keeping `?score=0`/
`?fallback=0` escapes) as the recorded decision. The pairing is the
proposal's own argued spine — the meter answers second-to-second play
(pillar 3 with the score system itself), the fallback answers the instant
of failure without a modal or replayed content (pillar 1) — and the slice
A/B it was built for has been runnable since CP1 without a verdict; CP4 is
that verdict plus the run-scale question.

**The measured A/B, in one sentence.** Same script, same inputs, 31 s:
flags **off** spends 2 of 3 stock lives and is thrown back from x 89.25 to
51.6 twice, finishing 13.8 tiles behind its own high-water mark; flags **on**
spends 0 lives, absorbs 2–3 setbacks depending on the repeat, and never gives
up a tile of forward ground (final x = max x = 89.25 in every repeat).
Momentum is the pillar this is arguing about, and that is the whole
argument — but it cuts both ways, which is
exactly what question 2 below is for: a setback that costs altitude and
CHARGE but *no forward progress* may not read as punishment at run scale.
The nojump probe is the counterweight: without the fallback that script is
dead in 9.8 s, with it the run survives the window at a cost of one life —
so the ladder is doing something, and the open question is whether it is
doing enough.

**Known gaps, stated plainly:**

- The center-HUD "HULL FALLBACK · LOWER ROUTE" line is slice-gated in
  `src/ui/hud.js` (lane-fenced during this task), so a default-run fallback
  currently has no text callout — pillar 5 wants one line there if the
  operator adopts it. One-line follow-up in the HUD lane.
- `wager`, `reclaim`-rich routes, and route coverage are authored-fixture
  events; the six-face run emits none of the first and little of the third
  until faces get authored connectors. THREAT in the run therefore
  undershoots the slice's density today — expected, not a bug.
- The run's THREAT ladder (2,000 → INTERCEPT etc.) is uncalibrated for a
  full-length run; the classification clamp and B.6's clock remain unbuilt.
  Neither blocks judging the feel of the composition.
- B.1 tier 2 (band fallback + recovery shaft) is unbuilt; the stock lives
  ceiling stands in for it. If the operator rejects lives even as a
  ceiling, tier 2 or B.6 is the replacement and this document's ladder
  changes shape.

## CP4 operator packet (prepared for SPRINT's checkpoint queue — the integrator appends it there on merge, per the T-015 precedent)

Play `index.html?score=1&fallback=1` (default FAR view), against
`index.html` for contrast; add `&fallback=0` or `&score=0` to isolate
either half. Flag-shape caution, since it is a trap when typed from memory:
in the **run** the arming value is exactly `?fallback=1` and a bare
`?fallback` is inert, whereas in the **traversal slice** the fallback is
on by default and `?fallback=0` is what disables it (`src/mode.js`).

1. Did you change how you moved to keep the meter hot — route choices,
   staying airborne, hunting recatches — or did you play the same run and
   watch a number? (A.4's own kill-question for Architecture 2.)
2. When you died with `?fallback=1`: does losing altitude-or-margin read as
   a real punishment at run scale, or does it need to cost forward progress
   too? (Proposal question B.1/3.) *Bot evidence, for calibration only:*
   in the measured run the fallback cost **no forward ground at all**
   (final x = max x = 89.25), while the flags-off death cost two lives and
   13.8 tiles of ground.
3. Does the fallback→fallback→life ladder read as the ship escalating, or
   does the stock life at the ceiling feel like the lives-and-checkpoints
   retread you ruled out — i.e. should tier 2 / the B.6 clock replace it
   before this ships on by default? *Bot evidence:* in the never-jumping
   probe the ladder did **not** come out as the clean fallback → fallback →
   life it is designed as — it ran setback, then a life spent on a hit the
   fallback could not absorb, then two more setbacks (3 absorbed setbacks and
   1 life spent at 16.0 s, `tools/playtest/reports/cp4/scored-run-nojump/summary.md`)
   — and it spends its last stretch pinned near x 59.6 at about 71 % idle (the
   T-016 gate's independent re-run, `reports/tasks/T-016/playtest.md`; this
   row's own committed summary carries the idle fraction 0.712 but no
   positions, so the tighter "13.3 s between x 58.2 and 59.6" this line used to
   quote is dropped for want of an artifact). Whether that reads as the ship
   escalating or as being stuck is exactly the feel call.
4. The meter cools roughly twice as slowly in the run as in the slice
   (A.3 vs A.4 tables). Does WARM feel earned and losable at this
   timescale, or too sticky / too twitchy?
5. With no center-HUD callout yet, is the default-run fallback readable as
   "the ship dislodged me, keep moving" — or did you need the text line the
   slice has?
