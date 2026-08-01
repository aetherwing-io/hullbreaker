# T-009 — six-face lattice, pockets, hound stations, static-anatomy reveal

Two sets of frames from the DEFAULT run (`index.html`, no flags, FAR view).

## `merged/` — current, and the set to judge by

Captured 2026-08-01 from `task/T-009` merged up to main `b23184b`, so the
shipped palette (T-010), the juice pass (T-011), the game shell (T-013) and
the spore mortar (T-014) are all in the tree. Headless Chrome at 1440×900.

| shot | what to look at |
| --- | --- |
| `01-pocket-face1.png` | face 1 just past its pocket: deck line across the middle, three tiers of catwalk above it, a SPREAD capsule (magenta) and hostile tells (green) on the routes ahead. RIG is ~3.5% of screen height. |
| `02-corner1-static-anatomy.png` | corner 1, mid-ritual (`CLEAR` is up). The joint's dark column and its buttress are the pivot; the next facet's deck and catwalks are ALREADY THERE to the right, receding into haze. Nothing assembles — `decisions.md` entry 3 as the shipped default. |
| `03-face2-route-density.png` | face 2 entry: what "3–5 readable routes" looks like from the deck. |
| `04-hound-station-face2.png` | face 2's houndframe station (green, on the plate left of centre) standing on the pocket landing, with the pocket's own mid lane directly above it — the answer to the charge is the route the shelf hangs from. |
| `05-corner2-approach.png` | the run into corner 2: both joint columns in frame, the whole face reading as one connected slab of anatomy. |

### The A/B the operator packet asks for

`06-ab-gate1-default.png` and `07-ab-gate1-zip.png` are **the same simulated
moment** — wave gate 1, x ≈ 58.6, scroll 75 — captured by running the same
`six-face-full-run` policy script under `--deterministic` with the same
runtime cap, once with no flags and once with `?zip=1`. Only the reveal mode
differs:

- **default (06)**: the deck sits on a body. Joint column, buttress, armour
  under the deck, the next facet already present in the haze behind it.
- **`?zip=1` (07)**: the same deck, the same enemies, the same routes — in
  VOID. Nothing exists past the corner; the catwalks float.

The two runs are simulation-identical by construction (`tools/pathcheck.mjs`
runs both and compares whole traces); the one-kill difference in the HUD is
where the two wall-clock captures happened to stop, not a gameplay difference.

## Root of this folder — pre-merge history

`01-pocket-face1.png`, `02-corner-ritual-static-anatomy.png`,
`03-pocket-face2.png`, `04-hound-station-face2.png` are the original T-009
frames, captured before main's palette pass reached the branch. They are
**grey-box** and no longer show what ships. Kept only as the record of what
the lattice looked like when it was authored; judge `merged/` instead.

## Honesty notes

- **Pocket geometry, captured vs shipped**: these frames were captured with
  the shelf one generator tier over its mid lane and the capsule +0.7 over
  the tip. The task later raised both (twice) to put the capsule out of reach
  from the deck line, and `decisions.md` entry 9 then withdrew the
  requirement that made that necessary, so the shipped shape is the captured
  one again. Nothing here needs re-shooting for the pocket; everything else
  in frame still dates from the capture (main `b23184b`).
- **Capture aid, `merged/01`–`05`**: the capture loop tops RIG's HP up every
  poll so one session reaches the later faces. Nothing else is modified — the
  wave gates still had to be shot down for the scroll to resume, and the
  geometry, spawns, camera and palette are exactly what the shipped URL
  fields. Those frames are evidence about *composition and placement*, not
  about difficulty. `merged/06`–`07` use no such aid: they are plain
  `--deterministic` harness runs.
- The floating slabs high in frame are the limb bake's `silhouette` pieces
  (distant anatomy), unchanged by this task.
- Nothing here is a fun verdict. Route readability at FAR (the catwalks are
  2–3 px lines), the checker tiling's busyness, and whether the corner reveal
  is the *right* reveal are all operator calls — they are in this task's
  checkpoint packet, not decided here.
