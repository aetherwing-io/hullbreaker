# shade-v1 — the baked VALUE ladder (T-035, packet items S1 + S2)

Eleven frames from real headless Chrome (playwright-core, 1280x800,
`deviceScaleFactor: 1`) against a pinned `task/T-035` worktree served by
`node tools/serve.mjs 8749 --root <worktree> --quiet`. The server was killed
afterwards. Nothing here is a verdict about how the game looks — the operator
is the only oracle for that. These are the before/after pairs the checkpoint
packet in `SPRINT.md` asks about, plus the numbers behind them.

| file | URL | what it is |
|---|---|---|
| `01-default-3s--shipped.png` | `index.html?testapi=1` | the shipped build, 3 s in |
| `02-default-3s--shade1.png` | `…&shade=1` | the ladder at full strength |
| `03-default-10s--shipped.png` | `index.html?testapi=1` | shipped, 10 s |
| `04-default-10s--shade1.png` | `…&shade=1` | ladder, 10 s |
| `05-default-10s--shade05.png` | `…&shade=0.5` | the ladder at HALF strength — the dial |
| `06-default-20s--shipped.png` | `index.html?testapi=1` | shipped, 20 s (near the wave gate) |
| `07-default-20s--shade1.png` | `…&shade=1` | ladder, 20 s |
| `08-traversal-4s--shipped.png` | `?slice=traversal` | the slice, shipped |
| `09-traversal-4s--shade1.png` | `?slice=traversal&shade=1` | the slice: DECK ladder only (see scope) |
| `10-classic-3s--shipped.png` | `?palette=classic` | the grey-box instrument |
| `11-classic-3s--shade1.png` | `?palette=classic&shade=1` | …with the flag on: identical by construction |

## Scope limit, stated plainly

`src/render/limb.js` gates on `IS_G1`, so **the limb half of the ladder changes
nothing under `?slice=traversal` or `?slice=transform`.** Frames 08/09 differ
only by the deck-stack ramp and the per-column wear. The transform slice does
not bake the deck tiles at all, so `?slice=transform&shade=1` is a no-op.

## The pre-registered measurement

Declared before any capture was taken, because "the frame got darker" is
satisfiable by failure:

- **P1 (the gate)** — paired population: `|median(rust px) − median(teal px)|`
  must WIDEN. rust = `r>g>b` (everything RIG runs on plus body mass), teal =
  `g>r AND b>r` (sky, haze, wall, skyline), i.e. `src/render/palette.js`'s own
  role split. Signed value reported too, so a sign flip cannot hide inside an
  absolute value. "Share below L40 rises" is deliberately **not** a criterion:
  a uniform darkening satisfies it.
- **P2 (anti-"dirty, not lit")** — frame p95 luminance may not fall more than 5%.
- **P3 (reported, never a gate)** — share under L25.5, the boards' darkest tenth.

Playfield crop = rows 12%–88% of the frame (excludes the HUD strip and the dev
legend). Luminance is Rec.709 over sRGB bytes.

| t | metric | shipped | `?shade=1` | `?shade=0.5` |
|---|---|---|---|---|
| 3 s | P1 signed sep | −15.0 | **−59.8** | −35.7 |
| 10 s | P1 signed sep | −15.0 | **−61.0** | −35.7 |
| 20 s | P1 signed sep | −15.0 | **−61.0** | −35.7 |
| 10 s | p95 | 90 | 78 | 78 |
| 10 s | p99 / p99.9 | 106 / 138 | **108 / 146** | 100 / 140 |
| 10 s | share > L140 | 0.10% | **0.16%** | 0.10% |
| 10 s | share < L25.5 | 0.5% | 50.2% | 4.9% |
| 10 s | rust median / teal median | 63 / 78 | 17 / 78 | 43 / 78 |
| slice 4 s | P1 signed sep | +33.5 | +14.1 | — |

**P1 passed: separation widened 4x, and it widened in the direction board 13
has it** (the haze band brighter than the near play surfaces: board 13 panel 1
measures far body L=78 against near deck L=36). The teal median did not move
(78 → 78), so the widening is not the frame going dark together.

**P2 failed as written, and the failure is diagnosable rather than mysterious.**
p95 fell 90 → 78 because the deck's four-tile stack — which today is one flat
value — is now a ramp, so a large *mid-bright* population moved down. It is not
uniform darkening: the backdrop median is unchanged, the highlight statistics
ROSE (p99 106 → 108, p99.9 138 → 146, share over L140 0.10% → 0.16%), and the
deck's own lip is authored brighter than it ships today. p95 is a mid-tone
statistic on this frame, not a highlight statistic — that is the honest reading,
and it is recorded here rather than quietly re-specified.

**The traversal slice's separation SHRANK (33.5 → 14.1), and that is a real
cost.** In the slice the deck slabs are the bright thing against a flat teal
void with no backdrop; ramping their faces moves them toward it. An earlier
draft with a monotone ramp to 0.22 landed at 5.3 — the slabs almost merged with
the void — which is why the shipped ramp is one hard contact step plus a
shallow tail with a LIFTED lip. It is still a reduction and the operator should
look at frame 09 with that in mind.

## Honesty notes

- Pairs are matched by identical input schedules against the seeded sim, not by
  frame-locked replay: hostile positions can differ by a frame or two between
  the two runs of a pair. Composition and value are comparable; individual
  sprite positions are approximately comparable.
- The capture bot holds right and jumps on a cadence, so it dies at the first
  wave gate around 21–24 s. Nothing past the first gate, no later face and no
  high-altitude phase is in these frames — the same limit the look packet
  discloses for `artifacts/look-v1/`.
- Frames 10/11 are the identity check as pixels, but the real proof is exact:
  the instance-color hash read out of the live scene is byte-equal
  (`98b8c4a0` both), and `CLASSIC.shade.gain === 0` makes every multiplier
  exactly 1.0 by arithmetic, asserted in `tools/pathcheck.mjs`.
- Draw calls, InstancedMesh count and instance count are unchanged with the
  flag on or off: 94 calls / 13 instanced meshes / 2969 instances on the
  default run, read live from `renderer.info` and a scene traversal. (The look
  packet quotes 101 calls for the same scene; that count was taken on a
  different frame of the same build — what matters here is that the ladder
  moves it by zero.)
