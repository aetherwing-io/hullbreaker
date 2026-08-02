PASS

Light gate (docs-only lane, per team-lead scope — no browser playtests or
screenshots beyond the one live-harness script named in the assignment).
Worktree `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-031`,
branch `task/T-031`, HEAD `ae75ce9`. Did not re-do the code review's work
(read `review.md`/`build.md`, did not re-verify I-001/I-002/I-016-src/I-027
narrative beyond what the four checks below required).

## 1. pathcheck green

```
$ node tools/pathcheck.mjs      (in the worktree, HEAD ae75ce9)
pathcheck: 1704 passed, 0 failed
```

Exact numbers match the assignment's expectation (1704, this lane's base
predates T-025). Exit 0.

## 2. mortar-zone-deny.json parses and runs against a pinned copy

Parsed with `JSON.parse` directly (not just eyeballed): valid, keys
`name/description/url/viewport/durationMs/moves/policy`, 0 fixed `moves` (it's
a closed-loop policy script, expected).

Served the worktree in isolation:
```
node /Users/scottmeyer/projects/hullbreaker/tools/serve.mjs 8756 \
  --root /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-031 --quiet
```
(port killed after — 8741/8742 untouched throughout). Ran it against that pin:
```
node run.mjs scripts/mortar-zone-deny.json --deterministic \
  --max-runtime-ms 17000 --base-url http://127.0.0.1:8756
```
Result: `outcome: completed (fidelity: testapi)`, deaths 0, kills 0, hits 0 —
consistent with the doc's "completed, 0 kills, hp 3/3" claim (0 hits survived
== hp never dropped). `report.json` has `consoleErrors: []`, no `bootError`,
no `errors` key. My run is policy-driven rather than the fixed-event trace
the two cited reports used, so I did not expect (and did not get) an
identical crossing beat — the diff's whole point is that the beat varies
run to run; what matters is that it still completes clean, and it does.

(First attempt used `--base-url http://127.0.0.1:8756/index.html`, which
double-appended the path and produced a boot error — a `--base-url` usage
mistake on my end, not a harness or docs defect; `--base-url` takes the
origin only, per `run.mjs --help`. Corrected and re-run above.)

## 3. palette-capture.mjs writes only after verification passes

Read the control flow in full (`tools/playtest/palette-capture.mjs`). `shot()`
now does bare `page.screenshot()` (no `path`) into a per-scene `pending` Map
keyed by the final artifact path; the only `writeFileSync` call is at line
463, in the outer scene loop, reached only after the inner `for (const pal of
PALETTES)` loop returns normally for both palettes. `driveIrisCycle` throws
(line 382-383) when a cycle never verifies within `POLYP_RUN_MS`, and that
throw is not caught anywhere between it and the top level — it aborts the
whole process before the `writeFileSync` loop for that scene (or any
scene after it) is reached.

Forced it empirically rather than trusting the diff or the builder's own
report: made a scratch copy (`palette-capture.QA-FORCEFAIL.mjs`, same
directory so `here`-relative `OUT`/module resolution stay correct) with
`TELL_MIN_WARMER_PX` raised to 999999999, recorded sha1 + mtime of the four
committed `artifacts/palette-v1/polyp-{tell,beam}--{concept,classic}.png`
files, then ran `node palette-capture.QA-FORCEFAIL.mjs polyp-cycle` against
this worktree's own ephemeral server (the script starts its own via
`startStaticServer`). It printed 4 retries ("tell frame carried Npx of warm
blink (need 999999999)") and threw `Error: polyp scene [concept]: no
verified tell+beam cycle in 30000ms (4 iris cycles attempted) — nothing
committed`, exit 1, before ever capturing a `classic`-palette side. Re-checked
all four files afterward: identical sha1 and identical mtime to before the
run, and `git status --porcelain artifacts/` empty. Scratch file deleted
after (`git status` in the worktree now shows only the pre-existing untracked
`reports/tasks/T-031/review.md`, nothing else).

## 4. Every number the diff introduces/corrects traces to a committed source

Spot-checked by opening the cited files myself, not by re-reading the report:

- `SHARE = { glyph: 1, cue: 1, pose: 0.6 }` — `src/render/legibility.js:85`,
  verified verbatim.
- `depthMult: 1.9` for `far` — `src/config.js:32`, verified verbatim.
- Gain 1.54 — arithmetic `1 + (1.9-1)*0.6 = 1.54`, and this exact formula is
  independently asserted at `tools/pathcheck.mjs:6067` (`near(LEG_POSE_GAIN, 1
  + (VS.far.depthMult - 1) * SHARE.pose, ...)`) with `LEG_POSE_GAIN <
  LEG_CUE_GAIN` at `:6069` — both real, both green under check 1.
- "simulation-identical" (not byte-identical) for `?juice=0` — `samplePerf(t)`
  is called unconditionally inside `frame()` at `src/main.js:540`, and
  `telemetry()`'s returned object includes `juice: juiceSnapshot(), perf:
  perfSnapshot()` unconditionally (no `_ENABLED` guard, unlike `hook`/`flow`/
  `shell` immediately above them) — confirmed by reading `src/main.js`
  directly. Supports the new wording.
- "~830 ms" / "stepped off … entered cool" —
  `reports/tasks/T-014/evidence/README.md`: "stops there for ~830 ms … steps
  off the lip … on the exact frame the mortar enters `cool`" — verbatim match.
- "~150 ms" / "x = 62.21" / "hp 3/3" —
  `reports/tasks/T-014/playtest.md`: "the bot paused ≈ 150 ms at the lip and
  crossed during `fuse`/`burst`" (I-017 section) and "was clear at x = 62.21
  when the slab went live: 0 damage" (§"What I judged"), and "hp 3/3" appears
  at line 49 for the solo mortar run — all verbatim matches.

No number in the diff failed to resolve to a committed path or a stated
arithmetic derivation over asserted constants.

## Verdict

All four checks pass. No new Inbox issues found in this gate's scope (I-045+
unused — nothing to file).
