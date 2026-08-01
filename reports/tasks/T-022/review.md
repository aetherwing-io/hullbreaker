APPROVE

SECOND PASS (fix cycle re-review). Diff re-read fresh against the merge base
`5c8292a` (`git diff main...HEAD`, 3 commits, no untracked files):
`src/pure/momentum.js` (new), `src/config.js`, `src/mode.js`, `src/sim/pace.js`,
`src/sim/scroll.js`, `src/sim/level.js`, `src/ui/hud.js`, `tools/pathcheck.mjs`,
`README.md`, `docs/HANDOFF.md`, two new playtest scripts.

Gate run by me, in the worktree: `node tools/pathcheck.mjs` → **1600 passed, 0
failed**. Across the whole branch diff, `tools/pathcheck.mjs` has **zero removed
or modified pre-existing lines** (every `-` in the branch is an import-list
rewrite in `src/sim/*` or a doc reflow), so nothing was weakened to get green;
the two tautologies flagged last pass were rewritten inside assertions this
branch itself added.

First-pass findings — all verified fixed:
- MAJOR (weak packet's falsification criterion contradicted the design) —
  FIXED. `momentum-weak.json:3` now gates on drive, not raw speed: (1) drive
  must not exceed 0.30 / 4.82 t/s (the bank deadband), (2) drive <= `hitDrive`
  0.35 on the frame a hit lands and no rise for 1500 ms, (3) exactly 4.30 after
  a lost life, and it states outright that escalation from kills inside x1.12 is
  design-correct rather than a failure. `tools/pathcheck.mjs:7643-7656` adds the
  matching `weakFed` probe (plane-pinned + fed kill streak) so the bound is
  measured in the same build the packet gates on.
- MINOR (aspirational script descriptions) — FIXED. Both descriptions now carry
  two measured runs each with sample counts, medians, p90, peak, kills,
  edgeMargin and the GAME_OVER time, and the weak script no longer claims it
  demonstrates "can still finish".
- MINOR (`samples` key the harness never emits) — FIXED in both scripts;
  `report.json` -> `trace` is correct (`tools/playtest/run.mjs:231`), and
  `pursuitSpeed` / `hudTR` are both real sampler fields
  (`tools/playtest/lib/sampler.mjs:82,138`).
- MINOR (hard ceiling was a convention, not a chokepoint) — FIXED.
  `src/sim/pace.js:66-68` routes the live value through `momentumClampSpeed`,
  and `tools/pathcheck.mjs:7738-7749` asserts that structurally against the
  source so a later boost cannot route around it.
- MINOR (two tautological assertions) — FIXED. `tools/pathcheck.mjs:7703-7736`
  now steps the shipped `src/sim/spawner.js` in `src/main.js`'s order inside the
  probe and counts entries actually consumed, against the table prefix the
  scrolled distance uncovered — an equality, not a definition. Spot-checked
  against `src/sim/spawner.js:39` (`x < re - 1.5`): the predicate matches.
- MINOR (dead `momentumEnabled`/`momentumSnapshot` exports) — FIXED, removed.
- MINOR (HANDOFF flag inventory) — FIXED (`docs/HANDOFF.md:228-233`, `:302-304`,
  `:394-397`).

Independent re-check of the checklist on the full diff:
- Layer purity: `src/pure/momentum.js` has no THREE/`document`/`window`, no
  upward import, no module state; `src/sim/pace.js` owns the drive and it is
  written from one place (`updateMomentum`, called only by
  `src/sim/scroll.js:57-68`); `src/ui/hud.js` reads sim/pure downward only.
- Determinism: no clock or unseeded rng in either file (asserted at
  `tools/pathcheck.mjs:7476-7481`); every input is sim state; the sim stays 2D;
  `updateScroll` only runs while `state === 'PLAYING'` (`src/main.js:513`), and
  `resetPace()` clears drive/bank/combat/mercy/`primed`.
- Verdict compliance: `src/config.js`'s diff is purely additive (a new
  `momentum` block above `player:`) — no frozen movement/jump constant touched,
  which is what entry 11 forbids explicitly. No render/anatomy change, `?hook=1`
  untouched, FAR default untouched. Flag scoping is asserted from the
  composition root (`tools/pathcheck.mjs:7600-7631`): absent/`=0` off, fixture
  URLs can never arm it, so every shipped and fixture URL is byte-identical.
- Perf: pure arithmetic per frame; the only new allocation is the HUD string,
  built solely when the flag is on and diffed before `textContent` is written
  (`src/ui/hud.js:127`). The appended ` · MOMENTUM …` text does not disturb the
  sampler's `hudTR` regexes (`(\d+) kills`, `EDGE …`, `ATTEMPT …`).
- Scope: no new dependency, no build step, no OSTK artifact, docs updated.

Findings (MINOR only):

MINOR — `tools/playtest/scripts/momentum-weak.json:3` — criterion (1) reads any
drive above 0.30 as "the bank deadband leaked", but the same trace is
design-correct if the weak policy ever *did* sit right of `bankLo` (0.55 of the
strip) with the plane moving — a respawn placement or a post-gate resume can put
RIG there for about a second. The measured runs (peak drive 0.061 / 0.122) show
it does not happen with this policy, so this is a false-alarm risk, not a
defect: pair the gate with the sampled `edgeMargin` / `screenRight` at the
offending sample so a real leak can be told from an earned bank without a cycle
being spent on it.

MINOR — `README.md:71` (126 cols) and `docs/HANDOFF.md:304` (92 cols) — the fix
commit reflowed two paragraphs and left both lines past the files' ~78-col wrap;
cosmetic, but they are the only two lines this branch introduces that break it.

MINOR — `src/pure/momentum.js:138`, `:147`, `:154` — `momentumHeadroom`,
`momentumSpawnScale` and `momentumDriveFromSpeed` are exported pure surface with
no shipped caller; they exist for `tools/pathcheck.mjs` and for reading a report.
Defensible (each is asserted, and the spawn-scale one is now explicitly labelled
a *prediction* the measured probe reproduces), but it is three harness-only
exports in a runtime module — worth a line in the module header saying so.

MINOR — the acceptance box "a struggling player … can still finish" is not
demonstrated, and cannot be by a bot in this repo (`SPRINT.md:21`:
boot-to-victory is operator-only, no reflex policy reaches VICTORY; the weak run
spends its last life at ~27.5 s). What IS proven is the box's real subject: drive
0 returns `CONFIG.scrollSpeed` exactly, a plane-pinned run holds 4.30 t/s for 25 s
with the flag on (`tools/pathcheck.mjs:7639-7642`), and a fed struggling run is
bounded at x1.12. Flagged so the box is closed by the operator's judgment rather
than silently treated as machine-proven.

Operator questions (feel — explicitly not blockers): is x1.40 the right top for
earned escalation when a strong bot already reaches x1.27 in ~11 s; does the
70/30 daylight/kills split read as "explosion AND speed", or does the fight
deserve more of the range; should a hit really cap drive at 0.35 (a 5.44 -> 4.90
t/s drop mid-fight) or shed more gently; does the held-bank rule at a wave gate
read as the gate rewarding a clear; and — the one worth watching in play — at
x1.4 the pursuing plane closes 1.7 t/s faster while RIG crosses an authored gap,
so does any generated gap start to feel unfair at the top of the curve.
