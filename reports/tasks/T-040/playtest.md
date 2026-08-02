PASS

Gate subject: `task/T-040`, HEAD `1bdc750` ("Merge main into task/T-040: re-home
the lane's assertions as a domain module, 2515 labels (2469 + 46)"), worktree
`/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-040`. Same commit
as the previous gate below — the tree has not moved, only the standing
interpretation of one finding has (see §0).

**This supersedes the committed `FAIL` at this same path** (commit `72fb43c`,
"Gate artifact: T-040 playtest FAIL (residual sprite-load determinism,
1/16 runs)"), which itself superseded the original `FAIL` from HEAD `10b5d9e`
(commit `9a4b4fad`). Per `docs/ORCHESTRATION.md`'s "gate artifacts go stale
when the branch moves — check the tree, not the verdict" note: the tree is
identical to what `72fb43c` gated (confirmed: `git -C .claude/worktrees/T-040
rev-parse HEAD` still reads `1bdc750`), so this is not a re-gate of new code —
it is this file catching up to an integrator ruling that landed after
`72fb43c` was written.

## 0. Why the verdict flips: I-039 reclassified, not resolved by a code change

`72fb43c` correctly found a real, reproducible residual (7/16 shipped-default
runs deviating on `mid-route.json --deterministic`, worst case a
`minEdgeMargin` of 33.04 tiles against a 35.3–35.4-tile control band) and
correctly declined to round it to green. Since then, T-049 spent 132
committed runs (`reports/tasks/T-049/i039-evidence/*.csv`, in the T-049
worktree) isolating the cause rather than accepting the FAIL at face value,
and I independently re-derived their headline numbers directly from the raw
CSVs before accepting this ruling (not from the SPRINT prose alone):

- `isolate-load-vs-draw-12x3.csv`: `main` (nothing touched) = **0/12**
  deviating from `dispatched=18`; `loadnodraw` (the gate loads+warms 5
  textures but nothing is ever drawn with them) = **12/12** deviating;
  `off` (`?sprites=0`, nothing loaded at all) = **1/12** deviating. Verified
  by counting the `dispatched` column myself — matches the SPRINT summary
  exactly. **Loading alone reproduces the effect in full; drawing adds
  nothing.**
- `regate-16x4.csv` (the GPU warm-up A/B): `nowarm` deviates **11/16**,
  `warm` deviates **14/16** — the warm-up made it *worse*, not better.
  Verified by counting myself. Matches "no improvement."
- `fixeddt-8x3.csv`: with `?fixeddt` pinning the timestep — the flag whose
  entire purpose is to remove frame-timing variance — the untouched `main`
  **control** itself deviates **2/8** rounds, `gameMsMax` ranging
  4533.3–19683.4ms from byte-identical input. Verified by counting myself.
  A fixed timestep making the *control* scatter is the load-bearing result:
  it means `--deterministic` mode's own key-dispatch-to-real-frame alignment
  (already flagged as an open, unproven risk in `tools/playtest/README.md`'s
  "Deterministic injection mode" section, well before this task existed) is
  the actual mechanism, not something `src/render/preload.js` or RIG's
  sprite can fix from the game side.

**What this does and doesn't mean.** It does not mean `72fb43c`'s
measurement was wrong — the numbers are real and reproduce. It means the
correct causal attribution is "the harness's synthetic keyboard-replay timing
is sensitive to any main-thread work during boot, including asset loading,
in a way a fixed sim timestep does not fix" rather than "RIG's sprite makes
the simulation less deterministic for a real player." The two real-frame
performance measurements in this gate and the prior one (120–121fps,
worst-frame ~10.3ms, `over20ms: 0`, both trees, both with vsync on and off)
never showed a dropped or stalled frame — nothing here is a frame a player's
eye or input would ever see landing late. Per the integrator's ruling
(`SPRINT.md`, "T-040 UNBLOCKED — I-039 RECLASSIFIED"), I-039 is demoted
S2→S3 as a harness-determinism finding and no longer blocks this gate; a
new, harness-scoped finding (`?fixeddt` making the control scatter) is
filed separately and does not implicate this task's code.

I did not re-run the full 16-round interleaved regate myself — `72fb43c`'s
measurement and T-049's 132 runs are consistent, already-committed, and nothing
about the code changed to justify redoing that specific measurement. What I
did redo below is everything cheap enough to re-verify on this exact commit
in one session, from scratch, rather than inherit.

## 1. Fresh verification this session, all on HEAD `1bdc750`

Server: `node tools/serve.mjs 8770 --root .claude/worktrees/T-040 --quiet`
(ephemeral port; killed at the end of this gate; 8741/8742 untouched).

**Worktree hygiene note, not a code finding:** this worktree directory had an
**uncommitted** modification to `src/render/preload.js` sitting in the working
tree when I started (not part of `1bdc750`, and not matching any commit on
`task/T-040` — `git show 1bdc750:src/render/preload.js` lacks the
`warmResident`/`WARM_ON` code the working copy had). It matches the "GPU
warm-up" experiment SPRINT.md describes as already measured and shipped
through **T-049's** worktree instead (this worktree also carries stray
stashes from five *other* unrelated tasks — T-038/T-042/T-047/T-048/T-050 —
so it has clearly been reused across lanes without being reset between them).
I stashed it (`git stash push -- src/render/preload.js`, still recoverable,
not discarded) so every result below is against the actual committed
`1bdc750` tree, not an untested local experiment. `git status --short` now
shows only the pre-existing untracked `review.md`.

