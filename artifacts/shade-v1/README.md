# shade-v1 — the baked VALUE ladder (T-035, packet items S1 + S2)

**OPERATOR VERDICT, 2026-08-02: "C on the ladder feels better, shade=0.5 the
other is too dark."** Half strength is the game's look and it is now the
**default** — the plain URL carries it, `?shade=0` is the escape hatch back to
the old value range, and `?shade=1` is the full ladder he rejected, kept
reachable for a re-ask. Every frame and number below was re-captured at the
approved dose; the earlier set describing full strength was replaced rather
than left to mislead.

Frames from real headless Chrome (playwright-core, 1280x800,
`deviceScaleFactor: 1`) against a pinned `task/T-035` worktree served by
`node tools/serve.mjs 8749 --root <worktree> --quiet`; the server was killed
afterwards. Nothing here is a verdict about how the game looks.

| file | URL | what it is |
|---|---|---|
| `01-default-3s--shade0-old-look.png` | `?shade=0` | the pre-T-035 value range, 3 s |
| `02-default-3s--SHIPPED.png` | `index.html` | **what ships**, 3 s |
| `03-default-10s--shade0-old-look.png` | `?shade=0` | pre-T-035, 10 s |
| `04-default-10s--SHIPPED.png` | `index.html` | **what ships**, 10 s |
| `05-default-10s--shade1-rejected.png` | `?shade=1` | the full ladder, judged too dark |
| `06-default-20s--shade0-old-look.png` | `?shade=0` | pre-T-035, 20 s (near the wave gate) |
| `07-default-20s--SHIPPED.png` | `index.html` | **what ships**, 20 s |
| `08-traversal-4s--shade0-old-look.png` | `?slice=traversal&shade=0` | the slice, pre-T-035 |
| `09-traversal-4s--SHIPPED.png` | `?slice=traversal` | the slice, shipped (DECK ladder only) |
| `10-classic-3s--shipped.png` | `?palette=classic` | the grey-box instrument |
| `11-classic-3s--shade1.png` | `?palette=classic&shade=1` | …with the flag on: identical by construction |

## Scope limit, stated plainly

`src/render/limb.js` gates on `IS_G1`, so **the limb half of the ladder changes
nothing under `?slice=traversal` or `?slice=transform`.** Frames 08/09 differ
only by the deck-stack ramp and the per-column wear. The transform slice bakes
no deck tiles, so `?slice=transform` is unaffected entirely. The S2 haze shift
is `IS_G1`-only too.

## Byte fidelity, checked across trees

Instance colors read live out of the running scene and hashed, plus the fog
band and the background — `main` (pre-T-035) against this worktree:

| build | instance-color hash | fog band | bg |
|---|---|---|---|
| `main` default | `acdfb9bb` | 44.25 / 72.25 | `#2f565e` |
| T-035 `?shade=0` | `acdfb9bb` | 44.25 / 72.25 | `#2f565e` |
| `main` `?palette=classic` | `98b8c4a0` | 44.25 / 72.25 | `#46525f` |
| T-035 `?palette=classic` | `98b8c4a0` | 44.25 / 72.25 | `#46525f` |
| T-035 `?palette=classic&shade=1` | `98b8c4a0` | 44.25 / 72.25 | `#46525f` |
| T-035 **default (approved dose)** | `67d289c6` | 46.75 / 74.75 | `#2f565e` |
| T-035 `?shade=0.5` | `67d289c6` | 46.75 / 74.75 | `#2f565e` |

So: `?shade=0` reproduces the pre-T-035 build exactly, `?palette=classic` is
untouched whatever `?shade=` says, and the default URL is bit-identical to the
`?shade=0.5` the operator approved.

## The pre-registered measurement

Declared before any capture was taken, because "the frame got darker" is
satisfiable by failure:

- **P1 (the gate)** — paired population: `|median(rust px) − median(teal px)|`
  must WIDEN. rust = `r>g>b` (everything RIG runs on plus body mass), teal =
  `g>r AND b>r` (sky, haze, wall, skyline) — `src/render/palette.js`'s own role
  split. Signed value reported too. "Share below L40 rises" is deliberately
  **not** a criterion: a uniform darkening satisfies it.
- **P2 (anti-"dirty, not lit")** — frame p95 luminance may not fall more than 5%.
- **P3 (reported, never a gate)** — share under L25.5, the boards' darkest tenth.

Playfield crop = rows 12%–88% (excludes the HUD strip and the dev legend).
Luminance is Rec.709 over sRGB bytes. Baseline column is `?shade=0`.

| t | metric | old look (`?shade=0`) | **SHIPPED (dose 0.5)** | rejected (`?shade=1`) |
|---|---|---|---|---|
| 3 s | P1 signed sep | −15.0 | **−35.5** | −59.5 |
| 10 s | P1 signed sep | −15.0 | **−35.7** | −61.0 |
| 20 s | P1 signed sep | −15.0 | **−35.7** | −60.7 |
| 10 s | p95 | 90 | 78 | 78 |
| 10 s | p99 / p99.9 | 106 / 148 | 100 / 138 | 109 / 146 |
| 10 s | share > L100 / > L140 | 1.1% / 0.11% | **1.1% / 0.10%** | 1.3% / 0.16% |
| 10 s | share < L25.5 | 0.5% | **4.9%** | 51.2% |
| 10 s | rust median / teal median | 63 / 78 | 43 / 78 | 17 / 78 |
| slice 4 s | P1 signed sep | +33.5 | **+30.4** | (limb half N/A) |
| slice 4 s | rust p95 / p99 | 106 / 125 | **112 / 130** | — |

**P1 passed at the shipped dose:** separation 2.4x wider, in the direction
board 13 has it (the haze band brighter than the near play surfaces — board 13
panel 1 measures far body L=78 against near deck L=36). The teal median did not
move (78 → 78), so the widening is not the frame going dark together.

**P2 failed as written, at the shipped dose as well as at full strength**, and
it is recorded rather than re-specified: p95 fell 90 → 78 (−13%). The
diagnosis is that p95 is a *mid-tone* statistic on this frame — the deck's
four-tile stack and the hull, one flat value today, are now ramped — not a
highlight statistic. The highlight statistics held at the shipped dose: share
over L100 1.1% → 1.1%, share over L140 0.11% → 0.10%, rust p99 112 → 112, rust
max 222 → 222. A uniform darkening moves all of those down together.

**The traversal slice costs 3 levels of separation** (33.5 → 30.4) and gains
brightness at its own top end (rust p95 106 → 112, p99 125 → 130): the deck lip
is lifted while the slab faces ramp down. At full strength the same measurement
was 14.1 — one more reason the approved dose is the shipped one.

## Honesty notes

- Pairs are matched by identical input schedules against the seeded sim, not by
  frame-locked replay: hostile positions can differ by a frame or two between
  the two runs of a pair. Composition and value are comparable; individual
  sprite positions are approximately comparable.
- The capture bot holds right and jumps on a cadence, so it dies at the first
  wave gate around 21–24 s. Nothing past the first gate, no later face and no
  high-altitude phase is in these frames — the same limit `artifacts/look-v1/`
  discloses.
- Draw calls, InstancedMesh count and instance count are unchanged at every
  dose: 94 / 13 / 2969 on the default run, read live from `renderer.info` and a
  scene traversal. (The look packet quotes 101 calls for the same scene, taken
  on a different frame of the same build; what matters here is that the ladder
  moves it by zero.)
- **`artifacts/palette-v1/` is now stale.** With the ladder on by default, the
  concept side of those pairs carries value AND hue changes. The hue-only A/B
  is `?palette=classic` against `?shade=0`.
