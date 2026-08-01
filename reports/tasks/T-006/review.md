APPROVE

T-006 — rib-run authored-slope prototype (?ribrun=1). All four acceptance
bullets are met: the flag is off by default and ACTIVE_SLICE resolves
byte-identically without it (asserted), no new input or verb is added, the
slope contract + reachability are asserted both arithmetically and through
the real sim loop at 60Hz/30Hz/the 0.05 s dt clamp, and the RIB RUN vs FLOW
operator packet is queued in SPRINT.md with URLs and five questions. Layer
purity, determinism, frozen movement constants, static-anatomy rule and the
inert ?hook=1 prototype are all respected. Findings below are MINOR only.

MINOR findings, most severe first:

- src/pure/ribrun.js:186 — `ribrunCatchStep`'s "fastest legal crossing starts
  from the lip itself" is not the true worst case. A body that jumped from
  the lower deck can descend past lip height while still short of the face
  (apex 3.24 vs riser 2, i.e. 1.24 tiles above the lip) and reach the top of
  the catch band at ~17.4 t/s, i.e. 0.87 tiles in one 0.05 s frame — wider
  than the 0.84-tile band. Consequently tools/pathcheck.mjs:3173's message
  ("a body pinned to the face cannot step over that band in one clamped
  frame") proves something narrower than it claims. No gameplay defect: the
  documented tier-4 wall slide covers the skipped case. Either bound the
  step from the jump apex or reword the assertion to what it establishes.

- tools/playtest/scripts/ribrun-climb.json:3 — the description's measured
  figures ("94-97% of the pass airborne ... 7-8 jumps, air jump never
  spent") come from pathcheck's reactive jump-on-contact policy, not from
  this script's 640 ms metronome, and are stated where a reader takes them
  as this script's expectations. The script's own browser run (verified
  here: completed, 4.4 s PLAYING, 0 falls, 0 setbacks, 0 console/page
  errors) is 84% airborne and spends 1 air jump — the victory panel prints
  "1 air jumps". Restate the expectations from a run of this script so the
  playtest gate is not judged against a mismatched baseline.

- src/mode.js:53 — "Not composed with ?hound=/?polyp=/?hook=" is a comment,
  not enforced behavior. `hostileFree` only zeroes the pace roster
  (src/pure/traversal.js:606); `traversalEnemyPlan` still composes hound and
  polyp stage rows onto that empty base (src/pure/traversal.js:883), so
  ?ribrun=1&hound=2 fields lattice-authored hounds against rib geometry, and
  ?ribrun=1&hook=1 keeps the inherited lattice anchors. Nothing crashes
  (selftest PASS on that URL), and none of these combinations appear in the
  operator packet — but the guarantee should be a gate or an assertion
  rather than prose.

- docs/HANDOFF.md:31 — a new entry point ships while HANDOFF (also :214,
  :377) and docs/DESIGN.md:150 still describe FLOW as the movement lane's
  only live candidate and do not list ?ribrun=1. CLAUDE.md's docs DoD asks
  HANDOFF/DESIGN to stay truthful when entry points change; SPRINT.md's
  packet does carry the URLs, so this is drift, not a contradiction.

Operator questions (not blockers, feel is out of my scope): the packet's
question 1 is the right one — the built rib reads on screen as a stepped
staircase of decks, and whether that is "a long straight up a ribline" is
the operator's call. Also note the acceptance run's closest damage-edge
margin is 35.4 tiles, so on a clean pass the pursuing edge supplies no
felt pressure; the packet's "the pursuing edge is the pressure" only bites
after a stall.

Verified: `node tools/pathcheck.mjs` in the worktree — 832 passed, 0 failed
(main: 775/0, so +57 assertions and none removed or weakened); browser
SELFTEST PASS (19 checks) on ?ribrun=1, &flow=1, &pace=surge, &hound=2 and
on the unflagged traversal slice; `node run.mjs scripts/ribrun-climb.json
--deterministic` → outcome completed, 0 consoleErrors, 0 pageErrors. No new
runtime deps, no build step, no OSTK artifacts, diff confined to the task's
lane (7 files).
