PASS

Worktree: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-057`, branch
`task/T-057`, HEAD `5b073d51b7861404e761260054acce21fac7fae7` (verified). Worktree
was **not modified** — everything below ran against a pinned copy made with
`git archive HEAD | tar -x -C <tmpdir>` at
`/private/tmp/claude-501/.../scratchpad/t057-qa/tree`, served with
`node tools/serve.mjs 8760 --root <tmpdir> --quiet` (killed after this session)
plus the harness scripts' own ephemeral servers (`hulltex-*.mjs` each start their
own on port 0, so they're inherently pinned to the tmpdir too). Never touched
8741/8742. `git status --short` in the actual worktree after this session shows
only `reports/tasks/T-057/review.md` (the reviewer's file, not mine) — confirmed
clean of any change from me.

## Gate 1 — no regression on T-054's win

`hulltex-capture.mjs shots` on the pinned archive:

```
frame                     band    mean     sd       fine     struct
near-open-textured.png    hull    42.51    8.63     1.689    5.884
near-open-flat.png        hull    42.79    5.96     0.390    3.127
far-depth-textured.png    hull    43.02    10.00    1.851    5.709
far-depth-flat.png        hull    43.44    7.18     0.605    2.985
```

Near-hull fine detail 1.689, at/above the ~1.648 bound, against flat's 0.390
(close to the ~0.416 control). Hull mean 42.51 vs 42.79 flat = **-0.65%**,
well inside the ~1.5% darkening fence (far-depth: -0.97%, also inside). No
regression. **PASS.**

## Gate 2 — shimmer metric as a distribution, 3+ interleaved rounds

Ran `hulltex-shimmer.mjs measure` as **3 separate process launches** (rounds),
each launch interleaving both variants and both moments internally (textured
near-open → flat near-open → textured far-depth → flat far-depth), so no
condition ran back-to-back across rounds:

```
near-open (deterministic ramp)         changing        reversing%      residual
  textured   round 1/2/3            7823 / 7823 / 7823   46.5/46.5/46.5   1.894 (x3)
  flat       round 1/2/3            2454 / 2432 / 2454   34.3/34.4/34.3   1.61/1.58/1.61

far-depth (policy ramp, real jitter expected)
  textured   round 1/2/3           10371 / 11673 / 11912  52.3/57.1/56.7   3.28/3.78/4.58
  flat       round 1/2/3            4466 /  4417 /  4342  41.8/42.6/41.6   1.92/1.92/1.91
