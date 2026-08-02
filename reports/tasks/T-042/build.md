# T-042 build report — audio punch

Worktree: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-042`
Branch: `task/T-042`, based on `69e1f90` ("SPRINT: T-036 done"). Uncommitted
working-tree changes.

Files touched: `src/ui/audio.js` and `tools/pathcheck.mjs` only.

```
 src/ui/audio.js     | 316 ++++++++++++++++++++++++++++++-----
 tools/pathcheck.mjs | 461 ++++++++++++++++++++++++++++++++++++++++++++++++++++
 2 files changed, 735 insertions(+), 42 deletions(-)
```

**Addendum, second pass.** The team lead unblocked the pressure curve
(authorized extending `tools/pathcheck.mjs`'s T-012 sim-read allowlist
directly rather than waiting further) and asked for two more things: ship
audio on by default (already true — no change needed, see below), and pair
the impact sound with T-041's velocity-driven impact/travel language
(decisions.md entry 15). Both are now done; this report supersedes the
earlier draft rather than appending to it.

## What changed and why

**Weight on impacts.** `sfxHit` (bullet lands — the single most frequent
sound in the game) and `sfxKill`/`sfxHurt` now layer a low sine element
under their existing tick/buzz, and `sfxKill` gained a bright, very short
"crack" transient so it reads as a two-part "crunch, then thud" distinct
from `sfxHit`'s plain tick. `sfxHurt` (life-critical feedback) also gained a
gut-punch sub layer.

**Per-weapon distinctness.** RIFLE (`R`) gained a touch of high-frequency
"crack" on top of its existing blip, kept deliberately small since it fires
fastest and must not drown the other four; SPREAD (`S`) gained a sub thump;
FLAME (`F`) gained a crackle riding its whoosh. LASER/HOMING were already
distinct per T-012 and are unchanged.

**A dedicated destruction voice for the orbital-lance screen-clear
(pillar 4 — "every break changes the game").** The ORBITAL LANCE mod kills
every hostile on screen on one frame via the normal `hitHostile`/
`removeHostile` path, which the existing throttled `sfxHit`/`sfxKill` (one
gate key each, ~45ms) flattens into a single ordinary tick+thud — the
biggest destruction beat in the game was sounding like the smallest one.
`sfxLanceStrike()` is a new, distinctly bigger, always-full-weight voice
(lower/longer sub-boom, a wide crackle standing in for every kill the
throttle masks, a descending mechanical groan), fired from
`onLanceTelegraph(L)` the exact frame `gameMs` crosses `L.at` — using data
the bridge *already* hands that hook (`L.at`) plus the `gameMs` import
audio.js already had. No new sim import needed for this one.

**Readability under load (pillar 5 — "chaos stays readable").** Two
independent, composable mechanisms:
- `loadScale()`: every *ordinary* one-shot's peak gain shrinks a little per
  voice already sounding (`1/(1+voices*0.055)`), so a crowd of simultaneous
  hits sums toward "louder, still readable" instead of stacking toward
  clipped mush. A `prio` flag (added to `tone()`/`noiseHit()`) exempts hurt,
  fall, the ritual snaps/booms, the lance strike, the warn alarm, the crush
  ping, and the win/lose motifs — those must always cut through regardless
  of how busy the mix is. `prio` never bypasses the hard 14-voice cap, only
  the loudness formula (proven both ways — see verification).
- `heat`/`combatDuck`: a second, slower duck on the ambience bed, separate
  from the existing state-driven `ambDuck` (retry/over/victory). Recent
  hit/kill/fire/lance events push heat up (decaying ~1.0/s); a busy fight
  ducks the machine hum so weapon/impact sound has headroom, and a lull
  lets it climb back. The two ducks multiply (`A.ambience * ambDuck *
  combatDuck`) rather than one replacing the other, so a retry mid-fight and
  a combat lull easing off never fight over the last word.

**The pursuing-edge audible pressure curve (now built).** A persistent low
rumble bus (`pressureBus`, built once alongside the ambience layers — an
always-live node, gain-zeroed until needed, same pattern) whose gain tracks
`crushWarnIntensity(player.x - player.hw - sLeftEdge(), CONFIG.juice.crush)`
— the EXACT pure function and the EXACT margin expression `render/juice.js`
already drives the visual crush-warning haze with, so the ear and the eye
can never disagree about how close the plane is. A separate ping is
edge-detected off `warnPulse()`'s own continuous wave (same
`CONFIG.juice.crush.pulseSlowMs`/`pulseFastMs` the visual blink uses,
sampled each frame and fired on a rising crossing through 0.5) rather than
re-deriving its period formula — a retune of the visual cadence retunes the
ping for free, and the two cannot drift apart in tuning. The ping's own
pitch also rises with intensity, and it's `prio` (always cuts through).

This needed the one new sanctioned sim read the earlier draft of this
report flagged as blocked: `sLeftEdge` from `src/sim/edges.js`.
`sliceStats.minEdgeMargin` (already sanctioned) was the only workaround I
found, and it's a running MIN for the whole life — monotonically
non-increasing, which would pin the alarm near-max forever after one close
call even after the player earns 20 tiles of daylight back, worse than not
having the feature. The team lead authorized extending
`tools/pathcheck.mjs`'s T-012 `audioSimAllow` map directly (one line,
`'../sim/edges.js': ['sLeftEdge']`, same shape as the four entries already
there, commented with the authorization and this report) rather than
leaving the feature undone.

**The impact/travel pairing (decisions.md entry 15).** T-041 scales a
spark's own stretch, and every bullet's own drawn nose, by that thing's OWN
current velocity — "a bigger hit reads bigger." `sfxHit(dmg)` now takes the
hp actually lost (1 for R/S/H/F, 2 for LASER — `CONFIG.weapons.*.damage`)
and nudges its square/sine layers' pitch down and gain up a little for a
2-damage hit, the same pairing drawn in the visual language: a harder hit
reads a little bigger in the mix too, not just on screen. Kept deliberately
small (a ratio of 2 at most, since damage is only ever 1 or 2 outside the
lance's instant-kill 999, which already has its own dedicated voice) —
restrained, not dramatic.

Same-frame timing with T-041's spark stretch needed no code change: both
`src/ui/audio.js` and `src/render/fx.js`/`src/render/juice.js` wrap the SAME
`view.hostiles.sync`/`view.hostiles.removed` bridge hooks (each wrapper
calling the previously-installed one first), so a hit's sound and its
spark's stretch are scheduled inside the same synchronous dispatch of the
SAME event — already frame-perfect by construction, not something this
task needed to build.

**Declined: a loaded sample would NOT be better here**, despite asset
independence now being retired (decisions.md entry 16). The brief still
calls for synthesized audio, and I agree with it: a Contra-style run-and-gun
firing 5+ weapons and dozens of hit/kill events per second wants layered,
parameterized synthesis (pitch/gain that scales with damage, a ping whose
pitch and rate track a live intensity, five distinct fire recipes sharing
one primitive) — the kind of thing a handful of pre-rendered samples can't
do without either a large sample library (bandwidth, load time, the thing
"no runtime dependencies" was designed to avoid) or sounding repetitive
under this game's event density. No operator decision has asked for
recorded audio, and nothing here needed one.

**Audio is already on by default (decisions.md entry 16).** `AUDIO_ON =
QUERY.get('audio') !== '0'` — true unless the player explicitly opts out.
Nothing in this task added a new flag; every new mechanism runs whenever
audio is on, no new "off unless you type this" surface was created.

**Incidental fix: a latent `gate()` throttle bug.** `gate(key, ms)` used
`lastAt[key] || -1e9` to detect "never fired before." If a key's first-ever
fire lands at exactly `t===0`, `0` is falsy, so the very next call would
treat it as "never fired" and refire immediately — defeating the throttle
for one key on one frame. This never bites in real play (real
`ctx.currentTime` is essentially never exactly 0 when two gated events
coincide) but it's exactly what my behavioral pathcheck harness's frozen
fake clock hit, which is how I found it. Fixed to `??` (one line). Verified
by breaking it back to `||` and watching a specific pathcheck assertion go
red, then restoring.

## Verification

### `node tools/pathcheck.mjs`

Base (this branch's parent, via `git stash`): **1741 passed, 0 failed**.
After this change: **1785 passed, 0 failed** — **44 new assertions**, zero
regressions, zero weakened.

The new block (delimited, appended at the very end of the file) has two
halves:

**Static** (regex against source, same style as the T-012 block): the
lance-strike voice and its wiring exist; no new `sim/mods.js` import;
`sLeftEdge` IS imported (the one new sim read, with its allowlist provenance
commented); the pressure curve reads the exact margin expression and calls
`warnPulse()`/`crushWarnIntensity()` rather than reimplementing them;
`loadScale()`/`updateCombatHeat()`/`applyAmbienceGain()` exist; the two
ambience ducks compose by multiplication; every intended `prio` function
passes `true` and every intended load-scaled one does not (checked by name,
both directions, all five weapon-fire recipes included).

**Behavioral**: audio.js needs `window`/`document`/`AudioContext` to do
anything past import, so this stubs the small WebAudio surface the module
actually calls and drives the *real* shipped module through the *real*
`src/sim/bridge.js` view hooks — not a reimplementation of the logic under
test. Gain nodes now track their OWN automation history (`newGainPeaks()`
reads the peak scheduled by every gain node *created* during a measurement
window) rather than a shared global ramp log, specifically because the
pressure curve's per-frame rumble ramp touches a *pre-existing* node every
`onPlayerSync()` call and would otherwise contaminate an unrelated
measurement (this is exactly the bug that first exposed the fix below).
Six scenarios, each its own fresh child process:

1. **Load-scaling**: `sfxHurt` (prio) schedules the *identical* 3 gain
   peaks at zero load and at moderate load; `sfxJump` (non-prio) schedules
   a strictly smaller, but still nonzero, peak at moderate load.
2. **The hard cap holds under deliberate overload**: 80 rifle shots
   fired back-to-back hold `voices` at exactly the 14-voice cap, never
   over; the lance strike, attempted at that saturated load, schedules 0
   more rather than crashing or exceeding it.
3. **The lance strike's own voice cost, with headroom**: armed-but-not-due
   schedules 0; the exact frame `gameMs` crosses `L.at` schedules exactly 4
   (2 tone + 2 noiseHit); a further frame on the *same* `L` schedules 0
   more — checked WITH headroom so a dedup regression can't hide behind the
   cap the way it could in scenario 2 (proven: see "broken and restored"
   below).
4. **Combat-density duck**: a burst of hostile hits raises heat above 0 and
   ducks `combatDuck` below 1; a lull afterward lets both recover.
5. **The pressure curve**: intensity is exactly 0 outside
   `CONFIG.juice.crush.startTiles`; it's higher at 0.2 tiles than at 1.7
   tiles; the ping fires more often (in a fixed 2-second window) at 0.2
   tiles than at 1.7 — the same accelerating cadence as the visual blink.
6. **The impact/travel pairing**: a 2-damage hit schedules a bigger
   square/sine peak than a 1-damage hit, on the exact same 3-ramp shape
   either way.

**Proved by breaking, not just green** — five mechanisms broken and
restored in turn, confirming pathcheck goes red and the right assertion(s)
name the break (verified `git status --short` clean and `git diff HEAD
--stat` back to the intended diff after each restore):
- Disabled the `voices >= A.maxVoices` guard in `tone()` → the
  80-shot-overload assertion failed (got 47, not 14), plus the scenario-2
  lance-under-saturation assertion.
- Removed the `lanceStruckAt !== L.at` dedup → the *headroom* repeat
  assertion (scenario 3) failed; the scenario-2 version did NOT catch it
  (cap already full, masking the regression) — exactly why scenario 3
  exists as a separate, headroom-guaranteed check.
- Removed `, true` from `sfxHurt`'s three calls → both the static
  "passes prio=true" assertion and the behavioral "peaks match regardless
  of load" assertion failed, with the actual load-scaled values printed.
- Reverted `??` to `||` in `gate()` → the lance-with-headroom scenario's
  voice counts came out wrong (6 instead of 4, a spurious extra warn-beep)
  purely from the frozen-clock edge case.
- Forced `crushWarnIntensity`'s call site to return a hardcoded `0` →
  all three pressure-curve assertions failed together.
- Hardcoded `sfxHit`'s weight factor `w = 1` → the damage-pairing assertion
  failed with the (now-equal) peak values printed.

### Browser smoke (real Chrome via Playwright, not headless-mocked)

Pinned server: `node tools/serve.mjs 8790 --root
/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-042 --quiet`
(port 8790 — never 8741/8742; killed at the end of the session).

```
cd tools/playtest && npm install   # playwright-core, once
node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000 \
  --base-url http://127.0.0.1:8790 --out runs/gate-T-042b-mid
