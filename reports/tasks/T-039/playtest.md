PASS

# T-039 RE-PLAYTEST — contact shadows, fix cycle (decisions.md entries 16/17)

**This overwrites the stale pre-fix FAIL.** Worktree: `.claude/worktrees/T-039`,
branch `task/T-039`, HEAD `51c8f16` (build.md §8 addendum; code unchanged
since the fix commit `8cd47cf`, confirmed via `git show 8cd47cf --stat` /
`git show 51c8f16 --stat` — the later commit only touches `build.md` and
evidence images). Pinned and served on port **8825** for the whole session
(`node tools/serve.mjs 8825 --quiet`, killed after). 8741-8748 never touched
(`lsof` checked clear on all eight before starting).

## Check 1 — the fix itself, verified the right way

Grepping `main.js` is the wrong test (per the dispatch's own note — `contact.js`
is consumed by `player.js`/`hostiles.js`/`capsules.js`, not `main.js`). Verified
two ways, neither a rendered-frame guess:

**(a) Direct module import**, several browsers, each a fresh `import('/src/render/contact.js')`
against the real served page:
```
qs=""                        -> CONTACT_SHADOWS_ENABLED=true
qs="?shadow=0"                -> false
qs="?shadow=1"                -> true (redundant, harmless)
qs="?shadow=banana"           -> true (any non-'0' value arms it)
qs="?slice=transform"         -> false
qs="?slice=transform&shadow=1"-> false (guard unaffected by the flag)
qs="?g2=1"                    -> false
qs="?slice=traversal"         -> true, live=3
```
Script: `/tmp/t039-check-flag.mjs` (session scratchpad), reproducible against
this commit.

**(b) Real scene-graph inspection** (stronger than an import check — proves the
mesh is actually wired into gameplay, not just that the resolver is correct):
loaded the plain default URL, held right + tapped jump 6×, then walked
`scene.children` for the `InstancedMesh` `contact.js` builds
(`count===48`, `blending===4` i.e. `THREE.MultiplyBlending`, `MeshBasicMaterial`).
**Found, present, and live** at the plain URL: 11-12 of 48 rows had non-zero
scale (real per-actor matrices, radii 0.52-1.23 world units matching different
actor footprints, y-heights 2.0-4.4 near the deck). At `?shadow=0`: **the mesh
does not exist in the scene at all** (13 InstancedMesh candidates instead of
14, no `count===48`/`blending===4` entry) — confirms the disabled path really
does build nothing, not just hide it. Script: `/tmp/t039-scene-check.mjs`.

**Verdict: the fix is real.** Plain URL renders shadows under RIG and every
live hostile/capsule; `?shadow=0` removes the mesh entirely; the transform-
slice/`?g2=1` guard is unaffected.

## Check 2 — darkness interaction (the named top risk)

