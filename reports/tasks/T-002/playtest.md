PASS

# T-002 playtest gate — t2 divergence investigation (instrumentation, dev-only)

Worktree under test: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-002`
(branch `task/T-002`, head `bf2f5ee`), pinned via
`python3 -m http.server 8772` serving that worktree; harness run from the
MAIN checkout's `tools/playtest`. Server killed after the runs.

## Run commands (both exit 0, first try — no bootError, no retry needed)

```sh
# from /Users/scottmeyer/projects/hullbreaker/tools/playtest:
node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000 --base-url http://127.0.0.1:8772 --out runs/gate-T-002-mid
node run.mjs scripts/transform-slice.json --deterministic --max-runtime-ms 20000 --base-url http://127.0.0.1:8772 --out runs/gate-T-002-transform
```

## Evidence paths

- `/Users/scottmeyer/projects/hullbreaker/tools/playtest/runs/gate-T-002-mid/{report.json,summary.md,screenshot.png}`
- `/Users/scottmeyer/projects/hullbreaker/tools/playtest/runs/gate-T-002-transform/{report.json,summary.md,screenshot.png}`
- Finding doc: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-002/docs/playtests/2026-07-t2-frame-alignment.md`

## What was judged

**Smoke gate (this task must not change gameplay — unchanged smoke IS the gate):**

- `mid-route.json`: `outcome.result: "completed"`, fidelity `testapi`,
  `bootError: null`, console errors `[]`, 0 deaths, idle fraction 0.024,
  `minEdgeMargin` **35.44 tiles — bit-exact match to the committed
  deterministic demo baseline** (README lists 35.44 in all three baseline
  runs), protoScore 82.9 vs baseline band 83.0–85.7. Strong evidence the sim
  is byte-equivalent under the instrumentation.
- `transform-slice.json`: `outcome.result: "completed"` (BREACH CLEAR, 2/2
  transformations), fidelity `testapi`, `bootError: null`, console errors
  `[]`, 0 deaths, idle fraction 0, `minEdgeMargin` 30.09 tiles.

**Instrumentation claims spot-checked (not just read):**

- The new `transform.decisions` telemetry rides every sample of the
  transform run with zero harness changes, as the finding claims; the final
  sample shows both rituals `state: "done"`, `binding: "halt"`,
  `startTriggerMargin: 4.5` exactly — matching the finding's halt-bound /
  clamp-contracted signature.
- `node tools/pathcheck.mjs` in the worktree: **620 passed, 0 failed**
  (matches the claimed 610 → 620, includes the new trace-contract and
  twin-run bit-determinism assertions).
- `node tools/simlab/t2lab.mjs repeat --n 2`: 2/2 bit-identical full-trace
  digests; firstDeath 8766.842 / ritual0 13883.611 match the finding doc's
  quoted values exactly.

**Written finding (task acceptance):** exists at
`docs/playtests/2026-07-t2-frame-alignment.md` in the worktree, with a
Repro section (pathcheck, four simlab modes, pinned-worktree browser batch),
a clear demonstrate-and-refute answer (frame-alignment sensitivity
demonstrated; ritual-arming check refuted as the knife-edge), a concrete
recommendation (build playtest README hook request #5), and an
honesty/limitations section per harness convention.

**Screenshots (default FAR view, no `?view=` override):**

- `gate-T-002-mid/screenshot.png` — TRAVERSAL CLEAR end frame. RIG ≈ 3.4% of
  screen height (within board 13's 3–5% invariant), HUD and overlay stats
  legible at FAR, platform/ledge silhouettes read as connected surfaces, no
  glitches, nothing assembling. Grey-box palette is the known pre-palette
  state (T-010's scope), not a T-002 regression.
- `gate-T-002-transform/screenshot.png` — BREACH CLEAR end frame, 2/2 TURNS,
  interior/exterior forms static, no visible assembly, no render artifacts.
  Caveat honestly stated: an end-of-run still cannot prove the static-anatomy
  rule *during* the flip; but this diff touches no render code (trace fields
  in `src/sim/transform.js` + one additive telemetry field in `src/main.js`),
  so the transition choreography is unchanged from main by construction —
  that judgment belongs to T-001's gate.

## Defects filed

None. No issue added to SPRINT's Inbox.

## Notes / operator routing

Nothing feel-shaped in this task (investigation, dev-only instrumentation);
no checkpoint-queue entry needed. The finding's recommendation (build the
synchronous frame-scoped input hook, README hook request #5) is a
harness/game-side engineering decision for the integrator to triage into a
task, not an operator feel question.
