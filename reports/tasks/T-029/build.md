# T-029 — build report

Three runtime-truth fixes (SPRINT inbox I-005, I-009, I-030). Worktree
`.claude/worktrees/T-029`, branch `task/T-029`.

## What changed and why

### 1. `audioSnapshot()` is reachable from the console (I-005)

`src/main.js` now imports the function by name from `src/ui/audio.js` (same
position in the import list, so the load-order contract the audio module's own
header states is untouched) and publishes it on the always-present debug handle
as `window.HB.audio`. With no build step, an exported-but-unimported symbol is
reachable from nothing — which is why the T-012 gate had to monkey-patch
`AudioParam.prototype.linearRampToValueAtTime` to recover a layer count this
function already returns.

`src/ui/audio.js` itself is unchanged. The publication is on `window.HB` (every
URL), not on `?testapi=1`, and pathcheck asserts both halves of that.

Measured on the shipped URL (no flags), headless Chrome:

| | `enabled` | `unlocked` | `contextState` | `layers` | `voices` |
|---|---|---|---|---|---|
| before any gesture | true | false | `none` | 0 | 0 |
| after one keypress | true | true | `running` | 1 | 0 |
| `?audio=0` | false | false | `none` | 0 | 0 |

### 2. Turn counters read the loaded fixture (I-009)

`src/ui/hud.js` and `src/ui/overlay.js` took their denominator from
`ACTIVE_FIXTURE.events.length` instead of the v1 demo's hardcoded 2. The
overlay line also pluralizes off the same count, so a one-event fixture reads
"1 of 1 transformation".

`#ovTitle` is untouched: the harness classifies a transform outcome off
`BREACH CLEAR` (`tools/playtest/lib/sampler.mjs:262`), not off the body copy.

Measured, fresh runs on this branch:

- `?g2=1` (`scripts/g2-neck-flip.json --deterministic`, outcome `completed`):
  HUD reads `0/1 TURNS` before the flip and `1/1 TURNS` after; the clear
  overlay reads `12.2s · 1 of 1 transformation · 0 kills`. Capture:
  `reports/tasks/T-029/evidence/g2-breach-clear.png`.
- `?slice=transform` (`scripts/transform-slice.json --deterministic`, outcome
  `completed`): `0/2 → 1/2 → 2/2 TURNS` and `15.6s · 2 of 2 transformations ·
  0 kills` — byte-identical to the committed demo report
  (`tools/playtest/reports/demo/transform-slice/report.json`), i.e. the shipped
  fixture's copy did not move.

### 3. The earned drive rides the frozen channel (I-030)

`telemetry()` in `src/main.js` publishes, beside `pursuitSpeed`/`pursuitPeak`:

```js
momentum: MOMENTUM_ENABLED ? { drive, peakDrive, tier } : undefined
```

Additive and flag-gated exactly like `hook`/`flow`: the key is `undefined`
without `?momentum=1` and disappears entirely across a JSON round-trip
(verified in-browser: `'momentum' in JSON.parse(JSON.stringify(snapshot))` is
`false` on `?testapi=1` alone). No existing field changed. `drive` and
`peakDrive` come from `src/sim/pace.js`'s existing getters, `tier` from
`momentumTier()` in `src/pure/momentum.js` — no new sim state, no new pure
math, nothing written from the render side.

