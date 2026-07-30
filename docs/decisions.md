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
