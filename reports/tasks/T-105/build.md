# T-105 build report — the phone shell

Lane T-105, worktree `/home/user/hullbreaker/.claude/worktrees/T-105`, branch
`task/T-105`, rebased onto main `08e5db1` (main moved there after dispatch:
docs and a gate artifact only). Resumed from the killed agent's uncommitted
work, which the integrator snapshotted as `0cd186f`; that snapshot is the
first commit on the branch (`b541ebf` after the rebase), and everything after
it was written, run and measured in this session. Not merged. Tree clean at
hand-off.

**Evidence standard (decisions.md entry 21).** No box below rests on "pathcheck
is green". Each one is a measurement of what a player sees, taken on main
(`08e5db1`, served from a `git archive` export; "base") and on this branch with
the SAME tool, and every new check was shown red on the defect it guards.
Every number traces to a run made in this session on this host: Chromium 141
under SwiftShader, 4 cores shared with ~7 other lanes, load average 30-69
throughout, boots of 22-67 s, and a disk that ran down to 69 MB free twice.
Nothing is inherited from the WIP, which had never been run.

## Headline

| | main `08e5db1` | this branch |
|---|---|---|
| 9 screens x 5 views, DOM audit + copy scan (DPR 2, `hasTouch`, iOS UA on phones) | **54 pass / 49 fail** (844x390: 15, 932x430: 11, 667x375: 14, 390x844: 9, 1280x720: 0) | **103 pass / 0 fail** |
| keyboard-only copy on a touch device | title, pause, game over, victory and failsafe at every phone size, plus the swap hint's "C" in portrait | none, at every phone size |
| text that does not fit | portrait title 450 px of "HULLBREAKER" in 390 px (read "HULLBREAK"); the deck's TAP TO CLIMB AGAIN painted over the death copy (844, 667) and over the summit's key line (844, 932, 667); the loot card and the Crown banner painted over the RIG panel (all landscape sizes, and the banner in portrait); the shipped 43-char hull-fallback line cut at 667 | none |
| landscape HUD at 844x390 — play / finale | **13.88% / 24.98%** of the screen; the RIG panel (300x116 px) inside the central 60% x 60% in every state | **6.47% / 9.08%**; nothing in the central region in any state at any landscape size |
| gate line ≤ 28 chars at 667x375 / 1100x700 | one line (8 px font at 667) | one line (10 px font at 667; 11.6 px to spare) |
| today's 47-char gate line at 667x375 / 1100x700 | cut (265.9 px in 237; 398.8 px in 366) | wraps to two lines, never cut, at every size measured |
| texture preloads | each of 4 fetched **twice**, 4 "not used" console warnings | ⟨pending⟩ |
| 6 s frame stall before the first frames | **"The game got stuck"** 1.2 s into the stall (the 4 s rule counted from script start) | ⟨pending⟩ |
| home-screen play | no manifest, no iOS meta, no touch icon | manifest (landscape, fullscreen → standalone), 4 icons, iOS meta, 180 px touch icon |
| desktop 1280x720 title / play / pause | — | **0 differences** (every named box, every text box, the visible copy) |
| smoke (gate command + `smoke-verdict`) | — | mid-route **PASS** attempt 1 (`not-completed deaths=0 tick=594/594`); transform-slice **PASS** attempt 1 (`completed deaths=0 tick=938/1104`) |
| pathcheck, full tier | — | **4425 passed, 0 failed** (322 s; the 4 browser-probe assertions skipped by the host env) |

## Acceptance, box by box (SPRINT `## T-105`)

Tool: `tools/playtest/phone-shell.mjs` (new; README section in
`tools/playtest/README.md`). Views: `l844` 844x390, `l932` 932x430, `l667`
667x375, `p390` 390x844 (all `hasTouch`, `isMobile`, iOS 17.5 Safari UA,
DPR 2), `d1280` 1280x720 and `d1100` 1100x700 (desktop, no touch, DPR 1).
"Base" = main `08e5db1` from a `git archive` export; "branch" = this tree.

### 1. Before/after capture matrix — DONE
Nine screens per view — title, play HUD, a capsule pickup (the loot card held
at its readable phase), a death, pause/options, game over, the Crown finale,
the summit (victory), the failsafe panel (forced) — at all four phone views,
plus desktop, on base and branch. States a player reaches only after minutes
of play are entered through the game's own modules (labelled TEST SETUP in
the tool); start / pause / resume / restart are performed with real CDP
touches on phones and keys on desktop. 90 captures (45 per tree) were taken;
the committed subset is listed under "Captures".

### 2. No clipped or overflowing text — DONE (fails on main's portrait title)
The DOM audit holds every visible text box (and pseudo-element text) to:
inside every ancestor that clips it (overflow, `clip-path` — every HUD
instrument panel is a chamfered polygon — and `contain: paint`), inside the
viewport minus the safe area, no ellipsis or line clamp cutting it, and not
painted over another text (line boxes, 15% of the larger font as vertical
tolerance). Main's portrait title fails it: `#shellText > h1 "HULLBREAKER":
clipped (overflow) by #shell (text 23.4..473.3 ... box 0.0..390.0)`. Branch:
0 failures on 45 screen audits. Falsified: `--mutate title-wide` (the old
13vw / .115em headline) turns exactly the portrait title red with the same
450 px.

