# T-012 builder report — WebAudio synth layer

Worktree: `.claude/worktrees/T-012` · branch `task/T-012` · owner gameplay-engineer
Status: fix pass complete — all four review findings (2 MAJOR, 2 MINOR) addressed.

## What shipped

`src/ui/audio.js` (new, ui-layer only): procedural SFX — hit, kill, hurt,
fall, jump/air-jump, launch, pickup (letter vs mod), lance warning,
houndframe tell/charge, ritual wind-up + two yaw-snap clunks + settle boom,
per-weapon fire (R/S/L/H/F) — plus a wave-layered mechanical ambience: one
always-on machine bed and up to six additional layers, each its own
frequency band on its own slow LFO, gaining one layer per finished corner /
committed transform band (DESIGN altitude-perception: "music and mechanical
ambience gain layers at each break"). No audio files, no deps, no sim
writes: the module wraps the existing `src/sim/bridge.js` view hooks
(calling the prior implementation first) and reads exported sim state the
way `overlay.js` does. `src/main.js` gains exactly one side-effect import.
`tools/pathcheck.mjs` gains static guards: sanctioned-import allowlist, sim
never references audio, wrapper-delegation, `?audio=0` wiring gate, snap
frame ordering.

## Fix pass (review findings)

1. **MAJOR, layering off by one** — `applyLayers()` moved from
   `onFaceRevealed` to `onCornerFinished`. `wavegate.finishCorner` fires
   `faceRevealed` *before* `c.state = 'done'` and `corner.finished` after
   it, so recounting on `faceRevealed` missed the completing corner and the
   last face's layer never entered the mix. Three new pathcheck assertions
   lock the fix: recount present in `onCornerFinished`, absent in
   `onFaceRevealed`, and `finishCorner` commits `'done'` before
   `corner.finished` (so a future sim reorder trips the gate). Measured
   before/after below.
2. **MAJOR, missing builder report** — this file.
3. **MINOR, false pickup chime** — `onCapsuleRemoved` now mirrors the sim's
   own catch predicate: returns early on the pop expiry/cull conditions
   (`killY`, `dieAt` — checked first in `updateCapsules`, so an expiring
   capsule under RIG is an expiry, not a pickup) and requires
   `gameMs >= noCatchUntil` before the overlap test. Accepted edge
   (documented in-code): a `resetGame` teardown removal on the exact frame a
   catchable capsule overlaps RIG could still chime once, under the
   retry/game-over duck.
4. **MINOR, comment claiming unrecorded bookkeeping** — header now says the
   CONFIG fold is *suggested in this report* (see Follow-ups), not
   "recorded". No SPRINT entry is claimed.

## Verification

| Command | Result |
| --- | --- |
| `node tools/pathcheck.mjs` (in worktree) | **654 passed, 0 failed** (includes the 3 new ordering guards) |
| smoke `mid-route.json` `--deterministic --max-runtime-ms 15000 --base-url http://127.0.0.1:8791` (worktree served) | `"result": "completed"` |
| smoke `transform-slice.json` `--deterministic --max-runtime-ms 20000 --base-url http://127.0.0.1:8791` | `"result": "completed"` |
| instrumented listen probe (below) | layering exact; boot-mute clean; `?audio=0` inert |

## Listen note (instrumented) — and its honest limits

The builder is an agent and cannot hear; what follows is *machine* listen
evidence, and the audible verdict is queued for the operator (questions
below). Method: headless Chrome (the playtest harness's playwright-core),
the worktree build served live, `AudioParam.linearRampToValueAtTime`
instrumented before load. Only `applyLayers` ever ramps a gain to exactly
1, so "ramps to 1" = layers entering the mix. After a real (trusted)
keydown unlock, the game's own `finishCorner` pipeline was driven for all
six corners (probe: session-scratchpad `audio-listen-probe.mjs`; dev
evidence only, deliberately not committed).

- Pre-gesture: zero `AudioContext` constructed, `contextState 'none'`,
  zero console/page errors — sounds are skipped, never queued, no autoplay
  error. After keydown: context `running`, base bed engaged (1 layer).
- Layer engagement per corner, `(corner, target, engaged)`:
  - **pre-fix (2c28e35):** (1,2,1) (2,3,2) (3,4,3) (4,5,4) (5,6,5) (6,7,6)
    — first ritual gains nothing, every layer one face late, 7th layer
    never engaged. Exactly the review's diagnosis.
  - **post-fix:** (1,2,2) (2,3,3) (3,4,4) (4,5,5) (5,6,6) (6,7,7) — a new
    band enters the mix on every corner commit, including the last.
- `?audio=0`: zero contexts, zero errors — muted boot is inert as
  specified.
- Only console noise in any pass: two `favicon.ico` 404s from the static
  server — pre-existing, unrelated to audio (repo ships no favicon).

Transform-path layering was reviewed as already correct
(`transform.js` sets `'done'` before its finished hook) and is exercised by
the `transform-slice.json` smoke; it shares `applyLayers` with the fixed
path.

## Acceptance boxes

- [x] sim emits events via existing bridge hooks only; audio module is
      render/ui-side and boot-optional — pathcheck static guards + probe
      (pre-gesture mute, `?audio=0` inert, no autoplay errors)
- [x] per-face ambience layering across corner rituals — machine-verified
      (table above); *audibility* is the operator's call, below
- [x] pathcheck green (layer guards prove sim untouched); smoke green

## Open feel questions for the operator (this report does not judge fun)

Listen at `python3 -m http.server 8741` →
`http://127.0.0.1:8741/index.html` (full run; compare `?audio=0`):

1. Do the two yaw-snap clunks in the corner ritual land as monumental,
   seismic impacts, or read as generic thuds?
2. Is each new ambience layer audible as a *new band entering* per DESIGN
   (esp. faces 5–6, where the high bands arrive over combat SFX), or does
   it just read as "slightly louder"?
3. Are the five weapon voices (R/S/L/H/F) distinguishable blind while
   firing on the move?
4. Warning cadence: is the lance telegraph beep (throttled to 350 ms)
   informative pressure or nagging?
5. Mix: ambience bus sits at 0.32 under 0.8 SFX — present during quiet
   climbs without masking hit feedback?

## Follow-ups for the integrator

- Fold the `A` tuning block into `CONFIG` as `CONFIG.audio` once the T-004
  config lane lands (the audio.js header points at this report; turning it
  into a SPRINT task/Inbox entry is the integrator's call — SPRINT is left
  untouched to avoid a contended-file conflict from this lane).
- Suggested operator checkpoint-queue entry: the five feel questions above,
  URL as given.
