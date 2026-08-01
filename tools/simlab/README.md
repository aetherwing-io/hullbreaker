# simlab — headless frame-alignment laboratory

Dev-only tooling that drives the **real, unmodified simulation** (`src/sim/*`
+ `src/pure/*`) in Node child processes with a fixed timestep and
**synchronous, frame-scoped input**: a scripted key event is applied directly
to `src/sim/input.js` at an exact frame boundary, before that frame's
`update`. That is precisely the injection semantics `tools/playtest/README.md`
hook request #5 asks for — buildable harness-side with no game change because
the sim layer is renderer-free by contract (`src/sim/bridge.js`,
`__HB_QUERY__` headless mode selection).

Built for SPRINT **T-002**: closing the `t2-transform-seam-rush` divergence
question. Findings and repro commands:
`docs/playtests/2026-07-t2-frame-alignment.md`.

This tool has **zero effect on the shipped game**. No dependencies; run with
plain `node`.

## Usage

```sh
node tools/simlab/t2lab.mjs run                 # one replica run, JSON summary
node tools/simlab/t2lab.mjs repeat --n 4        # bit-determinism proof (full-trace digests)
node tools/simlab/t2lab.mjs sweep               # shift each tap ±1 frame, report outcome forks
node tools/simlab/t2lab.mjs phases              # model the real driver's quantized dispatch,
                                                #   sweep the sampler phase
node tools/simlab/t2lab.mjs diverge --shift-tap 6:1   # per-frame first-divergence vs baseline
```

Options (all modes): `--dt <ms>` (default 16.667 — matches the browser
`?fixeddt=16.667` runs), `--end <gameMs>` (default 21000), `--edges L,R`
(default: the 1280×800 far-view calibration measured from the live page via
`window.HB.edges()`), `--script <path>` (default: the t2 adversarial script),
`--reassert-frames N` (default 4 — models the driver's held-key reassert lag
after a retry, bounded by one sample interval).

`sweep` accepts `--shift -1,1` (frame offsets to try per tap). `phases`
accepts `--sample-gamems` (default 151 ≈ 75 ms real × the measured
gameMs/wall ratio of the fixeddt browser runs) and `--step`.

## What the replica reproduces, and how faithfully

- The **frame loop is transcribed from `src/main.js`** (`update()` order,
  `resetGame()` for the transform slice) rather than imported — `main.js` is
  the composition root and pulls in three.js. Render/UI calls are dropped,
  which is legal by the bridge contract (uninstalled hooks are no-ops). If
  `main.js`'s update order changes, `t2lab.mjs` must be updated by hand; the
  transcription is commented inline for diffing.
- `scheduleSliceRetry`'s 650 ms wall-clock `setTimeout` (the sim's single
  wall-clock escape hatch) is captured by a virtual-timer shim and fired as
  soon as the loop sees `SLICE_RETRY`. `gameMs` is frozen for the whole
  freeze in the browser too, so this is sim-time-faithful.
- The driver's post-retry **held-key reassert** is modeled with a fixed
  `--reassert-frames` lag. In the real harness that lag is *variable*
  (bounded by one sample interval + a CDP round trip) — a real, additional
  jitter source this replica deliberately holds constant.
- Screen edges are a **constant calibration** (`--edges`), not a live camera
  probe; use the values measured from the browser at the viewport you are
  comparing against.

## Honesty / limitations

1. **The replica is not the browser.** It proves properties of the
   *simulation* under controlled input; it cannot prove where the browser's
   own event queue lands a CDP keystroke. Its `sync` dispatch mode is the
   idealized frame-scoped hook; its `quantized` mode *models* the real
   driver's deterministic-mode dispatch (poll-gated on `gameMs` at a sampler
   cadence) but not CDP/rAF races.
2. **A transcription can drift.** The `update()`/`resetGame()` copies must
   track `src/main.js`. The in-family cross-check (replica outcomes land in
   the same fork clusters, gaps, and halt-bound ritual signature as the
   browser batch) is the guard used in T-002; re-verify it before trusting
   new conclusions from an aged copy.
3. **One viewport.** Edge calibration is baked per run; conclusions about
   spawn timing and follow-lead only transfer to the calibrated viewport
   (1280×800 far view by default).
4. **`repeat` proves determinism only for the exercised path** (this script,
   this dt, this fixture). It is not a general no-nondeterminism proof for
   every slice — pathcheck's new T-002 assertions carry the durable,
   CI-shaped version of the claim.