`task/T-035` (the half-dose value ladder, decisions.md entry 14) is **still
not on `main`** (`git merge-base --is-ancestor 9e91d7b main` → not an
ancestor), so like the builder, I built a **throwaway scratch merge**
(`task/T-035` HEAD `9e91d7b` + `task/T-039` HEAD `8cd47cf`, two conflicts in
`palette.js`/`pathcheck.mjs`, both independent appends — resolved by
concatenation, no logic changes) to check the real interaction rather than
trust the builder's own scratch-merge numbers. Combined pathcheck:
**2062 passed, 0 failed** (matches build.md's claim exactly). Never
committed/pushed anywhere; worktree and scratch branch removed after
(`git worktree remove --force`, `git branch -D`).

Confirmed shadows are live on the combined tree the same way as Check 1
(scene-graph inspection, 11 live rows). Then captured full frames + computed
frame-wide luminance histograms (not eyeballed) at four combined-tree
configs, plain default URL each time except the named flag:

| config | mean L | frac pixels <30 (near-black) | frac pixels >200 |
|---|---|---|---|
| default (half-dose ladder + shadows ON) | 56.86 | 10.046% | 0.081% |
| `?shadow=0` (ladder only, shadows off) | 56.87 | 10.053% | 0.081% |
| `?shade=0` (flat, no ladder; shadows still default-on) | 67.60 | 1.477% | 0.081% |
| `?shade=1` (rejected full-dose ladder; shadows still on) | 44.39 | 47.336% | 0.082% |

**Contact shadows contribute a ~0.01 mean-L difference and a +0.007
percentage-point near-black-pixel difference on top of the shipped half-dose
ladder — noise, not a trend.** The large jump in near-black pixels (1.5% →
10%) is the ladder itself (entry 14, already operator-approved), not this
task. The full-dose row is included only to show scale: that's what "too
dark" actually looks like (47% of the frame near-black), and it's ~4700× the
frac-black delta contact shadows add. Cropped evidence
(`evidence/13-combined-default-shadowson-halfdose.png` vs
`14-combined-shadow0-halfdose.png`, both already committed by the builder) —
viewed directly, not just cited: a small, real, correctly-placed dark patch
sits under RIG's feet in 13 that is visibly absent in 14; nothing else in the
frame changes. Full-frame captures at all four configs (session scratchpad,
not re-committed — the crop pair above already demonstrates the local effect
and the histogram table demonstrates the frame-wide one) confirm the deck
checker stays legible at the shipped half-dose in every case.

**Verdict: no "crush the deck into mud" regression at the shipped dose.**
This is the same conclusion build.md's addendum reached, now independently
re-derived with a different method (luminance histogram vs. their single
mean-gray-value reading) on a freshly rebuilt scratch merge rather than
trusting their numbers.

## Check 3 — combat readability (pillar 5)

`scripts/hound-wasp-squeeze.json`, `--deterministic`, plain default (shadows
ON) vs `?shadow=0`: **identical outcome both sides** — `hitsWithoutDeath: 1`,
`pageErrors: []`, `not-completed` (script window ends before a life is lost)
— expected for a render-only cue with no sim-side effect.

Real sustained-combat capture: `scripts/six-face-spaced-run.json`,
`--deterministic --max-runtime-ms 26000`, plain default URL. Reached wave 1/6,
4 hostiles concurrent, `maxConcurrent: 8` over the run, `hitsWithoutDeath: 2`,
`pageErrors: []`. Screenshot at a live 4-hostile frame
(`evidence/16-qa-combat-frame-default.png`): wasp-tell diamonds and the hound
marker read clearly against the backdrop; no shadow-shaped dark patch
competes with or is mistakable for a threat tell anywhere in the frame — the
shadows stay tight to actors' feet, well below the tell markers' altitude.

**Verdict: shadows do not compete with combat readability at the shipped
dose**, corroborating build.md's/review.md's own finding independently.

## Check 4 — scale/grounding cue (entry 17's headline goal) — observation only

At the shipped FAR default the cue is real (Check 1's scene-graph proof) but
genuinely subtle to the naked eye — full-frame captures at 1280×800 show RIG
at his designed ~30px height with a shadow a few pixels across; only the
tight 4× crops (builder's own evidence, and mine) make it legible. Whether
this restrained a dose reads as "the tiny human standing on something vast"
to an actual player is a feel question, not a metric one — I am not ruling on
it, per lane-brief scope. **Route to the operator checkpoint queue**, exact
URL `http://127.0.0.1:<port>/index.html` (no query string — this is now the
shipped default), suggested questions:
1. At a normal viewing distance, does RIG read as standing ON the deck, or
   is the cue too faint to register at all during play (vs. a paused crop)?
2. Compared to the flat pre-shadow build, does anything about scale feel
   different, or is the effect currently too subtle to matter either way?

## Check 5 — performance, re-measured with the feature actually ON

Independent method (not `renderer.info`, a raw WebGL `drawArrays/
drawElements/*Instanced` call-count probe, same class of instrumentation the
previous gate's `t039-stress2.mjs` used, adapted for the fixed default):
60 projectiles/frame injected via the game's own `fireWeapon(clone=true)` +
one death burst/flash/frame, 1200ms warm-up + 5000ms sustained, 256 live
projectiles, counted over 10 consecutive rAF frames each side:

| | avgMs | worstMs | fps | over20ms | draw calls/frame (10 frames, all identical) |
|---|---|---|---|---|---|
| default (shadows ON) | 8.33 | 9.4 | 120 | 0 | 106 |
| `?shadow=0` control | 8.33 | 9.4 | 120 | 0 | 105 |

**Exactly +1 draw call, zero frame-time regression** — matches build.md's
claimed delta precisely, now confirmed under the real shipped default rather
than an explicit flag. Raw JSON: `evidence/17-qa-stress-defaulton-vs-shadow0.json`.

**`?slice=transform`'s 580-call path confirmed NOT multiplied**: 580/580 draw
calls across 10 consecutive frames, identical with and without `?shadow=1`
(`contactShadowStats().enabled === false` both times — the guard, not
coincidence, is why it's unchanged).

## Check 6 — regression and durability

- `node tools/pathcheck.mjs` in the worktree: **2017 passed, 0 failed**. Base
  computed myself at the actual merge-base (`git merge-base main HEAD` =
  `d3f6628`, checked in a scratch worktree, removed after): **1741 passed, 0
  failed** — the +276 delta (274 from the original build + 2 net from the
  fix's operator-comparison rewrite) matches build.md's own arithmetic.
- `index.html?selftest=1`: **SELFTEST PASS (29 checks)**.
- Smoke set, `--deterministic --base-url http://127.0.0.1:8825`:
  `scripts/mid-route.json` → `completed`, `pageErrors: []`.
  `scripts/transform-slice.json` → `completed`, `pageErrors: []`.
- Long-run durability: `scripts/six-face-spaced-run.json --deterministic
  --stop-on-game-over --max-runtime-ms 90000`, plain default URL (shadows ON
  throughout). Died normally at `gameMs≈47s`, `GAME_OVER` seen, 3/3 stock
  lives spent (telemetry/HUD cross-check agree), up to 11 concurrent hostiles
  (`carrier`/`hound`/`wasp`), 628 samples with hostiles present.
  **`pageErrors: []`, `teardownErrors: []`.**
- **NaN/orphaned-shadow probe — closes the gap the previous gate explicitly
  flagged as unverified** ("I did not instrument the instance-matrix buffer
  directly for NaN"): wrote a direct probe (`/tmp/t039-nan-probe.mjs`) that
  decomposes all 48 pool rows' matrices + the instance color buffer every
  ~1.2s across 16 samples (~19s) of sustained real play (right held, jump
  tapped every other sample to keep waves/hostiles cycling). **Zero NaN, zero
  Infinity, in every sample, across every row, both matrix and color
  buffers.** Live-row count fluctuated 9-12 of 48 across the whole window —
  bounded and non-monotonic, which is itself evidence against orphaned
  shadows: if `releaseContactShadow` weren't firing on hostile death, live
  count would climb toward 48 as the run's continuous spawn/kill/despawn
  cycle progressed; it didn't.

## Non-blocking observation for the integrator (not a defect in this task)

`reports/tasks/T-039/review.md` (untracked, present in the worktree) is the
**pre-fix** review: it reports `pathcheck` at `2015/0` (the FAIL-state
number) and its "operator-verdict compliance" bullet does not mention entries
16/17 at all — it predates the fix commit the same way the old playtest.md
did. Not something I can or should fix (out of my lane), but flagging plainly
so the integrator doesn't read a green `review.md` as having re-checked the
fix: it hasn't yet.

## PROPOSED INBOX ISSUES

None. Every check in this re-gate passed on independent, freshly-run
evidence (not inherited from build.md/review.md): the flag defaults correctly
and is genuinely wired into live gameplay, the half-dose darkness interaction
is negligible and quantified two ways, combat readability holds, performance
is unchanged beyond +1 draw call, and a full durability pass plus a direct
NaN/orphan probe found nothing wrong. This task is ready to merge.