```

Textured stays well above flat on both metrics in every round — **confirmed,
not inherited**. My absolute numbers (headless, software-rendered Chrome) are
3-4x smaller than the team lead's real-GPU reference (e.g. near-open flat
~2450 here vs ~9300 there; reversing% running ~20 points lower here across
the board) — consistent in direction with build.md's own honesty note that
this harness is very likely SwiftShader, not real anisotropic-filtering
hardware, so it can't validate the fix's effect on the operator's actual GPU.
I can't confirm or contradict the team lead's real-GPU magnitudes; I can
confirm the qualitative pattern (textured >> flat, shipped ≈ unfixed) holds
here too.

**Independent revert check** (own scratch copy, not the worktree): hardcoded
`HULL_MAX_ANISOTROPY` back to `8`, ran the same rig 3 rounds, near-open only:
textured `7823 / 7804 / 7823`, flat `2432 / 2454 / 2454`. This lands inside
the *same* spread as the shipped code's own numbers above — independently
reproduces build.md's core claim that the anisotropy fix moves this metric by
less than the run-to-run noise floor.

**Corroborates the reviewer's REQUEST_CHANGES finding, independently**: I also
saw the flat-near-open count vary (2454/2432/2454) and the textured revert hit
7804 once — the same 7804 value build.md attributes specifically to "baseline
(main, no T-057 changes)". `--repeats` inside one process is bit-identical (I
did not re-check that separately, but nothing here contradicts it); across
separate cold process launches it is not. That's a rig-precision/wording issue
in build.md's prose, already correctly flagged by review.md — it doesn't change
what I'm gating here (the shipped game's behavior), since every number stays
inside a single-digit-percent band regardless, but I'm noting it because I hit
the same thing independently and it's worth the fix-cycle the reviewer already
called for.

## Gate 3 — durability

Ran, all against the pinned archive, `--deterministic`:
- `scripts/mid-route.json` x3 — all `outcome: completed`, 0 console errors, no bootError.
- `scripts/transform-slice.json` x3 — all `outcome: completed`, 0 console errors, no bootError.
- `scripts/six-face-full-run.json` (policy mode, covers multiple faces) — `outcome: died`
  in a wave-gate fight after 2 lives, matching this script's own documented behavior
  (it has never reached VICTORY on any tree); 0 console errors, no bootError.
- `scripts/ribrun-climb.json` — `outcome: completed`, 0 console errors, no bootError.

No blank page, no softlock, no crash, camera never lost RIG. **PASS.**

## Gate 4 — perf (entry 18)

`hulltex-stress.mjs` (256 live projectiles via the pool cap, 3 repeats each):

```
flat      worstMs [9.40, 9.40, 9.40]  over20ms [0,0,0]  drawCalls [186,186,186]
textured  worstMs [9.20, 9.40, 9.30]  over20ms [0,0,0]  drawCalls [186,186,186]
```

Both well under the 16.67ms/60fps budget, zero frames over 20ms, identical
draw calls. No measurable perf cost from the anisotropy change. **PASS.**

## Gate 5 — entry 16 degradation

`hulltex-capture.mjs fallback` (every tile aborted at the network layer):
`state PLAYING, frames 2595`, textured buckets `[]`, all 5 files `false`,
`brightened-without-a-map: 0`, `page errors: none`. **PASS** — no wedge,
gameplay doesn't branch on load success.

## Gate 6 — smoke scripts complete

`mid-route.json` 3/3 completed, `transform-slice.json` 3/3 completed — no
1-of-3 or worse non-completion. **PASS** (I-040 threshold not triggered).

## pathcheck

Pinned archive: `node tools/pathcheck.mjs` → **3201 passed, 0 failed**.
Base (`git merge-base main HEAD` = `891a092`, checked in an existing scratch
worktree at that commit): **3195 passed, 0 failed**. +6 matches build.md's
claim.

**Independent break check** (own scratch copy, hardcoded `anisotropy: 8`
instead of the dynamic read): `3200 passed, 1 failed` —
`FAIL T-057: materials.js reads the device's own anisotropy limit... rather
than a pinned guess`. Confirms the new assertion binds (build.md's own
break/restore test used a different revert shape and got 2 of 6 failing;
mine got 1 of 6 — same conclusion, different exact count, not a discrepancy
I chased further since the point — does the gate catch a regression — is
proven either way).

## Visual check (moving, not stills)

The builder's two ~11s recorded clips from this shipped tree (scratch-only,
not committed, under this session's own scratchpad — regenerate per build.md
if needed) are real evidence, not something I can watch in real time with my
tools. I extracted frames at 3fps with ffmpeg and looked at several from each
(textured: `.../scratchpad/t057-qa/frames-textured/`, flat:
`.../scratchpad/t057-qa/frames-flat/`) — **honesty note: spaced stills cannot
show frame-to-frame shimmer, which is exactly this lane's own point; I am not
claiming to have seen or ruled out the flicker by eye.** What I could and did
check from these frames: no glitches, no z-fighting, no texture
misalignment, no assembling/zip-in geometry, style consistent with the
riveted-panel/ladder motif in the concept boards, RIG legible at the frozen
FAR view, and the textured/flat difference in surface detail (rivets, panel
lines, ladder rungs visible in textured, smoothed out in flat) is plainly
visible even in stills — corroborating the fine-detail numbers above. Both
clips ended in death from a bare hold-right with no jump (documented, expected).

Committed stills (`reports/tasks/T-057/evidence/*.png`) reviewed too — same
observations, same caveat about stills and shimmer.

## Verdict

Every gate item the team lead named passes: no regression on T-054's density
fix, no perf cost, entry 16 degradation intact, durability held across the
smoke set plus a multi-face policy run and a climb script, and the shimmer
distribution — measured fresh, 3 interleaved rounds, independently — confirms
the report's own honest conclusion (the anisotropy fix is safe and correct on
its own merits but does not move I-049's shimmer metric beyond the noise
floor). The one real defect I found is a prose-accuracy issue in build.md
already caught by review.md's REQUEST_CHANGES; nothing about it changes what
ships or how it behaves for a player.

## PROPOSED INBOX ISSUES

## I-??? | docs | S3 | repro: `node tools/playtest/hulltex-shimmer.mjs measure --moments near-open` run 3x as separate process launches, on the T-057 worktree at `5b073d51b7861404e761260054acce21fac7fae7` (unmodified) | evidence: this report's Gate 2 table + `reports/tasks/T-057/review.md`
Independent corroboration of a finding review.md already made (filing this as corroboration for the integrator, not a new issue — dedupe against review.md's REQUEST_CHANGES item): `hulltex-shimmer.mjs`'s "bit-identical across repeats" claim holds only for repeats inside one warm browser process; across separate cold process launches the same code gives textured `near-open` `changing` 7804 or 7823 and flat 2432 or 2454. Since build.md's headline "shipped vs baseline: no meaningful change" leans on a single baseline reading of 7804 that was never repeat-checked the way the shipped reading was, that specific delta is indistinguishable from this cold-start noise. Doesn't change the report's overall conclusion (the 8 rejected canvas variants move the metric 20-30%, well outside this band) but the prose should say "no change beyond a noise floor we measured to be ~0.2-1%" rather than implying a single precise before/after pair, and a future round of this rig should either warm the process before its first reading or take `--repeats` from a fresh process each time.

## Note: this verdict is for `5b073d5` only, not the current worktree state

While writing this report, `git status --short` in the worktree started
showing an uncommitted, in-progress edit to `tools/playtest/hulltex-shimmer.mjs`
(a live fix responding to `review.md`'s REQUEST_CHANGES — replacing the fixed
400ms boot wait with a `waitForFunction`, and dispatching the ramp keydown
synchronously inside the capture loop instead of via a separate CDP key
event). I did not touch this file; this is someone else's fix cycle running
concurrently. **Everything in this report was measured against the archived
`5b073d51b7861404e761260054acce21fac7fae7` tree, not this in-flight state** —
this PASS is for that commit. A new commit addressing review.md's finding
will need its own gate pass (mine can't speak to whether the new
`waitUntilReady`/synthetic-keydown approach actually closes the cross-process
variance I measured above — that's a fresh claim needing fresh verification).

## Verification commands (this session)

```
git archive HEAD | tar -x -C <tmpdir>                          (pin the tree)
node tools/serve.mjs 8760 --root <tmpdir> --quiet               (manual server, killed after)
node tools/pathcheck.mjs                                         → 3201 passed, 0 failed (base 3195/0)
cd tools/playtest
node hulltex-capture.mjs shots --out <dir>                       → fine detail / mean table above
node hulltex-stress.mjs <dir>                                    → perf table above
node hulltex-shimmer.mjs measure --out <dir1/2/3>  (x3 rounds)    → shimmer table above
node hulltex-capture.mjs fallback                                → entry 16 PASS
node run.mjs scripts/mid-route.json --base-url http://127.0.0.1:8760 --deterministic       (x3)
node run.mjs scripts/transform-slice.json --base-url http://127.0.0.1:8760 --deterministic  (x3)
node run.mjs scripts/six-face-full-run.json --base-url http://127.0.0.1:8760 --deterministic --max-runtime-ms 60000
node run.mjs scripts/ribrun-climb.json --base-url http://127.0.0.1:8760 --deterministic
```
