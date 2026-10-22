# Sprint — wave 5: phone-first polish push

Queue for the orchestrated push opened by `docs/decisions.md` entry 20:
*"a fast pace, race to the top, shoot-em up"*, playable on a phone, brought
to "fantastic quality". Governed by `CLAUDE.md`'s loop protocol; entry 8's
autonomous-merge mandate stands; entries 1–20 are law. Every dispatched
agent reads `docs/LANE-BRIEF.md` first. Schema at the bottom.

The 3,643-line wave-4 SPRINT was retired on 2026-08-05 (`641cd00`); its
history is in git (`git show 641cd00^:SPRINT.md`). Task numbers restart at
T-101 so nothing collides with that record.

## Environment notes (cloud container, 2026-10-22)

- No GPU: Chromium renders through SwiftShader. The shipped scene takes
  ~15-30 s to reach PLAYING and the pathcheck perf probe ~2.5 min. The
  profile exports `HB_PROBE_BOOT_MS` / `HB_PROBE_SPAWN_MS` to widen the probe's
  timeouts; never shorten them to make a gate pass.
- `/opt/google/chrome/chrome` is symlinked to the preinstalled Chromium so
  the harness's default `channel: 'chrome'` works; `/private/tmp` exists for
  the harness's macOS-default output paths.
- Phone captures at deviceScaleFactor 3 trip the 4 s freeze watchdog in
  SwiftShader (a host artifact, not proof of a device defect). Capture phones
  at DPR 1-2 and say which.
- No image-generation CLI (`codex`) is installed. New art comes from the
  existing atlases/components, procedural/canvas drawing, or PIL/ImageMagick.
- 4 CPU cores: at most three browser-heavy lanes at once.
- After a container restart, `bash tools/orch/cloud-setup.sh` restores all of
  the above (idempotent). The merge gate's smoke step uses
  `tools/orch/smoke-verdict.mjs` (boot + full deterministic schedule + no page
  errors + no stall); `HB_HARNESS_SLOWDOWN` / `HB_SMOKE_VIEWPORT` are its
  slow-host knobs.

## Queue

## T-101 | shell | doing | P1

goal: replace the rejected one-thumb touch scheme (entry 20) with a
conventional two-thumb run-and-gun layout that makes a fast climb playable on a
phone in landscape and portrait.

starting design (integrator; refine it with measured reasons, do not ignore it):
- LEFT zone (left ~45% of the screen): a floating stick spawns under the thumb
  and drives move left/right plus 8-way aim, emitting the SAME key edges as the
  keyboard (`ArrowLeft/Right/Up/Down`) so there is still one gameplay-input
  contract. Dead zone, 8-way sector quantization WITH hysteresis (no chatter
  between diagonals), and an anchor that follows the thumb when it drags past
  the rim so a long drag never loses control. Quantization is pure logic: put it
  in `src/pure/` with pathcheck assertions.
- RIGHT zone: a big JUMP button (bottom-right) and a FIRE button beside it.
  JUMP is press-and-hold (keydown on press, keyup on release) so variable jump
  height survives; a second press airborne is the double jump; down+JUMP is
  drop-through, exactly as on the keyboard. FIRE held = continuous fire.
- AUTO-FIRE: an option that holds fire for the player while hostiles are on
  screen, so the right thumb is free for jumping. Default it ON for touch only
  if you can show it costs nothing in the sim (check every fire-gated system:
  overdrive, heat, score, capsule logic); otherwise default OFF and say why.
  Aim assist is already the normal-run default (`src/mode.js`).
- SWAP (weapon) and PAUSE as small buttons out of the thumb arcs; every button
  sized from the short screen dimension and placed inside safe-area insets.
- Tap anywhere on the title starts the run (and unlocks audio, if the audio
  module needs a gesture).
- Kill browser gestures on the play surface: no double-tap zoom, pinch zoom,
  long-press callout, text selection, pull-to-refresh or overscroll bounce.
