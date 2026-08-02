PASS

Gate: T-030 (RUNTIME + ART lane). Worktree `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-030`,
branch `task/T-030`, commit `7c406d4`, merge-base `05a2e5d`. Read the
operator-goal-change block in `SPRINT.md` first: difficulty is explicitly not
a defect axis right now; readability and not-being-broken are. Judged only
`src/render/hostiles.js:226-236` (`HIT_TINT`/`FLASH`) — the only behavioral
diff — plus the artifact refresh.

Server: `node tools/serve.mjs 8771 --root .claude/worktrees/T-030 --quiet`.
For the empirical no-op check I also pinned the merge-base commit in a
disposable worktree and served it on 8772 (`git worktree add
<scratch>/mergebase-05a2e5d 05a2e5d`, removed after). 8741/8742 untouched
throughout; both temp servers killed and the merge-base worktree removed at
the end of the session.

## 1. Hit legibility at FAR (the actual risk here)

Built an independent capture rig (not the build's own `hitflash-capture.mjs`,
which stages the flash by writing `flashUntil` directly on a live row) that
drives **genuine combat** — real held-right/fire/jump input via CDP key
events, real 8-way aim (a simple "hold up when the nearest live wasp sits
>0.8 tiles above the muzzle line" reflex layered on an already-used harness
script) — and screenshots the instant the **sim itself** sets `flashUntil`
from a landed shot. `window.HB.hostiles` is the live raw sim array (confirmed
by reading `src/main.js:432-435`): it carries `flashUntil` but not the
`materialized` flag my first two attempts filtered on (that flag only exists
on the telemetry-mapped copy) — a bug in my own tooling, not the game's, fixed
before any evidence below was taken.

Two real, unstaged hit sequences, each with a same-sequence unflashed
companion frame (captured a poll-tick after `flashUntil` naturally expired,
same entity, same combat session — not a separate page load):

- **Hound (non-glowing body), FAR default**
  `.../scratchpad/pairs-hound-far/hound--0-hound-tell{,--unflashed}.png`,
  crops at `.../scratchpad/crops/hound-{flash,unflashed}.png`. Independently
  sampled (my own pixel tool, top-15%-luma pixels in a hand-picked box):
  unflashed body **sat 0.766, hue 83°, luma 136.3** (rich olive-green, clear
  facet shading) → flashed **sat 0.247, hue 82°, luma 216.4** (pale cream,
  facets flattened, hue held). A +59% luma jump with hue preserved and
  saturation dropped two-thirds — this unmistakably reads as a hit against
  the dark teal deck; it does not fall into a hueless-white non-entity the
  way the pre-pass flash did.
- **Wasp, dive state (already-glowing body), FAR default**
  `.../scratchpad/pairs-wasp-far/wasp--1-wasp-dive{,--unflashed}.png`, crops
  at `.../scratchpad/crops/wasp-{flash,unflashed}.png`. Here the flash
  (sat 0.228, hue 82°, luma 206.1) and the just-recovered dive-glow frame
  (sat 0.37, hue 68°, luma 220.7) look close enough in a still frame that I
  could not confidently call "was that a hit or just the dive glow" — the
  flash reads as a further wash-out on a body that's already bright, exactly
  what the build's own measurements (README/build.md "Measured, not
  asserted") describe and exactly operator question #2 in `build.md`. My
  independent, real-combat evidence **corroborates** that question rather
  than surfacing a new one — I did not land a genuine hit on a `cruise`-state
  wasp within budget (real aim without a full policy engine kept finding the
  dive window instead), so I can't independently add to the build's own
  `cruise` numbers, but the hound result generalizes the "non-glowing body"
  case with an even larger, cleaner margin than the build's own wasp-cruise
  figures.

