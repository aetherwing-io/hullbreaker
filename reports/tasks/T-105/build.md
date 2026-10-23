# T-105 build report — the phone shell

Lane T-105, worktree `/home/user/hullbreaker/.claude/worktrees/T-105`, branch
`task/T-105`. Based on main `08e5db1` (the branch was rebased there after
dispatch; main had moved by docs and a gate artifact only). Main `af8bb0b`
(T-103 guns in hands, decisions 27) is merged in as **`9ecf462`, a merge
commit**, before the final gates. Not merged to main. Tree clean at hand-off.

The lane was stopped by a container restart twice; each time the integrator
snapshotted the uncommitted work: `b541ebf` (the first agent's WIP, which had
never been run) and `9867354` (this report, mid-edit). Nothing below is
inherited from the first WIP: every number traces to a run of this lane's
tools on this host, and every log cited is committed under `evidence/`.

**Pathcheck domain number.** Main now has d79 / d80 (T-103). T-201's race pass
is in its gates and takes d81, so this branch's domain
`tools/pathcheck/t-105-phone-shell.mjs` is **d82**; d81 is left free, with a
one-line note in `tools/pathcheck/manifest.mjs`. The two branches append to
the same list, so whichever merges second gets a one-line manifest conflict:
keep both, d81 then d82.

**Evidence standard (decisions.md entry 21).** No box below rests on "pathcheck
is green". Each one is a measurement of what a player sees, taken with the
SAME tool on main (`08e5db1` from a `git archive` export: "base") and on this
branch, and every new check was shown red on the defect it guards. Host:
Chromium 141 under SwiftShader, 4 cores shared with up to ~7 other lanes; load
average 30-71 for nearly every run, boots of 22-98 s, and a disk that ran
down to 69 MB free twice before the restart. "Branch" means the pre-merge
branch for the screens, safe-area, watchdog, touch-proof and the first
gate-line runs, and the final export (`383b09f`, main merged) for everything
run after the merge; each table says which. The merge changed exactly two
source files, `src/pure/rig.js` and `src/render/player.js` (RIG's hands on
his weapon), plus three RIG sprite atlases and `assets/manifest.json`
(`git diff --name-only 08e5db1 af8bb0b -- src/ index.html`): nothing the
shell, the HUD, the deck, the audio unlock or the watchdog is built from, so
the pre-merge browser evidence describes the merged shell too.

## Headline

| | main `08e5db1` | this branch |
|---|---|---|
| 9 screens x 5 views, DOM audit + copy scan (DPR 2, `hasTouch`, iOS UA on phones) | **54 pass / 49 fail** (844x390: 15, 932x430: 11, 667x375: 14, 390x844: 9, 1280x720: 0) | **103 pass / 0 fail** |
| the same walk with notch insets (L/R 47, bottom 21), 3 landscape views | **42 pass / 42 fail** | **84 pass / 0 fail** |
| keyboard-only copy on a touch device | title, pause, game over, victory and failsafe at every phone size, plus the swap hint's "C" in portrait | none, at every phone size |
| text that does not fit | portrait title 450 px of "HULLBREAKER" in 390 px (read "HULLBREAK"); the deck's TAP TO CLIMB AGAIN painted over the death copy (844, 667) and over the summit's key line (844, 932, 667); the loot card and the Crown banner painted over the RIG panel (all landscape sizes, and the banner in portrait); the shipped 43-char hull-fallback line cut at 667 | none |
| landscape HUD at 844x390 — play / finale | **13.88% / 24.98%** of the screen; the RIG panel (300x116 px) inside the central 60% x 60% in every state | **6.47% / 9.08%**; nothing in the central region in any state at any landscape size |
| gate line ≤ 28 chars at 667x375 / 1100x700 | one line (8 px font at 667) | one line (10 px font at 667; 11.6 px to spare) |
| T-201's encounter lines (`rollingEncounterText`, ≤ 28 chars) | nine of them measured: one line too, at an 8 px font on landscape phones (158.4 px in a 237 px slot at 667x375) | with `task/T-201` combined: **all 1145 distinct lines on ONE line, uncut**, at 667x375 (widest 185.4 px in a 197 px slot), 1100x700, 844x390, 932x430, 390x844 and 1280x720 |
| today's 47-char gate line at 667x375 / 1100x700 | cut (265.9 px in 237; 398.8 px in 366) | wraps to two lines, never cut, at every size measured |
| texture preloads | each of 4 fetched **twice**, 4 "not used" console warnings | each of the 5 preloaded URLs fetched **once**, 0 warnings (844x390 and 1280x720) |
| 6 s frame stall before the first frames | **"The game got stuck"** 1.2 s into the stall | **no panel**, frames resume; the same rule still panels a 6 s stall after warm-up (5.6 s in) and a loop dead from boot (10.8 s in) |
| rotation mid-run, three fingers down | 13 / 0 (T-101's release and main's resize already hold) | **13 / 0** with the new HUD (strip re-laid out both ways) |
| first tap → sound, iOS rule emulated | first tap: running; a context iOS reports `interrupted` is **never resumed** | **4 / 0**: first tap running, `interrupted` resumed inside the next tap's `touchend` |
| home-screen play | no manifest, no iOS meta, no touch icon (4 / 4 red) | **6 / 0**: manifest parsed by Chromium with 0 errors (landscape, fullscreen → standalone, `start_url` the game page), 3 icons + the 180 px touch icon decoded at size, iOS tags declared |
| desktop 1280x720 title / play / pause | — | **0 differences** (every named box, every text box, the visible copy) |
| HUD-instrument smoke (existing contract, 4 views) | 4 / 4 PASS | **4 / 4 PASS** (final export) |
| smoke (gate command + `smoke-verdict`), main merged | — | mid-route **PASS** attempt 1 (`not-completed deaths=0 tick=594/594`); transform-slice **PASS** attempt 1 (`completed deaths=0 tick=938/1104`) |
| pathcheck, full tier, main merged | — | **4450 passed, 0 failed** (730 s; the 4 browser-probe assertions skipped by the host env) |

## Acceptance, box by box (SPRINT `## T-105`)

Tool: `tools/playtest/phone-shell.mjs` (new; README section in
`tools/playtest/README.md`). Views: `l844` 844x390, `l932` 932x430, `l667`
667x375, `p390` 390x844 (all `hasTouch`, `isMobile`, iOS 17.5 Safari UA,
DPR 2), `d1280` 1280x720 and `d1100` 1100x700 (desktop, no touch, DPR 1).

