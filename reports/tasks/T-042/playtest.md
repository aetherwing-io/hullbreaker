PASS

T-042 (audio punch — impact weight, per-weapon voices, lance-strike destruction sound,
pursuing-edge pressure curve, readability under load).

Commit tested: `4f0f91d` on `task/T-042` (worktree
`/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-042`), `git status --short`
clean, no changes made by me. Read `docs/LANE-BRIEF.md`, `reports/tasks/T-042/build.md`,
`reports/tasks/T-042/review.md` (APPROVE), and `docs/decisions.md` entries 15/16/19 before
testing.

**Server pin.** `node tools/serve.mjs 8797 --root
/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-042 --quiet`, driven from the
MAIN checkout's `tools/playtest`. Port 8797 (not 8741/8742, not the 8793/8794 already in use
by concurrent lanes); killed at the end of the session. Every run below used `--base-url
http://127.0.0.1:8797` (or a direct `--url` override to append a query param) against that
one pinned process — never a moving tree.

## 1. Determinism — PASS, independently re-measured with an interleaved design

Re-ran the build's own `mid-route.json --deterministic` comparison, but INTERLEAVED
(on/off/on/off/on/off, not batched 3-then-3) so an order/JIT-warmup effect can't hide behind
a real audio effect:

```
cd tools/playtest
node run.mjs scripts/mid-route.json --deterministic --base-url http://127.0.0.1:8797 \
  --url "http://127.0.0.1:8797/index.html?slice=traversal[&audio=0]" --out <dir>
```

| run | audio | minEdgeMargin | finalX | finalGameMs | protoScore |
|---|---|---|---|---|---|
| 1 | on  | 35.40 | 72.022 | 6325.9 | 86.7 |
| 2 | off | 35.39 | 72.065 | 6342.4 | 86.9 |
| 3 | on  | 35.41 | 72.088 | 6332.1 | 86.6 |
| 4 | off | 35.39 | 72.034 | 6326.7 | 86.0 |
| 5 | on  | 35.39 | 72.036 | 6322.1 | 87.6 |
| 6 | off | 35.41 | 72.075 | 6336.2 | 86.9 |

All six `completed`, 0 deaths. Every metric's on-group and off-group ranges overlap
completely; the spread within a condition (≈0.02 tiles / ≈10ms / ≈0.07 tiles / ≈1.6 points) is
the same order as the spread between conditions. No systematic on-vs-off separation on any
metric. Consistent with the build's own (batched) 3×/3× result and with the static
layer-purity guard (`tools/pathcheck/t-012-audio-layer-static-guards.mjs`) asserting `src/sim/*`
never references the audio module, and my own read of `src/ui/audio.js`: every `player.*`/
`sLeftEdge()` reference is a read into the module's own local `prev`/tracking state, never a
write back into a sim row. **The sim does not branch on audio.**

## 2. Frame cost under load, vsync OFF — PASS, independently re-measured

`tools/playtest/juice-stress.mjs`'s own method (12× `fireWeapon('S', clone=true)`/frame +
one `fxBurst`/`fxFlash`, right-held on the default six-face run, saturating the 256-slot
bullet pool) adapted into a throwaway probe (not committed) that points at the PINNED
server instead of spinning up its own, with a second interleaved pass to rule out ordering:

| condition | vsync | avgMs | worstMs | over20ms | voices |
|---|---|---|---|---|---|
| audio ON  | default (120Hz panel cap) | 8.31 | 10.40 | 0 | 6 |
| audio OFF | default                   | 8.31 | 10.30 | 0 | 0 |
| audio ON  | `--disable-gpu-vsync --disable-frame-rate-limit` | 1.51 | 4.10 | 0 | 8 |
| audio OFF | same flags | 1.50 | 5.10 | 0 | 0 |
| audio OFF (2nd pass, order swapped) | same flags | 1.50 | 5.10 | 0 | 0 |
| audio ON (2nd pass) | same flags | 1.47 | 4.00 | 0 | 8 |

Zero dropped frames (`over20ms: 0`) in every cell, on or off, vsync-capped or not. With
vsync removed, audio-ON's `worstMs` is if anything *slightly lower* than audio-OFF's in both
orderings — the honest read is "no measurable per-frame cost at 256-projectile saturation,"
not "audio is faster." Matches the review's own real-Chrome re-measurement
(avgMs 1.50/1.48, worstMs 5.1/5.0) to within noise. Confirms independently: **audio does not
threaten the 60fps/200+-projectile budget.**

## 3. Boot-time work landing mid-run — REAL, MEASURED FINDING (not gating this PASS, filed as an issue)