node run.mjs scripts/hound-facetank-25.json --deterministic --max-runtime-ms 20000 \
  --base-url http://127.0.0.1:8790 --out runs/gate-T-042b-hound
```

Both: `consoleErrors: []`, `pageErrors: []`, `bootError: null`.
`mid-route` → `result: "completed"`, 0 deaths. `hound-facetank-25` →
`result: "stalled"` (expected — it's a sustained-damage endurance script,
not a route-completion one), 4 hits / 1 kill registered.

**The pressure curve, proven live in a real WebAudio context, not just the
synthetic harness.** A custom scratch probe (Playwright, not committed) ran
`?slice=traversal&enemies=0` (the `idle-greedy` fixture's own URL — the
player does nothing, so the pursuing crush edge closes on its own) for 24s,
sampling `window.HB.audio().pressure` and the live margin every 500ms:

```
margin 4.22  pressure 0
margin 3.18  pressure 0.004
margin 1.91  pressure 0.193
margin 0.50  pressure 0.728
margin 0.40  pressure 0.779   (holds here — the crush plane pins the player)
...          hp drops to 0, life ends
margin 39.16 pressure 0       (fresh life: pressure/rumble reset cleanly)
```

Pressure is 0 for the whole 27-tile approach, then rises steeply exactly as
the margin crosses `CONFIG.juice.crush.startTiles` (3.4) — the same curve
the synthetic pathcheck scenario proved, now confirmed against the real sim
and a real (if headless) `AudioContext`. The reset-on-death/retry logic
also fires correctly in a real run (pressure returns to exactly 0 the
instant the next life starts, matching the synthetic assertion). Zero
console errors throughout.

A second custom probe drove `hound-facetank-25` (real keydown gesture, hold
right + hold fire, 13s) sampling `window.HB.audio()`/`window.HB.perf()`
every 400ms:
- **Voices genuinely respond to real combat**: 0–5 concurrent voices
  tracking actual hits, never near the 14 cap in this mild encounter.
- **Heat rose (peaked ~0.14) but `combatDuck` never visibly dipped below 1
  at 400ms sampling** in this specific light (single-hound) fight — the dip
  math is correct (proven synthetically with a denser burst, scenario 4
  above) but this encounter's hit density was low enough, and my polling
  coarse enough (400ms vs the ~140ms internal recompute), that I didn't
  catch a transient dip in THIS real run. Filed as a proposed issue below
  rather than claimed either way.
- **Autoplay/console health**: identical with audio on and `?audio=0` —
  0 console errors, 0 page errors in both. The only warnings in either run
  are identical headless-Chrome `GPU stall due to ReadPixels` messages,
  present with audio OFF too — a software-rendering sandbox artifact, not
  caused by this change.

**Frame-time delta — measured, with the same honesty caveat as before.**
Audio ON averaged ≈60–62ms/frame, audio OFF ≈51–52ms/frame in this sandbox,
consistent across swapped run order. Both numbers are already 3× the
16.7ms/frame (60fps) budget regardless of the audio flag — this headless
sandbox has no GPU acceleration (identical `GPU stall due to ReadPixels`
warnings in both conditions), so it cannot support a trustworthy
60fps/200-projectile verdict at all, with or without audio. I am NOT
claiming audio costs ~10ms/frame in a real, GPU-accelerated browser — I'm
reporting what a contended, software-rendered sandbox showed, consistently,
and flagging it as inconclusive. Structurally, everything added in this
pass is either O(1) extra arithmetic at already-throttled call sites, or
throttled to ~140ms (≈7Hz) itself (`updateCombatHeat`); the pressure curve
adds one AudioParam ramp call and one `warnPulse()` sample per frame
(`updatePressure()`, called from the already-per-frame `onPlayerSync()`) —
cheap, but genuinely new per-frame work, and the one thing I'd most want
re-measured on real, non-headless hardware via
`tools/playtest/juice-stress.mjs`-style stress before treating any
frame-time number here as final.

## Open feel questions for the operator

Never judged by me — machine gates don't judge fun. Exact URL:
`http://127.0.0.1:8741/index.html` (six-face default), `?slice=traversal&
hound=2.5` for a denser hound fight, or `?slice=traversal&enemies=0` and
just standing still to hear the pressure curve build.

1. Does the bullet-impact sound (`sfxHit`) now read as having real weight,
   and does a LASER hit (2 damage) read as noticeably heavier than the
   others, or is that pairing too subtle to notice?
2. Do the five weapons still sound like five different guns, or did giving
   the rifle a touch of "crack" make it read as less of a light, rapid
   workhorse than before?
3. Standing still and letting the crush plane close in (`?enemies=0`): does
   the rising rumble + accelerating ping read as real, escalating danger,
   or does it fight with/get lost under the ambience bed?
4. Is the new lance-strike destruction sound distinct enough from a normal
   kill to read as "I just cleared the whole screen," or does it need to be
   bigger/longer/weirder?
5. In a fight with several hostiles firing/dying close together, does the
   machine-ambience recede in a way you can actually notice (the
   combat-density duck), or is it too subtle to matter?

## PROPOSED INBOX ISSUES

```
## I-??? | feel | S3 | repro: tools/playtest custom probe (not committed) against
  ?slice=traversal&hound=2.5, real Chrome, hold-right+hold-fire 13s | evidence:
  reports/tasks/T-042/build.md "Browser smoke" section
