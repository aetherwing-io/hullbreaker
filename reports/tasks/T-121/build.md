# T-121 build report — codebase cleanup (decisions.md entries 24, 25)

Lane T-121, branch `task/T-121`, worktree `/home/user/hullbreaker/.claude/worktrees/T-121`.
Base `e5ce7d4` (main when entry 25 landed; its `src/`, `index.html` and
`assets/` are byte-identical to the dispatch base `bb8e4df` — `git diff
--stat bb8e4df e5ce7d4 -- src index.html assets` is empty). Ports used: 8771
(branch snapshots), 8772 (base tree); both killed at hand-off.

The inventory itself is `docs/proposals/2026-10-cleanup.md`. This report is
what was deleted, how each deletion was proven neutral, what was not deleted
and why, and what is staged for after the in-flight lanes merge.

## Headline

| | base `e5ce7d4` | this branch now | change | + staged hook/zip (trial merge) |
|---|---:|---:|---:|---:|
| tracked files | 1,975 | 1,736 | −239 (244 artifacts and 3 assets out; 8 docs/tools/report files in) | −4 files (3 hook modules, `tools/movement/evidence.mjs`; one pathcheck file renamed) |
| tracked bytes | 439.0 MiB | 398.4 MiB | −40.6 MiB | −59 KiB |
| `src/` lines (`wc -l`) | 57,177 | 57,081 | −96 | −699 more (22 files, +73 / −772) |
| `src/` files | 159 | 159 | 0 | −3 |
| deploy bundle | 393 files, 80.8 MiB | 390 files, 75.3 MiB | −3 files, −5.5 MiB | −3 files |
| `node tools/pathcheck.mjs` (host knobs) | 3985 passed, 0 failed | 3984 passed, 0 failed | −1 (listed) | −72 evaluations (4412 → 4340 on the trial merge, all listed) |
| query flags parsed | 62 | 60 | −2 (`zip`, `g1`) | −2 more (`hook`, `hookinput`) |

Inventory headline (base): the default URL reaches **158 of 159 src modules**
(56,746 of 57,177 lines; the 159th is unwired level-2/3 design data) and
fetches **35 of 322 asset files (13.1 of 174.5 MiB)**. 22 exports are imported
by nothing. 62 query flags: 10 operator-judged escape hatches, 22 integrator
defaults with escape hatches, 11 unjudged experiments, 6 dev-bench, 9
diagnostic, 4 released for deletion by entry 25, none otherwise dead.

## The neutrality protocol (every src batch)

1. **References:** `git grep` over the whole tree for every deleted name or
   path; each batch's commit message quotes the command and result.
2. **Gate:** `. ~/.hullbreaker-host.env && node tools/pathcheck.mjs` — same
   count as the base, or a lower count fully accounted for by the ordered
   label diff (`tools/pathcheck-labels.mjs`), with every removed label listed.
3. **Default six-face sim:** `node tools/simlab/race/lab.mjs check --every 8`
   — 29 committed runs (all four viewports, every policy, the oracle) must
   reproduce their committed fingerprints. At the base: 29/29, digest `8ea94ef8`.
4. **Traversal-slice sim** (batches touching fixture code):
   `node tools/movement/matrix.mjs --grid baseline --against <base src>` — 44
   runs (11 flag-off variants × 4 policies), identical fingerprints.
5. **Deterministic smoke:** `cd tools/playtest && node run.mjs
   scripts/mid-route.json --deterministic --viewport 480x300 --base-url
   http://127.0.0.1:<port>`; the final-sample sim fields + the frame-input
   ledger are hashed (`final x 55.649, y 1, hp 2, kills 0, gameMs 9900.198,
   scrollX 56.204, tick 594`; finalHash `437a69ce6c9040fa`, ledgerHash
   `af91377183458396`). Reproduced twice on the unmodified tree first, so the
   fingerprint is known to be stable.
6. **Default URL in a browser:** `tools/cleanup/boot-probe.mjs` at 1280x720
   and at 844x390 with `hasTouch` — `/index.html` with no query boots, the
   title is left the way a player leaves it (Enter / a tap), PLAYING is
   reached, and page errors and console errors are counted; then
   `?testapi=1&fixeddt=16.667` with an empty frame-input schedule freezes the
   sim at tick 60, and the frozen frame and `HB.snapshot()` are compared with
   the base's (`--compare`). Both captures of the same page are taken 600 ms
   apart to measure render noise (0 % at the base on both viewports). Each
   capture also records which art made the boot gate (`__HB_PRELOAD()`).
   On this loaded host an asset that misses the budget is dropped for the
   session (in one 1280x720 pair, 20 of 33 boot assets missed the 2.5 s
   desktop budget on both sides; at 844x390 all 33 made the 6.5 s touch
   budget), so two boots of the same tree can render different frames. It
   also records what sits in every bridge slot after boot.
   Pixels are judged only between captures that kept the same art and the
   same bloom boot outcome (the bloom pass has its own 1200 ms boot budget
   and fell back to direct rendering on 18 of 22 boots here); pairs are
   booted concurrently and re-run until they match. Sim state and bridge
   wiring are always compared. The wiring check was added after batch 4's first cut
   passed every other check here, including pixel-identical frames, but
   would have changed what a player hears (see batch 4).
7. **Bundle:** `node tools/deploy/build-bundle.mjs --ref HEAD`; its file list
   and per-file hashes are diffed against the base bundle.