Why the field rather than the packet's inversion: `drive = (pursuitSpeed/4.3 -
1)/0.4` is exact **while escalation is the only source feeding that number**.
T-023's boosts push their own speed through the same `momentumClampSpeed`
chokepoint by design, and at that point the same 5.5 t/s can mean "earned" or
"boosted" — so the T-022 packet's falsifying gate ("drive never exceeds 0.30
for a struggling player") stops being readable from a trace. Both halves are
now asserted in pathcheck.

## Verification

Every command was run in this worktree. Servers used ephemeral ports chosen by
`tools/playtest/lib/server.mjs` (`port: 0`); ports **8741/8742 were never
bound** — the observed ports were 57898 / 58492 / 58617 / 58674 and the probe's
own random port.

| command | result |
|---|---|
| `node tools/pathcheck.mjs` | **1701 passed, 0 failed** (exit 0) |
| `index.html?selftest=1` | `SELFTEST PASS (29 checks)`, no page errors |
| `?selftest=1&g2=1` | `SELFTEST PASS (30 checks)` |
| `?selftest=1&slice=transform` | `SELFTEST PASS (30 checks)` |
| `?selftest=1&slice=traversal` | `SELFTEST PASS (31 checks)` |
| `?selftest=1&momentum=1` | `SELFTEST PASS (29 checks)` |
| `?selftest=1&audio=0` | `SELFTEST PASS (29 checks)` |
| `run.mjs scripts/g2-neck-flip.json --deterministic` | outcome `completed`, 168 samples, testapi fidelity |
| `run.mjs scripts/transform-slice.json --deterministic` | outcome `completed`, copy unchanged for v1 |
| `run.mjs scripts/mid-route.json --deterministic` | outcome `completed` |
| `run.mjs scripts/momentum-strong.json --deterministic --max-runtime-ms 62000` | ran the full 60.9 s window, peak pursuitSpeed 5.548 t/s (×1.290, drive 0.725), HUD meter climbed `▱▱▱ ×1.00 → ▰▰▱ ×1.29`. `outcome: not-completed` is this script's documented behaviour (no bot run reaches VICTORY) |
| browser `?momentum=1&testapi=1` channel read | `momentum: {drive, peakDrive, tier}` present and live; drive 0 at boot, 0.177 mid-run, peakDrive 0.196 held after the live drive collapsed |

Evidence committed under `reports/tasks/T-029/evidence/`: the G2 BREACH CLEAR
screenshot, that run's `summary.md`, the browser probe JSON (selftest title,
audio snapshots, flag-off channel shape) and the `?momentum=1` channel trace.

### Pathcheck: what was added, and two assertions I changed on purpose

Added a `T-029 — runtime truth` section (18 new assertions) covering:

- audio: the export still exists; it lands inside the `window.HB` literal and
  **not** inside the `?testapi=1` block; the snapshot still answers the six
  fields the T-012 gate had to infer (`enabled, unlocked, contextState, dead,
  layers, voices`) and takes its layer count from the mixer's own
  `layerTarget()`;
- turns: neither UI file contains the old literal; both read
  `ACTIVE_FIXTURE.events.length`; the pluralization rule; and, for **every**
  transform fixture, `bands.length === events.length + 1` with events chaining
  `fromBand i → toBand i+1` — which is what makes `committedBand` an honest
  numerator. v1 = 2 events, G2 = 1 event, asserted by name;
- momentum: the telemetry block's shape and that the frozen fields beside it
  are untouched; that the packet's inversion reports drive 0.70 for a speed a
  struggling player could be riding on a boost, and saturates at 1.00 at the
  hard ceiling (this is the *reason* for the field, stated as arithmetic);
  that the published `tier` equals the filled glyph count on the HUD meter at
  five drives; and a child process that boots the real `src/sim` with
  `?momentum=1`, holds RIG at the right clamp for 12 s, then on the damage
  plane for 6 s, and reads the exact getters `telemetry()` calls — fresh run
  publishes 0/0, clamped run publishes drive > 0.3 with a valid tier,
  `peakDrive` holds while the live drive collapses, and the published drive
  equals the `pursuitSpeed` inversion **today** (so T-022's packet numbers stay
  comparable across T-023).

Two existing assertions had to change, both because they encoded the shape this
task was asked to change. Neither was weakened to pass:

1. `T-012: main.js integration is the single side-effect import line`
   (`(mainCode.match(/audio/g)||[]).length === 1`). That *shape* is precisely
   what made `audioSnapshot()` unreachable, so it cannot survive I-005's fix.
   Replaced with a stricter statement of the guarantee that actually mattered
   (main.js never drives the synth): every `audio`-bearing line in stripped
   `main.js` must be exactly the load-order import and the `audio:
   audioSnapshot,` publication — two lines, verbatim, and nothing else.
2. `READOUT: drive round-trips through speed … with no new telemetry to keep in
   sync`. The assertion (the round-trip identity) is unchanged and still
   passes; only the message was false after this task. It now says the
   inversion is exact *while escalation is the only source feeding the field*,
   and points at the published drive.

## Open items (not done, deliberately — both outside the fence I was given)

1. **I-009 has a third instance.** `src/pure/shell.js:413` builds the shell's
   run-stats row as `push('TURNS', (s.bands || 0) + ' / 2')`, fed from
   `src/ui/shell.js:198`. The committed screenshot shows the cost plainly: in
   one frame the HUD says `1/1 TURNS`, the overlay says `1 of 1
   transformation`, and the stats panel between them says `TURNS 1 / 2`. Before
   this task all three were consistently wrong; now two are right and one
   contradicts them, which is arguably worse to *read*. Closing it touches
   `src/pure/shell.js`, `src/ui/shell.js` and `tools/pathcheck.mjs:6966` (which
   asserts the row equals `'2 / 2'` from `bands: 2`). T-013 is `done` in
   SPRINT, so no live lane appears to own those files. Escalated to the
   integrator; not touched.
2. **The harness drops the new field.** `tools/playtest/lib/sampler.mjs`'s
   `fromTelemetryLike()` whitelists trace fields, so `momentum` does not reach
   `report.json` → `trace[]` (confirmed: `'momentum' in trace[n] === false` on
   the fresh `momentum-strong` run). The game half of I-030 is done and any
   consumer reading `__HULLBREAKER_TEST__.snapshot()` gets the field, but a
   *harness report* reader still has to invert `pursuitSpeed`. The fix is one
   line in that function (`momentum: s.momentum || null,`), in `tools/` and so
   fenced off from this lane. Escalated; not touched.

## Open feel questions for the operator

I judge none of this; these are the calls a machine gate cannot make.

1. On `?g2=1`, does `0/1 TURNS` read as informative, or as an odd way to say
   "one gate ahead"? A single-event fixture may want different copy entirely
   (e.g. `NECK GATE` / `GATE CLEARED`) rather than a fraction.
2. `1 of 1 transformation` on BREACH CLEAR — correct, but does a one-turn
   fixture want a count at all, or the turn's own name?
3. `HB.audio()` is a debug surface, not a player feature: is a console handle
   enough, or do you want an on-screen ambience-layer readout while judging
   whether a new layer per break is audible?
4. The `momentum` telemetry block is invisible in play by construction — worth
   confirming you do **not** want `peakDrive`/`tier` surfaced on the end-of-run
   screen, where "how hard did you make this run" would actually be read.

## Worktree / branch

- Worktree: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-029`
- Branch: `task/T-029` (not merged; `main` untouched)
- Files changed: `src/main.js`, `src/ui/hud.js`, `src/ui/overlay.js`,
  `tools/pathcheck.mjs`, plus `reports/tasks/T-029/` (this report + evidence).
  `tools/playtest/node_modules/` was installed once (gitignored).

## Single best next action

Decide item 1 above: either extend this lane to `src/pure/shell.js` +
`src/ui/shell.js` + the one `'2 / 2'` pathcheck assertion so a `?g2=1` frame
stops contradicting itself, or file it as its own task before the G2 capture is
put in front of the operator.
