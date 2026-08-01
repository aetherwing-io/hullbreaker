# T-004 evidence — Iris Polyp v1 (`?polyp=1` / `?polyp=2`)

One committed deterministic run per acceptance script (`--deterministic
--sample-ms 40`), traces in each `report.json`. All four scripts are now
fully closed-loop (zero timed movement inputs — the approach hops were
converted to policy rules keyed to landings/falls, per review): the old
~1-in-7 open-loop approach jam is gone with the timed hops that caused it.
Stability measured across tuning runs: lane-dodge 8/8, facetank 3/3,
vent-kill 3/3, combo-stack 3/3, all landing the shapes below. Key facts,
read from the committed traces (gameMs):

## polyp-lane-dodge — the movement answer
VICTORY, hp 3, kills 0, zero hits. Both parked iris cycles were answered:
`fire` began at 3919 and 7669 with the bot at y=3.0 — on the deck **below
the band**, having dropped through the catwalk on `tell` — so the beam
swept an empty lane twice. (A third `fire` at 11428 catches the bot already
at x≈69 on the egress run-out, well past the lane.) Cycle timing visible:
fire→fire 3750 ms = tell 800 + fire 450 + vent 900 + cooldown 1600 (CONFIG).

## polyp-facetank — the cost
Parked in the lane (completion deliberately not the metric; the run
classifies `stalled` because parking is the point): three volleys, one
point each (3925, 7725, and the third at ~11.5 s emptying the bar into a
HULL FALLBACK, setbacks 1, hp restored). i-frames single-cost each volley
and expire well inside the cycle — the same facetank arithmetic the
houndframe carries.

## polyp-vent-kill — armour and the opening
Fire held from t=0.1 s; the polyp's hp stayed 6 through the whole approach
and the closed/tell phases of its first cycle (armour pings), the first
volley cost the bot 1 hp at 3927, and the kill landed at 4619 —
**mid-vent, inside the opening** — then VICTORY (kills 1, hp 2). A naive
DPS race would kill a 6 hp target in <1 s; the armour makes the opening
the only path, which is DESIGN's "destroy it during an opening", measured.

## polyp-combo-stack — the two-enemy stage (`?polyp=2`)
VICTORY, kills 0, hp 1, setbacks 0. Both threats fully engaged in one run:
polyp closed/tell/fire/vent above, hound prowl/tell/charge/skid below.
Both hits are the stack itself pricing the answer: at 3927 and 7677 the
hound-tell jump lifts the bot into the band at the moment `fire` begins —
the squeeze working in the other direction from the drop reroute. That
vertical double-bind is what the stage exists to test.

## Honest limits
hp in these summaries is the DOM pip parse (testapi's frozen channel does
not carry hp). Dispatch quantization still bounds any single input by one
sample tick (~40 ms), but with zero timed inputs left there is no
arrival-time fork for it to compound through — outcome shapes above were
identical across every stability run.

## Open feel questions for the operator (we do not judge fun)

Serve: `python3 -m http.server 8741`, then
**http://127.0.0.1:8741/index.html?slice=traversal&polyp=1** (solo teach)
and **http://127.0.0.1:8741/index.html?slice=traversal&polyp=2** (hound
combo). Ready to lift into SPRINT's Operator checkpoint queue:

1. Does the iris cycle read without explanation — does the dilating tell
   say "beam imminent" and the vent opening say "shoot me NOW" before the
   first hit teaches it?
2. Does the locked lane create real target priority — "deal with it or
   reroute" — or does it read as a stat wall / hp sponge? (decisions.md
   entry 6 is the doctrine; this asks whether the placement *feels* like
   position, not stats.)
3. Is the drop-through-the-catwalk dodge discoverable and satisfying —
   does answering the beam feel like movement (pillar 2), or like waiting
   behind cover for a turn to end?
4. In `?polyp=2`, does the polyp-above/hound-below stack read as one
   decision point you answer with one verb, or as unreadable double
   jeopardy?
5. Does the side-facing barrel silhouette (board 07's note) read at the
   shipped far view scale — can you tell which lane it locks at a glance?
