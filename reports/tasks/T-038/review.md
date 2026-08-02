APPROVE

Re-review of the fix cycle (HEAD 80edab5, on top of 0d3caab). All three prior
blockers verified fixed by direct measurement, not by re-reading the report's
claims. Findings below are residual/minor, none blocking.

- reports/tasks/T-038/build.md:322 — the pathcheck reconciliation isn't fully
  spelled out anywhere in the report: the worktree's 1847 = 1812 (main as of
  merge-base db99a34, i.e. pre-T-041) + 30 (this lane's own
  tools/pathcheck/t-038-seam-pips.mjs, confirmed by running it standalone
  and in-sequence) + ~5 incidental growth in a PRE-EXISTING domain
  (tools/pathcheck/t-003-far-view-legibility-compensation.mjs:60,
  `for (const share of Object.values(SHARE))`, now iterating 4 keys instead
  of 3 because this lane added `SHARE.pip` — confirmed +4 of the 5 exactly
  this way). Benign and expected, not a drop, but worth naming so the next
  agent doesn't have to re-derive it. tools/pathcheck/manifest.mjs lists
  all 40 domain files with none missing and none orphaned (confirmed by
  diffing the manifest against `ls tools/pathcheck/*.mjs`, and independently
  by pathcheck.mjs's own built-in unlisted-module guard passing silently).
- src/render/seams.js — the depth-recession mechanism the fix cycle added is
  actually two mechanisms, and only one is `depthGain`: the packet's own
  risk ("distant pips must be pre-attenuated by depth at bake time") is
  actually answered by `fog: true` on both materials (verified live: a pip
  at fog-far distance renders fully invisible, blended into background,
  with the halo ON; a pip inside the fog-near boundary renders as a sharp
  bright diamond — see method below). `depthGain` is a separate, smaller
  effect (the two-tier deck-vs-platform "how proud of its surface" scalar,
  confirmed end-to-end: the halo's live instanceColor buffer shows exactly
  a 0.72 ratio between tiers, matching `SEAMS.depthGainMin`). The build
  report's own comments already say this correctly; flagging only because
  the team-lead dispatch's phrasing conflates the two, and a future reader
  skimming just the dispatch could go looking for `depthGain` to explain the
  fog-recession claim and not find it there.
- Not itself a defect, but worth a merge-time heads-up: task/T-038's own
  merge-base with `main` is still db99a34 (T-037's split point, pre-T-041) —
  its own merge commit (307f543) landed ~10 minutes before T-041's conflict
  resolution completed on main (now 7883658, 1834). The integrator will hit
  a manifest.mjs append-conflict at actual merge time, the same shape as the
  one already fixed once on this branch (80edab5) — not a problem with this
  diff, just flagging so it isn't a surprise.

Verification performed directly (not inherited from build.md/README):

1. **Wiring.** `src/main.js:86` has `import './render/seams.js';` right after
   `level.js`. Served the real worktree (port 8930, killed after; 8741-8748
   untouched) and confirmed live via `seamsStats()`: absent/`?seams=1`/junk
   → `{enabled:true, pipCount:307}`; `?seams=0`/`?seams=off` →
   `{enabled:false, pipCount:0}`. Screenshotted the shipped FAR default and
   the pips are visibly present (small warm diamonds along deck lips and
   catwalk slats), not inferred from the import line.
2. **Depth attenuation, measured from captures.** Drove right ~8s, then for
   every one of the 307 pips computed camera-space distance and fog factor
   from the live `scene.camera`/`scene.fog`, picked one at fogFactor=1.0
   (91 tiles out) and one at fogFactor=0 (43 tiles), and sampled the actual
   screenshot at their exact projected screen coordinates with BOTH the
   opaque core and the additive halo visible: the far pip is completely
   invisible (flat ~L18 across a 17x17px neighborhood, indistinguishable
   from background) while the near pip renders as a sharp bright diamond
   (peaks at L255, smooth anti-aliased falloff). Also re-confirmed
   `material.fog` reads `true` at runtime on the correct 307-instance
   meshes (my first pass on this misidentified fx.js's own 224/20-instance
   spark/flash pools, which correctly keep `fog:false` — those are a
   different, short-lived effect, not a regression). No
   additive-blend-brightens-through-fog artifact was observed at the
   fog-far sample, which was my first-order worry about mixing
   `AdditiveBlending` with `fog:true` and a non-black fog color; it doesn't
   manifest here.
3. **Recalibration.** `git show HEAD:artifacts/t038-seams/results.json`
   matches the numbers in `artifacts/t038-seams/README.md` (996→3398 pixels,
   0.097%→0.332%), which the README states plainly were measured against a
   scratch merge of `task/T-038`+`task/T-035` (T-035 not yet merged to
   `main` — confirmed still `doing` in SPRINT.md). Honestly labeled as an
   approximation of the ship world, not the current `main`; the two numbers
   (0.332% recalibrated vs. 0.333% pre-ladder) are close enough that the
   headline "0.0% → nonzero" claim holds either way.
4. **Readability.** Recomputed the palette math pathcheck asserts (both
   tables): CONCEPT seamPip/seamHalo luminance 598/518 stay under
   houndTell/polypTell/mortarTell (623) and muzzle (713) and PAL.player
   (684); CLASSIC 568/460 stay under the tell (623), muzzle (765) and
   player (664). Also visually: in the driven-forward screenshot, the
   magenta capsule and the acid-green hostile triangles read clearly
   forward of the small white pip diamonds — no competition observed.
5. **Draw calls.** Committed `results.json`: 94→96 calls (+2), matching the
   packet's own +1-to-+2 estimate. No per-frame update path exists for this
   pass at all (confirmed by reading both new files in full and by
   pathcheck's static-anatomy guard: no `installView`, no `gameMs`/`tMs`,
   no `requestAnimationFrame` in either file) — the 60fps-at-200-projectiles
   risk is structurally near-zero for a fixed, baked-once InstancedMesh pair
   regardless of live projectile count; not separately stress-tested, but
   the by-construction argument holds up on inspection.
6. **Break/restore, independently reproduced.** Reintroduced `fog: false` on
   the core material in `src/render/seams.js`: pathcheck failed exactly the
   2 new guards, naming them (`neither seams.js material sets fog:false`,
   `both...explicitly set fog:true`), 1845/2 failed. Restored; pathcheck
   back to 1847/0; `git status --short` and `git diff --stat HEAD` both
   empty afterward except the untracked review file this report replaces.
7. **Scope.** `git diff main...HEAD --stat` (three-dot, per the lane brief —
   the two-dot diff against current `main` shows phantom hunks from T-041,
   already merged to `main` but not to this branch: `src/pure/juice.js`,
   `src/render/fx.js`, `src/render/bullets.js`, `src/config.js`,
   `reports/tasks/T-041/build.md`, `SPRINT.md`, `reports/STATUS.md` are all
   phantom here, confirmed by an empty `git diff db99a34 HEAD` on those
   paths) shows the real, authored diff stays inside `src/main.js` (+1),
   `src/pure/seams.js` (new), `src/render/seams.js` (new),
   `src/render/palette.js` (+19), `src/render/legibility.js` (+6/-few),
   `tools/pathcheck/manifest.mjs` (+2), `tools/pathcheck/t-038-seam-pips.mjs`
   (new), plus artifacts/reports. No `SPRINT.md`, `CLAUDE.md`, `config.js`,
   `level.js`, or `limb.js` touched — matches the stated fence.
8. Layer purity / determinism: full `node tools/pathcheck.mjs` run
   (1847/0) includes the static `guardLayer` check on `src/pure/` and
   `src/sim/`, which hard-exits on a violation rather than reporting a
   failed assertion — it passed silently. `src/pure/seams.js` itself has
   zero imports and no `Math.random`/`Date.now`/`performance.now`/time
   argument, read in full. `src/render/seams.js` reads `groundH`/`platforms`
   from `src/sim/level.js` read-only (the existing, already-established
   direction render modules read sim state in); no sim→render bridge
   crossing needed here since nothing flows the other way.

Operator questions in the build report (halo-vs-core silhouette read,
density, warm-white vs. muzzle brightness, sequencing against S1) are
feel calls, correctly routed there and not re-litigated here.
