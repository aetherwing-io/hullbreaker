APPROVE

Gate: reviewer, task T-009, SECOND pass (entry-9 fix cycle). Worktree
`/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-009` (branch
`task/T-009`, HEAD `72a7db5`). Diff re-read fresh against `main`; no untracked
files. Checks I ran here myself: `node tools/pathcheck.mjs` → **1588 passed, 0
failed** (main: 1527); `buildLevel` measured at **9.9 ms** vs main's 1.0 ms
(boot only, nothing added to the frame loop), spawn table **0.22 ms**;
independent re-derivation of the shipped lattice, pockets and stations.

## Prior findings — all four in-diff items fixed, verified line by line

- **MAJOR, `tools/pathcheck.mjs:7071` — fixed.** The six-face block header now
  reads `"readable route", "reachable", or "stranded"`; "measured retreat" is
  gone. Grep over the whole branch: every surviving `wager`/`dare` token in the
  T-009 region (`7172`, `7236`, `7618`, `7651`, `src/pure/lattice.js:146-154`)
  is past-tense history of the withdrawn requirement, never a live description
  of the capsule. Everything else in the file that carries that vocabulary
  (`843`–`4877`) is the *traversal fixture's* own dare pocket, pre-existing on
  main and explicitly still valid per entries 10/11. The runtime's remaining
  hits (`src/mode.js:72`, `src/ui/hud.js:50/120-127`) are gated on
  `IS_TRAVERSAL_SLICE`/`ACTIVE_SLICE`, so the six-face run cannot render the
  word "WAGER" anywhere. Accept box 1 met.
- **MINOR, `tools/pathcheck.mjs:7629` — fixed.** The `rewardsLeft <
  spawnedRewards` gate is gone; the deck-line collection count is now a
  `console.log` note ("collected 2 of 6" on this build). Liveness keeps its
  real proofs (`spawnedRewards === CONFIG.path.faces`, the authored-route
  child where all six pay through the shipped pickup code, four source-drift
  guards). The assertion count moved 1589 → 1588 for exactly this conversion.
- **MINOR, `tools/pathcheck.mjs:5571` — fixed.** The trace-equivalence failure
  message now names `?zip=1` vs the default, and labels the two dumped traces
  `zip:` / `default:`.
- **MINOR, `tools/playtest/README.md:770` — fixed.** `six-face-full-run.json`
  has its own table row (policy, 3-runs-per-side result, I-020 retraction,
  spread caveat), the aimed row names it instead of alluding to it, and the
  intro count is now "Nine scripts" — which matches: I counted 9 rows.
