PASS

Playtest gate for T-008 (G2 neck access-plate flip gate) — re-gate after commit
`66b13d0` "G2 pressure script: knockback recovery + pocket-scoped pinned (no fixture
change)".

Worktree under test: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-008`
@ `66b13d0` (clean tree; merge-base `f759439`, main merged in at `6a88dd8`).
Pinned for the whole gate with `python3 -m http.server 8801` running with cwd =
that worktree (verified pinned: the served `src/mode.js` carries `IS_G2`, which
main @ `04b6a65` does not; server killed at the end of the gate).
Harness: the MAIN checkout's `tools/playtest`, every run `--deterministic
--base-url http://127.0.0.1:8801`.

## Run commands (all exited 0; every run `outcome.result == "completed"` except the
## deliberate pre-fix control, see §3)

```sh
# from /Users/scottmeyer/projects/hullbreaker/tools/playtest
node run.mjs scripts/mid-route.json        --deterministic --max-runtime-ms 15000 --base-url http://127.0.0.1:8801 --out runs/gate-T-008-mid
node run.mjs scripts/transform-slice.json  --deterministic --max-runtime-ms 20000 --base-url http://127.0.0.1:8801 --out runs/gate-T-008-transform

# the two task scripts, 3x each (scripts read from the worktree — they do not exist in main yet)
S=/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-008/tools/playtest/scripts
for i in 1 2 3; do node run.mjs $S/g2-neck-flip.json          --deterministic --max-runtime-ms 18000 --base-url http://127.0.0.1:8801 --out runs/gate-T-008-g2flip-$i;  done
for i in 1 2 3; do node run.mjs $S/g2-neck-flip-pressure.json --deterministic --max-runtime-ms 22000 --base-url http://127.0.0.1:8801 --out runs/gate-T-008-g2press-$i; done

# per-beat capture, regenerated fresh from the pinned worktree (not the committed PNGs)
cd /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-008/tools/playtest && node g2-capture.mjs shots

# for the record (reviewer's gate, re-run here): 881 passed, 0 failed, exit 0
cd /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-008 && node tools/pathcheck.mjs
```

No retry was needed anywhere: `meta.bootError` is `null` in all 14 runs.

## 1. Required smoke set — green

| run | result | attempts/falls | idle frac | minEdgeMargin | protoScore | maxX |
| --- | --- | --- | --- | --- | --- | --- |
| `gate-T-008-mid` | completed | 1 / 0 | 0.022 | 35.46 | 93.3 | 72.02 |
| `gate-T-008-transform` | completed | 1 / 0 | 0.000 | 30.06 | 318.8 | 146.01 |

Both `testapi` fidelity, 0 console errors, 0 page errors, no missing policy fields.
`minEdgeMargin` 35.46 matches the README's deterministic mid-route baseline (35.44)
to within the documented polling granularity. `transform-slice` walks
`idle → armed → turning → complete` and clears with `BREACH CLEAR`, i.e. the shipped
v1 fixture is untouched with `?g2=1` absent — the off-by-default claim holds at
runtime, not just statically.

## 2. The two G2 scripts, 3x each — 6/6 completed

| run | result | attempts/falls | hits (no death) | idle | minEdge | proto | maxX |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `g2flip-1` | completed | 1 / 0 | 0 | 0 | 30.15 | 37.9 | 200.04 |
| `g2flip-2` | completed | 1 / 0 | 0 | 0 | 30.15 | 37.8 | 200.04 |
| `g2flip-3` | completed | 1 / 0 | 0 | 0 | 30.16 | 38.7 | 200.04 |
| `g2press-1` | completed | 1 / 0 | 2 | 0 | 30.17 | 49.7 | 200.00 |
| `g2press-2` | completed | 1 / 0 | 2 | 0 | 30.18 | 49.7 | 200.04 |
| `g2press-3` | completed | 1 / 0 | 2 | 0 | 30.16 | 49.6 | 200.04 |

All six reach `state==='VICTORY'` (7 victory samples each) and every one walks the
ritual `idle → armed → turning → complete`. Reproducibility on this tree is high:
identical `maxX` to 0.04 tiles, `protoScore` spread 0.9 across the three enemies-off
runs and 0.1 across the three pressure runs.

The three pressure runs are near-identical in *damage* too: hp 3→2 at x = 112.08 /
112.07 / 112.07 and hp 2→1 at x = 129.65 in all three (within 13 ms of each other).
That is evidence for the packet, not a gate failure — the crossing completes with a
life in hand every time — but the pressure toll is deterministic enough to quote to
the operator (see §5).

## 3. Independent check of the builder's "script drift, not fixture defect" claim — confirmed

