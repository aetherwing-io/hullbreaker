APPROVE

Verification performed independently (not inherited from build.md): re-ran
`node tools/pathcheck.mjs` in this worktree (1871/0) and in a scratch worktree
at `git merge-base main HEAD` = 4f967fb (1834/0, matches claimed base). Broke
two of the new gate's assertions myself and confirmed red, then restored and
confirmed `git status --short` clean and pathcheck back to 1871/0:
  - `resolvePost` junk-path forced to `on:false` → `FAIL T-048: junk in
    ?bloom= resolves to the shipped default…`
  - a hostile named a nonexistent family (`gunmetal`) → `FAIL T-048: …and
    every family a mesh names exists in the table (gunmetal)`
Independently re-ran `tools/playtest/post-capture.mjs --probe` against a
fresh ephemeral-port server and got byte-identical results to the committed
artifact (SELFTEST PASS 39 checks; offline-fallback: status=failed,
state=PLAYING, 180 frames, worstMs=10.3, faults=0, meanL=69.25). Recomputed
the unlocked-stress mean delta from the raw JSON myself: (3.63+3.08+2.40+2.82)/4
− (1.72+1.70+1.63+1.60)/4 = 2.9825 − 1.6625 = +1.32 ms, matching the claim.
Recomputed all five `far-combat`/`traversal-hunt`/`polyp-tell`/`hound-tell`
sky-mean and frame-mean pairs from `post-capture.json` and they match the
build.md table exactly, all `frameExact: true`.

Confirmed via three-dot diff (`git diff main...HEAD`) that the touched files
are exactly: `src/config.js` (new delimited `POST_TUNE` block only),
`src/main.js`, `src/pure/post.js` (new), `src/pure/tonemap.js` (new),
`src/render/post.js` (new), `src/render/materials.js` (new),
`src/render/fx.js`, `src/render/hostiles.js`, the new pathcheck domain +
manifest entry, the playtest harness addition, and artifacts/report. The
larger two-dot `--stat` (palette.js, scene.js, camera.js, level.js, limb.js,
contact.js, etc.) is confirmed phantom — zero three-dot diff on every one of
those paths, consistent with the lane brief's warning; `src/render/scene.js`
and `src/render/camera.js` are untouched by this branch. `tools/playtest/package.json`
has no diff (no new npm dependency); every harness server binds `port: 0`.

Findings, most severe first:

- No blocking findings.

- (Minor, sequencing note for the integrator, not a defect in this diff)
  `reports/tasks/T-048/build.md` §5 documents composition with T-047's tone
  mapping/exposure/colorSpace and shadow rig, but doesn't mention the
  draw-call interaction with T-047's finding that `renderer.info` never
  counts the shadow pass. Today that's moot — this worktree's base has no
  `castShadow`/`shadowMap` code at all (`grep -rn 'shadowMap|castShadow' src/`
  is empty here), so the reported 105→119 draw-call delta is a real, complete
  count for what currently exists. Once T-047's shadow rig and this composer
  land together, draw-call and frame-time numbers should be re-measured with
  both present rather than summing the two lanes' independent deltas —
  worth a line in whichever report merges last, not a fix to this one.

- (Observation, not a finding) `src/render/hostiles.js:275` (`lit()`) and
  `fx.js:255-262` read `postGain()`/pass `gain` correctly outside the
  per-particle-row loop — confirmed `const gain = postGain();` sits once per
  `updateFx()` call, not inside `advance()`'s row loop.

Everything the team-lead asked to prioritize checks out:
1. Frame time under the 256-projectile stress path is measured both
   vsync-locked (over20ms 0/0/0 before and after, worst ~10.3ms both sides)
   and vsync-unlocked (+1.32ms mean cost, ~8% of a 16.7ms budget) — the
   unlocked number is the honest one and it's the one reported as the
   headline cost. Not vsync-masked.
2. Draw-call caveat: build.md §1, honesty note 3 states plainly what the
   105→119 number does and doesn't cover (composer's multi-render-per-frame
   autoReset fix) — see sequencing note above for the one thing it doesn't
   yet need to cover.
3. Readability: threshold is tuned in linear-light units specifically to
   keep bloom off the hull/enemy bodies; §2.5 documents backing off from an
   initial radius/gain that ate the polyp's own silhouette, with no self-
   judgment of "looks good" — feel question routed to the operator (§6).
4. Entry 14 ("too dark"): the atmosphere-compensation fix is the substantive
   engineering finding of this lane, measured before (sky mean −41% in air)
   and after (sky mean 42.90→42.90, deck/sky sampled pixels byte-identical
   on matched frames) the fix, with the residual honestly scoped to the
   fog ramp's midpoint only.
5. Composition with T-047: confirmed no edits to `scene.js`/`camera.js`;
   `OutputPass` reads `renderer.toneMapping`/`outputColorSpace` live each
   frame rather than this module setting either, so ordering is a non-issue
   by construction; the atmosphere compensation is keyed to
   `THREE.ACESFilmicToneMapping` specifically and reports `atmos: 'unmatched'`
   rather than silently mis-applying if that lane's curve changes.
6. No build step, no runtime npm dependency; addons load from
   `three/addons/*` via dynamic import (CDN import map already wired), with
   every failure path falling back to `renderer.render(scene, camera)`
   permanently — verified live via the offline-fallback probe.
7. Ships ON by default (entry 16) with `?bloom=0`/`?bloom=<n>` as escape
   hatch/A-B, matching entry 18's "everything ships ON" condition.
8. New assertions bind — verified above by breaking two of them myself, not
   just re-reading the claim; worktree confirmed clean afterward.

Scope discipline: fenced off `deck`/`plate`/`machine`/`distant` families
(authored, unused, explicitly left to the lanes owning `level.js`/`limb.js`/
`player.js`/`transform.js`) rather than drive-by editing those files — the
report says so plainly rather than quietly under-delivering, and the
`PROPOSED INBOX ISSUES` entries route the two loose threads (unused
families; the sky/fog-tone-map inconsistency the composer surfaces but
doesn't settle) to triage instead of resolving them unilaterally.