### 1. Before/after capture matrix — DONE
Nine screens per view — title, play HUD, a capsule pickup (the loot card held
at its readable phase), a death, pause/options, game over, the Crown finale,
the summit (victory), the failsafe panel (forced) — at all four phone views,
plus desktop, on base and branch. States a player reaches only after minutes
of play are entered through the game's own modules (labelled TEST SETUP in
the tool); start / pause / resume / restart are performed with real CDP
touches on phones and keys on desktop. 90 captures (45 per tree) were taken,
plus 54 notch captures (27 per tree); the committed subset is listed under
"Captures".

### 2. No clipped or overflowing text — DONE (fails on main's portrait title)
The DOM audit holds every visible text box (and pseudo-element text) to:
inside every ancestor that clips it (overflow, `clip-path` — every HUD
instrument panel is a chamfered polygon — and `contain: paint`), inside the
viewport minus the safe area, no ellipsis or line clamp cutting it, and not
painted over another text (line boxes, 15% of the larger font as vertical
tolerance). Main's portrait title fails it: `#shellText > h1 "HULLBREAKER":
clipped (overflow) by #shell (text 23.4..473.3 ... box 0.0..390.0)`. Branch:
0 failures on 45 screen audits (and on 27 notch audits, box 5). Falsified:
`--mutate title-wide` (the old 13vw / .115em headline) turns exactly the
portrait title red with the same 450 px.

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
(reported, not gated: the box names 844x390; proposed inbox issue below).
Every size comes from the viewport and the safe insets, never from RIG, so
T-107's closer phone camera changes none of it.

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

