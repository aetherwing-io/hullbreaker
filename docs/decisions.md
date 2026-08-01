# HULLBREAKER — decision log

A dated log of operator and canon-level decisions as they land. Each entry
records the decision, why it was made, where it came from, and what it
supersedes. This is a log, not a design document — `DESIGN.md`, `STORY.md`,
and `HANDOFF.md` remain authoritative for current state; this file exists so a
new agent can see *why* something in those documents reads the way it does
without archaeology through commit history.

Entries are numbered in landing order. Backfilled entries (0a, 0b) are kept
lean since they predate this log; entries from here on should be written the
day the decision lands.

## 0a — 2026-07-29 — Fleet push: feel verdict, genre target, and scope

**Decision:** the first traversal-slice playtest verdict was "boring — the
shape is right, the intensity is far off." In response: no six-face
integration until the operator approves the feel; the genre target is a
mashup of authored cinematic ascent and arcade score attack; death/setback
design should avoid lives-and-checkpoints retreads; `index.html` splits into
ES modules to make parallel agent work viable; keep three.js (the sim is
renderer-thin 2D, not the bottleneck); roughly ten agents work the mechanics
push under an integrator.

**Rationale:** machine checks passing is not the fun gate — the operator's
replay desire is. A boring grammar multiplied across six faces is six times
the problem.

**Source:** operator interview, July 29. Recorded in `FLEET-PLAN.md`.

**Supersedes:** `HANDOFF.md`'s original single-session "build the traversal
slice" objective (now built and in tuning — see `docs/decisions.md` entry 0b
and `HANDOFF.md`'s current status framing).

## 0b — 2026-07-29 — Concept-art macro-form ruling

**Decision:** the rectilinear, warehouse-heavy macro environment in concept
boards 1–5 and 8 was rejected as the ship's large-scale form, while their
palette, enemy readability, route logic, and transformation intent remain
useful. Corrected hierarchy: macro = one continent-sized floating creature-ship
silhouette; meso = anatomy (scutes, ribs, gills, vertebrae, joints, limbs,
tendon machinery) forming the traversal topology; local = colony-ship
infrastructure supplying seams, mechanisms, and readable play surfaces; Crown
= a real command/defense/transmitter complex, not a separate creature or head.

**Rationale:** the traversal lattice needs to feel grown from engineered
anatomy, not like scaffolding bolted onto a warehouse.

**Source:** operator feedback, July 29. Recorded in
`docs/concept-art/README.md`'s "Current art-direction ruling."

**Supersedes:** boards 1–5 and 8 as macro-form references (their other
qualities are unaffected). Foreshadows entry 1 below, which formalizes the
creature-ship as narrative canon rather than only visual direction.

## 1 — 2026-07-30 — The Meridian is a machine-creature; sterilization is its immune response

**Decision:** the *Meridian* IS a colossal machine-creature, not a
conventional ship with organic-looking dressing. Its sterilization procedure
is literally an immune response: the ship-beast exterminating a detected
infection. This is canon, not only visual direction. Of the creature concept
boards (`docs/concept-art/09-meridian-creature-directions.png` through
`12-kaiju-ship-level-anthology.png`), the operator endorses the directions in
`10-creature-lattice-chaos.png` and `11-creature-flip-breach-sequences.png`
over board `09`'s straight body-plan portraits, and endorses
`12-kaiju-ship-level-anthology.png`'s climb-route-anthology thinking without
canonizing its three-separate-kaiju-ships framing (`STORY.md`'s
single-*Meridian* premise stands). Two art-side flaws are flagged for the
artist: the player figure is drawn too large, and there isn't enough
variation. Operator, verbatim, on how this reframes existing mechanics without
changing them:

