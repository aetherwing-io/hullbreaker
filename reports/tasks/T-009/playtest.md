PASS

Gate: playtester, task T-009 (six-face integration — lattice route density,
pockets, hound-2.5 stations, static-anatomy corner reveal as default).
Worktree `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-009`,
branch `task/T-009` HEAD **`72a7db5`** ("T-009 review fixes: scrub the last
wager wording, stop gating on the count"), which contains `main` via merge
`a116f59`.

**This gate applies `docs/decisions.md` entry 9 and supersedes the three
prior FAIL verdicts on this lane.** Those gates failed T-009 because the
pocket capsule was collectable from the deck line. The operator has since
ruled the capsule a plain pickup — that behaviour is now CORRECT, the
requirement it violated is withdrawn, and I-019 is already closed-as-obsolete
in `SPRINT.md`. Nothing here re-litigates it.

What this gate actually judged instead: whether the branch's *text* stayed
inside its *artifact* (the failure class this repo has burned cycles on, now
in reverse), whether the withdrawn assertions were removed rather than
weakened into passing vacuously, and whether the pass-2/3 tier-raising was
reverted for a real reason. All three are clean, with mutation evidence.
No defects filed; **no new Inbox issues**.

## Pinning and runs

Pinned server (worktree served, curl-proven before any run):

```sh
cd /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-009
python3 -m http.server 8995          # backgrounded; killed at gate end
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8995/index.html   # 200
curl -s http://127.0.0.1:8995/src/pure/lattice.js | head -3               # branch-only file, served
```

`src/pure/lattice.js` exists only on this branch, so serving it proves the pin
is the worktree and not the main checkout.

Harness runs, from the MAIN checkout's `tools/playtest`:

```sh
cd /Users/scottmeyer/projects/hullbreaker/tools/playtest
node run.mjs scripts/mid-route.json       --deterministic --max-runtime-ms 15000 \
  --base-url http://127.0.0.1:8995 --out runs/gate-T-009-mid
node run.mjs scripts/transform-slice.json --deterministic --max-runtime-ms 20000 \
  --base-url http://127.0.0.1:8995 --out runs/gate-T-009-transform
```

| run | result | exit | bootError | console errors | idle | crush margin | falls |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `mid-route` | **completed** | 0 | none | 0 | 0.0s / 4.6s (0%) | 35.41 tiles | 0 |
| `transform-slice` | **completed** | 0 | none | 0 | 0.0s / 15.7s (0%) | 30.12 tiles | 0 |

Both first-attempt, no retry needed. `testapi` fidelity, `errors: []` and zero
`type === 'error'` console messages in both `report.json`s. Against the
committed `mid-route` deterministic baseline in the harness README (crush
35.44, protoScore 70.2) this run reads 35.41 / 72.0 — inside the documented
polling caveat (honesty note #4), not a regression.

Evidence:
- `/Users/scottmeyer/projects/hullbreaker/tools/playtest/runs/gate-T-009-mid/{report.json,summary.md,screenshot.png}`
- `/Users/scottmeyer/projects/hullbreaker/tools/playtest/runs/gate-T-009-transform/{report.json,summary.md,screenshot.png}`

## 1. Truthfulness — nothing describes the capsule as a cost

Swept the whole `main...HEAD` diff for `dare|wager|gamble|retreat|measured`.
Every surviving hit is one of three legitimate kinds; **zero** describe the
six-face capsule as something the player pays:

- **Explicit disclaimers.** `src/pure/lattice.js:~279` — "The detour, measured
  — *not as a price anybody pays*, but as the proof that the pocket can always
  be left". `docs/DESIGN.md:439` — "**The capsule is free**… It is a plain
  pickup, not a dare: it costs nothing, it is collected however the player
  reaches it".
- **Recorded history, labelled as withdrawn.** `lattice.js:~145` keeps the
  `rewardRise 0.7 → 1.75 → +4.45` trail with "Entry 9 withdrew that
  requirement… so the shape is the plain one again", and states the consequence
  plainly rather than hiding it: a deck-line crossing "may now clip the capsule
  out of the air on the way past; that is a free pickup arriving early, which
  is what entry 9 decided it is."
- **Untouched traversal-slice code.** `src/sim/score.js`, `src/sim/capsules.js`,
  `src/sim/scroll.js`, `src/ui/overlay.js` and `hud.js`'s `H WAGER`/`RETREAT
  LEFT` strings still say wager — all `ACTIVE_SLICE`-gated, none in this diff.
  Entry 10 explicitly preserves the dead-end form "in the traversal slice", so
  this is correct, not residue. The only `hud.js` change in the diff is an
  unrelated per-body gating-count fix.

**Text-vs-artifact check, the thing this lane kept getting wrong.** I recomputed
every number `DESIGN.md:420-464` asserts, from the shipped config:

| DESIGN claim | computed | |
| --- | --- | --- |
| detour costs 0.43s | 0.4255s | ok |
| 1.83 tiles of edge advance | 1.8298 | ok |
| leaving 12.17 of 14 | 12.1702 | ok |
| ≥6 required | `minExitMarginTiles` 6 | ok |
| shelf at mid + 3 | `shelf.y - mid.y` = 3.00 | ok |
| capsule +0.7 over tip, deck + 5.05 | `rewardRise` 0.7, `reward.y - deckY` 5.05 | ok |
| 62 platforms | `buildLevel` → 62 | ok |
| one pocket per face | 6 | ok |

And the text draws its own boundary correctly: "the backward shelf spur
described above is what ships today, **not the end state**", pointing at
entries 10/11's fork. That is a doc describing its artifact and naming its
plan separately — the opposite of the failure that produced I-020.

The retracted single-run A/B is handled the same way: `six-face-full-run.json`'s
description and the harness README now carry "RETRACTED, DO NOT RE-QUOTE" with
the I-020 reference and the `?zip=1` noise-floor comparison.

## 2. Assertion hygiene — removed, not weakened (mutation-proven)

`node tools/pathcheck.mjs` in the worktree: **1588 passed, 0 failed** (exit 0).

The T-009-labelled `ok()` count is 28 both at the pass-3 commit (`149220e`) and
at HEAD — the count is flat, the *contents* were replaced. Between those two
commits **17 `ok()` calls were deleted**, of which 13 had the withdrawn wager
as their entire subject:

- `badEntry` — "a shelf is unreachable from the deck line"
- `badRetreat` — "every pocket retreat is measured and fits the clock"
- `sweptMin > RAD` — swept deck-line jump arc misses the reward
- `envMin > RAD`, `deckMin > RAD`, `hiMin > 0.15`, `badTotal === 0` — the
  analytic head-reach / double-jump envelopes and the pinned deck+1 residue
- `run.rewardsLeft === run.spawnedRewards`, `run.nearestReward > pickupRadius`
- `res.spam.left === res.spam.spawned`, `res.spam.nearest > pickupRadius`
- `res.apexRun.fromDeck === 0`, `res.climbs.every(c => c.airUsed === 1)`

They are deleted with an in-file record of the deletion (`pathcheck.mjs:7169`
and `:7233`: "REMOVED here by entry 9, not weakened… an assertion certifying a
claim the game no longer makes is worse than no assertion"). The remaining 4
deletions are the shape/fingerprint pins (`62 platforms`, `e715cc38`),
re-pinned rather than dropped, because the geometry legitimately changed.

Worth flagging as good practice: the review-fix commit `72a7db5` **removed**
`ok(run.rewardsLeft < run.spawnedRewards, …)` — an intermediate version had
*inverted* the old assertion into "the deck-line crossing must collect
capsules", which would have been a fresh false claim in the other direction.
It is now a reported note only ("a hold-right deck-line crossing collected 2 of
6 pocket capsules"), gating on nothing.

**The survivors are live, not vacuous.** I copied the tree to a sandbox and
mutated it (the game was never edited):

| mutation | pathcheck |
| --- | --- |
| `rewardRise` 0.7 → 3.7 (capsule off the shelf) | **4 failed** |
| `tierRise` 3 → 4.45 (pass-3 raised tier restored) | **2 failed** |
| `entryEdgeMarginTiles` 14 → 2 (daylight gone) | **2 failed** |
| `latticePatchPass` neutered | **3 failed** — incl. "no face window reads fewer than 3 routes (worst 1, 56 thin windows)" and the fingerprint |

Non-vacuity is also structural: `pockets.length === CONFIG.path.faces` is
asserted *before* the per-pocket loops, so they cannot iterate over an empty
set. All five named survivors are present and biting — reachability
(`latticeUnreachable`), no stranding (`latticeStranded`), daylight margin
(`badDetour`), route density (thin/busy over 246 windows), determinism
(`fingerprint(again) === fingerprint(LVL)`, plus the pass fixpoint).

## 3. Simplicity — the tier-raising was reverted, with a real FAR argument

Not kept. `pocket.shelfRise` (4.45) is **gone from the source entirely**; the
shelf is `midY + L.tierRise`, the plain generator tier, and `plats` went 63 →
62. So this is the revert entry 9 asked for, not inertia.

The reason given is a real readability argument backed by committed frames, not
an assertion: `artifacts/t009-lattice/entry9/{01-pocket-plain-shape.png,
02-pocket-raised-tier-withdrawn.png}` — the same moment, same URL, same policy,
only the pocket geometry differing. I looked at both and the claim holds: in
`01` the magenta `S` sits on the shelf line inside the catwalk band; in `02` it
floats clear of every route line with nothing under it. That folder's own
honesty note correctly scopes the frames to "legibility of the shape, not
difficulty or whether a free pickup is the right call."

## 4. Boot, selftest, flags

Independently driven (headless Chrome, 1440×900, against the 8995 pin):

| URL | title / state | console errors | page errors |
| --- | --- | --- | --- |
| `?selftest=1` | **SELFTEST PASS (29 checks)** | 1 (favicon 404) | 0 |
| default `index.html` | boots, `MENU`, canvas | 0 | 0 |
| `?zip=1` | boots, `MENU`, canvas | 0 | 0 |
| `?slice=transform` | boots, `MENU`, canvas | 0 | 0 |

The single console error is `GET /favicon.ico 404` from the static server
(confirmed in the server log) — not a game asset.

## 5. Screenshots

Judged `artifacts/t009-lattice/merged/` (the set the folder README says to
judge) plus the entry-9 A/B and both run screenshots.

- **FAR scale**: RIG measures ~28px on a 900px viewport ≈ **3.1%** in
  `merged/03` and the entry-9 frames — inside board 13's 3–5% band and
  consistent with entry 7's shipped 3.7% FAR default.
- **Style vs `docs/concept-art/`**: deep-teal environment, rust-orange armour
  reading as one connected hull slab, acid-green hostiles, hot-magenta pickup —
  the T-010 role palette, consistent with boards 10/13. Silhouettes are
  readable; hulls are connected, not floating scaffolding (board 0b's ruling).
- **No assembling anatomy**: `merged/02-corner1-static-anatomy.png` shows the
  joint column and buttress as the pivot with the next facet's deck and
  catwalks **already present** in the haze to the right — revealed, not
  assembled (entry 3). The retired zipper survives only under `?zip=1`, whose
  frame (`merged/07`) correctly shows the same deck in void.
- No glitches, no z-fighting, no torn geometry in any frame. The
  transform-slice run screenshot ends on a clean `BREACH CLEAR`, 2/2
  transformations, 0 falls.
- The artifacts README discloses its capture aid (HP top-up on `merged/01`–`05`)
  and that `merged/06`–`07` use none. That disclosure is correct practice and
  is why those frames are read as composition evidence only.

## Open questions for the operator — feel, not gate items

Routed here rather than judged; none of these is a defect.

1. **Escalation, entry 9's own benefit test.** A pure hold-right deck-line
   crossing picks up **2 of 6** capsules; the other 4 need the player to enter
   the pocket. Does arming up mid-face read as escalating the action on the
   stretch that follows — and is 2-of-6-for-free the right split, or should the
   passive share be higher or lower?
2. **Pocket shape vs entries 10/11.** What ships is a backward shelf spur; the
   entries call for a fork whose rewarding branch rejoins ahead and whose wrong
   branch dead-ends. Does the spur read acceptably as an interim, or should
   T-021/T-022 land before this ships to the operator build?
3. **FAR route legibility.** At the default FAR view the catwalks are 2–3px
   lines and the capsule glyph is small. This is the readability cost entry 7
   accepted with a follow-up art pass attached — is it still acceptable now
   that there are 3–5 routes per window competing for the same pixels?
4. **Checker tiling busyness** on the armour at FAR, called out by the
   artifacts README as an open call.

## What this gate does not claim

- Boot-to-VICTORY on the six-face run is **not** proven and was never this
  gate's scope — split to T-018 by the integrator. The two smoke scripts here
  are slice runs.
- Per harness honesty #3, a `--base-url` run computes route metrics against the
  *running* tree's fixture. Both trees carry the same `src/pure/traversal.js`
  here, so `mid-route`'s route columns are comparable, but they are still the
  approximate greedy matcher, not a topological solve.
- 60fps under 200+ projectiles was not re-measured in this gate; it was covered
  by the earlier T-009 gate and is unaffected by a harness-only review fix
  (`72a7db5` touches `tools/` only — zero `src/` files, so the shipped game is
  byte-identical to the previously-measured build).
- No fun verdict. The operator is the only fun oracle.
