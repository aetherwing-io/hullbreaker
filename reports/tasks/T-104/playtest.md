PASS

# T-104 playtest gate: docs + measurement-tools lane

Gate of record: branch `task/T-104` @ `cb85a6f` (commits `140bf3e`, `aeed41a`,
`cb85a6f` on base `98b12c9`), worktree
`/home/user/hullbreaker/.claude/worktrees/T-104`. Run 2026-10-22 23:01-23:35 UTC
on a GPU-less 4-core host, load average 31-47 (other lanes' SwiftShader
browsers). Nothing in the worktree or in `src/` was edited by this gate
(`git status --porcelain` in the worktree: empty before and after); the only
repo file I wrote is this one. Scratch lives under
`/tmp/claude-0/-home-user-hullbreaker/0c748965-85bc-570b-a00a-0186b03c4f4f/scratchpad/qa-t104/`
(session-scoped), the smoke run under `/tmp/t104-smoke-mid/`.

**What this verdict claims.** (1) The lane does not change the shipped game.
(2) The committed measurement tools reproduce the numbers the proposal quotes,
on this tree, and the tools' guards bind. (3) The six framing PNGs show what the
proposal says they show, with the nits listed below. **What it does not claim:**
anything about fun or feel; whether the proposal's design is right; that bots
stand in for people (the tools' own README says they do not); or anything from
`pathcheck` (decisions entry 21: a green legacy gate is not evidence, and I did
not run it). The verdict is pinned to `cb85a6f`; a docs-only amendment of the
nits below does not change any measured or tool result in this file.

## 1. Zero effect on the shipped game

1. **Changed paths** (`git diff --stat main...HEAD`; merge-base is `98b12c9`):
   27 files, +7,668 / -0.
   - `docs/proposals/2026-10-race-to-the-top.md` (new, 1,832 lines)
   - `tools/simlab/README.md` (+109, appended, no deletion) and
     `tools/simlab/race/*.mjs` (12 new files)
   - `artifacts/t104-race/` (13 new: `baseline.json`, `baseline.md`,
     `browser-check-640x400.json`, `climb-plan.json`, `facts.json`,
     `framing.json`, `gate-view.json`, six `framing-*.png`)
   - **Nothing** under `src/`, `index.html`, `assets/`, `tools/pathcheck*`,
     `tools/playtest/`, `tools/orch/`, `package.json`
     (`git diff --name-only 98b12c9...HEAD -- src index.html assets
     tools/pathcheck tools/pathcheck.mjs package.json` is empty).
2. **Blob identity with main's current HEAD (`1a3a400`)**: `git rev-parse
   {main,HEAD}:src` are both `618be636bb78de6755da46c0c4724a830055f943`;
   `index.html` both `ee291bbbcdb293ba4595c5e4975a60b7c581a910`; `assets` both
   `d833284dda3937caa06e529e9d85c23665e967b4`; `git diff --quiet main HEAD --
   src index.html assets` exits 0. Main has moved 10 commits since the base
   (decisions 20-addendum..23, orch, the pathcheck perf-probe domain, the
   playtest driver's slowdown knob) but touched no game file, so the
   proposal's measured numbers are valid for main HEAD with no re-measurement.
3. **No inbound references**: grep for `simlab/race` / `t104-race` across
   `src`, `index.html`, `tools/pathcheck*`, `tools/orch`, `tools/serve.mjs`,
   `tools/playtest` is empty. The only coupling is outward and read-only:
   `browser-check.mjs` and `probe-framing.mjs` import
   `tools/playtest/lib/isolated-browser.mjs`. All 12 new `.mjs` pass
   `node --check`. Randomness in the tools is the bots' own seeded mulberry32;
   `Date.now` appears only in wall-clock logging and is excluded from
   fingerprints (`wallMs` is attached after hashing).
4. **Trial merge**: `git merge-tree --write-tree --name-only main task/T-104`
   exits 0 with no conflicts (run again against `1a3a400`).

### 1b. Smoke (one script, as assigned) - PASS

Pinned server (main's copy, no-store headers), then main's harness:

```
export HB_PROBE_BOOT_MS=180000 HB_PROBE_SPAWN_MS=300000 HB_HARNESS_SLOWDOWN=40 HB_SMOKE_VIEWPORT=480x300
node /home/user/hullbreaker/tools/serve.mjs 8770 --root /home/user/hullbreaker/.claude/worktrees/T-104 --quiet &
cd /home/user/hullbreaker/tools/playtest
node run.mjs scripts/mid-route.json --deterministic --viewport 480x300 --base-url http://127.0.0.1:8770 --out /tmp/t104-smoke-mid
node /home/user/hullbreaker/tools/orch/smoke-verdict.mjs /tmp/t104-smoke-mid/report.json
```

Pin proof before running: `curl http://127.0.0.1:8770/index.html` is byte-equal
(`cmp`) to the worktree's `index.html`; `/artifacts/t104-race/facts.json` is HTTP
200 on 8770 and HTTP 404 on main's own 8741 server; response headers were
`Cache-Control: no-store, no-cache, must-revalidate, max-age=0`.

Result: `smoke-verdict: PASS (outcome=not-completed deaths=0 tick=594/594)`.
Evidence `/tmp/t104-smoke-mid/{report.json,summary.md,screenshot.png}`:

| field | value |
| --- | --- |
| `meta.bootError` | null |
| frame-input ledger | status `complete`, 26 of 26 events dispatched (`dispatchedVia: frame`), tick 594 / stop tick 594, `gameMsMax` 9900.198 |
| `pageErrors` / `consoleErrors` / `teardownErrors` | all empty |
| outcome | `not-completed` (the smoke window ends before victory by design), 0 deaths, 0 falls, hp 2, lives 3 |
| wall | 399.9 s at 480x300 (one sample per tick; achieved interval avg 665 ms) |

Metrics read as ratios only: sampler seconds are wall-time inflated about 40x on
this host (`HB_HARNESS_SLOWDOWN`), so "idle 132 s of 392 s" is not game time;
the idle fraction is 0.337 (the `stalled` bound is 0.6), `minEdgeMargin` 26.5
tiles. RIG's final x (55.649) and the final `gameMs` (9900.198) equal the values
recorded for this script in `tools/playtest/README.md` (2026-08-05); the final
`scrollX` (56.204 vs 56.085) does not, which is 2.5 months of main's history,
not this lane (game files are identical to main). Screenshot judged: HUD, deck,
RIG and the "H WAGER / EXIT LEFT" banner render; no blank frame, no missing
texture, no clipping at 480x300. My server was killed afterward (port 8770 now
refuses; other lanes' 8741/8751/8752/8753 untouched). `transform-slice` was not
run (assigned: one script; the lane changes no game file).

## 2. Reproduction: do the tools reproduce the proposal's numbers?

All commands from the worktree root, plain `node` v22, fixed 1/60 s step.

| check | command | result |
| --- | --- | --- |
| **documented spot check** | `node tools/simlab/race/lab.mjs check --every 8` | **29 of 29 fingerprints reproduce**, digest `8ea94ef8`, exit 0, 7 m 10 s wall (1 m 32 s CPU) at load 31-47 |
| oracle runs behind the headline times | `lab.mjs check --out <dir holding a baseline.json filtered to the 18 oracle runs at desktop + phone 6 %>` | **18 of 18** reproduce, 3 m 27 s |
| strict per-run + per-group (scratch driver, below) | `strict-check.mjs <wt> "<6 oracle groups>"` | 18 runs: `summary`, `faces[]` (every per-side field), `landed` and fingerprint all deep-equal; 6 group `aggregate` rows deep-equal |
| strict, one bot group | same, `"rush\|desktop-16x10"` | 12 of 12 runs and the group aggregate reproduce exactly |
| single-run tool, doc §2.7 | `node tools/simlab/race/sight.mjs --preset racer` (40 s) | table matches the doc cell for cell (below) |
| single-run tool, doc §4.5 rule 5 | `node tools/simlab/race/daylight.mjs --preset phone-crowding` (56 s) | all four lines match (below) |
| static artifacts | export of `HEAD` (`git archive`), the three files deleted there, `facts.mjs`, `gate-view.mjs`, `climb-plan.mjs` re-run | **byte-identical**: `facts.json` sha256 `da71126e2e40b035...` (4,746 B), `gate-view.json` `c47c4d0b5502af94...` (36,504 B), `climb-plan.json` `42bb1900a21beff3...` (4,034 B); worktree untouched |
| doc tables | `node tools/simlab/race/doc-tables.mjs --condensed` vs doc lines 388-577 | **identical** (18,548 chars) |
| `baseline.md` | the lab's own `md()` fed `baseline.json` | **identical** (54,588 chars) |
| digest | fnv over the 232 `key:fingerprint` pairs | `8ea94ef8` = field in `baseline.json` = the proposal's §1.2 quote; 232 distinct fingerprints |
| reachability by play | `reachByPlay()` over committed per-run `landed` + the 85 platform ids in `src/sim/level.js` | 84/85 (desktop, phone FAR, phone 6 %; only `assault-f3-recovery` unreached), 46/85 portrait; equals the committed block |
| replica vs Chrome | the replica half of `browser-check.mjs` (same 60-edge schedule, 640x400, 24 s) re-run here, diffed against the **browser** final state recorded in `browser-check-640x400.json` | **MATCH**, 1,440 ticks, x 112.25, y 3, hp 2, lives 3, kills 2, scroll 98, corner 1 `gate`, 4 hostiles identical; 2.9 s, no browser launched |

Coverage honestly: 58 of the 232 committed runs (25 %) were re-executed and
reproduced; 25 of the 32 (policy, viewport) groups were touched (untouched:
`idle` on phone FAR / 6 % / portrait, `oracle@0` and `@3000` on phone FAR,
`oracle@1500` and `@3000` on portrait). I did **not** re-run the full 232-run
matrix (about 57 min at this load: 14.8 s of wall per run on 2 jobs), the
browser half of `browser-check.mjs` (67 min in the committed run), or
`probe-framing.mjs`.

**`sight.mjs --preset racer`** vs §2.7's table (fingerprints equal the matrix's
`1879260a`, `b0c06c2d`, `ba6f4b4d`): oracle@0 desktop 34 / 8 / 58 %, route ahead
4 / 14 / 27; oracle@0 phone 6 % 32 / 20 / 48 %, 2 / 11 / 24; `rush` desktop 35 /
4 / 60 %, 4 / 12 / 28. All nine percentages and nine quantiles equal the doc's.

**`daylight.mjs --preset phone-crowding`** vs §4.5 rule 5 (fingerprints
`78f02443`, `b055b86e`, `c200c9df`, `9e630739` equal the matrix's): `rush` s1
302 of 6,000 under 3 tiles, all `gate`; `fighter` s3 304 of 1,836 (275 in
gates); `carried` s1 2,301 of 4,384 (2,295 gate, 4 approach, 2 moving); the same
`carried` seed on desktop 16 of 6,000, all `moving`. Equal to the doc. (The doc's
"every one inside the gate 5 and 6 fights" for `rush` is not split by gate by the
tool; the by-state split `gate: 302` agrees.)

### 2b. Do the new checks bind? (entry 21: show them going red)

Each perturbation was made in a **scratch copy** of the exported tree, never in
the worktree.

| perturbation (scratch copy) | tool | result |
| --- | --- | --- |
| `CONFIG.scrollSpeed` 4.3 -> 4.31 | `lab.mjs check --every 48` | **5 of 5 MISMATCH**, exit 1, "the numbers in the doc are stale for this tree" (even the `idle` control moved) |
| `src/main.js`: `updateSpawner();` and `updateMeridianDefense();` swapped | `run-child.mjs` | exit 1: "`src/main.js update() drifted - updateMeridianDefense() missing or out of order`" |
| `src/render/camera.js` `PORTRAIT_SAFE.maxInsetPx` 46 -> 48 | `run-child.mjs` (edges guard) | exit 1: "`PORTRAIT_SAFE.maxInsetPx drifted (camera.js has 48, lab has 46)`" |
| `src/boot/run-reset.js` registry id `pace` -> `pace-renamed` | `run-child.mjs` | exit 1: "`run-reset.js registry drifted`" |
| `src/main.js` `resetGame()` loses `updateScroll(0);` | `run-child.mjs` | exit 1: "`resetGame drifted - updateScroll(0); missing`" |
| control: unperturbed export, 1 s of play | `run-child.mjs` | exit 0 |
| **blind spot (see issue 4):** the read-only counter `row.framesPinned` threshold `-0.02` -> `-3.0` in `run-child.mjs` | `lab.mjs check --every 48` | **green**, "all 5 run fingerprints reproduce" |
| same perturbation | strict per-run `faces[]` deep-equal | **red**: `faces:DIFF` on 3 of 3 runs and the group aggregate |

So the guards bind to sim drift and to a sim-constant change; `check` does not
bind to the tool's own bookkeeping (the fingerprint hashes `summary` plus per-side
`[ms, kills, hits, livesLost, fallbacks, altMax, climbUp]` only).

### 2c. Doc numbers traced to artifacts (beyond the auto-generated tables)

Matched, with the source checked: §2.1 course table and the five-viewport view
table (every cell vs `facts.json`: 73.2 / 81.3 / 99.2 / 62.6 / 19.0 tiles, RIG
29.9 / 40.4 / 14.6 / 23.4 / 26.8 px, band -9.9..18.7); §2.2-2.7 prose ranges
against M1-M7b (17.9-21.9 s, 16.4-18.6, 5.3-5.9, 0-3.3; 26-365 s; 77-85 %;
0.16-0.30 and 0.04-0.23 m/s; 14-19 lethal events; 5 / 1 tiles ahead, 45 / 54 %);
§2.7b 84/85 and 46/85; the §2.8 table (27 of 39 portrait, 0 elsewhere, the seven
first-beat bodies named); §2.8 portrait oracle numbers (547 s, 301 s, 535-542 s,
47 of 48); §4.1 (2.40 / 2.16 / 1.77 / 2.81 / 9.3 screens, 18.7 / 29.2 / 40.9 s);
§4.2 arm-on-arrival arithmetic (31.1, 9.2, 8.6, 21.6 tiles; sockets at
`HALT_S - 19 .. + 2.5`; recomputed: leftmost body 10.2 tiles inside the earlier
held view at the 6 % frame); §4.5 (62.6 x 28.3 tiles, 13.8 px per tile, 27.5 / 32
/ 41 px, 13 of 39 within 6 tiles, nearest 1.64 = gate 5 gateweaver, edge errors
1.5e-13 and 1.2e-13); §5.2 (0 violations, 9 segments, 1,584 tiles, 274 m, 7
exterior / 2 interior, 528 tiles per level, 56.1 / 87.6 / 122.7 s, 88 / 86 / 100
m); §1.2 (browser check MATCH, 1,440 ticks, page edges to 3.8e-7).
**One mismatch:** §2.8 line 593, see issue 1.

## 3. The six framing PNGs

All six were taken at `gameMs` 1,500 with RIG at x 18.17, so they are directly
comparable. `framing.json` records nominal vs painted size; the two desktop
shots are half-size renders by design (640x400 for 1280x800, 960x540 for
1920x1080), which §1.2 discloses.

| file | painted | what it shows | caption / claim | verdict |
| --- | --- | --- | --- | --- |
| `framing-phone-landscape.png` | 844x390 | shipped FAR on a landscape phone: a wide deck, RIG a tiny figure near x 462, y 193-209; RIG panel top-left, objective banner top-right, two chips and a cue line bottom-right | §2.1: 99.2 tiles, RIG 14.6 px (3.74 %), 0.89 screens | consistent: painted RIG measures **16-17 px** head to boots; 14.6 is the body-height (1.7 tile) convention the repo uses (`src/config.js`: "shipped FAR 3.7 %"); see note A |
| `framing-phone-landscape-view-mid.png` | 844x390 | the same scene at `?view=mid` | §4.5: RIG 5.0 %, 74.6 tiles | consistent: painted RIG ~23 px (body-height model 19.5 px), width 74.57 in `framing.json` |
| `framing-phone-landscape-view-near.png` | 844x390 | the same scene at `?view=near` | §4.5: RIG 7.1 %, 53.3 tiles | consistent: painted RIG ~33 px (model 27.7 px), width 53.28 |
| `framing-desktop-16x10.png` | 640x400 | FAR desktop (half size) | §2.1: 3.74 %, 29.9 px at 1280x800 | consistent: ~18 px painted at half size, so ~36 px at nominal vs 29.9 modelled |
| `framing-desktop-16x9.png` | 960x540 | FAR 16:9 (half size) | §2.1: 40.4 px at 1920x1080 | consistent. Objective banner reads "MERIDIAN HAS SE..." (ellipsis): an effect of the 960 px window, not evidence about 1080p |
| `framing-phone-portrait.png` | 390x844 | portrait: HUD panel across the top ~14 % of height, banner under it, RIG large, touch chips bottom-right | §2.1: 19.0 tiles, 26.8 px "before the 1.5x actor gain" | consistent: painted RIG ~47 px = 26.8 x 1.5 x ~1.17 |

**"view=near brackets the 6 % frame": true under the repo's convention.** Body
height / frame height is 5.0 % at `mid` and 7.1 % at `near` (`config.js`: "near
7.0%, mid 5.0%, FAR 3.7%"), and 6 % (depth 26.64, 62.6 tiles) lies between
74.6 and 53.3 tiles. In the images the figure is 1.1-1.2x taller than that
convention (note A), so by painted height `mid` is already ~5.9 %. That is a
convention question for T-107, not a defect (operator question 2 below).

**Note A, measured.** RIG's painted height in four images, by eye on 7-12x
nearest-neighbour crops with a row ruler (about +/-1.5 px): FAR 16.5 px, mid
22.9, near 33, portrait 47.5. Ratios across the three phone shots 1.39 and 2.0
against the model's 1.34 and 1.90 (depth ratios 42.75 : 31.95 : 22.5). So the
doc's px figures are internally consistent, and each is ~1.1-1.2x short of the
painted silhouette.

**Layout claims against the shots.** `hudRigPanel` x 0.012 w 0.355 y 0.018 h 0.297
and `hudObjectivePanel` x 0.609 w 0.379: the panel's right edge is at ~310 px
(36.7 %) and bottom ~122 px (31.5 %), the banner spans ~514-834 px, as drawn
in the shots. The touch deck's input surface is the bottom 46 % (`index.html`
`#touchDeck { height: 46dvh }`): true. **One caption does not match the images**
(issue 2): §4.5 rule 4 says its drawn parts are "the stick ring and the two chips
in the corners". The shots, and the CSS (`#touchStick { opacity: 0 }` at rest;
`#touchSwap { right: ... }` and `#touchPause { right: max(90px, ...) }`), show the
two chips side by side at the bottom-right and a cue line; the ring is drawn
only under a thumb.

