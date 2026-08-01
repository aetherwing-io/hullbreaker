# T-014 builder evidence — Spore Mortar v1 (`?mortar=1` / `?mortar=2`)

Everything here was produced from `.claude/worktrees/T-014` after
`git merge main` (T-006 ribrun + T-008 G2 in the tree), with the worktree's
own harness copy — the scripts use the `mortarLob`/`mortarFuse`/
`mortarBurst`/`mortarMarked` policy predicates added on this branch, which
main's `lib/policy.mjs` does not have yet. All runs `--deterministic`, zero
console errors and zero page errors in every report.

```
node tools/pathcheck.mjs                                        # 1048 passed, 0 failed
cd tools/playtest
node run.mjs scripts/mortar-zone-deny.json   --deterministic    # completed
node run.mjs scripts/mortar-hound-stack.json --deterministic    # completed
node run.mjs scripts/mid-route.json          --deterministic    # completed (smoke)
node run.mjs scripts/transform-slice.json    --deterministic --max-runtime-ms 20000
node run.mjs scripts/polyp-lane-dodge.json   --deterministic    # completed (prior enemy still fine)
```

## `mortar-zone-deny/` — the solo teach (`?mortar=1`)

The bot answers the denial with movement only. Measured 3/3 before the merge
and again after it: **completed** (TRAVERSAL CLEAR), 0 kills, hp 3/3, and the
emplacement cycles all five states (`aim → lob → fuse → burst → cool`).

The load-bearing beat, from one run's trace: the bot reaches the roof lip at
x≈56.8 while the pod is planted, **stops there for ~830 ms** (the mark is
lit — the policy will not commit into a marked strip), and steps off the lip
into the post-mid landing on the exact frame the mortar enters `cool`,
crossing the marked patch inside the reload window. That is the whole
mechanic in one sequence: the denial changed where and when the bot moved,
and cost it no health.

Arrival timing is not identical run to run (a bot that arrives late in a
cycle barely waits at all), which is honest: the emplacement bombards on its
own rhythm and never tracks the player.

## `mortar-hound-stack/` — the combination (`?mortar=2`)

DESIGN's combine column for this enemy, played literally: the policy takes
the **panicked** answer on purpose — it commits off the lip while the zone is
marked and bails through the catwalk (down+jump) onto the floor the moment it
lands on a marked strip — and the judged hound-2.5 rejoin beat is patrolling
that floor. Measured 3/3: **completed**, hp 3/3, mortar cycling all five
states AND the hound running `prowl → tell → charge → skid`. Both threats
engage on one decision, and the floor bail is answered with the proven
jump-on-tell reflex.

Earlier iteration, kept as a note rather than tuned away: with the hound-tell
jump allowed while airborne, the bot's panic jump carried it up into the
tripod's own contact circle on post-high and cost 1 hp. Gating that reflex on
`grounded` removed it. The interaction is real (the emplacement is a body on
the tier the denial pushes you toward) and is left in the game.

## `far-view/` — legibility at the shipped default view

`?slice=traversal&mortar=2` at 1280×800, default FAR camera (RIG ≈ 3.7% of
screen height, `decisions.md` entry 7), one frame per beat:

- `1-lob.png` — pod mid-flight, clearly separated from its own tube, with the
  marked patch already lit on the post-mid catwalk ahead of RIG.
- `2-fuse.png` — pod planted; the surface pad is the loudest element and the
  warning field above it is drawn in the same warm colour, still dim.
- `3-burst.png` — the detonation: the field goes hot and bright for exactly
  the frames the sim deals damage, and it sits just behind the combat plane
  so a body caught in it keeps its silhouette (this frame has RIG standing in
  it, because the crude capture bot walks straight in).

These are builder evidence for "is it readable at FAR", not a feel verdict —
that is the operator's call (see the T-014 checkpoint packet in `SPRINT.md`).
