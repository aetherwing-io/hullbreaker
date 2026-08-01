APPROVE

Gates run in the worktree (/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-003):
- `node tools/pathcheck.mjs` → 1480 passed, 0 failed (exit 0).
- Browser smoke `index.html?selftest=1` → title `SELFTEST PASS (26 checks)`, no page errors.
- Runtime smoke at `?slice=traversal&view=far`, `&legibility=0`, and `?view=near&hound=1&polyp=1`:
  no console/page errors; perf identical across pass on/off (avg 8.3ms, worst ~10.4ms, 0 frames >20ms).
- Layer purity: no `src/pure/` or `src/sim/` file touched; `src/config.js` untouched; new
  `src/render/legibility.js` imports only `../config.js` + `../mode.js` and is statically
  guarded (pure/sim may not mention it; no gain may appear on a beam/mark/blast scale line).
- Determinism: no `Math.random`/`Date.now`/`performance.now` added to pure or sim; all new
  timing reads `gameMs`. Sim rows are read-only in the new render code (`e.vx/e.vy`, `e.state`).
- Verdict compliance: FAR stays the default and RIG/camera are untouched (pathcheck asserts
  `rigScreenPct('far')` stays inside board 13's 3–5%); no anatomy assembly; `?hook=1` untouched;
  no CONFIG/jump-constant change; no weakened or deleted assertions (the two edits to existing
  pathcheck blocks both add coverage); no new runtime deps, no build step, no OSTK artifacts.

MINOR findings

src/render/legibility.js:35 — the header claims "at ?view=near every gain is exactly 1, so the
near view keeps the art it always had". Only the *gains* are 1 at near; the pass still re-authors
the capsule glyph texture (128px fitted glyph, ink border, four plate faces), replaces the pickup
twirl with a bounded rock (capsules.js:168), adds the two tell lamps, front-loads the iris
dilation (hostiles.js:115) and gives the wasp its dive dart + `PAL.waspDive` — all at near.
Measured: the near capsule blob changes shape between the committed `capsule-glyph--near-before`
/`--near-after` frames. Only `?legibility=0` restores the pre-pass art, so the comment should say
that; as written it will mislead the next agent doing a near-view A/B.

src/render/hostiles.js:116 — the boosted iris swell widens the drawn-vs-hitbox gap the whole
800ms tell and the fire state: the DodecahedronGeometry circumradius goes from 0.55→0.80 tiles
against an unchanged 0.5-tile `polyp.hitRadius` (1.43x → 1.61x). Pathcheck asserts containment
but not the gap, and contact damage uses the same radius, so shots that visually graze the
swollen bulb still miss and the bulb can visually overlap RIG without damage. The direction of
the mismatch pre-exists (hound is 1.7 tiles wide against a 0.42 hit circle); worth one line in
the adversarial/operator pass rather than a rework here.

src/render/capsules.js:140 — with the pass on, a capsule mesh carries a 6-entry material array,
so three.js emits one render item per BoxGeometry group (6 draw calls per capsule) instead of the
single call the pre-pass single-material mesh produced. No measurable cost today (capsule counts
are tiny and the smoke showed identical frame times), but it is a 6x per-capsule draw-call growth
to know about before any capsule-shower or instancing work.

tools/playtest/README.md:957,976 — stale against the shipped tool: the entry says "2.4x
center-crop" and "the detail crop is a fixed center rectangle", but `legibility-capture.mjs:375`
crops around a per-scene `focus` point (the rectangle is fixed, the *centre* is not). The
`--compose` re-composition flag added in the same commit is also undocumented in the README entry.

tools/playtest/legibility-capture.mjs:280 — evidence gap against acceptance bullet 2 ("compare
near/mid/far captures side by side"): only `capsule-glyph` and `hound-tell` declare
`views: ['near','mid','far']` and produce `--views-after` strips. `wasp-dive`, `polyp-onset` and
`polyp-late-tell` are far-only, so the wasp tell the task names has a FAR before/after pair but no
near/mid comparison. Judgeable as shipped; one more capture run would close it.

src/render/legibility.js:150 — the pass ships default-ON with `?legibility=0` as the off switch,
which matches the `?juice=0` precedent, but it adds genuinely NEW cues rather than only scaling
existing ones (tell-lamp geometry on hound + polyp, the wasp dive dart and its new `PAL.waspDive`
token, the front-loaded iris curve). Those are unjudged behavior: the integrator should file the
SPRINT operator-checkpoint entry with the exact URLs before this is treated as settled.

Operator questions (feel — not blockers, for the checkpoint packet)
1. Lamp scale: at FAR the tell lamp is 0.84 world tiles across (~14.5px, roughly half RIG's screen
   height and near the houndframe's own body height). Does it still read as a light ON the machine,
   or as a floating marker?
2. The diving wasp renders ~#cfdf73–#dfeb97 at FAR. Distinct enough from the roster's warm-amber
   warning (#ffd0a0) on a 17px drone, or do "committed" and "warning" blur at that size?
3. The pickup twirl is now a bounded ±0.5 rad rock so the letter never turns away. Does the capsule
   still read as alive, and does the always-facing letter cost the pickup its spin appeal?
4. `?view=near&legibility=1` vs `?view=near&legibility=0`: at near the compensation is 1 but the
   lamps, dart and re-timed iris are all present. Keep them at near, or gate the new cues to
   pulled-back views only?
