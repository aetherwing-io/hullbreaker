# G2 — neck access-plate flip gate (T-008)

Evidence pack for the greybox proposal's §G2 gate fixture
(`docs/proposals/2026-07-meridian-monster-greybox-map.md`), built on
T-001's landed static-anatomy grammar: the relock-on-detent plate beat is
reused verbatim — snap 1 exposes and carries the plate, the hold rotates
and relocks only the plate, snap 2 commits the camera to a neck interior
that already existed.

**URL for judgment:** `http://127.0.0.1:8741/index.html?g2=1`
(serve with `python3 -m http.server 8741` from the repo root; add
`&enemies=0` to watch choreography without the houndframe/wasps,
`&view=near` for the pre-view-scale framing). Off by default: every other
URL — including plain `?slice=transform` — keeps the shipped v1 fixture
byte-identical (pathcheck asserts the selection restore).

## What this fixture is

The proposal's P2 numbers, authored literally: phase start `s89` at render
altitude +12, scroll halt `140` (u51), pivot `154` (u65), a 14-tile gate
apron, +16 of the phase's lift earned on the ribline grade on foot, and
zero altitude granted by the ritual. One 11-tile door-like access plate
(inside the proposal's 10–12 band) is the only thing on the body that
moves; relocked, it rakes to the interior climb grade — the "become an
interior ramp" beat — as pure render dressing over static carried
collision (`gate.carry`, the flat deck columns spanning mouth →
threshold on both sides of the seam).

Five immediate routes per the proposal: high scute ridge, twin-rib
chimney (greyboxed as jump/air-jump stubs — the wall-launch verb is
traversal-slice-only until it graduates), broad scapular plate, low
joint-collar floor, and a short underside hang under the 126–129 gap
rejoining at the chimney base (the dare pocket, with declared retreat
timing asserted against the frozen jump physics). Continuity connectors
near local y ≈ 3 / 6 / 9 meet the plate's mouth and continue inside, so
the flip preserves three recognizable exits. A houndframe paces an
18-tile chokepoint on the low route into the gate; a wasp contests the
chimney apex.

## Frames

Keyed on the gate's telemetry clock; exact `tMs`/`playerX` per frame in
`index.json`. Enemies are LIVE in this capture (unlike cp3-transform-v3)
because the hound-low / wasp-apex pressure is part of the proposal's G2
spec. `00`–`01` approach lattice and route convergence; `02` the armed
plate swung to ajar at the halted apron; `03`–`06` the ritual (windup,
snap-1 clack at the camera detent, relock-and-rake on the hold, snap-2
commit); `07`–`08` the prebuilt interior with both exit catwalks; `09`
clear.

**Re-captured 2026-08-02 (T-030).** The committed set had gone stale twice
over: it was shot before T-010 made the CONCEPT palette the default, so every
frame was the grey-box, and `00` carried the pre-I-010 hit flash — the
featureless white quad that cost the T-008 gate real time before it was
identified as a shot wasp. The frames here are a fresh `node
tools/playtest/g2-capture.mjs shots` on this tree: same beats (every
`ritual.state`/`tMs` within 200ms and every `playerX` within 0.35 tiles of the
old `index.json`), current renderer. RIG blinking through his i-frames
(`src/render/player.js`) can still make him hard to find in a given frame —
that half of I-010 is untouched.

## Honesty notes

- The capture driver is closed-loop (position-window jumps, the same
  route the committed `tools/playtest/scripts/g2-neck-flip.json` proves
  deterministically); trust `index.json`'s recorded `tMs` for beat
  placement, not the filenames.
- The HUD/overlay still hardcode the v1 demo's "N/2 TURNS · N of 2
  transformations" copy (both files are owned by in-flight lanes); with
  one G2 turn this reads "1/2". Cosmetic, flagged for the integrator.
- The sim is touched only by: the fixture data itself, the fixture
  selector (default v1), a per-event gate-geometry override
  (haltOffset/seamPullTiles, CONFIG untouched), and the spawner's
  fixture-authored houndframe branch (fires only for tables that author
  `type: 'hound'` — v1 and the six-face run author none).

Operator questions travel with the task report / SPRINT checkpoint queue.