- `node tools/pathcheck.mjs`: **2515 passed, 0 failed** — matches `72fb43c`'s
  figure exactly.
- `scripts/mid-route.json --deterministic --base-url :8770`: `outcome:
  completed`, `deaths: 0`.
- `scripts/transform-slice.json --deterministic --base-url :8770`: `outcome:
  completed`, `deaths: 0`.
- **Asset-missing fallback**, redone fresh (not inherited): renamed
  `assets/generated/sprites/rig-marine.png` aside, reloaded `?testapi=1`.
  Game reached `PLAYING`, `pageErrors: []`, console carried the exact
  expected `[warning] RIG sprite did not load (error); showing the
  procedural fallback instead.` plus one `404`. Restored the file;
  `git status --short` clean afterward.
- **Sim purity**, redone fresh and widened: `grep -rln
  "sprite|fallbackMesh|spriteMesh|TextureLoader|preload" src/sim/*.js` →
  **zero matches** (checked every file in `src/sim/`, not just
  `player.js`) — the sim does not branch on asset-load state.
- **Preload path structure**, verified by direct read of
  `src/render/player.js`: registers via `preloadTexture(...)`, awaits the
  shared gate with a single top-level `await awaitPreloads()` (line 213),
  no `Promise.race`/`setTimeout` anywhere in the file — the *original*
  defect this task's first gate caught (a bespoke, unawaited fetch racing
  the frame loop) is structurally absent, confirming both prior gates'
  claim rather than inheriting it.
