REQUEST_CHANGES

Gate: reviewer, task T-009, entry-9 application pass. Worktree
`/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-009` (branch
`task/T-009`, HEAD `b747e47`). Checks I ran here myself: `node
tools/pathcheck.mjs` → **1589 passed, 0 failed** (main: 1527, so +62 net);
`index.html?selftest=1` in headless Chrome against a local server on this
worktree → **SELFTEST PASS (29 checks)**, no page errors.

What the verdict pass actually did, verified rather than taken on trust:

- **Geometry is the plain shape again.** `shelfRise 4.45` is deleted and the
  shelf is `mid + LATTICE.tierRise` (`src/pure/lattice.js:301`), `rewardRise`
  is back to `0.7`; I built the level and measured it — shelf `deck + 4.35`,
  capsule `deck + 5.05`, one pocket per face, exit margin 12.17 tiles on all
  six. That is the simplest shape this task ever authored (accept box 3), and
  the A/B frames in `artifacts/t009-lattice/entry9/` support the FAR claim
  they are cited for: in `01` the magenta `S` sits on the shelf line inside
  the catwalk band, in `02` it floats clear of every route line. Honesty note
  in that README is accurate about how the frames were captured.
- **Removed, not weakened.** Against `main` the only deleted `ok()` lines in
  the whole diff are the two generator pins (49 → 62 platforms, fingerprint
  `cc6afd7c` → `e715cc38`), both moved with reasoning in place. Everything
  else the verdict retired is gone with its subject: the swept deck-line arc,
  the head-reach/double-jump envelopes, the pinned deck+1 residue, the
  climb/total detour pricing, the "collects NOTHING" pair, the adversarial
  child, and the four exports that fed them (`latticeApex`,
  `latticeRiseSeconds`, `latticeHeadReach`, `latticeClimbSeconds` — no
  dangling references anywhere). Everything the verdict says stays is still
  asserted: one pocket per face, in-face/arena/apron placement, chasm width
  and the held jump that clears it, shelf tip over void and mount over solid,
  reachability with taught verbs, `latticeStranded`, standing-on-the-tip
  payment at every bob phase, the detour clock (14 in, ≥6 out), determinism,
  route density 3–5, and the sim-side pickup drift guards.
- **Layer purity / determinism / scope clean.** `src/pure/lattice.js` imports
  only `./path.js`, has no THREE/DOM/globals and no rng (seed-free `hash()`);
  no `Math.random`/`Date.now`/`performance.now` in `src/pure` or `src/sim`;
  `src/config.js` is not in the diff, so the frozen jump constants are
  untouched; `?hook=1` untouched; no new runtime deps, no build step, no OSTK
  artifacts. Cost is boot-time only — `buildLevel` 9.6 ms, spawn table 0.24 ms
  on this machine, nothing added to the frame loop.
- **Static-anatomy default holds** (`decisions.md` entry 3): default vs
  `?zip=1` trace equivalence still runs and still compares two different
  modes, the zipper hook is still installed and driven, and `src/render/limb.js`
  is still statically proven un-animatable. HANDOFF/README/DESIGN are honest
  that the reveal itself has never been operator-judged.

One accept box is still not met, in text rather than in code, and it is the
box this whole cycle exists to satisfy.

## Findings

tools/pathcheck.mjs:7071 — **MAJOR — accept box 1 is not met: the six-face
pocket block still declares "measured retreat" as live vocabulary.** The
header of the `T-009: the six-face lattice` block says the generator and the
harness "can never disagree about what 'readable route', 'reachable',
'stranded', or 'measured retreat' mean." Entry 9's binding consequence is that
no code, comment, doc, assertion or operator-packet text may describe the
capsule as a dare, a wager, or a *measured retreat*, and the task's box 1
repeats it verbatim. This is not history-in-the-past-tense like the compliant
notes at 7171/7235/7620/7648 or `src/pure/lattice.js:148` — it is a
present-tense claim about what this harness block defines, and it is also
false: every retreat assertion in that block was deleted this pass and the
mirrored comment in `src/pure/lattice.js:527-530` was correctly reworded to
"readable". One word, in the one file the box names, in the pocket's own
block. Fix the header (e.g. "reachable", "stranded", or "readable") and the
box is met.

tools/pathcheck.mjs:7629 — **MINOR — the replacement assertion pins behaviour
entry 9 made design-neutral.** `ok(run.rewardsLeft < run.spawnedRewards, ...)`
requires the hold-right deck-line policy to collect at least one of the six.
Under entry 9 whether a free crossing pays is exactly the question the harness
"has no business certifying either answer" to (the block's own words at
7620) — asserting the inverse of the withdrawn claim is still an assertion
about the withdrawn subject, and a future lattice shift that moves the crossing
arc off the capsule would fail this gate with no defect present. Liveness is
already proved without it: `spawnedRewards === CONFIG.path.faces`, the
authored-route child ("the pocket route PAYS at every pocket"), and the four
source-drift guards on `spawnCapsule`/`circleHitsPlayer`/bob. Suggest reporting
the deck-line collection count rather than gating on it.

tools/pathcheck.mjs:5571 — **MINOR — stale flag name in an assertion message.**
The trace-equivalence check now compares `?zip=1` against the default (correct,
and the comment above says so), but the failure message still reads "every
simulated value is identical with `?g1=1`". After the default flip `?g1=1`
selects the default, so the message names the wrong pair; reword to `?zip=1`.

tools/playtest/README.md:770 — **MINOR — the new script is not in the tool's
own index.** `tools/playtest/scripts/six-face-full-run.json` is added by this
branch and is referenced only obliquely ("the aimless script") in the
`six-face-aimed-run.json` row. The harness DoD asks for the tool's README to be
updated; add the row (its own description already carries the honest
where-it-stops and the I-020 retraction, so the row can be short).

SPRINT.md:480 — **MINOR — operator-packet text goes stale the moment this
merges** (integrator-owned file, outside this diff, flagged not fixed). The G1
checkpoint entry asks the operator to play "default vs `?g1=1`"; after this
branch both URLs resolve to the same static-anatomy build, so the A/B compares
identical trees. The live pair is `default` vs `?zip=1`. Same file, line 181,
still calls this task's deliverable "dare pockets", which box 1 also covers for
packet text.

## Not findings, recorded so they are not re-raised

- `docs/DESIGN.md:459-466` pointing the pocket section at entries 10/11 (fork,
  not spur, is the end state) is outside the literal "apply entry 9 and nothing
  else" instruction but is doc-truthfulness only, no code, and it prevents
  DESIGN from reading as if the shipped spur were the target. Correct call.
- The remaining "dare pocket" language in `docs/DESIGN.md:176`,
  `docs/HANDOFF.md:157`, `README.md:108` and the traversal-fixture assertions
  (`tools/pathcheck.mjs:2867+`, `3215+`, `3614+`) is the *traversal slice's*
  own mechanic, pre-existing on main and unparked by entries 10/11 — not this
  capsule, and correctly left alone.
- The static-anatomy reveal shipping as default while itself unjudged is
  authorized by the task block and entry 3, and HANDOFF says plainly that it
  has not been judged. Operator question, not a review defect.
- Weapon economy (six free capsules per run) is answered by entry 9's
  escalation test and belongs to the operator, not this gate.
