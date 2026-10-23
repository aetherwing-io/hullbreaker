# T-101 build report — the two-thumb touch deck

Lane T-101, worktree `/home/user/hullbreaker/.claude/worktrees/T-101`, branch
`task/T-101` (base `98b12c9`). Not merged. Tree clean at hand-off.

**Headline, from the touch proofs (not from pathcheck — decisions.md entry 21):**
real multi-touch input (CDP `Input.dispatchTouchEvent`, several simultaneous
pointers) drove the shipped default run at 844x390 landscape and 390x844
portrait. Stick-right + JUMP kept the full run speed into the jump; a held JUMP
reached 2.607 tiles against 1.014 for a tap; a second JUMP press
in the air spent the air jump; stick up-right + FIRE put bullets up-right; stick
down + JUMP on the first catwalk dropped through it; three fingers pressed and
released in all 36 orders left exactly the right keys held after every one of
216 steps, in both orientations; pointercancel, blur, visibilitychange and an
orientation flip each released everything. The ledger, cancel, blur,
jump-height, aim and drop-through checks were then each shown RED by a
one-line defect served into the page (§2); the visibility and orientation
releases were not mutated in the browser (the orientationchange/pagehide
listeners are also guarded statically, falsified in §3; visibilitychange is
not).

| evidence | result |
|---|---|
| touch proof, input layer (frozen sim), per orientation | **38/38** landscape, **38/38** portrait |
| touch proof, live movement (final hold drive), per orientation | **7/7** landscape, **7/7** portrait |
| title tap / `?touch=legacy` | 4/4 / 4/4 (legacy re-run with the draw skipped; see below) |
| browser falsification | 6 mutations, each turned exactly its own checks red |
| pathcheck falsification | 14 mutations of the new domain, each red; control and restore 46/0 |
| smoke (main's harness + `smoke-verdict.mjs`) | mid-route **PASS**, transform-slice **PASS** |
| pathcheck | before 3989/0 (20:21); after **4037/4**. Label diff run back to back: the BASE commit also fails exactly those 4 perf-probe assertions on this host now; the branch removes or flips nothing and adds 52 passing labels (46 new + 6 existing per-file guards covering the new pure file) — §3 |

---

## What changed, and why

**Scheme** (landscape first, iPhone Safari first — entry 20 addendum). Ships ON
by default on touch hardware (entry 16/20 integrator call); `?touch=legacy`
restores the rejected scheme.

| surface | behaviour | where |
|---|---|---|
| LEFT 45% of the glass | floating stick spawns under the thumb; move left/right + 8-way aim, emitted as ArrowLeft/Right/Up/Down key edges | `src/ui/touch-controls.js`; pure half `src/pure/touch-stick.js` |
| dead zone | engages past 24% of the rim (14 px on a 390 px phone); drops to neutral only under 16% | `CONFIG.touch.stick.engage/release` |
| 8 sectors | E/W 50°, N/S 35°, diagonals 47.5°; a held sector survives until the thumb is 9° past its edge. N/S are narrowest because a pure-vertical sector zeroes RIG's run input (h = 0 in `updatePlayer`) — momentum is pillar 1 | `horizontalHalfDeg/verticalHalfDeg/hysteresisDeg` |
| rim follow | past the rim the anchor is dragged after the thumb, so a reversal never needs the long trip back | `follow` |
| left-edge gutter | no stick spawns in the outermost 20 px: iOS Safari owns that swipe (browser back) | `layout.edgeGutter` |
| held-sector cue | the held sector is lit on the stick rim at its true width (first capture showed a chevron hidden under the nub) | `#thumbStick::after` |
| JUMP | big circle, bottom-right; keydown on press, keyup on lift — variable height, the air jump, and down+JUMP drop-through are the keyboard's own semantics because they are the keyboard's edges | |
| FIRE | beside JUMP on the right thumb's arc; held = continuous fire | |
| one-thumb jump-while-firing | everything a right-hand finger touches stays held until it lifts (roll FIRE→JUMP); a thin lens between the two hit circles presses both on landing; sliding ONTO a button needs its visual face (no brushing JUMP while rocking on FIRE) | `hitSlop` 1.25, `slideSlop` 1.0 |
| SWAP | chip up-left of FIRE (landscape) / above JUMP (portrait): a deliberate reach | |
| PAUSE, AUTO | chips top-right under the HUD; act on lift, only if the finger is still on them | |
| sizes | every target from the SHORT side, inside `env(safe-area-inset-*)`: at 844x390 JUMP 86 px, FIRE 74 px, chips 45 px (44 px HIG floor), stick rim 58.5 px. The deck is sized from the screen, never from RIG, so T-107's closer phone camera needs no deck change; the right-thumb cluster's box is published (`__HB_TOUCH().layout.cluster`, top at 67% of a 390 px height) for that lane to frame around | `CONFIG.touch.layout`, `touchDeckLayout` |
| ownership | codes are reference-counted per owner (stick, each finger, auto-fire): lifting one finger releases only its codes; a new finger on JUMP is a fresh press (air jump), like K while Space is held | |
| releases | pointercancel (per pointer, plus `lostpointercapture`), window blur, visibilitychange→hidden, pagehide, orientationchange / `screen.orientation` change / a resize that flips orientation, and leaving PLAYING | |
| browser gestures | `touch-action:none` on the deck, every child and the canvas; `pan-x pan-y` on html/body (no pinch or double-tap zoom anywhere, overlay scrollers still pan); `user-select`/`-webkit-user-select`/`-webkit-touch-callout`/tap highlight off; `contextmenu`/`dblclick` prevented; iOS `gesturestart/change/end` cancelled (non-passive); chips `appearance:none` | `index.html`, T-101 CSS block |
| modal taps | touch has no R/P: a tap resumes a pause; a tap restarts from GAME_OVER (armed after 650 ms) / VICTORY (2.4 s, so the reply beat plays) / SLICE_RETRY; `#thumbModal` says "TAP TO RESUME" / "TAP TO CLIMB AGAIN" | |
| auto-fire | opt-in AUTO chip (persisted), `?autofire=1|0`; holds fire while a materialized hostile is inside the screen edges, +220 ms hold-over | see the audit |
| title | unchanged code: a tap anywhere already started the run (main.js window `pointerdown`); the deck is inert behind the title, and the proof shows the starting tap is not also a jump | |
| audio | `pointerup` + `touchend` now also unlock (`src/ui/audio.js`, 2 listeners): iOS Safari only honours `resume()` inside a touch END, and a touch's `pointerdown` is not activation-triggering by spec | |

**Files.** `src/pure/touch-stick.js` (new, pure), `src/ui/touch-controls.js`
(rewritten: the two-thumb deck), `src/ui/touch-legacy.js` (new: the old module
verbatim — the diff against `98b12c9:src/ui/touch-controls.js` is the header
paragraph, the function name, and `touch=legacy` forcing it on), `src/config.js`
(new `touch` block only), `index.html` (new deck markup + its CSS block; the
legacy `#touchDeck` markup/CSS untouched), `src/main.js` (two callbacks added to
the one `installTouchControls` call), `src/ui/audio.js` (two listeners, see
"Scope notes"), `tools/pathcheck/touch-deck-contract.mjs` + manifest line,
`tools/playtest/touch-proof.mjs` + README section.

---

## Auto-fire: default OFF, and why

Auto-fire is input-identical to holding the fire key; the sim reads fire in
exactly one place, `src/sim/player.js:576`. Every fire-gated system:

| system | where | does pulling the trigger cost anything? |
|---|---|---|
| OVERDRIVE / CHARGE | `src/sim/score.js` | no shot term — gains from kills, launches, links, reclaim, wager, recatch; drain from grounded/traversal/vx |
| weapon "heat" | `scoreFireMult` → `CONFIG.score.warmFireMult` 0.85 | WARM shortens the fire interval (a buff); no overheat, ammo or cooldown resource exists in `src/sim`, `src/pure`, `src/config.js` |
| score / THREAT | `src/sim/score.js` | no shot term |
| capsules | `src/sim/capsules.js` | not shootable; carriers drop on death, the held gun pops on damage |
| GHOST SQUAD | `src/sim/mods.js` | replays logged shots (more shots, more clones) |
| pace / pressure | `src/sim/pace.js`, `src/sim/spawner.js` | read kills, not shots |
| **BACKLASH gene** (face 6+) | `src/sim/hostiles.js:476-480, 1085-1091`; `CONFIG.genome.backlash*`; `src/pure/genome.js` | **yes** — a hit that does not kill a BACKLASH body arms a 480 ms tell, then 1 damage if RIG is within 1.65 tiles. A selective shooter can hold fire on it; auto-fire cannot |
| run stats | `src/pure/shell.js:397-401` | kills-per-100-shots on the result screen changes (presentation) |

Firing is therefore not free in the sim, so by the task's own rule auto-fire
defaults OFF on touch (asserted: `resolveAutoFire(null, null) === false`). It
is one tap away (AUTO chip, remembered) and `?autofire=1` for the A/B. The
operator decides the default (question 4).

---

## Evidence

### 1. Multi-touch proof — `tools/playtest/touch-proof.mjs` (Chromium 141, SwiftShader)

Command: `cd tools/playtest && node touch-proof.mjs` (run here as two parallel
processes, `--views landscape` and `--views portrait --only frozen,live,shots`,
because five other lanes' browsers held the host at load average ~50).
Reports: `reports/tasks/T-101/proof/report-landscape.json`,
`report-portrait.json`. DPR 1 unless stated.

How it drives. Every press is a CDP touch, several at once; the deck stamps
the sim clock in its own `pointerdown`, so "tick N" counts updates after the
press itself. The frozen section boots the normal URL with an empty
frame-input schedule stopped at tick 0 (PLAYING, never stepping) and, after
its captures, shadows `document.hidden` without an event so the game skips
its draw — the input layer alone, fast. The live section drives the default
run with RIG's i-frames pinned (labelled test setup) and HOLDS the sim on the
exact frame each closed-loop condition comes true (same shadow) while the
touch lands, so positions do not depend on host load.

Commits: the frozen, title and capture results below come from the full run
at `e498555`; the live results from the final hold-based drive at `836c0e6`;
legacy from the quiet-mode re-run at `35cf56b`. **The game code is identical in
all three** (every commit after `4a159f4` touches only the proof script and its
README). Committed JSON: `proof/report-landscape.json`,
`proof/report-portrait.json` (frozen + title + shots; the landscape file also
holds the legacy tap failure that the re-run supersedes, see below),
`proof/report-landscape-live-final.json`, `proof/report-portrait-live-final.json`,
`proof/report-legacy-rerun.json`.

| check (real CDP touches) | landscape 844x390 | portrait 390x844 |
|---|---|---|
| stick right + JUMP keeps the run | PASS — tick 1 after the press: vy 13.40, vx 9.40 (= runSpeed 9.4) | PASS — same |
| held vs tapped JUMP apex | PASS — held **2.607** tiles (41 ticks held) vs tapped **1.014** (3 ticks held) | PASS — same |
| second JUMP press airborne | PASS — airJumpsLeft 1→0, vy 12.40 at tick 1 | PASS — same |
| stick up-right + FIRE | PASS — bullet at 45.0° (vx>0, vy>0); sim keys up+right+fire held | PASS — 45.0° |
| stick down + JUMP on the first catwalk (x 26-35, y 6.35) | PASS — stood x 32.95 on it, below the deck at tick 1, `dropUntil` set, landed y 2.00 | PASS — stood x 32.89, tick 1, landed y 2.00 |
| 3 fingers (stick+FIRE+JUMP), 6 press × 6 release orders | PASS — **216/216** steps exact, deck ledger AND sim `keys` | PASS — 216/216 |
| a second finger on JUMP | PASS — 2 presses; JUMP stays held until the last finger lifts | PASS |
| pointercancel mid-press (CDP touchCancel) | PASS — everything released | PASS |
| window blur mid-press | PASS — isolated `blur` event; a real focus loss delivered no blur/visibilitychange in headless Chromium (recorded, not counted) | PASS — same |
| visibilitychange → hidden mid-press | PASS — synthetic hidden (see limits) | PASS |
| orientation flip mid-press (viewport swap) | PASS — everything released; lifting the fingers afterwards sends nothing | PASS |
| PAUSE chip → tap to resume | PASS — PAUSED, cue "TAP TO RESUME", tap → PLAYING; the chip's own lift does not resume | PASS |
| GAME_OVER taps | PASS — a tap 39 ms after the screen is ignored; an armed tap restarts | PASS — 72 ms ignored; armed restarts |
| layout vs drawing | PASS — JUMP/FIRE DOM rects match the pure layout within 1 px | PASS |
| computed styles | PASS — `touch-action:none` + `user-select:none` on deck, JUMP, FIRE, SWAP, PAUSE, AUTO, stick, nub; canvas `touch-action:none`; html `pan-x pan-y`; body `user-select:none` | PASS |
| double-tap on JUMP | PASS — scale 1 (cannot fail here: Chromium never double-tap-zooms width=device-width) | PASS |
| pinch on the play surface | PASS — scale 1; the same pinch with touch-action overridden → **scale 5** (the probe can see a zoom) | PASS — 1 vs 5 |
| title tap (`?shell=title`, audio on) | PASS — starts the run; the starting tap held nothing and jumped 0 times (it landed where JUMP sits); deck inert behind the title; AudioContext none → running | — |
| `?touch=legacy` | PASS — old snapshot keys `enabled, active, clutch, vector, fire, held, jumps`; old deck shown, new hidden; drag → ArrowRight, outer rail adds KeyX, tap → 1 jump pulse (re-run: 4/4) | — |
| page errors | none in any page | none |

Totals: landscape full run 53 passed / 1 failed (the legacy tap, below);
portrait full run 46/0; hold-drive live 7/0 and 7/0; legacy re-run 4/0.

**The one failure and why it is superseded.** In the full landscape run the
legacy tap-to-jump registered 0 of 3 taps: the rejected scheme only counts a
tap whose down→up fits 170 ms of main-thread time, and at host load ~55 one
software-rendered frame between the two CDP events is longer than that (drag
and outer-rail fire passed in the same run). Re-run with the draw skipped
(the frozen section's quiet mode): 4/4. This is a harness-latency artifact on
a timing-based gesture of the old scheme; the new deck has no timing gestures.

**Aim assist note.** A pre-final run read 37.0° instead of 45° with a wasp at
(+5.6, +4.6) tiles from the muzzle: the shipped normal-run aim assist
(`CONFIG.assist.maxDeg` 8°) correcting toward it. The final runs read 45.0°
(landscape: nearest wasp at (+8.1, +4.6), outside the assist cone).

### 2. The proof goes red on the defect — browser falsification

Each run serves `src/ui/touch-controls.js` with ONE textual defect via
`page.route` (`--mutate <name>`; a missing anchor throws). Landscape.

| mutation (the defect) | what went red (observed) | what stayed green |
|---|---|---|
| `release-all-on-up` — lifting any finger releases every finger | the 36-order ledger: **72 of 216 steps wrong** (e.g. after lifting S: deck and sim held nothing, want `Space, KeyX`); a second finger on JUMP: JUMP dropped at the first lift | the other 36 frozen checks |
| `ignore-cancel` — no `pointercancel` AND no `lostpointercapture` listener | pointercancel release: deck still `[ArrowRight, Space, KeyX]`, sim `right, jump, fire` stuck true — the "stuck run, stuck fire" defect | 37 others. (Removing `pointercancel` alone stayed green, correctly: Chromium fires `lostpointercapture` right after a cancel and the deck releases on it too) |
| `ignore-blur` — no `blur` listener | isolated blur: deck ledger stuck at `[ArrowRight, Space, KeyX]` while main.js's own handler had cleared the sim keys | 37 others |
| `jump-pulse` — keyup right after keydown (the rejected scheme's pulse) | held vs tapped apex **0.500 = 0.500** tiles; the air jump left at vy 5.25 (cut at once); the route then never reached the catwalk | run+jump (vy 5.70 > 0 still), up-right bullets, no-damage, no page errors |
| `stick-no-vertical` — the stick never emits Up/Down | bullets **0.0°** (level); down+JUMP on the catwalk **never went below** (landed back on y 6.35) | run+jump, apex, air jump, no-damage, no errors |
| `stick-no-down` — the stick never emits Down | ONLY the drop-through: stood on the catwalk at x 32.95, **never went below** | the other 6 live checks (up-right bullets 45.0°) |

Full output: `reports/tasks/T-101/falsification-touch-proof.txt`.

### 3. Pathcheck

| run | result |
|---|---|
| before, base `98b12c9` (this worktree, 20:21) | **3989 passed, 0 failed** (2m09s) |
| after, `4a159f4` working tree (21:24, host loaded by my proof + mutation browsers and ~5 other lanes' browsers) | 4040 passed, **1 failed**: "the permanent real-browser performance probe boots the shipped scene" — the probe produced no stdout/stderr and was killed at `HB_PROBE_SPAWN_MS` (300 s); the run took 5m34s. See the PROPOSED INBOX ISSUE on that domain reading a stale `result.json`. |
| after, `836c0e6` (00:31) and `59b85df` (00:47, `HB_PROBE_SPAWN_MS` widened to 900000) | **4037 passed, 4 failed**, both runs: all four are the perf-probe domain (`tools/pathcheck/render-submission-contract.mjs`). The probe died inside its own `page.goto(..., { timeout: 45000 })` (hard-coded, not widened by `HB_PROBE_BOOT_MS`) before the game was judged; the other three assertions read its missing `result.json`. |

**Assertion accounting — `reports/tasks/T-101/pathcheck-labels-diff.txt`.**
`tools/pathcheck-labels.mjs` captured the ordered PASS/FAIL label list of the
base commit and of this branch back to back on the same host (~00:40-00:50):
base 3989 labels with **the same 4 perf-probe FAILs**, branch 4041 with the
same 4; **0 base lines removed or changed** (status included); **52 added, all
PASS** = the 46 of the new domain + 6 existing per-file guards that now also
cover `src/pure/touch-stick.js` (T-049 ×2, T-051 ×3, legibility ×1).

**Is the probe failure mine? Measured, not argued.** The same probe, same
host, back to back (00:32-00:42): against an export of the BASE commit
`98b12c9` (same assets) it failed identically — `page.goto: Timeout 45000ms
exceeded` after 64 s at load 24; against this branch it passed (exit 0,
572 s at load 44) with **materialViolations 0, instanceUploadKbPerFrame 0,
MSAA samples 0** — the three dependent assertions' own numbers. The probe
boots a desktop context with no touch hardware, where the deck is not even
installed. Every other assertion in both final runs passed. This host was at
load average 24-59 for the whole session (five or more other lanes'
SwiftShader browsers); the baseline's green run was taken at 20:21, before
that.

New domain `tools/pathcheck/touch-deck-contract.mjs`: 46 assertions over the
pure stick/layout logic (dead zone, sector table, hysteresis against a seeded
jittery thumb, rim follow, the layout at 16 phone size × inset combinations with
the notch on either side, the hit test, resolvers, auto-fire hold-over), the
audio-unlock model, and static guards ONLY for what no browser here can
exercise (iOS gesture events, orientationchange/pagehide listeners, -webkit-
CSS, no vibrate) plus the one-input-contract rule. Every assertion group was
broken and shown red, then restored:
`reports/tasks/T-101/falsification-pathcheck.txt` (14 mutations, control 46/0,
restored 46/0).

### 4. Keyboard path / smoke

Run as the integrator prescribed: MAIN's harness (`e1b175b`-era
`/home/user/hullbreaker/tools/playtest/run.mjs`, read-only, cwd in main's
`tools/playtest`) against MY tree on my own server, judged by main's
`tools/orch/smoke-verdict.mjs`. Outputs in this worktree's gitignored
`tools/playtest/runs/`.

| script | command | verdict |
|---|---|---|
| `mid-route.json` | `HB_HARNESS_SLOWDOWN=40 node .../run.mjs scripts/mid-route.json --deterministic --viewport 480x300 --base-url http://127.0.0.1:8751` | **PASS** — `smoke-verdict: PASS (outcome=not-completed deaths=0 tick=594/594)`, pageErrors [], consoleErrors [] |
| `transform-slice.json` | same, `--base-url http://127.0.0.1:8761` (a bounded server for that one run) | **PASS** — `smoke-verdict: PASS (outcome=completed deaths=0 tick=938/1104)` |

Two earlier attempts of each died in main's harness at `page.goto: Timeout
30000ms exceeded` while my proof browsers were also running (that goto is not
stretched by `HB_HARNESS_SLOWDOWN`; filed below). "not-completed" on
mid-route is expected: per the integrator, victory is not a smoke criterion
since `7f5b8ae`.

Why the keyboard path cannot have moved: the deck is installed only when
`resolveTouchScheme` says so (no touch hardware → `off`: no listeners, no
rAF loop, markup stays `hidden`); `src/main.js` changes only the arguments of
the one `installTouchControls` call; `applyGameplayKeyEdge`, the keydown/keyup
listeners and `GAMEPLAY_KEYMAP` are untouched; `src/ui/audio.js` gains two
unlock listeners that only create/resume the AudioContext.

### 5. Screenshots (`reports/tasks/T-101/shots/`, JPEG q82 of the PNG captures)

All from the shipped default run; DPR stated in the name. "idle" = deck at
rest; "inuse" = stick held up-right (lit NE wedge on the rim), FIRE and JUMP
held; "live-inuse" = the same over the live run after the movement proof.

| file | DPR | what |
|---|---|---|
| `shots/landscape-dpr1-idle.jpg`, `landscape-dpr1-inuse.jpg` | 1 | 844x390, frozen sim at spawn |
| `shots/landscape-dpr2-idle.jpg`, `landscape-dpr2-inuse.jpg` | 2 | 1688x780 pixels |
| `shots/landscape-dpr1-live-inuse.jpg` | 1 | mid-run, x ~33 |
| `shots/portrait-dpr1-idle.jpg`, `portrait-dpr1-inuse.jpg` | 1 | 390x844 |
| `shots/portrait-dpr2-idle.jpg`, `portrait-dpr2-inuse.jpg` | 2 | 780x1688 pixels |
| `shots/portrait-dpr1-live-inuse.jpg` | 1 | mid-run |
| `shots/landscape-dpr1-legacy.jpg` | 1 | `?touch=legacy`, for comparison |

Total 0.94 MB (JPEG q82 of the PNG captures). Not judged here — the look is
the operator's call (questions 2-3).

---

## Legacy assertions changed (decisions.md entry 21)

**None.** At the base commit no pathcheck, playtest or gate file asserted
anything about the old touch scheme or its markup:
`git grep -nE "touch-controls|touchDeck|installTouchControls|__HB_TOUCH|touchStick|touch-chip|touchCue|touchSwap|touchPause|one-thumb|clutch" 98b12c9 -- tools/ docs/ src/ ':!src/ui/touch-controls.js'`
returns only prose in `docs/` and the two `src/main.js` import/call lines.
`tools/playtest/hud-instrument-smoke.mjs` passes `&touch=1` for its phone views
and asserts nothing about the deck. My own new domain was trimmed under entry 21:
text-pinning checks that the browser proof covers behaviourally (exact edge-site
count, main.js wiring regex, legacy routing/constants regexes, the
pointercancel/blur/visibilitychange listener regexes) were removed before they
ever merged.

---

## iOS Safari: what was designed for, and what could NOT be verified here

Playwright's WebKit is not installed on this host; every browser check above
ran in Chromium 141 (SwiftShader) with `isMobile` + `hasTouch` emulation.
Designed for iPhone Safari (entry 20 addendum), unverified on a device:

| iOS behaviour | what the deck does | evidence available here |
|---|---|---|
| swipe from the left glass edge = browser back | no stick spawns in the outermost 20 px; a touch there is tracked and inert | pathcheck (pure zone), not a device |
| pinch zoom (Safari has ignored `user-scalable=no`) | `touch-action:none` on every deck surface + `pan-x pan-y` on html/body + `gesturestart/change/end` cancelled, non-passive | Chromium pinch probe (scale stays 1; 5 with touch-action overridden); gesture events: static guard only |
| double-tap zoom | same | cannot fail in Chromium (width=device-width) |
| long-press callout / text loupe | `-webkit-touch-callout:none`, `-webkit-user-select:none`, `contextmenu` prevented | static guard only (Chromium ignores the callout property) |
| audio needs a touch END gesture | `pointerup` + `touchend` unlock added to `src/ui/audio.js` | pathcheck model (gesture-gated fake AudioContext); CDP grants activation at pointerdown, so not observable here |
| notch on a SIDE in landscape, home indicator at the bottom | layout reads `env(safe-area-inset-*)` (via the `--hud-safe-*` vars) | pathcheck at 844x390 / 844x340 / 932x430 with 47 px side insets + 21 px bottom |
| Safari toolbar shrinking a landscape viewport | layout re-runs on every resize; release only on an orientation flip | pathcheck at 844x340 |
| system gestures cancelling touches (Control Center, notification pull, 3-finger) | per-pointer release on `pointercancel`; full release on blur / pagehide / hidden | CDP touchCancel trial |
| `<button>` chrome | chips set `appearance:none` | none |

---

## Operator packet

URL: the integrator's pinned server, `index.html` with **no query** on the
iPhone (the two-thumb deck is the touch default). Hold the phone sideways.
A/B links on the same server: `index.html?touch=legacy` (the old scheme),
`index.html?autofire=1` (auto-fire on), `index.html?touch=1` (this deck on a
desktop, mouse-driven, for review only).

1. Left thumb: when you meant to run, aim or drop, what did RIG actually do?
   Note any moment it stopped, aimed, or fell through a floor that you did not
   ask for.
2. Right thumb: how did you end up jumping while shooting? Which button did you
   hit when you did not mean to, or miss when you did?
3. Did the stick, the buttons or the chips ever cover RIG, an enemy, or a
   landing you needed to see? Where on the screen?
4. Play one run with AUTO off and one with AUTO on (the AUTO chip, top right).
   Which should a phone start with, and what changed for you?
5. On the iPhone itself: did the page ever zoom, select text, pop up a menu,
   go back a page, or stay silent when the game should have made sound?

## Open feel questions (for the operator, not answered here)

- Stick sector widths (E/W 50°, N/S 35°) and the 9° hysteresis were reasoned
  from "a pure-vertical sector stops the run", not tuned against a thumb.
- JUMP/FIRE placement on the arc (FIRE 190° off JUMP in landscape) and sizes
  (86/74 px at 390 px) are first-principles reach estimates, not measured on a
  hand. The cluster is designed to be moved by config only.
- Whether the "everything you touch stays held until you lift" rule reads as
  natural or as sticky.
- The deck's visual weight over a busy scene, idle and pressed (captures, §5).
- The 650 ms / 2.4 s arming before a tap restarts from death / the summit.

---

## PROPOSED INBOX ISSUES

## I-??? | bug | S2 | repro: ?touch=legacy on any touch device, tap II, then try to resume; or die to GAME_OVER | evidence: src/ui/overlay.js:59-68, index.html legacy CSS `body.at-modal #touchDeck { pointer-events: none }`
The rejected one-thumb scheme (now `?touch=legacy`) had no touch path out of a modal: its II chip pauses, the deck then goes inert under the overlay, and the overlay only offers "p / esc to resume" / "r to climb again". A touch-only player had to reload the page to resume or restart. The default two-thumb deck fixes this (tap to resume, armed tap to restart, a #thumbModal cue); the legacy escape hatch keeps the defect verbatim by design. If `?touch=legacy` is ever offered to players rather than reviewers, port the modal taps to it.

## I-??? | docs | S3 | repro: index.html?touch=1 (or any phone), pause or die | evidence: src/ui/overlay.js:59-68
The overlay body still says "p / esc to resume" and "r to climb again" on touch devices. #ovTitle/#ovBody copy is frozen by the bot harness (tools/playtest/lib/sampler.mjs), so T-101 adds a separate #thumbModal cue ("TAP TO RESUME" / "TAP TO CLIMB AGAIN") instead of rewriting it. T-105 (title/HUD/death-screen copy) should reconcile the two so a phone shows one instruction, not a keyboard line plus a touch line.

## I-??? | bug | S3 | repro: headless Chromium 141, a second page brought to front | evidence: touch-proof report measure `realFocusLoss: {blur: 0, vis: 0}`
Tooling note, not a game defect: headless Chromium delivers neither `blur` nor `visibilitychange` to a page when another page is brought to front, so no harness here can drive a real backgrounding. Any lane claiming "release on backgrounding" from this host is reporting a synthetic event; a device check (or WebKit) is the only real evidence.

## I-??? | bug | S2 | repro: run `node tools/pathcheck.mjs` while the host is loaded enough that tools/playtest/perf-probe.mjs exceeds HB_PROBE_SPAWN_MS (T-101 branch 4a159f4, 2026-10-22 21:24-21:29) | evidence: /private/tmp/hullbreaker-pathcheck-render-submission/result.json mtime 20:23:29 vs that run ending 21:29:42
tools/pathcheck/render-submission-contract.mjs reads a FIXED path, `/private/tmp/hullbreaker-pathcheck-render-submission/result.json`, whether or not the probe it just spawned wrote it. When the probe was killed by the spawn timeout (no stdout, no stderr), the boot assertion correctly failed, but the three dependent assertions (material single-pass, zero idle instance upload, no redundant MSAA) PASSED on a result.json written 66 minutes earlier by a different run. The path is also shared by every worktree on the host, so concurrent lanes read each other's probe results. Fix direction: delete the file before spawning (or write to a per-run temp dir) and make assertions 2-4 conditional on this run's probe having succeeded, so a dead probe reads as FAIL x4, never FAIL x1 + three borrowed passes.

## I-??? | bug | S3 | repro: HB_HARNESS_SLOWDOWN=40 node tools/playtest/run.mjs scripts/mid-route.json --deterministic --viewport 480x300 --base-url <a loaded host's server> (main e1b175b harness, 2026-10-22 21:44) | evidence: T-101 smoke log "page.goto: Timeout 30000ms exceeded"
tools/playtest/lib/driver.mjs:90 calls `page.goto(url, { waitUntil: 'load' })` with Playwright's default 30 s navigation timeout; HB_HARNESS_SLOWDOWN stretches the boot budget (line 93) and the hard cap (line 315) but not this. On a loaded GPU-less host the 'load' event (every preload image included) can take longer than 30 s, so the smoke run dies before the game is judged and the verdict reads as a harness failure. Fix direction: pass `timeout: 30000 * HOST_SLOWDOWN` to that goto.

---

## Scope notes

- `src/ui/audio.js` is outside the task's fence list but inside its goal ("and
  unlocks audio, if the audio module needs a gesture"); the change is two
  listeners and a comment. CDP touch input carries user activation already at
  pointerdown (measured), so this host cannot show the before/after; pathcheck
  models the rule instead (falsified: removing the listeners turns it red).
- The title's "PRESS ANY KEY" text and keyboard legend were NOT changed: tap
  anywhere already starts the run, and T-105 owns that copy.
- The overlay body copy ("p / esc to resume", "r to climb again") is frozen by
  the bot harness; the deck adds its own `#thumbModal` cue instead.
- Two test-setup writes in the proof, both labelled: GAME_OVER forced through
  `src/sim/state.js` for the restart tap, and RIG's i-frames pinned for the live
  route (the first unshielded run went hp 3 → 1 under wave-1 contact and never
  reached the catwalk). Neither touches the input path.

## Worktree, branch

`/home/user/hullbreaker/.claude/worktrees/T-101`, branch `task/T-101`, commits
`ee5387c` (the deck, pure module, legacy hatch, pathcheck domain, proof),
`4a159f4` (refinements from the first runs: rim wedge, slide slop, iOS
`appearance`, gutter, cluster box, entry-21 trim), `e654d84` `3d9f341`
`e498555` `35cf56b` `8d6062d` `836c0e6` (proof-harness robustness only),
`59b85df` + `5c82c2e` (evidence, report) and the commit carrying this list
(`git log --oneline 98b12c9..task/T-101`). Servers: `node tools/serve.mjs 8751 --root <worktree> --quiet` (the
session's background-task limit stopped it at ~23:12) and a bounded 8761
started and stopped inside the transform-smoke job. No server of mine is
running at hand-off.

## Single best next action

Put the deck on the operator's iPhone, sideways, on the integrator's pinned
server with no query, and run the five-question packet — explicitly watching
the three iOS-only behaviours this host cannot exercise: a swipe from the left
glass edge must not navigate back, nothing may zoom, and sound must start on
the first tap. Everything else in this report is Chromium evidence.
