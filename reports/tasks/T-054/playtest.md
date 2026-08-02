PASS

# T-054 playtest — hull texture legibility, gated

Worktree `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-054`,
branch `task/T-054`, pinned at `807cad3` (verified clean before and after this
pass — `git status --short` empty both times). Never served directly: a
`git archive HEAD` copy was served from
`/private/tmp/claude-501/.../scratchpad/t054-scratch` on port 8790 (own dev
server, `node tools/serve.mjs 8790 --root <scratch> --quiet`); `verify-served.mjs`
confirmed the served tree matches. 8741/8742 were never touched. Everything
below re-derives the numbers rather than reading `build.md` and repeating them
— every command is given so a reader can re-run it.

Not judged here: whether the texture looks good. Numbers, captures, costs.
The operator is the only oracle for look — see the 5 open questions
`build.md` already routed to the checkpoint queue; I have nothing to add to
that list.

---

## 1. Visibility — measured, and independently re-measured

Re-ran the lane's own rig fresh (not just read its committed numbers):

```
cd tools/playtest && node hulltex-capture.mjs shots --out <scratch>/t054-verify
```

Reproduced (hull band, `mean/sd/fine/struct`):

```
near-open  flat 43.04/6.64/0.426/3.932   textured 42.70/9.16/1.738/6.351
far-depth  flat 43.49/7.16/0.612/2.982   textured 43.11/9.76/1.779/5.579
```

