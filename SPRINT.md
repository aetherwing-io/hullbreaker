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
- No image-generation CLI (`codex`) is installed. Entry 22 authorized an
  open-source art toolchain instead: headless Blender 5.2 (`/opt/hb-art`,
  Cycles CPU/Workbench), Pillow/NumPy/OpenCV, `rsvg-convert`, CC0 libraries.
  Rules: `tools/art/README.md`.
- 4 CPU cores: at most three browser-heavy lanes at once.
- After a container restart, `bash tools/orch/cloud-setup.sh` restores all of
  the above (idempotent). The slow-host knobs live in `~/.hullbreaker-host.env`
  (load with `. ~/.hullbreaker-host.env`; `~/.bashrc` does NOT reach
  non-interactive shells). The merge gate and the per-edit hook source it. The merge gate's smoke step uses
  `tools/orch/smoke-verdict.mjs` (boot + full deterministic schedule + no page
  errors + no stall); `HB_HARNESS_SLOWDOWN` / `HB_SMOKE_VIEWPORT` are its
  slow-host knobs.
- **Merge-gate smoke on this host (integrator policy, 2026-10-23).** Under load
  30-60 the gate's own deterministic smoke re-run can exceed any sane wall cap
  (T-102: three attempts capped at 2000 s, the job then killed at 2 h). When the
  playtest gate has run BOTH smoke scripts against the pinned worktree at the
  SAME head, and the integrator re-judges those report.json files with
  `tools/orch/smoke-verdict.mjs`, the merge runs with `--skip-smoke` and the
  SPRINT entry records it. pathcheck still runs in the worktree and on main.
  T-120's PLAY gate is to replace this with a gate that fits the host.

## Queue

## T-101 | shell | done | P1

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


landed 2026-10-23 (`c336ad0`): two-thumb deck ON by default on touch hardware,
`?touch=legacy|0|1`, `?autofire=1|0` (auto-fire default OFF: the BACKLASH gene
makes firing not free). Review APPROVE, playtest PASS (smoke at 49f6a0a,
re-judged); merged with `--skip-smoke --accept-stale-verdicts` (integrator-only
manifest resolution: turn proof d77, touch deck d78). Four small deck
follow-ups from the review ride with T-105.

## T-102 | feature | done | P1

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


landed 2026-10-23 (`3e18f90`): D1-D5 fixed with a 41-run headless turn proof
(full tier) + a 4-run per-edit subset. Review APPROVE, playtest PASS (both smoke
scripts PASS at head 6d3e58f, re-judged by the integrator); merged with
`--skip-smoke` under the policy above. R1-R4 routed to T-122 / T-107 / T-201.
## T-103 | art | done | P1

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