### 3. No keyboard-only copy on a touch device — DONE (fails on main)
`keyboardCopyHits` (`src/pure/shell-copy.js`) scans the visible text and
pseudo-element text of every screen. Main, touch: `"PRESS", "KEY", "WASD",
"ARROWS", "SPACE", "ESC", "J / X", "P / ESC"` on the title; `"ESC", "P / ESC",
"R", "Q", "H"` on pause; `"R", "Q", "r"` on game over; `"R", "Q"` on victory;
`"Press", "click"` on the failsafe panel; `"C"` (swap) in portrait. Branch,
touch: zero hits on every screen at every phone view. Desktop still shows the
keys on title / pause / game over (asserted: the scan must FIND them there).
Falsified: `--mutate copy-keys-on-touch` turns title, pause, game over and
victory red; `--mutate failsafe-hint-keys` turns the failsafe panel red.

### 4. Landscape HUD budget — DONE
HUD panel bounding boxes, area as a share of the viewport, and intersection
with the central 60% x 60% (x 20-80%, y 20-80%):

| view | state | main | branch |
|---|---|---|---|
| 844x390 | play | 13.88% — RIG 300x116 + objective 320x34; **central** | **6.47%** — strip 360x42.3 + objective 270x22.5 |
| 844x390 | death (a 2-line objective) | 13.88%, central | 7.42% |
| 844x390 | Crown finale | 24.98%, central | **9.08%** — strip + banner 303.8x48.3 |
| 844x390 | loot card (1.25-1.9 s) | 21.35%, central | 9.93% — strip + card 280x62.3 |
| 932x430 | play / finale / loot | 11.40 / 17.81 / 17.53%, central | 5.47 / 7.66 / 8.15% |
| 667x375 | play / finale / loot | 14.58 / 25.75 / 24.41%, central | 7.67 / **11.58 / 12.72%** |

On the branch no HUD panel touches the central region in any state at any
landscape size. The box's 10% is held at 844x390 for play AND the finale
(the whole Crown fight); at 667x375 the finale and the loot card go over 10%
(reported, not gated: the box names 844x390). Every size comes from the
viewport and the safe insets, never from RIG.

### 5. Safe areas — ⟨pending: notch walks⟩

### 6. Preloads — ⟨pending: branch⟩
Main, both a landscape phone and desktop: the four world textures are each
requested **twice** (`backdrop-meridian-anatomy-v1.webp x2`,
`meridian-foreground-pack-v1.webp x2`, `backdrop-meridian-coils-v3.webp x2`,
`meridian-component-atlas-v1.webp x2`) with Chrome's "A preload for ... is
found, but is not used because the request credentials mode does not match"
for each. Cause: `THREE.TextureLoader` requests in CORS mode; the preloads
were no-cors.

### 7. Watchdog — ⟨pending⟩

### 8. Home-screen play — ⟨pending: manifest section⟩

### 9. Rotation mid-run — ⟨pending⟩

### 10. First touch resumes audio on iOS — ⟨pending⟩

### 11. Desktop 1280x720 title / HUD / pause unchanged — DONE: 0 differences
`node phone-shell.mjs --compare <base> <branch>` over the 1280x720 title,
play and pause audits: every named box rect, every text box (element, text,
font size, rect) and the full visible copy — 9 / 21 / 24 text boxes, copy
strings of 191 / 273 / 356 characters — are identical. What did change on
desktop, none of it visible at 1280x720: the objective line may wrap instead
of ellipsizing (every string measured fits one line at 1280; the 47-char
one is 398.8 px in a 400 px slot); `#shellText` / `#shellFoot` / `#fail`
take `max(<old>, safe inset + margin)` (the insets are 0 on desktop); the
four texture preloads gained `crossorigin`; the head gained the manifest
and iOS tags.

### 12. pathcheck + smoke — DONE
- Full tier at `d3b0715` (the final game code; later commits touch only the
  browser tool and its README): **4425 passed, 0 failed** (322 s). The host
  env skips the 4 render-submission browser-probe assertions.
- Label diff, fast tier, same env, base vs branch (`tools/pathcheck-labels.mjs`):
  base 4097 labels, branch 4130, 0 FAIL on either side. **Removed: 1** — the
  T-101 exact sector-width pin (follow-up 4, below). **Added: 34** — the 28
  assertions of the new domain `tools/pathcheck/t-105-phone-shell.mjs` and 6
  existing per-file layer guards that now also cover the new
  `src/pure/shell-copy.js` (T-049 x2, T-051 x3, legibility x1).
