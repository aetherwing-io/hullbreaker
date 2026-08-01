# HULLBREAKER — fleet plan (multi-agent mechanics push)

Prepared July 29, 2026 by the integration session, from an operator interview.
This is the working brief for a roughly ten-agent fleet continuing mechanics
and playtesting work. It is subordinate to [`DESIGN.md`](DESIGN.md) (target
experience) and [`STORY.md`](STORY.md) (canon). [`HANDOFF.md`](HANDOFF.md)
remains the brief for solo sessions; this plan governs the fleet push only.

Since July 31 the orchestrated **wave-4** push is governed day-to-day by the
root [`CLAUDE.md`](../CLAUDE.md) (hard rules + integrator loop protocol) and
[`SPRINT.md`](../SPRINT.md) (live queue); this plan remains the mission brief
and the operator-verdict record (see the July 31 delivery mandate below,
recorded as [`decisions.md`](decisions.md) entry 8, and
[`ORCHESTRATION.md`](ORCHESTRATION.md) for the scaffold).

## Mission

The traversal slice proved the spatial grammar and failed the pacing test.
The operator's verdict on the first playable: **boring — the shape is right,
the intensity is far off.** The fleet exists to close that gap:

1. Make the core traversal-combat loop intense enough that the operator
   voluntarily replays it.
2. Prove the next grammar pieces: houndframe floor pressure, and the bulkhead
   flip / breach return with unmistakable altitude gain.
3. Define the game's score and setback identity (see decisions below).
4. Build the machinery that lets agents iterate and *measure* pace: the module
   split and a bot-player playtest harness.

