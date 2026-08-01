# T-002 — the t2-transform-seam-rush divergence: found, demonstrated, located

**Question** (from `tools/playtest/README.md`, "Deterministic injection mode" +
"Single best next action"): with deterministic injection *and* a confirmed
fixed timestep, `t2-transform-seam-rush` still forks into outcome clusters
whose first-death times diverge by seconds. The suspected mechanism was
one-frame input-arrival alignment at a knife-edge sim decision, with the
**ritual-arming check in `src/sim/transform.js` as the named suspect**. This
investigation instrumented that check and answers three things: does a
one-frame input shift really flip the fork (yes), is the ritual-arming check
the sensitive decision point (no — refuted), and is the sim itself
deterministic once input lands on defined frames (yes, bit-exact).

**TL;DR — recommendation: build playtest-README hook request #5** (the
synchronous, frame-scoped input hook). It is *sufficient* (the sim is proven
bit-deterministic under frame-scoped input) and *necessary* (there is no
sim-side defect to fix instead — the entire residual nondeterminism is input
*delivery*, and no cheap sim-side change can control which real frame a CDP
key event lands before). No gameplay change is recommended or made.

## What was added (all dev-only, no gameplay change)

- `src/sim/transform.js` — a per-event **decision trace** on the ritual state
  machine: first frame the scroll halt held (`dHaltAt`), first frame RIG's
  leading edge crossed `triggerS` (`dTriggerAt`), the arm/start/finish
  frames, the start-frame trigger margin, and a derived `binding` field
  naming which precondition arrived last. Scalar writes on transition frames
  only; read back via `transformDecisionTrace()`.
- `src/main.js` — the trace rides the existing `transform` telemetry block
  as an additive `decisions` field (testapi/HB only; the playtest sampler
  already passes `transform` through verbatim, so every bot run now records
  it with zero harness changes).
- `tools/simlab/t2lab.mjs` — a headless replica of the t2 run driving the
  real, unmodified sim with **synchronous frame-scoped input** (hook request
  #5's semantics, built harness-side against the renderer-free sim layer),
  with four experiment modes (`repeat`/`sweep`/`phases`/`diverge`). See
  `tools/simlab/README.md`.
- `tools/pathcheck.mjs` — 10 new assertions (610 → 620): the trace contract,
  the halt-bound rush signature, trace reset, and twin-run bit-determinism
  under frame-indexed input.

## Result 1 — the fork reproduces on this commit (browser, pinned worktree)

10 runs against the T-002 worktree (`--deterministic`; 6 with
`&fixeddt=16.667`, 4 without), 1280×800, far view:

| run | first death (gameMs) | deaths | maxX | ritual0 startAt | binding / margin |
| --- | --- | --- | --- | --- | --- |
| fdt-1 | — | 0 | 104.57 | 5083.4 | halt / 4.50 |
| fdt-2 | 2800 (fall, 48-50 gap) | 1 | 80.66 | 7566.8 | halt / 4.50 |
| fdt-3 | — | 0 | 100.18 | 5083.4 | halt / 4.50 |
| fdt-4 | — | 0 | 104.72 | 5066.8 | halt / 4.50 |
| fdt-5 | — | 0 | 104.41 | 5083.4 | halt / 4.50 |
| fdt-6 | 8584, 9867 | 2 | 84.09 | never armed | — |
| nofdt-1 | 2889, 11216 | 2 | 88.65 | 16245.9 | halt / 4.50 |
| nofdt-2 | — | 0 | **146.11 (VICTORY)** | 4715.2 | halt / 4.50 (both rituals) |
| nofdt-3 | 2890, 6124 | 2 | 115.54 | 11169.0 | halt / 4.50 (both) |
| nofdt-4 | 14200 | 1 | 122.47 | 19399.1 | halt / 4.50 |

The historical signature is intact: an early-death cluster at gameMs
≈2800–2890 (previously quantified 2805–3351) versus runs that die much later
or never, and maxX clusters (~84 vs ~104+/132+/victory). Caveat when
comparing across the two mode columns: this machine ran headless rAF at
~30 fps during the fdt batch, so those runs covered only ~10.5 s of gameMs in
the same wall window (ratio ≈0.5, vs 2.015 in the July quantification) —
sim-time coverage per run differs by mode; the fork itself shows in both.

## Result 2 — the ritual-arming check is NOT the knife-edge (refuted)

Every ritual that started, in every browser run and every replica run, has
the same instrumented signature:

- `binding: 'halt'` — RIG crosses `triggerS` and then **parks against the
  frontier clamp ~950 ms of gameMs before the scroll halt arrives**; the
  ritual's start frame is set by the autonomous scroll, not by input timing.
- `startTriggerMargin: 4.500` exactly — the frontier-to-trigger distance
  (`thresholdTiles − clampMargin − triggerOffset` = 6 − 0.5 − 1.0). RIG's
  position at the start frame is fully *contracted* by the clamp: runs that
  entered the seam with different micro-histories start the ritual from the
  same x. The arming check inherits timeline shifts from upstream deaths
  (startAt scatters from 4715 to 19399 across runs) but never originates a
  fork, and its position input is normalized when it fires.

The actual fork point, read from the frame-level traces (fdt-2 vs fdt-1):
an earlier **wasp contact-or-miss knife-edge** around x≈41–48 puts one run
at hp 3 on a low, fast trajectory that clips into the 48–50 gap lip (x pins
at 49.65, falls to killY, fall death at gameMs 2783) while the other run —
*because* it took a wasp hit (hp 2, knockback delay) — crosses the same gap
high and lives. The divergence then amplifies through the death→retry
timeline shift (input schedule is absolute gameMs; a retry replays it against
a reset world). The 82–84 interior service pit is the same knife-edge for the
~84-maxX cluster.

## Result 3 — one-frame input alignment DOES flip the fork (demonstrated)

Headless replica, real sim, frame-scoped input (`tools/simlab/t2lab.mjs`):

- **Determinism**: `repeat --n 4` — 4/4 runs bit-identical over the full
  1260-frame trace (every float of every row). With input landing on defined
  frames there is *zero* residual nondeterminism in the sim.
- **Single-tap sensitivity**: `sweep` — shifting ONE of the script's 88 jump
  taps by ONE frame (±16.667 ms), 178 variants: **26 variants (15%) fork
  into 16 distinct outcomes**, ranging from 0-death VICTORY (maxX 146.09) to
  five-deaths-stuck-at-x≈84 with the ritual never arming. First forked tap:
  tap1 (the 520 ms jump).
- **Microscope**: `diverge --shift-tap 1:-1` — the shifted tap buffers the
  jump one frame earlier, liftoff moves one frame (~0.2-tile arc phase
  offset), x stays identical for seconds while the y-phase difference
  persists, then a terrain/hazard knife-edge converts phase into fate:
  firstDeath 8766.8 → 8333.5, ritual0 13883.6 → 12933.6.
- **The browser mechanism, reproduced**: `phases` — modeling the real
  driver's deterministic mode (dispatch quantized to the sampler cadence,
  ~151 gameMs here) and sweeping only the sampler *phase*: **16/16 phases
  produce 16 distinct outcomes**, spanning first deaths 2850/3316 (the
  historical 2805–3351 cluster), the maxX ≈84.09/84.24 and ≈132.46 clusters
  (historical 84.13/84.89 and 132.45/132.61), and clean victories. Sampler
  phase — which varies run to run with boot timing — is *sufficient* to
  generate the entire observed spread. Cross-check: quantized phase 50
  reproduces the browser surviving cluster's ritual0 start (5083.435 vs
  5083.4) with the same 950.02 ms halt-after-trigger gap.

