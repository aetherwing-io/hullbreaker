PASS

# T-010 palette pass — playtest gate (third cycle)

Worktree under test: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-010`
(branch `task/T-010`, HEAD `67314a6`, clean tree). Pinned by serving the
worktree from its own static server; harness run from the MAIN checkout's
`tools/playtest`. Server killed after the runs.

**Port deviation, stated up front:** the assigned port **8784 was already
held** by a stale `http.server` from an earlier gate cycle
(`--directory .../worktrees/T-008`, a directory that no longer exists — it
answered `404` for `/index.html`). 8791/8792/8793/8804/8809 were likewise
held by other lanes' servers. This gate therefore pinned **8857** and proved
the pin before running anything: `/index.html` → 200 and
`/src/render/palette.js` served with sha `d43878edd827`, byte-identical to
the worktree file (that path is `404` on `main`, so it also proves the runs
did not silently hit the main checkout). The stale 8784/T-008 server was left
alone rather than killed — someone else's lane, and it was not in the way.

## Run commands (all exit 0, first attempt, no retries — `bootError: null`)

```sh
# pin (worktree tree, port 8857 — see deviation note above):
python3 -m http.server 8857 --bind 127.0.0.1 \
  --directory /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-010

# from /Users/scottmeyer/projects/hullbreaker/tools/playtest:
node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000 \
  --base-url http://127.0.0.1:8857 --out runs/gate-T-010-mid
node run.mjs scripts/transform-slice.json --deterministic --max-runtime-ms 20000 \
  --base-url http://127.0.0.1:8857 --out runs/gate-T-010-transform
# this gate's own extra: the polyp acceptance bot, used to check the packet's
# sim-state numbers against a live run rather than against prose
node run.mjs scripts/polyp-lane-dodge.json --deterministic --max-runtime-ms 18000 \
  --base-url http://127.0.0.1:8857 --out runs/gate-T-010-polyp