matching `build.md`'s 42.71/…/0.356/2.876 → 42.39/…/1.643/5.686 and
43.43/…/0.645/3.186 → 43.04/…/1.781/5.583 within the noise band the lane
itself documented (bot-timing jitter between two page loads). Confirmed both
captures are at the same scroll position before trusting the ratio (the exact
trap the team lead's brief warned about): console output showed
`textured near-open scroll 18.0` vs `flat near-open scroll 18.1`,
`far-depth 62.3` vs `62.2` — one-tenth of a world unit apart, not a
start-screen-vs-hull mismatch.

**Independent second instrument** (not the lane's `decodePng`/`rectStats`
code path at all): cropped the same frozen hull rectangle
(`x=160,y=635,w=300,h=90`) out of the PNGs with ImageMagick
(`magick f.png -crop 300x90+160+635 -intensity Rec709Luma -colorspace Gray
txt:-`) and computed mean/fine myself in `awk`:

```
near-open   flat mean=43.026 fine=0.4222   textured mean=42.731 fine=1.7553
far-depth   flat mean=43.564 fine=0.6052   textured mean=43.171 fine=1.8053
```

Within 1% of both the lane's rig and my own re-run of it — two independent
decoders, two independent computations, same conclusion: **fine detail rises
4.16x (near-open) / 2.98x (far-depth)** over the flat floor, well past the
1.2x target `build.md` set. Also independently re-measured the **pre-fix**
"before" evidence already committed in the tree the same way: mean 43.03 →
39.89 (**-7.3%**, the original darkening) and fine 0.412 → 0.684 (barely
distinguishable) — confirms the original operator-visible defect was real, not
a rectangle-choice artifact, and that this branch actually fixes the thing
that was found broken.

**Deck/sky controls, independently checked:** deck band mean 86.810 (flat) vs
86.826 (textured) — unchanged, as claimed. (`sky` is explicitly not a clean
control at far-depth per `build.md`'s own honesty note — the backdrop limb
wears the same buckets — and I did not treat it as one.)

**Darkening not reintroduced:** -0.7%/-0.9% deltas both reproduce, inside the
~10% fence.

## 2. Readability with everything live, watched moving

Recorded two full `--video` runs of `six-face-full-run` (backdrop + hull
texture + RIG + hostiles, all on) against the pinned server, default and
`?tex=flat`:

```
node run.mjs scripts/six-face-full-run.json --deterministic --video \
  --max-runtime-ms 45000 --base-url http://127.0.0.1:8790 --out <scratch>/video-default
node run.mjs scripts/six-face-full-run.json --deterministic --video \
  --max-runtime-ms 45000 --url "http://127.0.0.1:8790/index.html?tex=flat" --out <scratch>/video-flat
```

Both: `pageErrors []`, `bootError null`. Extracted frames with `ffmpeg` and
looked at them (not judged for taste, judged for legibility):

- **True-size stills at matched moments** (both runs happened to read `17m ·
  1 kill` at the same tick): standable deck (checker) reads identically in
  both; RIG's sprite is visible and distinguishable from the background wall
  in both the flat teal-grey wall and the new textured brown panel below it;
  hazard light-diamonds and the `S` wager marker are legible in both.
- **Panel joints are visible in a live, moving capture, not just the
  hand-picked still**: an 8fps burst over a 3s scrolling window, cropped to
  the hull band and stitched frame-by-frame, shows evenly-spaced vertical
  seams (~35 CSS px apart, matching the manifest's authored spacing) sliding
  smoothly left with the scroll — no popping, no sudden contrast jump between
  adjacent sampled frames.
- **Aliasing/shimmer check on the far bucket specifically** (the risk the
  brief called out — density changed, a still frame can't show flicker): same
  8fps-burst technique on the distant backdrop-limb region (scroll ~43-55, the
  range that burst window landed on). No flicker or moiré pop appeared across
  the sampled frames; the distant tier's texture is faint (it is smaller and
  further back) but stable frame to frame at this sampling rate.
  **Honesty limitation, stated plainly**: 8 extracted frames/s is a coarse
  proxy for a ~60fps render — a shimmer faster than ~125ms cannot be ruled
  out by this method. This is evidence, not a guarantee; if the operator sees
  crawling on receding facets at full frame rate, believe the operator over
  this check.
- The horizontal-only detail asymmetry `build.md` already flagged
  (`I-???`, panel lines read on vertical scans, barely on horizontal ones) is
  independently visible in these same frames: the vertical seams in the burst
  crops are strong and consistent; no comparable horizontal line is visible
  anywhere in the same frames. I have nothing to add to that filed issue
  beyond corroborating it from a second, live-capture source.

## 3. Durability — six faces, as far as any bot in this repo reaches

Ran `six-face-spaced-run` (the best-measured full-run reflex policy) 3x,
`--deterministic --stop-on-game-over --max-runtime-ms 90000`, against the
pinned server:

```
node run.mjs scripts/six-face-spaced-run.json --deterministic --stop-on-game-over \
  --max-runtime-ms 90000 --base-url http://127.0.0.1:8790 --out <scratch>/durability/default-N
```

3/3: `outcome died` (clean `GAME_OVER`, not a hang), `pageErrors []`,
`teardownErrors []`, `bootError null`. Reached scroll 140 / 205 / 205 — as far
as wave gate 3/6 in two of three runs. Final screenshot of one run: the
"SIGNAL LOST" game-over panel renders fully and legibly, HUD and stats intact,
hull texture and backdrop still correctly composited behind it — no blank
page, no missing UI.

**Honest limitation, not a T-054 defect**: no policy in this repo's history
has ever driven a bot end-to-end across all six faces (`docs/playtests/2026-08-victory-box.md`'s
finding — the ceiling is combat exchange-rate, not geometry). "Play all six
faces" via an autonomous bot is not currently achievable; durability is
verified across the reachable envelope (facet 0 through the corner-0→1 turn
and into wave gate 3), 3/3 clean, with the two live `--video` runs above
additionally confirming the camera never lost RIG and nothing blanked across
~45s of continuous real playback each.

One thing observed, explained, not filed as a new issue: the default and
`?tex=flat` `six-face-full-run` videos diverged in outcome (lives 1 vs 3,
kills 5 vs 6 at the same 75m mark) despite `?tex=flat` being a render-only
flag. This matches the README's own documented, pre-existing finding
("Deterministic mode fixes one jitter source, not all of them" — two
identically-scripted deterministic runs can still fork via frame-boundary
input-delivery timing) rather than a texture-driven gameplay branch; my own
degrade-mode probe below measured the sim's actual position trajectory under
broken textures and found it diverges from a clean baseline by no more than
0.1-0.19 world tiles over 3s of real, non-`--deterministic` play — consistent
with ordinary jitter, not a structural fork.

## 4. Entry 16's binding condition — the lane's test, plus three the lane didn't run

Reproduced the lane's own `fallback` mode (abort every tile at the network
layer):

```
node hulltex-capture.mjs fallback
→ state PLAYING, frames 2596, textured buckets [], every file false,
  0 materials brightened without a map (max color.r on a map-less material: 1),
  0 page errors, PASS
```

That tests one failure shape (abort everything, all four tiles at once). Per
the brief's ask, I built an independent probe
(`<scratch>/degrade-modes.mjs`, imports the worktree's own `playwright-core`
by absolute path, touches nothing in the worktree) covering the three DIFFERENT
shapes named in the task: **404** one tile, **delay** one tile past the
2500ms `PRELOAD_BUDGET_MS` boot budget, and **malform** a third (200 OK,
6 garbage bytes, `image/png` content-type). Each against a fresh page load on
the pinned server, `?testapi=1`:

```
404 hull-panel-tile.png            → state PLAYING, 0 pageErrors, buckets ["wall","scute","shadow"]
                                      (only "hull" — the bucket that file feeds — dropped)
delay vent-louver-plate.png 4000ms → state PLAYING, 0 pageErrors, buckets ["hull","wall","shadow"]
                                      (only "scute" dropped — proves the timeout path fires, not
                                       just "arrived slow but still counted")
malform weld-seam-strip.png        → state PLAYING, 0 pageErrors, buckets ["hull","wall","scute"]
                                      (only "shadow" dropped)
```

Each failure degrades exactly and only its own bucket, everything else stays
lit — a more precise result than the lane's own all-or-nothing test could
show. **Gameplay does not change**: held right + one jump for 3s under each
broken condition, compared RIG's x/y/grounded trace against a clean baseline
page load. Max deviation across all three: `maxDx=0.099` tiles, `maxDy=0.192`
tiles over 24 samples — small, and of a piece with ordinary wall-clock jitter
between separate page loads (this probe was NOT `--deterministic`-gated; a
tighter bound would need that), not the shape a real sim-side branch on
texture-load-state would produce. Combined with the source comment's own
claim ("nothing here is reachable from `src/sim/`") and the identical
divergence magnitude across three unrelated failure modes, this is a clean
pass on the binding condition, verified beyond what the lane's own rig alone
would show.

## 5. Perf (entry 18) — reproduced independently

```
node hulltex-stress.mjs <scratch>/stress-run
```

```
flat      worstMs [10.30, 10.30, 10.30]  over20ms [0,0,0]  drawCalls [186,186,186]
textured  worstMs [10.40, 10.30, 10.40]  over20ms [0,0,0]  drawCalls [186,186,186]
fps 119.9-120.1 both sides, avgMs 8.33-8.34 both sides, 256 live projectiles both sides (>200 bar met)
```

Matches `build.md`'s reading. **Texture memory moved in the direction that
matters**: independently read off my own degrade-probe's `__HB_HULL_TEX()`
snapshot (`tone.canvasPx`) rather than trusting the build report's own claim —
hull/wall composited canvas 216px (was 384px pre-T-054), scute 104px (was
256px), shadow unchanged 128px. Smaller, not larger, despite the density fix —
GPU texture memory footprint decreased.

## 6. Smoke + gate

```
node tools/pathcheck.mjs                                            → 3195 passed, 0 failed (matches build.md)
index.html?selftest=1              (default)                        → SELFTEST PASS (39 checks), 0 pageErrors
index.html?selftest=1&tex=flat                                      → SELFTEST PASS (39 checks), 0 pageErrors
run.mjs scripts/mid-route.json --deterministic       x3             → completed, 0 deaths, 0 pageErrors/consoleErrors each
run.mjs scripts/transform-slice.json --deterministic x3             → completed, 0 deaths, 0 pageErrors/consoleErrors each
```

3/3 on both smoke scripts (I-040's bar for calling a run's completion
consistent, satisfied in the affirmative direction — no non-completing runs
sampled at all, so there is nothing here to call a regression).

`git status --short` in the worktree: clean before this pass and clean now,
apart from this file.

---

## What I judged, and the verdict

Visibility is real and reproduces under two independent measurement
pipelines; the darkening fence holds; deck/sky controls are unaffected;
readability holds up in live, moving capture with no observed shimmer at the
sampling rate available to this harness; durability is clean across every run
sampled, including two full-length video runs and three repeated
stop-on-game-over runs, within the pre-existing (not-T-054) bot-vs-combat
ceiling; entry 16's degrade contract holds under three distinct failure
modes, not just the lane's own all-or-nothing test, and gameplay is
unaffected under all three; perf is unchanged and texture memory shrank.
No P1/P2 defect found. **PASS.**

## PROPOSED INBOX ISSUES

None new. I independently corroborate the two issues `build.md` already
proposed (`I-???` horizontal-only detail asymmetry, `I-???` per-bucket
co-tenant UV scale) from a second evidence source (the live `--video` burst
crops, `<scratch>/t054-verify/burst-crops/`, `burst-strip-1.png`,
`burst-strip-2.png`) but have nothing to add beyond that corroboration —
filing a duplicate would just be re-measuring the same thing already in the
queue.

## Evidence paths

Session-scratch (not committed — regenerate with the commands above if
needed past this session):
`/private/tmp/claude-501/-Users-scottmeyer-projects-hullbreaker/c3d9d3c6-20d5-4194-9407-9c10d4ab6a1e/scratchpad/t054-verify/`
— `near-open-*.png`/`far-depth-*.png` (fresh shots+crops), `*-hull-gray.txt`
(ImageMagick dumps), `video-default/`, `video-flat/` (webm + report.json),
`frames-default/`, `frames-flat/` (1fps extracts), `burst-crops/`,
`burst-sky-crops/`, `burst-strip-*.png`, `burst-sky-strip.png` (shimmer
check), `durability/default-{1,2,3}/`, `degrade-modes.mjs` (the three-failure-
mode probe, source included below for reproducibility since it isn't
committed anywhere), `stress-run/result.json`, `smoke/`.

Lane's own committed evidence (verified against, not just read):
`reports/tasks/T-054/evidence/{before,after,after-dpr2,ab-decomposition,stress}/`.

<details>
<summary><code>degrade-modes.mjs</code> (the three-failure-mode entry-16 probe, for reproducibility)</summary>

See `<scratch>/degrade-modes.mjs`. Imports the worktree's own
`node_modules/playwright-core/index.mjs` by absolute path so it never touches
or depends on anything written into the worktree; routes three separate
`page.route()` interceptions (404 / 4000ms delay / malformed 200) at one
texture file each, and diffs a 24-sample hold-right+jump trajectory against a
clean baseline load. Available on request if a re-run needs the exact source
rather than the description above.
</details>
