APPROVE

All three nits are fixed and every factual claim the diff adds was
re-derived independently by this gate (details under "Verified" below).
No `src/` change, no new deps, no flag/constant/verdict surface touched —
harness- and docs-only. Findings are MINOR; none block the merge.

MINOR — tools/playtest/lib/sampler.mjs:94 (and tools/playtest/README.md) —
branch is stale relative to `main`: T-016 landed after the merge-base and
also edited these two files, so `git merge-tree main HEAD` reports content
conflicts in `tools/playtest/lib/sampler.mjs` and `tools/playtest/README.md`.
`merge-task.sh`'s `git merge --no-ff` will refuse until resolved. Both
conflicts are additive-adjacent and semantically compatible: keep main's
`score: null` **and** this branch's `hostiles` normalization in `base` /
`fromTelemetryLike`, and keep both README rewrites (main's limitation #2 +
A.5/lives sections, this branch's limitation #7 and hook request #2). After
resolving, main's `score` field should also be added to the sampler header's
"shared fields of both channels" list, which this diff rewrote.

MINOR — SPRINT.md:348 — accept item 2 ("I-001/I-002 marked resolved in the
Inbox") is not in the diff. Correct call by the builder — `SPRINT.md` is
integrator-owned on `main` and a branch edit would conflict with the queue
edits landing every cycle — but the bookkeeping is still outstanding:
integrator must strike/annotate I-001 and I-002 at merge time.

MINOR — tools/playtest/lib/sampler.mjs:49 — "both channels carry
byte-identical rows" overstates slightly: `HB.snapshot()` and
`__HULLBREAKER_TEST__.snapshot()` each invoke `telemetry()` separately, so
rows are identical only when both are read at the same sim instant (i.e.
inside one `page.evaluate`, which is exactly how the equivalence was
measured). The README states the qualifier; the code comment does not.
Wording only — no behavioral risk, since the sampler reads one primary
channel per sample and the fallback never fires when testapi carried rows.

Verified (this gate, in the worktree):
- `node tools/pathcheck.mjs` — 775 passed, 0 failed, exit 0.
- `node tools/assets/check.mjs --selftest` — PASS (23 cases), exit 0.
- I-002 fix behaviorally re-tested on three throwaway fixtures: single-line
  import → error only, excluded from the runtime listing, header now reads
  "... (1 static import rejected below, not counted here)"; import preceded
  by blank lines → correct line blamed and excluded (the `kwAt` offset works);
  imports-only tree → new `else if` branch prints "src/ has no runtime
  reference to assets/". The README's new import-scan limitation is honest:
  a specifier on a later line than the `import` keyword exits 0 and lands in
  the runtime listing, reproduced exactly.
- README item 4's census re-derived from the PNGs, not taken on trust:
  100x100 → 31 unique colors, blends over the 0.5% gate are 1.21/1.19/1.02/
  0.72/0.72%, all `hot-magenta`; `#ffdcc5` classifies `rust-orange` at 0.44%
  (below the gate). 128x128 → 8 colors, 5 authored + 3 blends, all under the
  gate, none off-palette. Both match the new text exactly, and the documented
  re-derivation command's flags/paths (`rasterize.mjs --size/--out`,
  `assets/generated/glyphs/capsule-letter-h.svg`) are valid.
- I-001 fix is functional, not just a comment edit: `node run.mjs
  scripts/mid-route.json --deterministic` completed at `testapi` fidelity
  with 97/97 samples carrying non-empty `hostiles` rows from the primary
  channel (`{id,kind,x,y,hp,state,dir,materialized}`) and `capsules` still
  filled by the `HB` enrichment. Metrics match the reported baseline
  (completed, 1 attempt, 0 falls/deaths, 1 hit, dare pocket entered,
  `minEdgeMargin` 35.44, `airMs` 5570, `protoScore` 90.6 — inside the
  documented run-to-run spread).
- Comment claims checked against `src/main.js`: `telemetry()` publishes the
  hostile rows and `HB.snapshot()` spreads that same result (`capsules`
  really is HB-only), so the sampler/README/policy comments describe the
  shipped surface.
- Scope: `tools/` only (5 files); `src/`, `CONFIG`, `?hook=1`, FAR default
  and bend-cull behavior untouched; no runtime dep, no build step, no OSTK
  artifact; the added `report.gameIndependence.staticImports` field has no
  external consumer.