landed 2026-10-23 (`fffc69e`): fist on grip in every pose/aim/facing/gun
(worst 28.4 → 0.02 css px desktop), drawn muzzle on the bullet spawn, arm
meshes with a two-bone solve; the left-facing back-face lighting defect found by
the first playtest gate was fixed and re-gated (L/R luma 1.0002). Review APPROVE,
playtest PASS at c6d475e (both smoke scripts PASS at that head, re-judged by the
integrator); merged with `--skip-smoke --accept-stale-verdicts` (integrator-only
manifest renumbering: T-103's domains are d79/d80). No `?hands=legacy` hatch —
a defect fix of an operator-named problem (entry 20). Operator look questions
(hold height, aim-up over the helmet, braced crouch, ladders, portrait arm
stretch) go with the first phone release.
## T-104 | docs | done | P1

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

landed 2026-10-22 (merged via merge-task.sh, review APPROVE + playtest PASS):
`docs/proposals/2026-10-race-to-the-top.md` + `tools/simlab/race/` +
`artifacts/t104-race/`. Its §8 questions are answered by decisions.md entry 23.
Its §7 task blocks are below as T-201..T-211 with the reviewer's
fix-at-dispatch amendments; dispatch sends the proposal's block verbatim PLUS
the amendment lines.

## T-105 | shell | doing | P1

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

## T-106 | lattice | done | P1

superseded by T-205 (the long sides, from T-104's accepted plan).

## T-107 | render | doing | P1

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
- [ ] Look-ahead is OWNED by T-202 (the follow-lead scroll); T-107 must not
      reduce it: measured route-ahead in phone landscape is no worse than
      FAR's on the same seed. Vertical band: lift the frame ≈ 6 tiles with
      the look target (T-104 §4.5) so the deck AND the face's apex are both in
      view (measure: a 6 % pull-in alone tops out at y 18.7 = face-6 apex + RIG).
- [ ] All five corner turns and the Crown approach captured before/during/after
      at phone framing: the landing is visible, no camera clipping into
      anatomy, static-anatomy rule intact (entry 3).
- [ ] Hostile tells, bullets and capsules readable at phone framing — capture
      sheet at DPR 2.
- [ ] From T-102 (R3): the post-turn zoom pump — after every turn the view is
      ~40% closer and pulls back over ~3.5 s because `syncCamera` orbits the
      frozen halt point, 15 tiles before the joint. Orbit the joint and blend
      back (behind a flag until judged); measure RIG height at done/+1.5 s/
      settled before and after.
- [ ] From T-102 (R2): no flat clear-colour voids at the screen edge near
      corners (today up to 18.7% of columns at 844x390 on approach, 10-11% after
      a turn): extend each face's veil past its corner or admit the adjacent
      veil during gate/approach and the post-turn catch-up; measured with the
      same column metric, before/after, desktop and phone.
- [ ] From T-102: RIG pinned at the right clamp renders at NDC x ≈ 1.012 at
      1280x720 (half the sprite off-frame) — calibrate the clamp at the actor
      depth; assert RIG's whole sprite stays on screen at every viewport.
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

## T-108 | harness | doing | P1

goal: find out which tests are worth having (decisions.md entry 21: *"the
tests may be misleading or not valuable too, i had no idea what i was
doing"*) and propose a lean gate that guards what a player would notice.

accept:
- [ ] Inventory and classification of every pathcheck domain, every
      `tools/*-check.mjs`, the selftest, the deploy verifier and the playtest
      capture scripts into CORE (player-observable behaviour or a hard rule),
      PURE-INVARIANT (cheap, correct, not an implementation pin), PIN (source
      text / implementation shape / a constant no decision protects), RETIRED
      (guards a superseded design — cite the entry), TAUTOLOGY (cannot fail /
      checks data against itself) and SLOW-ENV (browser/timing dependent),
      with counts and file:line examples. Machine-readable copy in
      `tools/orch/test-audit.json`.
- [ ] Binding sample: a stratified sample of at least 25 assertions across the
      classes, each mutated (break the guarded thing) to see whether the gate
      goes red; report the kill rate per class.
- [ ] Blind-spot table: for each entry-20 defect and each integrator-observed
      mobile defect (portrait title clip, keyboard copy on touch, HUD coverage,
      preload double fetch), which existing check could have caught it and why
      none did.
- [ ] Cost table: wall time per domain (one instrumented full run), total gate
      time on this host, and which domains dominate.
- [ ] Proposal: a fast headless CORE gate, a browser PLAY gate (desktop +
      phone boot, deterministic smoke, no page errors, frame budget), optional
      deep suites; the behaviour tests to ADD; the deletion list with reasons;
      and a migration plan that runs AFTER wave-1 lanes merge (they add
      pathcheck domains now). Written to `docs/proposals/2026-10-test-audit.md`.
owner: general-purpose
fences: `docs/proposals/`, `tools/orch/test-audit.json`, scratch timing tools
under `tools/orch/`. No changes to `tools/pathcheck/`, `src/`, or any check.
verify: re-run the instrumented timing and the mutation sample; numbers match
the doc

## T-109 | art | doing | P1

goal: prove the 3D -> sprite pipeline (entry 22) on the two sprites a player
looks at most — RIG with all five weapons, and the wasp — so guns are in hands
by construction and the look can be judged against the current AI-painted art.

phase A (now, no `src/` changes — T-103 owns `src/render/player.js`):
- [ ] `tools/art/rig/`: a scripted, reproducible headless-Blender build of RIG
      (low-poly armoured salvage marine true to boards 01/13 and STORY: human
      scale, helmet + visor, pack, chunky plates, one accent), an armature,
      and the five guns (R rivet, S spread, L laser, H homing, F flame) each
      parented to the right-hand bone with grip and muzzle empties.
- [ ] Every frame the game uses today (inventory it from `src/pure/rig.js` and
      `src/render/player.js`: idle, run, jump rise/fall, climb, each aim
      direction, hit/i-frame, any others) rendered through a fixed orthographic
      camera, pixel-post-processed into the house palette, packed into atlases,
      with per-frame JSON anchors (hand, muzzle per gun, feet, head).
- [ ] A measured check that the drawn muzzle pixel and the exported muzzle
      anchor agree within 1 px in every frame (it binds: offset one gun and
      show it fail).
- [ ] The same pipeline for the wasp: model, idle/cruise/dive/hit frames,
      anchors, atlas.
- [ ] Contact sheets: current art vs v2, true size at desktop FAR (RIG ~30 px)
      and at phone framing (RIG ~6% of a 390 px landscape height), plus 4x.
- [ ] Render cost per frame and total build time recorded; the build is one
      command.
phase B (after T-103 merges; the integrator will say so):
- [ ] v2 wired in behind `?art=v2` (render-only; the sim muzzle stays truth —
      report any delta), current art remains the default and the control.
- [ ] In-game captures at desktop and phone landscape; operator packet with the
      exact query string and 3-5 non-leading questions.
owner: asset-artist
fences: `tools/art/`, `assets/generated/sprites/*-v2*`, `assets/manifest.json`
entries it adds; in phase B only, the `?art=v2` branch in the render layer.
verify: the one-command build reproduces byte-identical atlases; the anchor
check; pathcheck green after phase B

## T-120 | harness | doing | P1

goal: rebuild the gate per T-108's revised audit
(`docs/proposals/2026-10-test-audit.md` at task/T-108 8d80f10, §7 and §10): a
fast headless CORE gate (load-dependent, 24-76 s here), a real-browser PLAY gate
(desktop + phone boot, deterministic smoke, layout/copy/network bounds, no page
errors, "the failsafe reaches the player"), optional DEEP suites. Order: write
the 11 behaviour tests FIRST (7 written here — failsafe reaches the player,
retry replays the same run, input forgiveness/coyote time, default URL boots and
missing art doesn't change play, nothing drawn on an unbuilt face, + 2 more per
§7.4 — and 4 ADOPTED from lanes: phone shell T-105, gun in hand T-103/T-109,
corner turns T-102, touch input T-101); then rewrite the 175 PINs that stand in
for real properties (each needs a mutant before its pin goes); then delete the
379 noise sites in reviewed batches keyed by (domain, label) with
`tools/orch/test-census.mjs --check` and the mutation sample re-run after each
batch. The 50 hook/zip-only sites are T-121's (DELETE-WITH-FEATURE). Re-record
the lock (`--write-lock`) after each lane merge that adds pathcheck domains.
Integrator calls on the audit's two questions: (1) the frame budget is
REPORT-ONLY on this GPU-less host (SwiftShader cannot measure render cost) and
is gated wherever a GPU runs the gate; (2) count ratchets on CORE checkers stay
as anti-weakening tripwires, moved inside the checker.
Owns ALL test/check infrastructure: `tools/pathcheck*`, `tools/*-check.mjs`,
`tools/gatecheck.mjs`, `tools/playtest/`, the selftest,
`tools/orch/merge-task.sh` + `smoke-verdict.mjs`, deploy verifiers.
Dispatch when T-108 merges; deletions in domains an in-flight lane touches wait
for that lane to merge (lane-to-domain table in the audit's §7.6).

## T-121 | harness | doing | P1

goal: clean up the codebase outside the test infrastructure (entry 24): dead
`src/` modules and exports, flag sprawl, unused assets, committed review
screenshots, one-off non-test tools, stale docs — every deletion proven
behaviour-neutral. Full block in the dispatch prompt (it is long); summary:
phase 1 inventory + evidence + `docs/proposals/2026-10-cleanup.md`; phase 2
safe deletion batches on files no in-flight lane touches; phase 3 (proposal
only) flag consolidation and large-file refactors, queued as new tasks.

## T-122 | art | todo | P2

goal: the corner hand-off stops popping (T-102 R1): at camera progress 0.96 the
whole departing stretch vanishes and the whole arriving stretch appears in one
frame. The late binary hand-off exists because per-face procedural pieces show
open backs at the 30° hold (`camera.js:157-170`, `limb.js:215-219`,
`level.js:1521-1527`). Direction: closed corner/kit pieces authored to read from
every ratchet angle (entry 22's Blender kit, placed from the 2D data), then an
earlier or graded hand-off; judged in `tools/playtest/turn-pose-capture.mjs`
frames t680/t700 at desktop and 844x390. Static anatomy (entry 3) binds.
owner: asset-artist + gameplay-engineer. Dispatch after T-107 and T-109.

## T-201 | feature | doing | P1

goal (M1): gate beats are always visible, fightable and bounded — full block
in `docs/proposals/2026-10-race-to-the-top.md` §7 "T-201".
amendments at dispatch: type is `feature` (not `bug`); add `src/mode.js` to the
fences if a flag is added; a bot-row box is REPORTED, not asserted (§1.3).
DISPATCHED AS ONE LANE ("the race pass") covering T-201 + T-202 + T-203
(entry-23 rewrite) + T-102's R4 hinge-stop A/B + the sim-side zipper removal
(entry 25 / I-105). Brief: the integrator's dispatch prompt. Dispatch after
T-102 merges.

## T-202 | feature | todo | P1

(folded into T-201's lane)

goal (M1): follow-lead scroll + arm on arrival — §7 "T-202". Owns look-ahead
(T-107 must not reduce it). Amendment: "saturate harmlessly" needs a threshold.
Also from T-102 (R4): RIG stops dead on every hinge for 1.1 s with input held
(`cornerJointRule('turning')`, ≈6.6 s per run) — A/B a variant where RIG keeps
moving through the ratchet (flagged), report pinned ticks per corner; the feel
call is the operator's.

## T-203 | feature | todo | P1

(folded into T-201's lane — the never-wait corner part; bay-A teach beats
still arrive with T-205)

goal (M2): rolling gates — §7 "T-203", REWRITTEN at dispatch per entry 23 #2:
the turn never waits; an uncleared remix cell does not hold it; its survivors
carry over and chase onto the next side (the price is pressure, entry 12).
Drop "the halt stays as the safety net" and the bounded-beat release design;
keep teach → test → remix → break and the visibility rule.

## T-204 | render | todo | P2

(folded into T-107's lane)

goal: per-side rendered rise — §7 "T-204". Amendment: its targets are written
for 176-tile sides; rescale to grade (0.16-0.21, 9-12°) so they hold on 88-tile
sides (≈ 14-18 m) and on 176 (28-36 m), or dispatch after T-205. Render-only:
race-lab fingerprints byte-identical. Pair with T-107 (shared `camera.js`).

## T-205 | lattice | todo | P1

goal (M2): six 176-tile sides proved by play — §7 "T-205"; ~25 s per side on a
good run (entry 23 #3), written in seconds. Amendment: cite only columns the
M-tables have; the legacy checks in §7's collision table are rewritten or
retired under entry 21, never "fixed" by bending the plan.

## T-206 | feature | todo | P1

goal (M3): levels as data + chaining + the between-level card + durable
resume (entry 23 #4) — §7 "T-206". Amendment: add a box proving the six-face
systems (momentum, overdrive charge, HULL FALLBACK) stay live in every level
(`src/mode.js` scopes them to `ACTIVE_FIXTURE === null` today); add
`src/mode.js` to the fences.

## T-207 | lattice | todo | P1

goal (M3): Level 2 RIBLINE & NECK (Contain → Quarantine) — §7 "T-207". Same
six-face-systems box as T-206.

## T-208 | art | todo | P2

goal (M3/M4): L2/L3 dressing — §7 "T-208", now using entry 22's toolchain
(Blender kit pieces placed from the 2D data, §5.7). `?dress=0` does not exist —
name the real escape hatch.

## T-209 | lattice | todo | P1

goal (M4): Level 3 SPINE & CROWN with the Crown at the top, and L1 re-cut to
three sides (entry 23 #1 = structure A) — §7 "T-209". Amendment: do not lean
on the legacy finale domains as evidence (entry 21).

## T-210 | harness | todo | P2

goal (M3): the race lab follows levels — §7 "T-210".

## T-211 | harness | todo | P3

goal: offline level preview (unrolled map + 3D views around turns, sub-second)
— §7 "T-211" and §5.7. Amendment: box 2's falsifier must bind to its assertion.

## Operator checkpoint queue (feel verdicts — never block the loop on these)

(packets append here as tasks land)

## Inbox (playtester/adversarial file here; integrator triages each cycle)

<!-- issue schema:
## I-### | bug|feel|fairness|art|docs | S1|S2|S3 | repro: <script + flags + seed/commit> | evidence: <path>
one-paragraph description; S1 = blocks a checkpoint or corrupts a gate,
S2 = real defect with workaround, S3 = polish/nit.
-->

## I-101 | art | S2 | repro: `node tools/simlab/turnlab.mjs poses --viewport desktop > p.json && node tools/playtest/turn-pose-capture.mjs --poses p.json --only t680,t700` @ task/T-102 | evidence: reports/tasks/T-102/captures/fix-1280x720-c1-t680.jpg vs -t700.jpg
Corner hand-off swaps worlds in one frame at camera progress 0.96. → T-122.

## I-102 | art | S2 | repro: same tool, labels approach/after1500 at 844x390 @ task/T-102 | evidence: reports/tasks/T-102/captures/fix-touch-844x390-c1-approach.jpg
Flat clear-colour voids at the screen edge near every corner, largest on the
phone (up to 18.7% of columns). → T-107.

## I-103 | feel | S3 | repro: `node tools/simlab/turnlab.mjs run --policy run --viewport desktop --json` @ task/T-102 | evidence: T-102 build report R3
Post-turn zoom pump (~40% closer, ~3.5 s pull-back). → T-107.

## I-104 | bug | S3 | repro: turnlab `clampNdc` @ task/T-102 | evidence: tools/simlab/TURNLAB.md limitation 4
RIG half off-frame when pinned at the right clamp at 1280x720. → T-107.

## I-105 | bug | S3 | repro: read `src/sim/level.js` slamSets + `builtGroundTopAt` @ task/T-102 | evidence: T-102 build report
The pre-bend column is a sim "hole" until the ritual (zipper strip); no visible
symptom. Goes away with the zip-assembly deletion (entry 25, T-121) — verify.

## I-106 | docs | S3 | repro: `grep -n GATE_RE tools/playtest/analyze-run.mjs` | evidence: src/ui/hud.js gate line
analyze-run.mjs parses a HUD format that no longer exists. → T-120.

## I-107 | fairness | S3 | repro: `node tools/simlab/race/lab.mjs baseline` (Table M6) @ 98b12c9 | evidence: artifacts/t104-race/baseline.json
HULL FALLBACK's streak resets on 8 tiles of cumulative rightward movement, so
pacing back and forth inside a held gate re-earns a full heal (T-104). Revisit
with T-203's rolling gates (no held gates).

## I-108 | docs | S3 | repro: `node tools/simlab/race/facts.mjs` | evidence: artifacts/t104-race/facts.json
docs/TRACK-ARCHETYPES.md says WORM is 6 × 65 = 390 tiles; the code builds 6 ×
88 = 528; camera.js's PORTRAIT_SAFE comment says portrait shows ~21-41 tiles,
the shipped 390x844 view is 19.0. → T-121 docs pass.


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
