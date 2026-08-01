APPROVE

Second pass (fix commit 26de15f). All four first-pass findings verified fixed; no new findings.

src/ui/audio.js:478 — RESOLVED (was MAJOR): `applyLayers()` now rides `onCornerFinished` (fires after wavegate.finishCorner commits `c.state = 'done'`) and is removed from `onFaceRevealed` (fires pre-'done'). Verified in src/sim/wavegate.js finishCorner ordering and src/sim/transform.js finishTransform (already correct). Three new pathcheck assertions lock both handler sides plus the sim ordering, so a future reorder trips the gate.

reports/tasks/T-012/report.md — RESOLVED (was MAJOR): builder report exists with an honest machine-listen note (disclaims agent hearing, pre/post-fix layer-engagement tables, boot-mute + ?audio=0 probes), both smoke scripts recorded green, and five open feel questions queued for the operator; the report does not self-declare fun.

src/ui/audio.js:452 — RESOLVED (was MINOR): onCapsuleRemoved mirrors the sim catch predicate exactly (pop expiry/cull early-return matching src/sim/capsules.js:78; `gameMs >= noCatchUntil` matching :83); the remaining teardown edge is documented in-code as accepted. Drift left-edge cull bypasses the early-return but overlap at sLeftEdge()-4 is unreachable for RIG — no false-chime path.

src/ui/audio.js:32 — RESOLVED (was MINOR): header now claims only what exists — the CONFIG fold is suggested in the builder report's Follow-ups section (present), not "recorded" in SPRINT.

Fresh-pass verification: `node tools/pathcheck.mjs` in the worktree — 654 passed, 0 failed. Diff purely additive; no assertions weakened, no smoke retiming. Layer purity holds (sim/pure untouched; sanctioned read-surface imports only; main.js integration is one side-effect import, loaded last). All wrapped bridge hooks take <=2 args against the 3-arg wrapper and have noop defaults. Zipper deliberately silent per decisions entry 3; ?hook=1 untouched; frozen constants untouched; no runtime deps; no per-frame hot-loop allocations; voices capped; caches cleared on removal/restart. Worktree clean.
