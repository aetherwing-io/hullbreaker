PASS

# T-004 playtest gate — Iris Polyp v1 (`?polyp=1` / `?polyp=2`)

Worktree under test: `.claude/worktrees/T-004` at `32df995`, pinned via
`python3 -m http.server 8773 --directory .claude/worktrees/T-004` (killed
after the runs). Smoke set ran with the MAIN checkout's harness; the four
polyp acceptance scripts ran with the worktree's harness copy because they
use the `polypTell`/`polypFire`/`polypOpen` policy predicates committed in
this same branch (main's `lib/policy.mjs` predates them) — this also pins
the route-fixture import to the served commit per README limitation #3.
All runs `--deterministic`, zero bootErrors, zero retries needed, zero
console/page errors in every report.

## Runs (commands + evidence)

Smoke (main harness, from `tools/playtest/`):

```
node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000 --base-url http://127.0.0.1:8773 --out runs/gate-T-004-mid
node run.mjs scripts/transform-slice.json --deterministic --max-runtime-ms 20000 --base-url http://127.0.0.1:8773 --out runs/gate-T-004-transform
```

- `runs/gate-T-004-mid/report.json` — exit 0, `"result": "completed"`,
  idle fraction 0.024, minEdgeMargin **35.44** (exactly the deterministic
  demo baseline — no regression), protoScore 85, hostiles: wasp only
  (**no polyp in the default slice — flag verified off by default**).
- `runs/gate-T-004-transform/report.json` — exit 0, `"result": "completed"`,
  idle 0, route `[mid-catwalk, wall-launch]`, no polyp present.

Polyp acceptance (worktree harness, same pinned server; outputs in the
main checkout):

```
node run.mjs scripts/polyp-lane-dodge.json  --deterministic --max-runtime-ms 20000 --base-url http://127.0.0.1:8773 --out <main>/tools/playtest/runs/gate-T-004-polyp-lane-dodge
node run.mjs scripts/polyp-facetank.json    --deterministic --max-runtime-ms 20000 --base-url http://127.0.0.1:8773 --out <main>/tools/playtest/runs/gate-T-004-polyp-facetank
node run.mjs scripts/polyp-vent-kill.json   --deterministic --max-runtime-ms 20000 --base-url http://127.0.0.1:8773 --out <main>/tools/playtest/runs/gate-T-004-polyp-vent-kill
node run.mjs scripts/polyp-combo-stack.json --deterministic --max-runtime-ms 20000 --base-url http://127.0.0.1:8773 --out <main>/tools/playtest/runs/gate-T-004-polyp-combo-stack
```

Every script reproduced the builder's committed expectation on the first
try, verified from my own traces (not the builder's committed ones):

- **lane-dodge** (movement answer): completed, kills 0, hp 3, 0 hits.
  Both parked-cycle `fire` onsets (gameMs 4010, 7752) found the bot at
  y=3.0 — deck below the band — so the beam swept an empty lane twice.
  The tell → reaction window → movement answer loop works.
- **facetank** (cost): stalled-by-design, 2 hp-pip drops (3→2→1) at the
  first two volleys, third volley emptied into the slice's HULL FALLBACK
  (hp restored, final hp 3). Eating the beam costs exactly one point per
  cycle — placement prices the lane, no damage inflation.
- **vent-kill** (target priority / opening): completed, kills 1, hp 2.
  Fire held from 0.1s; polyp survived the entire closed/tell spray
  (armour pings) and died between gameMs 4707–4789, inside `vent` — the
  kill only lands during the opening, DESIGN's rule, measured.
- **combo-stack** (`?polyp=2`, two-enemy stage): completed, kills 0,
  hp 1, 2 hits. Trace shows both threats fully engaged in one run:
  polyp closed/tell/fire/vent (159/159 samples present) AND hound
  prowl/tell/charge/skid — the regression signal (either enemy absent)
  did not occur.

Full iris cycle observed in every polyp trace (closed→tell→fire→vent);
`policy.missingFieldWarnings` empty in all four runs.

## Screenshots judged

Three purpose-built captures (facetank policy with the stop time landing
on a chosen iris state; capture scripts in the session scratchpad, runs
committed under `tools/playtest/runs/`):

- `runs/gate-T-004-cap-tell-approach/screenshot.png` — early tell, bot
  approaching (x=56.6).
- `runs/gate-T-004-cap-tell-parked/screenshot.png` — late tell, bot
  parked in the lane.
- `runs/gate-T-004-cap-fire-parked/screenshot.png` — live beam, bot
  inside it.
- Plus the four acceptance-run end screenshots (`runs/gate-T-004-polyp-*/screenshot.png`).

What I judged, per standing orders:

1. **FAR readability (default view):** RIG measures ≈4% of screen height
   — inside board 13's 3–5% invariant. The polyp's tell is a two-stage
   escalation: acid-green faceted bulb dilates to a pale/bone fully-open
   iris well before fire; the pale phase is the highest-contrast object
   on screen at FAR and unmistakable. The live beam renders as a bright
   acid-yellow band across the whole locked lane — the denied band is
   instantly legible. The first ~300ms of tell (small notch in a green
   bulb) is subtle at FAR; the pale phase carries the read (S3 note
   filed, folds into T-003's already-queued FAR-tells pass).
2. **Style vs `docs/concept-art/`:** form language matches board 06's
   center-column Iris Polyp (rooted stalk + pod + iris aperture, enemy
   acid-green glow role) and directly implements board 07's "needs a
   more side-facing barrel" note — the barrel visibly points down the
   lane it locks. Magenta pickup role preserved in-frame. Full palette
   (teal/rust) is T-010's lane, not this task's.
3. **No assembling anatomy:** the polyp is a rooted, static emplacement;
   no world geometry moves, assembles, or slams in any screenshot or
   trace — decisions.md entry 3 holds.
4. **Glitches/pacing:** none seen — no z-fighting, stray geometry, or
   dead spots; victory overlays render correct stats. Thin floating
   catwalk lines are the pre-existing greybox slice baseline (visible in
   pre-T-004 captures too), not a T-004 regression — noted, not filed.

## Extra evidence

- `node tools/pathcheck.mjs` in the worktree: exit 0, **681 passed, 0
  failed** (includes the branch's new polyp assertions).
- Builder's evidence README (`reports/tasks/T-004/evidence/README.md` in
  the worktree) cross-checked against my independent runs: every claimed
  number reproduced (outcomes, hp arithmetic, empty-lane fires,
  open-state kill, both-enemies-engaged).
- Operator feel packet: 5 questions + exact URLs are staged in that same
  evidence README, ready to lift into SPRINT's checkpoint queue at merge
  — fun is correctly routed to the operator, not self-judged.

## Feel observations routed to the operator (not judged here)

The builder's five questions cover what I would have asked; I add one:
at FAR, the beam's ~450ms fire window plus the 800ms tell reads generous
against a parked bot — whether the *rhythm* (1.6s cooldown, 3.75s cycle)
feels like pressure or like a metronome is an operator call
(builder's Q1/Q3 adjacent).

Verdict: PASS — all machine gates green, acceptance evidence reproduced
independently, no S1/S2 defects found. One S3 art note filed to the
Inbox (early-tell contrast at FAR → T-003 scope).