- **Perf, 256 live projectiles** (`tools/playtest/juice-stress.mjs`,
  `window.HB.perf()`'s 180-frame wall-clock ring): `fps 120.2, avgMs 8.32,
  worstMs 10.3, over20ms 0` — consistent with `72fb43c`'s vsync-forced-off
  reading (531.6fps T-040 vs 529.3fps merge-base, draw calls *lower* on
  T-040, 141.0 mean vs 145.4) and with my own original gate's reading
  (121.1fps vs base's 120.3fps). Three independent measurements across two
  gates now agree: no perf regression, 60fps holds comfortably above the
  200-projectile bar on both trees.

## 2. Readability / glance test — not redone from scratch, evidence already on file

`72fb43c`'s gate already ran the sharper version of this check (12 frames at
300ms spacing through a continuous firefight, `t=20.0–23.3s`, plus two full
7/5-hostile combat frames) on this exact commit — evidence at
`reports/tasks/T-040/playtest-evidence/qa2-*.png` in this main checkout. I
reviewed that evidence rather than recapturing it, since the code hasn't
moved: RIG reads clearly at true FAR size against a lighter wall panel with
no shot mid-flight (`qa2-t20.9s-rig-clear-4x.png`); the muzzle-flash/tracer
bloom recurs on the rifle's own 130ms fire-rate cadence and visually
dominates his position for those frames (`qa2-t20.6s-muzzle-flash-obscures-
4x.png`); and a second, independent low-contrast case exists against a
darker panel edge where his own dark outline blends toward the background
(`qa2-t21.2s-rig-lowcontrast-dark-panel-4x.png`). None of this changes: it
is a feel/readability item, correctly not treated as a bug by that gate, and
I agree with that call rather than re-litigating it.

## 3. On-by-default + escape hatch

Unchanged from both prior gates: a plain `?testapi=1` session (no `rig=`
flag) renders the sprite by default; `?rig=canvas` renders the v2 procedural
fallback on demand. Confirmed again in passing during the asset-missing
fallback check above (the fallback screenshot from that check is visually
the same figure as the documented `?rig=canvas` capture).

## Reproduce this gate

```sh
node tools/serve.mjs 8770 --root .claude/worktrees/T-040 --quiet &   # kill when done

cd .claude/worktrees/T-040
git stash list   # confirm the preload.js experiment is still parked, not merged in
node tools/pathcheck.mjs                                              # 2515/0

cd tools/playtest
node run.mjs scripts/mid-route.json --deterministic --base-url http://127.0.0.1:8770
node run.mjs scripts/transform-slice.json --deterministic --base-url http://127.0.0.1:8770
node juice-stress.mjs /tmp/t040-stress                                # 256 projectiles

# asset-missing fallback:
mv ../../assets/generated/sprites/rig-marine.png ../../assets/generated/sprites/rig-marine.png.bak
# reload ?testapi=1, confirm PLAYING + one console.warn + zero pageErrors, then restore.

# I-039 re-derivation (not re-run, verified from committed data):
# see .claude/worktrees/T-049/reports/tasks/T-049/i039-evidence/*.csv
```

## PROPOSED INBOX ISSUES

Not self-numbered per the lane brief — proposing for integrator triage.

## I-??? | docs | S3 | repro: `git -C .claude/worktrees/T-040 stash list` | evidence: this report §1
`.claude/worktrees/T-040` carries an uncommitted, untested modification to
`src/render/preload.js` (a GPU-warm-up experiment matching the one T-049
measured and shipped separately) plus five unrelated stray stashes from
other tasks (T-038, T-042, T-047, T-048, T-050) — this worktree directory has
clearly been reused across lanes without being reset between them. I
stashed the preload.js change to gate the real committed tree rather than
delete it (`git stash push -- src/render/preload.js`, still recoverable via
`git stash list`/`git stash show -p`). Not a code defect — a worktree-hygiene
gap worth a cleanup pass before this path is reused again, since a future
agent could easily mistake the stray diff for part of the branch under test
(I nearly did).

## Open feel questions for the operator (not judged here)

Carried forward unchanged from the `72fb43c` gate — machine gates don't
judge fun/look:

1. Does the real sprite read as "a much higher quality asset in line with
   the concept art" (the operator's own bar), or still short of it?
2. Is the muzzle-flash/tracer occlusion during sustained fire and the
   dark-panel low-contrast case (§2) acceptable, or does either need a fix
   (a material tint/darken pass is the fast lever `build.md` names, with no
   new asset needed)?
3. Body-only sprite (no baked-in gun) means the weapon always reads as a
   separate object riding alongside RIG — acceptable, or does it need to be
   part of the sprite itself?

Exact URL: `index.html` (shipped default, no query flags), FAR camera.
