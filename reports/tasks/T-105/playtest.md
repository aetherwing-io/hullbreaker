PASS

# T-105 playtest gate: the phone shell

Gated head: `task/T-105` @ **4fd25af** (`git -C .claude/worktrees/T-105 rev-parse HEAD` read 4fd25afc5bd2e2ceb2523f279be91b6101ac6120 at the
start and again after the last run; tree clean). Code is final at 383b09f, main af8bb0b merged in (9ecf462). Everything I ran or served
came from a `git archive 4fd25af` export of the lane (931 files, every one hash-compared against `git ls-tree -r 4fd25af` with
`git hash-object`: 0 mismatches; the only addition is the `tools/playtest/node_modules` symlink). The main reference is a `git archive
fa18126` export (922 files, 0 mismatches). fa18126 is `main` as of the dispatch and is `src` / `index.html` / `assets` / `tools`
identical to af8bb0b (`git diff af8bb0b fa18126 -- src index.html assets tools` is empty), so the A/B is "exactly the T-105 diff" (22
files). Main has since moved (T-201 merged, 71d3941); I did not re-gate against it, see "What this cannot claim".

**Smoke ran at 4fd25af and re-judges PASS on both scripts, so the integrator's `--skip-smoke` condition is met** (section 1).

Verdict basis: every claim I could reproduce reproduced, on every reproduced number the lane matches its own report (one main-side number
did not, section 2), nothing a player sees was broken in any frame I looked at, the page threw nothing in any run, and what I
attacked on my own (the touch buttons with real touches, the HUD with the widest values a run can print, the watchdog in both
directions with a probe that shares no code with the lane's, rotation on state screens) turned up only the S2 / S3 items below. There is
no defect that blocks the merge. Findings (S2/S3) and the
operator questions are at the end. Bots and DOM audits are evidence about layout, copy, pacing and regressions; none of this is a verdict
on feel.

Host: Chromium 141.0.7390.37 under SwiftShader, 4 cores shared with ~8 agents, load average 60-95 for the whole gate; boots 60-110 s,
frames 1-2 s. DPR 2 for every phone capture (the lane's tool default), DPR 1 for my probes; DPR 3 only inside the lane's own reported
natural-boot trial (section 5), never as a judged result. `. ~/.hullbreaker-host.env`
in every shell (`HB_HARNESS_SLOWDOWN=100`, `HB_SMOKE_VIEWPORT=480x300`).

`S=/tmp/claude-0/-home-user-hullbreaker/0c748965-85bc-570b-a00a-0186b03c4f4f/scratchpad/t105-gate` below. Servers: lane 8812, main 8813,
both `node /home/user/hullbreaker/tools/serve.mjs <port> --root <export> --quiet --keep-orphan` from the main checkout. Pin proven on the
wire: `curl` of `/index.html` returned the commit's blob (lane 6b8eced5, main 2cd1acf8, `git hash-object` of the body), and
`/src/pure/shell-copy.js` and the manifest answer 200 on 8812 and 404 on 8813. Servers killed and both exports deleted when done (`$S/lane-tree.txt` and `$S/main-tree.txt` keep the hash manifests).

## SPRINT boxes at a glance (what I reproduced, and where)

| box | my result |
|---|---|
| capture matrix | 844x390, 667x375, 390x844 and 1280x720 reproduced at DPR 2 on both trees (932x430 is the lane's own run, not mine) |
| no clipped / overflowing text; fails on main's portrait title | lane 80 / 0; main fails, incl. `#shellText > h1 "HULLBREAKER": clipped (overflow) by #shell` (section 2) |
| no keyboard-only copy on touch; desktop keeps its keys | lane 0 hits on every phone screen (and 0 on my broader scan); main fails; desktop still shows its keys (section 2) |
| HUD <= 10% and out of the central 60 x 60 at 844x390 | 6.47% play / 9.08% finale by the tool, 6.60 / 9.23 by my pixel union; none central; main 13.88% / 21.68%, central |
| safe areas (L/R 47, bottom 21) | lane 28 / 0 at 844x390 and at 667x375; main 15 / 13 at 844x390 (section 3) |
| preloads: no warning, one request each | lane 0 warnings and 1 request per URL at 844x390 and 1280x720; main fails both (section 7) |
| watchdog: stall before first frames shows no panel, same stall after warm-up does | both directions shown independently and with the lane's tool (section 5) |
| home-screen play | lane manifest section 6 / 0, main 0 / 4; icons fetched and viewed (section 7) |
| rotation mid-run | 13 / 0; and rotated on pause / game over / summit screens (section 9) |
| first touch resumes audio on iOS | emulated rule: lane 4 / 0, main 3 / 1; on-device is the operator's |
| desktop 1280x720 unchanged | 0 DOM differences, 0 differing pixels on 4 of 5 screens and 21 pixels at 1/255 on the fifth (section 4) |
| pathcheck green; smoke-verdict PASS on both | smoke PASS and PASS at 4fd25af (section 1); I did not run pathcheck (the merge gate does) |
| operator packet | present in the build report (five questions, URLs); not judged |

## 1. Merge-gate smoke (lane harness from the lane export, pinned lane server)

```
cd $S/lane/tools/playtest      # node_modules symlinked from the main checkout
node run.mjs scripts/mid-route.json --deterministic --viewport 480x300 --base-url http://127.0.0.1:8812 --out $S/smoke-mid
node run.mjs scripts/transform-slice.json --deterministic --max-runtime-ms 20000 --viewport 480x300 --base-url http://127.0.0.1:8812 --out $S/smoke-tr
node /home/user/hullbreaker/tools/orch/smoke-verdict.mjs $S/smoke-mid/report.json     # and $S/smoke-tr/report.json
```

| script | verdict | outcome / deaths / tick | errors | wall |
|---|---|---|---|---|
| mid-route | **PASS** (attempt 1) | not-completed / 0 / **594 of 594**, ledger complete, 26 of 26 events | bootError null, pageErrors 0, consoleErrors 0 | 321 s |
| transform-slice | **PASS** (attempt 1) | completed / 0 / **938 of 1104** (victory), `ovTitle` read as "BREACH CLEAR" by the sampler | bootError null, pageErrors 0, consoleErrors 0 | 714 s |

Metrics, read as trends (A.5 vocabulary): mid-route idle fraction 0.333, minEdgeMargin 26.53 tiles, hp 3 to 2 (3 hits survived, 0 deaths),
route ids [mid-catwalk, upper-chimney, wall-launch, recovery-scramble], dare pocket entered and reward taken, proxy protoScore 1127.3.
Transform: idle 0, minEdgeMargin 30.07, no routes so protoScore is unavailable by design.

Control, same harness and flags against main (`$S/smoke-main-mid`, also PASS 594 of 594): the **simulation end state is identical** (x
55.649, y 1, scrollX 56.2042574319988, gameMs 9900.198, hp 2, kills 0, edgeMargin 26.533, same route ids, same pocket result, same
lives). Three polled metrics differ (idle fraction 0.333 vs 0.345, idle 96.2 s vs 97.5 s, proxy protoScore 1127.3 vs 1093.6): those are
computed from poll samples, and this host sampled at 541 ms vs 495 ms mean intervals (585 vs 586 samples), so that is sampling noise,
not a sim change. The shell lane does not touch the sim and the deterministic end state says so.

## 2. Phone screens, lane vs main (the headline)

```
cd $S/lane/tools/playtest
node phone-shell.mjs --base-url http://127.0.0.1:8812 --label branch --out $S/ps-lane --only screens --views l844,l667,p390,d1280 --dpr 2
node phone-shell.mjs --base-url http://127.0.0.1:8813 --label base   --out $S/ps-main --only screens,safe --views l844,l667,p390,d1280 --dpr 2   # the LANE's tool, main's server
```

Phone views are `hasTouch` + `isMobile` + the iOS 17.5 Safari UA at DPR 2; the desktop view is 1280x720 with no touch. Nine screens per
view (title, play, loot card, death, pause, game over, finale, summit, forced failsafe panel).

| view | main pass / fail | lane pass / fail |
|---|---|---|
| 844x390 | 10 / **15** | 25 / 0 |
| 667x375 | 9 / **14** | 23 / 0 |
| 390x844 | 10 / **9** | 19 / 0 |
| 1280x720 | 13 / 0 | 13 / 0 |
| **total (80 checks)** | **42 / 38** | **80 / 0** (`$S/ps-lane/report-branch.json`, 4315 s) |

The main-side fail counts per view (15 / 14 / 9 / 0) are exactly the numbers in the lane's report, and the failures are the same ones:
keyboard copy on a touch device ("PRESS ANY KEY", WASD / ARROWS / SPACE / ESC on the title; P / ESC / R / Q / H on pause; R / Q on game
over and summit; "Press R, or click" on the failsafe panel; the "C" swap hint in portrait), the portrait title headline clipped to
"HULLBREAK" (text 23.4..473.3 in a 390 px box), the deck's TAP TO CLIMB AGAIN painted over "GET BACK UP THERE." and over the summit's
key line, the loot card and the Crown banner painted over the RIG panel, the 43-character hull-fallback line clipped at 667. The lane
passes the same checks on every view, with no page error in any walk.

HUD budget at 844x390 (the box names this size). Tool numbers, then my own recomputation from the audit JSON (rasterised union of the
HUD boxes, `$S/probes/hudcheck.mjs`):

| state | main | lane (tool) | lane (mine) | inside the central 60 x 60? |
|---|---|---|---|---|
| play | 13.88% | **6.47%** | 6.60% | main: RIG panel 300x116, yes. lane: no |
| death (2-line objective) | 13.88% | 7.42% | 7.50% | lane: no |
| Crown finale | 21.68% | **9.08%** | 9.23% | lane: no |
| loot card (1.25-1.9 s transient) | 21.35% | 9.93% | 10.06% | lane: no |

Play and finale are inside 10% by both methods; the transient loot card is on the line (9.93 / 10.06) and the box does not gate it. The
strip is 360x42.3 at the top left (lowest edge y 48.3 of 390, the central region starts at 78), the objective sits top right, and no HUD
box overlaps a deck control at any measured state. At 667x375 the lane is play 7.67% and death 8.65% but **finale 11.58% and loot card
12.72%** (mine 11.74 / 12.92), over 10% though still outside the central region; the box names 844x390 and does not gate this, but I
confirm the lane's own note (finding F2). Portrait 390x844: play 7.65%, finale 11.43% (main 16.22 / 15.15). One number did not
reproduce: the lane's report gives main's finale at 844x390 as 24.98%; I measure 21.68% on the same state. The difference is the objective
panel's 3.31% (21.68 + 3.31 = 24.99), so I infer the lane's capture still counted that panel mid-fade; I did not verify it. It
changes nothing: main is more than twice the bound either way.

What I looked at myself (DPR 2 captures under `$S/ps-lane/`, `$S/ps-main/`): all nine lane screens at 844x390; title, play, loot, death,
pause, game over, finale, summit at 667x375; title, play, loot, pause, game over, finale, summit at 390x844; six of the main screens at
844x390 (title, play, pause, death, game over, failsafe) and the title, play and summit at 390x844 for comparison. Judgements:

- **One instruction per screen on touch**: title = TAP TO START (plus a legend line "LEFT THUMB MOVE + AIM, RIGHT THUMB JUMP + FIRE, II
  PAUSE"); pause = three 44 px buttons and the deck's single "TAP TO RESUME"; death/game over = one START SCREEN button and the single
  "TAP TO CLIMB AGAIN"; summit = START SCREEN and the same cue; failsafe = "Tap the button to play again." Main shows two contradictory
  lines on pause, game over and the summit. I also ran a scan of my own over all 27 lane touch audits with a broader pattern set (press,
  click, key(s), keyboard, esc, escape, enter, return, space, shift, ctrl, wasd, arrow(s), mouse, hover, pointer, tab, and any lone capital
  letter): zero key words; the only lone capitals are the threat rank "D" and "K / 100".
- **Nothing clipped or under the notch / home indicator**: none in the frames above. At 667x375 the 43-character hull-fallback line wraps to
  two lines, whole (main clips it). The portrait headline fits (title: 24 px left margin and 66 px free on the right; the "SIGNAL LOST" game-over title has 14 / 19 px). The summit/game-over/pause columns fit above the cue at
  667x375 and 844x390.
- **HUD out of RIG's way and of the route ahead**: RIG stands near (357, 232) of 844x390 in the frozen start frame; the strip ends 184 px
  above him and the platforms ahead sit at y 200-250. The live frame (section 9) shows the same in play.
- **Style**: same chamfered-panel language as the existing HUD and overlay; icons are crops of the title key art. No style break that I can
  name; the concept boards do not cover shell chrome, so I did not hold it to them.
- Anatomy, FAR-view tells, pacing dead spots: not touched by this lane. The deck's modal arming (0 ms pause, 650 ms game over, 2.4 s summit)
  is T-101's.
- Pre-existing and unchanged, so not this lane's: the summit's "RIG:" line is absent in portrait on main and lane alike; the weapon name in
  the strip ("FRK/SKR/VOL SCATTERBLOOM") differs from the loot card's ("HYDRA STARFIRE BLOOM").

## 3. Safe areas (notch L/R 47, home indicator 21)

```
node phone-shell.mjs --base-url http://127.0.0.1:8812 --label branch --out $S/ps-lane-safe --only safe --views l844,l667 --dpr 2
```

Lane **28 / 0 at 844x390 and 28 / 0 at 667x375** (56 / 0 in 2751 s; `insets:cdp`, the page's `env()` read 47 / 47 / 21). Main, same walk at
844x390 (`$S/ps-main.log`): **15 / 13**, the lane's own number; I stopped main's run before its 667x375 notch walk, so I did not
reproduce its 10 / 18. Captures looked at: lane notch title (text from x 59), play (strip from x 51, the deck chips inside x 797) and game
over (cue above the home indicator band). Main's failures there are the lane's: title text from x 42.2 under the 47 px inset, game-over
title from y -12.7 and body to y 402.7 on a 390 px glass.

## 4. Keyboard shell unchanged (1280x720, no touch)

- Lane's compare of the desktop audits, `node phone-shell.mjs --compare $S/ps-main $S/ps-lane`: **0 differences** (every named box, every
  text box with font size and rect, the visible copy, for title, play and pause).
- Pixels, mine (`$S/probes/ab-desktop.mjs`, both trees, Playwright `animations: 'disabled'` so the breathing title art, the muzzle flash and
  the victory beam cannot differ by phase): **title, pause, game over and summit are 0 differing pixels**; play differs by **21 pixels of
  at most 1/255 on a single line at y = 47** (the objective panel's lower edge, a sub-pixel effect of the wrap rule), invisible. Without
  that option the title differed by 82% of pixels: that is the 13 s `title-breathe` animation caught at two phases, the CSS `@keyframes` /
  `animation` lines are identical between the trees. A reader of `phone-shell`'s plain PNGs should know that.
- The sampler, with the harness's own `sampleState()` serialised into the page (`$S/probes/ov-probe.mjs`, play / pause / game over / summit,
  default run and traversal slice, both trees): **0 of 60 fields differ, twice**. `#ovTitle` reads PAUSED / SIGNAL LOST / SIGNAL SENT /
  TRAVERSAL CLEAR, `#ovBody` keeps "p / esc to resume" and "r to climb again", `isVictorySample` true on the summit; the transform-slice
  smoke trace carries `ovTitle` "BREACH CLEAR". The harness needed no change.
- Escape hatches on a touch device (844x390, `hasTouch`): `?touch=0` is **identical to main in every field** (title, pause, game over,
  summit, failsafe hint). `?touch=legacy` is identical to main except the failsafe panel, which says "Tap the button to play again." (the
  lane's documented choice: its button is a real tap target under every touch scheme).
- `?selftest=1` at 1280x720 on the lane: **SELFTEST PASS (39 checks)**, no page errors, failsafe not showing, 6 frames drawn
  (`$S/probe-out/selftest-lane.log`).

## 5. Watchdog, both directions

My own probe, which shares no code with the lane's (`$S/probes/wd-probe.mjs`): `requestAnimationFrame` is withheld by an init script
while the page's own timers keep running (a free main thread and frames that do not arrive, the only stall a watchdog on the main thread
can observe), and a 20 ms timer chain records the longest quiet stretch so a "no panel" result can be called UNDECIDED when the host's
timers did not run. 844x390, DPR 1, iOS UA, `hasTouch`:

| trial | lane | main (control) |
|---|---|---|
| **slow first draw**: 0 frames for 6 s after `booted()` | **no panel**, in-stall timer gap 155 ms (decidable), frames resume | **"The game got stuck."** 1087 ms after boot ("the frame loop stopped 21s ago") |
| **stall in play**: `requestAnimationFrame` killed for good after boot + 3 frames | **panel at 5851 ms** ("stopped 4s ago (4 frame(s) drawn)"), timer gap 1697 ms | panel at 7559 ms (timer gap 3027 ms) |
| **dead from boot**: rAF withheld 40 s | panel at **10273 ms** after boot ("0 frame(s) drawn"), still reported, after the 10 s warm-up limit | not run (the 6 s hold panelled at 1.1 s; the lane's own table has main at 669 ms) |
| natural boot at DPR 2, watched 45 s | no panel; first draw ~16 s per frame under this load (the draw blocks the page's timers, so the bootstrap reads it as a suspended page); screenshot timed out | not run |

The lane's own tool on the lane (`node phone-shell.mjs --only watchdog --views l844`, `$S/ps-lane-wd.log`): **3 pass / 0 fail / 2
UNDECIDED** in 842 s, which is the shape of its own final-export table. Pass: 6 s stall from boot (no panel, frames resume); 10 s stall
after warm-up in PLAYING (panel 7779 ms in); loop dead from boot (panel 10108 ms in). **UNDECIDED, not counted as passes**: 6 s after the
first frame and 6 s after warm-up in PLAYING (this host's page timers stalled during the hold; the 4 s rule counts silence from the tick that
saw the last frame). The in-play direction is therefore decided by the lane's 10 s trial and by my kill-rAF trial above, not by its 6 s one.
Reported, not judged: 6 s main-thread busy-waits (no panel from boot or in play, the `slept` rule, on main exactly as on the lane) and a
natural DPR-3 boot (no panel, worst frame gap 58 s on this host).

I read "6 s main-thread stall" as the lane did (frames withheld, timers running): a literal busy-wait blocks the watchdog's own timer, which
the bootstrap reads as a suspended page in both directions, so it cannot be a test. I agree with that reading and say so here because the
SPRINT box's words are literal.

## 6. Touch deck regressions

```
node touch-proof.mjs --base-url http://127.0.0.1:8812 --out $S/tp-lane                                   # defaults: landscape + portrait, all sections
node touch-proof.mjs --base-url http://127.0.0.1:8812 --out $S/tp-mut --mutate ignore-leave-playing --only frozen --views landscape
```

Default trials on the lane: **108 passed, 0 failed** in 4232 s (`$S/tp-lane/report.json`), including, in **both orientations**, the four
T-105 follow-ups: "3 fingers down, then PAUSED (P key)" and "... then GAME_OVER" (every held code released, still released after resume and
lift), the chip's lit look going out on a lifecycle release, and a JUMP whose pointerup and cancel were both lost being released by the next
touch (which then steers). The live section (stick + JUMP, held vs tapped apex, air jump, up-right bullets at 45 degrees, drop-through the
catwalk) passes in both. `--mutate ignore-leave-playing` goes **red**: **40 passed, 2 failed**, exactly the PAUSED and GAME_OVER trials, with
`["ArrowRight","Space","KeyX"]` still held through the pause and the death (`$S/tp-mut/report-mutate-ignore-leave-playing.json`); the
control run of the same section is 42 of 42.

## 7. The other lane boxes I reproduced

`node phone-shell.mjs --base-url <lane> --only manifest,preload,audio,rotate --views l844` on the lane: **27 / 0** (898 s). On main
(`--only manifest,preload,audio`): preload **FAIL** at 844x390 and 1280x720 (the "preload ... not used" warning, each texture requested
twice), audio 3 pass / **1 FAIL** (an `interrupted` context is never resumed), manifest 0 / **4**. Independent of the tool I fetched
`hullbreaker.webmanifest` and the four icons (landscape, fullscreen with a standalone fallback, `start_url` and `scope` four levels up
resolve to `/index.html` and `/`, PNGs of 192, 512, 512 maskable, 180 touch icon, all opaque RGB) and looked at the 180 px and the maskable
icon: the title art cropped to the Crown and the spiral, readable, with the maskable art inside its safe zone. Rotation mid-run with three
fingers down: 13 / 0 (canvas and camera follow, the strip re-lays out both ways, nothing held after, no panel).

## 8. T-201's encounter line at 667x375 (the spot-check)

I cannot inject it through a HUD API: `src/ui/hud.js` derives the objective from sim state and exposes no setter, and `rollingEncounterText`
is not on this tree. I wrote the slot the way the lane's own gateline section does, `#hudObjective.textContent` plus the panel's `empty`
class removed (TEST SETUP), at 667x375, DPR 2, touch (`$S/probes/gate-spot.mjs`, captures `$S/probe-out/gate-spot-lane/`):

| line | chars | lines | text width / slot | panel bottom |
|---|---|---|---|---|
| `INTERCEPT · 4 FOLLOWING` | 23 | **1** | 152.3 / 197 px, not cut | y 28.5 |
| `WAVE 1/6 · OBSERVE · CONTACT` (T-201's widest) | 28 | **1** | 185.4 / 197 px | y 28.5 |
| `WAVE 4/6 · QUARANTINE · 2 HOSTILES · +2 INBOUND` (today's 47) | 47 | 2, whole | n/a | y 40 |

Every panel bottom is above the central region (y 75) and the deck's chips (y 72), and never overlaps the strip (right edge 350, the slot
starts at 443.6). I looked at the first and third frames. T-201 has now merged to main; I did not run the real
`rollingEncounterText` through the lane's CSS, so after the merge `phone-shell.mjs --only gateline` is worth one run (the lane enumerated
all 1145 lines on a scratch merge-tree).

## 9. What I attacked beyond the dispatch

- **The touch buttons, with real CDP touches** (`$S/probes/buttons-probe.mjs`, `modal-probe.mjs`, 844x390): pause offers exactly RESTART RUN
  / START SCREEN / HIDE HUD, each exactly 44 px tall. HIDE HUD hides the HUD, the label becomes SHOW HUD and the game stays paused; the
  second tap restores it. START SCREEN from pause goes to the title (MENU), never back into play; RESTART RUN returns to PLAYING (the sim is
  frozen in this harness, so I cannot show the run's state resetting). Game over offers one button (START SCREEN) and the deck's TAP TO CLIMB AGAIN; the button goes to the title, an
  armed tap in an empty corner climbs again. Summit: same, one 44 px button plus one cue. No tap on a button also fired the deck's modal tap.
  **My first two versions of the armed-tap step failed (GAME_OVER and VICTORY stayed up) and that was my harness, not the game**: the deck
  accepts a tap only if pointerdown to pointerup is at most 700 ms, and awaiting the touchStart's ack before sending the touchEnd let a
  1-2 s SwiftShader frame open that gap. Sending both events without awaiting the first, with the in-page down-to-up time logged (2 ms and
  0 ms), the step passes on the first attempt, both times. The lane's own walk avoids it by parking the draw while it taps.
- **The widest values a run can print** (`$S/probes/hud-extremes.mjs`; the frozen captures only show 0m / 1/6 / short names): altitude
  `1234m`, `CROWN` in the wave slot, `528m` forward, SURGE, a real rolled gun name and a 30-character name. The strip grows from 42.3 to
  43.8 px at most, the weapon name wraps to a second line inside it, and the lane's own audit finds **0 clipped or overlapping text boxes**
  (23 boxes) at 844x390 and 667x375.
- **Rotation on a state screen** (the lane's trial turns the glass mid-play only; `$S/probes/rotate-modal.mjs`, the lane's own `auditInPage`):
  pause, game over and summit each audited at 844x390, after turning to 390x844, and after turning back. All **nine audits pass** (21 / 25 /
  20 boxes in landscape, 21 / 25 / 18 in portrait), 0 keyboard words, no page error, and the deck's cue re-lays itself at the bottom centre
  each time (`$S/probe-out/rotate-modal-lane.log`, captures beside it).
- **Live play**: the default run, 8 s of hold-right + fire + three jumps with the deck forced on (`?touch=1`), 844x390
  (`$S/live-lane/screenshot.png`, tick 534 of 534, 0 page and console errors): the HUD shows real data (hull 2/3, "37m" forward, 1 kill,
  "WAVE 1/6 · OBSERVE"), RIG is mid-screen at about (477, 155) with enemies around him, and the strip and objective stay in the top band.
  The same script against main (`$S/live-main/`, `?touch=1` too) ends in the **identical sim state** (x 41.649, scrollX 37.84662179057373,
  gameMs 8900.178, hp 2, 7 hostiles, the same HUD text, 0 errors); what differs is the picture: main's RIG panel reaches y 122 and x 310 in the
  same frame, the lane's strip ends at y 48.
- **Shorter glass, which the dispatch did not ask for**: Safari landscape with its toolbars leaves less than the screen's height, so I added
  views 844x340 and 667x300 to a scratch copy of the lane's tool (the four view-table lines it adds are in
  `$S/probes/phone-shell-qa-views.txt`; nothing else changed). At **844x340**: every text audit passes on all nine screens (the loot card's bottom is 0.3 px into the central region). At
  **667x300** the summit's eyebrow ("MERIDIAN CROWN // LINK SECURED") starts at y -3.7, cut by the top of the glass, and the deck cue
  overlaps the result panel's lower edge by 4.7 px; the finale banner and the loot card end at y 64-68 against a central top of 60. Out of
  the brief (smallest brief view is 667x375); finding F3.
- **A touchscreen laptop** (1280x720, `hasTouch`, no mobile): the deck installs on any touch hardware (T-101), so the lane's copy follows it:
  TAP TO START, thumb legend, RESTART RUN / START SCREEN buttons, "Tap the button" on the failsafe panel, where main printed the keyboard
  copy. The keyboard still works. Finding F4.
- **The harness itself**: the default six-face run's hidden HUD text prints "1 KILLS" and the sampler's `/(\d+) kills/` is lower-case, so
  `kills` and `metrics.finalKills` are null and `summary.md` says "Kills: n/a" on every default-run report (main identical). Finding F6;
  not this lane's.

## 10. What this cannot claim

- Chromium under SwiftShader, never WebKit, never a phone. First-tap sound on iOS, a real low-end GPU's first shader compile, the notch and
  Dynamic Island as WebKit reports them, home-screen launch (iOS reads the meta tags, not the manifest's `display` / `orientation`),
  Safari's edge back-swipe and pull-to-refresh are on-device questions; the lane's operator packet carries them. The audio trial proves
  where `resume()` runs under an emulated rule, not that iOS honours it.
- Fonts: this host falls back to a wider display face than iOS does, so fit margins here are pessimistic for headlines and optimistic
  nowhere I know of; monospace text is DejaVu Sans Mono here and SF Mono on a phone (about 0.6 em per glyph in both).
- The watchdog's "main-thread stall" is frames withheld with timers running (section 5); two of the lane's five trials were UNDECIDED on this
  host, as its own report predicts.
- A pass of the lane's DOM audit means no text box is clipped, overlapped or outside the safe area. It says nothing about whether 9 px text
  is readable at arm's length (F5 / operator question 1).
- I did not run pathcheck (the merge gate does), the lane's full gateline section, 932x430, or `--mutate` runs of the phone-shell checks
  other than the touch one; the lane's reviewer already approved (`reports/tasks/T-105/review.md`). I did not re-gate against the current
  main (T-201 merged after my export); the lane's manifest line (d81 / d82) will conflict at merge, as its report says.

## For the operator

Feel and legibility only; none of these has a right answer and none of them is a gate.

1. **Reading the strip while playing.** On your phone, held sideways, can you read hull, weapon, overdrive and the three ascent numbers
   without leaving the fight? (The strip's text is 8-9 px CSS, the ALT / WAVE / FORWARD captions 5 px, the objective 10 px; main used
   about the same sizes. Is anything you reached for missing, or too small?)
2. **Game over.** After you die, where does your thumb go first? The START SCREEN button sits in the middle of the panel while the "TAP TO
   CLIMB AGAIN" cue is at the bottom; did you ever land on START SCREEN when you meant to climb again?
3. **Pause.** Did you tap the options (NEAR / MID / FAR, audio, shell) by accident, and did the reload cost you a run? Did "TAP TO RESUME"
   feel like "tap anywhere" or "tap the label"?
4. **The title.** Does "TAP TO START" plus the thumb legend tell you what to do, or is the legend clutter once you have played once?
5. **The weapon card (1.25-1.9 s) and the Crown banner hide the objective line.** Did you miss the objective while either was up?
6. **A hybrid laptop.** If you play on a touchscreen laptop with a keyboard, would you rather see the keys or the thumbs on the title?
7. **Safari vs home screen.** Does the game play the same height in the Safari tab (toolbars showing) as from the home-screen icon, and
   does the summit or game-over screen ever touch the top or bottom edge in the tab?

## PROPOSED INBOX ISSUES

(`$S` = `/tmp/claude-0/-home-user-hullbreaker/0c748965-85bc-570b-a00a-0186b03c4f4f/scratchpad/t105-gate`; the integrator files these, I did not touch SPRINT.md.)

## I-??? | bug | S2 | repro: phone (`hasTouch` 844x390, iOS UA) `index.html` -> tap to start -> the II chip; read the sizes of `#ovPanel a`; `node $S/probes/buttons-probe.mjs --base-url <lane>` @ 4fd25af | evidence: $S/probe-out/buttons-lane.log ("pause option links (size)"), $S/ps-lane/branch-l844-pause.png
The pause panel's option links (NEAR / MID, ON / OFF) are **29x14, 22x14, 15x14 and 22x14 px** on the lane, far under a 44 px thumb target
(the lane proposed this as S3; I rate it S2). Each is a plain `<a href>` that reloads the game with a flag (the panel's own footnote:
"↻ reloads the run with that flag"; `flagUrl()` in `src/ui/shell.js`), which ends the current run, and the deck's modal tap deliberately
ignores links, so the tap-anywhere resume does not catch a thumb that lands on one. I measured the target sizes and read the behaviour; I did
not tap one, and I have no mis-tap rate (that is an on-device question). The new RESTART RUN / START SCREEN / HIDE HUD buttons beside them
are 44 px. Fix direction: 44 px targets or no option links on the touch pause panel, and `location.replace()` for the reloading
toggles so Safari's back-swipe does not step through them (needs an iPhone to confirm).

## I-??? | bug | S3 | repro: `node tools/playtest/phone-shell.mjs --only screens --views l667` (667x375), Crown finale or a weapon card on screen @ 4fd25af | evidence: $S/ps-lane/branch-l667-finale.json, branch-l667-loot.json, $S/ps-lane.log (hudBudget lines)
At 667x375 the HUD covers 11.58% (finale) and 12.72% (loot card) of the screen by the tool (11.74 / 12.92% by my pixel union); play is 7.67%.
Never inside the central 60% x 60%, and the SPRINT box names 844x390 (6.47 / 9.08 / 9.93% there), so this does not gate T-105; it is the
lane's own open note, reproduced. Fix direction if the 10% line is wanted below ~700 px: a smaller banner and card.

## I-??? | art | S3 | repro: `node tools/playtest/phone-shell.mjs --only screens --views p390` (loot card), and the QA copy of `phone-shell.mjs` described in `$S/probes/phone-shell-qa-views.txt` (`--only screens --views l844s,l667s`) @ 4fd25af | evidence: $S/ps-lane/branch-p390-loot.json, $S/ps-qa-short/*.json
Three overlaps at the edges of the matrix. Portrait 390x844: the loot card (270x86.2, y 92.8..179) overlaps the AUTO chip by 43.7 x 3.0 px and ends 10 px
inside the central region (identical on main, so pre-existing and unchanged by this lane). 844x340: the loot card's bottom edge (y 68.3) is 0.3 px
inside the central region (68). 667x300 (an SE-class phone in Safari with its toolbars; not in the brief): the summit's eyebrow starts at
y -3.7 (cut by the top of the glass), the deck cue overlaps the result panel by 4.7 px, and the finale banner and loot card end at y 64-68
against a central top of 60. Transient or low-priority; the summit one is a clipped line.

## I-??? | feel | S3 | repro: Chromium, 1280x720, `hasTouch: true`, `isMobile: false`, `index.html` (or `node $S/probes/legacy-probe.mjs --base-url <tree> --touch auto --viewport 1280x720 --mobile 0`) | evidence: $S/probe-out/laptop-touch-lane.log vs laptop-touch-main.log
A touchscreen laptop gets the two-thumb deck by default (`resolveTouchScheme`: any touch hardware), and since T-105 every screen speaks touch
there: the title says TAP TO START with a thumb legend, pause and game over show buttons and no key line, the failsafe panel says "Tap the
button". Main printed the keyboard copy on the same device. The keyboard still works (the key handlers are untouched), but a keyboard
player on such a machine is no longer told so anywhere. Operator question 6; a design call (which scheme wins on a hybrid), not a defect in
the lane's logic, which follows the live scheme as decided.

## I-??? | feel | S3 | repro: read `texts[].font` in `$S/ps-lane/branch-l844-play.json` (the audit of the play screen, 844x390) | evidence: same file
Phone HUD text is small: hull value 8 px, weapon name and ascent values 9 px, "OVERDRIVE" / "RUSH" 7 px, the ALT / WAVE / FORWARD captions 5 px,
the objective 10 px (CSS px; the deck chips are 10 px). Apple's smallest text size is 11 pt. The sizes are essentially main's landscape sizes
(unchanged, so not a regression) and no audit can say whether they are readable on a 6.1" panel; it needs one pass on the phone before the
next HUD change. Operator question 1.

## I-??? | bug | S3 | repro: any `run.mjs` run of a script whose url is the default run (e.g. `node run.mjs $S/probes/live-default-8s.json --deterministic --viewport 844x390 --base-url <tree>`), read `metrics.finalKills` | evidence: $S/live-lane/report.json (`trace[-1].hudTR` "... 1 KILLS ..." while `kills` is null), main identical
`tools/playtest/lib/sampler.mjs` reads kills with `/(\d+) kills/`, lower-case; the default six-face run's HUD text (`src/ui/hud.js`, the
`WAVE ... FORWARD · N KILLS` string) is upper-case, so `kills`, `metrics.finalKills` and the summary's "Kills" line are null / "n/a" on every
default-run report. The traversal and transform slice strings are lower-case and work, which is why the smoke never shows it. Not introduced
by T-105 (the sampler-read fields are identical on main). Fix direction: `/(\d+) kills/i`.

## Evidence and commands

Everything under `$S`: `smoke-mid/`, `smoke-tr/`, `smoke-main-mid/`, `smoke.log`; `ps-lane/` and `ps-main/` (captures `<label>-<view>-<screen>.png`
and the audit JSON behind each, `report-branch.json`; main's run was stopped before its report, its log is `ps-main.log`), `ps-lane-safe/`,
`ps-lane-misc/`, `ps-main-misc/`, `ps-lane-wd/`, `ps-qa-short/`; `tp-lane/`, `tp-mut/`, `tp-*.log`; `probe-out/` (watchdog JSON, selftest,
buttons, modal, gate-spot, hud-extremes, legacy / touch=0 / laptop, sampler overlay probes, ab-lane/ab-main desktop captures);
`live-lane/`, `live-main/`; my probes in `probes/` (`wd-probe.mjs`, `buttons-probe.mjs`, `modal-probe.mjs`, `ov-probe.mjs`, `ab-desktop.mjs`,
`gate-spot.mjs`, `hud-extremes.mjs`, `legacy-probe.mjs`, `hudcheck.mjs`, `pixdiff.py`, `live-default-8s.json`).