> "imagine a small frame of the player at human scale, running and bounding up
> the machinery (in the side scroller format we've been discussing) the lore
> is that the player is climbing the monster, so the '60 degree bends' and
> gate breaches are 'turns' around the leg, or a long straight up a ribline,
> flipping indoor through the neck, back out of some vent up higher."

**Rationale:** ties the player's moment-to-moment actions (corner turns,
bulkhead flips, breach returns) directly to the lore (climbing a living
antagonist) instead of leaving the fiction as a backdrop the mechanics don't
reference. It also harmonizes with, rather than replaces, the existing
Observe→Intercept→Contain→Quarantine→Sterilize→Scuttle defense-state ladder,
which already reads as immune escalation once named that way.

**What does not change:** gameplay, tuning, code identifiers, query params,
enemies, weapons, score design, and the harness are all untouched. The pivot
is fiction-level: naming, path/render form-language, and palette. The finale
contract also stands unchanged — the Crown is a command/defense/transmitter
system and place, not a body part or a detached creature-boss with a health
bar; the ship-creature's body is the world the player has been climbing the
whole run, not something waiting at the summit. The player-scale flag ("too
large") is art feedback today but implies a future camera/world-scale
question — smaller RIG relative to the world reads as more world per screen —
noted here as a seed for a later decision, not decided now.

**Source:** operator interview, July 30. Recorded in `FLEET-PLAN.md` (commit
`ed639d5`, "Record creature-Meridian canon decision in fleet plan"). Visual
grounding: `docs/concept-art/README.md`'s reference-image entries 9–12.

**Supersedes:** `STORY.md`'s and `DESIGN.md`'s prior "not a creature ... not a
literal heart monster" phrasing describing the Crown — both are reworded in
this pass to keep the Crown's "not a body-part boss" meaning while dropping
the now-inaccurate implication that the ship's body isn't a creature. Does
not supersede the single-*Meridian*, single-Crown story premise, or any
shipped mechanic.

## 2 — 2026-07-30 — CP1 verdict: no single winner, pivot from "hunt boring" to "build toward the renders"

**Decision:** checkpoint CP1 (judging the accelerated traversal-slice pacing
pass, `15f66d2`, plus the `intensity` agent's hunt/swarm/surge variants)
concluded with no single pace crowned a winner — all three read as
"directionally correct" versus the un-accelerated base. Rather than keep
consolidating pace in isolation, the operator pivoted the fleet's whole
mission: stop diagnosing "boring" and start building the specific movement
verbs the concept art promises. This opens a **wave 3**.

**Rationale, operator verbatim:** "stop hunting boring, let's start working
toward the kinds of mechanics that need to be tested to better hit the feel
of the concept arts." The diagnostic question (is the pacing intense enough)
is judged sufficiently answered — directionally, by all three variants — so
the more valuable question is now whether the shipped movement grammar can
deliver the specific fantasy already visible in boards 01/03/08/10/11/12: a
small, human-scale RIG running and bounding up colossal creature machinery —
tether/hook dangles and launches, long rib-line runs, chained launches,
riding transforming surfaces, vent bursts.

**Source:** operator interview, July 30. Recorded in `FLEET-PLAN.md` under
"CP1 verdict and the wave-3 pivot."

**What changes:** new wave-3 lanes — movement-verb prototypes (snap
hook/tether first, since it appears throughout the concept art and is one of
`DESIGN.md`'s open decisions; then generalizing `surge`'s chained-launch
momentum), a view-scale experiment (smaller RIG relative to the world), plus
the already-in-flight CP2 (houndframe) and CP3 (transformation) work and the
CP1 defect fixes already found (fallback self-defeat, crush wall-grind). Snap
hook — previously out of scope for this push — is now the lead wave-3
prototype; the roof-contest decision folds into CP2 and later.

**Supersedes:** `HANDOFF.md`'s and `DESIGN.md`'s framing of CP1 as still
pending the operator's judgment (both said "the operator has not yet judged
this accelerated pass") — reworded in this pass to record the verdict and the
pivot. Also supersedes `HANDOFF.md`'s "snap hook ... out of scope" line and
`DESIGN.md`'s "snap hook (later candidate)" framing, both annotated in this
pass rather than rewritten outright, since the underlying design question
(does it reuse jump/aim/fire or a dedicated input?) is still open — only its
priority changed. Does not supersede CP2, CP3, or CP4 as checkpoints; those
continue alongside wave 3.

## 3 — 2026-07-30 — CP3 verdict: transitions must read as ascent around static anatomy, not assembling geometry

**Decision:** the transformation slice's first pass (bulkhead flip, breach
return, rendered altitude — merged `738a890`, playable at `?slice=transform`)
was judged at checkpoint CP3. Verdict: directionally right, but the
transition choreography itself reads wrong. Fix, as an explicit rule for all
future world-transformation rendering: the creature's anatomy is monumental
and **static** during a transition — RIG and the camera are what move. The
next stretch of world already exists and is *revealed* (by the camera
rotating around a limb, plus natural self-occlusion and fog), never
*assembled*, slammed, or articulated into place.

**Rationale, operator verbatim:** on the first pass — "much more aligned to
the feel, but the transitions a little too choppy ... it sort of looks like
all of the assets are being thrown together and smack into place, instead of
the transition being a smooth, chonky, reveal." Clarifying ruling — "it
should read like the RIG is running up around a monstrous leg, ascending the
monster."

**What this changes, precisely:** the shipped hull-ratchet "brick-slam
zipper" (`docs/DESIGN.md`'s "The tower (corner waves)": next-face tile
columns dropping into place, staggered near-to-far, during the corner
ritual) is exactly the kind of geometry-assembling reveal this ruling now
calls out as choppy — it is not being torn out today, but it is flagged as
needing rework under the new rule, alongside the CP3 bulkhead-flip/breach
render work. Chunky two-snap detents stay, but live in the *camera's* ratchet
curve, not in asset arrival. Doors and vent covers may still move; body
parts (the anatomy itself) do not assemble. Sim-side, the inert-until-
crossed gating that keeps determinism and gameplay honest is unaffected —
this is a render-only rule. Render-side, the upcoming band must now be
pre-built wherever a sightline could expose it, rather than built lazily at
the transition.