one paragraph: the combat-density ambience duck (heat/combatDuck) is proven
correct in isolation (pathcheck's synthetic burst shows it dip and recover
cleanly) but did not visibly dip in a real, mild single-hound fight (heat
peaked ~0.14, the dip if any was smaller than my 400ms sampling could catch).
Worth an operator listen at a denser multi-enemy fight before deciding
whether the tuning (A.heat.* bump sizes, heatDuck=0.5) needs to be more
aggressive for the effect to read in ordinary play, or whether it's
correctly reserved for genuinely dense chaos and fine as-is.
```

```
## I-??? | bug | S3 | repro: node tools/pathcheck.mjs (T-042's behavioral
  section) with gate()'s `??` reverted to `||` | evidence: this report's
  "incidental fix" note above
one paragraph: src/ui/audio.js's gate(key, ms) used `lastAt[key] || -1e9`
to detect "never fired." A key firing at exactly ctx.currentTime===0 would
be treated as unset on the NEXT call (0 is falsy), letting a throttled
sound refire one frame early. Effectively unreachable in real play (real
AudioContext clocks are never exactly 0 twice), found only by a synthetic
test with a frozen clock. Already fixed in this diff (`?? ` instead of
`||`) — filing only so the fix is traceable to a numbered issue, not
because anything is currently broken.
```

## What's left / next action

Nothing blocked. This diff is **uncommitted** in the worktree
(`git status --short` shows exactly the two files plus this untracked
report). Single best next action: commit on `task/T-042` and hand to
review/playtest, or tell me to commit it myself.
