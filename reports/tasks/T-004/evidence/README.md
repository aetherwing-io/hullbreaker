# T-004 evidence — Iris Polyp v1 (`?polyp=1` / `?polyp=2`)

One committed deterministic run per acceptance script (`--deterministic
--sample-ms 40`), traces in each `report.json`. Key facts, read from the
traces (gameMs):

## polyp-lane-dodge — the movement answer
VICTORY, hp 3, kills 0. Both parked iris cycles were answered: `fire` began
at 5924 and 9673 with the bot at y=3.0 — on the deck **below the band**,
having dropped through the catwalk on `tell` — so the beam swept an empty
lane twice. Cycle timing visible: tell→fire ≈ 810 ms (CONFIG 800), fire→vent
450, vent→closed 900, closed→tell ≈ 1590 (cooldown 1600).

## polyp-facetank — the cost
Parked in the lane (completion deliberately not the metric): three volleys,
one point each (5978, 9728, and the third at ~13.5 s emptying the bar into a
HULL FALLBACK, setbacks 1). i-frames single-cost each volley and expire well
inside the cycle — the same facetank arithmetic the houndframe carries.

## polyp-vent-kill — armour and the opening
Fire held from t=0.1 s; the polyp's hp stayed 6 through ~7 s of pinging
(closed/tell armour), the second volley cost the bot 1 hp at 7396, and the
kill landed at 7971 — **mid-vent, inside the opening** — then VICTORY
(kills 1, hp 2). A naive DPS race would kill a 6 hp target in <1 s; the
armour makes the opening the only path, which is DESIGN's "destroy it
during an opening", measured.

## polyp-combo-stack — the two-enemy stage (`?polyp=2`)
VICTORY, kills 0, one hit. Both threats engaged in one run: polyp
closed/tell/fire/vent above, hound prowl/tell/charge/skid below — dodging
the beam drops the bot into the hound's priced reroute, the vertical stack
the stage exists to test.

Honest limits: the open-loop approach hops fork on dispatch quantization and
can jam a run before the polyp engages (~1 in 7 across tuning runs — the
script descriptions carry the re-run note); hp in these summaries is the
DOM pip parse (testapi's frozen channel does not carry hp).
