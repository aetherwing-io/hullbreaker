# T-102 playtest evidence

Companion to `../playtest.md` (the verdict). QA-authored; nothing here edits
`src/`, fixtures or tuning. Everything was produced against worktree
`/home/user/hullbreaker/.claude/worktrees/T-102` at `6d3e58f` (branch
`task/T-102`) and, for "before" numbers, an untouched `git archive 98b12c9`
export with the new `tools/simlab/turnlab*` files overlaid (the lab locates
`src/` relative to itself, so the overlay tests the base code).

| path | what |
| --- | --- |
| `smoke-mid/` | `scripts/mid-route.json` deterministic smoke. `summary.md`, `run.log`, `screenshot.png`, `report.trimmed.json` (the full `report.json` minus its 588-sample trace), `wall.txt`. |
| `smoke-transform-attempt1-capped/` | first `transform-slice.json` attempt: stopped by the harness's wall-clock cap (`stopReason max-runtime-ms`, tick 913 of the 938 where the slice wins). Kept because a retry replaced it; see `../playtest.md`. |
| `smoke-transform/` | the retry (`HB_HARNESS_SLOWDOWN=100`) that is the smoke result of record. |
| `headless/` | turnlab outputs: `d1-*`, `d2-*` (fixed `-fix`, base `-base`), `dat-base.json`, `falsify.out`, `rig-px-*.json` (RIG's projected pixel position per posed frame, from the lab's camera replica). |
| `captures-analysis/` | derived views of the T-102 captures: `d4-right-third.jpg` (base t700 / base t860 / fix t700, right third of the frame), `desktop-rig-sheet.jpg` (RIG crop at all 24 desktop frames), `phone-c1..c6.jpg` (2x2 grids of the phone frames with RIG ringed), `c1-rig-zoom.jpg`. |
| `hud-fit/` | the real-DOM fit test of the new gate line. |
| `probes/` | the scripts behind the numbers, all read-only on the game. |

## Probes (run from anywhere; `<tree>` is a worktree or export that has `tools/simlab/lib/turn-proof.mjs`)

```sh
. ~/.hullbreaker-host.env
node probes/rig-px.mjs <tree> desktop|phoneLandscape        # RIG pixel position per capture milestone
node probes/trace-tele.mjs <tree> die-after-turn desktop 'fallback=0' 4500 4600   # per-tick RIG trace
node probes/resize-gate-probe.mjs <tree> desktop 390 844 3 2   # narrow the window 2 ticks into gate 3; roster before/after
node probes/retire-census.mjs <tree> desktop                 # post-tick roster census (cannot see D2's same-frame retirements; kept for the record)
node probes/hud-strings.mjs <tree> desktop paced 1400        # the gate-line strings a played run prints
node probes/hud-fit2.mjs http://127.0.0.1:<port> out.json    # real Chromium, three viewports; needs playwright-core from tools/playtest
```

The two `*-instrumented.mjs` probes count D2's retirements exactly. They need a
scratch copy of the tree (never the worktree) with one line added to
`retireUnseenGateRows()` in `src/sim/wavegate.js`, directly after
`e.gateBreakExit = true; retired++;`:

```js
(globalThis.__RETIRED = globalThis.__RETIRED || []).push({ k: c.k, kind: e.kind, x: +e.x.toFixed(2), gating: !!e.gating, strip: [+left.toFixed(2), +right.toFixed(2)] });
```

Copy `src/` and `tools/simlab/` into `<scratch>/` and `<scratch>/tools/`, apply
the line, put the probe next to `tools/`, and run it with the viewport name.
Retirements happen in the same frame the rows spawn and `updateHostiles`
removes them before any post-tick observer runs, which is why the plain census
reports 0 even on portrait.
