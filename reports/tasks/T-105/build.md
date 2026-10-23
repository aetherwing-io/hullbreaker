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

### 5. Safe areas (notch L/R 47, home indicator 21) — DONE
`--only safe`: CDP `Emulation.setSafeAreaInsetsOverride` (left/right 47 px,
bottom 21 px — the page's `env()` reads them; `insets:cdp` in the log) and the
whole nine-screen walk again at each landscape size. Every visible text box
must fit the viewport MINUS the insets, and every named HUD / deck box and
every overlay control must sit inside them.

| view | main | branch |
|---|---|---|
| 844x390 | 15 pass / **13 fail**; inside the insets: title (headline and tagline from x 42.2, under the 47 px notch), game over (title from y -12.7, off the top; body to y 402.7, past the bottom of a 390 px screen), summit (title under the notch; its R / Q line at y 359-372, on the home indicator) | **28 / 0** |
| 932x430 | 17 / **11**; title foot to y 410.7 and summit panel to 410.3 (home indicator from 409), game-over body to 424.7 | **28 / 0** |
| 667x375 | 10 / **18**; title, pause panel (x 36.8), game over (y -20.2 .. 395.2), summit (y -10.4 .. 392.9), failsafe panel (x 26.7 .. 640.3) | **28 / 0** |

The rest of main's failures there are the copy and overlap defects of boxes
2-3. Falsification: main itself — the same audit and walk, one change of
tree. The insets reach CSS as `env(safe-area-inset-*)` through the
`--hud-safe-*` variables, combined with each element's own margin (`max()`
or `calc()`), for the HUD, the title text and foot, the overlay column, the
failsafe panel and (T-101's) deck.

### 6. Preloads — ⟨pending: branch⟩
Main, both a landscape phone and desktop: the four world textures are each
requested **twice** (`backdrop-meridian-anatomy-v1.webp x2`,
`meridian-foreground-pack-v1.webp x2`, `backdrop-meridian-coils-v3.webp x2`,
`meridian-component-atlas-v1.webp x2`) with Chrome's "A preload for ... is
found, but is not used because the request credentials mode does not match"
for each. Cause: `THREE.TextureLoader` requests in CORS mode; the preloads
were no-cors.

### 7. Watchdog: a slow first draw is not "stuck"; a stall in play still is — DONE
The change: until the loop has drawn 3 frames, the freeze limit is 10 s
measured from the later of boot, visibility and the last frame; after
that, the unchanged 4 s rule. Same hard "got stuck" panel either way.

**Shipped code, fake clock** (`tools/pathcheck/t-105-phone-shell.mjs` runs the
real inline bootstrap from `index.html`): a 6 s frame stall with 0, 1 or 2
frames drawn shows no panel; the SAME 6 s stall after 40 frames shows "got
stuck" 4-5 s in; a loop dead from boot gets the panel 10-11 s after it went
quiet. These went red under the domain's watchdog mutations (warm-up 0 on
both sides, warm-up beats 2 inline, warm-up blinding the panel, the inline
verdict ignoring the last frame, the 4 s rule dead after warm-up, a `>=` /
`>` drift between the two copies) — see "The new checks".

**Browser** (`--only watchdog`, 844x390): animation frames withheld while the
page's timers run, armed synchronously inside the bootstrap's own `booted()`
/ `beat()`. A panel that shows decides a trial; NO panel counts only if the
page's own timers kept running through the stall (otherwise UNDECIDED — see
the README's honesty note 3).

| trial | main `08e5db1` | branch |
|---|---|---|
| 6 s stall from boot, 0 frames | **"got stuck" 1161 ms into the stall** (earlier runs: 993, 1237 ms) | **no panel**, frames resume (timers ran: longest quiet 459 ms) |
| 6 s stall after warm-up, PLAYING | ⟨wd2-base⟩ | **"got stuck" 5609 ms in** |
| 10 s stall after warm-up, PLAYING | ⟨wd2-base⟩ | **"got stuck" 7133 ms in** |
| loop dead from boot (held 25 s) | ⟨wd2-base⟩ | **"got stuck" 10801 ms in** — reported, just later |
| 6 s stall after frame 1 | ⟨wd2-base⟩ | UNDECIDED: the first draw blocked every page timer for the whole 6 s (SwiftShader) |
| 6 s busy-wait, from boot / in play (reported) | ⟨wd2-base⟩ | no panel either way — the bootstrap's pre-T-105 `slept` rule |
| natural boot at DPR 3, 25 s (reported) | ⟨wd2-base⟩ | no panel; 5 frames, worst gap 32.4 s (after frame 1) |

Falsified in the browser: `--mutate watchdog-no-warmup` ⟨mut⟩.

