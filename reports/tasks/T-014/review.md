APPROVE

Gate run in the worktree: `node tools/pathcheck.mjs` → **1048 passed, 0 failed**
(303 lines added to pathcheck, 0 deleted — nothing weakened or removed).
Layer purity clean (`src/pure/mortar.js` imports only `../config.js`, the same
pure root `traversal.js`/`polyp.js` use; sim→render stays on the bridge hooks;
no THREE/`document`/`window` in pure or sim). Determinism clean (no
`Math.random`/`Date.now`/`performance.now`; the state machine runs on the sim
`gameMs` clock; the sim stays 2D `(s, y)`). Verdict compliance: no level
geometry moves (entry 3 untouched), `?hook=1` untouched, frozen player/jump
constants unchanged, flag defaults off and `mortarComposePlan` returns the
*same array reference* with no `?mortar=`, so every existing URL is
byte-identical. Placement-over-stats (entry 6) held: hp 5, damage 1, and the
threat is asserted to come from the marked patch's position, its intact
reroutes, and the arc clearance. Materialization gating correct — `updateMortar`
returns before `enterUntil`, and contact damage is already `enterUntil`-gated.
Perf: pose objects reused, no per-frame allocation in `mortarSync`, geometries
module-level, three extra materials per mortar disposed in `mortarDetach`
(reached from both `removeHostile` and `clearHostiles`). Evidence checked
against the traces, not just the prose: both runs cycle `aim→lob→fuse→burst→cool`
and end hp 3/3, and the combination trace really does show `hound: tell/charge/skid`.

MINOR findings (none blocking):

- src/config.js:290 — `armRange: 13` is documented as "Bounded by the fixture's
  own follow lead (asserted)", and src/sim/hostiles.js:360 repeats the claim
  ("inside the fixture's own follow lead: the first lob always happens on
  screen"), but no assertion binds `CONFIG.mortar.armRange` to anything.
  tools/pathcheck.mjs:5589 exercises `mortarArmed(48, 59.5, 13)` with hardcoded
  literals instead of `MO.armRange` and the authored zone x, so retuning
  `armRange` to any value stays green. The value happens to satisfy the claim at
  the FAR default (13 < `followLeadTiles` 16); the assertion the comments promise
  is simply missing. Add `ok(MO.armRange <= TF.run.followLeadTiles, …)` and route
  the unit test through `MO.armRange` / the authored `zone.x`.
- src/render/hostiles.js:317 — the comment says "the tube leans down its
  authored line of fire", but `mortarRoll` returns `e.dir * 0.42`; with `dir=-1`
  (zone at smaller s) a positive-Z Euler tips the cone's muzzle toward +s, i.e.
  away from the marked patch — visible in the builder's own
  `evidence/far-view/2-fuse.png`, where the tube leans right while the mark sits
  left. Render-only and cosmetic, and the sign matches the houndframe's existing
  `e.dir * chargeLean` convention, so the fix is either `-e.dir * 0.42` or a
  truthful comment — but as written code and comment disagree.
- tools/pathcheck.mjs:5624 — the comment "no `?mortar=` (and any junk value)
  leaves the plan byte-identical" is true of `mortarComposePlan`, but not of the
  URL surface it describes: src/mode.js:143 resolves any unrecognized `?mortar=`
  value to `'solo'` (deliberately matching the hound/polyp convention), so
  `?mortar=nonsense` fields the trial. Scope the comment to the pure function.
- reports/tasks/T-014/evidence/README.md:70 — points the reader at "the T-014
  checkpoint packet in `SPRINT.md`", which exists in neither this branch nor
  main. The feel questions are therefore not queued anywhere in-tree; the
  integrator must add the checkpoint-queue entry (URL + questions) before this
  reaches the operator.

Operator questions (feel, explicitly out of a reviewer's scope — for the
checkpoint packet, not blockers): whether a 1.54 s warning (900 ms lob + 640 ms
fuse) reads as generous or sluggish at the FAR default; whether the marked pad
and the dim warning field are loud enough at that distance without becoming
noise; whether the tripod standing on the tier the denial pushes you *up* toward
(with its own contact circle) is a good pressure or an unfair one — the builder's
own evidence README records a bot losing 1 hp to exactly that interaction.
