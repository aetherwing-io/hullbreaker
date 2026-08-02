# T-028 — build report (docs lane: rewrite the Delivery target; fold in the evidence-honesty issues)

Worktree `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-028`,
branch `task/T-028`. No file under `src/` changed.

## What changed, and why

### 1. `SPRINT.md` § "Delivery target" — rewritten against entries 9–13

The old target was seven bullets, none of which named a falsifying test, and
two of which stated feelings. It is now thirteen numbered boxes, each with what
it is measured in and what would falsify it (entry 10's acceptance rule), plus
two governing rules at the top (entry 10's rule; evidence honesty).

Boxes carried over from the old target, now gated: enemy roles (1),
transformations (2), palette (3), juice + audio (4), shell (5), frame/error
budget (6), boot-to-victory (7), checkpoint packets (13).

Boxes **added** because entries 10–13 clearly imply them, each citing its entry:
- **8 — split decisions at speed, at density** (entries 10 + 11): currency is
  time against the pursuing edge plus exposure; falsified by a main-line policy
  collecting the branch reward anyway (the I-031 failure), or by a dead end that
  is not legible before commitment (entry 11's fairness rider). Marked as
  following the operator's blocked **T-021** call rather than pre-deciding it.
- **9 — climb is the dominant motion** (entry 10, "a face that reads as a flat
  corridor is a defect"). States plainly that the assertion this box needs
  **does not exist yet**: pathcheck asserts per-face route *density* and
  per-face spawn escalation, neither of which is climb.
- **10 — pace escalates at the player's momentum** (entry 11), with the
  code-stated falsifying gates from `src/config.js`'s momentum block.
- **11 — nothing in the delivered run is priced in reach or height** (entries 9
  + 12), with the traversal slice's retained, `ACTIVE_SLICE`-gated wager strings
  explicitly excepted so a future gate does not file a false defect.
- **12 — every delivery claim that turns on difficulty is evidenced in the
  six-face run** (entry 13).

Two facts surfaced while writing box 1, neither of them previously stated in the
target: `src/mode.js` resolves `?polyp=`/`?mortar=` to `null` unless
`IS_TRAVERSAL_SLICE`, so **the default run fields neither the polyp nor the
mortar today**, and the run has no teach-then-combine structure of its own.

### 2. `SPRINT.md` § "Operator checkpoint queue" — entry 13's rider recorded

New rider block at the head of the queue: a verdict taken at `?slice=traversal`
is re-asked in the six-face run, not inherited. It names the entries it reaches
(0a, 2, 4, 6 — all taken at URLs that `src/mode.js` gates behind
`IS_TRAVERSAL_SLICE`), says explicitly that **what each verdict says stands as
recorded and is never re-litigated** (only its transfer is re-asked), exempts
entry 12 (taken on `index.html`, operator-confirmed), and notes that crouch /
aim-assist are *not* slice-gated so they can be asked on the six-face run
directly.

New packet **"DELIVERY-TARGET FEEL QUESTIONS (T-028)"** with the two feelings
moved out of the target ("restrained per DESIGN"; "FAR-readable tells and
glyphs") plus three scope questions I refused to answer myself: whether
slice-only teach stages satisfy the enemy-role box, whether `?momentum=1` ships
ON, and whether T-023's boosts are inside the delivery scope.

### 3. `docs/FLEET-PLAN.md` — the Aug-1 verdict set and the rider

The "Operator decisions on record" section stopped at July 31 while five
operator verdicts had landed since. Added one dated section: headline of each of
entries 9–13 (by pointer to `decisions.md`, no new numbers), then the rider in
full with the list of verdicts *on that page* it reaches. Nothing on the page
was edited or reworded.

### 4. `docs/proposals/2026-07-cp4-default-run-score-setback.md` — I-007, I-008

Per-row artifact paths added to rows 1–2; rows 3–5 restated against the only
artifacts committed for them. Details in the tables below.

### 5. `tools/playtest/scripts/momentum-{strong,weak}.json` — I-029

Both "MEASURED, NOT ASPIRATIONAL" blocks replaced with "READ THE STRUCTURAL
GAP, NOT THE DECIMALS". Every per-run decimal with no committed artifact behind
it is gone; what is quoted instead is `reports/tasks/T-022/playtest.md` §§ 2 and
4 (this repo's only committed measurement of the pair), labelled as a two-run
sample, with the note that the `tools/playtest/runs/gate-T-022-*` directories
are gitignored and absent. `momentum-weak`'s three falsifying gates are
unchanged — they are stated from `src/config.js` constants, which are checkable.

### 6. `tools/playtest/scripts/six-face-full-run.json` + `tools/playtest/README.md` — I-020

The restatement-with-repeats had already happened in T-009's fix cycle; the
**citation** was wrong. Both places attributed the repeat numbers to
`tools/playtest/runs/gate-T-009-fullrun-*` (gitignored, absent from the tree)
and to `reports/tasks/T-009/playtest.md` (which does not contain them); the
README additionally pointed at `docs/playtests/2026-08-gate-fight-harness.md`,
which does not discuss I-020. Both now say that `SPRINT.md`'s I-020 entry is the
only committed record and that the figures are the gate's reported measurement,
not re-checkable from this repo.

### 7. Inbox entries I-007, I-008, I-020, I-029 annotated with what T-028 did.

## Every number corrected, with the artifact it was read from

| Where | Was | Now | Artifact |
| --- | --- | --- | --- |
| CP4 proposal row 3 | "21.9 s of its 30.9 s idle" | **22.0 s of 30.9 s** (fraction 0.712) | `tools/playtest/reports/cp4/scored-run-nojump/summary.md` |
| CP4 proposal row 3 | life spent "16.0 s, HUD ×2" (no position) | 16.0 s, **x 41.662 → 44.685**, HUD 3 → 2 | same |
| CP4 proposal row 3 | setbacks "3.2 / 22.4 / 27.4 s", "ends at x 59.65" — quoted as this run's | attributed to the T-016 gate's independent re-run: **3.2 / 22.4 / 27.1 s**, life at **15.9 s**, final x **59.649**, `stallMs` 21888 of `playMs` 30883 | `reports/tasks/T-016/playtest.md` § "rows 3–5" |
| CP4 proposal row 4 | "all three lives by t = 9.8 s … ending at x 31.65" | three losses at **3.2 / 6.6 / 9.8 s**, each recorded at **x 31.649**; PLAYING time stops at 9.8 s inside a 31.2 s window | `tools/playtest/reports/cp4/ceiling-score-only/summary.md` |
| CP4 proposal row 5 | "the same ladder … (setback 3.2 s, life 16.0 s, setbacks 22.4 s / 27.8 s, final x 59.65)" | *stalled*; **1 life at 16.0 s, x 41.649 → 44.652**, HUD 3 → 2; **21.9 s of 31.0 s** idle; proxy protoScore −15.4 | `tools/playtest/reports/cp4/fallback-only/summary.md` |
| CP4 packet question 3 | "spends its last 13.3 s pinned between x 58.2 and 59.6" | "last stretch pinned near x 59.6 at about 71 % idle", attributed to the gate | `reports/tasks/T-016/playtest.md`; idle fraction 0.712 in the row's own summary |
| `momentum-strong.json` | "above the floor on 77.5 % / 73.4 %", "peak 5.44 both times", "GAME_OVER at 43.9 / 42.7 s", 579/563 samples, medians, p90s, kills, edgeMargin medians | **60.8 % / 80.2 %** above the floor, peaks **×1.265 / ×1.280**, maxScroll **118.4 / 140.0** | `reports/tasks/T-022/playtest.md` § 4 |
| `momentum-weak.json` | "above the floor on 11.6 % / 24.2 %", "GAME_OVER at 27.5 / 27.9 s", peaks/medians/p90s | **0.7 % / 11.6 %** above the floor, peaks **×1.008 / ×1.025**, `aboveX1.12 = 0`; flag-on and flag-off identical in reach (`maxX` 59.6, `maxScroll` 75.0, 3 lives, all four runs) | `reports/tasks/T-022/playtest.md` §§ 2 and 4 |
| Delivery target box 7 | "boot-to-victory ≈ 4–5 min" + "no reflex policy reaches VICTORY" (evidence implied) | 13 variants over **49 runs**, wall at gate 2, scroll **140 of 415**, ~50 s, three lives; gate 1 cleared **45/49**, gate 2 **once in 41** (that run scroll 165 at **64.4 s**); nothing reached gate 3 | `docs/playtests/2026-08-victory-box.md` § 1; `tools/playtest/reports/t019/all-runs.md` |
| Delivery target box 3 | "FAR-readable tells and glyphs" (a feeling) | moved to the queue, with the measurement it rests on: glyph **9.6 px** beside a **29.6 px** RIG at FAR | `tools/assets/reports/demo/capsule-letter-h/viewer-far.png`; `reports/tasks/T-015/playtest.md`, `review.md` |

## Claims dropped for lack of a committed artifact

1. **CP4 row 4's terminal state** `GAME_OVER` / "SIGNAL LOST" and its final x.
   Not in `ceiling-score-only/summary.md`; the harness's own `outcome.result`
   for that run reads `not-completed`, which on a default run is I-006's blind
   label, not a terminal state.
2. **CP4 row 5's setback timestamps and final x.** Not in
   `fallback-only/summary.md`; and with the meter off that run carries no
   `setbacks` counter at all, so *how many* setbacks it absorbed is not
   recoverable from anything committed. Said so instead of restating.
3. **CP4 packet question 3's "13.3 s between x 58.2 and 59.6."** No committed
   artifact carries positions over time for that run.
4. **Every per-run decimal in the two momentum script descriptions** that came
   from the builder's own gitignored runs (sample counts, medians, p90s, peak
   speeds in t/s, kill counts, edgeMargin medians, GAME_OVER timestamps, and
   weak's "11.6 % / 24.2 %"). The gate's own repeats landed outside several of
   them (I-029) and neither set's run directories are in the tree.
5. **"boot-to-victory ≈ 4–5 min" as a measurement.** Kept, but relabelled as
   DESIGN's *authored target* (`docs/DESIGN.md` § "Technical acceptance") — no
   run in this repo has reached VICTORY, so no measured duration exists, and the
   box now forbids a delivery report from quoting one.

## Verification

| Command | Result |
| --- | --- |
| `node tools/pathcheck.mjs` (in the worktree) | **1674 passed, 0 failed**, exit 0 |
| `git diff --stat -- src/` | empty — no runtime file touched |
| Every cited path checked for existence (26 paths: pathcheck, the five `src/` files named, both `artifacts/` frame sets, both CP4 `report.json`s, all three CP4 `summary.md`s, both t019 evidence files, the four `reports/tasks/*` reports, the glyph PNG, both smoke scripts) | all resolve |
| Quoted assertion strings still present in `tools/pathcheck.mjs` (`palette: no raw color literals`, `no face window reads fewer than`, `density escalates: face`) and `settleFallback` in `src/sim/player.js` | all found |
| `node run.mjs …/scripts/mid-route.json --deterministic --max-runtime-ms 15000 --base-url http://127.0.0.1:8763` (worktree pinned) | `completed`, testapi fidelity |
| `node run.mjs …/scripts/transform-slice.json --deterministic --max-runtime-ms 20000 --base-url …:8763` | `completed`, testapi fidelity |
| `node run.mjs …/scripts/momentum-weak.json --deterministic --max-runtime-ms 30000 --base-url …:8763` | loads and runs (6 tap fires across 3 rules); `not-completed` is expected — the script's window is 60 s and this was a 30 s harness-health check, not a measurement |
| `python3 -c json.load` on all three edited scripts | parse clean |

**Honest limitation:** the momentum run above was a load-and-run check of an
edited description. It produced no number that appears in any document, by
design — this lane quotes only committed artifacts.

## Open questions for the operator (feel — I do not judge these)

All five are queued in `SPRINT.md` under "DELIVERY-TARGET FEEL QUESTIONS
(T-028)" with the exact URLs:

1. Is the juice/audio pass restrained, thin, or too loud at the shipped
   intensity? (`index.html` vs `index.html?juice=0`.)
2. Do enemy tells and pickup glyphs carry at the shipped FAR view, or is the
   answer the queued "move the letter read to the HUD"?
3. Must the polyp and mortar be **in** the default run for delivery, or do their
   slice teach stages satisfy that box? (Today the run fields neither.)
4. Should `?momentum=1` ship ON in the delivered run, or stay a flag?
5. Is T-023 (boosts, rocketing face transitions) inside the delivery scope or
   after it?

## Conflicts found and NOT resolved here

None between a Delivery box and a `decisions.md` entry. Two structural gaps are
recorded rather than fixed, because fixing either is outside a docs lane:

- **Box 9 has no assertion.** Entry 10 makes a flat-corridor face a defect;
  nothing in `tools/pathcheck.mjs` computes per-face net climb. Needs a lattice
  or harness task.
- **Box 8's shape is blocked on T-021.** Entries 9 and 11 pull against each
  other for a capsule reward (the integrator's own escalation), and the box says
  so instead of picking an answer.

## Single best next action

Get the operator's five queued delivery questions answered in one pass — 3 and 4
in particular change what "delivered" contains, and both are cheap to answer
from the same session (`index.html` vs `?juice=0` vs `?momentum=1`).