- Escape hatches: `?touch=legacy` restores the old one-thumb scheme verbatim;
  `?touch=0` / `?touch=1` keep their meanings.

accept:
- [ ] Scripted multi-touch proof (Playwright `hasTouch`, real touch events —
      CDP `Input.dispatchTouchEvent` for simultaneous pointers) at 844x390
      landscape AND 390x844 portrait: stick-right + JUMP press gives a jump that
      keeps horizontal velocity (assert `vy>0` and `vx>0` within N ticks); a held
      JUMP reaches a higher apex than a tapped one (report both apexes); a second
      JUMP airborne consumes the air jump; stick up-right + FIRE spawns bullets
      travelling up-right; down + JUMP on a catwalk drops through it.
- [ ] Three simultaneous pointers (stick + FIRE + JUMP) work, and lifting any
      one releases only its own codes: press/release in every order and assert
      the held-code set after each step. Falsify by breaking pointer bookkeeping
      and showing the check fail.
- [ ] `pointercancel`, window blur, `visibilitychange` and an orientation change
      mid-press release every held code (no stuck run, no stuck fire).
- [ ] A double-tap on a button does not change `visualViewport.scale`; the deck
      and buttons carry `touch-action:none` and `user-select:none`.
- [ ] Keyboard path unchanged: smoke scripts `mid-route.json` and
      `transform-slice.json` complete with `--deterministic`; pathcheck green
      with new assertions for the new pure logic.
- [ ] `?touch=legacy` reproduces the old scheme (assert its snapshot shape).
- [ ] Screenshots of both orientations with the deck visible, at DPR 1 and 2.
- [ ] Operator packet: exact URL + 3-5 non-leading questions about the feel.
owner: gameplay-engineer
fences: owns `src/ui/touch-controls.js`, the touch-deck markup and its CSS in
`index.html`, new `src/pure/` stick logic, the input wiring in `src/main.js`
ONLY where touch is installed, and new pathcheck/playtest files. Does not
touch HUD/title layout (T-105), the camera (T-107), or RIG art (T-103).
verify: node tools/pathcheck.mjs; node tools/playtest/run.mjs
scripts/mid-route.json --deterministic; the new touch proof script

## T-102 | feature | doing | P1

goal: the corner turns work every time. The operator: *"the 'turns' don't
quite work right all of the time."* Find every way a corner turn (the 60°
ratchet between faces, the Crown approach) misbehaves, reproduce each one
deterministically, and fix the root causes.

look at, at minimum: the wave gate at each corner (stays shut, opens without
the turn firing, opens late because ambient spawns drift past the pivot —
see the old I-022); RIG position/velocity continuity across the bend (pops,
fall-through, snagging on the hinge — `048716c` just touched corner hinge
geometry); the camera ratchet (snap, wrong direction, over/under-rotation,
jitter, framing that hides the landing); render ownership of faces around the
bend (missing or popping geometry, static-anatomy rule, entry 3); hostiles,
bullets (entry 7 bend cull) and capsules near a bend; turns taken airborne,
mid double-jump, dropping through, on a ladder, while hit, at the instant of
death, while paused, across a resize/orientation change; backtracking across
a corner after it fires; and turns at a phone viewport.

accept:
- [ ] A defect table: each defect with a deterministic repro (script + flags +
      tick), its root cause in code (path:line), and the fix. "Could not
      reproduce" is a valid row if the attempt is described.
- [ ] A headless sim proof that drives all five turns and the Crown approach
      under several policies (run straight, jump through, idle at the corner,
      backtrack, die at the hinge) and asserts: per-tick |Δs| and |Δy| bounded
      by the frozen movement envelope (no teleports); RIG never falls through
      the hinge; the gate always opens within a stated bound after its kill
      condition is met; the turn always fires once the gate is open and RIG
      crosses; the facet index never goes backwards on a forward crossing.
      Each assertion must fail on the pre-fix code — show it.