### 6. Preloads — DONE
`--only preload` (the default URL, every network request counted, then 6 s
for Chromium's unused-preload warning):

| | main `08e5db1` | branch (final export `383b09f`) |
|---|---|---|
| 844x390 phone | **4 warnings**; `backdrop-meridian-anatomy-v1.webp`, `meridian-foreground-pack-v1.webp`, `backdrop-meridian-coils-v3.webp`, `meridian-component-atlas-v1.webp` each requested **x2** | 0 warnings; each of the 5 preloaded URLs (the title art + the 4 textures) requested exactly once |
| 1280x720 desktop | the same 4 warnings, the same 4 URLs x2 | the same: 0 warnings, 5 x 1 |

Cause on main: `THREE.TextureLoader` requests in CORS mode and the four
texture preloads were no-cors, so Chrome logged "A preload for ... is found,
but is not used because the request credentials mode does not match" and
fetched each again. Fix: `crossorigin` on those four; the CSS-background title
art keeps its no-cors preload. Falsified: `--mutate preload-no-crossorigin`
(one texture preload's `crossorigin` removed) → **0 pass / 4 fail**: that
URL fetched twice with its warning, at both sizes; and in pathcheck the
consumer-mode assertion went red when a texture preload lost `crossorigin`
and when the title preload gained it.

### 7. Watchdog: a slow first draw is not "stuck"; a stall in play still is — DONE
The change: until the loop has drawn 3 frames, the freeze limit is 10 s
measured from the later of boot, visibility and the last frame; after
that, the unchanged 4 s rule. Same hard "got stuck" panel either way.

**How the box's words were read (say so, entry 21).** The box says "a 6 s
*main-thread* stall". A watchdog that lives on the main thread cannot see a
literal main-thread busy-wait: its own 1 s timer does not run during it, and
when it runs again the bootstrap's pre-existing `slept` rule (a tick more
than 3 s late = a suspended page; it stops a false panel after a laptop
sleep or a background tab) resets the clock. So a 6 s busy-wait shows NO
panel in either direction, on main exactly as on this branch — measured, and
reported below, not judged. The stall the watchdog can observe — and the
one a slow first shader compile on a phone GPU produces — is frames withheld
while the page's timers run; that is what the trials inject. `slept` is
T-032's policy and this lane left it unchanged.

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

| trial | main `08e5db1` | branch (pre-merge) |
|---|---|---|
| 6 s stall from boot, 0 frames | **"got stuck" 1161 ms into the stall** (earlier runs: 993, 1237 ms) | **no panel**, frames resume (timers ran: longest quiet 459 ms) |
| 6 s stall after warm-up, PLAYING | UNDECIDED here (no panel; the page's timers stalled 2.5 s inside the hold) | **"got stuck" 5609 ms in** (timers ran: longest quiet 1023 ms) |
| 10 s stall after warm-up, PLAYING | "got stuck" 5862 ms in | **"got stuck" 7133 ms in** |
| loop dead from boot (held 25 s) | "got stuck" 669 ms in | **"got stuck" 10801 ms in** — still reported, after the 10 s warm-up limit |
| 6 s stall after frame 1 | UNDECIDED (same reason) | UNDECIDED: the first draw blocked every page timer for the whole 6 s (SwiftShader) |
| 6 s busy-wait, from boot / in play (reported) | no panel either way | no panel either way — the `slept` rule above |
| natural boot at DPR 3, observed 25 s or more (reported; the page answered only after its frame) | no panel; 5 frames, worst gap 54.0 s (after frame 1) | no panel; 5 frames, worst gap 32.4 s (after frame 1) |

Both directions are demonstrated on the branch in one run: the stall before
the first frames shows no panel, the stall after warm-up in PLAYING shows
it. Falsified in the browser, final export, under the current judgement:
`--mutate watchdog-no-warmup` (the inline warm-up set to 0 frames, i.e.
main's rule) → 2 pass / **1 fail** / 2 undecided — the "6 s from boot" trial is red: **"got
stuck" 1853 ms into the stall**, page timers running (longest quiet 900 ms).
The same mutation under the earlier judgement was red the same way (2816 ms).

**Same tree, control vs mutation** (final export `383b09f`, main merged,
load 60-80; one run each):

| trial | control | `--mutate watchdog-no-warmup` |
|---|---|---|
| 6 s stall from boot, 0 frames | **no panel**, frames resume (timers ran: longest quiet 886 ms) | **"got stuck" 1853 ms into the stall** (longest quiet 900 ms) |
| 6 s stall after frame 1 | UNDECIDED (no page timer ran for the whole 6 s) | UNDECIDED (the same 6 s) |
| 6 s stall after warm-up, PLAYING | UNDECIDED (timers stalled 2167 ms; decidable up to 750) | UNDECIDED (3167 ms) |
| 10 s stall after warm-up, PLAYING | "got stuck" 7127 ms in | "got stuck" 8433 ms in |
| loop dead from boot (held 25 s) | "got stuck" 10852 ms in | "got stuck" 659 ms in |
| natural DPR-3 boot (reported) | no panel; 8 frames, worst gap 41.5 s (after frame 1) | no panel; 6 frames, worst gap 21.6 s (after frame 1) |
| summary | **3 pass / 0 fail / 2 undecided** | 2 / **1** / 2 |

Under this run's load the 6 s after-warm-up stall could not be decided on
either side (the frame in flight and late ticks ate the margin — inbox
issue below), so on the final export the "after warm-up still panels"
direction is carried by the 10 s stall; the pre-merge run above decided the
6 s one (5609 ms). The watchdog code did not change in the merge.

The DPR-3 question from the dispatch ("DPR 3 trips the freeze watchdog under
SwiftShader"): in these runs neither tree raised the panel in a natural
DPR-3 boot watched for 25 s or more (pre-merge branch: 5 frames, 32.4 s
between frames 1 and 2; final export: 8 frames, 41.5 s; main: 5 frames,
54.0 s). On this host a first draw blocks the page's
own timers (measured at DPR 1: the "after frame 1" trial saw no page timer
run for the whole 6 s), and the bootstrap reads a tick more than 3 s late as
a suspended page. A first draw that is slow WITHOUT blocking the page — a
phone GPU compiling shaders — is the case the warm-up is for, and it is what
the "6 s from boot" trial reproduces (main: panel; branch: none). A loop that
still delivers a frame only every 16+ s after its first 3 gets the 4 s rule,
unchanged. Whether a real low-end iPhone's first compile is ever slow enough
to matter is a device question (operator question 5).

### 8. Home-screen play — DONE (on-device launch is an operator question)
`index.html` now links a web app manifest
(`assets/generated/ui/app/hullbreaker.webmanifest`: name / short name
HULLBREAKER, `display: fullscreen` with `display_override: [fullscreen,
standalone]`, `orientation: landscape`, background and theme `#07131a`, and
`start_url` / `scope` / `id` relative to the manifest, so a subpath deploy
such as GitHub Pages launches the game page) and declares
`apple-mobile-web-app-capable=yes`, `mobile-web-app-capable=yes`,
`apple-mobile-web-app-status-bar-style=black-translucent`,
`apple-mobile-web-app-title`, `theme-color` and a 180x180 opaque
`apple-touch-icon`; the viewport already had `viewport-fit=cover`. Icons are
square crops of the title key art (`assets/generated/ui/title-meridian-ascent-v1.webp`)
cut with Pillow by `tools/assets/make-app-icons.py`: 192, 512, a 512
maskable (art inside the 80% safe circle) and the 180 touch icon;
`--check` reproduces all four byte-for-byte.

`--only manifest` (the head as served, and the manifest as Chromium parsed it
through CDP `Page.getAppManifest`, every icon decoded):

| check | main `08e5db1` | branch (final export `383b09f`) |
|---|---|---|
| index.html links a web app manifest | **FAIL** (none) | PASS |
| `apple-mobile-web-app-capable=yes` + a status-bar style | **FAIL** (null / null) | PASS (`yes` / `black-translucent`) |
| the browser parses the manifest with no errors | **FAIL** (no manifest) | PASS (0 errors) |
| landscape, fullscreen / standalone, `start_url` is the game page | — | PASS (`landscape` / `fullscreen` / `…/index.html`) |
| every icon decodes at its declared size; 192, 512 and a maskable one | — | PASS (192x192, 512x512, 512x512 maskable) |
| `apple-touch-icon` decodes at 180x180 | **FAIL** (none) | PASS (180x180) |

Falsified: main itself (4 red), and five of the pathcheck domain's 23 scratch
mutations hit this box and went red (`manifest-portrait`,
`manifest-start-url-wrong`, `icon-size-lies`, `touch-icon-wrong-size`,
`no-apple-capable`). What Chromium cannot show: iOS reads the meta tags, not
the manifest's `display` / `orientation` (operator question 3).

### 9. Rotation mid-run — DONE
`--only rotate` (844x390, DPR 1, the shipped default run, PLAYING): stick held
right, FIRE and JUMP held (three fingers), then the viewport turned to
390x844 and back.

| check | main `08e5db1` | branch (final export `383b09f`) |
|---|---|---|
| three fingers hold run + fire + jump before the rotation | PASS | PASS |
| portrait: canvas, drawing buffer and camera follow 390x844 | PASS (aspect 0.4621) | PASS (css 390x844, buffer 429x928 at ratio 1.1, aspect 0.4621) |
| portrait: the HUD is re-laid out inside the viewport, deck layout width 390 | PASS — RIG panel 7,7 → 383,117 | PASS — strip 7,7 → 383,49, objective 7,59 → 383,82 |
| portrait: nothing held (deck and sim keys), no failsafe panel, still PLAYING | PASS | PASS |
| portrait: text fit audit and keyboard-copy scan | PASS / PASS | PASS / PASS |
| back to landscape: canvas / camera, HUD, nothing held | PASS — RIG panel 10,7 → 310,123 | PASS — strip 10,6 → 370,48, objective 564,6 → 834,29 |
| back to landscape: fit audit and copy scan | PASS / PASS | PASS / PASS |
| a fresh stick press after both rotations runs RIG right | PASS | PASS |
| no page errors | PASS | PASS |

On main this box already held (T-101's deck releases every code on an
orientation change; main's resize handler resizes canvas and camera). What
this branch had to keep true is that its new HUD re-lays out on the turn —
it does, both ways, inside the viewport (`rotate-portrait.jpg`,
`rotate-landscape.jpg`). Falsified: `--mutate no-canvas-resize` (the resize
listener removed) → 12 / **1**: portrait canvas still 844x390 css, camera
aspect 2.164; `--mutate no-rotation-release` (the deck's orientation release
removed) → 12 / **1**: `ArrowRight`, `Space`, `KeyX` still held after the
rotation.

### 10. First touch resumes audio on iOS — DONE (as emulated; on-device is an operator question)
`--only audio` (844x390, the default URL): iOS's rule EMULATED in Chromium —
every context starts suspended, and `resume()` takes effect only inside a
`touchend` / `click` / `keydown` dispatch; every call is logged with the event
it ran in.

| check | main `08e5db1` | branch (final export `383b09f`) |
|---|---|---|
| the first tap on the title leaves audio running | PASS (calls: `pointerdown` not honoured, `pointerup` not honoured, `touchend` honoured) | PASS (the same three calls) |
| …the effective `resume()` ran inside the touch END | PASS | PASS (`touchend`) |
| a context iOS reports `interrupted` (a call, Siri, an app switch) is resumed by the next tap, inside its touch END | **FAIL** — no `resume()` call at all | PASS (`pointerdown`, `pointerup` not honoured; `touchend` honoured) |
| no page errors | PASS | PASS |

The first-tap unlock is T-101's (`pointerup` / `touchend` listeners in
`src/ui/audio.js`); this branch adds `interrupted` — WebKit's fourth context
state, which Chromium never reports, so the trial forces the getter — as
resumable in both `unlock()` and the state-screen resume. Falsified:
`--mutate audio-no-end-unlock` (the touch-END unlock removed) → 1 / **3**: the
first tap leaves the context `suspended` (its one `resume()`, in
`pointerdown`, not honoured) and the interrupted context is not resumed. The
emulation proves WHERE `resume()` runs, not that iOS honours it: operator
question 4.

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
and iOS tags. The existing HUD-instrument smoke
(`tools/playtest/hud-instrument-smoke.mjs`: the live meters against the sim
getters, the ascent strip inside the RIG instrument, RIG clear of the
objective, the synthetic safe area; desktop 1440x900, landscape, notched
landscape, portrait) — run from a scratch copy whose only edits are its
output path and timeouts (its own path is macOS-only; inbox below): base
**4 / 4 PASS**; final export **4 / 4 PASS** (overdrive 100% and rush 96%
mirrored from the sim at every view). One earlier attempt on the final
export passed desktop and landscape and was then stopped by this session's
30-minute job limit; it was rerun whole.

### 12. pathcheck + smoke — DONE (main merged)
- Full tier on the merged tree (`9ecf462` + the tool commit `383b09f`; the
  game code is `9ecf462`'s): **4450 passed, 0 failed** (730 s, load 58-68).
  The host env skips the 4 render-submission browser-probe assertions.
  Before the merge, at `d3b0715` (the final game code then): 4425 passed,
  0 failed (322 s).
- Fast tier on the merged tree (`9ecf462`): **4155 passed, 0 failed** (47 s).
- Label diff, fast tier, same env, base vs branch before the merge
  (`tools/pathcheck-labels.mjs`): base 4097 labels, branch 4130, 0 FAIL on
  either side. **Removed: 1** — the T-101 exact sector-width pin (follow-up
  4, below). **Added: 34** — the 28 assertions of the new domain and 6
  existing per-file layer guards that now also cover the new
  `src/pure/shell-copy.js` (T-049 x2, T-051 x3, legibility x1).
- Smoke, exactly as `tools/orch/merge-task.sh` runs it (`run.mjs
  --deterministic --max-runtime-ms <15000|20000> --viewport 480x300`, judged
  by `tools/orch/smoke-verdict.mjs`), on the final export: `mid-route.json`
  **PASS** attempt 1 (`outcome=not-completed deaths=0 tick=594/594`),
  `transform-slice.json` **PASS** attempt 1 (`outcome=completed deaths=0
  tick=938/1104`).
  Before the merge: `mid-route.json` PASS attempt 1 (`outcome=not-completed
  deaths=0 tick=594/594`), `transform-slice.json` PASS attempt 1
  (`outcome=completed deaths=0 tick=938/1104`).

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
an ellipsis; desktop wraps too. Measured (`--only gateline`, pre-merge
branch): 28 characters (28 x "W" and three real shapes) on ONE line at
667x375 (185.4 px in a 197 px slot), 1100x700, 844x390, 932x430, 390x844 and
1280x720; T-102's 47-character line and the shipped 43-character
hull-fallback line are never cut (both wrap to two lines at 667 / 844 / 932,
the 47-character one also at 1100; one line at 390 portrait and 1280) and
the panel ends at y 40, above the deck's chips (72) and the central region.
Main cut the 47-char line at 667x375 and 1100x700 and the 43-char one at
667x375. Falsified: `--mutate objective-nowrap` (main's one-line ellipsis put
back into the landscape slot) → 48 pass / **6 fail**: both long lines cut at
667, 844 and 932 (e.g. 311.2 px of text in a 197 px slot at 667).

**T-201's encounter line (resume note).** On `task/T-201` (`c48ca1e`) the
line is `rollingEncounterText` in `src/pure/waves.js`, capped at
`ROLLING_TEXT_MAX = 28`. The gateline section now measures that function's
output itself: where the served tree has it, every distinct line it returns
over the state space T-201's own pathcheck enumerates (6 faces x turning /
primed / cleared / greeting x live 0-13 x pending 0-9 x following 0-4 =
**1145 distinct lines**, three of them 28 characters: `WAVE 1/6 · OBSERVE ·
CONTACT`, `WAVE 3/6 · CONTAIN · CONTACT`, `WAVE 6/6 · SCUTTLE · CONTACT`),
each written into the slot the HUD writes; where it does not (this branch
alone, main), nine of those lines verbatim (the three 28-character ones, the
longest of each other family, and the two examples `OBSERVE · 4 HOSTILES` /
`INTERCEPT · 4 FOLLOWING`). Served from a scratch combination of this branch
and `task/T-201` (`git merge-tree`, no ref or worktree touched; `hud.js`
auto-merges, the only conflict is the manifest line above): **all 1145
lines on ONE line, nothing cut, none over 28 characters**, at 667x375
(widest `WAVE 1/6 · OBSERVE · CONTACT`, 185.4 px in a 197 px slot), 1100x700
(237.6 in 366), 844x390 (185.4 in 254), 932x430 (185.4 in 282), 390x844
(170.6 in 356) and 1280x720 (237.6 in 400); on the three landscape phones
the lowest panel bottom over all 1145 is y 28.5, above the central region
(75 / 78 / 86) and the deck's chips (72) — the section's 63 checks, 0
failed. The HUD's font stack is monospace (`ui-monospace, Menlo, Consolas,
monospace`: SF Mono on an iPhone, DejaVu Sans Mono here, both ~0.6 em a
glyph), so 28 characters is one width whatever the words: 11.6 px to spare
at 667x375. This branch alone (the nine lines): one line, uncut, at all six
sizes (the same widths), 63 / 0. Main (the nine lines): one line too, at
every size — main's landscape slot used an 8 px font (158.4 px in a 237 px
slot at 667x375); what this branch adds for these lines is the 10 px face
with the fit kept, not the fit itself. Main's three failures in that run are the two long lines
above (60 / 3).

**The HUD sized from the viewport, never from RIG** — see box 4.

**Room for the between-level card (race proposal §5.5; NOT built).** Four
things that card needs now exist and are general: (1) every screen's words
per input mode live in one table, `src/pure/shell-copy.js`, and the pathcheck
domain scans every touch string in it for key names — a card's CONTINUE /
SAVE & QUIT added there is checked on arrival; (2) 44 px touch actions
(`.shell-actions` buttons with `data-shell-action`, routed through the one
lifecycle path and ignored by the deck's modal tap) for its two targets;
(3) the safe-area variables (`--hud-safe-*`, fed by `env()`) its CONTINUE
must sit inside; (4) the preload-mode assertion covers every `<link
rel=preload as=image>`, so the next level's art joining the preload gate
cannot reintroduce the double fetch (a new preload must be matched to its
consumer or the assertion fails). The browser audit and copy scan in
`phone-shell.mjs` are generic: a tenth screen is one more step in the walk.

**README / ENGINEERING** — exact lines below.

## Legacy assertions changed (decisions.md entry 21)

| assertion | change | reason |
|---|---|---|
| `tools/pathcheck/touch-deck-contract.mjs` "T-101: E/W 50°, N/S 35°, diagonals 47.5° (CONFIG.touch.stick)" | **removed** | pins numbers its own author called "reasoned, not tuned against a thumb" that the operator is expected to retune on a phone; it would go red on the first feel edit with nothing player-visible broken (T-101 review finding 4). The reasoned invariant — the run-stopping N/S sectors are the narrowest — is the next assertion and stays, as do the tiling and quarter-degree sweep checks. |

Nothing else in pathcheck, the playtest harness or any gate was weakened,
removed or rewritten. T-032's assertions still pass unchanged (the keyboard
hint still names R and the button; the inline `WATCH` numbers still mirror
the policy). The manifest renumbering (d79 → d82) moves no assertion.

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
| checks | `tools/pathcheck/t-105-phone-shell.mjs` (28 assertions, domain d82; runs the REAL inline bootstrap against a fake clock), `tools/playtest/phone-shell.mjs` (the browser matrix, now including T-201's encounter lines), README sections for both browser tools. | `tools/...` |
| merge | main `af8bb0b` merged (`9ecf462`); the domain renumbered d79 → d82 around T-103's d79 / d80 and T-201's d81. | `tools/pathcheck/manifest.mjs` |

**Design notes that are judgment calls, not measurements** (the look is the
operator's): the RIG strip keeps every instrument the old panel had (hull,
lives, weapon, overdrive, the three ascent metrics, rush) but drops the
"RIG // VITALS" and "ASCENT" captions and the second-weapon line on phones;
the strip is ~42 px tall in every state because the weapon has its own row;
the loot card hides the objective / Crown banner for its 1.25-1.9 s;
portrait uses the same strip (≈7.5% of the screen with the objective,
measured at 390x844).

## The new checks

**`tools/pathcheck/t-105-phone-shell.mjs` (d82) — 28 assertions.** Its core
runs the REAL inline bootstrap from `index.html` against a fake clock and a
stub DOM — nothing re-implemented — so the watchdog and the failsafe hint are
tested as shipped: a 6 s frame stall with 0, 1 or 2 frames drawn shows no
panel; the same stall after 40 frames shows "got stuck" 4-5 s in; a sub-4 s
stall and a hidden page never panel; a loop that dies with 0, 1 or 2 frames
drawn still gets the hard panel 10-11 s after going quiet; the real
bootstrap paints the touch hint on touch hardware / a coarse pointer /
`?touch=1` and the key hint on a desktop and under `?touch=0`. Also: the
inline `freezeVerdict` equals `src/pure/failsafe.js`'s over 4,972 states
(4,000 seeded + every threshold at -1 / 0 / +1 ms); the inline hint rule
equals `src/pure/shell-copy.js` and `resolveTouchScheme` over 20 cases; the
copy scan finds every keyboard instruction the game prints and nothing in
any touch string or in game vocabulary; every touch button presses the key
whose intent it names in that state and none repeats the modal tap's verb;
the keyboard copy is byte-identical to main; the manifest launches the game
page (relative, so a subpath deploy works), every icon is a PNG at its
declared size, the touch icon is an opaque 180x180; every image preload
matches its consumer's request mode. **Falsified: 23 single-edit mutations
in a scratch copy, every one red, control and restore 28/0**
(`evidence/falsify-pathcheck.txt`). One of them first stayed GREEN — a `>=`
→ `>` drift between the two watchdog copies hides from random states — which
is why the boundary sweep exists. That run predates the merge; none of the
files the domain reads (`index.html`, the shell's `src/pure/` modules, the
three `src/render/` texture-source files, the app manifest and icons)
changed in it.

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
| slow first shader compile | the warm-up limit (box 7) | SwiftShader is not a phone GPU — device check (question 5) |

## Captures

`reports/tasks/T-105/captures/` — before / after sheets, each capture scaled
to CSS pixels (taken at DPR 2 on phones, DPR 1 on desktop and in the
rotation trial), main on top (or left), this branch below (or right), same
walk, same tool, same host. Landscape phones are `hasTouch` + iOS UA.
Composed by a scratch script from the full runs' captures; the full set
(45 screens + 27 notch screens per tree) is reproducible with
`node tools/playtest/phone-shell.mjs`.

| file | what it shows |
|---|---|
| `l844-title.jpg` | 844x390 title: PRESS ANY KEY + key legend → TAP TO START + two-thumb legend |
| `l844-play.jpg` | 844x390 play: RIG panel 300x116 → one 360x42 strip; objective top right |
| `l844-loot.jpg` | 844x390 weapon card: painted over the RIG panel → top right, beside the strip (the objective line steps aside while it shows) |
| `l844-death.jpg` | 844x390 a death (hull-fallback line in the objective slot) |
| `l844-pause.jpg` | 844x390 pause: key legend → RESTART RUN / START SCREEN / HIDE HUD buttons + TAP TO RESUME |
| `l844-gameover.jpg` | 844x390 game over: TAP TO CLIMB AGAIN painted over the body copy and "r to climb again" cut at the bottom → one cue |
| `l844-finale.jpg` | 844x390 Crown finale: banner over the RIG panel → banner in the objective slot |
| `l844-victory.jpg` | 844x390 summit |
| `l844-failsafe.jpg` | 844x390 failsafe panel (forced): "Press R, or click the button, to play again." → "Tap the button to play again." |
| `p390-title.jpg` | 390x844 title: "HULLBREAK" (450 px headline in 390) → whole word |
| `p390-play.jpg`, `p390-finale.jpg`, `p390-pause.jpg` | portrait play / finale / pause |
| `l667-play.jpg`, `l667-death.jpg` | 667x375 play and a death (the 43-char line cut on main) |
| `l844-notch-title.jpg`, `l844-notch-gameover.jpg`, `l844-notch-victory.jpg` | 844x390 with notch insets L/R 47, bottom 21 |
| `d1280-play.jpg` | desktop 1280x720 play — unchanged (box 11) |
| `rotate-portrait.jpg` | 844x390 turned to 390x844 mid-run with three fingers down (DPR 1; box 9): main's tall RIG panel → the strip + objective; deck re-laid out, nothing held |
| `rotate-landscape.jpg` | the same run turned back to 844x390: main's 300x116 RIG panel → the 360x42 strip |

## Evidence

`reports/tasks/T-105/evidence/` — the raw logs behind every number above
(text, 368 KB; each file starts with a note naming the tree of each run).

| file | runs |
|---|---|
| `phone-shell-screens.txt` | `--only screens` on base and the pre-merge branch (boxes 1-4, 11) |
| `phone-shell-rest.txt` | safe areas, gate line, preload, rotate, audio, manifest: base, pre-merge branch, final export (boxes 5, 6, 8-10) |
| `phone-shell-gateline-t201.txt` | the gate line with T-201's lines: base, final export, final export + `task/T-201` |
| `watchdog-runs.txt` | every `--only watchdog` run, current and superseded judgement (box 7) |
| `phone-shell-mutations.txt` | every `phone-shell.mjs --mutate` run |
| `touch-proof.txt` | the deck follow-ups: control and three mutations |
| `hud-budget.txt` | the HUD area / central-region lines (box 4) |
| `compare-d1280.txt` | the desktop 1280x720 compare (box 11) |
| `hud-instrument-smoke.txt` | the HUD-instrument smoke, base and final export, plus the scratch copy's diff |
| `smoke.txt` | the merge-gate smoke, pre-merge and final export (box 12) |
| `pathcheck.txt` | full and fast tiers before and after the merge, and the label diff (box 12) |
| `falsify-pathcheck.txt` | the 23 single-edit mutations of the pathcheck domain |
| `abuse-frozen-watchdog.txt` | the durability harness's frozen-watchdog runs (inbox) |

## Verification commands and results

Every shell first ran `. ~/.hullbreaker-host.env`. Servers were
`node <worktree>/tools/serve.mjs <port> --root <tree> --quiet`, each alive
exactly as long as the job that used it, on 8784 / 8794 / 8796 / 8798 for
the branch (the worktree, later `git archive` exports of the commit under
test) and 8785 / 8795 / 8797 / 8799 for the base (a `git archive` export of
main `08e5db1`). A file that exists only on the branch
(`src/pure/shell-copy.js`) was fetched before each run as a pin: 200 on a
branch tree, 404 on the base. The HUD-instrument smoke starts its own
in-process server on the export it is given.

| command | result |
|---|---|
| `git merge main` (merge commit `9ecf462`) | one conflict, `tools/pathcheck/manifest.mjs`; resolved d79 / d80 T-103, d82 T-105 |
| `HB_GATE_FAST=1 node tools/pathcheck.mjs`, merged tree | **4155 passed, 0 failed** (47 s) |
| `node tools/pathcheck.mjs` (full tier), merged tree (`383b09f`) | **4450 passed, 0 failed** (730 s) |
| `node tools/pathcheck.mjs` (full tier) at `d3b0715`, before the merge | 4425 passed, 0 failed (322 s) |
| `node tools/pathcheck-labels.mjs --rev 08e5db1` / `--tree <worktree>` (fast tier), before the merge | 4097 / 4130 labels, 0 FAIL either side; -1 / +34 (`evidence/pathcheck.txt`) |
| scratch falsifier over `tools/pathcheck/t-105-phone-shell.mjs` (23 single-edit mutations of `index.html`, `src/pure/*`, the manifest and icons in a scratch copy) | control 28/0, **23/23 red**, restored 28/0 (`evidence/falsify-pathcheck.txt`) |
| smoke as `merge-task.sh` runs it: `node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000 --viewport 480x300` + `tools/orch/smoke-verdict.mjs`, final export | **PASS attempt 1**, `outcome=not-completed deaths=0 tick=594/594` (before the merge: the same) |
| same, `scripts/transform-slice.json --max-runtime-ms 20000`, final export | **PASS attempt 1**, `outcome=completed deaths=0 tick=938/1104` (before the merge: the same) |
| `node phone-shell.mjs --only screens` base / branch, 5 views, DPR 2 | **54 / 49** vs **103 / 0** |
| `node phone-shell.mjs --only safe` base / branch, 3 landscape views | **42 / 42** vs **84 / 0** |
| `node phone-shell.mjs --only gateline` base / branch (pre-merge, before the T-201 lines) | **51 / 3** vs **54 / 0** |
| `node phone-shell.mjs --only gateline` base / final export / final export + T-201 (with the T-201 lines) | **60 / 3** vs **63 / 0** vs **63 / 0** (1145 lines enumerated on the last) |
| `node phone-shell.mjs --only preload` base / final export | **0 / 4** vs **4 / 0** |
| `node phone-shell.mjs --only watchdog` base / branch (pre-merge) | **2 pass / 1 fail / 2 undecided** vs **4 / 0 / 1** |
| `node phone-shell.mjs --only watchdog` final export: control / `--mutate watchdog-no-warmup` | **3 / 0 / 2** vs 2 / **1** / 2 |
| `node phone-shell.mjs --only rotate,audio,manifest` base / final export | base: rotate 13 / 0, audio 3 / **1**, manifest 0 / **4**; final (with preload): **27 / 0** — preload 4, rotate 13, audio 4, manifest 6 |
| `node phone-shell.mjs --compare <base> <branch>` | desktop 1280x720 title / play / pause: **0 differences** |
| `node phone-shell.mjs --mutate <m>` x 9 | every one red on its target (next section) |
| `node touch-proof.mjs --only frozen --views landscape` | **42 / 0**; `--mutate` chip-stays-lit 41/1, ignore-leave-playing 40/2, no-stale-release 41/1 |
| `/opt/hb-art/bin/python tools/assets/make-app-icons.py --check` | all 4 icons reproduce byte-for-byte (Pillow 13.0.0) |
| scratch copy of `tools/playtest/hud-instrument-smoke.mjs` (output path and timeouts widened only), base / final export | **4 / 4** vs **4 / 4** (desktop 1440x900, landscape, notched landscape, portrait) |
| `node tools/durability/abuse.mjs` (frozen-watchdog), 3x base, 3x branch | FAIL 3/3 on both — the harness's 15 s boot wait on this host (inbox) |

## Falsification of the browser checks

Each `--mutate` serves ONE file with ONE defect (a missing anchor throws, so a
mutation cannot silently do nothing) and must turn the named checks red on the
branch. All runs: `node phone-shell.mjs --base-url <branch> --mutate <m> --only
<section> --views <v> --dpr 1 --no-shots`.

| mutation (the defect it plants) | section / view | result | what went red |
|---|---|---|---|
| `copy-keys-on-touch` (the shell speaks keys under touch) | screens / 844 | 21 pass / **4 fail** | title, pause, game over, victory: the keyboard-copy scan |
| `failsafe-hint-keys` (the inline hint ignores touch) | screens / 844 | 24 / **1** | the failsafe panel: `"Press", "click"` |
| `title-wide` (main's 13vw / .115em headline) | screens / 390 | 18 / **1** | portrait title: `"HULLBREAKER": clipped (overflow) by #shell` |
| `objective-nowrap` (main's one-line ellipsis back in the landscape slot) | gateline / all | 48 / **6** | the 47- and 43-char lines at 667, 844, 932 (e.g. 311.2 px in a 197 px slot). Its first version only deleted the wrap — measured 54 / 0, vacuous (the ellipsis needs `overflow: hidden` too) — and was corrected before this run |
| `preload-no-crossorigin` (one texture preload loses CORS) | preload / 844 + 1280 | 0 / **4** | its "not used" warning and that URL fetched twice, at both sizes |
| `watchdog-no-warmup` (warm-up beats 0: main's rule), final export, current judgement | watchdog / 844 | 2 / **1** (+ 2 undecided) | "6 s from boot": "got stuck" 1853 ms into the stall (timers running, longest quiet 900 ms) |
| `audio-no-end-unlock` (the deck's touch-END unlock removed) | audio / 844 | 1 / **3** | the first tap leaves the context `suspended` (one `resume()`, in `pointerdown`, not honoured); the `interrupted` context is not resumed |
| `no-canvas-resize` (the resize handler stops resizing the canvas) | rotate / 844 | 12 / **1** | portrait after rotation: canvas still 844x390 css, camera aspect 2.164 |
| `no-rotation-release` (orientation changes release nothing) | rotate / 844 | 12 / **1** | three fingers' codes (`ArrowRight`, `Space`, `KeyX`) still held after the rotation |

`touch-proof.mjs` mutations: see the follow-ups table above.

## Operator packet (box 13)

**Serve the branch** from any machine on the phone's Wi-Fi
(`tools/serve.mjs` listens on every interface by default), from the main
checkout, with any checkout of `task/T-105` as the root:

```sh
git worktree add ../hb-T-105 task/T-105        # or use the lane's worktree
node tools/serve.mjs 8749 --root ../hb-T-105    # on this host: --root /home/user/hullbreaker/.claude/worktrees/T-105
```

On the iPhone, Safari, held sideways: `http://<computer-ip>:8749/index.html`.
(Once merged and deployed, the same walk at
`https://aetherwing-io.github.io/hullbreaker/` is the truer home-screen
test: a plain-http LAN address may itself change how iOS treats an icon.)

| # | URL (after `http://<computer-ip>:8749/`) | what to do |
|---|---|---|
| A | `index.html` | Title → tap to start → play a minute → II (pause) → tap to resume → die once → let the run end (game over) |
| B | `index.html`, then Share → **Add to Home Screen**, and launch from the icon | the same walk, from the home screen |
| C | `index.html` | mid-run, rotate to portrait and back with your thumbs down |
| D | `index.html?touch=legacy` | the old one-thumb scheme with the old (keyboard) copy — the escape hatch, for comparison |
| E | on a desktop at 1280x720: `index.html`, then `index.html?touch=1` | the keyboard shell (meant to be unchanged), then the touch shell with a mouse |

Questions (please answer from what you saw; none of these has a right answer):

1. On each screen (title, pause, death, game over, summit), what did the
   screen tell you to do, and could you do it with your thumbs alone?
2. During play, where did you look for hull, weapon, overdrive and the
   objective line? Was anything at the top of the screen in the way of RIG
   or of what was coming — and if so, what?
3. Launched from the home screen (B): did the game open full screen and
   sideways, and was anything you needed to read or touch under the notch,
   the Dynamic Island or the home indicator?
4. On your first tap on the title, did you hear the game? (Note whether the
   ring/silent switch was on.) Did sound come back after a phone call, Siri
   or switching apps?
5. Did the page ever zoom, scroll, bounce, or swipe you back a page while you
   played — in Safari (A) or from the home screen (B)? And did the game ever
   show "The game got stuck" while starting up?

**Open feel questions this lane cannot answer** (no recommendation implied):
the weapon card (1.25-1.9 s) hides the objective line, and during the Crown
fight the Crown banner, while it shows; in portrait the strip, the objective
and the deck's chips leave an empty band between the top HUD and the chips;
the game-over screen on touch offers one button (START SCREEN) and leaves the
restart to the deck's TAP TO CLIMB AGAIN cue; the RIG strip drops the panel's
captions and the second-weapon line on phones.

## README / ENGINEERING lines for the integrator

The lane may not edit either file. Exact changes, written against main
`af8bb0b`:

**README.md line 13** — today "Free, no install, nothing to download —
keyboard required. If it ever fails" stops being true with T-101 + T-105.
Replace lines 13-14 with:

```
Free, no install, nothing to download — a keyboard, or a phone held sideways
(on an iPhone, Safari's Share → Add to Home Screen gives it the whole
screen). If it ever fails to start, the game tells you so in plain language
instead of going black.
```

**README.md, after line 57** ("height, and i-frames on hit. Three lives.") —
new:

```
On a touch screen (held sideways) the two-thumb deck is on by default:

| Touch | Action |
| --- | --- |
| Left thumb, anywhere on the left of the screen | Move + 8-way aim (the stick appears under your thumb) |
| JUMP | Jump — hold for height, press again in the air for the double jump |
| FIRE | Fire (hold) — or turn on AUTO |
| Stick down + JUMP | Drop through catwalks |
| SWAP / II / AUTO | Swap weapons / pause (tap anywhere to resume) / auto-fire on or off |
```

**README.md lines 104-107** ("Useful URL flags while developing"; I-112 will
also edit this paragraph to drop `?zip=1` / `?momentum=1`) — append to the
end of the paragraph, whatever it then says:

```
· `?touch=legacy|0|1` (touch input: `legacy` = the rejected one-thumb
scheme, `0` = none, `1` = the two-thumb deck on a desktop, for review; the
two-thumb deck is the default on touch hardware) · `?autofire=1|0` (overrides
the deck's AUTO chip, which is off by default and remembered on the device)
```

**docs/ENGINEERING.md line 19** ("Run modes and URL flags") — replace "The
game boots to its **start screen**; press any key (or click) to run." with:

```
The game boots to its **start screen**; press any key (or click, or tap) to
run.
```

and add a paragraph after the first one (after line 27, "how the harness
screenshots it."):

```
**Touch.** On touch hardware (or a coarse pointer) the two-thumb touch deck
(T-101) is ON by default: a floating stick on the left 45% of the glass,
JUMP and FIRE on the right, SWAP / PAUSE / AUTO chips. `?touch=legacy`
restores the rejected one-thumb scheme verbatim, `?touch=0` turns touch input
off, and `?touch=1` shows the two-thumb deck on a desktop (mouse-driven, for
review). `?autofire=1|0` overrides the AUTO chip (default off; the player's
last choice is remembered). Under the two-thumb deck every screen speaks
touch (T-105, `src/pure/shell-copy.js`): the title says TAP TO START, the
pause / death / summit screens drop their key line for the deck's "TAP TO …"
cue and offer RESTART RUN / START SCREEN / HIDE HUD as buttons, and the
failsafe panel says to tap its button. On a phone the HUD is one strip
across the top that stays out of the central 60% x 60% of the screen.
`node tools/playtest/phone-shell.mjs` measures all of it (README in
`tools/playtest/`).
```

## PROPOSED INBOX ISSUES

## I-??? | bug | S3 | repro: `cd tools/durability && node abuse.mjs` (scenario `frozen-watchdog`) on main `08e5db1`, on a host whose boots take 22-67 s | evidence: reports/tasks/T-105/evidence/abuse-frozen-watchdog.txt
The durability harness's frozen-watchdog scenario fails 3/3 on main here (and 3/3 on this branch): `panel=false after a dead loop`. `openPage()` waits 15 s for `isBooted()` and swallows the timeout (`.catch(() => {})`), so on a slow host the scenario kills `requestAnimationFrame` before the game has booted and gives up 12 s later, before the boot it is waiting on has finished. A probe that waits for `isBooted()` and 3 frames before the kill saw the panel ~4 s after the kill on main and ~4.7 s on the branch. Fix direction: make the boot wait loud (fail the scenario as "did not boot") or scale it with `HB_PROBE_BOOT_MS`, as `tools/orch/phone-probe.mjs` and `tools/playtest/perf-probe.mjs` do.

## I-??? | bug | S3 | repro: `node tools/playtest/phone-shell.mjs --only watchdog --views l844` (trial "frame stall 6 s after warm-up") on a host whose frames cost ~2 s | evidence: reports/tasks/T-105/evidence/watchdog-runs.txt
The freeze watchdog times silence from the 1 s tick that SAW the last frame (`if (beats !== lastBeats) { lastBeats = beats; lastBeatAt = t; }`, `index.html`), not from the frame, so the frame still drawing plus up to two tick periods come off the 4 s rule: a 6 s stall after warm-up went unreported in seven of eight runs here (main three times, the branch twice, the branch with its warm-up mutated off twice — the after-warm-up rule is the same 4 s rule in all three) and was reported once, 5609 ms in. On a phone (16 ms frames, punctual ticks) the same rule reports a 6 s stall 4-5 s in — asserted on the real bootstrap with a fake clock in `tools/pathcheck/t-105-phone-shell.mjs`. Unchanged by T-105 (its warm-up touches only the first 3 frames). Fix direction, not made: stamp `lastBeatAt` inside `beat()`; that makes the watchdog up to one tick more eager, which is a T-032 policy call.

## I-??? | bug | S3 | repro: `cd tools/playtest && node hud-instrument-smoke.mjs` on Linux, or on any host whose boot exceeds 15 s | evidence: reports/tasks/T-105/evidence/hud-instrument-smoke.txt
The HUD-instrument smoke writes its captures under the macOS-only `/private/tmp/`, and hard-codes a 30 s `goto`, a 15 s wait for `HB`, a 5 s wait and Playwright's default 30 s screenshot timeout; this host boots in 22-98 s, so it cannot finish. T-105 ran a scratch copy with only those paths and timeouts widened. Fix direction: an `--out` argument and the `HB_PROBE_BOOT_MS` knob.

## I-??? | bug | S3 | repro: phone (or `hasTouch` 844x390), `index.html` → start → II → the VIEW / AUDIO / SHELL options | evidence: reports/tasks/T-105/captures/l844-pause.jpg
The pause panel's option links (NEAR / MID / FAR, audio ON / OFF, shell ON / OFF) are 14 px tall and 15-29 px wide on this branch at 844x390 (16 px tall on main; the branch's compact landscape column took 2 px off), far under a 44 px thumb target, in a panel surrounded by the deck's tap-to-resume. The branch's RESTART RUN / START SCREEN / HIDE HUD buttons beside them are 44 px. They also navigate with a plain `<a href>`, so every toggle adds a history entry that Safari's left-edge swipe can return to mid-run (needs an iPhone to confirm). Fix direction: 44 px targets, and `location.replace()` for the reloading toggles.

## I-??? | bug | S3 | repro: `node tools/playtest/phone-shell.mjs --only screens --views l667` (iPhone SE / 8 size), Crown finale or a weapon card on screen | evidence: reports/tasks/T-105/evidence/hud-budget.txt
At 667x375 the HUD covers 11.58% of the screen during the Crown finale and 12.72% while a weapon card shows (play: 7.67%), over the 10% that T-105 holds at 844x390, though never inside the central 60% x 60%. Landscape phones narrower than 667 px (e.g. 568x320) were not measured at all. Fix direction: a smaller finale banner / weapon card below ~700 px width, if the operator wants the 10% line there too.

## I-??? | bug | S3 | repro: `node tools/pathcheck-labels.mjs --rev <ref> --out <file>` on the shared host while other lanes capture | evidence: tools/pathcheck-labels.mjs `materialise()`
Each run materialises the whole tree in the system temp dir — `git archive` to a tar, then extracted beside it (459 MB extracted for this tree, most of it `reports/` and `artifacts/`). On this shared disk that ended in ENOSPC during T-105 (69 MB free at worst). Fix direction: archive only the paths the suite reads.

## Hand-off

- Worktree `/home/user/hullbreaker/.claude/worktrees/T-105`, branch
  `task/T-105`: code and tools final at `383b09f`; the commits on top of it
  touch only `reports/tasks/T-105/` (this report, its evidence, two
  captures). Main `af8bb0b` merged as `9ecf462`. Not merged to main; tree
  clean.
- **Single best next action:** run `reviewer` and `playtester` on this
  worktree (the playtester's `phone-shell.mjs` and `touch-proof.mjs` runs
  are the same commands as above), then queue the operator's iPhone pass
  (packet above) — the on-device checks (home-screen launch, insets, first-tap
  sound, no zoom / back-swipe) are the evidence no harness here can produce.