- **MINOR, `SPRINT.md` — correctly NOT fixed** (integrator-owned, outside this
  branch's lane). Re-raised below so it is handled at merge.

## Independent re-verification of the accept box

- **Box 2 (removed, not weakened).** Against `main` the only `ok()` lines this
  branch deletes are the two generator regression pins (49 → 62 platforms,
  fingerprint `cc6afd7c` → `e715cc38`), both moved with the reasoning written
  in place. Everything entry 9 retired was added and removed inside the branch,
  so nothing that ever shipped is weakened. No dangling references to the four
  deleted exports (`latticeApex`, `latticeHeadReach`, `latticeClimbSeconds`,
  `latticeRiseSeconds`) or to `shelfRise`. What entry 9 says stays is still
  asserted: reachability with taught verbs, `latticeStranded` = 0, the detour
  clock (14 in, ≥ 6 out), standing-on-the-tip payment at every bob phase,
  route density, determinism, in-face/arena/apron placement.
- **Box 3 (simplest shape).** Rebuilt and measured: `shelf = mid + tierRise`,
  no bespoke rise constant; pocket f1 = deck 3, landing 2, gap 46-47, mid 4.35,
  shelf 7.35, capsule 8.05 — i.e. deck + 5.05, matching `DESIGN.md` and the
  `artifacts/t009-lattice/entry9/` A/B exactly.
- **Box 4 (gates).** pathcheck green, run by me. Runtime files are byte-
  identical to `b747e47` (`git diff b747e47..HEAD` touches only
  `tools/pathcheck.mjs` and `tools/playtest/README.md`), which is the tree the
  previous gate verified `?selftest=1` PASS (29 checks) on; the script runs are
  the playtester's gate.
- **Doc honesty spot-check.** `DESIGN.md`'s numbers reproduce: 149/246 windows
  inside [3,5] on main → 246/246 on the branch; face 2 average 2.17 → 3.46
  ("3.5"); detour 0.43 s / 1.83 tiles / 12.17 margin. Not taken on trust.
- **Layer purity / determinism / scope.** `src/pure/lattice.js` imports only
  `./path.js`; no THREE/DOM/globals, no rng (seed-free `hash()`), no upward
  imports. No `Math.random`/`Date.now`/`performance.now` added. `src/config.js`
  is not in the diff — frozen jump constants untouched. `?hook=1` untouched. No
  runtime deps, no build step, no OSTK artifacts. The traversal slice is
  provably unaffected: I built it and found zero pocket holes and zero pocket
  catwalks inside the fixture band (24..79), and its run ends at scroll 73.
  No consumer of `platforms` assumes ordering (all iterate linearly), and
  `spawner.js` → `level.js` introduces no import cycle.

## Findings (MINOR only)

SPRINT.md:480 — **operator-packet text goes stale on merge** (integrator-owned,
outside this diff, flagged not fixed — correct call by the builder). The G1
checkpoint asks the operator to compare "default vs `?g1=1`"; after this merge
`?g1=1` resolves to the same static-anatomy build as the default, so that A/B
compares identical trees. The live pair is `default` vs `?zip=1`. Same file:
line 181 still calls this task's deliverable "dare pockets", which entry 9's
packet-text rule covers, and line 554 lists `?g1=1` for screenshot capture,
now redundant. Lines 946/966 are I-019 history and read fine as history.

tools/playtest/README.md:754 — **restates a claim that is not true of the
repo**: "Seven of them have their reports committed under `reports/demo/`".
`reports/demo/` is not tracked and does not exist in either checkout (only
`reports/STATUS.md` and `reports/tasks/**` are), and the directory map at
:1054 says the same. Pre-existing on main and not introduced here, but this
diff rewrites that exact sentence, so it is the cheap moment to correct it to
wherever those outputs actually live (or drop the claim).

src/pure/lattice.js:235 — **dead parameter in a new pure export.**
`latticeBands(level, s, cfg, L)` never reads `cfg`, and `latticeRouteCount`
exists only to pass it through. Harmless, but it is now part of the surface
`tools/pathcheck.mjs` asserts against, so it will be copied by the next caller.

## Not findings, recorded so they are not re-raised

- Boot cost `buildLevel` 1.0 → 9.9 ms is one-time and is partly repaid by
  `spawner.js` no longer building a second throwaway level; zero per-frame
  allocation added, and the limb bake stays a single `InstancedMesh`.
- The shelf tip overhangs the 2-column chasm, so walking left off it falls.
  That is ordinary vocabulary for this generator (the seeded stream authors
  2–5 wide gaps everywhere), `latticeStranded` is 0, and the real-sim policy
  child proves no fall lands inside a pocket.
- `docs/DESIGN.md:440/459` say the capsule is "not a dare" and that the dare
  concept "is not cancelled" — negations and concept-level history under
  entries 9/10/11, not a description of the capsule as a dare.
- The static-anatomy reveal shipping as the default while itself unjudged is
  authorized by the task block and entry 3; HANDOFF says plainly it has never
  been operator-judged. Operator question, not a review defect.
- Whether six free capsules per run flattens or escalates the run is entry 9's
  operator test, deliberately un-asserted by the harness. Feel verdict, not a
  gate.
