APPROVE

Gate evidence (run by this reviewer, in the worktree):
- `node tools/pathcheck.mjs` → **1517 passed, 0 failed** (1.7 s). Pathcheck diff is
  purely additive: +174 lines, no assertion removed or loosened anywhere.
- `git diff main...HEAD --name-only` → 7 files, **zero under `src/`**; merge-base is
  main's tip, so this is the true delta. No new dep, no build step, no query flag,
  no CONFIG constant, no wave-gate touch.
- Independent equivalence replay (my own script, main's `lib/policy.mjs` extracted via
  `git show main:` vs the branch's, lockstep over the committed demo traces):
  `policy-pinned-jump` 133 ticks + `policy-hound-reactive` 45 ticks = **178 ticks, 0
  decision differences**, identical hold sets, tap edges, per-rule truth values and
  fire counts ([0,2] both engines). Confirms the lane's own 2321-tick / 528-tick claims
  in kind.
- All 14 committed policy scripts still compile under the new engine (`compilePolicy`
  over `tools/playtest/scripts/*.json`), including the new one.
- Grammar guarantees checked behaviorally, not by prose: the compiler rejects `||`,
  parens, arithmetic, unknown `threat.*` fields and string ordering; `evaluatePolicyTick`
  derives the view once per tick from one snapshot; `deriveThreat` is a pure function of
  (sample, heldKeys) with no cross-tick state. Layer purity and determinism are trivially
  intact — nothing in `src/` moved and the harness uses no `Math.random`.

MINOR findings:

- `docs/playtests/2026-08-gate-fight-harness.md:67` (also :131, :216) — the doc calls
  `tools/playtest/runs/integ-T009-on-main/` and `integ-T009-on-branch/` "the integrator's
  own **committed** A/B". Those directories exist only as untracked files in the main
  checkout (`git ls-tree -r main` has no `tools/playtest/runs/`, no branch carries them,
  and `.gitignore` does not cover them), so a reader on a fresh clone cannot retrieve the
  cited evidence. The load-bearing both-tree claim survives anyway — §4c re-measures the
  `main`-tree aimless baseline itself on the merged tree (8 kills, scroll 75, 27.3 s) —
  so this is wording, not an evidence gap. Suggest "the integrator's local A/B" or commit
  the two summaries.
- `tools/playtest/lib/threat.mjs:120` — `emptyThreat` seeds `slope`/`upSlope` at `0` and
  `kind`/`state` at `''`, but the README's sentinel convention
  (`tools/playtest/README.md:278`) only promises "every distance-like field reads 99 and
  every count reads 0". A rule written `threat.upSlope<0.5` with no `upDist`/`n` guard is
  therefore *true* on an empty sample — precisely the foot-gun the README calls out for
  `threat.dx` but leaves uncovered for the angle fields. The shipped script pairs its
  slope test with `upDist<13`, so nothing is wrong today; the convention paragraph should
  name the angle/string sentinels too.
- `tools/playtest/lib/sampler.mjs:184` — the terrain probe's arithmetic has no assertion
  anywhere. Pathcheck only checks that the sampler *mentions* `groundH` and that the
  player still collides against it; the near-lip offset when walking left
  (`(dir > 0 ? i : i + 1) - x`), the gap-width scan and `farY` are unverified, and an
  off-by-one there silently mistimes a jump rather than failing loudly. The code must stay
  inside `sampleState()` for `page.evaluate` serialization, but the column arithmetic could
  be a small exported pure helper the page copy calls, or a fixture-array assertion in
  pathcheck.
- `tools/playtest/lib/sampler.mjs:198` — comment at :183 claims the probe keeps per-tick
  cost "O(12) instead of O(level)", but the gap-width `while (gh[j] <= -100) j += dir` scan
  is bounded only by the array length, not by `PROBE_TILES`. Cost is negligible in practice;
  the stated invariant is just wider than the code's.
- `tools/pathcheck.mjs:6857` — the "declares no module-level mutable state (no cross-tick
  memory)" guard is `!/^(let|var)\s/m` over stripped source. A module-level
  `const cache = new Map()` — mutable and cross-tick — would pass it, so the assertion is
  weaker than the claim the README and the finding both make on its authority. Both modules
  are clean today; consider also rejecting top-level `const <name> = new (Map|Set|WeakMap)`
  outside the frozen exports, or soften the wording.

Notes for the integrator (not findings):
- Corroboration for the doc's own "read structural outcomes, not decimals" caveat: the
  integrator's untracked on-branch artifact records **11 kills** for the aimless script on
  T-009's tree where the doc's table records 14 (gate reached and the 3.0 s / x 31.649 first
  death agree exactly). The doc attributes only the `main` cell to the integrator's run, so
  nothing is misattributed.
- `tools/pathcheck.mjs` now imports `tools/playtest/lib/{threat,policy}.mjs` at gate time.
  That chain pulls in `compile.mjs` and `sampler.mjs` only — no Playwright, no
  `node_modules` — so the gate still runs on a bare clone (verified). Deliberate coupling,
  documented in the block header.
- The new script's baseline (`six-face-full-run.json`) lives on `task/T-009`, not on `main`;
  §7 of the finding tells the reader to extract it with `git show`. Fine while that branch
  exists — worth revisiting if T-009 is abandoned.
- Nothing here needs a feel verdict; the operator questions the lane raised (gate-2 ambient
  inflation, wasp telegraph, gate escalation) are correctly parked in §6 as questions rather
  than acted on. The residual "a bot reaches VICTORY" box is explicitly left open and is
  T-019's, per the task block.