**Judgment**: the hound case is an unambiguous improvement over the old
white wash — a hit reads as a hit, and reads as *this* creature getting hit,
not a generic flash. The dive-wasp case is a genuine, close call exactly as
the build already disclosed; it is feel, not a break, and belongs on the
operator checkpoint queue (build.md's question #2), not an Inbox defect. I
am not aware of a checkpoint-queue entry for T-030 yet in `SPRINT.md` —
worth adding when this merges.

## 2. Empirical no-op at `?view=near` and `?legibility=0`

Verified empirically, not just algebraically. Same real-combat rig, same
script (`hound-facetank-solo.json`), landed the same hound hit on both the
**current** commit and the **merge-base** commit (which has no `HIT_TINT`
code path at all — pre-dates the feature):

| build | setting | meanRGB | sat | hue | luma |
|---|---|---|---|---|---|
| current (7c406d4) | `?view=near` | [193,190,167] | 0.137 | 54° | 189.2 |
| merge-base (05a2e5d) | `?view=near` | [194,191,167] | 0.135 | 54° | 189.7 |
| current (7c406d4) | `?legibility=0` | [230,233,227] | 0.023 | 93° | 231.8 |
| merge-base (05a2e5d) | `?view=far` (default, old behavior) | [230,233,227] | 0.024 | 93° | 231.9 |

Both pairs match within capture-timing noise (these are two independent
real-time play sessions, not frame-locked staged pairs, so exact identity
isn't expected — but they're this close). This is real, not derived-from-the-
formula, confirmation that `?view=near` and `?legibility=0` reproduce the
pre-existing white flash byte-for-byte in practice. Evidence:
`.../scratchpad/noop-near-current/`, `.../scratchpad/noop-legibility0-current/`,
`.../scratchpad/noop-near-mergebase/`, `.../scratchpad/noop-far-mergebase/`.

## 3. No gameplay regression

- `node tools/pathcheck.mjs` (worktree): **1674 passed, 0 failed** — matches build/review.
- `index.html?selftest=1` (headless Chrome, pinned server): **SELFTEST PASS (29 checks)**, zero pageerrors, one console 404 (`favicon.ico`, the harness's own documented and filtered non-issue — verified it's the same in `lib/driver.mjs`'s console filter).
- `node run.mjs scripts/mid-route.json --deterministic --base-url http://127.0.0.1:8771`: `completed`, `pageErrors: []`.
- `node run.mjs scripts/transform-slice.json --deterministic --base-url http://127.0.0.1:8771`: `completed`, `pageErrors: []`.

## 4. Durability

100 s of continuous real combat (hold right + fire + jump/aim reflex,
default six-face run, FAR), polling every 20ms for non-finite hostile fields
and for `flashUntil` ever running further ahead of `gameMs` than the sim's
own constants (`+70`ms on a normal hit, `+40`ms on a polyp ping):
**0 console errors, 0 page errors, 0 non-finite fields ever observed, max
observed flash lead 70.0ms exactly (the sim's own constant — never stuck,
never runaway), 0 anomalies.** The run reached `GAME_OVER` ("SIGNAL LOST",
5 kills, 303 shots) at ~41s and the harness kept sampling the frozen end
screen cleanly for the remaining ~60s with nothing visually broken (final
frame: `.../scratchpad/durability/durability-final.png`). No NaN colour, no
stuck tint, no error, near a transition or otherwise.

## 5. Artifact honesty

Spot-checked independently (not trusting the review's own read): `file` on
both old (merge-base, via the same disposable worktree) and new
`sixface-boot--{classic,concept}.png` and `transform-boot--classic.png`
confirms **1280x800 in every case, no resolution change**. Visually, the old
`sixface-boot--concept.png` is a nearly-blank in-fixture deck frame (0 kills,
7m, a couple of platforms against dark teal void) — not actually a boot/title
screen — while the new one is the real HULLBREAKER title-screen composition
(logo, tagline, glowing capsule/hazard dots, diagonal ramp). This
independently confirms the review's explanation: the ~10x size jump is a
genuinely richer scene replacing a stale, wrong-content frame, not a
corrupted or resolution-mismatched capture.

## What I did not re-litigate

The review already verified the palette-token claim (box 1) was satisfied
before this branch via `b708bac`, and that I-032/fork geometry is untouched.
I re-read the diff stat myself and confirm only `src/render/hostiles.js`,
`reports/tasks/T-030/build.md`, and artifact PNGs/READMEs/scripts changed —
no sim, level, or fixture file — so I did not re-derive those findings, only
relied on the diff shape matching what both reports claim.

## Issue numbering

No new Inbox entry filed. My one substantive finding (dive-wasp flash
legibility is a close call) is already disclosed as build.md's operator
question #2 and belongs on the feel/checkpoint queue, not the bug Inbox —
filing a duplicate would just create noise. If another concurrent pass has
already filed something in this range, nothing here collides since I used
no `I-0##` number.

## Evidence paths (all under the session scratchpad, not the repo)

- `/private/tmp/claude-501/-Users-scottmeyer-projects-hullbreaker/c3d9d3c6-20d5-4194-9407-9c10d4ab6a1e/scratchpad/pairs-hound-far/`
- `/private/tmp/claude-501/-Users-scottmeyer-projects-hullbreaker/c3d9d3c6-20d5-4194-9407-9c10d4ab6a1e/scratchpad/pairs-wasp-far/`
- `/private/tmp/claude-501/-Users-scottmeyer-projects-hullbreaker/c3d9d3c6-20d5-4194-9407-9c10d4ab6a1e/scratchpad/crops/`
- `/private/tmp/claude-501/-Users-scottmeyer-projects-hullbreaker/c3d9d3c6-20d5-4194-9407-9c10d4ab6a1e/scratchpad/noop-near-current/`, `noop-legibility0-current/`, `noop-near-mergebase/`, `noop-far-mergebase/`
- `/private/tmp/claude-501/-Users-scottmeyer-projects-hullbreaker/c3d9d3c6-20d5-4194-9407-9c10d4ab6a1e/scratchpad/durability/durability-report.json`, `durability-final.png`
- `/private/tmp/claude-501/-Users-scottmeyer-projects-hullbreaker/c3d9d3c6-20d5-4194-9407-9c10d4ab6a1e/scratchpad/t030-mid-route/`, `t030-transform-slice/` (smoke reports)

These are session-scratch, not committed evidence — if this gate's evidence
needs to persist past the session, it should be copied into
`reports/tasks/T-030/` before the worktree is pruned.