- [ ] Browser captures of all five turns (before/during/after) at desktop
      1280x720 and phone landscape 844x390 for visual judgment.
- [ ] Smoke scripts complete; pathcheck green.
owner: gameplay-engineer
fences: transform/turn/camera ratchet/wave gate/scroll code (`src/pure/
transform.js`, `src/sim/transform.js`, `src/render/transform.js`,
`src/render/camera.js`, `src/sim/wavegate.js`, `src/sim/scroll.js`,
`src/pure/path.js`, `src/pure/limb.js`) and new pathcheck/playtest files. Does
not touch touch controls (T-101), RIG art (T-103) or authored lattice data
(T-106). If the fix needs a face-length or lattice change, report it.
verify: node tools/pathcheck.mjs; the new turn proof; smoke scripts

## T-103 | art | doing | P1

goal: weapons sit in RIG's hands. The operator: *"the models are a little off
(like guns don't align to hands)."* Every gun, every pose, every aim
direction, both facings.

accept:
- [ ] A before/after contact sheet of every (pose × aim direction × facing ×
      gun) combination the game can show — idle, run, jump rise/fall, climb,
      crouch if enabled, hit/i-frames, death — at true FAR size and at 4x.
- [ ] A measured check, committed as a pathcheck domain or a tool it runs: for
      every combination, the weapon's grip lands within 1 atlas pixel of the
      body frame's hand anchor. Prove it binds by offsetting one anchor and
      showing it fail.
- [ ] The drawn muzzle and the simulation's bullet spawn agree within 1 screen
      px at FAR (the sim muzzle is gameplay truth: move the art to it; if the
      sim muzzle itself is wrong, that is a sim change with its own assertions,
      reported as such).
- [ ] Climb/ladder poses hold or stow the weapon deliberately — no gun floating
      off the body.
- [ ] Phone viewport capture (844x390, DPR 2) showing RIG firing in four
      directions.
- [ ] pathcheck green; smoke scripts complete.
owner: gameplay-engineer
fences: `src/render/player.js`, RIG art specs in `src/pure/rig.js` (art data
only — no sim constants), `src/render/sprite-table.js`, RIG atlases under
`assets/generated/sprites/rig-*` (repack with the existing tools under
`tools/assets/`), and new check files. Does not touch the sim muzzle without
saying so, touch controls, or the camera.
verify: node tools/pathcheck.mjs; the new alignment check; smoke scripts

## T-104 | docs | doing | P1

goal: a grounded design proposal for (a) turning level 1 into a fast race to
the top with longer faces — *"the 'sides' are a little short"*; and (b)
levels 2 and 3 as distinct climbs of the Meridian, so the game is more than
one level.

method: measure the shipped run FIRST, headlessly (`tools/simlab/`, the bot
harness), with several policies, and report distributions (entry 19): seconds
per face; seconds stalled at each wave gate; vertical metres gained per face
and per second; share of time moving forward vs waiting; deaths per face;
how far ahead the player can see at desktop and phone framing. Then propose.

the proposal must cover: target face length and vertical span with the
arithmetic behind them (frozen `runSpeed` ~9.4 t/s vs scroll ~4.3 t/s,
`CONFIG.path.faceTiles`=88); what changes about wave gates so the run reads as
a race rather than stop-and-clear, while keeping teach→test→remix→break;
level 2 and level 3 concepts built from `docs/TRACK-ARCHETYPES.md`
(`src/pure/track-archetypes.js`), `docs/STORY.md`, concept boards 09-14 and the
operator's own anatomy list in entry 1 ("turns around the leg, a long straight
up a ribline, flipping indoor through the neck, back out of some vent up
higher"); how levels chain (continuous run vs level select vs unlock) and what
a phone player sees between them; and what art each level needs from the
EXISTING kit, given no image-generation tool is installed.

accept:
- [ ] `docs/proposals/2026-10-race-to-the-top.md` with every number traced to a
      committed script or file, and the measurement scripts committed under
      `tools/` (zero effect on the game).
- [ ] A phased build plan written as ready-to-dispatch task blocks in this
      file's schema, each acceptance box naming its currency and its
      falsifying test (entry 10).
- [ ] Every proposal checked against entries 3, 7/17, 10, 11, 12, 19 and the
      frozen movement constants, with conflicts named rather than resolved.
- [ ] Open questions for the operator, at most five, non-leading.
owner: lattice-designer
fences: docs and new measurement tools only. No `src/` changes.
verify: node tools/pathcheck.mjs (must stay green); re-run the measurement
scripts and reproduce the numbers in the doc

## T-105 | shell | todo | P1

goal: everything on screen renders correctly on a phone — iPhone Safari
first, landscape first (entry-20 addendum). Known from the integrator's
2026-10-22 captures (390x844 and 844x390, DPR 1): the portrait title clips
"HULLBREAKER" to "HULLBREAK"; the title says "PRESS ANY KEY" and lists
keyboard controls on a touch device; the failsafe panel says "Press R, or
click the button"; the HUD panel covers ~20% of portrait and the top-left
quarter of landscape; in-run hints are keyboard hints; four `<link
rel=preload>` images are fetched twice (crossorigin mismatch — wasted phone
bandwidth); at DPR 3 the 4 s freeze watchdog fired before the title under
SwiftShader — decide whether a slow first shader compile on a real low-end
phone could do the same, and make boot tolerant of it without blinding the
watchdog. Dispatch after T-101 merges (shared `index.html`, title prompt).

accept:
- [ ] Before/after capture matrix with `hasTouch` + an iOS Safari UA at DPR 2:
      landscape 844x390, 932x430 and 667x375, portrait 390x844; screens: title,
      play HUD, pause/options, capsule pickup/loot banners, death, game over,
      victory/finale, and the failsafe panel (forced).
- [ ] No clipped or overflowing text on any of those screens: a DOM check that
      every visible text box fits its container and the viewport minus safe
      areas. It must fail on current main's portrait title.
- [ ] No keyboard-only copy on a touch device: a text scan of every screen for
      key names and "press"/"click" wording returns zero hits under touch, and
      the keyboard copy still appears on desktop. Must fail on current main.
- [ ] Landscape HUD budget: at 844x390 the HUD's panels cover at most 10% of the
      viewport area and none intersects the central 60%x60% play region
      (bounding boxes, measured). Current main: report its numbers.
- [ ] Safe areas: with notch insets forced (left/right 47 px, bottom 21 px —
      the stylesheet already has a hook for Chromium, where env() is zero),
      every control and HUD box sits inside the insets.
- [ ] Preloads: zero "preload ... not used" console warnings, and each
      preloaded URL is requested exactly once (count network requests).
- [ ] Watchdog: a 6 s main-thread stall injected before the first rendered
      frames does NOT show the "game got stuck" panel, while the same stall
      after warm-up during PLAYING still does. Both directions demonstrated.
- [ ] Home-screen play: a web app manifest (landscape, fullscreen/standalone,
      icons cut from existing title art with PIL/ImageMagick) plus
      `apple-mobile-web-app-capable`, status-bar style and `apple-touch-icon`.
- [ ] Rotation mid-run (portrait↔landscape during PLAYING) resizes the canvas,
      re-lays out the HUD, leaves no stuck input and no failsafe panel.
- [ ] First touch resumes audio on iOS (the AudioContext unlock runs inside the
      gesture handler); on-device confirmation is an operator question.
- [ ] Desktop 1280x720 title/HUD/pause unchanged, or every difference named.
- [ ] pathcheck green with assertions for any new pure logic; smoke-verdict
      PASS on both smoke scripts.
- [ ] Operator packet: query string + 3-5 non-leading questions.
owner: gameplay-engineer
fences: `index.html` (title, HUD, overlay, failsafe markup/CSS; the touch deck
belongs to T-101's merged design — fix only integration bugs there),
`src/ui/{shell,hud,overlay,failsafe,loot,tint,gilded,audio}.js`,
`src/pure/failsafe.js`, `src/render/preload.js`, a new manifest + icons. Not
the camera (T-107), not RIG art, not lattice data.
verify: node tools/pathcheck.mjs; the new layout/copy/watchdog checks;
smoke-verdict on both smoke scripts

## T-106 | lattice | todo | P1

goal: longer faces and a faster climb, built from T-104's accepted plan.
accept: written at dispatch from T-104's task blocks.
owner: lattice-designer

## T-107 | render | todo | P1

goal: phone framing, authorized by the entry-20 addendum: on phone viewports
only, RIG is ~6% of screen height (today ~3.7%, ~12-15 CSS px in 844x390
landscape); desktop FAR stays byte-identical. Landscape is the tuning target.
Dispatch after T-102 merges (shared `src/render/camera.js`).

accept:
- [ ] A pure, asserted framing resolver (viewport size + coarse pointer ->
      view scale) in `src/pure/`; desktop 1280x720 and 1920x1080 resolve to
      FAR with camera pose numbers identical to main (prove byte-identical
      projection, not "looks the same").
- [ ] Measured RIG height as a share of viewport height: phone landscape
      844x390, 932x430, 667x375 each within 5.5-6.5%; portrait reported and
      justified (6% of the SHORT side or of height — say which and why).
- [ ] Look-ahead: in phone landscape the visible world ahead of RIG in the run
      direction is at least the distance RIG covers in 1.0 s at `runSpeed`
      (measure tiles ahead; shift RIG's screen anchor back if needed). A
      framing that hides the next landing fails.
- [ ] All five corner turns and the Crown approach captured before/during/after
      at phone framing: the landing is visible, no camera clipping into
      anatomy, static-anatomy rule intact (entry 3).
- [ ] Hostile tells, bullets and capsules readable at phone framing — capture
      sheet at DPR 2.
- [ ] Escape hatches: `?view=far` forces desktop framing on a phone;
      `?view=phone` forces phone framing on desktop for review.
- [ ] Frame cost at phone framing reported against FAR on the same viewport
      (worstMs / over20ms, interleaved rounds).
- [ ] pathcheck green; smoke-verdict PASS; operator packet.
owner: gameplay-engineer
fences: `src/render/camera.js`, the view-scale entries in `src/config.js` /
`src/mode.js`, a new `src/pure/` resolver, new checks. Not HUD layout (T-105),
not the touch deck (T-101), not turn logic (T-102, merged first).
verify: node tools/pathcheck.mjs; the framing measurement script;
smoke-verdict on both smoke scripts

## Operator checkpoint queue (feel verdicts — never block the loop on these)

(packets append here as tasks land)

## Inbox (playtester/adversarial file here; integrator triages each cycle)

<!-- issue schema:
## I-### | bug|feel|fairness|art|docs | S1|S2|S3 | repro: <script + flags + seed/commit> | evidence: <path>
one-paragraph description; S1 = blocks a checkpoint or corrupts a gate,
S2 = real defect with workaround, S3 = polish/nit.
-->

---

## Task schema

```
## T-### | type | status | priority
type:     feature | investigation | lattice | harness | docs | art | juice | audio | shell | assets | render
status:   todo | doing | review | operator | blocked | done
priority: P1 | P2 | P3
goal:     one sentence, with doc pointers
accept:   checkboxes an agent can verify (machine gates) + what goes to the
          operator (feel) — never a self-declared fun verdict; every box names
          its currency and its falsifying test (decisions.md entry 10)
owner:    agent name (.claude/agents/)
fences:   files the lane owns / must not touch
verify:   exact commands
```

Status flow: todo → doing → review → done; `operator` parks a task on a feel
verdict; `blocked` parks it on a dependency or two failed attempts (note
why). The Stop-hook flywheel only counts todo/doing/review as open work.
