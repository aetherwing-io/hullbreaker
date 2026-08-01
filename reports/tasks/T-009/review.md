APPROVE

Gate: reviewer, task T-009 (six-face integration — lattice route density,
hound-2.5 station placement, static-anatomy corner reveal as default).
Worktree /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-009
(branch task/T-009, HEAD 770ea6b). `git rev-list 16099f6..main` = 0, so the
branch contains main's tip — accept box 1 is satisfied.

MINOR findings (no BLOCKER or MAJOR):

src/sim/spawner.js:25 — `buildSpawnTable(CONFIG)` leans on the new default
parameter `level = buildLevel(cfg)` (src/pure/generator.js:250), so the
six-face boot builds a SECOND complete level (445 columns, 62 platforms,
~9.3 ms measured) and throws it away, even though this module already imports
from './level.js' (`groundTopAt`) and could pass `levelData` for free. Beyond
the boot cost it leaves a latent coupling: the station rows' `deck` heights
come from a different level object than the one the player runs on. Safe today
only because 'T-009: the lattice is deterministic across builds' asserts the
two builds agree.

src/pure/lattice.js:193 — `latticeSurfacesAt` is exported and called by
nothing: not the runtime, not tools/pathcheck.mjs, not internally
(`latticeBands` does its own scan). Dead export.

src/pure/lattice.js:144 + tools/pathcheck.mjs:6728 — the "measured retreat"
invariant is arithmetic over an assumed constant (`entryEdgeMarginTiles: 14`)
rather than a measurement of the daylight the shipped six-face follow camera
actually grants at each pocket; as written the assertion cannot fail unless
someone edits the constant. The traversal fixture already has the stronger
form (tools/pathcheck.mjs:731 checks its pocket timing against a camera-derived
`portraitWidth`), and T-009's own headless full-run child drives the real sim
and could sample `sLeftEdge()` at each pocket. The comment is honest that 14 is
a hand-picked worst-case floor, so this is a strength gap, not a false claim.

src/pure/lattice.js:256 — "the approach deck adopts the incoming column's own
height so the entry seam is flat" is not always true: `deckY` is clamped by
`deckMin: 3`, so pockets f1/f3/f5 step UP one tile at x0 (incoming 2 → deck 3),
and f2/f6 begin immediately after a pre-existing chunk-stream chasm (incoming
column is GAP). Behaviour is safe — the 6-column approach exists for exactly
this, the across-gap delta stays <= 1, and the real-sim policy never falls in a
pocket — but the header comment overstates what the code guarantees.

src/mode.js:103 — `IS_G1` keeps the experiment's name while its meaning
inverted to "static-anatomy reveal, default on". The deferral is deliberate and
documented (five importers, three owned by other lanes this cycle), but it
leaves `HB.g1`, `?g1=0`, and five call sites named after a flag that no longer
selects anything. Worth a follow-up rename task once the lanes quiesce.

Verified clean:
- pathcheck run in the worktree: 1448 passed, 0 failed (2.3 s). main measures
  1398 — +50 assertions, none deleted. The only two rewritten assertions are the
  deliberate shape re-pin (49 -> 62 platforms, chunkLog still 59) and the
  fingerprint re-pin (cc6afd7c -> dad96774), both with the reasoning written in
  place. No playtest script retimed; the one script added is new.
- Layer purity: src/pure/lattice.js imports only './path.js'; no THREE, no
  document/window, no upward import. The static guard enumerates src/pure/*.js
  via readdirSync (tools/pathcheck.mjs:145), so the new file is genuinely
  covered, not merely unlisted.
- Determinism: no Math.random / Date.now / performance.now in the new pure code;
  the lattice consumes no rng (hash-of-column variation), so the seeded chunk
  stream is bit-identical (59 chunks); cross-build determinism asserted; sim
  stays 2D (s, y).
- Judged content untouched: I diffed `buildTraversalLevel` against a pristine
  main tree. The first differing ground column is 103; the fixture band [24, 79)
  and the whole slice play window (endScroll 73, right edge ~99) are
  byte-identical, and every platform difference is at x >= 103. Pre-existing
  generator invariants still hold over the carved terrain (adjacent step <= 2,
  across-gap delta <= 1, corner aprons flat at 3, intro/tail flat).
- Verdict compliance: decisions.md entry 3 satisfied (anatomy never assembles;
  limb.js still cannot be animated, asserted at source level); its addendum
  satisfied (zipper still written, still installed via installView, still
  reachable at ?zip=1, asserted by a child-process mode probe over '', '?zip=1',
  '?g1=0', '?slice=traversal'); entry 6 satisfied by placement, not stats — no
  hound tuning value changed; ?hook=1 untouched; src/config.js not in the diff at
  all, so the frozen jump/movement constants are unchanged.
- The `gating` per-row opt-out is a real sim change and is asserted behaviourally
  through the actual gate runtime, WITH a control (a default-gating hound still
  holds the gate) — not just geometry. HUD and wavegate now agree on `e.gating`
  and no code path pushes a hostile that bypasses spawnHostile.
- Perf: all lattice work is build-time (9.3 ms); nothing new runs per frame; the
  limb bake is one instanced draw per material (~12), unchanged by this task; the
  six persistent pocket capsules are cleared on every resetGame.
- Hygiene: no new runtime deps, no build step, no OSTK artifacts; README,
  DESIGN.md and HANDOFF.md updated to match the flipped default; the new
  six-face-full-run.json carries its where-it-stops-and-why note inline,
  including the A/B against pristine main.

Operator questions (not gate conditions):
- The static-anatomy limb reveal now ships as the DEFAULT while it has still
  never been operator-judged (HANDOFF.md says so plainly, checkpoint queued).
  decisions.md entry 3 + entry 8 support shipping it now with ?zip=1 as the
  escape hatch, and the task block mandates it — but the "is this the right
  reveal" call is the operator's.
- Six pocket weapon capsules per run changes the default run's weapon economy,
  which was previously carrier drops only.
- Pocket f2's exit seam steps +2 immediately past the landing the station
  patrols (x 111-116) — legal and crossable, but a readability/feel question.

Not verified by this gate (playtester's): mid-route + transform-slice runs and
?selftest=1 in a browser.
