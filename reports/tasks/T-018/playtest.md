PASS

# T-018 playtest gate — the relative-geometry policy grammar

Worktree under test: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-018`
at `dc32cf1` (branch `task/T-018`; contains main up to `0c9eb7b` — main has since
moved to `66e0179`, a SPRINT.md-only commit).
Gate run by the `playtester` lane, 2026-08-01. Judged: what was **delivered**.
The residual "a bot reaches VICTORY" box is split to T-019 by integrator
decision and is explicitly **not** a fail condition here — and it did not fail.

## Pin (curl-proven, single build for every run below)

```sh
cd /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-018 && python3 -m http.server 8981 &
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8981/index.html          # 200
curl -s http://127.0.0.1:8981/tools/playtest/lib/threat.mjs | head -5              # T-018 tree, not main
curl -s http://127.0.0.1:8981/docs/playtests/2026-08-gate-fight-harness.md | head -3
```

## Ordered runs (MAIN checkout's harness, against the pin)

```sh
cd /Users/scottmeyer/projects/hullbreaker/tools/playtest
node run.mjs scripts/mid-route.json       --deterministic --max-runtime-ms 15000 --base-url http://127.0.0.1:8981 --out runs/gate-T-018-mid
node run.mjs scripts/transform-slice.json --deterministic --max-runtime-ms 20000 --base-url http://127.0.0.1:8981 --out runs/gate-T-018-transform
```

Both exited **0**, both `"result": "completed"`, `testapi` fidelity, `bootError: null`,
0 console errors, 0 page errors. No retry was needed.

| | mid-route | transform-slice |
| --- | --- | --- |
| result | completed | completed |
| attempts / falls / deaths | 1 / 0 / 0 | 1 / 0 / 0 |
| hits survived | 1 | 0 |
| lives | n/a (traversal slice) | 3 → 3, 0 spent |
| routeIds | [none] (inference: mid-catwalk) | [mid-catwalk, wall-launch] |
| dare pocket | entered=true | entered=true |
| minEdgeMargin | 35.39 | 30.12 |

Evidence: `tools/playtest/runs/gate-T-018-mid/{report.json,summary.md,screenshot.png}`,
`tools/playtest/runs/gate-T-018-transform/{report.json,summary.md,screenshot.png}`.

## Q1 — grammar, or a scripted win? **Grammar.**

Read in full: `tools/playtest/lib/{threat,policy,sampler}.mjs` and
`scripts/six-face-aimed-run.json`. Then verified behaviourally, not by reading
the claim:

**Nothing in the delivered code names a place or a time.** `threat.mjs` holds
only geometry constants (`muzzleY 1.05`, `hitR 0.55`, `rangeTiles 14`, absent
sentinel `99`, slope cap `9`); the sampler probe holds `PROBE_TILES 12` and the
game's own hole test `<= -100` (matches `columnHasGround` in `src/sim/level.js`).
There is no wave, gate, column, or `gameMs` literal anywhere in the diff.
Proven, not eyeballed, with a scratch probe:

- **Translation invariance** — the same relative arrangement moved +180.375 tiles
  down the level produces an identical `deriveThreat` view (max numeric delta
  `1.07e-14`, identical `n/levelN/diagN/vertN/aboveN`). A predicate that encoded
  an x could not do that.
- **Clock invariance** — changing `gameMs`/`tMs` on the sample changes nothing.
- **Purity** — an intervening tick with different geometry does not change what
  this tick sees (also asserted in pathcheck).

**The `&&`-only promise, checked behaviourally, at unit level and end-to-end.**
16 malformed conditions rejected at compile: `||` (spaced, unspaced, between
comparisons, between threat clauses), parens (whole, nested-alternation,
single-clause), arithmetic (`3 + 1`, `3*2`, lhs `dist-1`), field-vs-field
compare, unknown threat field (comparison / bare / negated / wrong case),
string ordering. Plus injection shapes: `x>1; process.exit(1)`, an IIFE,
`constructor.constructor("return 1")()`, bitwise, ternary, `Math.min(1,2)` in
the rhs — all rejected. Five legitimate forms still compile. And through
`run.mjs` itself, which compiles the policy **before** the browser launches:

```
bad-or      exit=1  unparsable policy condition clause: "grounded || pinned" … joined only by &&
bad-paren   exit=1  unparsable policy condition clause: "(x>4" …
bad-arith   exit=1  ordering operators (> >= < <=) need a numeric value, got a string
bad-threat  exit=1  unknown threat field "threat.nearestWaspLane" … known: threat.n, threat.dist, …
```

`eval(`/`new Function(` appear in neither `policy.mjs`, `threat.mjs` nor
`sampler.mjs` once comments are stripped (the only textual hit is the header
comment promising their absence).

**The pathcheck assertions are real tripwires, not decoration.** Against a
pristine `git archive task/T-018` copy in scratch: changing `THREAT_GEOM.muzzleY`
1.05 → 1.15 turns pathcheck red (`FAIL T-018: harness muzzle height mirrors
CONFIG.player.muzzleY`, 3 fails); relaxing `compileCondition` to split on `||`
turns it red (`FAIL T-018: grammar rejects alternation`). Restored after each
probe; the worktree itself was never modified.

**The script is a reflex, not a recording.** Every rule in
`six-face-aimed-run.json` is relative: `hudTC` (a gate is open), `threat.up*`
(where the nearest thing above the firing line is), `terrain.gapDist` (where the
deck ends), `edgeMargin`, `pinned`, `houndTell`, `grounded`, `vy<0`. No `x>`,
no `gameMs`, no per-gate sequence; its only static input is "hold fire from
400 ms". The one documented foot-gun (rules 4/5 leaning on the `99` sentinel) is
called out in the script's own description and in the README.

## Q2 — does it change existing runs? **No.**

**Replay, independently rebuilt.** I did not take the builder's number: I
extracted the old engine with `git archive main tools/playtest/lib`, reconstructed
each tick's held-key set from the report's dispatched `events` + the policy
`log`, and ran both engines over the same traces, diffing hold sets, tap edges,
per-rule truth values and fire counts.

```
OK  policy-pinned-jump    (committed demo)          133 ticks, 0 diffs, fires [13] vs [13]
OK  policy-hound-reactive (committed demo)           45 ticks, 0 diffs, fires [0/2] vs [0/2]
OK  policy-pinned-jump    (fresh, merged harness)   132 ticks, 0 diffs, fires [13] vs [13]
OK  policy-hound-reactive (fresh, merged harness)    44 ticks, 0 diffs, fires [0/3] vs [0/3]
OK  six-face-full-run aimless (fresh, merged)      1980 ticks, 0 diffs, fires [0,0,0,0,0,36] both
TOTAL: 2334 ticks replayed through both engines, 0 decision differences
```

That is the builder's "2321 ticks, 0 decision differences" reproduced
independently — the tick total differs by trace composition (my long trace is my
own 150 s capture), the **zero** is the claim and it holds. The source diff
agrees: `policy.mjs`'s removed lines are only signature changes threading
`threat` through; no existing predicate's semantics moved.

**End-to-end, same pin, main harness vs merged harness.** mid-route
**completed** both (attempts 1, falls 0, deaths 0, hits 1, dare pocket entered,
route inference mid-catwalk, 26 events); transform-slice **completed** both
(213 samples both, falls 0, lives 3 → 3, routeIds `[mid-catwalk, wall-launch]`,
58 events). Continuous values drift as documented (protoScore 92.7 vs 86.2,
minEdgeMargin 35.39 vs 35.42, airMs 5746 vs 5205) — smaller than the harness's
own same-harness spread per README honesty items 2/4/8, so I judged structure.
`policy-pinned-jump` through the merged harness fired **13** times and took the
pocket reward — the exact behaviour the README documents for it.

**Zero src/ change:** `git diff --stat main...HEAD -- src/` is empty. Whole diff
is `docs/playtests/`, `tools/pathcheck.mjs`, `tools/playtest/{README.md,lib/policy.mjs,
lib/sampler.mjs,lib/threat.mjs,scripts/six-face-aimed-run.json}`. `index.html`
untouched. The in-page probe only reads `window.HB.levelData.groundH` (guarded
for absence) — no mutation path into the sim.

**Pathcheck:** worktree `node tools/pathcheck.mjs` → **1517 passed, 0 failed**,
exit 0. Main → 1480 passed. +37 assertions, all green, all executed (the count
moved), and shown above to fail when their subject drifts.

**README:** the new clauses are documented — a `threat.*`/`terrain.*` section
with per-field tables, the `targetLevel/Diag/Vert` predicates in the grammar
list, the sentinel and typo-fails-at-load conventions, a worked example, the
demo-table row for `six-face-aimed-run.json`, and honesty item 10 (corridors are
"a shot fired now points at it", no bend awareness, `terrain.*`/`facing` are
`window.HB`-only, and the probe is knowledge the old scripts did not have).

## Independent corroboration of the finding's load-bearing claim

Same pin, `--deterministic`, 150 s cap, 1440×900, both through the merged
harness (`six-face-full-run.json` extracted from `task/T-009` per the finding's
repro block):

| run | kills | maxX / scroll | ended | where |
| --- | --- | --- | --- | --- |
| aimless (T-009's script) | 8 | 89.3 / **75** | 27.3 s | died **in gate 1** (`WAVE 1/6`) |
| aimed (`six-face-aimed-run.json`) | 14 | 154.3 / **140** | 49.3 s | cleared gate 1, died **in gate 2** |

The aimless row reproduces the finding's committed `main` measurement to 0.1 s
(8 kills, scroll 75, dead in gate 1 at 27.4 s), including the documented first
life lost at 3.0 s at x = 31.649. The aimed row buys exactly the one gate the
finding claims, on a tree whose `src/` is byte-identical to main. Kill counts sit
inside the spread the finding already warns about (17 pre-merge, 9/12 post-merge,
14 here) — I judged the gate reached, which was stable. 0 console errors, 0 page
errors, **0 missing-field warnings** across 1979 samples using the new clauses;
the terrain rules fired 60/3/2 times, so the probe is live, not inert.
Evidence (json + summary + screenshot each):
`/Users/scottmeyer/projects/hullbreaker/tools/playtest/runs/gate-T-018-aimless/`,
`…/runs/gate-T-018-aimed/`. Merged-harness A/B copies of the ordered pair:
`…/runs/gate-T-018-mid-mergedharness/`, `…/runs/gate-T-018-transform-mergedharness/`;
plus `…/runs/gate-T-018-pinned/` and `…/runs/gate-T-018-hound/`. The two probes
this gate wrote are kept beside them: `…/runs/replay-compare.mjs` (old-vs-new
engine tick diff) and `…/runs/grammar-probe.mjs` (grammar rejection / relative-
geometry invariance). Both are gate instruments, not harness code, and touch
nothing under `tools/playtest/lib/`.

## Screenshots (judged, not skimmed)

`runs/gate-T-018-mid/screenshot.png`, `runs/gate-T-018-transform/screenshot.png`,
plus the two six-face frames above. Deep-teal atmosphere, rust-orange structure,
acid-green hostiles, magenta pocket marker — the concept-art color roles hold at
the default FAR view; wasps read as distinct acid-green darts against the sky at
1440×900 in the gate-2 frame; RIG sits at roughly 3.5–4% of frame height in the
six-face frames (invariant band 3–5%). Surfaces read as one connected deck, not
floating platforms. No assembling anatomy in any frame, no z-fighting, no glitch
artifacts. This is expected rather than surprising — `src/` is unchanged, so the
render is main's render; the frames are corroboration, not a new art claim. Two
of the four are end-of-run overlay frames (TRAVERSAL CLEAR / BREACH CLEAR /
SIGNAL LOST), which limits how much scene judgement they can carry.

## Not judged here (feel → operator, per standing orders)

- Gate-2 **load** (9 gating bodies vs 5 authored), the wasp's missing telegraph,
  and linear gate escalation: raised by the builder in
  `docs/playtests/2026-08-gate-fight-harness.md` §6 with five operator questions
  and a URL. A gate cannot answer those and this one does not try.
- Whether a bot with a 12-tile terrain probe is still an honest proxy for a
  human player is a doctrine question, not a defect; the README states the
  asymmetry plainly in honesty item 10.

## Defect filed

`SPRINT.md` Inbox **I-023** (docs, S3): the README/pathcheck wording "the
compiler rejects … arithmetic" is true for ordering operators only — with `==`
or `!=`, `x==3+1` compiles and reads permanently false with no warning. Pre-existing
on main (verified against the old engine), so it is inherited, not introduced;
only the new "rejects arithmetic" claim makes it worth recording. Nothing is
executed as JS either way, so it is a foot-gun, not a hole in the grammar.

## Verdict

PASS. The extension is a relative-geometry grammar any script can use anywhere,
not a scripted win; it is behaviourally locked down and now tripwired in
pathcheck; it changes no existing run's decisions across 2334 replayed ticks and
no existing run's structural metrics; and it touches zero game files.
