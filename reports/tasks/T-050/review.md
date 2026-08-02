APPROVE

reports/tasks/T-050/build.md:136 — still unfixed from the last pass, not blocking.
"a door's size against `CONFIG.player.height` (2.9 tiles vs 1.7 = 1.71x)"
conflates `CONFIG.limb.mark.door.rimH` (2.9) with `door.panelH` (2.5), the piece
the assertion actually selects (`p.h > 2.4` at
tools/pathcheck/t-050-shipped-plan-carries-the-scale-pass.mjs:126). Reconfirmed
this cycle: the shipped `markPanel` with `h > 2.4` has `h === 2.5`, ratio
`2.5/1.7 = 1.47`, not `2.9/1.71`. The assertion itself is unaffected — it prints
and bounds (1.2x-2.2x) the true runtime value, which is 1.47x, comfortably
inside — so this is prose-only and doesn't gate anything. The fix cycle
addressed the arity row (the actual blocker) but left this one from the same
prior review pass; worth a follow-up edit, not worth another cycle.

reports/tasks/T-050/build.md:20-22 — the "Merge note" is now stale against the
real main, not blocking. It names `task/T-049` as the only contended file
(`tools/pathcheck/manifest.mjs`) and says both sides "compose without semantic
conflict." That was true against the branch's base (`8c9f3b9`, main at 2404),
but main has since merged T-042, which claims the SAME `d47` slot
(`import * as d47 from './t-042-audio-punch.mjs'` vs this branch's
`import * as d47 from './t-050-...mjs'`, plus the matching DOMAINS-array line).
I reproduced this directly: `git merge --no-commit --no-ff task/T-050` onto
current `main` (in a scratch clone, discarded after) gives a real `CONFLICT
(content): Merge conflict in tools/pathcheck/manifest.mjs` at both the import
block and the DOMAINS array. Trivial to resolve (rename this branch's entry to
`d48`, per the exact "compose both sides" playbook `docs/ORCHESTRATION.md:120`
already documents for this recurring class), and T-049 may still collide too
whenever it lands — but the report's claim that T-049 is "the only" contention
is inaccurate today. Flagging so the integrator isn't surprised expecting a
T-049 conflict and finding a T-042 one instead.

Everything else re-verified independently this cycle, hostile and from
scratch, not by re-reading the prior review's claims:

- **The arity fix is complete and correct.** `build.md`'s table no longer
  claims arity 3; the new prose states "2 and 2" and I confirmed it directly —
  `limbBakePlan.length` on this tree is 2, and on `git show
  36a540c:src/pure/limb.js` (pre-T-045) it is also 2, because
  `(cfg, groundH, opts = {})` and `(cfg, groundH)` both stop counting at the
  first defaulted/absent param. `bakeArity` is fully removed from
  `verify-served.mjs` (the collection line, the field, and the message
  interpolation) and from the pathcheck domain module's header comment;
  grepped both plus the two READMEs for any other "arity" reference — none
  invent a number, all correctly say arity discriminates nothing. No assertion
  in `tools/pathcheck/t-050-shipped-plan-carries-the-scale-pass.mjs` ever read
  it, so removing it changed no gate behavior (pathcheck 2425/0, unchanged).
- **Core piece-count fingerprint re-measured from scratch, not trusted.**
  Ran `limbBakePlan(CONFIG, buildLevel(CONFIG).groundH, …)` myself in this
  worktree: no-opts and `{scale:true}` → 1633 pieces / 818 mark+bd / no
  silhouette; `{scale:false}` → 829 / 0 / silhouette present. Matches the
  report exactly.
- **`git diff main...HEAD -- src/` is empty** — reconfirmed.
- **New assertions bind.** Broke `src/pure/limb.js`'s guard
  (`opts.scale !== false` → `opts.scale === true`) myself: `node
  tools/pathcheck.mjs` goes to 2403/22 with the exact per-facet/opening/door
  failures the report quotes; restored via `mv limb.js.bak limb.js`, reran:
  back to 2425/0, `git status` clean (only the untracked `review.md`).
