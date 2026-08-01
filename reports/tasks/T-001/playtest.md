PASS

# T-001 playtest gate — CP3 v3 transform slice (static-anatomy rework)

- Worktree under test: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-001`
  at `252842b` (on top of main `0ec9403`).
- Pinned per README: `python3 -m http.server 8771 --directory <worktree>`;
  harness run from the MAIN checkout's `tools/playtest`.
- Gate date: 2026-07-31.

## Run commands (both exit 0)

```sh
node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000 \
  --base-url http://127.0.0.1:8771 --out runs/gate-T-001-mid
node run.mjs scripts/transform-slice.json --deterministic --max-runtime-ms 20000 \
  --base-url http://127.0.0.1:8771 --out runs/gate-T-001-transform
```

## Results

| Run | result | attempts | deaths | idle fraction | minEdgeMargin | consoleErrors / pageErrors / bootError |
| --- | --- | --- | --- | --- | --- | --- |
| mid-route | **completed** | 1 | 0 | 0.024 | 35.42 | 0 / 0 / none |
| transform-slice | **completed** (2/2 transformations, BREACH CLEAR) | 1 | 0 | 0 | 30.07 | 0 / 0 / none |

No bootError on either run; the one-retry allowance was not needed. Both
reports carry `"result": "completed"` in `outcome`. Fidelity `testapi` on both.

## Evidence paths (all under the MAIN checkout)

- `/Users/scottmeyer/projects/hullbreaker/tools/playtest/runs/gate-T-001-mid/`
  (`report.json`, `summary.md`, `screenshot.png` — TRAVERSAL CLEAR overlay)
- `/Users/scottmeyer/projects/hullbreaker/tools/playtest/runs/gate-T-001-transform/`
  (`report.json`, `summary.md`, `screenshot.png` — BREACH CLEAR overlay)
- `/Users/scottmeyer/projects/hullbreaker/tools/playtest/runs/gate-T-001-transform/checkpoints/`
  — 37 frames captured by `capture-script.mjs` (archived in the same dir):
  a deterministic (gameMs-keyed) replay of the same transform-slice input with
  screenshot bursts every ~110ms of gameMs through both ritual windows plus
  before/after anchors. Windows located from the gate run's own trace:
  flip `turning` gameMs 4595–5653, breach `turning` 10953–12012.

## What I judged

**1. Static-anatomy rule (decisions.md entry 3 — the acceptance bar).**
Examined the full flip sequence (`03313-anchor` armed → `04463`/`04605`/
`04739`/`04872`/`04988`/`05122`/`05255`/`05388`/`05522` turning → `05655`+
settled) and the full breach sequence (`09713-anchor`/`10621`–`10888` armed →
`11021`/`11154`/`11288`/`11421`/`11538`/`11672`/`11805`/`11938` turning →
`12071`–`12472` complete). **Nothing assembles.** In every turning frame the
interior band (flip) and the outer face C skyline (breach) are already fully
present as one rigid, connected assembly that the camera orbits around; the
same geometry is identical across consecutive frames, only orientation
changes. The interior floor strip is visible through the open panel before
the flip even arms (pre-built where the sightline exposes it). The only
moving elements are the access plate / vent cover mechanisms (permitted) and
a vapor puff at the breach vent that dissipates by the `complete` frames — an
effect, not geometry. No tile columns dropping, no brick-slam zipper, no
articulation of body parts. This is the reveal grammar entry 3 demands.

**2. Report hygiene.** Zero `consoleErrors`, zero `pageErrors`, no
`bootError` in either report.json. The pinned server's only 404 across all
three browser sessions was `/favicon.ico` — documented environment noise
(the static server has no favicon), not a game defect; every game module
fetch returned 200.

**3. FAR readability.** Measured RIG in the breach frames: ~30px of the
800px viewport ≈ 3.7% of screen height — exactly the FAR default the
view-scale verdict shipped (decisions.md entry 7, board 13's 3–5% range).
Silhouette reads (head/torso/legs + rifle line), capsule pips and the amber
mechanism strips read at distance. Caveat: `transform-slice.json` runs with
`&enemies=0` by design, so enemy-tell readability at FAR is not exercised by
this gate — that is T-003's lane, and entry 7 already accepts the current
tell cost as a known follow-up. Not a T-001 defect.

**4. Style vs `docs/concept-art/`.** Form language matches the endorsed
boards: monumental limb-scale masses, ribbed bands, interior-cavity flip and
breach-out-into-rain staging track boards 02/08/11; human-scale figure
against colossal anatomy tracks board 13's grammar. Palette is still
greybox — expected and out of T-001's scope (T-010 owns the palette pass);
judged form only, per the task.

## Issues filed

None. No defect found; SPRINT Inbox untouched.

## Notes / operator questions (feel — not judged here, per standing orders)

- Whether the flip/breach now reads as a "smooth, chonky reveal" (the CP3 v1
  complaint) versus merely slower is a feel call. The worktree already queues
  the CP3 v3 operator packet (worktree commit `252842b`); the CP3
  re-judgment entry in the main SPRINT's checkpoint queue covers this on
  merge. Suggested questions are in that packet; nothing to add from this
  gate.
- Harness honesty caveats that apply to these numbers: route-coverage
  metrics are computed against the MAIN tree's `TRAVERSAL_FIXTURE`, not the
  served worktree's (README limitation #3) — irrelevant to the completed/
  static-anatomy verdicts, noted for anyone re-reading the route fields.
  `--deterministic` removes dispatch jitter, not all divergence sources
  (README limitation #8); both gate runs completed on attempt 1 with 0
  deaths, so the known post-death fork never came into play.
