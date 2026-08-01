REQUEST_CHANGES

Diff: `src/pure/momentum.js` (new), `src/config.js`, `src/mode.js`,
`src/sim/pace.js`, `src/sim/scroll.js`, `src/sim/level.js`, `src/ui/hud.js`,
`tools/pathcheck.mjs`, `README.md`, two new playtest scripts. Additions only —
no CONFIG movement/jump constant touched, no new dependency, no build step, no
`?hook=1` investment, no render/anatomy change, no OSTK artifact.

Gate results (run by me, in the worktree):
- `node tools/pathcheck.mjs` → **1593 passed, 0 failed**, 2.1 s wall
  (`main` baseline 1527/0 — +66 assertions, no assertion removed or weakened;
  the only `-` lines in the diff are import-list rewrites).
- Default URL unaffected, verified in a real browser against this tree
  (`six-face-aimed-run.json --deterministic --url .../index.html`, 20 s cap):
  `pursuitSpeed` min = max = 4.3, HUD top-right unchanged (`42m · 2 kills`),
  0 page errors, 0 console errors.
- `momentum-strong.json` on `?momentum=1` (deterministic, 1440x900):
  `pursuitSpeed` 4.30 → peak **5.44 t/s (×1.27)**, above the floor on 72% of
  samples, 7 kills, HUD reads `MOMENTUM ▰▱▱ ×1.17` mid-run. 0 errors.
- `momentum-weak.json` on the same URL: `pursuitSpeed` **4.30 for every one of
  329 samples**, 0 kills, all three lives spent at 22.8 s (run ends there, not
  at the 60 s script window). 0 errors.

Layer purity, determinism and verdict compliance all hold on inspection as well
as under the static guards: `src/pure/momentum.js` is clock-free, rng-free and
module-state-free; the drive is owned by `src/sim/pace.js` and written from one
place; every input is sim state (screen fraction, kills, hp, lives, `gameMs`);
there is no elapsed-time or face-index term, which is what makes this entry 11's
earned escalation rather than the scripted `surge` ramp it sits beside.

Findings, most severe first:

MAJOR — `tools/playtest/scripts/momentum-weak.json:3` — the operator packet's
stated falsification criterion contradicts the shipped design. The description
says `pursuitSpeed` "should read the shipped 4.3 t/s for the entire run, with
the HUD meter empty at ×1.00" and that "if pursuitSpeed leaves 4.3 anywhere in
this trace — the floor promise is broken and the task is not done". That is not
what this build promises: the combat term is independent of the daylight bank
(`src/pure/momentum.js:79`, `src/sim/pace.js:100-103`), so a player with
zero banked daylight who kills 4 enemies inside the 9 s decay window reaches
drive 0.3 → **4.82 t/s (×1.12)** — a number the branch's own pathcheck asserts
(`tools/pathcheck.mjs:7417-7423`, "still only reaches 4.82 t/s"). The weak run
only holds 4.3 because this particular policy scored **0 kills** and wiped at
22.8 s; one low-lane wasp walking into its held fire button flips the packet's
own gate to "the task is not done" on design-correct behaviour. This matters
twice over: the playtester gate reads this text, and the operator is being told
a struggling player is never escalated at when the design says otherwise.
Restate the criterion in the terms the code actually guarantees (bank term is
zero below `bankLo`; escalation from a struggling player is bounded by
`wCombat` at ×1.12; drive is capped to `hitDrive` on damage and cleared on a
life), or gate the run on the bank term rather than on the raw speed.

MINOR — `tools/playtest/scripts/momentum-weak.json:3`,
`tools/playtest/scripts/momentum-strong.json:3` — both descriptions are
aspirational where every other script in `tools/playtest/scripts/` records what
was measured (compare `six-face-aimed-run.json:3`'s "MEASURED, NOT
ASPIRATIONAL" paragraph). My runs above give the numbers: strong peaks ×1.27
with 7 kills; weak holds ×1.00 with 0 kills and spends its three lives at
22.8 s. That last number also qualifies the weak script's "RIG still advances,
because the plane conveys him forward" claim — as played, it advances ~60 m and
then wipes, so it does not by itself demonstrate the accept box's "can still
finish".

MINOR — `tools/playtest/scripts/momentum-strong.json:3` — "Read `pursuitSpeed`
in report.json's samples" names a field the harness does not emit; the per-tick
array is `report.json` → `trace` (top-level keys are meta/outcome/metrics/…/
trace). Same wording is implied in the weak script.

MINOR — `src/pure/momentum.js:127` — the hard ceiling is documented as "the top
of the pace, whatever produced it" (`:29`, `:120`) but nothing on the live path
applies it: `src/sim/pace.js:63` → `momentumSpeed()` only, and `momentumClampSpeed`
is referenced solely by pathcheck. Harmless today (drive is clamped to 1 and
`ceilMult` < `hardCeilMult`), but as written the ceiling is a convention T-023
must remember to call rather than a chokepoint it cannot bypass. Either route
`momentumScrollSpeed()` through the clamp now, or soften the comment to say it
is the contract T-023 will apply.

MINOR — `tools/pathcheck.mjs:7350` and `:7321` — two assertions are tautologies
carrying non-tautological messages. `momentumSpawnScale(d, cfg)` is defined as
`momentumSpeed(d, 1, cfg)`, so asserting it equals `momentumSpeed(d, base)/base`
proves linearity, not the message's claim that "no second escalation knob exists"
— the real evidence is that `src/sim/spawner.js:39` triggers off `sRightEdge()`,
which is untested here. `base >= CONFIG.scrollSpeed` is `base === base`. Both
would be worth pointing at the wiring instead (e.g. drive the probe child and
count spawn-table entries consumed per second at drive 0 vs drive 1).

MINOR — `src/sim/pace.js:58`, `:64` — `momentumEnabled()` and `momentumSnapshot()`
are exported and never called anywhere in `src/` or `tools/`. Dead surface; the
HUD and telemetry both read the individual getters.

MINOR — `docs/HANDOFF.md` — README gained the `?momentum=1` entry point (good,
and accurate), but HANDOFF's prototype-flag inventory (`:214`, `:222`, `:382`)
still lists `?flow=1`, `?score=1`, `?g1=1` and not this one. Docs DoD asks for
HANDOFF to stay truthful when entry points change.

Operator questions (feel, explicitly not blockers): is ×1.40 the right top for
earned escalation given a strong bot already reaches ×1.27 in 12 s of clean
play; does the 70/30 daylight/kills split read as "explosion AND speed" or does
combat deserve more; should a hit really cap drive at 0.35 (a 5.44 → 4.90 t/s
drop mid-fight) or shed more gently; and does the held-bank rule at a wave gate
feel like the gate rewards clearing it.
