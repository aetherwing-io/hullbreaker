# `tools/pathcheck/` — the headless gate, one file per domain

`node tools/pathcheck.mjs` runs the **CORE tier** and prints
`pathcheck: N passed, M failed` as its last line, exiting non-zero on any
failure. Every assertion sits in a domain module here (T-037); since T-120 the
domains are tiered (from T-108's audit, `docs/proposals/2026-10-test-audit.md`
§7):

| command | runs | when |
|---|---|---|
| `node tools/pathcheck.mjs` | **CORE**: every domain not listed DEEP or PLAY in `_tiers.mjs` (shipped behaviour, hard rules, the invariant tier, pins still awaiting their behaviour-test replacement) | the per-edit hook (with `HB_GATE_FAST=1`) and the merge gate (without it) |
| `node tools/pathcheck.mjs --deep` | CORE + **DEEP** (flag fixtures and prototypes, the playtest harness's self-tests) | on demand / when touching a fixture; never merge-blocking |
| `node tools/pathcheck.mjs --tier play` | the browser domain (`render-submission-contract`) | from `tools/orch/play-gate.mjs` |
| `node tools/pathcheck.mjs --tier all` | everything, the pre-T-120 suite | evidence, comparisons |

Other switches: `--only a,b` (the SHARED producers still run first when needed),
`--serial` (one process, manifest order — the pre-T-120 execution model),
`--json <file>` (per-domain passes / fails / ms / FAIL lines / tier),
`--list` (the tier map), `--check-lanes` (re-prove lane independence).

**Lanes.** CORE domains listed `INDEPENDENT` in `_tiers.mjs` run in parallel
lane processes (`HB_GATE_LANES`, default 3); the rest run in the main process in
manifest order, exactly as before. A lane domain reads nothing from `SHARED` and
leaves nothing a later domain reads — evidence: each produced identical
pass/fail counts alone and inside the serial run (2026-10-23; re-check with
`--check-lanes`). Per-domain counts of a lane run and a `--serial` run were
identical (63/63 domains); wall time 38.0 s vs 62.1 s at load ~35 on the 4-core
cloud host. A lane that dies is a failure, and a watchdog thread kills a lane
whose runner is gone (the merge gate and the hook bound pathcheck with
`kill -9`).

**Adding a domain** is unchanged: create it and append it to `manifest.mjs`. It
is CORE and runs in the main process unless you list it in `_tiers.mjs`. Failed
assertions are also summarized by their audit disposition
(`tools/orch/test-audit-lock.json`): a CORE failure means a player would notice,
an invariant-tier one means a design invariant moved — ask its owner.

**Behaviour tests that drive the game** (`t-120-*.mjs`) use `lib/`:
`default-run.mjs` (a renderer-free host for the default six-face run: the real
sim, plus the REAL run-reset registry through `render-stub-hooks.mjs`, which
replaces every `src/render`/`src/ui` module with inert stubs),
`default-run-child.mjs` (one fresh process per scenario), `mode-flags-child.mjs`
and `spawn.mjs`. Each such test was shown red on its mutant in
`tools/orch/mutants.mjs` before it landed (`reports/tasks/T-120/build.md`).

## Adding assertions (the whole point)

**Add or edit ONE file in this directory. Do not touch `../pathcheck.mjs`.**

- Extending an existing domain: open its module and append. Two lanes editing
  two different domains do not conflict.
- A new domain: create `my-domain.mjs`, then add one import line and one list
  entry in `manifest.mjs`. That is a one-line conflict at worst, instead of the
  N-way conflict the 9,230-line monolith was by construction.

A module looks like this:

```js
import { CONFIG } from '../../src/config.js';
import { ok, near } from './_context.mjs';

export const title = 'what this domain is about';

export async function run(SHARED) {
  const { TL } = SHARED;              // values earlier domains published
  ok(TL.groundH.length === CONFIG.levelLength, 'the fixture spans the level');
  Object.assign(SHARED, { MY_THING }); // only if a later domain reads it
}
```

`ok(cond, msg)`, `near(a, b, eps, msg)` and `fingerprint(value)` come from
`_context.mjs`, which also runs the static layer guards before any domain does.
`run` is `async` because several domains `await import(...)` or drive child
processes.

## Order is significant, and it is explicit

`manifest.mjs` is a hand-ordered list, never a directory glob. Two reasons, both
load-bearing:

1. Sections build values that later sections read (levels, fixtures, probe
   results). Those travel through the `SHARED` object the runner threads through
   every `run()`.
2. Sections also drive the sim's **module-level singletons** and leave them set.
   This is not theoretical: the jump-apex block inherits
   `setSimEdges(-1000, 1000)` from an unrelated block above it, and four
   assertions flip PASS→FAIL if it does not
   (`reports/tasks/T-037/evidence-nodetest-isolation.txt`).

Because of (2) the main process runs its domains **in one process, in list
order**. That is also why it is not a `node --test` suite: per-file process
isolation would silently give some assertions a different starting state.
Only domains proven independent (above) run in lanes. Directory enumeration
order is not stable across machines either, which is why nothing here globs.

### …and a module you forget to list makes the gate refuse to run

The manifest is now the one shared append point, so it is the one place a merge
can still conflict. A dropped entry there would be the old silent-drop bug in
miniature: measured on this tree, removing one domain's two manifest lines took
the gate from **1812 passed** to **1705 passed, 0 failed, exit 0** — 107
assertions gone, still green. So `../pathcheck.mjs` cross-checks the manifest
against the directory before running anything and exits 1 naming any module that
is present but unlisted. Resolve a manifest conflict by keeping **both** sides'
lines; if you drop one, the gate tells you.

## Regenerating from a monolith

The split was produced by `tools/pathcheck-split.mjs`, which is re-runnable —
that is how a branch that still carries the old monolith gets merged:

```bash
node tools/pathcheck-split.mjs --source-rev <rev-with-the-monolith>
node tools/pathcheck.mjs
node tools/pathcheck-labels.mjs --rev <rev-with-the-monolith> --out /tmp/before.labels
node tools/pathcheck-labels.mjs --tree . --out /tmp/after.labels
diff /tmp/before.labels /tmp/after.labels        # must be empty
```

`--check` proves the committed tree is byte-for-byte what the script emits from
a given source. Files without the `GENERATED BY` marker (this README, or a
domain a lane hand-wrote) are left alone by both the regeneration and `--check`.

## Honesty / limitations

- Lane independence is shown by equal counts, not proven: a domain could pass in
  a lane for a different reason than in the chain. The mutation sample
  (`tools/orch/mutation-sample.mjs`, which runs this runner) is the check that
  the lanes still catch what the serial suite caught.
- The default-run host TRANSCRIBES two pieces of `src/main.js` (update order and
  the default run's resetGame tail) because main.js imports three.js; a static
  drift guard in `t-120-retry-replays-the-run.mjs` fails when main.js changes
  them. The render stubs make every render/UI export a no-op function — a boot
  module that READ a render constant would see a function (none does today).

- The split preserves **evaluation order and text**, not module hygiene. Domains
  are as coupled as the monolith's sections were; `SHARED` makes that coupling
  visible rather than removing it. `manifest.mjs` prints which domains publish
  and consume — reorder at your peril.
- `pathcheck-suite.mjs` is still large (the un-bannered head of the old file:
  level arithmetic, waves, retune constants, the generator and the FAIR-GAP
  probe). Splitting it further is a follow-up, and can be done by adding
  `/* ===== banner ===== */` lines to the monolith before re-running the script,
  or by hand afterwards.
- `tools/gatecheck.mjs` mutates this tree textually to prove the gate can fail.
  If you rename a domain file, that still works (it hunts every gate file); if
  you change the runner so it no longer imports `'./pathcheck/…'`, gatecheck
  fails loudly rather than mirroring the wrong modules.
- The label capture in `tools/pathcheck-labels.mjs` finds the single
  `function ok(cond, msg)` definition. If a second one ever appears, it refuses
  to capture rather than reporting half a run.