- **Broke the gate for real, three ways, on ephemeral ports (8951-8954,
  all killed after; :8741/:8742 never touched):**
  1. Correctly-served current tree → `verify-served.mjs` **PASS**, "limb bake
     plan matches this tree (1633 pieces)", "scale pass live in the page: 818
     mark/backdrop pieces."
  2. Server rooted on a reconstructed pre-T-045 tree (`git worktree add
     --detach 36a540c`, python http.server, removed after) → **FAIL**: the
     I-037 fingerprint message, plus all six watched files flagged "THE SERVER
     IS ROOTED ON ANOTHER TREE" with commits named, `src/pure/limb.js` naming
     `36a540c` exactly.
  3. **Cache mechanism, reproduced independently (not just re-read):** served
     that same reconstructed pre-T-045 tree over `python3 -m http.server` with
     backdated mtimes (`touch -t` ~2 months back, needed for Chrome's
     heuristic-freshness window — confirms the prior reviewer's mtime caveat),
     warmed a persistent Playwright profile against it, then re-pointed the
     same port at THIS tree (still plain `python3 -m http.server`, no
     `no-store`) and ran `verify-served.mjs` with `--profile` against that
     warm profile, no hard reload. Result: **FAIL**, "CACHED BYTES" on
     `main.js`, `config.js`, `pure/limb.js`, `render/limb.js`, `sim/level.js`,
     each naming the correct stale commit (`pure/limb.js` → `36a540c`).
- **Explicit answer on both named historical incidents, tested, not
  inferred:**
  - **I-037 (integrator's bad S1 filing, pre-T-045 `limb.js`): YES, caught
    and named**, by both mechanisms above.
  - **The operator's blank page (pre-T-022 `pace.js` cached against
    post-T-022 `level.js`): YES, but by a different path.** I reconstructed
    the exact incident (copied this tree, replaced `src/sim/pace.js` with
    `git show 2bc919a^1:src/sim/pace.js`, which predates `momentumScrollSpeed`)
    and pointed `verify-served.mjs` at it: **FAIL** — "the page never exposed
    window.HB — it did not boot (first error: The requested module
    './pace.js' does not provide an export named 'momentumScrollSpeed')."
    `src/sim/pace.js` is NOT in `WATCHED`, so the tool cannot name it via the
    byte-comparison mechanism the way it names `limb.js` — but the boot-failure
    check (A) fires unconditionally on any import-breaking staleness anywhere
    in the graph, and the console error it surfaces already names the missing
    export, which is at least as diagnostic as a file name would be. This is a
    real, honestly-scoped gap between "detects" (yes, always, for any
    all-or-nothing module failure) and "names the specific file" (only for the
    six in `WATCHED`) — the tool's own HONESTY section already says as much
    ("a stale module outside that list is invisible to check D/E") but neither
    `build.md` nor the READMEs connect that limitation to the T-022 incident
    by name the way they do for T-045. Worth a doc note, not a blocker.
- `tools/pathcheck.mjs`: **2425/0** in this worktree, reconciles correctly —
  base `8c9f3b9` is 2404 (matches T-050's own report), and this branch's own
  domain adds exactly +21. `main` has since moved to **2448** (2404 + 44 from
  T-042's merge, confirmed via `git log`), so the eventual merge lands at
  2469 once the `d47`/`d48` manifest conflict above is resolved by hand.
- No new runtime dependency: `git diff main...HEAD -- '*.json'` across the
  tree is empty; `tools/playtest/package.json` unchanged.
- `--operator-port` guard on :8741/:8742 read correctly (code inspection; did
  not probe those ports).
- Docs (`docs/ORCHESTRATION.md`, `tools/playtest/README.md`,
  `artifacts/t-050/README.md`) accurately describe both mechanisms against
  everything measured above.