`src/ui/audio.js`'s `unlock()` (fired on the run's first `keydown`/`pointerdown`) calls
`buildContext()` only if `!ctx`, which — because the default six-face run is
`SHELL_AUTOSTART` (state is already `PLAYING`, `gameMs` already advancing, before any key is
pressed) — means the WHOLE node graph (`AudioContext`, a `DynamicsCompressor`, master/sfx/
ambience buses, the pressure bus + oscillator, a 1-second/44100-sample noise buffer filled by
a JS loop, and all 7 `LAYER_RECIPES` — each 1-3 more oscillators/filters/buffer-sources) is
built synchronously, in the same event-dispatch turn as the player's first movement key,
genuinely mid-run rather than at boot. The build report correctly notes there is no `async`/
`fetch`/`setTimeout` (so no T-040-class *race*), but that argument doesn't cover a *synchronous*
main-thread block landing at the worst possible instant — this needed the actual measurement
the dispatch asked for, not just the absence-of-async argument.

**Method**: a throwaway Playwright probe (not committed) samples `window.HB.perf()` (the
game's own last-180-real-frame ring) immediately before the run's first-ever keydown, then
~500ms after (well inside the ring, nothing evicted), on the SAME page/trial —
`spikeMs = post.worstMs − pre.worstMs`, which is ≥0 by construction and isolates the marginal
cost of whatever ran during that keydown. 16 trials audio-ON, 16 audio-OFF, in two interleaved
passes with the order reversed on the second pass (ON/OFF/ON/OFF/… then OFF/ON/OFF/ON/…):

```
ON  spikeMs (n=16): min 0.2, max 25.5, mean 11.37
    sorted: 0.2, 0.7, 3.3, 7.3, 7.5, 7.9, 8.7, 9.1, 10.3, 10.6, 13.8, 16.8, 18.0, 18.5, 23.7, 25.5
OFF spikeMs (n=16): exactly 0.00, every single trial
```

The control is not bimodal — it is a hard, exact zero in all 16 trials, so the ON-side spike
isn't a generic warmup/JIT artifact that happens to coincide with input; it only appears when
`postAudio.unlocked` flips `false→true` in the same window (confirmed on every ON trial,
never on an OFF trial). 2 of 16 ON trials (12.5%) exceed this codebase's own 20ms
"dropped frame" bar (`over20ms`'s threshold in `src/main.js`); every ON trial is nonzero.

**Why this doesn't fail the gate**: it's a one-time cost (module-level `ctx` persists across
retries within a page load — this never repeats on a retry, only on the very first input of a
session), it does not corrupt sim state, does not affect determinism at the level of observable
outcomes (section 1), and it lands at arguably the least consequential moment (t≈0, no scroll,
no combat, no precision platforming yet) rather than mid-fight or mid-jump. It is real,
reproducible, and worth fixing (the natural direction: build the node graph eagerly at module
load or via an idle callback, and gate only `ctx.resume()` on the gesture, moving this cost off
the exact first-input turn) — filed below rather than silently accepted.

## 4. Unlock path / autoplay — PASS

Real Chrome (no `?testapi=1`, no query flags — the default URL a player would actually load),
gesture required as advertised:

```
BEFORE any gesture (1s after load): {"enabled":true,"unlocked":false,"contextState":"none", ...}
AFTER first gesture (keydown):      {"enabled":true,"unlocked":true,"contextState":"running", ...}
```

No `AudioContext` exists before the first real input; the exact behavior the module's own
header comment claims. 0 page errors.

## 5. Voice count / cleanup over a long run — PASS

Two probes (not committed), both real gesture-driven Playwright sessions (not the JSON
harness, which doesn't surface `window.HB.audio()`), sampling `window.HB.audio()` every
300-400ms:

- **`?slice=traversal&enemies=0`, hold-right-only** (same policy as
  `scripts/retry-recovery.json`, which dies on the pursuing crush edge deterministically):
  100s, 6 attempts (5 deaths/retries). `voices` stayed in `[0, 7]` the whole run, **never**
  spent a single consecutive sample pinned at the 14-voice cap (`longestConsecutiveSamplesAtVoiceCap:
  0/249`), and — cleanly, every single retry — `voices` and `pressure` both reset to exactly 0
  the sample immediately after `attempts` increments (verified in the raw per-sample series,
  e.g. attempts 1→2 at t≈18468ms: `voices 1→0, pressure 0.779→0.000` in the same tick). No
  leak, no stuck voice, no runaway growth across 5 restarts.
- **`?slice=traversal&hound=2.5`, hold-right + hold-fire, 30s continuous combat**: `voices`
  bounded `[0,9]`, `heat` visibly rose to 0.359 and `combatDuck` visibly dipped to 0.821 during
  a dense exchange (answering the build's own proposed feel-adjacent issue about whether the
  combat duck is visible in a real fight — here it clearly is, in a denser encounter than the
  build's own 13s single-hound probe), then both cleanly recovered to 1.0/baseline after a
  death/respawn (kills reset 0→0 across the life boundary, confirming a full reset). 0 errors.

## 6. `?audio=0` escape hatch / on-by-default — PASS

Confirmed in every probe above: `?audio=0` → `{enabled:false, unlocked:false,
contextState:'none', layers:0, voices:0}` throughout, at both idle and the 256-projectile
stress load, with no wrappers doing anything (matches the module's own "muted boot is
byte-identical to the pre-audio game" claim as far as observable audio-module state goes).
Default URL (no query) → audio on, matches `decisions.md` entry 16 ("ships ON by default").

## 7. Regression — PASS

- **Smoke set**: `scripts/mid-route.json` and `scripts/transform-slice.json`, both
  `--deterministic` against the pin: both `completed`, `bootError: null`, `consoleErrors: []`,
  `pageErrors: []`. Plus `scripts/hound-facetank-25.json` (the task-relevant script from the
  build report): `stalled` (expected — endurance script, not a completion one), same clean
  error/bootError read, matches the build's own numbers exactly.
- **`?selftest=1`**: real Chrome load → `SELFTEST PASS (35 checks)`, one harmless
  `favicon.ico` 404 console message (pre-existing, unrelated to this diff — the harness itself
  already special-cases this exact string).
- **pathcheck, base computed myself, not trusted from the report**: `git merge-base main HEAD`
  = `b9a2e23` ("SPRINT: T-038 done"). Pathcheck in a scratch worktree at that commit: **2251
  passed, 0 failed**. Pathcheck in the T-042 worktree as-is: **2295 passed, 0 failed** — exactly
  2251+44, matching the build's claimed new-assertion count, computed independently rather than
  inherited. Current `main` (moving target — was `1ef5da2`/2404 when I checked, then advanced
  again to `a69677f` with T-050 landing mid-session): 2404 at the point I checked, confirming the
  review's own note that this branch is ~109 assertions behind and will need one more
  `git merge main` at merge time. I also diffed `b9a2e23..main` on the three files this lane
  touches in `tools/pathcheck/`: `manifest.mjs`'s only change since is two new, purely-appended
  imports (T-047/T-048); `t-012-audio-layer-static-guards.mjs` and `src/ui/audio.js` are
  byte-identical to the merge-base on main — so the next merge is a clean append, not a real
  conflict, independently confirmed rather than taken on the review's word.

## Verdict

**PASS.** Determinism holds under an interleaved re-measurement design, the 60fps/
256-projectile budget holds under vsync-off re-measurement, the escape hatch and
on-by-default behavior are both correct, voices are capped and clean up correctly across
restarts, and regression (smoke + selftest + independently-computed pathcheck) is green. One
real, quantified boot-time-adjacent defect was found under items the dispatch specifically
asked to be checked for — filed below rather than gating on it, since it's bounded,
one-time, non-corrupting, and lands at the least consequential moment in the run. Feel
questions (does the impact weight/pairing/lance-strike/pressure-curve/duck actually read
right) are the operator's, not mine; the build's own five questions at
`http://127.0.0.1:8741/index.html` (and the `?slice=traversal&enemies=0`/`?hound=2.5`
variants) stand unchanged by this gate.

## PROPOSED INBOX ISSUES

```
## I-??? | bug | S2 | repro: throwaway Playwright probe (not committed) — load
  http://127.0.0.1:<pinned-port>/index.html?testapi=1, wait for HB.perf().frames>=3,
  record HB.perf(), page.keyboard.down('ArrowRight'), wait 500ms, record HB.perf() again;
  diff worstMs. Commit: task/T-042 @ 4f0f91d. | evidence: this report's §3
one paragraph: src/ui/audio.js's unlock() builds the ENTIRE WebAudio node graph
(buildContext(): AudioContext, compressor, 3 buses, the pressure oscillator, a 44100-sample
noise-buffer fill loop, and all 7 LAYER_RECIPES' oscillators/filters/buffer-sources)
synchronously inside the SAME keydown dispatch as the player's first movement input — and
because the default six-face run auto-starts (gameMs already advancing before any key), this
construction genuinely lands mid-run, not at boot. Measured via HB.perf()'s own frame-time
ring: 16 audio-ON trials all showed a nonzero worst-frame spike right at first input (0.2-25.5ms,
mean 11.4ms; 2/16 exceeded the engine's own 20ms dropped-frame bar), while 16 audio-OFF control
trials showed EXACTLY zero every time (not bimodal — a clean, attributable signal). Not a
determinism break (§1) and not a sustained-load problem (§2) — bounded to a one-time hitch at
the single least-consequential moment in a run (t≈0, before any scroll/combat/platforming) — so
not gating this PASS, but real and worth fixing: build the node graph eagerly (module load or an
idle callback) and gate only ctx.resume() on the user gesture, so the construction cost moves off
the exact frame the player's first input lands on.
```

```
## I-??? | docs | S3 | repro: n/a (report-accuracy note) | evidence:
  reports/tasks/T-042/build.md "Async-boot-timing check" section vs this report's §3
one paragraph: build.md's async-boot-timing section argues "no async/await/fetch/setTimeout,
so structurally this cannot be the T-040 class of defect" and stops there without measuring
the synchronous construction cost at the point it actually runs. That argument is correct as
far as it goes (there is no async RACE), but it doesn't rule out a synchronous main-thread
block landing at a bad moment, which measurement (this report's §3) shows is real. Worth a
one-line correction in build.md pointing at the follow-up measurement so a future reader
doesn't read "no async" as "no timing cost."
```