## Answer and recommendation

1. **Frame-alignment sensitivity: demonstrated** — but the sensitive points
   are ordinary traversal/hazard knife-edges (gap lips at 48–50 and 82–84,
   wasp contact windows) amplified by death→retry timeline shifts. The
   **ritual-arming check specifically is refuted** as the decision point: it
   is halt-bound with clamp-contracted position in every observed run. This
   is chaotic sensitivity inherent to blind mashed input against physics —
   evidence of nothing wrong with the sim.
2. **Recommendation: build hook request #5** (a game-side "apply this key
   state at the start of the next `update()`" surface). The replica proves
   it would make browser bot runs bit-deterministic (sufficient), and rules
   out any sim-side fix (nothing sim-side is broken; no tuning change can
   remove delivery jitter). Until it lands, `tools/simlab/t2lab.mjs` already
   provides deterministic repro *today* for sim-level questions, headlessly.
   A cheaper sim-side fix does not exist for this; "accept" would leave
   browser-batch spread unexplained noise in every future quantification.
3. **No gameplay behavior changed in this task** — instrumentation is trace
   fields + an additive telemetry block; `?slice=transform` play is
   byte-identical (pathcheck's layer guards and the full suite stay green:
   620 passed).

## Repro

```sh
# gate (includes the 10 new T-002 assertions):
node tools/pathcheck.mjs

# headless demonstration (no browser needed):
node tools/simlab/t2lab.mjs repeat --n 4      # bit-determinism, 4/4
node tools/simlab/t2lab.mjs sweep             # 26/178 one-frame forks
node tools/simlab/t2lab.mjs phases --step 10  # 16/16 phases distinct
node tools/simlab/t2lab.mjs diverge --shift-tap 1:-1

# browser fork on a pinned worktree (per tools/playtest/README.md):
git worktree add /tmp/hb-pin <sha>            # or serve any pinned checkout
(cd /tmp/hb-pin && python3 -m http.server 8749 &)
cd tools/playtest && npm install
for i in 1 2 3 4 5; do node run.mjs scripts/adversarial/t2-transform-seam-rush.json \
  --max-runtime-ms 26000 --deterministic \
  --url "http://127.0.0.1:8749/index.html?slice=transform&fixeddt=16.667" \
  --out /tmp/t2-fdt-$i; done
# each run's report.json now carries transform.decisions in every sample —
# check startAt/binding/startTriggerMargin in the final sample.
```

## Honesty / limitations

- The replica transcribes `src/main.js`'s `update()`/`resetGame()` (render
  lines dropped); it can drift if `main.js` changes — its in-family
  agreement with the browser batch (cluster values, ritual signature) is the
  current evidence it has not. See `tools/simlab/README.md`.
- Cluster constants (2800, 84.09, 132.46, 4.50…) are snapshots of this
  commit's tuning + this fixture + 1280×800 far view; the *structure* of the
  finding (halt-bound ritual, delivery-side nondeterminism, knife-edge
  amplification) is the durable part, and only that part is asserted in
  pathcheck.
- `binding` over-attributes 'player' if RIG crosses the trigger, retreats,
  and recrosses (first-crossing timestamp); irrelevant for rush scripts,
  noted in the source comment.
