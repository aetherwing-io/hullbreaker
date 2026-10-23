# tools/cleanup — the T-121 inventory and neutrality probes

Dev-only. Nothing here is loaded by the game, and nothing here is a merge
gate. These three scripts produced every number in
`docs/proposals/2026-10-cleanup.md`, and the neutrality evidence for each
T-121 deletion batch (`reports/tasks/T-121/build.md`).

| script | question it answers | needs |
|---|---|---|
| `graph.mjs` | what can the default URL reach? modules (static + dynamic imports from `src/main.js`), exports (imported by reachable src / only by tools / nobody), and every tracked `assets/` file classified by who names it | acorn |
| `flag-lines.mjs` | how many lines sit on the side of a flag branch the default URL never takes? | acorn |
| `boot-probe.mjs` | does a served tree boot to PLAYING with no page/console errors, which same-origin files does it request, and what does the frozen-tick frame look like? `--compare` diffs two probe dirs | Chrome via `tools/playtest`'s playwright-core |

```sh
node tools/cleanup/graph.mjs                    # summary
node tools/cleanup/graph.mjs --dead             # exports nothing in src/ uses
node tools/cleanup/graph.mjs --json /tmp/g.json # everything, machine-readable
node tools/cleanup/flag-lines.mjs
node tools/serve.mjs 8771 --root . --quiet &    # then:
node tools/cleanup/boot-probe.mjs --base-url http://127.0.0.1:8771 --out /tmp/p-desk
node tools/cleanup/boot-probe.mjs --base-url http://127.0.0.1:8771 --out /tmp/p-phone --viewport 844x390 --touch
node tools/cleanup/boot-probe.mjs --compare /tmp/p-base /tmp/p-branch
```

acorn: `cd tools/cleanup && npm install` once, or point `HB_ACORN_DIR` at any
`node_modules` that has `acorn` and `acorn-walk` (the cloud container has them
in `/opt/node-tools/node_modules`, which the scripts also try).

## Honesty / limitations

- **Static reachability is not execution.** `graph.mjs` marks a module
  reachable if any import chain from `src/main.js` reaches it; code behind a
  query flag inside a reachable module is still "reachable". That is what
  `flag-lines.mjs` is for, and it only counts `if`/`?:` branches whose test it
  can evaluate from the default values — anything else is reported as
  undetermined, never guessed. Whole modules or data tables that only one flag
  reaches are not counted by either tool; the proposal adds those by reading
  the code and says so.
- **Runtime fetches are found by name.** Asset URLs are string literals in
  sprite tables and specs, so `graph.mjs` classifies `assets/` files by
  basename match against the tree's text. A file named only by a computed
  string would show as unreferenced (none was found in `src/` on 2026-10-22,
  but a tool could build one). The runtime truth is `boot-probe.mjs`'s request
  ledger — and that only covers the URL and viewport it booted.
- **Identifier counts ignore scope.** An export reported "internal-only" may
  in fact be a shadowed name. The error is always toward keeping code.
- **Tool imports are matched by regex** (`import … from '…src/…'`). A tool
  that builds a src path at runtime and `import()`s it will not appear as a
  consumer. Before deleting anything, `git grep` the name across the whole
  tree — every T-121 batch did.
- **`boot-probe.mjs` frame captures are host-sensitive.** On a GPU-less host
  under load a single SwiftShader frame can outlast the 4 s freeze watchdog,
  which halts the loop; the probe then reports the failsafe panel rather than
  waiting forever. Late-arriving art (the boot gate starts the game without an
  asset that misses its budget) can make two captures of the SAME tree differ,
  so each frame capture records which art made the gate (`__HB_PRELOAD()`
  states) and `--compare` only judges pixels when both sides kept the same
  art AND the same boot outcomes that change pixels without a code change:
  the bloom pass's own boot budget (`post.status` `active` vs `failed` —
  under load it falls back to direct rendering), the adaptive resolution
  scale, the drawing-buffer size. Matching states + different pixels fails
  the verdict; different states are reported as `inconclusive` with what
  differed (re-run the pair, ideally concurrently, until they match). The frozen-tick snapshot is
  compared byte-for-byte minus its presentation telemetry (`perf`, `post`,
  `adaptiveFidelity`, `actionVfx`, `viewInit`, `juice` — residency, draw
  counts, timing); everything else in `HB.snapshot()` is sim state and does
  not depend on load.
- **Bridge wiring is a shape, not a proof of bodies.** Frame captures also
  record what sits in each `src/sim/bridge.js` slot after boot: juice
  wrappers by tag, audio wrappers by their source pattern, the bridge's
  no-op, or an owner by function name. Two trees with the same wiring can
  still differ inside an owner's body; what this catches is an install added
  or removed — which decides whether an audio observer survives (audio wraps
  at import time, before the owners install). Renaming an owner function
  shows up as a difference.