**Judged and found nothing:** no blank frames, black voids, missing textures or
mis-registered HUD in any of the seven images (six framing shots + the smoke
shot). Style vs the concept boards and the static-anatomy rule is not in this
lane's scope: it changes no pixels, and the probe's own header says the shots are
evidence of framing, not of art. They show main at `98b12c9`, so all four phone
shots still carry the legacy touch deck that entry 20 rejected (T-101
replaces it).

## 4. Environment note for the integrator

The assignment says the `HB_*` knobs are exported by the shell profile and to
`source ~/.bashrc` if missing. In this container `source ~/.bashrc` exports
**none** of them in a non-interactive shell (the file returns at its
`[ -z "$PS1" ] && return` guard before the `HB_*` lines; even with `PS1` set my
test printed 0), while `. ~/.profile` exports all four. I exported the four
values explicitly. See issue 7.

## PROPOSED INBOX ISSUES

(LANE-BRIEF schema; I did not edit `SPRINT.md`. All are S3: none blocks merge.)

```
## I-??? | docs | S3 | repro: node tools/simlab/race/gate-view.mjs @ cb85a6f | evidence: artifacts/t104-race/gate-view.json (rows gate 4 beat 1, 3, 4; phone-portrait.tilesOutside), docs/proposals/2026-10-race-to-the-top.md:593
§2.8 says the 27 portrait bodies "sit behind the damage plane (2.99-16.99 tiles
left of the left edge)". The artifact's range is 0.49-16.99: three gate-4 bodies
(mortar-bracketpod, mortar-craterpod, wasp-diveclaw at socket x 359.5, halt 362)
are 0.49 tiles behind the edge; 2.99 is the fourth-nearest (gate 1 diveclaw). The
27 count and every other number in the paragraph are right. Same section, line
612: "at least 20 in today's FAR phone frame" is 19.98 in the artifact (rounding).
Fix: edit the two tokens.

## I-??? | docs | S3 | repro: view framing-phone-landscape.png and framing-phone-portrait.png; index.html:200-260 @ cb85a6f | evidence: docs/proposals/2026-10-race-to-the-top.md:883
§4.5 rule 4: "its drawn parts are the stick ring and the two chips in the corners".
At rest the ring is invisible (#touchStick opacity 0, shown only under a thumb)
and both chips (II, SWAP) sit side by side at the bottom-right (right 90 px and
18 px), beside a "DRAG / OUTER RAIL FIRES / TAP JUMPS" cue. The 46 %-of-height
input surface is right. The level-design consequence the rule draws is
unaffected. Fix: reword.

## I-??? | docs | S3 | repro: grep -n probe-edges tools/simlab/race/edges.mjs @ cb85a6f | evidence: tools/simlab/race/edges.mjs:21
The header comment says "tools/simlab/race/probe-edges.mjs re-measures every
viewport in Chrome". There is no such file; the tool is probe-framing.mjs (the
README and the proposal's Appendix A name it correctly).

## I-??? | bug | S3 | repro: copy the tree, change `framesPinned` threshold in tools/simlab/race/run-child.mjs:385 from `clampNow - 0.02` to `clampNow - 3.0`; node tools/simlab/race/lab.mjs check --every 48 (green) vs per-run faces[] deep-equal (red) @ cb85a6f | evidence: this file §2b
`lab.mjs check` hashes `summary` and per-side [ms, kills, hits, livesLost,
fallbacks, altMax, climbUp]. It does not cover framesForward/Idle/Pinned/
ScrollHeld (Table M5), the lookahead/routeAhead/margin histograms (M7, M7b; they
exist in baseline.json only as aggregates), `landed` (M8), yMax/aboveDeckMs,
terrain-stall or drive. A change to the tool's own bookkeeping therefore leaves
`check` green and the doc's M5/M7/M7b/M8 numbers silently different. Appendix A
and the lab.mjs header say a mismatch means "stale" (true) and imply a match
means "reproduced" (not true for those columns). The numbers DO reproduce today
(strict per-run/per-group comparison on 7 groups, §2). Fix direction: fingerprint
v2 over faces[], hist and landed (regenerate baseline.json), or at minimum add
the limit to the README's honesty list. Entry 21: a check that only half binds.

## I-??? | docs | S3 | repro: tools/simlab/README.md:110; docs/proposals/2026-10-race-to-the-top.md:197 | evidence: this file §2 (29 runs in 430 s on 2 jobs, load 31-47)
README quotes "232 runs; 1572 s wall on 2 jobs at load ~35"; the proposal's own
second pass took 3,847 s; I measured 14.8 s of wall per run on 2 jobs (29 runs,
430 s), i.e. about 57 min for 232 at similar load. Quote the range and say it
scales with load; `check --every 8` is about 7 min.

## I-??? | docs | S3 | repro: read docs/proposals/2026-10-race-to-the-top.md:175-203 and tools/simlab/README.md honesty item 3 | evidence: artifacts/t104-race/browser-check-640x400.json
§1.2's bold lead-in "The whole sim path, frame-exact" is wider than the evidence:
one open-loop 24 s schedule (side 1 up to the start of gate 1, one wasp wave),
640x400. The README's item 3 states this correctly and §1.3 item 5 says closed-loop
policies cannot be replayed in Chrome; the lead-in should say "the sim path
through the first 24 s". The later gates run the same imported sim modules, so
the exposure is the 15-call update() transcription, which the drift guards pin
(bind-tested above), not the modules.

## I-??? | bug | S3 | repro: env -i HOME=$HOME PATH=$PATH bash -c 'source ~/.bashrc; env | grep -c ^HB_' (prints 0); same with '. ~/.profile' (prints 4) | evidence: tools/orch/cloud-setup.sh:36-46, ~/.bashrc:5,105-108
cloud-setup.sh appends the HB_* exports to ~/.bashrc AFTER Debian's
`[ -z "$PS1" ] && return` guard and prints "source ~/.bashrc for the env knobs".
Agent shells are non-interactive, so sourcing .bashrc exports none of them;
the harness then runs on its 1x budgets (8 s boot) and a SwiftShader boot reads as
a spurious bootError, which the playtest README says looks exactly like a real
regression. ~/.profile does export them. Fix: append before the guard (or to a
file both startup paths source) and print `. ~/.profile`.

## I-??? | docs | S3 | repro: parse docs/proposals/2026-10-race-to-the-top.md task blocks against SPRINT.md "Task schema" | evidence: proposal lines 1292, 1432, 1620
T-201 is typed `bug`, which is not in the SPRINT task-type list (feature |
investigation | lattice | harness | docs | art | juice | audio | shell | assets |
render; `bug` is an issue type). T-205 and T-207 write `accept (...):` instead of
`accept:`, so a literal field match misses the box list. All eleven blocks are
otherwise complete (goal, accept boxes, owner in .claude/agents, fences, verify,
status todo). Fix at dispatch.
```