- Smoke, exactly as `tools/orch/merge-task.sh` runs it (`run.mjs --deterministic
  --max-runtime-ms <15000|20000> --viewport 480x300`, judged by
  `tools/orch/smoke-verdict.mjs`): `mid-route.json` **PASS** on attempt 1
  (`outcome=not-completed deaths=0 tick=594/594`), `transform-slice.json`
  **PASS** on attempt 1 (`outcome=completed deaths=0 tick=938/1104`).

### 13. Operator packet — below.

## The integrator's additions

**One instruction, not two (the `#thumbModal` reconciliation).** Under the
two-thumb deck the pause / death / summit / route-lost screens print no key
line of their own: the deck's cue (TAP TO RESUME / TAP TO CLIMB AGAIN /
TAP TO RETRY) is the instruction, and the panel's R / Q / H legend becomes
RESTART RUN / START SCREEN / HIDE HUD buttons (44 px tall, measured) that
press that key on the player's behalf — `src/main.js`'s keydown handler and
`src/pure/shell.js`'s intent table stay the one lifecycle path, and the
deck's modal tap ignores buttons, so a button never also resumes or
restarts. No touch button repeats the modal tap's verb (asserted). On
keyboard / `?touch=0` / `?touch=legacy` every word is byte-identical to
main. Measured: main painted TAP TO CLIMB AGAIN over GET BACK UP THERE.
(162.8 x 10.7 px at 844x390) and clipped "r to climb again"; the branch has
no overlap on any screen.

**The bot harness.** `tools/playtest/lib/sampler.mjs` records `#ovBody` as raw
trace text and classifies outcomes on `#ovTitle` only (`isVictorySample`);
no harness file compares body copy. Titles are unchanged (pathcheck T-013
still asserts all six). Bot runs use no touch hardware, so their overlay is
byte-identical to main. **No sampler expectation needed changing**, and none
was changed.

**The four touch-deck follow-ups (T-101 review), each proved red-then-green
in the real browser** (`tools/playtest/touch-proof.mjs --only frozen --views
landscape`: control **42/42**, T-101's 38 plus 4 new trials):

| # | finding | change | proof (mutation → result) |
|---|---|---|---|
| 1 | a chip's `.down` stays lit after a lifecycle release | `releaseAll()` clears `.down` on every `[data-chip]` (cached once, no allocation) | `chip-stays-lit` → 41/1: the chip-look trial (`lit before ["thumbSwap"], after blur ["thumbSwap"]`) |
| 2 | the leave-PLAYING release is asserted by nothing | new trial: stick + FIRE + JUMP held, then PAUSED (by the P key) and GAME_OVER — everything released, still released after resume and lift | `ignore-leave-playing` → 40/2: both trials (`held ["ArrowRight","Space","KeyX"]` through the pause and the death) |
| 3 | a lost pointerup holds JUMP / FIRE until a lifecycle event | a PRIMARY touch `pointerdown` releases any live slot (by definition its finger is gone), checked before the duplicate-delivery guard so a reused `pointerId` is covered too | `no-stale-release` → 41/1: JUMP stayed held through the next touch, its steering and its lift |
| 4 | `touch-deck-contract.mjs:58` pins the sector widths exactly | the pin is removed; the reasoned invariant (N/S narrowest) is the next assertion and stays | label diff: exactly that one label removed |

**The gate line.** T-201 rewrites what it says; this lane made the slot fit.
Landscape phones: the objective sits top right, 10 px, and WRAPS instead of
an ellipsis; desktop wraps too. Measured (`--only gateline`): 28 characters
(28 x "W" and three real shapes) on ONE line at 667x375 (185.4 px in a 197 px
slot), 1100x700, 844x390, 932x430, 390x844 and 1280x720; T-102's
47-character line and the shipped 43-character hull-fallback line are never
cut (two lines at 667 / 844 / 932 / 1100) and the panel ends at y 40, above
the deck's chips (72) and the central region. Main cut the 47-char line at
667x375 and 1100x700 and the 43-char one at 667x375. Falsified:
`--mutate objective-nowrap` ⟨pending⟩.

**The HUD sized from the viewport, never from RIG** — see box 4. T-107's
closer phone camera changes nothing here: every HUD size is `vw` / px /
safe-inset arithmetic.

**README / ENGINEERING** — exact lines below.

## Legacy assertions changed (decisions.md entry 21)

| assertion | change | reason |
|---|---|---|
| `tools/pathcheck/touch-deck-contract.mjs` "T-101: E/W 50°, N/S 35°, diagonals 47.5° (CONFIG.touch.stick)" | **removed** | pins numbers its own author called "reasoned, not tuned against a thumb" that the operator is expected to retune on a phone; it would go red on the first feel edit with nothing player-visible broken (T-101 review finding 4). The reasoned invariant — the run-stopping N/S sectors are the narrowest — is the next assertion and stays, as do the tiling and quarter-degree sweep checks. |

Nothing else in pathcheck, the playtest harness or any gate was weakened,
removed or rewritten. T-032's assertions still pass unchanged (the keyboard
hint still names R and the button; the inline `WATCH` numbers still mirror
the policy).
