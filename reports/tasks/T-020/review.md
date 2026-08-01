APPROVE

Diff: `docs/playtests/2026-08-first-gap-triage.md` (new) + `tools/pathcheck.mjs`
(+254, additions only). No `src/` file touched, no CONFIG constant touched, no
new dependency, no build step, no OSTK artifact.

Gate results (run by me, in the worktree):
- `node tools/pathcheck.mjs` → 1527 passed, 0 failed, 2.0 s wall
  (`main` baseline: 1517 passed, 1.79 s — +10 assertions, +0.23 s, all of it in
  one bounded child process).
- The doc's §1 repro reproduces verbatim on this tree:
  `hold-right life lost t=3.08s at x=31.649 | left the lip t=2.52s x=29.363`
  and `floor-probe reached the first wave gate x=88.1 t=10.02s with 3 lives`.
- Probe numbers match the doc's table exactly (29-31: floor 0.74 t, run 4.22 t,
  grace 16 f, 0 f without the air jump; 263-266: no single-jump floor window,
  5.62 t with the air jump). No rounding in the doc's favour.
- Constants cited check out: `hw` 0.35 → `32 − 0.35 − 0.001 = 31.649`;
  `MIN_W = jumpBufferMs 120 ms × scrollSpeed 4.3 = 0.516 t`; `coyoteMs 100` →
  6 frames; `spawner.startS = 28` and the first ambient row really is
  `{x:28, wasp}` (§4b).
- Negative controls re-run by me, in a scratch copy (never in the worktree):
  `jumpVel 14 → 12.2` fails the new face-1 assertion by name
  (`29-31(w3) floor 0.38t/88ms, 48-50(w3) floor 0.38t/88ms`), the first-gap
  assertion, and the every-gap assertion; removing the floor pin
  (`windowFor(..., floor:false)`) fails
  `the probe really is measuring the floor, not a free run`. The new assertions
  are load-bearing, not decorative.

Checklist notes:
- Layer purity: nothing added to `src/`; the probe imports `src/sim/*` in a
  child process (`--input-type=module`, `globalThis.__HB_QUERY__ = ''`),
  matching the existing `?g1=1`/score/transform child-probe pattern in the same
  file, so it cannot perturb the parent's clock, keys, edges or weapon state.
- Determinism: no `Math.random`/`Date.now`/`performance.now` in the diff; fixed
  `dt = 1/60`; all loops bounded (4 s of sim, 40 grace attempts, 418 sweep
  positions).
- Verdict compliance: frozen jump/movement constants untouched (the task's
  explicit prohibition); `?hook=1` untouched; the FAR default is used as the
  shipped assumption, not regressed; no anatomy/render change.
- Test honesty: additions only — no existing assertion weakened, retimed or
  deleted; the pre-existing `full jump at run speed clears the widest gap with
  margin` is kept and complemented. The report's §"What these assertions
  deliberately do not claim" is an honest limitations note, and the floor model
  is conservative (the right clamp in `src/sim/player.js:467` applies in the air
  too, and non-slice mode has no wall-jump/ledge/autobounce save, so the probe's
  "single jump" really is a single jump).
- Fun: the report routes all five judgement calls to the operator (§6) and
  claims only geometry.

Findings (MINOR only):

tools/pathcheck.mjs:648 — the parent/child terrain cross-check compares gap
COUNT only (`G.length === gapRuns(gH).length`), but the comment at line 498
claims it trips "a probe that silently saw different terrain". Terrain that
shifted while keeping the same number of gaps would pass; only the hard-coded
29-31 fingerprint at line 678 would catch it. Compare the `[x0,x1]` pairs, or
soften the comment.

tools/pathcheck.mjs:608 — `graceFrames` re-applies
`p.airJumpsLeft = air ? PL.airJumps : 0` every frame, i.e. it models a player
with an unlimited air-jump budget. Harmless today (exactly one press happens,
the buffer is consumed once, and the re-buffer paths at player.js:176/216/357
are all `IS_TRAVERSAL_SLICE`-gated so the held jump key cannot re-trigger), but
if the probe ever gains a second press it will silently over-report grace.
Setting it once before the loop would keep the measurement honest by
construction.

tools/pathcheck.mjs:678 — the first-gap fingerprint (`29/31/h2`) is a
deliberate tripwire, but the report's limitations list does not mention that a
future task legitimately moving the first gap (operator question §6.1) must
update this assertion in the same commit. Worth one line in §5 so the next
agent does not read the failure as a regression.

Operator questions (not blockers, for the checkpoint queue): the report's §6
raises five — keep the death pit at t = 2.5 s or move it; fall setback as
`?fallback=1` instead of a stock life; gap 263-266 as the level's one
mandatory-air-jump toll; coyote time buying zero frames across a flat gap; and
`spawner.startS = 28` putting the first wasp on the first gap's takeoff lip
where knockback throws RIG backwards into the pit (§4b). The last two are new
issues that belong in SPRINT's Inbox; the builder correctly did not edit
SPRINT.md from the worktree.