Integrator notes, not issues: (a) the proposal's §9 issue 4 (pathcheck
`result.json` shared path) was already fixed on main by `e29665b`: drop it from
triage; (b) decisions entry 23 (`33ab36f`) answers the proposal's §8 questions
(its four answers cover Q1, Q2, Q3 and Q4+Q5), so §8 is superseded and the doc's
§5.5/§7 wording may want reconciling with the verdicts; (c)
`tools/orch/merge-task.sh:114` pins the smoke
worktree with `python3 -m http.server`, not `tools/serve.mjs` (the playtest
README's cache-header hazard); harmless if the harness's browser profile is fresh,
which I did not verify.

## Questions for the operator checkpoint queue (not judged here)

1. In "RIG about 6 % of screen height" (entry 20 addendum), is the 6 % RIG's body
   height (1.7 tiles, what `config.js` and the proposal use) or the painted
   figure, which is 1.1-1.2x taller in the shots? It decides whether `?view=mid`
   (5.0 % body, ~5.9 % painted) is already the frame meant. Context:
   `artifacts/t104-race/framing-phone-landscape-view-mid.png` and
   `framing-phone-landscape-view-near.png`.
2. Looking at `framing-phone-landscape.png` (today's FAR on a 844x390 phone),
   how quickly can you find RIG, and what would you want to be able to read at
   that size?

## How to reproduce this gate

Commands are in §1b and §2. The two scratch drivers used for the strict
comparisons (`strict-check.mjs`: per-run and per-group deep equality via the
lab's own exported `compactRun` / `aggregate`; `replica-vs-committed-browser.mjs`:
the replica half of `browser-check.mjs` against the committed Chrome state) are in
the scratch directory named at the top and are not part of the repo; issue 4's fix
would make the first redundant.