The DPR-3 question from the dispatch ("DPR 3 trips the freeze watchdog under
SwiftShader"): in these runs neither tree raised the panel within a natural
25 s DPR-3 boot (branch: 5 frames, 32.4 s between frames 1 and 2; main:
⟨wd2-base natural⟩). On this host a first draw blocks the page's own timers
(measured at DPR 1: the "after frame 1" trial saw no page timer run for the
whole 6 s), and the bootstrap reads a tick more than 3 s late as a suspended
page. A first draw that is slow WITHOUT blocking the page — a phone GPU
compiling shaders — is the case the warm-up is for, and it is what the
"6 s from boot" trial reproduces (main: panel; branch: none). A loop that
still delivers a frame only every 16+ s after its first 3 gets the 4 s rule,
unchanged.

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
`--mutate objective-nowrap` (main's one-line ellipsis put back into the
landscape slot) → 48 pass / **6 fail**: both long lines cut at 667, 844 and
932 (e.g. 311.2 px of text in a 197 px slot at 667).

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

## What changed, and why

| surface | change | files |
|---|---|---|
| words on every screen | One table of what each screen says, per input mode (`src/pure/shell-copy.js`). Under the two-thumb deck (the only scheme with a tap out of every screen) the title says TAP TO START and shows the two thumbs; the pause / death / summit / route-lost screens print NO instruction line of their own — the deck's `#thumbModal` cue (TAP TO RESUME / TAP TO CLIMB AGAIN) is the one instruction; the panel's R / Q / H legend becomes RESTART RUN / START SCREEN / HIDE HUD buttons that press that key on the player's behalf (one lifecycle path: `src/main.js`'s keydown handler and `src/pure/shell.js`'s intent table); the HUD's swap hint drops its "C". Keyboard / `?touch=0` / `?touch=legacy` keep today's words byte-for-byte. | `src/pure/shell-copy.js` (new), `src/ui/{shell,overlay,hud}.js` |
| failsafe panel | The hint says "Tap the button to play again." wherever a touch deck would install (an inline copy of the rule, so it works with every module dead); padding keeps the panel inside the notch / home-indicator insets. | `index.html` (inline bootstrap, `#fail` CSS) |
| freeze watchdog | Before the loop has drawn 3 frames the stall limit is 10 s (timed from the later of boot, visibility and the last beat), not 4 s; after that, the 4 s rule as before. Same hard "got stuck" panel either way: a first-draw stall of up to 10 s is tolerated, a loop that is dead during boot is still reported. Policy in `src/pure/failsafe.js` (`warmBeats`, `warmStallMs`, `freezeVerdict`), mirrored inline. | `src/pure/failsafe.js`, `index.html` |
| landscape HUD | One top band that ends above the central 60% x 60%: RIG's instrument as a 4-column / 2-row strip (hull + lives + overdrive, then the weapon across the strip, ascent + rush on the right), the objective top-right (wraps instead of an ellipsis), the Crown finale banner in the objective's slot, the 1-2 s loot card (and the gilded toast) in the lane between. The deck's PAUSE / AUTO chips sit under the right slot (`--thumb-top-reserve: 66px` in landscape; 48 before). Sized from the viewport and the safe insets only. | `index.html`, `src/ui/{loot,gilded}.js` |
| portrait HUD | The same strip, full width at the top; the objective under it; the finale banner in the objective's slot (main drew it over the ascent metrics). | `index.html` |
| desktop HUD | The objective line wraps instead of losing its end to an ellipsis (T-102's 47-character gate line); at 1280 px every measured line still renders on one line. | `index.html` |
| state screens on a short glass | One compact column above the deck's cue, inside the insets; the title's portrait headline no longer clips (9.4vw, tighter tracking). | `index.html` |
| preloads | `crossorigin` on the four texture preloads — `THREE.TextureLoader` requests in CORS mode, so a no-cors preload was never reused: each was fetched twice. The CSS-background title art keeps its no-cors preload. | `index.html` |
| home-screen play | Web app manifest (landscape, fullscreen with standalone fallback, relative `start_url`/`scope` so a subpath deploy works), `apple-mobile-web-app-capable`, `black-translucent` status bar, title, theme colour, `apple-touch-icon` (180, opaque). Icons are square crops of the title key art, reproducible byte-for-byte by `tools/assets/make-app-icons.py --check`. | `index.html`, `assets/generated/ui/app/*`, `tools/assets/make-app-icons.py` |
| audio | iOS's own fourth context state, `interrupted` (a call, Siri, an app switch), is treated as resumable, so the next tap — inside its touch END, where T-101's unlock already runs — brings sound back. | `src/ui/audio.js` |
| deck follow-ups (T-101 review) | (1) `releaseAll()` puts out every `[data-chip]`'s lit `.down`; (2) the leave-PLAYING release is now proved, with a mutation; (3) a primary touch `pointerdown` releases slots whose lift and cancel were both lost, checked before the duplicate-delivery guard (covers a reused `pointerId`); (4) the exact sector-width pin is removed, N/S-narrowest stays. | `src/ui/touch-controls.js`, `tools/playtest/touch-proof.mjs`, `tools/pathcheck/touch-deck-contract.mjs` |
| checks | `tools/pathcheck/t-105-phone-shell.mjs` (28 assertions; runs the REAL inline bootstrap against a fake clock), `tools/playtest/phone-shell.mjs` (the browser matrix), README sections for both browser tools. | `tools/...` |

**Design notes that are judgment calls, not measurements** (the look is the
operator's): the RIG strip keeps every instrument the old panel had (hull,
lives, weapon, overdrive, the three ascent metrics, rush) but drops the
"RIG // VITALS" and "ASCENT" captions and the second-weapon line on phones;
the strip is ~42 px tall in every state because the weapon has its own row;
the loot card hides the objective / Crown banner for its 1.25-1.9 s;
portrait uses the same strip (≈7.5% of the screen with the objective,
measured at 390x844).

## The new checks

**`tools/pathcheck/t-105-phone-shell.mjs` — 28 assertions.** Its core runs the
REAL inline bootstrap from `index.html` against a fake clock and a stub DOM —
nothing re-implemented — so the watchdog and the failsafe hint are tested as
shipped: a 6 s frame stall with 0, 1 or 2 frames drawn shows no panel; the
same stall after 40 frames shows "got stuck" 4-5 s in; a sub-4 s stall and a
hidden page never panel; a loop that dies with 0, 1 or 2 frames drawn still
gets the hard panel 10-11 s after going quiet; the real bootstrap paints the
touch hint on touch hardware / a coarse pointer / `?touch=1` and the key hint
on a desktop and under `?touch=0`. Also: the inline `freezeVerdict` equals
`src/pure/failsafe.js`'s over 4,972 states (4,000 seeded + every threshold at
-1 / 0 / +1 ms); the inline hint rule equals `src/pure/shell-copy.js` and
`resolveTouchScheme` over 20 cases; the copy scan finds every keyboard
instruction the game prints and nothing in any touch string or in game
vocabulary; every touch button presses the key whose intent it names in that
state and none repeats the modal tap's verb; the keyboard copy is
byte-identical to main; the manifest launches the game page (relative, so a
subpath deploy works), every icon is a PNG at its declared size, the touch
icon is an opaque 180x180; every image preload matches its consumer's
request mode. **Falsified: 23 single-edit mutations in a scratch copy, every
one red, control and restore 28/0**
(`reports/tasks/T-105/evidence/falsify-pathcheck.txt`). One of them first
stayed GREEN — a `>=` → `>` drift between the two watchdog copies hides from
random states — which is why the boundary sweep exists.

**`tools/playtest/phone-shell.mjs`** — the browser matrix behind boxes 1-11
(README section added). Audit rules worth knowing: clipping by `clip-path`
and `contain: paint` counts (every HUD panel is a `clip-path` polygon, so an
overflow-only check would have passed clipped HUD text); overlap is judged
on line boxes with a font-relative tolerance (the content-area rects of a
50 px rank letter at `line-height: .9` "overlap" its caption with nothing
on screen — the WIP's first run flagged exactly that). Falsification runs:
see "Falsification of the browser checks".

**`tools/playtest/touch-proof.mjs`** — `followUps()` and three mutations (above).

## iOS Safari: what was designed for, and what this host cannot verify

No WebKit here: every browser number above is Chromium 141 with `isMobile` +
`hasTouch` + an iOS user agent (which changes nothing — the game reads no UA).

| iOS behaviour | what the branch does | evidence available here |
|---|---|---|
| home-screen launch | manifest + `apple-mobile-web-app-capable` + `black-translucent` status bar + title + 180 px opaque touch icon; `viewport-fit=cover`; every box keeps to the insets | Chromium parses the manifest (box 8); iOS reads the meta tags, not the manifest's `display`/`orientation` — device check |
| notch on a side, home indicator at the bottom | every HUD box, control and overlay inside `env(safe-area-inset-*)` (via the `--hud-safe-*` vars) | CDP `setSafeAreaInsetsOverride` 47/47/21 (box 5); WebKit's own insets — device check |
| audio needs a touch END | T-101's `pointerup`/`touchend` unlock + `interrupted` treated as resumable | iOS's rule emulated in Chromium (box 10) — device check |
| no Impact font | display text falls back; this host's fallback (DejaVu) is WIDER than iOS's, so fit margins measured here are pessimistic for the display face | — |
| slow first shader compile | the warm-up limit (box 7) | SwiftShader is not a phone GPU — device check (questions 1, 5) |