**Addendum, same date — zip-assembly is retired from the world, not
deleted:** the operator, on the "zip" mechanic specifically: it "may be
something we bring back for traps that assemble or different enemies that
are presented later." The emerging rule is narrower than "no assembly
anywhere" — the creature's own body never assembles, but things the ship
*builds* (traps, emplacements, later defenders) may. Assembly reads as
hostile activity, not as the world itself. The zipper choreography code
should stay extractable for that future reuse rather than being deleted
outright when the corner-ritual rework happens.

**Source:** operator interview, July 30. Recorded in `FLEET-PLAN.md` under
"CP3 verdict: transitions must read as ascent around static anatomy" and its
"zip-assembly retention" addendum. Evidence frames from the judged pass:
`artifacts/cp3-transform/`.

**Supersedes:** nothing in decided canon — this refines *how* the already-
canon world-transformation grammar (`DESIGN.md`, "World-transformation
grammar") should render, not what transformations exist or when they fire.
Flags (does not yet fix) the "brick-slam zipper" description in `DESIGN.md`'s
implementation record as describing a technique the operator has since ruled
against for the creature reveal. CP3 itself is not closed — a second pass
applying this ruling is expected before the checkpoint is considered met.

## 4 — 2026-07-30 — CP2 verdict: houndframe lands; iterate from "hound 2.5"

**Decision:** the houndframe merge (`94913ad` — trial stages `?hound=1/2/3`,
per-pace fairness assertions) was judged at checkpoint CP2. Verdict: the
hound stages read well; iterate from roughly **hound 2.5** — stage 3
("mix") was "a little busy," and the target sits above stage 2's clean
squeeze but below the full pace roster plus hounds. Two further findings,
both about *placement* rather than *stats*: (1) a lone hound poses no
threat — the fix is chokepoints and patrol spans on routes the player
actually needs, not stat buffs; (2) 8-way aim is insufficient against low
targets — "sometimes I have to try and jump... sometimes I'm lined up to
shoot and safe and can't quite get the projectiles to the target."

**Rationale, operator verbatim:** on the hound stages, "those feel much
better." On aim: "sometimes I have to try and jump (may add crouch?) but
sometimes I'm lined up to shoot and safe and can't quite get the
projectiles to the target." On a related tightness complaint: "walls are a
little too tight with the pace at times, so I sort of feel invincible
going through walls, running past enemies."

**What this opens:** (1) `?hound=2.5` (`squeezePlus`) as a new trial stage
one notch above stage 2, built to iterate toward the target; (2) two
orthogonal A/B prototypes for the aim gap — `?crouch=1` (lowers the firing
line and hitbox from a planted stance) and `?aim=assist` (light projectile
aim-assist) — neither chosen yet, both operator-judged separately or
together; (3) the "invincible through walls" complaint splits into two
threads: the known crush wall-clip defect (already in a fix cycle —
re-judge wall tightness only after it merges) and a genuine design seed —
"running past enemies... might be viable paths to play in the future" —
noted as future evasion-as-scored-playstyle, but only if it becomes a
choice, not a physics accident.

**Source:** operator interview, July 30. Recorded in `FLEET-PLAN.md` under
"CP2 verdict: houndframe lands; iterate from 'hound 2.5'."

**Supersedes:** the "awaiting the operator's CP2 judgment" status this
project's docs carried after the houndframe merge — CP2 has a verdict now,
though it is "iterate from here," not "done." Does not supersede DESIGN.md's
weapon or movement grammar; crouch and aim-assist are prototypes, not new
canon verbs.

## 5 — 2026-07-30 — Movement verdict: hook v1 rejected

**Decision:** the wave-3 movement-verb merge's snap hook (`?hook=1`, marker-
anchors + a dedicated key/auto trigger) was judged and rejected in its
current shape. The verb concept is not banned — a future tether must be
**marker-less and button-less**, emerging from world/context rather than
authored points the player services.