I did not take the diagnosis on the builder's word or the reviewer's static reading.
Three configurations were run against the **same pinned tree**, so the fixture is a
constant and the script is the only variable. Diagnostic scripts are preserved at
`/Users/scottmeyer/projects/hullbreaker/tools/playtest/runs/gate-T-008-scripts/`.

| config | script delta vs committed fix | outcome (3 runs) |
| --- | --- | --- |
| committed fix (§2) | — | completed, completed, completed |
| pre-fix control (`git show 44a55c0:…g2-neck-flip-pressure.json`) | unscoped `pinned`, no knockback rule | completed, **died**, **died** |
| diag A | fix minus the knockback rule (`!grounded && vx<-1` removed) | completed, completed, completed |
| diag B | fix with `pinned` un-scoped again, knockback rule kept | **died**, completed, **died** |

Readings:

- **The cascade reproduces on this tree with the old script**, so it was never a
  property of the merged fixture: `gate-T-008-g2press-PREFIX-2` = 7 attempts / 6
  deaths, five of them at x = 101.65, y ≈ −7 (the 100–102 pit), spaced 2049 ms apart
  — the identical-fall loop the builder described.
- **Scoping `pinned` is the fix; the knockback rule is not load-bearing.** Diag A
  (scoping only) completes 3/3; diag B (knockback only) still cascades 2/3. So the
  new reflex cannot be masking a fixture defect — remove it and the gate is still
  crossable, which is the clean answer to "did the builder tune the script until it
  passed?".
- **Frame-level proof of the trap**, from `gate-T-008-diagB-3/report.json`'s trace and
  policy log: respawn at `tMs 7699`, x = 93.50, `grounded`, vx = 0 → the unscoped
  `pinned` rule fires a jump on that same tick (policy log rule 7 @ 7699); RIG then
  crosses x 97.22 → 98.71 **airborne**, so the gap-1 rule `grounded && x>97.2 &&
  x<99.4` never fires; it lands at x = 99.42 already past the window, runs off the lip
  and dies at x = 101.65 at `tMs 9745`. That is exactly the mechanism claimed, observed
  rather than argued.

**Do the deaths cluster (fairness smell) or scatter?** Both, and the distinction is
the point:

- In the *broken* configurations they cluster hard at two x values — 101.65 (the
  mandatory 100–102 teach gap) and 129.65 (the hound's landing lip at the dare-pocket
  rejoin). The 101.65 cluster is fully explained by the script trap above: it is the
  same failed frame replayed, not the fixture being unfair once and then again.
- In the *correctly scoped* configuration deaths stop clustering and mostly stop
  happening: diag A took 1, 2 and 0 deaths across three runs, at x = 131.61 / 101.65 +
  131.71 / — , and every run still finished. The committed script took none.
- What *is* deterministic in every configuration is the **hit** at x ≈ 102–112 on the
  first mandatory gap (the x106 lane-4.2 wasp's dive envelope). That first hit is the
  event that starts the fall in every control run. It is not a machine failure — the
  game's own answer (held air jump under 1200 ms of iframes) works, and the run
  completes — but whether the *teach* gap should be the contested one is a feel call,
  routed to §5 and filed as a coverage gap (I-012), not a FAIL.

## 4. Screenshots — judged, not just collected

Per-beat capture regenerated from the pinned worktree:
`/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-008/tools/playtest/runs/g2-neck-flip/`
(10/10 frames, `index.json` `errors: []`), compared against the committed pack
`artifacts/g2-neck-flip/`.

- **Beat reproduction.** Fresh capture hits the same ten beats with the same ritual
  states and the same `playerX` at the ritual frames (154.95/156.36/158.24/159.15/
  159.15 vs the committed 155.10/156.35/158.23/159.15/159.15), `gameMs` within ~300 ms.
  Pixel diff fresh-vs-committed: frame `07` differs only in a 12×9 px HUD hp-pip
  region (0.002% of pixels), frame `09` only in HUD + the overlay's 12.5s/12.6s timer
  (0.008%). Frame `08` differs 2.1% but the diff image is pure edge outline — a
  sub-pixel camera offset shading every silhouette edge, with no geometry present in
  one capture and absent in the other.
- **Static-anatomy rule (decisions.md entry 3) — holds as far as frames can show.**
  Across `02 armed-ajar → 03 windup → 04 snap-1 → 05 relock+rake → 06 snap-2 →
  07 interior`, the only element that changes pose is the access plate (ajar → swung →
  relocked flush → raked to the interior grade, its amber detent bands tracking it).
  The neck interior is *already there before the commit*: catwalks, stanchions and the
  descending stair are visible through the opening in frame `04`, at the same world
  positions they occupy in `07`/`08`. Nothing grows, zips or assembles; what changes
  between beats is the camera pivot and RIG. Honesty bound: this is ten polled beats
  plus a static reading, not a frame-by-frame proof that nothing else moved — the
  reviewer's static check (ribs baked once in `buildRibs`, plate rake as render
  dressing over static `gate.carry` collision) is the other half of that claim.