The slow browser verifier (`tools/deploy/verify-bundle.mjs`) was not run
(the dispatch allowed it at most once, at the end; see "Verification
commands").

## Batches

### Batch 1 — one-off committed review artifacts (`4172b8e`)

**Removed:** 18 `artifacts/` entries, **244 files, 36,983,185 bytes (35.3 MiB)**:
`cp3-transform-v2`, `g2-neck-flip`, `gilded-off.png`, `gilded-on.png`,
`gilded-smoke.mjs`, `hitflash-v1`, `lightrig`, `post-v1`, `review-legibility`,
`scale-v1`, `shade-v1`, `sprites-v1`, `t-050`, `t011-juice`, `t032-durability`,
`t038-seams`, `t044-corner-reveal`, `wasp-modular-v2`. Recovery index (sizes,
who cited each, which script regenerates it, `git restore --source e5ce7d4`):
`docs/archive/2026-10-artifacts-index.md`. `docs/DESIGN.md` and
`docs/WASP-MODULAR-MOTION.md`, which cited two of them, now point there.
**Kept:** decision evidence (entries 3, 14, 18), the two folders a skill
guardrail names, and `t104-race` (live input to the race lab).
**Proof:** `git grep` for every removed path outside `reports/` and
`docs/archive/` finds only capture-script *output* paths, two src comments and
one assertion label — no reader; pathcheck **3985/0** (= base); the deploy
bundle's inputs are untouched and its contents are byte-identical to the
base bundle (393 files, per-file SHA-256 equal).

### Batch 2 — three orphan assets (`187b200`)

**Removed:** `assets/generated/backdrops/backdrop-meridian-coils-v2.png`
(2,020,572 B), `assets/generated/sprites/sprite-atlas-action-v2.png`
(1,857,388 B), `assets/generated/sprites/sprite-atlas-production-v2.png`
(1,846,455 B) — **5.46 MiB, all three shipped in the bundle**.
**Proof:** `git grep -n -E "backdrop-meridian-coils-v2|sprite-atlas-action-v2|sprite-atlas-production-v2"`
over the whole tree (src, tools, docs, reports, artifacts, assets) → no
match, exit 1; neither default-URL request ledger (desktop, phone) contains
them; pathcheck **3985/0**; bundle 393 → 390 files, **80.8 → 75.3 MiB**,
"only in base" = exactly these three, every other file byte-identical.
(`tools/assets/check.mjs` was attempted and abandoned: see the inbox issue —
it ran 29 min without output on this host.)

### Phase 1 deliverable (`4bf082e`) and the probe tool (`2a3622b`)

`docs/proposals/2026-10-cleanup.md`; `tools/cleanup/{graph,flag-lines,boot-probe}.mjs`
+ README (honesty notes) + `package.json`; `.gitignore` gains
`tools/cleanup/node_modules/`; `docs/ENGINEERING.md` corrected (momentum ON
by default since `979e27b`; the retired `docs/HANDOFF.md` pointer).
Docs + dev tools only; no gate reads these files; pathcheck 3985/0.
`2a3622b` taught `boot-probe.mjs` to compare bridge wiring and to judge
pixels only between captures with matched art and bloom boot outcomes (both
are load-dependent on this host; see the protocol).

### Batch 3 — dead code in unfenced src (`23e362f`)

**Removed (8 files, +5 / −59 lines):** `ecologyHasMechanic`
(`src/pure/enemy-ecology.js`); `RESPONSE_SOCKET_FIELDS` and `pressureLullMs`
(`src/pure/pressure.js`); `DEPTH_COMPOSITION_ON` (`src/render/atmosphere.js`);
`LAMP_OFF_ALPHA`, `LAMP_OFF_SWELL` (`src/render/legibility.js`);
`warmDerivedTextures` (`src/render/preload.js`); the write-only
`recentShotAt` (`src/render/juice.js`) and `live0/1/2` counters
(`src/render/fx.js`); the unused `DECK_PANEL` import (`src/render/materials.js`).
Every name: exported or declared, read by nothing — `git grep -n -w <name>`
over the tree (excluding `reports/` and `artifacts/`) returns only its own
declaration (and, for the write-only locals, its own writes); ESLint
`no-unused-vars` is clean on all eight files afterwards; none is in an
in-flight lane's diff or in any tool's source text.
**Proof:** pathcheck **3985/0** (= base; the ordered label log is identical
to the base's); race lab **29/29** reproduce (`8ea94ef8`); deterministic
smoke **identical** to base (finalHash `437a69ce6c9040fa`, ledgerHash
`af91377183458396`, 0 page / 0 console errors); default URL at 1280x720 and
at 844x390 hasTouch: title → PLAYING, **0 page errors, 0 console errors**,
the same 194 same-origin requests as the base, frozen-tick (tick 60) sim
snapshot **identical** to the base's on both viewports. Pixels: see batch 4
(the art-matched frame comparison covers batches 3 + 4 together).

### Batch 4: the zip corner's render side and its flags (`79dbf7f`)

**What changed.** `src/mode.js` drops `ZIPPER_REVEAL`. `IS_G1` is now
exactly `ACTIVE_FIXTURE === null`, which it already was at every URL
except `?zip=1` / `?g1=0`; both are now ignored. `src/render/level.js`
loses the `zipperColumn` / `faceRevealed` render bodies, the structures
only they read (`tileBaseMats`, `faceRanges`, the column `settled` flag)
and the `_zm` scratch matrix. Those bodies only ever ran in the six-face
run under `?zip=1`, because `activeCorner()` is null in every fixture.
`unbuiltHidden` is unchanged; the traversal fixture does run it. The two
hooks keep do-nothing owners, installed exactly where the old ones were.
Comments in `limb.js` and `contact.js` were updated. `docs/DESIGN.md` and
`docs/ENGINEERING.md` describe the deletion and how to recover it. The SIM
half is untouched, per the integrator's scope split: wavegate
`updateZipper`, the built-column state machine, `pure/waves.js` timing,
and the sim's calls into the two hooks. src: 4 files, +57/−99.

**The catch.** The first cut of this batch (`dcce3cd`) dropped the two
owner installs. Every check above passed on it: pathcheck, race lab,
matrix, smoke, and pixel-identical art-matched frames at 1280x720 and
844x390. It still changed what a player hears. `src/ui/audio.js` wraps
its bridge observers when it is imported, which is before
`initializeViewRegistry()` installs the owners, and `installView`
replaces the slot. So the old `faceRevealed` install was what had kept
audio's corner boom silent, and an empty slot let it through. The
boot-probe wiring capture shows it: at the base, `level.faceRevealed` is
`[juice, fn:faceRevealed]`; on the first cut it was `[juice,
audio-wrapper]`. Putting do-nothing owners back restores the base wiring
in all 38 slots. That same wiring is why most of the game's audio
observers are dead at the base, which is a separate inbox issue below.

**Pathcheck (exception).** In `t-009-static-anatomy-reveal-default.mjs`
I deleted "T-009: the zipper hook is still written and still installed
(retired, not deleted)". Its regex would match again now that the
do-nothing owners are back, but its subject, the choreography being
extractable, was deleted by entry 25. I did not re-add it as a wiring
guard, because that is a source-text pin in T-120's fence; see the issue
below. I rewrote "T-009: ?zip=1 restores the brick-slam reveal …" and
"T-009: ?g1=0 is the same escape hatch …" into "T-121: ?zip=1 is inert
since entry 25 deleted the brick-slam reveal" and "T-121: ?g1=0 (the old
alias) is inert too".

`g1-1-render-only-proved-sim.mjs` was re-based, not deleted. The
integrator asked for that because it is the gate's only
`Math.random`-in-sim catcher. Its baseline used to be `?zip=1`; it now
compares the default run with every render-only flag at once
(`?zip=1&g1=0&view=near&world=0&tex=flat&bloom=0&shadow=0&seams=0&palette=classic&legibility=0&sprites=0&backdrop=flat&limbs=legacy&scale=0&light=flat`).
Its labels "…in both render modes" and "…between ?zip=1 and the
default…" became "…with and without the render-only flags" and
"…between the default and every render-only flag at once…".

**It binds.** I mutated `src/sim/scroll.js` so that `?view=near` scales
the scroll by 1.0001, and the domain failed ("first difference at frame
0"). With `Math.random()` in the same line, it also failed. After
restoring the file, 7/7 pass.

**Proof.** Pathcheck is **3984/0**, and the ordered label diff against
the base is exactly the five label changes above. Race lab **29/29**.
Traversal matrix **44/44** identical against base src. Browser, each pair booted concurrently against the base and re-run until
both sides kept the same art and bloom boot outcome:

- 1280x720: 33/33 art ready on both sides, frame **pixel-identical**.
- 844x390 `hasTouch`: **pixel-identical** on try 3. Tries 1–2 differed
  only in whether the bloom pass made its 1200 ms boot budget.
- `?slice=traversal`: **pixel-identical**.
- On all three: the sim snapshot is byte-identical, the bridge wiring is
  identical in all 38 slots, there are 0 page and 0 console errors, and
  the same-origin request sets are the same.
- On the branch, `?zip=1&g1=0` is identical to the default in every
  respect.
- Plain boots at both viewports go MENU → PLAYING with 0 errors.

Deterministic smoke **identical**. Bundle: 390 files, 75.3 MiB; the only
changed entries across batches 3 + 4 are the 12 edited src files.

The race lab and the traversal matrix ran on the first cut. The final
change touches only `src/render/level.js`, and neither tool imports any
`src/render/` module.

## Staged for after the in-flight lanes merge (entry 25)

Entry 25 released hook v1 and the zip corner for deletion. The integrator's
rules for this lane:

- Delete each whole feature, including its hook-only / zip-only pathcheck
  sites. This is a narrow exception to T-120's fence, and each removed
  label is listed.
- Keep the flow half of every mixed assertion, and keep a relabelled "flow
  child ran" guard.
- Leave the zip corner's SIM half alone (gameplay, I-105).
- Do the parts in fenced in-flight files only after T-101/T-102/T-103
  merge and the integrator says so.

Everything below is written as exact-match patch scripts. Each replacement
asserts its match count, so a file that drifted fails loudly instead of
being half-patched. Nothing below is on `task/T-121` yet.

| script (absolute path) | what | applies |
|---|---|---|
| `/tmp/claude-0/-home-user-hullbreaker/0c748965-85bc-570b-a00a-0186b03c4f4f/scratchpad/t121/hook-patch.py <root> --with-simlab` (+ `hook-files/`) | hook v1, complete | after T-101 + T-102 (fenced: main.js, config.js, sim/player.js, ui/hud.js, tools/simlab) |
| `/tmp/claude-0/-home-user-hullbreaker/0c748965-85bc-570b-a00a-0186b03c4f4f/scratchpad/t121/hook-t102.py <root>` | the hook rows T-102's new turn proof transcribes | with hook-patch.py, after T-102 |
| `/tmp/claude-0/-home-user-hullbreaker/0c748965-85bc-570b-a00a-0186b03c4f4f/scratchpad/t121/hook-docs.py <root>` | `docs/DESIGN.md`: the palette note's `?hook=1` exception and the snap-hook design note record the deletion | with hook-patch.py |
| `/tmp/claude-0/-home-user-hullbreaker/0c748965-85bc-570b-a00a-0186b03c4f4f/scratchpad/t121/zip-fenced.py <root>` | zip: the fenced remainder of the render-side deletion | after T-101 + T-102 |
| `/tmp/claude-0/-home-user-hullbreaker/0c748965-85bc-570b-a00a-0186b03c4f4f/scratchpad/t121/route-zip.py <root>` | zip: the `?zip=1`-only branch T-102 adds to `route-visibility.js`, and T-102's pins of it | after T-102, when told |

**Verified four ways.**

1. **On this branch's own clone.** Hook alone: pathcheck **3916/0**; the
   ordered label diff is the 36 T-108 DELETE-WITH-FEATURE sites, plus 5
   split assertions, plus loop iterations over the deleted modules and keys
   (69 evaluations). Race lab **29/29** (`8ea94ef8`). Traversal matrix
   **44/44** identical to base. The kept flow guard binds: with the child
   broken it gives 0 passed, 1 failed.
2. **On a trial merge of what main will be.** The trial is main `5252c18`
   + `task/T-102` `6d3e58f` + `task/T-101` `49f6a0a` + `task/T-103`
   `11ff74e` + this branch + batch 4's level.js fix, built in a
   `git clone --shared` scratch clone. Only `tools/pathcheck/manifest.mjs`
   conflicted, and only between the three lanes (d77 three times; I
   resolved it as d77/d78/d79). All five scripts apply cleanly.
   - Pathcheck before the scripts: **4412/0**. After: **4340/0**.
   - The ordered label diff is 80 lines out and 8 in. That is every hook
     site (with the five split assertions' flow halves kept), the
     per-module layer guards over the three deleted hook modules (18
     iterations), the `KeyL`/`KeyE` × 7-state shell-key loop (14), the two
     band-slam sites, and the zip-only T-102 site; two zip-only labels were
     rewritten (listed below).
   - The first trial run failed 3 assertions in T-102's new domain:
     T-102's `tools/simlab/lib/sixface-host.mjs` imports `sim/hook.js` and
     transcribes the run-reset registry row for row. `hook-t102.py` exists
     for exactly that.
   - **Race lab, as a differential.** The committed race-lab fingerprints
     are stale for the merged tree: 9 of 29 differ, and the same 9 differ
     on both sides, because the in-flight lanes changed the sim. So I
     compared what each run actually produced, before against after the
     scripts (`race-actual.mjs`): **29/29 identical**. Traversal matrix
     with the patched tool against the pre-patch src: **EQUIVALENT,
     44/44**.
3. **On the real main once T-101 and T-102 had merged.** The trial is main
   `ace6618` + `task/T-103` + this branch. Pathcheck goes **4416/0 →
   4344/0**, the same 80-out / 8-in label delta as the first trial, with
   numbers masked.
4. **With T-120's in-flight gate rebuild merged on top as well.** All five
   scripts still apply. T-120 deletes `tools/boot-registry-check.mjs` and
   `tools/pathcheck/boot-registry-contract.mjs`, so `hook-patch.py` now
   skips those two when they are absent. T-120 also adds a tier map
   (`tools/pathcheck/_tiers.mjs`) whose runner refuses to start on a stale
   domain name, so the script renames `snap-hook-driven-through-real-sim`
   there too. T-120's runner (`node tools/pathcheck.mjs --tier all`)
   goes **4423/0 → 4350/0**. By domain:
   - `movement-verb-prototypes` 39 → 17;
   - `snap-hook-driven-through-real-sim` 21 → `flow-chain-crush-contract` 8;
   - `t-013-game-shell` −15 (the `KeyL`/`KeyE` loop and one per-file
     guard);
   - `t-049` −7 and `t-051` −6 (per-file guards over the deleted hook
     modules);
   - `world-transitions` −3 (two band-slam sites, plus "hook.js never
     reads the cover choreography");
   - `t-003` −2, `t-012` −1, `g2-neck-access-plate-flip-gate` −1 ("hook.js
     never reads the G2 render-only gate fields");
   - `t-102-corner-turns` −1 (the zip-only site);
   - `t-120-prototype-flags-inert` −2: T-120's own `HOOK_ENABLED` rows,
     which skip by design once the export is gone ("its rows report
     gone").

**Lanes dispatched since this work was staged.** Main `ace6618` put
T-105, T-107, T-120 and T-201 in flight. I checked each one with
`git diff --name-only $(git merge-base main task/<id>) task/<id>`
against the staged file list:

- **T-120** already changes three staged files. That is handled (point 4
  above).
- **T-105** fences `src/ui/hud.js` and `src/ui/audio.js`, where the
  staged edits remove the hook legend and change one comment. Its branch
  has no commits yet.
- **T-201** owns the sim-side zipper removal (entry 25 / I-105), so
  `route-zip.py` keeping `routeColumnBuilt` exported is a hand-off to it.
- **T-107**: no overlap.
- **T-103** overlaps only on `tools/pathcheck/manifest.mjs`, on different
  lines.

Landing the scripts before those lanes write their first commits costs
the lanes nothing.

**Hook v1: what the scripts do.** src: 18 files, −717/+47. tools: 14
files.

- Delete `src/sim/hook.js` (271), `src/pure/hook.js` (137),
  `src/render/hook.js` (86) and `tools/movement/evidence.mjs` (172).
- `src/mode.js`: drop `HOOK_ENABLED`, `HOOK_INPUT`, and `{ hook: … }` in
  `resolveTraversalPace`'s options.
- `src/pure/traversal.js`: drop `hookAnchors`, `TRAVERSAL_HOOK` and the
  hook overlay. Keep `'hook'` in `TRAVERSAL_FLOW.linkVerbs` (see "Not
  deleted").
- `src/sim/player.js` **[T-102]**: drop the import, `hookApi`, `hooked`
  and both `hookCancel()` calls. `hooked` was always false without the
  flag, so each `!hooked &&` term goes without changing a condition.
- `src/main.js` **[T-101]**: drop the imports, `bufferHookUntil` on
  `KeyL`/`KeyE`, the hook telemetry, `HB.hook`, and three self-test checks
  (the flow checks stay).
- `src/ui/hud.js` **[T-102]**: drop `HOOK_LEGEND` and the `TETHER` /
  `HOOK READY` status. Both only showed under `?hook=1`.
- `src/sim/input.js`: drop `keys.hook` and the hook buffer.
  `src/pure/frame-input.js`: drop `KeyL`/`KeyE` from `GAMEPLAY_KEYMAP`
  (17 → 15 codes; see the one browser-level difference below).
- `src/boot/run-reset.js`, `view-init.js`: drop the `hook-input`/`hook`
  reset owners and the `hook` view.
- `src/sim/bridge.js`: drop the `hook` view group. Audio and juice never
  wrap it, so no other slot's wiring moves.
- `src/config.js` **[T-101]**: drop three palette tokens.
- Comments in `palette.js`, `score.js`, `pure/flow.js`, `sim/flow.js`.

Pathcheck (exception):

- `snap-hook-driven-through-real-sim.mjs` becomes
  `flow-chain-crush-contract.mjs`. Its 14 hook-only sites go. Its
  crush/fallback half and the child-ran guard stay, relabelled to flow.
- `movement-verb-prototypes.mjs`: 22 hook-only sites go. Three mixed
  assertions are split, keeping their flow halves.
- `manifest.mjs`: d15 is renamed.
- `boot-registry-contract.mjs` and `tools/boot-registry-check.mjs`: the
  hook entries go (31 → 29 reset owners, 13 → 12 views).

Other tools:

- `tools/movement/{selftest,matrix,simrun}.mjs`: the hook URLs, policy
  and metrics go.
- `tools/simlab/race/run-child.mjs`, `t2lab.mjs` **[T-102/T-104]**: these
  must land in the same commit as the src deletion. `run-child.mjs`
  imports `sim/hook.js` and re-checks the reset ids, so the race lab
  breaks without them.
- `hook-t102.py`: `tools/simlab/lib/sixface-host.mjs` loses its
  `sim/hook.js` import and the two reset rows.
  `tools/pathcheck/t-102-corner-turns.mjs` loses `'hook-input', 'hook'`
  from its pinned reset-id list.

**The one browser-level difference.** With `KeyL`/`KeyE` out of the
gameplay keymap, `src/main.js` no longer calls `preventDefault()` on
those two keys. In-game they did nothing without `?hook=1`, and at the
title they still start the run, because `shellKeyIntent` never read the
keymap. The only browser default this exposes is Firefox's optional
search-as-you-type, which is off by default. If the integrator wants
byte-identical DOM handling, keep `KeyL: 'hook', KeyE: 'hook'` as inert
reserved keys: one line in `src/pure/frame-input.js`, and the T-013
loop keeps its 14 iterations.

**Zip, the fenced remainder.** This is `zip-fenced.py`. Batch 4 already
did the rest.

- `src/pure/transform.js`: delete `bandSlamOffset` / `bandSlamLockMs`,
  the transform slice's "reserved for hostile constructs" assembly curve.
  Nothing in `src/` calls them.
- `src/config.js` **[T-101]**: delete `CONFIG.transform.assembly`, which
  only those two read.
- `tools/pathcheck/world-transitions.mjs`: delete its two T-108
  DELETE-WITH-FEATURE sites ("the assembly choreography is retained …",
  "the reserved assembly curve still settles …"). Keep "no transition
  constant drives an assembly".
- Comment-only edits in `src/main.js`, `src/ui/audio.js` and
  `src/sim/player.js`.

**Zip, T-102's branch.** This is `route-zip.py`. T-102 adds a
`?zip=1`-only branch to `src/render/route-visibility.js`. Since batch 4,
`IS_G1 || routeColumnBuilt(s)` is always true past the fixture return,
and the build-revision stamp is unreachable. The script:

- passes `true` to `routeRenderOwned` and drops the unreachable stamp
  and the two imports it leaves unused. `routeColumnBuilt` stays
  exported (sim-side zipper surface, I-105).
- In `tools/pathcheck/vertical-assault-geometry.mjs`, rewrites "route
  ownership is camera-facet topology in both normal-run reveal styles;
  only ?zip=1 adds build state" into "route ownership is camera-facet
  topology alone in the normal run; no build state since entry 25".
- In `tools/pathcheck/t-102-corner-turns.mjs`, deletes "T-102: ?zip=1
  keeps its assembling reveal (… rows at the handoff)". It rewrites the
  mixed static pin ("reads construction rows only under ?zip=1, and its
  cache stamp changes only at facet handoffs …") into its default half.
- In `tools/simlab/turnlab-falsify.mjs`, re-points the P4 mutation anchor
  so it still proves the "draws the whole arriving facet" assertion
  binds.

**Stale after the hook deletion, in `tools/orch/` (fenced, T-120).**

- `tools/orch/mutants.mjs` M07 mutates `HOOK_ENABLED` in `src/mode.js`
  ("?hook=1 stops being inert"). Its anchor disappears, so it needs
  dropping or re-aiming, e.g. at `?flow=1` arming by default.
- `tools/orch/test-audit-spec.mjs` already classifies the deleted sites
  RETIRED `with:T-121`. Its line-keyed rows for
  `movement-verb-prototypes` (`[66, 66, …]`, `[86, 254, …]`,
  `[169, 169, …]`) will point at moved lines.

**Recovery.** Both features exist intact at `bb8e4df` (and `e5ce7d4`).
Entry 25 records that the operator *liked the corner-building
aesthetic*, and entry 3's addendum still reserves assembly for things the
ship builds. A trap or emplacement lane should therefore recover the
zipper's render choreography from git rather than reinvent it:
`zipperColumn` / `faceRevealed` in `src/render/level.js`, the flag in
`src/mode.js`, and `bandSlamOffset` in `src/pure/transform.js`.

## Not deleted, and why

**Fenced (in-flight lanes): staged, waiting for the integrator's go.**
These are the hook-v1 and zip sites in `src/main.js`, `src/config.js`,
`src/sim/player.js`, `src/ui/hud.js`, `src/ui/audio.js` (comment),
`src/pure/traversal.js`, `src/pure/transform.js`, `src/sim/input.js`,
`src/pure/frame-input.js`, `src/boot/*`, `src/render/route-visibility.js`
and `tools/simlab/*`. The exact edits are in the five scripts above.

**Kept on purpose inside batch 4: two do-nothing owners in
`src/render/level.js`.** They exist only to keep the corner's audio wiring
as it ships (see batch 4 and the audio issue). They go when audio's wiring
is fixed.

**Needs T-120 (a check pins the thing):**
- `assets/generated/enemy-ecology/review/*` — 27 committed review boards,
  17.3 MiB (already pruned from the bundle): `tools/level1-enemy-ecology-check.mjs:194-232`
  asserts each exists and measures it.
- 69 exports used only by tests (e.g. `responseSocketViolations`,
  `hostileGenomeSnapshot`, `solidAt`, `seamsStats`, `materialSubmissionSnapshot`);
  and dead exports pinned by source-text assertions: `CRITICAL_GAMEPLAY_REQUESTS`
  (`tools/pathcheck/t-049-hostile-sprites.mjs:136`), `defenseVfxComponent`
  (`tools/defense-vfx-pack-check.mjs:148`, which also regexes the generated module).
- `src/pure/traversal.js` `TRAVERSAL_FLOW.linkVerbs` keeps an inert `'hook'`
  entry after the hook goes: `tools/pathcheck/movement-verb-prototypes.mjs:260`
  pins `linkVerbs.length === 3` (one word in src + one character in the test).
- Kept but stale-labelled after zip: `t-009` "the gate runtime still drives
  the zipper timeline for ?zip=1" — T-108 lists it DELETE-WITH-FEATURE, but it
  pins `wavegate.updateZipper`, which the integrator's scope split KEEPS as
  gameplay. Likewise the 8 `pathcheck-suite.mjs:173-192` zipper-timing sites
  (T-108: DELETE-WITH-FEATURE) test `pure/waves.js zipperOffset`, which is live
  sim code; they should go only with that code, in the race lane.
- `tools/playtest/lib/compile.mjs:28` maps the `hook` action to `KeyL`, and
  `lightrig-capture.mjs:391`, `verify-served.mjs:202`, `README.md:1683` and
  `scripts/six-face-full-run.json` describe `?zip=1`; harmless once the flags
  are inert, stale text for T-120.

**Operator decision (flags are someone's A/B control):** nine parameters no
tool, doc or decision names — `atmos`, `postreport`, `pixelworld`,
`fixtureart`, `capsules`, `enemyecology`, `actionvfx`, `components`, `pack`.
And the 45 asset files (30.8 MiB) only flag paths use (legacy Crown art,
A-variant sprites, modular wasp, painted tile, backdrop plates, v1 weapon
sheets) go only with their flags.

**Needs T-120 (`tools/orch/`, fenced) after the hook deletion:**
- `tools/orch/mutants.mjs` M07's anchor (`HOOK_ENABLED` in `src/mode.js`)
  disappears.
- `tools/orch/test-audit-spec.mjs` has line-keyed `movement-verb-prototypes`
  rows that will point at moved lines (the deleted sites are already
  classified RETIRED `with:T-121`).

**Not renamed:** `IS_G1`. Since batch 4 it means exactly "not a fixture"
(`ACTIVE_FIXTURE === null`) at every URL. It has 34 references in 10
files (`src/main.js`, `src/render/camera.js`, `level.js`, `limb.js` and six
more). A rename touches the lanes that own those files (T-101 main.js, T-107
camera), so it belongs with the flag-registry proposal (§6.4), not here.

**Integrator decision:** `reports/` (160.6 MiB; 158.8 MiB of it raw traces and
screenshots, 104.3 MiB under `reports/tasks/T-044/`); `.claude/skills/*` names
`artifacts/cp3-transform-v3`, `artifacts/g1-limbturn` and
`tools/assets/codex/` as examples — kept until those guardrail texts move;
`CLAUDE.md` still lists the retired `docs/HANDOFF.md` first in its read order;
`README.md:104-107` still lists `?zip=1` and `?momentum=1` (opt-in) as flags.

**Kept on purpose (not dead):** `src/pure/track-archetypes.js` (431 lines,
the one unreachable module — level-2/3 design data T-207/T-209 will wire);
the provenance masters and source sheets of live atlases (their READMEs
retain them); `tools/assets/extract-level1-enemy-ecology-provenance.mjs` (the
only record of how a committed provenance file was produced; it can only run
on the operator's laptop); the decision-evidence artifacts listed in
`docs/archive/2026-10-artifacts-index.md`; the 7 old RIG sprites
(`rig-aim-*-v1` etc., 1.4 MiB, unreferenced) under T-103's fence.

**Hook v1 and zip — the cost numbers the dispatch asked for** (before entry 25
released them): hook v1 = 3 whole src modules (494 lines) + edits in 15 more
src files (net −670 src lines), 2 flags, 3 palette tokens, 2 reset owners,
1 view hook, 2 gameplay keys, 36 pathcheck call sites that test only the hook
(+5 mixed with flow), 1 standalone tool (172 lines) and hook rows in 4 more;
zip render side = 2 view-hook implementations + 3 write-only bake structures
in `level.js`, 2 flags, comment updates in 6 files, the reserved band-slam
curve (29 lines in `src/pure/transform.js` + 8 config lines), 1 zip-only pathcheck site + 2 retained-for-zip
sites + 2 assembly-retention sites, and one CORE determinism domain that had
to be re-based rather than deleted.

## Fragility map — top five refactor proposals (proposed only)

Full evidence in `docs/proposals/2026-10-cleanup.md` §6.

| # | proposal | risk | size | conflicts / sequencing |
|---|---|---|---|---|
| 1 | Split `src/render/level.js` (2,632 lines: view hooks 138–204, procedural dressing 206–1,712 with 227 `dress*` references, hull panels 1,713–2,400, bake 2,400–2,632) into bake / dressing / panels; pure placement math into `src/pure/` | medium (render-only; frame diff + race lab + draw-call budget) | M–L | T-102 (route visibility), T-204, T-205, T-208 — after T-205, before T-208 |
| 2 | Emit the three generated data modules (7,868 lines, 13.8 % of `src/`; `defense-vfx-pack.js` alone 5,381 lines, 2,050 of them a lone number) one component per line from their generators | low (deep-equal of exported values) | S | `tools/defense-vfx-pack-check.mjs` regexes module text (T-120) |
| 3 | Break the 7-module sim import cycle (`player ↔ weapons ↔ hostiles ↔ capsules ↔ mods ↔ wavegate ↔ ecology-tactics`) with a state-only leaf `src/sim/world.js` | medium (sim; race lab 29/29 + traversal matrix 44/44) | M | T-102, the T-201 race lane, T-206 — after T-206 |
| 4 | One declarative flag registry (`src/flags.js`) for the 62 parameters read at 85 sites in 33 files; retire the 9 parameters nothing names, each with an operator yes/no | low–medium (frozen-tick snapshot + race lab per default) | M | T-101 (`?touch`), T-107 (`?view`), T-201/T-206 (`mode.js`) |
| 5 | Self-test (284 lines of `src/main.js`) behind a dynamic `import()` under `?selftest=1`; the 34 unconditional `__HB_*` debug globals into one registry under `?testapi=1` | low for the game; readers must move | S–M | T-101 (`main.js`), T-120 (owns the self-test and the readers) |

## Open feel questions for the operator

None. Every batch is meant to change nothing a player sees, hears or does,
and the proofs above say it does not. There is one exception, and it is
for the integrator to call: once the staged hook deletion lands, `L` and
`E` are no longer gameplay keys, so the page stops calling
`preventDefault()` on them. That is a browser-level difference only (see
"Staged").

## PROPOSED INBOX ISSUES

## I-??? | docs | S3 | repro: `git log --oneline --diff-filter=D -- docs/HANDOFF.md` @ e5ce7d4 | evidence: CLAUDE.md:16, docs/FLEET-PLAN.md:6
`CLAUDE.md`'s read order starts with `docs/HANDOFF.md` ("current state +
working relationship"), but that file was deleted in `641cd00` when the
wave-4 SPRINT was retired. Every new agent's first read is a 404; this lane
fixed the same pointer in `docs/ENGINEERING.md` (its own fence) but cannot
edit `CLAUDE.md`. Fix direction: point step 1 at `docs/LANE-BRIEF.md` +
`SPRINT.md`, or restore a short HANDOFF.

## I-??? | docs | S3 | repro: read README.md:104-107 against src/mode.js:119-121 @ e5ce7d4 | evidence: README.md, src/mode.js, 979e27b
`README.md`'s flag list (lines 104-107) still presents `?momentum=1` as the way to arm earned
pace escalation, but momentum has been ON by default in the six-face run
since `979e27b` (`?momentum=0` is the comparison switch); and it lists
`?zip=1` (legacy corner reveal), which this branch's batch 4 makes inert
(entry 25). A player-facing doc that names flags that do nothing is the drift
entry 24 complained about. Fix direction: regenerate the flag list from one
registry (`docs/proposals/2026-10-cleanup.md` §6.4); until then, edit the two
lines.

## I-??? | bug | S3 | repro: `node tools/assets/check.mjs` on the loaded cloud host @ e5ce7d4 | evidence: this lane's run (killed after 29 min with no output), T-109's two concurrent runs (29 and 18 min, still running when observed)
`tools/assets/check.mjs` decodes every PNG under `assets/` in pure JS
(`tools/assets/lib/png.mjs`); with 174.5 MiB of assets it ran for more than
29 minutes here without finishing, and three lanes were running it at once.
It is not part of the per-edit gate, so it is easy to skip — which is exactly
how an asset regression slips through. Fix direction (T-120): check only
runtime-named and manifest-listed files by default, cache decoded headers by
content hash, and keep the full sweep as a deep suite.

## I-??? | bug | S2 | repro: boot `index.html` @ e5ce7d4 (or current main), then in the console `const {view} = await import('/src/sim/bridge.js')` and walk `view.bullets.slotSpawned[Symbol.for('hullbreaker.previousBridge')]` — juice's wrapper wraps the bullets owner directly; no audio wrapper anywhere in the chain | evidence: `tools/cleanup/boot-probe.mjs` frame captures (`bridge` field) at e5ce7d4 and on task/T-121; bridge dumps at 6b62b34^ and 71f3062 (T-121 scratch)
`src/ui/audio.js` wires all of its observers when it is imported
(audio.js:1060-1084), and `after()` wraps whatever is in the slot at that
moment. Every owner installs later than that, in `initializeViewRegistry()`
(main.js:165), and `installView` replaces a slot outright. So at boot,
every audio observer on a slot that has an owner is thrown away:

- firing (`bullets.slotSpawned`), `player.sync`, hostile spawn/sync/remove;
- capsule pickup, loot, the lance, the finale;
- the corner (`corner.finished`, `level.faceRevealed`);
- the state-screen lifecycle (`stateScreen`: menu, pause and game-over
  ducking, and the layer recount).

The boot-time bridge dump at e5ce7d4 shows each of those slots as
`[juice wrapper →] owner`, with no audio wrapper in the chain. What still
plays in the shipped default run is the ambience bed, which starts when the
AudioContext unlocks, and the hit sounds on `bullets.hostileImpact`, the one
observer whose slot has no owner. In the transform slice, the `transform.*`
observers die the same way once that slice installs its owner.

**It is older than the lifecycle refactor.** At `6b62b34^` and at
`71f3062`, the oldest commit in this repository's history, `player.sync`
and `hostiles.spawned` already hold bare owners. Their owners install after
a top-level `await awaitPreloads()`, so the import order main.js
documented ("audio also loads after every render/ui module") did not hold.
`6b62b34` fixed the same race for juice by making it an observer that
installs after the owners, and left audio at import time.

**Nothing catches it.** The T-012 audio guards read source text. T-042's
behavioural half does drive `audio.js` through the real bridge hooks, but
in a Node child where no render owner is installed, so audio's wrappers
survive there. Browser playtests never unlock an AudioContext. My own
audio probe could not show the voices either: at 0.2–0.3 fps on this
host, heat decays between frames. The wiring is the evidence. T-121 found this because deleting the
zipper renderer's install let one discarded observer, the `faceRevealed`
boom, come back. That lane put back do-nothing owners so the deletion
stays inaudible (`src/render/level.js`, `zipperColumn`/`faceRevealed`).

**Fix direction (T-105, which fences audio.js).** Register audio as an
observer in `VIEW_OBSERVER_MANIFEST` (`src/boot/view-init.js`) after the
owners, the way juice is. Then delete the two do-nothing owners and add a
boot-time wiring assertion (boot-probe's `bridgeWiring` is a starting
point). The fix changes what players hear, so it needs an operator
ear-check. Operator verdicts on audio given since the wiring broke were
made on a nearly silent build; the integrator may want to note that.

## I-??? | bug | S3 | repro: boot the same tree twice concurrently with `node tools/cleanup/boot-probe.mjs --mode frame` on the shared host, then `--compare` | evidence: T-121's probe dirs: identical sim state, 38–46% of pixels different, explained each time by `__HB_PRELOAD()` art states or `HB.snapshot().post.status`
On a loaded GPU-less host, two boots of the same tree do not render the
same frame. Assets that miss the 2.5 s desktop boot budget are dropped
for the session; in one 1280x720 pair 20 of 33 missed on both sides. The
bloom pass has its own 1200 ms boot budget and falls back to direct
rendering when it misses it. That happened on 18 of 22 frame boots
here (14 of 15 at 1280x720, 4 of 7 at 844x390 touch). Any
screenshot-based judgement (playtester boards, a future
render-submission gate, before/after captures for the operator) can
therefore differ for reasons that have nothing to do with the change
under test. Fix direction (T-120): any capture that is compared must
record and match these boot outcomes first. `tools/cleanup/boot-probe.mjs`
now does this, and its `presentationMatch` logic is small enough to
lift.

## I-??? | bug | S3 | repro: after the staged hook v1 deletion lands, `node tools/orch/mutation-sample.mjs` | evidence: tools/orch/mutants.mjs M07 (`from: "export const HOOK_ENABLED = …"`), tools/orch/test-audit-spec.mjs movement-verb-prototypes rows `[66,66]`, `[86,254]`, `[169,169]`
T-108's mutation sample has a CORE mutant, M07, aimed at "?hook=1 stays
inert". It anchors on `HOOK_ENABLED` in `src/mode.js`, which the hook
deletion removes, so the sample will refuse to apply it. The audit spec
already classes the deleted sites RETIRED `with:T-121`, but some of its
rows are keyed by line range in `movement-verb-prototypes.mjs`, which
the deletion rewrites. Fix direction (T-120, which owns `tools/orch/`):
drop M07, or re-aim it at the surviving flow-off invariant ("no ?flow:
every pace resolves exactly as it shipped"), and re-key the rows by
label.

## Verification commands (all run by this lane; results above)

Every command below was run from the worktree with `. ~/.hullbreaker-host.env`
loaded. The base tree is `git archive e5ce7d4`, served on 8772; branch
snapshots were served on 8771.

| command | base `e5ce7d4` | branch (this commit) |
|---|---|---|
| `node tools/pathcheck.mjs` (via `node tools/pathcheck-labels.mjs --tree . --out <labels>`) | 3985 passed, 0 failed | 3984 passed, 0 failed; ordered label diff = batch 4's five label changes |
| `node tools/simlab/race/lab.mjs check --every 8` | 29/29 reproduce, digest `8ea94ef8` | 29/29, `8ea94ef8` (batches 3, 4) |
| `node tools/movement/matrix.mjs --grid baseline --against <base>/src` | — | EQUIVALENT, 44 runs (batch 4) |
| `cd tools/playtest && node run.mjs scripts/mid-route.json --deterministic --viewport 480x300 --base-url http://127.0.0.1:<port>` | finalHash `437a69ce6c9040fa`, ledgerHash `af91377183458396`, tick 594, 0/0 errors (reproduced twice) | identical (batches 3, 4) |
| `node tools/cleanup/boot-probe.mjs --base-url … --mode plain` at 1280x720, and at 844x390 `--touch` | MENU → PLAYING, 0/0 errors, 194 requests | identical |
| `node tools/cleanup/boot-probe.mjs --mode frame` pairs + `--compare` (1280x720, 844x390 touch, `?slice=traversal`) | — | sim snapshot, bridge wiring (38 slots) and frame pixels identical in art- and bloom-matched pairs |
| `node tools/cleanup/boot-probe.mjs --mode frame --query 'zip=1&g1=0'` vs default, on the branch | — | identical in every respect (the flags are inert) |
| `node tools/deploy/build-bundle.mjs --ref <sha>` + per-file diff | 393 files, 80.8 MiB | 390 files, 75.3 MiB; only the 3 deleted assets and the 12 edited src files differ |
| ESLint 10.1.0 `--no-config-lookup`, `no-unused-vars` over every edited src file | — | no findings |
| mutation checks on the re-based / relabelled guards | — | `g1-1` red on a `?view=near`-scales-scroll mutant and on `Math.random` in the sim scroll; the flow child-ran guard red when the child throws; all restored |
| trial merges with the five staged scripts: (1) main `5252c18` + T-102 + T-101 + T-103 + this branch; (2) main `ace6618` + T-103 + this branch; (3) = (2) + T-120 | (1) 4412/0 (2) 4416/0 (3) 4423/0 (`--tier all`) | (1) 4340/0 (2) 4344/0 (3) 4350/0; every removed label/count listed |
| `node tools/simlab/race/lab.mjs check --every 8` on trial (1), before vs after the scripts, compared run by run (`race-actual.mjs`) | committed matrix stale for the merged tree (9/29 differ) | the same actual fingerprint on 29/29 runs |
| `node tools/movement/matrix.mjs --grid baseline --against <trial (1) pre-patch>/src` | — | EQUIVALENT, 44 runs |

Two things were **not** run.

- `tools/deploy/verify-bundle.mjs`, the slow browser bundle verifier. The
  bundle's contents were diffed file by file instead (above). The dispatch
  allowed it once at the end, and it is better spent after the staged
  hook/zip batches land.
- `tools/assets/check.mjs`. It ran for 29 minutes with no output on this
  host and was killed (see the inbox issue).

## Single best next action

**Integrator: give this lane the go now.** T-101 and T-102 have merged.
T-103 overlaps the staged scripts only on `tools/pathcheck/manifest.mjs`,
on different lines, so waiting for it buys nothing. Every day of waiting
lets T-105, T-120 and T-201 write commits that the scripts then have to
merge around. On the go, the lane will:

- merge main into `task/T-121`;
- apply the five staged scripts, which already apply to current main +
  T-103, and to the same with T-120 on top;
- re-run this report's protocol;
- hand back for review and merge.

The finding that most needs a separate owner is the **audio-wiring
issue**. The shipped game plays almost none of its own sound effects.
Some of them have been silent since at least `71f3062`, the oldest commit
in the history. Nothing in the gate can see it. It belongs in T-105, which
fences `src/ui/audio.js`, and it needs an operator ear-check, because the
fix changes what players hear.

Merge-order note: batch 3 edits `src/render/preload.js`, which T-105
fences too. Merging T-121 before T-105 commits avoids a small conflict.
