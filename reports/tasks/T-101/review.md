APPROVE

Reviewed `git diff main...HEAD` of task/T-101 (head 49f6a0a; merge-base == main a217831, so the three-dot diff is exactly the lane's 12 commits). No blocker found. Findings are non-blocking, most severe first; paths are relative to the worktree.

## Findings

1. [S3, coverage] `src/ui/touch-controls.js:454` — the leave-PLAYING release (`if (!playing && wasPlaying) releaseAll()`) is asserted by nothing. With that line deleted, `touch-proof.mjs --views landscape --only frozen` is still 38/0 (reviewer scratch mutation). The shipped behaviour is right: a throwaway probe held stick+FIRE+JUMP, then opened the pause (P) and, separately, forced GAME_OVER. Every code was released within 3 frames, the fingers were inert after resume (they send nothing, including on lift), and a fresh press worked. The build report claims this release as design, not as proven, so there is no overclaim. Suggest one `lifecycleReleases` trial (3 fingers down, then PAUSED / GAME_OVER, held set empty) plus a `--mutate ignore-leave-playing`.

2. [S3, cosmetic, reproduced] `src/ui/touch-controls.js:194-201` (`releaseAll`), `:300` (adds `.down`), `:378-379` (the later lift returns early on `slotOf < 0`) — a finger resting on a chip when blur / visibilitychange / orientation / leaving PLAYING releases keeps the chip's lit `.down` look until that chip is pressed and lifted again. Repro: SWAP chip down, dispatch `blur`, lift: `#thumbSwap.classList.contains('down')` is still true. No code is held. Fix: strip `.down` from every `[data-chip]` inside `releaseAll()`.

3. [S4, hardening, unproven] `src/ui/touch-controls.js:285` — a `pointerdown` whose id matches a live slot is dropped as "duplicate delivery". The stick has newest-wins protection against a lost `pointerup` (`:313-315`); cluster and chip slots have none. A lost up AND cancel (CDP cannot produce this; iOS system gestures are the realistic source) would hold JUMP/FIRE until blur / visibility / orientation / leaving PLAYING. Possible fix: on a `pointerdown` with `isPrimary` (first touch of a sequence), release any live slots first.

4. [S3, test honesty, entry 21] `tools/pathcheck/touch-deck-contract.mjs:58` — pins E/W 50° / N/S 35° / diagonals 47.5° exactly. The build report itself calls these "reasoned, not tuned against a thumb" and the operator is expected to retune them on a phone, so this goes red on the first feel edit for no player-visible reason. The reasoned invariant (N/S narrowest) is already `:62` plus the tiling check at the head of the domain; drop or loosen `:58`. The other pinned values are decision- or rule-backed (`:326` auto-fire OFF default, `:362` key-edge-only rule).

5. [S3, docs / integration — integrator at merge; LANE-BRIEF bars the lane from README]
   - `README.md:104` and `docs/ENGINEERING.md:17` ("Run modes and URL flags") do not list `?touch=legacy|0|1` or `?autofire=1|0`, and HANDOFF's current-state does not say the touch default changed.
   - `tools/simlab/race/probe-framing.mjs:119` (T-104, already on main) still measures `#touchDeck`, which stays `hidden` under the new default, so it will report `null` for the deck on phone views. T-107 should read `__HB_TOUCH().layout.cluster` instead (the lane publishes it).

6. [nits]
   - `src/ui/touch-controls.js:290-291`: `s.x0 / y0 / t0` are written and never read.
   - `tools/playtest/README.md:1807,1815`: honesty items are numbered 8 then 7.
   - `reports/tasks/T-101/proof/report-landscape.json` still carries the superseded legacy-tap FAIL (explained in build.md §1, superseded by `report-legacy-rerun.json`).

## Operator questions (feel / product — not blockers)

- A second finger landing in the left 45% re-anchors the stick, and the original finger stays inert until it lifts (reviewer probe S7). That is intended, to survive a lost `pointerup`. Is a stray palm or edge touch stealing the run acceptable on a phone?
- The touch-hardware predicate (`src/ui/touch-controls.js:64-67`: `maxTouchPoints > 0 || (pointer: coarse)`) is unchanged from base. But the old deck was invisible until touched and covered the bottom 36vh (`index.html:187-189`), whereas the new deck draws labelled buttons and consumes every `pointerdown` on the whole screen while PLAYING. A touch-screen laptop or an iPad with a keyboard now gets that by default (`?touch=0` opts out). Wanted?
- The deck is DOM over WebGL (a conic-gradient wedge repaints on sector change). Whether 60 fps holds on the actual iPhone (entry 18) cannot be measured here (SwiftShader) — a device check.
- Auto-fire default OFF stands on the lane's audit. I confirmed the BACKLASH cost (`src/sim/hostiles.js:476-480, 1085-1091`) and that `src/sim/player.js:576` is the only reader of the fire key. The default remains the operator's call (question 4 in the packet).

## Checklist results (no finding unless listed above)

1. Keyboard path: the deck installs only via `resolveTouchScheme`, with the same predicate as base. On a desktop context (no touch hardware) the reviewer probe saw `enabled:false`, `scheme:'off'`, `#thumbDeck`/`#thumbModal`/`#touchDeck` all `hidden` (computed display none), no `touch-*` class on html/body, html `touch-action:auto`, a mouse drag produced no key edges, keyboard ArrowRight+Space still set `keys`, and no page errors. By code, every listener and the rAF loop sit inside `if (enabled)` (`:467-497`). `src/main.js` diff is 5 added lines: a comment and the `restart` / `state` callbacks on the one `installTouchControls` call. `GAMEPLAY_KEYMAP`, `applyGameplayKeyEdge` and the key listeners are untouched. The deck's sim imports are read-only (`hostiles`, `gameMs`, `sLeftEdge/sRightEdge`). Its only non-key-edge calls are `startRun`, `togglePause` and `restart` → `resetGame`, the same shell verbs the P / Esc / R keys call (documented in the main.js comment). That is the one place "key edges only" is bent; I judge it equivalent, not a new sim path.
2. Layer purity / determinism: `src/pure/touch-stick.js` imports only `../config.js` (the pure guard's sanctioned import, shared by 8 other pure modules), with no `Date`/`performance`/`Math.random`/`document`/`window`. Time enters `autoFireStep` as a parameter. The `src/config.js` diff is a single additive `touch` block (+48/-0). No movement constant, hook, camera or render file is touched. `performance.now` appears only in the ui modal-arming code.
3. Robustness (reviewer probe, real CDP touches, frozen sim, 35 of 36 pass; the 1 fail is finding 2):
   - chip → drag onto JUMP: JUMP never presses; SWAP is released on lift; no pause.
   - JUMP finger dragged over PAUSE: JUMP held, no pause.
   - pause opened mid-press with 3 fingers down: all released within 3 frames, fingers inert after resume, a fresh press works.
   - resize without an orientation flip (844x390 → 844x340): codes stay held, lift releases.
   - GAME_OVER mid-press: released, lifting sends nothing and does not restart.
   - 20 px left gutter: no stick, even when dragged out.
   - 11 fingers: no throw, all released.
   - auto-fire (`?autofire=1`, test-injected hostile row): holds the trigger with a hostile inside the edges, released on pause and on death, re-engages on resume, and the AUTO chip tap turns it off and stores '0'.
   - `?touch=0` on touch hardware → off.
   - `localStorage` throwing (private mode): the deck installs, auto-fire is off, no page error.
4. Hygiene: `localStorage` (`:70,73`) is in try/catch and read only by the ui. The sim never reads it. No external URLs. CSS is purely additive in one contiguous block, and every selector is `#thumb*` / `.thumb-*` / `html|body.touch-twin`. `git diff main:src/ui/touch-controls.js src/ui/touch-legacy.js` is 11+/4-: the header paragraph, the function name, and `touch=legacy` forcing it on (also identical to 98b12c9's module). The legacy module has no imports and no import-time effects. No new deps, no build step, no OSTK artifacts, and no duplicate element ids.
5. Test honesty: `git diff main...HEAD -- tools/` touches no existing assertion or script (`manifest.mjs` +2 lines, README +91, two new files). The static guards are limited to the key-edge rule, iOS gesture / pagehide / -webkit- CSS, and no-vibrate. The proof's checks read sim state (`HB.player` per-tick recording, `HB.keys`, the bullet pool's headings, `airJumpsLeft`, `dropUntil`), not just deck state. The live drive HOLDS the sim at each decision frame (`document.hidden` shadow) and pins i-frames; both are labelled in the script and README, so the headline "real multi-touch drove the shipped run" is true but is not real-time thumb timing.
6. `src/ui/audio.js`: two listeners (`pointerup`, `touchend`) plus a comment. `unlock()` early-outs unless the context is suspended, the game is not paused and the page is visible, so it is cheap and cannot resume a paused game. Outside the literal fence but inside the goal; acceptable. `src/config.js` and `src/ui/touch-legacy.js` are likewise outside the literal fence, but the lane's work requires them.

## Re-ran

- `. ~/.hullbreaker-host.env; HB_GATE_FAST=1 node tools/pathcheck.mjs` in the worktree (49f6a0a): 4038 passed, 0 failed, exit 0. The 4 `render-submission-contract` browser-probe assertions were SKIPped by `HB_GATE_SKIP_BROWSER_PROBE=1` from the host env and not counted. Base (a217831 exported to the scratchpad, same env): 3986 passed, 0 failed. The delta of +52 is exactly the lane's 46 new-domain assertions plus 6 existing per-file guards that now also cover `touch-stick.js`, matching its label diff. The new domain alone: 46/0.
- `touch-proof.mjs --views landscape --only frozen`, unmutated: 38/0 (306 s). Lane's `--mutate release-all-on-up`: 36 passed / 2 failed, with 72 of 216 ledger steps wrong, identical to the lane's report.
- Reviewer mutations (scratch copy of the harness in the scratchpad; the worktree was never modified): `ignore-visibility` → red on the visibilitychange check (37/1). `ignore-orientation-all` (resize-flip + `orientationchange` + `screen.orientation` listeners removed) → red on the orientation check (37/1). `ignore-orientation-and-cancel` → red on both cancel and orientation (36/2). `ignore-resize-flip` alone → 38/0: Chromium's viewport swap also fires `orientationchange` / `screen.orientation`, so that check binds the three releases as a set and cannot isolate the resize path. That closes the report's "visibility and orientation releases were not mutated in the browser" gap in the lane's favour. `ignore-leave-playing` → 38/0 (finding 1).
- Reviewer adversarial probe: 35 of 36 pass (see checklist 1 and 3).
- `mid-route.json --deterministic` smoke against the worktree on a private port with the host knobs: `smoke-verdict: PASS (outcome=not-completed deaths=0 tick=594/594)`.
- Static reads: the full diff, `touch-controls.js`, `touch-stick.js`, the pathcheck domain, the proof script, committed evidence JSON / falsification logs (consistent with build.md), and two screenshots (present, deck visible; look not judged).
- Not re-run: the `transform-slice.json` smoke (the merge gate runs both best-of-three); the portrait, live, legacy, title and DPR-2 sections of the proof (the integrator's playtester is covering them); the lane's 14 pathcheck mutations; iOS / WebKit (not on this host). Every browser result above is Chromium only; the iOS-only behaviours (edge back-swipe, `gesturestart`, touchend audio unlock, notch insets) stay unverified until the device run, as build.md says.
- The worktree is clean after all runs (`git status --short` empty); scratch files are under the session scratchpad only.