- **FAR readability.** Default view (the shipped far framing). RIG measures ~29 px of
  800 = **~3.6% of screen height** in frame `01` — inside the 3–5% invariant — and the
  silhouette survives at native scale: head, torso, legs, rifle and the muzzle round
  are all distinguishable (zoom: `zoom-01-routes-converge.png` crop of that frame).
  Hull surfaces read as one connected scute stair climbing to the gate housing, which
  matches the board 13/14 language; the amber hazard bands on the plate are the only
  saturated accent on screen, so "the thing that moves" is legible before it moves.
  Palette is still grey-box on this branch (T-010 has not merged here) — judged against
  form, not colour.
- **Two readability notes, neither T-008's doing, both filed:** in frame `03` and my
  fresh frame `00`, RIG is invisible because the iframe blink (`src/render/player.js:55`)
  happened to be off on that polled frame, and a wasp taking a bullet renders as a
  featureless white quad (`src/render/hostiles.js:197`, `glow = 0xffffff`) — in the
  fresh `00` those two coincide and the frame contains a white square and no player.
  Filed as I-010. The HUD's hardcoded two-turn copy ("0/2 TURNS", "1 of 2
  transformations") is visible in every G2 frame — filed as I-009.

## 5. For the operator (feel — never gated here)

The packet already queued with the task stands. Three additions this gate measured:

1. Every clean pressure run finishes the gate at **hp 1 of 3**, with the two hits
   landing at x ≈ 112 (scapular plate) and x ≈ 129.65 (dare-pocket rejoin lip) in all
   three runs. Is two-thirds of the health bar the intended toll for a P2 teach gate?
2. The wasp authored at x106 contests the **first mandatory** gap (100–102) — its dive
   reaches back across the crossing arc, and in the control runs that hit is what
   starts every fall. DESIGN gives the wasp exactly this job; the question is whether
   the *teach* gap should be the one it contests.
3. Where deaths land once the script is correct is the dare-pocket rejoin
   (x ≈ 129.65–131.7), not the gaps. Intended cost of taking the pocket?

## 6. Honesty / limits of this verdict

Bots are evidence about crossability, pacing and regressions — not a fun verdict; the
operator is the only fun oracle, and nothing here says this gate is good. Policy
scripts are a reflex layer, so "the bot completes it" means a hold-right policy with
seven position/state rules completes it, not that a human will. Sampling is polled at
75 ms, so single-frame extrema can be missed. Route/`protoScore` figures come from the
harness's proxies and (per README limitation #3) are computed against the *main*
checkout's `TRAVERSAL_FIXTURE` — irrelevant for the transform-slice runs that carry
this verdict, but it is why `route.routeIds` is empty in them. The per-beat capture ran
from the worktree's own copy of `g2-capture.mjs` (that tool does not exist in main) and
serves the same pinned tree, so it is pinned in the same sense.

Evidence:
- `/Users/scottmeyer/projects/hullbreaker/tools/playtest/runs/gate-T-008-mid/`
- `/Users/scottmeyer/projects/hullbreaker/tools/playtest/runs/gate-T-008-transform/`
- `/Users/scottmeyer/projects/hullbreaker/tools/playtest/runs/gate-T-008-g2flip-{1,2,3}/`
- `/Users/scottmeyer/projects/hullbreaker/tools/playtest/runs/gate-T-008-g2press-{1,2,3}/`
- `/Users/scottmeyer/projects/hullbreaker/tools/playtest/runs/gate-T-008-g2press-PREFIX-{1,2,3}/` (pre-fix control)
- `/Users/scottmeyer/projects/hullbreaker/tools/playtest/runs/gate-T-008-diagA-{1,2,3}/`, `…-diagB-{1,2,3}/` (rule isolation)
- `/Users/scottmeyer/projects/hullbreaker/tools/playtest/runs/gate-T-008-scripts/` (the three diagnostic scripts, verbatim)
- `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-008/tools/playtest/runs/g2-neck-flip/` (fresh per-beat frames + `index.json`)
- `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-008/artifacts/g2-neck-flip/` (committed pack, compared against)

Issues filed this gate: I-009, I-010, I-011, I-012 (all S3, none blocking).
