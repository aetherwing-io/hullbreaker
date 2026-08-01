# CP4 recommendation — score and setback in the default six-face run

**Status: defended proposal, awaiting the CP4 operator verdict. The
promotion is built and gated; nothing here is canon until the operator
picks.** Prepared July 31, 2026 by the `gameplay-engineer` agent (T-016),
promoting the two CP1 prototypes-for-testing from
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
   `?score=1` run.

Layering rules hold: CHARGE still gates only the weapon (fire interval,
launch shock), never movement constants; events are emitted at the existing
decision sites; the meter steps on real dt (CHRONO cannot inflate it); no
render/UI file changed.

## Evidence

`node tools/pathcheck.mjs` — 693 assertions green, including new ones for:
the run/slice tune relationship (halved gains and drain, identical
structure), the run fallback tune, and two headless default-run children
proving: the run tune actually prices the stream (+14 airborne kill, not
+28); a lethal hit with `?fallback=1` keeps lives and control, refills hp,
pays altitude (or margin on the lowest route), drops CHARGE to the floor,
and emits the A.5 `setback` envelope; the third consecutive un-recovered
death crosses the ceiling into the stock lives tier; and with no flags the
default run is the shipped stock path with a fully inert meter.

Bot runs (30 s window, `--deterministic`, real Chrome, zero console/page
errors in all three; reports under `tools/playtest/runs/scored-run*`):

| Script | Flags | Result |
| --- | --- | --- |
| `scored-run.json` (competent heuristic) | `score=1&fallback=1` | protoScore **600.5 (source: HB.score, real)** — 3 airborne kills, 1 launch kill, 2 recatches, THREAT 920 (OBSERVE), hot 13.8 s of 31 s, **3 setbacks absorbed with 0 deaths**, final x 89.2 |
| `scored-run-baseline.json` (identical inputs) | none | stock path intact: no score surface, protoScore falls back to the labeled proxy (721.6), 0 setbacks, 4 hits, 0 deaths |
| `scored-run-nojump.json` (fall-loop probe) | `score=1&fallback=1` | **dying is not a shortcut**: never jumps, eats 3 setbacks, ends stalled at x 59.6 vs the competent 89.2; protoScore **−117.2** (stall-dominated); no infinite fall loop |

The slice smokes (`mid-route.json`, `transform-slice.json`) still complete.

## Recommendation

Adopt `?score=1&fallback=1` as the default-run composition to judge at CP4,
and if it lands, flip both defaults ON in the run (keeping `?score=0`/
`?fallback=0` escapes) as the recorded decision. The pairing is the
proposal's own argued spine — the meter answers second-to-second play
(pillar 3 with the score system itself), the fallback answers the instant
of failure without a modal or replayed content (pillar 1) — and the slice
A/B it was built for has been runnable since CP1 without a verdict; CP4 is
that verdict plus the run-scale question.

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

## CP4 operator packet (queued via SPRINT's checkpoint queue)

Play `index.html?score=1&fallback=1` (default FAR view), against
`index.html` for contrast; add `&fallback=0` or `&score=0` to isolate
either half.

1. Did you change how you moved to keep the meter hot — route choices,
   staying airborne, hunting recatches — or did you play the same run and
   watch a number? (A.4's own kill-question for Architecture 2.)
2. When you died with `?fallback=1`: does losing altitude-or-margin read as
   a real punishment at run scale, or does it need to cost forward progress
   too? (Proposal question B.1/3.)
3. Does the fallback→fallback→life ladder read as the ship escalating, or
   does the stock life at the ceiling feel like the lives-and-checkpoints
   retread you ruled out — i.e. should tier 2 / the B.6 clock replace it
   before this ships on by default?
4. The meter cools roughly twice as slowly in the run as in the slice
   (A.3 vs A.4 tables). Does WARM feel earned and losable at this
   timescale, or too sticky / too twitchy?
5. With no center-HUD callout yet, is the default-run fallback readable as
   "the ship dislodged me, keep moving" — or did you need the text line the
   slice has?
