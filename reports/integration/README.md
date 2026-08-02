# Cross-lane integration checks (integrator)

Captures neither lane can produce alone, taken before a merge sequence.

## T-051 renderer x T-053 plates — 2026-08-02

**Why.** T-051's only failing acceptance box ("far edge dissolves into the fog
color, proven by capture") was proved unfixable in the render lane: three
independent measurements — its reviewer via PIL, the lane across all five
plates, and its playtester at the flagged pixel — agreed the plates are
near-binary alpha masks, and a flat camera-facing quad's material can only
tint a pixel's COLOR toward fog, never make an opaque pixel transparent. The
fix had to be authored into the asset, which is T-053's file. So neither lane
could test the fix: T-051 owns the renderer and not the assets, T-053 owns the
assets and touches no runtime code.

**Method.** `git archive` of `task/T-051` HEAD into a scratch copy, T-053's
five regenerated plates copied over it, served on an ephemeral port, captured
in play at the 17m marker. Scratch copy only — neither worktree was modified.

**Result.** Works. The plate renders with a soft boundary and reads as part of
the same world; the hard rectangular edge visible with the old plates is gone.
No failed requests, no page errors.

- `t051-renderer-with-old-plates.png` — T-051 alone, ~0.48% partial alpha
- `t051-renderer-with-t053-plates.png` — same tree, T-053's plates (13.75-35.12% partial)

**Merge order this establishes:** T-053 first, then T-051 re-gated against the
landed plates. T-051's depth retune and T-053's feathering fix two different
problems and both are wanted — the depth change stops the plate abutting box
geometry, the feathering closes the acceptance box.