# in the worktree:
node tools/pathcheck.mjs        # 800 passed, 0 failed, exit 0
# in the main checkout, for the staleness note below:
node tools/pathcheck.mjs        # 961 passed, 0 failed, exit 0
```

## Machine evidence

| run | result | fidelity | attempts | hp/lives | console/page errors |
| --- | --- | --- | --- | --- | --- |
| `runs/gate-T-010-mid` | **completed** | testapi | 1, 0 falls | 1 hit survived | none / none |
| `runs/gate-T-010-transform` | **completed** | testapi | 1, 0 falls | lives 3→3, 0 spent | none / none |
| `runs/gate-T-010-polyp` | **completed** | testapi | 1, 0 falls | hp 3 end, 0 kills | none / none |

- `mid-route`: `TRAVERSAL CLEAR` in 6.8s, idle fraction 0.022, `minEdgeMargin`
  35.39 tiles, airMs 5.8s, protoScore 93.1 (proxy). Sits inside the README's
  post-CP1 band for this script (35.44 tiles / idle 0%); nothing moved.
- `transform-slice`: `BREACH CLEAR`, 2/2 transformations, 15.6s, idle 0,
  `minEdgeMargin` 30.12 tiles, route coverage `[mid-catwalk, wall-launch]`.
- `polyp-lane-dodge` (acceptance bot for T-004's turret, re-run here because
  T-010 recolors that enemy): completed, **hp 3, kills 0** — the "every
  parked-cycle volley sweeps an empty lane" expectation the script documents.
  The recolor did not break the judged combat loop.

Artifacts: `tools/playtest/runs/gate-T-010-{mid,transform,polyp}/`
(`report.json`, `summary.md`, `screenshot.png`).

## Frames, not prose — what this gate verified itself

The two earlier cycles died on packet text asserting more than the committed
frames carry, so every packet claim about the polyp stills was re-derived here
from the PNGs on disk (and, where the packet states sim values, from a live
run of my own). Method: decode the committed PNGs in a headless Chrome canvas
and count, using the rig's own published predicates
(`/private/tmp/.../scratchpad/pxcheck.mjs`, gate-local, nothing written into
the repo).

- **The beam is really in frame, and its number reproduces exactly.**
  `polyp-beam--concept.png` minus `polyp-tell--concept.png` under the rig's
  hot-acid predicate (`g>=150 && g-b>=45 && g>=r`) = **2497 px**; classic =
  **2650 px** — the packet's "2497/2650" to the pixel, with **0** such pixels
  in either tell frame. Visually it is unmistakable: a held pale-acid bar
  spanning ~170 px leftward out of the emplacement, RIG standing inside it.
- **The warm tell is really in frame, and this is checkable from the two
  committed stills alone.** The polyp bulb reads warm and red-dominant in the
  tell frame (`229,220,188` concept / `229,215,186` classic) and green-dominant
  acid in the beam frame (`218,230,148` / `214,229,139`) — same emplacement,
  same palette, opposite hue family. The 542/796 px blink figure itself is
  *not* recomputable (its OFF reference frame is deliberately not committed),
  and the packet says exactly that ("measurable only at capture"), so the
  packet does not lean on a number a reader cannot check.
- **HUD corroborates the sim-state prose.** `polyp-tell` HUD reads `RIG ▰▰▰`
  (hp 3, un-hit), `polyp-beam` reads `RIG ▰▰▱` (hp 2). In the tell frame RIG
  stands on the deck; in the beam frame RIG's feet are clear of the catwalk
  slat with the beam through its chest — "knocked off its feet" is what the
  frame shows.
- **The x-values are real, not decorative.** My own `polyp-lane-dodge` run
  against this same tree: the emplacement sits at x = 63.2; the first `tell`
  sample has RIG at **x = 53.84, grounded, hp 3** — the packet's "grounded on
  the walk at x≈54, hp 3, un-hit". `fire` samples in my run land at x
  59.4–59.9 (my bot dodged and kept hp 3); the packet's capture run took the
  volley at x≈61 in the same lane, consistent with the frame's own geometry:
  the emplacement shifts 943 px → 800 px between the two stills, ≈ 7 tiles at
  the ~20 px/tile this FAR view renders, matching the stated 54 → 61.
- **Filenames match the packet.** `polyp-trial--*` is gone; `polyp-tell--*`
  and `polyp-beam--*` (concept/classic/pair) are committed, 21 PNGs total in
  `artifacts/palette-v1/`, every name the packet lists present.
- **Nothing in the packet outruns the evidence.** The one claim the stills
  cannot show — the closed→tell→fire→vent rhythm, and the polyp's dormant
  acid body, which no still can carry because each state wears exactly one
  emissive — is the one the packet routes to the live URL ("has to be judged
  live at the URL, not from stills"). Acid ecology is visible where it is
  claimed: wasps in `traversal-action--concept.png`, wasps plus a carrier in
  `sixface-action--concept.png`.

## Screenshot judgement (standing orders)

Judged `artifacts/palette-v1/*--concept.png` and the three run screenshots at
1280×800, the shipped FAR default.

- **Color roles vs `docs/concept-art/` invariants:** deep-teal air, rust-orange
  structure, acid-green danger, hot-magenta reward capsule, warm-white player
  fire — all five present and correctly assigned. Fog/background matches the
  teal air rather than fighting it; `transform-boot` reads as one atmosphere.
- **RIG scale:** ~30 px of 800 ≈ 3.7% of screen height in the six-face and
  transform stills — inside the 3–5% invariant, unchanged by this pass.
- **Silhouettes/readability:** deck faces stay the brightest large shape;
  RIG (warm grey) separates from both teal air and rust deck; the magenta
  capsule is the only magenta on screen. The polyp's tell and beam are the
  highest-contrast objects in their frames at FAR.
- **No assembling anatomy:** `g1-limb` and `transform-boot` show monumental
  prebuilt body with the camera doing the work; the transform run reached
  `BREACH CLEAR` 2/2 with no console errors. Nothing in this diff touches
  choreography (render color tokens only).
- **No glitches:** no z-fighting, no missing meshes, no untinted stragglers in
  any of the 11 concept frames or the 3 run screenshots.

## Scope checks the task named

- `node tools/pathcheck.mjs` in the worktree: **800 passed, 0 failed, exit 0**
  (≥ 800 as required; the diff adds 150 assertion lines and deletes none).
- **No `src/` behavior changed this cycle:** `git diff ab1b335..HEAD -- src/`
  is 7 insertions / 2 deletions, and filtering comment lines leaves **zero**
  changed lines — the whole delta is the corrected comment block in
  `src/render/palette.js` (the pre-boot-flash claim). `src/pure/` and
  `src/sim/` are untouched across the entire branch (`git diff --name-only
  main...HEAD -- src/pure src/sim` → 0 files).
- **I-004 (filed by the first T-010 gate) is resolved on this branch:**
  `src/render/hostiles.js` now reads `PAL.wasp/carrier/hound/houndTell/
  houndCharge/polyp*` only; the sole remaining `CONFIG.palette` consumers are
  `palette.js` itself and the exempt `hook.js`. Integrator can close I-004 at
  merge.

## Notes for the integrator / operator (not gate failures)

1. **Branch staleness (merge bookkeeping).** `task/T-010` is 43 commits behind
   `main`; pathcheck is 800/0 here vs 961/0 on `main`. The gate ran against the
   worktree as instructed. Expect the merge to combine both assertion sets;
   re-running pathcheck post-merge is the integrator's normal step.
2. **Feel questions for the operator — routed, never judged here:**
   - At FAR the acid-green wasp/carrier bodies are ~10–16 px and read as dark
     green chips against the teal air, while the polyp's warm tell and acid
     beam read strongly. Is the *body* acid intensity where the boards want it,
     or is the palette right and the size the problem (T-003's lane)?
   - The polyp's tell blink lands as a warm cream (`229,220,188`) very close to
     the warm-white player-fire/muzzle role. Should the WARN amber stay this
     close to warm-white, or pull further toward amber so "telegraph" and
     "player fire" never share a read at FAR?
   - The committed stills cannot show the polyp's dormant acid body (each iris
     state wears one emissive), so packet question 5 genuinely needs the live
     URL, not the pair PNGs.
3. Filed **I-015** in SPRINT's Inbox: the capture rig's own prose ("throws
   rather than write evidence that does not show what its name claims") is one
   notch stronger than its code, which screenshots to the final artifact path
   and verifies afterwards. Tool-only, does not affect the committed evidence
   (which verified), also raised as MINOR in `reports/tasks/T-010/review.md`.

## Honesty / limits of this verdict

- Bots are evidence about pacing, fairness and regressions — **not** a fun
  verdict, and this gate does not offer one. Whether the concept palette is
  *right* is the operator's call at the packet URLs.
- `protoScore` here is the **proxy** flavor (no `?score=1` on these scripts);
  comparable between these runs, not against `HB.score` runs.
- Pairs in `artifacts/palette-v1/` are input-schedule-matched, not frame-locked
  (the rig's README says so); the `sixface-action` pair in particular differs
  in hostile roster between sides. Palette and composition are comparable
  there; sprite positions are not.
- Route-coverage/dare-pocket columns come from the traversal fixture and are
  only meaningful on the traversal-slice runs.
- Pixel counts above were computed by this gate with the rig's published
  predicate, in a browser canvas at 1280×800 — same method the rig uses, same
  numbers, independently run.