**Rationale, operator verbatim:** "i didn't particularly like the hooking
implementation." Diagnosis, operator-selected from a provided list: the
anchors/placement ("specific anchors is too on the nose maybe") and the
input ("the hook doesn't add anything but an extra button press and
confusion"). Notably **not** selected: "wrong verb entirely."

**What this changes:** `?hook=1` (and `?hookinput=key|auto`) stay in the
tree as an inert, off-by-default prototype — receiving no further
investment, not deleted, per the same "keep it extractable" instinct as the
CP3 zip-assembly addendum (entry 3). The movement lane's live candidates
are now FLOW (`?flow=1`, momentum spine — still unjudged) and the authored-
slope rib-run (costed, not started). `DESIGN.md`'s "snap hook" as the "lead
wave-3 prototype" (this doc's own entry 2) is superseded by this verdict —
hook is no longer the lane's active bet; flow is.

**Source:** operator interview, July 30. Recorded in `FLEET-PLAN.md` under
"movement verdict: hook v1 rejected."

**Supersedes:** entry 2's framing of snap hook as "the lead wave-3
movement-verb prototype." Does not resolve `DESIGN.md`'s open question
("does the snap hook reuse jump, aim/fire, or a dedicated input") — a
*future*, differently-shaped tether still has to answer it; this verdict
only rules out v1's specific answer (dedicated input, authored anchors).

## 6 — 2026-07-30 — CP2.5 verdict: "enemies feel like they are coming for me"

**Decision:** the CP2.5 merge (ownership placement, roof contest, crouch +
aim-assist prototypes, commit-coil dodge cue) was judged. Verdict: strongly
positive, and it validates a doctrine — placement beats stats as the lever
for enemy pressure — plus confirms hound 2.5 as the working baseline going
forward.

**Rationale, operator verbatim:** "yes, this is much better, enemies feel
like they are coming for me."

**Still open (no verdict yet):** crouch vs. aim-assist — keep one, both, or
neither; the commit-coil dodge-timing feel; whether the roof still reads as
a free ride; and the five movement-verb questions from the wave-3 pivot
(hook feel — now answered by entry 5 — auto vs. key, hook-costs-pressure,
flow legibility, anchor density, the last three still live for FLOW).
`p6` (a metronome-hop policy surviving surge at 2.5-tile margins) is
accepted-for-now by integrator/adversarial judgment, not an operator
ruling, and can still be overturned by feel.

**Source:** operator interview, July 30. Recorded in `FLEET-PLAN.md` under
"CP2.5 verdict" (merge `72326cb`).

**Supersedes:** nothing decided — validates the placement-over-stats
doctrine and hound 2.5 as baseline; crouch/aim-assist remain undecided
prototypes per entry 4.

## 7 — 2026-07-30 — View-scale verdict: FAR is the default; bullets don't turn corners

**Decision:** two rulings from the same session. (1) The `?view=` experiment
(`3993150`) is judged: FAR (RIG ≈ 3.7% of screen height, matching concept
board 13's 3–5% range) becomes the **default** view; near/mid remain
reachable via `?view=near`/`?view=mid` for comparison. The known readability
cost (capsule glyphs, wasp tells read smaller at distance) is accepted for
now, with a follow-up to scale tells/glyphs up as an art/readability pass
rather than keeping RIG large. (2) Projectiles must not visibly curve around
hex-corners or transform bends — shots reaching a bend boundary leave the
surface on the face tangent and fade/cull, so sim and visuals agree (no
cross-corner sniping).

**Rationale, operator verbatim:** "far feels right." On projectiles: "the
only feedback is that projectiles also curve around corners."

**What shipped:** FAR is now the code default (`src/mode.js`'s `VIEW_ID`
resolves unrecognized/absent `?view=` to `'far'`; `?view=near` stays exactly
byte-identical to the pre-view-scale camera for comparison). The bend cull
(`view.bullets.bendCulled`, `src/sim/weapons.js`, `src/pure/path.js`) is
sim-agreed and shipped as default behavior — no flag, applies everywhere
projectiles can reach a bend.

**Source:** operator interview, July 30. Recorded in `FLEET-PLAN.md` under
"view-scale verdict: FAR is the default; bullets don't turn corners." Visual
grounding: `docs/concept-art/README.md` board 13
(`13-human-scale-monster-climb-grammar.png`).

**Supersedes:** the near view as the default camera depth (still reachable,
no longer the default) and any prior assumption that projectiles followed
the rendered ribbon around bends. Note for a future consistency pass:
`docs/concept-art/README.md`'s own "Visual invariants" list still says "RIG
at roughly seven percent of the screen height," which now reads inconsistent
with board 13's 3–5% and the shipped 3.7% FAR default — flagged, not fixed,
since `concept-art/` is outside this project's docs lane.

## 8 — 2026-07-31 — Delivery mandate: autonomous merges, asset lane opened, loop until a polished playable

**Decision:** four rulings from one operator directive, governing the wave-4
orchestrated push. (1) **Mission**: the target is a *playable version with
AAA-studio-level polish* of the full run — the fleet refines as necessary and
loops until delivered, rather than pausing between checkpoint verdicts.
(2) **Autonomous merges**: the integrator merges without per-merge operator
confirmation; the gates are agent review + bot playtest + the mechanical
merge script (`tools/orch/merge-task.sh`). (3) **Asset lane opened**: agents
may use the **codex CLI** (`codex exec`, installed locally) to generate
sprites/assets as needed — this releases the "juice/audio/final art
deferred" scope fence (entry 0a / FLEET-PLAN "Out of scope") to the extent
delivery requires. (4) **Housekeeping**: the stale wave-1 worktrees under
`/private/tmp/hullbreaker-*` were authorized for pruning and removed.

**Rationale, operator verbatim:** "it can merge autonomously, with agent
review. the agents can use the codex cli to generate sprites/assets as
needed and you can prune the old worktrees. I want to get to a playable
version with AAA studio level polish. Refine as necessary, and loop until
delivered."

**What this does NOT supersede:** the operator remains the only fun oracle —
checkpoint packets (G1, FLOW, crouch/aim-assist, CP3 v2, and new ones) keep
queueing in `SPRINT.md` and their verdicts still land in this log; work
proceeds without blocking on them. Entries 1–7 all stand: static-anatomy
render rule, hook-v1 rejection, FAR default + bend cull, placement-over-
stats, hound-2.5 baseline. The entry-0a hold on six-face integration
("iterate in fixtures until the operator approves the feel") **is released**
by the delivery mandate: integration proceeds, with a checkpoint packet
posted for judgment rather than blocking on one.

**What shipped:** the orchestration scaffold (root `CLAUDE.md`, `SPRINT.md`
queue, `.claude/agents/` roster incl. the new `asset-artist`, Stop-hook
flywheel, `tools/orch/merge-task.sh` gate — see `docs/ORCHESTRATION.md`),
`assets/` staging + manifest, and the worktree prune (their four unmerged
`agent/traversal-*` branch refs remain for the operator to delete — the
sandbox refused force-deleting branches).

**Source:** operator directive, July 31, at wave-4 kickoff.

## 9 — 2026-08-01 — Pocket verdict: the reward is a plain pickup; "dare" is parked, not cancelled

**Verdict:** the six-face pockets' weapon capsule is **free**, and it is
renamed accordingly. It is a pickup, not a wager. The requirement that
collecting it cost a measured retreat is **withdrawn**, and with it the
three-attempt effort to place the reward outside RIG's reach from the deck
line. The **dare** concept itself is not rejected — it is remembered, to be
implemented later as its own thing rather than as a shelf hanging off a
traversal pocket.

**Rationale, operator verbatim:** "Accept it's free and rename it. from my
perspective, if it enhances the ecalation of action, it's beneficial. dare
can be remembered and implemented in a different concept"

**What forced the question.** T-009 authored the pocket as a shelf reaching
back over a chasm so the capsule would cost a retreat against the scroll.
Three passes, three failures, all the same shape:
1. reward at `deckY + 5.05`; the MANDATORY crossing jump puts RIG's head at
   `deckY + 4.42`, 0.48 tiles inside the 0.95 pickup radius — all six
   pockets collected themselves mid-ascent, with no input change (I-019);
2. raised, and still taken from the deck line by spending the **air jump**
   on at least 2 of 6 faces;
3. moved to its own tier — gate not run, because this verdict retired it.

The root cause is structural, not sloppy authoring: RIG's vertical envelope
(jump + air jump) is frozen and generous, and a reward authored in the tier
band the player already occupies sits inside it. Pricing the wager in HEIGHT
is an arms race against a constant the fleet is forbidden to retune.

**Consequences, binding:**
- The capsule is a plain pickup. No code, comment, doc, assertion or operator
  packet may describe it as a dare, a wager, or a measured retreat.
- Any assertion whose subject is the wager (reward-out-of-reach,
  retreat-timing-as-a-cost) is removed rather than weakened — an assertion
  that certifies a thing the game no longer claims is worse than none.
  Assertions about what remains true (the pocket is reachable, it strands
  nobody, daylight against the pursuing edge holds) stay.
- Prefer the SIMPLEST pocket geometry that reads at FAR. The tier-raising
  from passes 2 and 3 existed only to defeat reachability; with the
  requirement gone it buys nothing and costs lattice crowding and FAR
  legibility, so revert toward the plain shape unless it reads worse.
- The operator's benefit test is **escalation of action**: pickups that feed
  the fight are good. The weapon-economy question T-009's review raised (six
  pocket capsules per run where the run previously fed on carrier drops only)
  is answered by that test rather than by a count — observe whether the
  escalation reads, and raise it again only if it flattens the run.

**Still open, and NOT decided here:** whether a dare mechanic belongs in the
game at all, and in what form. Parked as T-021 so the thinking is not lost.

**Source:** operator verdict, 2026-08-01, in response to the integrator's
escalation after the third failed attempt at I-019.

## 10 — 2026-08-01 — Run-energy verdict: split decisions at speed; the pocket becomes a loop, not a cul-de-sac

**Verdict:** T-021 is **unparked**, and the run's target energy is stated by
the operator as governing direction for the lattice, pacing and optional
content:

**Operator verbatim:** "correct, unpark t-021. i want lots of split decisions,
esceleration, action, climb, climb climb, keep going faster kind of energy for
the player"

**The tension this creates, named rather than buried.** `docs/DESIGN.md:176`
defines a dare pocket as a **dead end** — "Do I have time to grab that
capsule?" — escapable at the current scroll speed (`:284`), advertising its
reward and retreat path before commitment (`:169`). That mechanic was built
and playtested in the traversal slice (`:446`, `:565`) and it works. But a
cul-de-sac is a *decelerating* structure: the decision is instant, the
execution is a reversal. "Keep going faster" and "climb, climb, climb" argue
against ever asking the player to turn around in the main run.

**Resolution (integrator design call under this verdict; reverse it if wrong):
the pocket becomes a LOOP, not a cul-de-sac.** The player commits at a fork,
takes a longer and more exposed line that **rejoins the route ahead**, and
pays in time and risk without reversing. This keeps DESIGN's actual question —
"do I have time to grab that capsule?" — while never breaking forward motion:
- the DECISION stays split-second, taken at the fork at speed;
- the COST stays real and measurable in the currency that exists here, time
  against the pursuing edge plus exposure, not distance travelled backward;
- the shape serves "climb": the greedy line is the higher, more exposed one.

The dead-end form is **not** deleted — it remains valid in the traversal slice
and anywhere a deliberate pause is wanted. It is the MAIN RUN that takes the
loop form, and `DESIGN.md`'s dare-pocket section is to be updated to say so.

**Consequences beyond the pocket** — this verdict governs the lattice, not
just T-021:
- **Split decisions** are a density target: forks the player reads and commits
  to at speed, frequently, not one wager per face.
- **Escalation** is the benefit test carried over from entry 9: power and
  pressure rise together (pillar 3); a pickup that feeds the fight is good.
- **Climb** is the dominant motion; a face that reads as a flat corridor is a
  defect even if its route count is nominally in range.
- **"Keep going faster"** puts run TEMPO in scope — whether pace escalates
  across the six faces is now a live design question rather than a fixed
  constant. It is NOT authorized as a movement-constant retune (those stay
  frozen, entry-asserted); it means pacing, spawn cadence and lattice shape.

**Acceptance rule adopted at the same time**, from the three failed passes at
I-019: a task's acceptance box must name **the currency the player pays in**
and **the test that would falsify it**. "Measured retreat" is a feeling and
cannot be gated; "a policy that never leaves the main line collects zero
rewards" is a gate. Feelings go to the operator; boxes get tests.

**Source:** operator verdict, 2026-08-01, after the integrator surfaced that
the three failed pocket passes had built a reach puzzle rather than the
documented time wager.

## 11 — 2026-08-01 — Split-decision verdict: dead ends are the wrong branch; pace escalates at the player's momentum

**Operator verbatim:** "yes, a dead end as a wrong decision, there must be some
challenge and reward. yes, pace should esclate across the faces, but at the
player's momemntum. a good player escalates the action to intense levels of
explosion and speed, a new player is pushed along while they learn the
mechanics. eventually, boosts and scene transitions may rocket the player
forward and upward in a variety of ways with the face transitions ratching and
pumping the 'scaling a goliath' feel more real and action packed"

**This amends entry 10's resolution.** Entry 10 had me rule the pocket a LOOP
and retire the cul-de-sac from the main run. That was half right. The forward
energy holds — but the dead end is **restored, in a different role**: it is
what a WRONG split decision costs you, not the shape the reward lives on.

**The structure, as it now stands:**
1. A **fork** the player reads and commits to at speed.
2. The right branch carries **challenge AND reward** — higher, more exposed,
   it pays, and it rejoins ahead.
3. The wrong branch **dead-ends**. Choosing it costs real time against the
   pursuing edge. That is the stake that makes the decision a decision.

**Fairness rider (integrator, binding until an operator says otherwise):** the
dead end must be **legible as a risk before commitment** — the player can see
that branch might not go through. `DESIGN.md:169` already requires pockets to
advertise before commitment, and that survives here restated: a dead end you
could not have read is a memorization trap, and punishes replay knowledge
rather than skill. A dead end you gambled on is the mechanic working.

**Pace escalates at the player's momentum, not on a timer.** A good player
escalates the action to intense speed and explosion; a new player is pushed
along while they learn. The physics already supports this and we now have it
measured (T-020): `runSpeed` 9.4 t/s against a scroll of ~4.3 t/s, so **moving
forward BANKS daylight**. That banked daylight is the natural currency of
escalation — read the forks well, bank distance, and the run answers with more
pressure and more payoff; read them badly, lose the bank, and the run holds at
its floor pace and carries you. Escalation is therefore an EARNED consequence
of route-reading quality, not a scripted ramp per face.

**Explicitly NOT authorized by this entry:** retuning the frozen jump/movement
constants. Pace, spawn cadence, scroll behaviour and lattice shape are the
levers; `CONFIG`'s movement block stays frozen and asserted.

**Direction of travel, recorded now so it is designed toward rather than
bolted on later ("eventually"):** boosts and scene transitions that rocket the
player forward and upward, with face transitions ratcheting and pumping — the
"scaling a goliath" fantasy made physical. Parked as T-023; the pace work
(T-022) should leave room for it rather than hard-coding a ceiling.

**Source:** operator direction, 2026-08-01, after the integrator asked whether
the pocket failures were a design problem or unclear direction.

## 12 — 2026-08-01 — Pocket feel verdict: it works, and the price is PRESSURE, not geometry

**Operator verbatim, after playing it:** "feels good to me, i had enough time
to try and fail and go back and still mess up and then the wasp pressure was
enough that i abandoned it and continued on"

**Verdict: the pocket is good as it stands.** The arc the operator describes —
attempt, fail, go back, fail again, then get driven off by enemy pressure and
continue — is exactly the "do I have time to grab that capsule?" tension
`DESIGN.md:176` specifies, produced live, with a FREE capsule.

**What this teaches, and it is the correction to three failed cycles.** T-009
spent three passes trying to make the reward *cost* something by putting it out
of reach, and every pass failed because RIG's jump envelope is frozen and
generous. The cost was never supposed to be reach. **The price is the pursuing
pressure** — the wasps, the closing edge, the seconds spent — and that price
was already being charged the whole time. Entry 9 removed a requirement that
was trying to buy something the fight was already selling. The capsule being
free is not a concession; the *fight* is what makes taking it a decision.

**Consequences for the lanes in flight:**
- The shelf-and-chasm pocket **stays**. The open question in T-009's packet
  ("is it still worth entering, or is it now just another hole in the deck")
  is answered: it is worth entering, and it produced a real try/fail/abandon
  arc without any geometric wager.
- **T-021's fork should be priced the same way.** A dead end matters because
  hostiles are on you while you are in it, not because it is far from
  anything. Entry 11's fairness rider still holds (legible as a risk before
  commitment), but the *stake* is pressure, and the design should lean on the
  enemy roster to charge it rather than on distance or height.
- This also validates the wasp doing its documented job — contesting open
  crossings and predictable arcs. It is the wasp that ended the attempt.

**Still open (asked, not assumed):** which build the operator played — the
six-face default run (free capsule, merged minutes earlier) or the traversal
slice's own dare pocket (which still carries the retreat-priced wager scoring
and the `H WAGER` HUD line). The verdict above holds for the arc either way;
which pocket produced it decides whether T-021 keeps the shelf shape or
replaces it. Recorded here as unresolved rather than guessed.

**Source:** operator playtest, 2026-08-01.