**Mission update (July 31, `decisions.md` entry 8):** the diagnostic phase is
closed enough that the target is now **delivery** — a playable version of the
full run with AAA-studio-level polish; the fleet refines and loops until
delivered (`SPRINT.md`'s "Delivery target" is the working definition of done)
rather than pausing between checkpoint verdicts.

## Operator decisions on record

### July 31 — delivery mandate: autonomous merges, asset lane, loop until delivered

- **Mission:** the target is a playable version of the full run with
  AAA-studio-level polish; refine as necessary and loop until delivered.
  Operator verbatim: "it can merge autonomously, with agent review. the
  agents can use the codex cli to generate sprites/assets as needed and you
  can prune the old worktrees. I want to get to a playable version with AAA
  studio level polish. Refine as necessary, and loop until delivered."
- **Autonomous merges:** the integrator merges without per-merge operator
  confirmation; the authority is the gate stack — agent review + bot
  playtest + `tools/orch/merge-task.sh`, the only path to `main`.
- **Asset lane opened:** agents may use the codex CLI (`codex exec`,
  installed locally) to generate sprites/assets as delivery requires —
  releasing this plan's "juice/audio/final art deferred" fence to that
  extent (see "Out of scope" below).
- **Six-face integration hold released:** the July 29 "no six-face
  integration yet" ruling is released — integration proceeds, with a
  checkpoint packet posted for judgment rather than blocking on one.
- **The operator remains the only fun oracle.** Checkpoint packets keep
  queueing in `SPRINT.md` and verdicts still land in `decisions.md`; work no
  longer blocks on them. Entries 1–7 all stand.
- Housekeeping: the stale wave-1 worktrees under `/private/tmp/hullbreaker-*`
  were pruned (their unmerged `agent/traversal-*` branch refs remain for the
  operator to delete).
- Recorded as [`decisions.md`](decisions.md) entry 8. The wave-4 scaffold it
  shipped with (root `CLAUDE.md`, `SPRINT.md`, `.claude/agents/` incl.
  `asset-artist`, Stop-hook flywheel, merge gate) is documented in
  [`ORCHESTRATION.md`](ORCHESTRATION.md).

### July 30 — CP1 verdict and the wave-3 pivot: build toward the renders

- **CP1:** hunt, swarm, and surge all read as "directionally correct" versus
  base. No single winner was picked; keep all three paces while mechanics
  evolve, consolidate later.
- **Mission pivot, operator verbatim:** "stop hunting boring, let's start
  working toward the kinds of mechanics that need to be tested to better hit
  the feel of the concept arts." The diagnostic phase is over. The target is
  the movement fantasy visible in the boards (01/03/08/10/11/12): a small,
  human-scale RIG running and bounding up colossal creature machinery —
  tether/hook dangles and launches, long rib-line runs, chained launches,
  riding transforming surfaces, vent bursts.
- **Wave 3 lanes:** movement-verb prototypes (snap hook/tether first — it
  appears throughout the art and is DESIGN's open decision; plus
  generalizing surge's chained-launch momentum), a view-scale experiment
  (smaller RIG relative to the world), continuing CP2 (houndframe) and CP3
  (transformation), and the in-flight CP1 defect fixes (fallback
  self-defeat, crush wall-grind). The roof-contest decision folds into CP2+.

### July 30 — movement verdict: hook v1 rejected

- Operator: "i didn't particularly like the hooking implementation."
  Diagnosis (operator-selected): anchors/placement — "specific anchors is
  too on the nose maybe" — and the input: "the hook doesn't add anything
  but an extra button press and confusion."
- Notably NOT selected: "wrong verb entirely." A tether is not banned from
  the movement language; THIS shape (authored bracket-marked anchor points +
  a dedicated button) is rejected.
- Disposition: ?hook=1 stays in the tree as an inert, off-by-default
  prototype but receives no further investment. Any future tether must be
  marker-less and button-less — emerging from the world and context, not
  from authored points the player services. The movement lane's live
  candidates are now FLOW (?flow=1, still unjudged) and the authored-slope
  rib-run (costed, not started).

### July 30 — CP2.5 verdict: "enemies feel like they are coming for me"

- Operator on the CP2.5 merge (ownership placement, roof contest, commit
  coil): "yes, this is much better, enemies feel like they are coming for
  me." The placement-over-stats doctrine is validated; hound 2.5 is the
  working baseline going forward.
- Still open from the CP2.5 question set (no verdict yet): crouch vs
  aim-assist (keep one/both/neither), commit-coil dodge-timing feel, and
  whether the roof still reads as a free ride. Also still open: the five
  movement-verb questions (hook feel, auto vs key, hook-costs-pressure,
  flow legibility, anchor density).
- p6 metronome-hop surviving surge at 2.5-tile margins is accepted-for-now
  (integrator judgment, adversarial concurring); operator feel can overturn.

### July 30 — view-scale verdict: FAR is the default; bullets don't turn corners

- Operator: "far feels right." FAR (RIG ≈ 3.7% of screen height, matching
  board 13's 3–5% range) becomes the DEFAULT view; near/mid stay available
  via ?view=. The known readability cost (capsule glyphs, wasp tells at
  distance) is accepted for now with a follow-up: scale tells/glyphs up as
  an art/readability pass rather than keeping RIG large.
- Operator: "the only feedback is that projectiles also curve around
  corners." Ruling: projectiles must NOT visibly follow the world-ribbon
  around bends/corners. Fix: shots reaching a bend boundary leave the
  surface on the face tangent and fade/cull — sim culls them at the bend so
  visuals and hitboxes agree (no shooting around limbs; removes cross-corner
  sniping). Applies to hex corners and transform bends alike.

### July 30 — CP2 verdict: houndframe lands; iterate from "hound 2.5"

- Operator on the hound stages: "those feel much better." Iterate from
  roughly **hound 2.5** — stage 3 (mix) was "a little busy"; the sweet spot
  is above stage 2's clean squeeze, below the full pace roster + hounds.
- **A lone hound poses no threat** — placement/layout iteration needed
  (chokepoints, patrol spans on routes the player actually needs), not stat
  buffs.
- "Walls are a little too tight with the pace at times, so I sort of feel
  invincible going through walls, running past enemies." Two threads:
  (a) the through-walls invincibility is the KNOWN crush wall-clip defect
  already in a fix cycle — re-judge wall tightness only after it merges;
  (b) "running past enemies... might be viable paths to play in the future"
  — noted as a design seed: evasion as a legitimate scored playstyle later,
  but it must be a choice, not a physics accident.
- **8-way aim is insufficient against low targets**: "sometimes I have to
  try and jump (may add crouch?) but sometimes I'm lined up to shoot and
  safe and can't quite get the projectiles to the target." Prototype
  candidates: crouch (lowers firing line + hitbox) and/or light projectile
  aim-assist — A/B-able flags, operator judges.

### July 30 — CP3 verdict: transitions must read as ascent around static anatomy

- CP3 first pass: "much more aligned to the feel, but the transitions a
  little too choppy... it sort of looks like all of the assets are being
  thrown together and smack into place, instead of the transition being a
  smooth, chonky, reveal."
- Clarifying ruling, operator verbatim: "it should read like the RIG is
  running up around a monstrous leg, ascending the monster."
- Transformation grammar consequence: the creature's anatomy is monumental
  and STATIC during transitions; RIG (and the camera) are what move. The
  next stretch of world pre-exists and is revealed by the view rotating
  around the limb plus natural self-occlusion and fog — never by geometry
  assembling, slamming, or articulating into place. Chunky two-snap detents
  live in the camera's ratchet curve, not in asset arrival. Doors/vent
  covers may move; body parts do not assemble. Sim-side inert-until-crossed
  gating stays (determinism/gameplay); render-side the upcoming band must be
  pre-built wherever sightlines could expose it.
- Addendum (operator): the "zip" assembly mechanic is retired from world
  transitions but RETAINED in the toolbox — "may be something we bring back
  for traps that assemble or different enemies that are presented later."
  Emerging visual-language rule: the creature's body never assembles; things
  the ship BUILDS (traps, emplacements, later defenders) do. Assembly reads
  as hostile activity, not as the world. Keep the zipper choreography code
  extractable rather than deleting it outright.

### July 30 — the Meridian is a creature (canon + visual direction)

- The *Meridian* IS a colossal machine-creature, and the sterilization fiction
  is an immune response: the ship-beast is trying to exterminate an
  infection. This harmonizes with (rather than replaces) the existing
  defense-state ladder, which already reads as immune escalation.
- Of the creature boards (docs/concept-art/09–12), the operator endorses the
  directions in 10/11/12 over 09's straight portraits; the anthology (12) has
  two flagged flaws: the player figure is drawn too large, and there is not
  enough variation. Operator feedback to the artist, verbatim:
  > "imagine a small frame of the player at human scale, running and bounding
  > up the machinery (in the side scroller format we've been discussing) the
  > lore is that the player is climbing the monster, so the '60 degree bends'
  > and gate breaches are 'turns' around the leg, or a long straight up a
  > ribline, flipping indoor through the neck, back out of some vent up
  > higher."
- **Gameplay is unchanged.** The mapping is fiction-level: corner ritual =
  turning around a limb; a face/wave = a long straight up a ribline; bulkhead
  flip = entering through the neck; breach return = emerging from a vent
  visibly higher. The 2D `(s, y)` sim and polyline mapping are form-agnostic
  by design; the pivot lands in path data, render form-language, palette, and
  naming — not in mechanics, enemies, weapons, score, or harness.
- Player scale note for later: "player still too large" is art feedback today,
  but implies a future camera/world-scale question (smaller RIG relative to
  the world = more world per screen).

### July 29 interview

- **Feel verdict:** first slice pass was boring. Machine checks passing is not
  the gate; the operator's replay desire is.
- **No six-face integration yet.** Iterate in fixtures until the operator
  approves the feel. Integrating a boring grammar multiplies it by six.
- **Genre target:** a mashup between authored cinematic ascent and arcade
  score attack — potentially a defining hybrid. A movement-driven score/
  momentum system is the leading concrete expression of this.
- **Death/setback: unresolved, and stock answers are unwanted.** The operator
  explicitly does not want retreads of lives/checkpoints. Seed directions:
  phase fallback (losing sends you down the tower, not to a menu), the
  *Meridian* dynamically repairing or blocking routes as the setback, other
  dynamic world-driven consequences. The fleet proposes; the operator picks.
- **Excitement priority:** bulkhead flip / breach return with visible
  altitude.
- **Juice and audio: deferred** until mechanics are locked. Caveat on record:
  some perceived intensity *is* feedback, so before condemning a mechanic as
  unfun, re-ask the question once baseline feedback exists.
- **Keep three.js.** The sim is renderer-thin pure 2D; the renderer is not
  the bottleneck and instancing covers the projected load.
- **Begin splitting `index.html` into ES modules.** Parallel agent work on
  one 2,550-line file is not viable.
- Roughly ten agents; the operator is the only fun oracle and reviews at the
  checkpoints below.

## Current state (snapshot at the wave-1→2 boundary; `SPRINT.md` and `HANDOFF.md` carry the live state)

- Traversal slice at `index.html?slice=traversal` (add `&enemies=0` to tune
  movement without wasps): authored fixture, six named routes, ledge catch,
  wall grab/slide/jump, chimney, dare pocket with measured retreat timing,
  fast retry, slice stats.
- `15f66d2` already responded to the boring verdict: camera follows forward
  motion instead of pinning RIG, stronger/crisper jumps, launch-on-contact,
  grab dwell capped at 240/300ms, minimum scroll 2.6, target pass time cut to
  4–12s. Since judged at CP1 (see "CP1 verdict and the wave-3 pivot" above):
  all variants read as directionally correct, none was crowned.
- Module split merged as `5e9dbc8`: `index.html` is a shell over 35 ES
  modules (`src/config.js` → `src/pure/` → `src/sim/` → `src/render/`+
  `src/ui/` → `src/main.js`), sim layer free of DOM/THREE behind
  `src/sim/bridge.js` hooks. Gates passed: pathcheck 178/178 (now
  import-based, layer purity statically guarded), browser selftest PASS ×3,
  harness demo metrics unchanged within noise. Code review: no BLOCKER/MAJOR
  findings; two MINOR doc notes (camera→`setEdges` writes sim state outside
  the bridge — pre-existing coupling; zipper force-lock is a second,
  idempotent `updateZipper` call site).
- Bot-player harness at `tools/playtest/` (see its README): scripted
  keyboard runs against real Chrome, sampling the `?testapi=1` telemetry
  hook; metrics include idle fraction, closest crush margin, and protoScore
  per the proposal doc's Appendix A.5.
- Score/setback proposals at `docs/proposals/2026-07-score-and-setback.md`.

## Diagnosis of "boring" (for all agents)

1. **Pursuit clock too soft** — with weak scroll pressure there are no timed
   decisions, just optional geometry.
2. **Uncontested routes** — two wasps across the whole slice; route choice
   only matters when routes carry different threats.
3. **Verbs paused the player** — long grab dwell contradicted "every grab
   wants to become another launch." (Partially addressed in `15f66d2`.)
4. **No stakes differential** — besides the dare pocket, no route is faster,
   safer, or better armed than another.

Intensity comes from pressure, contested space, and route stakes — not from
content volume, and (for now, per operator) not from juice.

## Fleet roster and waves

Integrator (main session): merges, gates, dispatch, operator communication.

### Wave 1 — dispatched immediately

| Agent | Model | Lane |
| --- | --- | --- |
| `splitter` | Opus | Zero-behavior-change split of `index.html` into ES modules; port pathcheck from regex extraction to imports; expose `window.HB` debug handle for the harness. Works in an isolated worktree. |
| `score-designer` | Opus | Proposal doc: movement-driven score/momentum system for the ascent×score-attack mashup, plus 4–6 novel death/setback proposals per the operator's seed directions. New files under `docs/proposals/` only. |
| `harness-engineer` | Sonnet | Bot-player playtest harness under `tools/playtest/` (dev-only deps allowed there): scripted input runs in a real browser, metrics report (idle time, route coverage, closest crush approach, input density), example scripts. New files only. |

### Wave 2 — after the split integrates

| Agent | Model | Lane |
| --- | --- | --- |
| `intensity` | Opus | Continue the pacing overhaul from `15f66d2`: pressure, route stakes, enemy density; ship 2–3 sharply different variants behind query params for CP1. |
| `combat` | Opus | Houndframe alone → houndframe+wasp combination in the slice, per DESIGN's teach-then-combine rule. |
| `transformation` | Opus | Bulkhead flip inward + breach return + rendered altitude gain, as its own fixture/slice. |
| `adversarial` | Opus | Break fun and fairness: degenerate strategies (hold-right-and-ignore-the-lattice), softlocks, unfair crushes, dare-pocket cheese. Findings filed as reproducible bot scripts. |
| `physics-reviewer` | Sonnet | Collision edges, determinism, tunneling, aspect-ratio traps; owns pathcheck growth. |
| `code-reviewer` | Sonnet | Reviews every integration for conventions, perf (instancing, per-frame allocations), and readability. |
| `docs` | Sonnet | Keeps DESIGN/HANDOFF/README truthful as decisions land; maintains the decision and checkpoint log. |

### Waves 3–4

Wave 3 (movement verbs + view scale) ran from the CP1 pivot; its verdicts are
recorded above and in `decisions.md` entries 5–7. The **wave-4 delivery
push** (July 31) moved the live roster to `.claude/agents/` and the live lane
assignments to `SPRINT.md`'s queue — the tables above are the historical
wave-1/2 roster, not current assignments.

## Integration protocol

- Builders work in **isolated git worktrees**. Only the integrator merges to
  `main`, one runtime change at a time.
- Merge gates: `node tools/pathcheck.mjs` green; browser self-test
  (`?selftest=1`) green; code review for runtime changes; docs updated when
  behavior or entry points change.
- Since wave 4, merges are **autonomous** (`decisions.md` entry 8) and
  mechanical: `tools/orch/merge-task.sh <task-id>` is the only path to
  `main` — it enforces reviewer APPROVE + playtester PASS + pathcheck in the
  worktree + a deterministic smoke run before merging, and re-runs pathcheck
  post-merge with auto-revert on failure.
- Lanes are disjoint. Do not edit files outside your assignment; request
  integration through the integrator for cross-lane needs.
- Tuning constants stay in config modules. New deterministic layout or
  choreography logic goes in `src/pure/` with harness assertions.
- Seeded determinism and the strict 2D `(s, y)` simulation are non-negotiable.
- **This is not an OSTK repository.** Do not initialize, boot, or introduce
  OSTK files or workflow.
- No new runtime dependencies. Dev-only dependencies are allowed under
  `tools/` with their own `package.json`.

## Operator checkpoints

Originally the only points that blocked on the operator; since the July 31
delivery mandate (entry 8) they no longer block the loop at all — packets
queue in `SPRINT.md`'s checkpoint queue and work continues, while the
verdicts still land in `decisions.md` and remain law.

- **CP1 — pace.** Play the accelerated slice and the intensity variants;
  pick or direct a blend. Also confirms the module split changed nothing.
- **CP2 — houndframe** in the slice: does floor pressure make the verbs
  matter?
- **CP3 — bulkhead flip + altitude:** does the climb feel real?
- **CP4 — scored run + setback prototype:** does the mashup identity land?

At each checkpoint the integrator posts the exact URLs to play and three-to-
five questions drawn from DESIGN's playtest list.

## Out of scope for this push

As written July 29: juice/audio, six-face lattice integration, snap hook,
traps, the Crown finale, flight, menus, final art, and any canon-locking of
open story questions.

Since then, on record: snap hook was pulled into scope by the wave-3 pivot,
built, and rejected in its v1 shape (entries 2 and 5); the July 31 delivery
mandate (entry 8) released the juice/audio/final-art fence and the six-face
integration hold — `SPRINT.md`'s delivery target now covers juice, audio,
the palette/art pass, the game shell (menus), and six-face integration.
Still out of scope: traps, flight, and canon-locking of open story
questions; the Crown finale remains in `DESIGN.md`'s sequence but is not yet
queued.

## Agent reporting format

Every completion report includes: what changed and why; every verification
command and its result; open feel questions for the operator; exact worktree
path and branch; and the single best next action.
