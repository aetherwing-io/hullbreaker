# Race to the top — longer sides, rolling gates, and a three-level climb

Status: **proposal (T-104), not canon.** Nothing here is decided until the
operator answers §8 and the integrator dispatches §7. Prepared 2026-10-22 by
the `lattice-designer` lane against `main` 98b12c9 (worktree
`.claude/worktrees/T-104`, branch `task/T-104`).

Scope: (a) level 1 as *"a fast pace, race to the top, shoot-em up"* with
longer sides — the operator's *"the 'sides' are a little short"*
(`decisions.md` entry 20); (b) levels 2 and 3 as distinct climbs of the same
Meridian. Method: the shipped run was measured first, headlessly, as
distributions (entry 19); every number below traces to a committed script or
file, listed in Appendix A.

**Written against entry 20's addendum** (main `b9786c6`, landed while this
lane ran): phones are **landscape first** (portrait still works, not the
tuning target); phones get a **closer frame, RIG ≈ 6 % of screen height**
(desktop FAR unchanged; built later by T-107); work ships as **playable
milestones** (merge to main, a Pages release per playable milestone); the
primary phone is **iPhone Safari**. The closer phone frame does not exist
yet, so it is measured here as an *estimate* (§1.1) and level readability is
designed for it (§4.1, §4.5); §7 is ordered into shippable milestones.

**And against entry 21** (main `4115c83`): the legacy test suite is unproven.
Nothing below cites a green check as evidence; the baseline is measured by
driving the shipped simulation like a player; every build-plan box is a
behaviour test that goes red on the defect it guards; and §7 names the legacy
checks the plan collides with, as candidates to rewrite or retire (T-108 is
auditing the suite).

## Summary

**Measured — the shipped run, 232 headless runs of the real simulation**
(4 bot styles × 12 seeds and a perfect-shooter instrument, at desktop FAR,
today's landscape phone, the addendum's 6 % landscape phone frame and
portrait; replica checked against Chrome, §1.2):

- **A side is short, and the scroll sets its length.** 88 tiles = 1.2 desktop
  screens, 0.9 on today's landscape phone, 1.4 in the 6 % phone frame. Every
  style spends 16–23 s moving per side. A perfect racer covers the ground in
  ~11–13 s, then **stands ≈ 5–6 s per side at a closed joint** waiting for the
  scroll — over a quarter of every side.
- **The faster you play, the less you see:** a perfect racer is pinned
  against the right clamp on 44–49 % of frames, and sees a median of **5
  tiles of route ahead** while the scroll moves (1 tile in the 6 % phone
  frame): a third of its climb is spent standing at a joint that is shut
  until the scroll arrives, and 8–20 % pressed against the right screen edge.
- **Gates:** cheap for a good shooter (0–3.9 s floor; 0–9.8 s at 1.5 s per
  kill) and a wall for imperfect hands — 3–5 beats per gate, armoured rooted
  teachers early, a 300 s lock as the only release; bots are held 26–365 s
  (medians) at gates 3–6 and spend 77–85 % of their runs with the scroll
  stopped.
- **It barely climbs:** 35 m of rendered rise for the whole run; 5.4 m net
  per side, 0.16–0.30 m/s, because local climbing is given back at every
  corner.
- **Death rarely ends a run; stalls do:** HULL FALLBACK absorbs about nine in
  ten lethal events (bots lose a median of 1 life per run).
- **Play uses the geometry:** 84 of 85 authored platforms are landed on by
  some run at desktop FAR and on both landscape phone frames (only 46 of 85
  in portrait, where nothing past gate 3 is ever seen).
- **Whole run** (desktop): 134.7 s perfect, 160.8 s at 1.5 s/kill, 204.8 s at
  3 s/kill.
- **Phones:** the 6 % landscape frame shows 62.6 × 28.3 tiles and, as a pure
  pull-in, cuts the top of the lattice (y −9.9 … 18.7 vs apexes at 17) — T-107
  should lift it ≈ 6 tiles — and puts 13 of 39 gate bodies within 6 tiles of
  the damage plane (desktop: none). **Defect:** in portrait 27 of 39 gate
  bodies stand off-screen and gate 3 becomes a 535–547 s wall that no bot
  passes.

**Recommended:**

1. **Sides of 176 tiles** (two of today's 88-tile bays): 2.4 desktop
   screens, 2.8 phone screens; 18.7 s for a racer, 29.2 s at the earned pace
   ceiling, 40.9 s at the floor; a six-side run of ≈ 2.5 min (racer) to ≈ 5
   min (floor) (§4.1).
2. **Follow-lead scroll:** the pursuing edge keeps a racer ≥ 0.3 view-widths
   from the right edge (22 tiles desktop, 18.8 on the phone), and a corner
   arms when the racer reaches it — nobody waits at a closed joint, and
   racing earns sight instead of costing it (§4.2).
3. **Rolling gates:** teach and test on the move; only the remix cell can
   hold the scroll, primed by RIG's proximity; beats bounded to seconds, not
   300 s; every gate body visible at every viewport (§4.3, T-201).
4. **A climb you can see:** 28–36 m of rendered rise per side (§4.4).
5. **Three levels of one Meridian** (structure A, operator Q1): **L1 THE LEG**
   (turns around the leg), **L2 RIBLINE & NECK** (a long straight up a
   ribline → flip indoor through the neck → back out of a vent higher), **L3
   SPINE & CROWN** (collar ratchets → Crown roots → the shipped Crown finale).
   Nine 176-tile sides, 1,584 tiles, 274 m; validated against the shipped
   track-archetype schema; every shipped authored strip and every one of the
   39 ecology rows reused once (§5).
6. **Chaining for a phone:** one climb with diegetic boundaries and a
   phone-first between-level card; a resume only if the operator wants one
   (§5.5, Q4–Q5).
7. **Art from the existing kit**, gaps named (§5.6).
8. **Four playable milestones** — race pass → long sides → a second level →
   the full climb — each a Pages release, ten task blocks whose acceptance
   boxes are behaviour tests that go red on the defect (§7).

**Conflicts named, not resolved (§6):** follow-lead vs entries 7/17
(horizontal tracking) and 11 (banked daylight); bounded beats vs entry 19
(a harder floor); a resume vs entries 0a and 19; level 1 losing the Crown
under structure A. **Legacy checks the plan collides with** are named for
rewrite or retirement under entry 21 (§7).

---

## 1. Method

### 1.1 What was built (all under `tools/simlab/race/`, zero effect on the game)

- **A headless six-face run.** `run-child.mjs` drives the real, unmodified
  `src/` simulation in Node at a fixed 1/60 s step — the default run with
  every default-on system live (momentum pace, CHARGE, HULL FALLBACK, aim
  assist, hit-stop). It transcribes `src/main.js`'s boot, the simulation half
  of `src/boot/run-reset.js`, and `update()`, and refuses to run if any of
  those drift (it re-reads both files). One fresh process per run.
- **The real camera's edges, analytically.** `edges.mjs` replicates
  `src/render/camera.js` calibrateEdges (FAR depth, portrait pullback,
  compact portrait multiplier, portrait look-drop, NDC inset). The sim reads
  these two numbers as the damage plane and the right clamp, and they also
  place spawns and gate formations — so a phone viewport changes the
  *simulation*, not only the picture.
- **Players.** `policies.mjs`: five seeded reflex styles — `rush` (always
  right, the racer), `climber` (takes every higher surface and ladder),
  `fighter` (mid-screen, target-first), `carried` (a novice the plane pushes
  along), `idle` (no input). Seeds vary lip timing, jump hold, aim accuracy
  and dodge reflexes, so one fixed course yields an outcome distribution.
  Bots perceive only hostiles inside the screen edges, as a player does
  (bullets are not edge-culled, so a bot that aimed at off-screen bodies
  would clear portrait gates no human could see — an earlier pass of this
  lab did exactly that and was discarded).
- **An instrument for the floor.** `instrument: "oracle"` breaks every
  materialized on-screen hostile through the game's own death path once it
  has been visible for 0 / 1.5 / 3 s, with `rush` movement. Latency 0 is the
  *authored floor* of every side and gate; 1.5 s and 3 s model a competent
  shooter's time-to-kill. It cannot kill what is off-screen, because a player
  cannot see it.
- **No legacy check is evidence here** (entry 21, landed while this lane
  ran): every number in §2 comes from driving the simulation like a player
  (or from authored data and source arithmetic, labelled as such), never
  from what an existing pathcheck domain asserts.
- **The matrix.** `lab.mjs baseline`: 4 policies × 12 seeds × 4 viewports +
  idle + oracle at three latencies × 3 seeds × 4 viewports = **232 runs**,
  600 s cap each. Viewports: desktop 1280×800 (FAR, shipped); phone landscape
  844×390 as shipped today (FAR on a phone, RIG 3.74 %); **phone landscape
  844×390 at RIG 6 %** — the addendum's closer phone frame, an *estimate*
  modelled the way the shipped `?view=` scales work (the FAR camera pulled
  along its depth axis only, to depth 26.6 = 1.184 × the base 22.5; T-107 may
  also move the look target — §4.5); and phone portrait 390×844 (shipped,
  secondary). Output: `artifacts/t104-race/baseline.json` (+ `.md`), with a
  per-run fingerprint; `lab.mjs check` re-runs and compares every one.

### 1.2 Is the replica the game?

Three pieces of evidence, all committed:

- **Edges.** `edges.mjs` reproduces the live page's 1280×800 FAR calibration
  recorded in `tools/simlab/t2lab.mjs` (`window.HB.edges()`:
  −27.438263128944797 / 45.73492361770374) to 1e-12, and re-reads
  `src/render/camera.js` on every run so a drifted copy refuses to run.
  Re-measured live for this document (`node tools/simlab/race/probe-framing.mjs`,
  `framing.json`): the shipped page's own `window.HB.edges()` matches the replica
  at **every** probed viewport to ≤ 3e-13 tiles — phone landscape 844×390
  (−38.975 / 60.184), phone portrait 390×844 with touch emulation (−2.015 /
  16.985), desktop 16:9 (−31.114 / 50.233) and desktop 16:10 (−27.438 /
  45.735) — and each row records that the nominal size gives the same edges as
  the aspect-equivalent size actually painted (the desktop rows run at 640×400
  and 960×540 because SwiftShader on this host could not paint the full sizes in
  time; in landscape the calibration depends only on aspect). One screenshot per
  viewport ships beside the JSON.
- **The whole sim path, frame-exact.** `browser-check.mjs` boots the real
  `index.html?testapi=1&fixeddt=16.667` in headless Chrome with the
  frame-input bootstrap `run.mjs --deterministic` uses (hold right and fire,
  a jump every 900 ms, three up-aim windows, 24 s), waits for the page's own
  timeline to finish, reads the frozen final state, replays the identical
  schedule through `run-child.mjs`'s transcription, and diffs every field —
  RIG's position and velocity to 1e-6, hp, lives, kills, weapon, scroll,
  corner state, and every live hostile's id, kind, state, position and hp.
  It runs at 640×400 because in landscape the calibration depends only on
  aspect (the page's own edges are recorded and compared too), which made a
  run feasible under SwiftShader on this shared host; the first attempt at
  1280×800 did not finish inside 30 minutes. Result:
  **MATCH** — 1440 ticks in both, final state identical
  (`artifacts/t104-race/browser-check-640x400.json`): RIG at x 112.25, y 3,
  velocity 0, hp 2, lives 3, weapon S, scroll 98, corner 1 in `gate`, kills 2,
  and all four live wasps identical in id, kind, state (`crosswindTell`,
  `cruise` ×3), position and hp; zero page errors; the page's live edges equal
  the analytic ones to 4e-7 (the page reports them rounded). The browser half
  took 67 minutes under SwiftShader on this loaded host, the replica 25 seconds.
- **Reproduction.** Every run carries a fingerprint over its summary and
  per-side metrics; `lab.mjs check` re-runs the committed matrix and compares
  them. Re-run at the end of this lane (a second full 232-run pass,
  3,847 s on 2 jobs): **digest `8ea94ef8`, identical**, and Tables M1–M6 came
  out byte-identical to the first pass (M7/M7b/M8 are new metrics added between
  the passes, so they exist only in the second). The single-run side tools
  (`sight.mjs`, `daylight.mjs`) print each run's fingerprint, and all seven
  quoted runs match the matrix's fingerprints for the same keys — so §2.7's
  decomposition and §4.5's traces come from the same runs as the tables, and
  `traceEveryMs` does not perturb the simulation.

### 1.3 What I could not measure (read before quoting anything)

1. **Humans.** Bots are reflex players. On sides 3–6 their gate times are
   dominated by how badly they handle armoured, rooted teaching bodies (Iris
   Polyp open windows, mortar perches): the median desktop `rush` bot is held
   61 / 28 / 288 s at gates 3 / 4 / 5 where the oracle at 1.5 s/kill is held
   ≤ 9.8 s (Table M3). Gate stalls are therefore quoted from the oracle rows;
   bot rows are quoted for *where a style spends its time, what it sees, and
   how it dies*, and for spread.
2. **Feel.** Nothing here says whether anything is fun, fast-feeling, or
   readable. Those are §8 questions.
3. **Touch input.** The lab simulates a phone's *framing*; touch controls are
   T-101's lane and a bot presses the same intent booleans either way.
4. **Frame-rate variance.** Fixed 1/60 s; the browser's variable step (≤ 50 ms
   clamp) can move outcomes by a frame.
5. **Closed-loop fidelity in Chrome.** The browser cross-check replays a
   static schedule frame-exactly; the harness cannot replay a closed-loop
   policy frame-exactly in Chrome, so policy runs are proven only by the
   replica's fidelity on the shared sim path.
6. **Render cost of the proposals.** Longer sides and steeper rise add
   prebuilt geometry; no perf number is claimed — T-204/T-205 must measure
   `worstMs`/`over20ms` (entry 18).
7. **The closer phone frame does not exist yet.** The 6 % frame is an
   estimate (pure depth pull-in from FAR); T-107 may also move the look
   target, change insets, or treat the notch. Re-run the lab at the built
   frame when T-107 lands.
8. **iPhone Safari.** Nothing here ran on an iPhone: no device frame times,
   no Safari storage behaviour, no touch latency. The lab's phone rows are a
   phone's *framing* applied to the same simulation.

---

## 2. The shipped run, measured

### 2.1 The course itself (static, `node tools/simlab/race/facts.mjs`)

| quantity | value | source |
| --- | --- | --- |
| sides × length | 6 × 88 tiles (+ 24 intro, 31 outro = 583) | `CONFIG.path` |
| corners / scroll halts | 112, 200, 288, 376, 464, 552 / each 14 tiles earlier | `src/pure/path.js` |
| gate prelude | cohort primed when the scroll is 18 tiles from the halt | `GATE_PRELUDE_TILES` |
| beats per gate | 3, 3, 4, 5, 4, 3 (39 bodies: 4–9 per gate) | `level1-ecology-encounters.js` |
| beat lock | a later beat waits up to **300 s** for the current one | `LEVEL1_ECOLOGY_BEAT_LOCK_MS` |
| ritual | 1.1 s per corner | `cornerEventTotalMs` |
| run speed / scroll | 9.4 t/s / 4.3 floor, 6.02 earned ceiling, 7.31 hard ceiling | `CONFIG.player`, `CONFIG.momentum` |
| one side at… | 20.5 s at the floor · 14.6 s at the earned ceiling · 9.4 s at run speed | 88 / speed |
| jump envelope | single apex 2.72 tiles, with air jump 5.07 | `CONFIG.player` |
| local lattice span | 10–15 tiles above each side's lowest deck | `VERTICAL_ASSAULT.spans` |
| rendered rise | **35 m for the whole run**: grade 0.062 (3.5°), **5.43 m per side** | `src/pure/ascent.js` |
| HUD ALT | helix altitude + local *y* (1 tile = 1 m on the HUD) | `src/ui/hud.js` |

How much route the player can see (FAR, `facts.json`; Chrome cross-check in
§1.2):

| viewport | visible route width | seconds of running it holds | seconds of floor scroll | one side = | local heights in frame (route plane) | RIG height |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| desktop 1280×800 (16:10), FAR | 73.2 tiles | 7.8 s | 17.0 s | 1.20 screens | −18.4 … 27.2 | 29.9 px (3.74 %) |
| desktop 1920×1080 (16:9), FAR | 81.3 tiles | 8.7 s | 18.9 s | 1.08 screens | −18.4 … 27.2 | 40.4 px (3.74 %) |
| phone landscape 844×390, FAR (shipped today) | 99.2 tiles | 10.6 s | 23.1 s | **0.89 screens** | −18.4 … 27.2 | **14.6 px** (3.74 %) |
| **phone landscape 844×390, RIG 6 % (addendum; estimate)** | **62.6 tiles** | **6.7 s** | 14.6 s | 1.41 screens | **−9.9 … 18.7** | 23.4 px (6 %) |
| phone portrait 390×844 (secondary) | **19.0 tiles** | **2.0 s** | 4.4 s | 4.63 screens | −24.5 … 29.4 | 26.8 px before the 1.5× actor gain |

The normal-run camera rides the render ascent, not RIG's height, so the
"local heights in frame" band is fixed in route coordinates. The shipped
lattice stands on decks at y 2–4 and tops out at y 12–17 (faces 1–6; the
authored apexes), with staged bodies up to y 17 — see §4.5 for what the
closer phone frame does to that.

### 2.2 – 2.7 Measured distributions

Tables M1–M8 (with M7b) are generated verbatim below by
`node tools/simlab/race/doc-tables.mjs --condensed` from
`artifacts/t104-race/baseline.json`; the complete per-viewport tables are in
`artifacts/t104-race/baseline.md`. "Oracle@L" rows are the instrument
(perfect shooter at L ms per kill, racer movement); the four named rows are
bots (12 seeds each); viewport "phone 6 %" is the estimated addendum frame.
Tables M2 and M4–M6 show desktop and the phone 6 % frame to stay readable;
`baseline.md` carries all four viewports.

**2.2 Seconds per side** (M1, M2). A perfect racer takes **17.9–21.9 s** per
side on desktop: 16.4–18.6 s while the scroll moves — **of which 5.3–5.9 s
standing at the closed joint** waiting for the scroll to reach the halt — then
0–3.3 s of gate and the 1.1 s ritual. Every style's moving time is 16–23 s
per side, because the scroll, not the player, sets it. Whole run (desktop):
**134.7 s** perfect, **160.8 s** at 1.5 s/kill, **204.8 s** at 3 s/kill; the
phone 6 % frame gives 133.7 / 146.9 / 205.1 s. Most bot runs reach the 600 s
cap: not because sides are long, but because gates hold them (2.3).

**2.3 Seconds stalled at each gate** (M3). The authored floor is small:
**0–3.9 s** per gate for a perfect shooter on desktop and landscape phones,
0–9.8 s at 1.5 s/kill, up to 15.9 s at 3 s/kill (medians 5.7–13.0 on desktop
and in the phone 6 % frame, 6.1–15.9 on today's FAR phone). But the structure — 3–5 beats
per gate, each released only by clearing the last, with a **300 s** lock as the
only fallback, and armoured rooted teachers (Iris Polyp, mortar) in the first
beats — makes holds explode for imperfect hands: bot medians are 0–20 s at
gates 1–2 and **26–365 s at gates 3–6**, with maxima at the 300 s lock
(desktop `rush` gate 5: median 287.6 s, max 445 s). Bots spend **77–85 %** of
their run with the scroll held (M5, desktop and phone 6 %).

**2.4 Vertical metres** (M4, desktop). Net HUD altitude is **5.4 m per side**
(6.0 on side 1) for every style but the climber (3.7–8.1): **0.16–0.30 m/s**
for the oracle, 0.04–0.23 m/s for bots. Players do climb locally — peak
5.6–17.6 m above the deck per side, 1.8–3.4 m/s of upward travel — but give
it all back at every corner, because each side starts again at deck level. The
whole run renders **35 m** of rise.

**2.5 Moving forward vs waiting** (M5). A perfect racer advances ≥ 1 t/s on
**49 %** of frames (desktop), the scroll is held on 21 %, and RIG is pinned
against the right clamp — screen edge or closed joint — on **44 %**. At
1.5 s/kill: 46 % / 32 % / 30 %. Bots: 20–29 % forward, 77–85 % held.

**2.6 Deaths per side** (M6, M1). A competent shooter loses no lives; 0–2
lethal events per side are absorbed by HULL FALLBACK. Bots take 0–3 lethal
events per side on sides 1–2 and 2–10 on sides 3–6 (gate fights), yet lose a
median **1 life per run** on desktop (lethal events per run, median 14–19):
the fallback absorbs about nine in ten (its streak re-arms on any 8 tiles of
rightward movement, even back and forth — §9). Game-overs happen, but a
stalled gate ends more runs than death does.

**2.7 How far ahead the player can see, and how much daylight is behind**
(M7, M7b; framing in §2.1). Measured as *route* ahead of RIG's front — the
right screen edge, clipped at the active corner's bend, because beyond the
bend the next side is round the limb and shows no route — on the frames where
the pursuing edge is moving:

- A **racer sees almost nothing ahead**: median **5 tiles** on desktop
  (p10 0, p90 25) and **1 tile** in the 6 % phone frame; **45 %** of a
  racer's moving frames on desktop and **54 %** in the 6 % phone frame have
  under 3 tiles of route in front of RIG (oracle@0; the `rush` bot is the
  same, 0 / 4 / 24 and 46 %).
- **A player who dawdles sees everything**: `fighter` 28 / 39 / 56 and
  `carried` 38 / 57 / 68 tiles on desktop, each with 1 % of frames under 3
  tiles. Sight is what you give up for speed, which is the inversion §4.2
  fixes.
- **Why a racer's view is empty** (`node tools/simlab/race/sight.mjs
  --preset racer`, which splits the climb frames — corner `idle`, sides
  1–6 — of one seed per row; its fingerprints match the matrix's):

  | run | at the closed joint | pinned at the right clamp | free | route ahead when free (p10 / median / p90) |
  | --- | ---: | ---: | ---: | --- |
  | oracle@0, desktop | 34 % | 8 % | 58 % | 4 / 14 / 27 tiles |
  | oracle@0, phone 6 % | 32 % | 20 % | 48 % | 2 / 11 / 24 tiles |
  | `rush` bot, desktop | 35 % | 4 % | 60 % | 4 / 12 / 28 tiles |

  A third of a racer's climbing is spent **standing at a joint that is shut
  until the scroll arrives** (route ahead is zero there by construction), and
  another 8 % on desktop — **20 % in the closer phone frame** — pressed
  against the right screen edge with 0.4 tiles in front of RIG. Even when
  free, the median is 11–14 tiles: **1.2–1.5 s** at run speed.
- **Behind RIG there is plenty** (M7b): a racer banks 41 / 56 / 70 tiles of
  daylight on desktop, 34 / 49 / 61 in the 6 % phone frame — the frame is
  mostly *behind* the player. Bots are tighter (desktop p10 5–10), and in the
  6 % phone frame they spend 8–22 % of frames under 3 tiles of daylight,
  almost all of it inside held gate fights (§4.5 rule 5).
- **Portrait sees nothing either way**: 0 / 0 / 0 tiles of route ahead on
  97 % of moving frames, with a fixed 15 tiles behind.

This is the measurement behind *"the faster you play, the less you see"*: it
is not a framing problem (desktop FAR shows 73 tiles) but a **pacing**
one — the scroll decides where RIG may stand, and a racer is parked at its
two walls.

**2.7b Which surfaces play actually uses** (M8). The lab records every
authored platform any run stood on. Across the matrix, **84 of 85** are landed
on at desktop FAR, today's FAR phone and the 6 % phone frame; the one nobody
reaches is `assault-f3-recovery`. In portrait only **46 of 85** are ever
touched — the sides beyond gate 3 are never seen (§2.8), which is what an
unreachable-by-play list looks like when the defect is a stall rather than
geometry. This is the shape of assertion §7 proposes to replace the authored
reachability counts with: *a platform no policy ever lands on* is a question
for the author, where *a platform that exists in the data* is not evidence of
anything.

M8's second half, seconds per side spent pressing forward into terrain while
not at the right clamp, is reported **with a confound**: as implemented the
counter also runs inside a held gate, and side 5's large numbers (desktop
`carried` median 30.3 s, `rush` 18.0 s) are exactly that — a traced `rush`
run spends 3,012 of its 3,073 near-still samples on side 5 inside the gate-5
fight, pressed against arena geometry while the 300 s beat lock runs, and
only 61 on the climb. The oracle rows, which clear gate 5 in seconds, show
**0.0 s on every side**. So nothing here says the climb's terrain stops a
racer; T-205's box must measure the same thing on climb frames only.

<!-- generated by node tools/simlab/race/doc-tables.mjs --condensed from artifacts/t104-race/baseline.json, digest 8ea94ef8 -->

**Table M1 — outcomes.** Cells: `median [min–max]` over the group's runs.

| group | viewport | n | outcomes | sides cleared | run s | lives lost | lethal events |
|---|---|---:|---|---|---|---|---|
| oracle@0 | desktop | 3 | victory 3 | 6 [6–6] | 134.7 [134.7–136.2] | 0 [0–0] | 0 [0–0] |
| oracle@1500 | desktop | 3 | victory 3 | 6 [6–6] | 160.8 [160.5–164.0] | 0 [0–0] | 4 [3–4] |
| oracle@3000 | desktop | 3 | victory 3 | 6 [6–6] | 204.8 [204.8–210.4] | 0 [0–0] | 7 [7–8] |
| rush | desktop | 12 | timeout 12 | 4 [4–5] | 600.0 [600.0–600.0] | 1 [0–2] | 16 [10–22] |
| climber | desktop | 12 | victory 4, timeout 8 | 4 [4–6] | 600.0 [327.9–600.0] | 1 [0–2] | 14 [11–22] |
| fighter | desktop | 12 | timeout 9, victory 3 | 5 [4–6] | 600.0 [401.0–600.0] | 1 [0–2] | 19 [13–29] |
| carried | desktop | 12 | timeout 8, game-over 2, victory 2 | 5 [2–6] | 600.0 [140.1–600.0] | 1 [0–3] | 17 [10–27] |
| idle | desktop | 1 | timeout 1 | 0 [0–0] | 600.0 [600.0–600.0] | 1 [1–1] | 3 [3–3] |
| oracle@0 | phone FAR | 3 | victory 3 | 6 [6–6] | 136.9 [136.9–143.1] | 0 [0–0] | 0 [0–0] |
| oracle@1500 | phone FAR | 3 | victory 3 | 6 [6–6] | 158.6 [155.5–182.0] | 0 [0–0] | 1 [1–3] |
| oracle@3000 | phone FAR | 3 | victory 3 | 6 [6–6] | 198.3 [198.3–216.6] | 0 [0–0] | 7 [6–7] |
| rush | phone FAR | 12 | timeout 11, game-over 1 | 4 [3–5] | 600.0 [243.4–600.0] | 2 [0–3] | 16 [10–24] |
| climber | phone FAR | 12 | timeout 10, victory 1, game-over 1 | 5 [1–6] | 600.0 [301.0–600.0] | 2 [0–3] | 16 [1–25] |
| fighter | phone FAR | 12 | timeout 10, victory 1, game-over 1 | 4 [2–6] | 600.0 [347.4–600.0] | 1 [0–3] | 16 [4–24] |
| carried | phone FAR | 12 | timeout 11, game-over 1 | 4 [0–4] | 600.0 [207.2–600.0] | 2 [0–3] | 16 [3–19] |
| idle | phone FAR | 1 | game-over 1 | 0 [0–0] | 330.0 [330.0–330.0] | 3 [3–3] | 5 [5–5] |
| oracle@0 | phone 6 % | 3 | victory 3 | 6 [6–6] | 133.7 [133.7–140.7] | 0 [0–0] | 0 [0–0] |
| oracle@1500 | phone 6 % | 3 | victory 3 | 6 [6–6] | 146.9 [145.8–154.5] | 0 [0–0] | 5 [4–5] |
| oracle@3000 | phone 6 % | 3 | victory 3 | 6 [6–6] | 205.1 [199.7–211.1] | 0 [0–0] | 5 [5–8] |
| rush | phone 6 % | 12 | timeout 9, game-over 2, victory 1 | 5 [2–6] | 600.0 [170.3–600.0] | 1 [1–3] | 19 [11–27] |
| climber | phone 6 % | 12 | timeout 11, victory 1 | 5 [4–6] | 600.0 [438.1–600.0] | 1 [0–2] | 17 [9–24] |
| fighter | phone 6 % | 12 | timeout 10, game-over 2 | 5 [2–5] | 600.0 [183.7–600.0] | 1 [0–3] | 17 [4–35] |
| carried | phone 6 % | 12 | game-over 5, timeout 5, victory 2 | 4 [2–6] | 485.1 [186.7–600.0] | 2 [0–3] | 25 [12–25] |
| idle | phone 6 % | 1 | game-over 1 | 0 [0–0] | 326.4 [326.4–326.4] | 3 [3–3] | 5 [5–5] |
| oracle@0 | portrait | 3 | timeout 2, victory 1 | 2 [2–6] | 600.0 [423.8–600.0] | 0 [0–0] | 0 [0–0] |
| oracle@1500 | portrait | 3 | timeout 3 | 2 [2–2] | 600.0 [600.0–600.0] | 0 [0–0] | 0 [0–0] |
| oracle@3000 | portrait | 3 | timeout 3 | 2 [2–2] | 600.0 [600.0–600.0] | 0 [0–0] | 0 [0–0] |
| rush | portrait | 12 | timeout 12 | 2 [2–2] | 600.0 [600.0–600.0] | 0 [0–0] | 0 [0–2] |
| climber | portrait | 12 | timeout 12 | 2 [2–2] | 600.0 [600.0–600.0] | 0 [0–0] | 0 [0–1] |
| fighter | portrait | 12 | timeout 11, game-over 1 | 2 [2–2] | 600.0 [72.9–600.0] | 1 [0–3] | 8 [2–12] |
| carried | portrait | 12 | timeout 11, game-over 1 | 2 [1–2] | 600.0 [62.2–600.0] | 1 [0–3] | 9 [6–11] |
| idle | portrait | 1 | game-over 1 | 0 [0–0] | 21.8 [21.8–21.8] | 3 [3–3] | 5 [5–5] |

**Table M2 — seconds per side.** Cell: `total (moving / waiting at the closed joint / gate held)`, medians over sides cleared. "Waiting at the joint" is part of "moving": the scroll is still running while RIG stands at the closed joint.

| group | viewport | side 1 | side 2 | side 3 | side 4 | side 5 | side 6 |
|---|---|---|---|---|---|---|---|
| oracle@0 | desktop | 21.9 (18.6 / 5.8 / 1.9) | 19.9 (16.4 / 5.8 / 2.1) | 21.1 (16.7 / 5.3 / 3.0) | 17.9 (16.7 / 5.8 / 0.0) | 21.8 (17.2 / 5.8 / 3.3) | 18.0 (16.9 / 5.9 / 0.0) |
| oracle@1500 | desktop | 27.7 (20.2 / 5.7 / 5.0) | 18.1 (16.9 / 5.8 / 0.0) | 26.4 (17.0 / 5.8 / 6.7) | 28.4 (16.6 / 5.8 / 9.2) | 28.8 (18.1 / 6.2 / 7.8) | 25.7 (17.8 / 5.3 / 5.2) |
| oracle@3000 | desktop | 30.7 (19.4 / 6.0 / 5.8) | 27.6 (17.4 / 5.3 / 6.6) | 30.8 (17.2 / 5.8 / 10.9) | 32.1 (16.8 / 5.2 / 13.0) | 33.8 (18.1 / 6.0 / 12.8) | 29.2 (17.4 / 5.8 / 8.9) |
| rush | desktop | 35.7 (20.1 / 6.2 / 11.3) | 30.4 (17.5 / 6.1 / 9.1) | 82.3 (17.4 / 6.2 / 61.3) | 48.5 (17.2 / 5.8 / 28.4) | 140.4 (17.9 / 6.5 / 118.0) | — (0/5) |
| climber | desktop | 35.3 (19.8 / 6.2 / 10.9) | 31.1 (17.1 / 6.2 / 9.3) | 76.8 (17.1 / 6.2 / 55.9) | 56.9 (17.2 / 6.2 / 35.7) | 98.3 (17.5 / 6.3 / 76.5) | 49.1 (17.2 / 6.1 / 29.3) |
| fighter | desktop | 26.2 (22.8 / 0.0 / 0.0) | 27.1 (19.7 / 0.0 / 4.0) | 90.7 (20.1 / 0.0 / 66.0) | 49.9 (20.4 / 0.0 / 26.0) | 143.6 (21.0 / 0.0 / 119.5) | 108.4 (21.1 / 0.0 / 84.1) |
| carried | desktop | 34.8 (23.0 / 0.0 / 7.4) | 28.2 (20.2 / 0.0 / 1.6) | 67.9 (20.4 / 0.0 / 42.8) | 54.5 (20.5 / 0.0 / 30.6) | 94.9 (20.8 / 0.0 / 70.3) | 96.5 (20.4 / 0.0 / 73.7) |
| oracle@0 | phone 6 % | 19.8 (18.6 / 5.1 / 0.0) | 17.5 (16.3 / 5.0 / 0.0) | 21.1 (16.8 / 5.1 / 3.0) | 21.7 (16.6 / 5.1 / 3.9) | 21.3 (16.8 / 5.1 / 3.3) | 18.0 (16.9 / 5.2 / 0.0) |
| oracle@1500 | phone 6 % | 20.8 (19.6 / 5.4 / 0.0) | 18.3 (17.0 / 5.1 / 0.0) | 18.2 (17.0 / 5.1 / 0.0) | 28.3 (16.7 / 4.8 / 9.1) | 19.3 (18.1 / 5.5 / 0.0) | 26.0 (18.1 / 5.2 / 5.1) |
| oracle@3000 | phone 6 % | 28.7 (19.3 / 5.2 / 5.7) | 27.5 (17.0 / 5.0 / 7.4) | 30.7 (17.2 / 5.1 / 10.8) | 32.4 (16.7 / 5.0 / 13.0) | 33.4 (17.8 / 5.5 / 12.7) | 28.8 (17.5 / 5.1 / 8.5) |
| rush | phone 6 % | 40.8 (19.9 / 5.4 / 16.4) | 29.9 (17.4 / 5.4 / 8.6) | 104.0 (17.3 / 5.4 / 81.8) | 46.8 (17.3 / 5.4 / 26.4) | 119.1 (18.0 / 5.7 / 96.3) | 51.8 (17.8 / 5.7 / 31.7) |
| climber | phone 6 % | 37.7 (19.6 / 5.4 / 14.3) | 29.1 (17.0 / 5.4 / 8.5) | 64.8 (17.0 / 5.4 / 43.4) | 52.4 (17.1 / 5.4 / 32.6) | 168.9 (17.3 / 5.6 / 147.3) | 44.4 (17.9 / 5.3 / 22.8) |
| fighter | phone 6 % | 28.8 (22.8 / 0.0 / 1.8) | 28.7 (19.7 / 0.0 / 5.4) | 68.0 (20.4 / 0.0 / 42.8) | 55.6 (20.4 / 0.0 / 32.9) | 77.5 (20.9 / 0.0 / 52.4) | — (0/6) |
| carried | phone 6 % | 46.9 (23.1 / 0.0 / 19.6) | 25.6 (20.1 / 0.0 / 0.0) | 103.9 (20.3 / 0.0 / 79.5) | 68.4 (20.4 / 0.0 / 43.7) | 147.3 (20.9 / 0.0 / 123.8) | 64.3 (20.8 / 0.0 / 41.0) |
| oracle@0 | portrait | 19.5 (18.3 / 0.3 / 0.0) | 18.1 (15.5 / 0.3 / 1.1) | 16.7 (15.5 / 0.3 / 0.0) | 16.8 (15.6 / 0.3 / 0.0) | 318.3 (15.8 / 0.3 / 301.2) | 19.5 (16.1 / 0.3 / 2.1) |
| oracle@1500 | portrait | 25.1 (18.6 / 0.4 / 4.8) | 20.8 (16.9 / 0.4 / 1.7) | — (0/3) | — (0/0) | — (0/0) | — (0/0) |
| oracle@3000 | portrait | 26.4 (18.5 / 0.4 / 5.9) | 20.1 (16.6 / 0.4 / 1.7) | — (0/3) | — (0/0) | — (0/0) | — (0/0) |
| rush | portrait | 33.0 (18.5 / 0.4 / 12.2) | 21.9 (16.0 / 0.4 / 3.3) | — (0/12) | — (0/0) | — (0/0) | — (0/0) |
| climber | portrait | 28.2 (18.4 / 0.4 / 7.7) | 17.2 (16.0 / 0.4 / 0.0) | — (0/12) | — (0/0) | — (0/0) | — (0/0) |
| fighter | portrait | 30.7 (23.1 / 0.0 / 5.4) | 24.4 (20.2 / 0.0 / 1.8) | — (0/12) | — (0/0) | — (0/0) | — (0/0) |
| carried | portrait | 41.9 (23.1 / 0.0 / 16.1) | 23.0 (20.5 / 0.0 / 0.0) | — (0/11) | — (0/0) | — (0/0) | — (0/0) |

**Table M3 — seconds the scroll is held in `gate` per side** (every side reached, cleared or not; `median [min–max]`).

| group | viewport | gate 1 | gate 2 | gate 3 | gate 4 | gate 5 | gate 6 |
|---|---|---|---|---|---|---|---|
| oracle@0 | desktop | 1.9 [0.0–1.9] | 2.1 [2.1–2.1] | 3.0 [3.0–3.0] | 0.0 [0.0–3.9] | 3.3 [0.0–3.3] | 0.0 [0.0–2.1] |
| oracle@1500 | desktop | 5.0 [0.0–5.0] | 0.0 [0.0–4.4] | 6.7 [0.0–7.5] | 9.2 [0.0–9.8] | 7.8 [0.0–7.8] | 5.2 [5.2–5.2] |
| oracle@3000 | desktop | 5.8 [5.7–8.1] | 6.6 [6.2–7.4] | 10.9 [10.8–12.4] | 13.0 [12.4–13.7] | 12.8 [10.4–12.8] | 8.9 [8.7–8.9] |
| rush | desktop | 11.3 [6.7–21.8] | 9.1 [6.2–316.4] | 61.3 [20.8–110.8] | 28.4 [17.8–47.8] | 287.6 [20.4–445.1] | 242.5 [0.0–260.2] |
| climber | desktop | 10.9 [8.5–19.4] | 9.3 [6.5–18.9] | 55.9 [24.3–82.7] | 35.7 [18.6–78.1] | 365.1 [53.8–401.4] | 33.2 [13.0–225.1] |
| fighter | desktop | 0.0 [0.0–15.6] | 4.0 [0.0–7.0] | 66.0 [0.0–126.2] | 26.0 [0.0–85.0] | 244.2 [50.7–421.4] | 85.9 [0.0–377.7] |
| carried | desktop | 7.4 [0.0–32.2] | 1.6 [0.0–313.6] | 50.5 [0.0–95.1] | 30.6 [18.2–69.3] | 131.1 [15.7–390.5] | 219.8 [52.2–314.8] |
| oracle@0 | phone FAR | 0.0 [0.0–1.9] | 2.1 [0.0–2.1] | 0.0 [0.0–3.0] | 3.9 [3.9–3.9] | 0.0 [0.0–3.3] | 2.1 [2.1–2.1] |
| oracle@1500 | phone FAR | 0.0 [0.0–5.0] | 0.0 [0.0–5.0] | 7.5 [7.3–7.6] | 9.1 [0.0–9.3] | 7.6 [0.0–7.7] | 5.2 [5.1–5.2] |
| oracle@3000 | phone FAR | 6.1 [5.6–6.5] | 8.2 [5.9–8.2] | 12.0 [0.0–12.1] | 15.9 [12.0–15.9] | 12.4 [0.0–12.4] | 8.3 [8.2–8.4] |
| oracle@0 | phone 6 % | 0.0 [0.0–1.9] | 0.0 [0.0–2.1] | 3.0 [3.0–3.0] | 3.9 [3.9–3.9] | 3.3 [3.3–3.3] | 0.0 [0.0–2.1] |
| oracle@1500 | phone 6 % | 0.0 [0.0–5.0] | 0.0 [0.0–5.2] | 0.0 [0.0–0.0] | 9.1 [0.0–9.3] | 0.0 [0.0–7.8] | 5.1 [0.0–5.2] |
| oracle@3000 | phone 6 % | 5.7 [5.7–8.3] | 7.4 [6.7–7.4] | 10.8 [8.4–11.9] | 13.0 [12.0–15.8] | 12.7 [12.7–12.8] | 8.5 [8.5–8.8] |
| rush | phone 6 % | 16.4 [7.8–26.6] | 8.6 [7.0–13.5] | 83.3 [19.2–141.3] | 26.6 [16.2–93.6] | 178.4 [77.7–415.6] | 183.5 [31.7–280.2] |
| climber | phone 6 % | 14.3 [9.3–22.7] | 8.5 [6.3–12.4] | 43.4 [24.3–100.4] | 32.6 [19.4–41.9] | 148.1 [54.2–408.5] | 236.2 [18.8–296.3] |
| fighter | phone 6 % | 1.8 [0.0–10.5] | 5.4 [0.0–20.9] | 49.5 [0.0–515.0] | 32.9 [0.0–105.1] | 155.7 [0.0–402.7] | 327.7 [10.8–450.9] |
| carried | phone 6 % | 19.6 [0.0–43.9] | 0.0 [0.0–5.0] | 93.4 [0.0–350.5] | 46.0 [0.0–82.0] | 244.8 [98.4–357.6] | 41.6 [26.4–228.3] |
| oracle@0 | portrait | 0.0 [0.0–0.0] | 1.1 [1.1–1.1] | 546.9 [0.0–546.9] | 0.0 [0.0–0.0] | 301.2 [301.2–301.2] | 2.1 [2.1–2.1] |
| oracle@1500 | portrait | 4.8 [4.3–4.8] | 1.7 [0.0–2.1] | 538.8 [538.1–541.9] | — | — | — |
| oracle@3000 | portrait | 5.9 [5.6–6.2] | 1.7 [0.0–4.1] | 537.6 [535.2–539.4] | — | — | — |

**Table M4 — vertical metres, desktop** (medians over sides; HUD metres). `peak` = highest local y above the side's lowest deck; `net` = HUD ALT gained from this side's entry to the next side's entry; `up/s` = all upward travel per second.

| group | peak above deck, sides 1–6 | net ALT m per side | net ALT m/s | climb-up m/s |
|---|---|---|---|---|
| oracle@0 | 7.0 · 13.6 · 14.6 · 13.7 · 16.6 · 5.6 | 6.0 · 5.4 · 5.4 · 5.4 · 5.4 · 5.4 | 0.27 · 0.27 · 0.26 · 0.30 · 0.25 · 0.30 | 1.80 · 2.10 · 2.27 · 2.41 · 2.00 · 1.86 |
| oracle@1500 | 9.7 · 13.6 · 14.6 · 15.6 · 12.6 · 17.6 | 6.0 · 5.4 · 5.4 · 5.4 · 5.4 · 5.4 | 0.22 · 0.30 · 0.21 · 0.19 · 0.19 · 0.21 | 2.69 · 2.48 · 2.38 · 2.45 · 2.26 · 2.64 |
| oracle@3000 | 12.6 · 13.6 · 14.6 · 15.6 · 16.4 · 17.6 | 6.0 · 5.4 · 5.4 · 5.4 · 5.4 · 5.4 | 0.20 · 0.20 · 0.18 · 0.17 · 0.16 · 0.19 | 2.69 · 2.66 · 2.59 · 2.75 · 2.38 · 2.52 |
| rush | 9.7 · 13.6 · 14.6 · 15.6 · 16.2 · 17.6 | 6.0 · 5.4 · 5.4 · 5.4 · 5.4 · — | 0.17 · 0.18 · 0.07 · 0.11 · 0.04 · — | 2.70 · 2.71 · 2.84 · 2.74 · 2.97 · — |
| climber | 12.6 · 13.6 · 14.6 · 15.6 · 16.6 · 17.6 | 8.1 · 6.0 · 4.8 · 5.4 · 3.7 · 4.8 | 0.23 · 0.19 · 0.06 · 0.09 · 0.04 · 0.09 | 3.44 · 3.31 · 3.22 · 3.25 · 3.14 · 2.87 |
| fighter | 9.7 · 13.6 · 14.6 · 15.6 · 16.6 · 11.3 | 6.0 · 5.4 · 5.4 · 5.4 · 5.4 · 5.4 | 0.23 · 0.20 · 0.06 · 0.11 · 0.04 · 0.05 | 3.27 · 3.00 · 3.09 · 2.98 · 2.95 · 3.12 |
| carried | 9.7 · 13.6 · 14.6 · 14.7 · 14.6 · 11.8 | 6.0 · 5.4 · 5.4 · 5.4 · 5.4 · 5.4 | 0.17 · 0.19 · 0.08 · 0.10 · 0.06 · 0.06 | 2.72 · 2.39 · 2.73 · 2.59 · 2.28 · 2.98 |

**Table M5 — moving forward vs waiting** (whole run, share of frames; `median [min–max]`).

| group | viewport | forward ≥ 1 t/s | scroll held | pinned at right clamp | idle (A.5) |
|---|---|---|---|---|---|
| oracle@0 | desktop | 49% [49–49] | 21% [21–21] | 44% [44–44] | 8% [8–8] |
| oracle@1500 | desktop | 46% [45–46] | 32% [31–32] | 30% [30–31] | 5% [5–5] |
| oracle@3000 | desktop | 41% [40–41] | 46% [46–47] | 24% [22–27] | 7% [6–7] |
| rush | desktop | 20% [14–33] | 85% [82–85] | 7% [6–9] | 22% [4–60] |
| climber | desktop | 20% [16–35] | 85% [66–85] | 9% [8–19] | 36% [5–55] |
| fighter | desktop | 25% [16–37] | 79% [68–82] | 1% [1–2] | 33% [6–65] |
| carried | desktop | 26% [16–42] | 79% [54–86] | 1% [0–2] | 27% [9–66] |
| idle | desktop | 2% [2–2] | 96% [96–96] | 0% [0–0] | 99% [99–99] |
| oracle@0 | phone 6 % | 51% [50–51] | 21% [21–24] | 49% [49–54] | 8% [8–12] |
| oracle@1500 | phone 6 % | 49% [48–51] | 25% [24–28] | 33% [31–38] | 3% [2–4] |
| oracle@3000 | phone 6 % | 43% [41–43] | 47% [46–47] | 28% [24–28] | 6% [5–6] |
| rush | phone 6 % | 25% [17–36] | 82% [68–85] | 9% [7–16] | 25% [5–52] |
| climber | phone 6 % | 22% [19–31] | 82% [75–85] | 11% [10–15] | 30% [5–49] |
| fighter | phone 6 % | 20% [16–39] | 79% [63–89] | 1% [0–2] | 53% [6–62] |
| carried | phone 6 % | 29% [21–36] | 77% [66–85] | 1% [1–2] | 16% [7–53] |
| idle | phone 6 % | 5% [5–5] | 93% [93–93] | 0% [0–0] | 98% [98–98] |

**Table M6 — deaths per side.** Cell: `lethal events / lives spent` (medians; a lethal event is a HULL FALLBACK absorbed or a life spent).

| group | viewport | side 1 | side 2 | side 3 | side 4 | side 5 | side 6 |
|---|---|---|---|---|---|---|---|
| oracle@0 | desktop | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| oracle@1500 | desktop | 0 / 0 | 1 / 0 | 0 / 0 | 0 / 0 | 1 / 0 | 1 / 0 |
| oracle@3000 | desktop | 0 / 0 | 1 / 0 | 2 / 0 | 1 / 0 | 2 / 0 | 0 / 0 |
| rush | desktop | 1 / 0 | 1 / 0 | 5 / 1 | 3 / 0 | 4 / 0 | 3 / 0 |
| climber | desktop | 1 / 0 | 0 / 0 | 5 / 1 | 3 / 0 | 3 / 0 | 2 / 0 |
| fighter | desktop | 1 / 0 | 0 / 0 | 7 / 1 | 4 / 0 | 5 / 0 | 5 / 0 |
| carried | desktop | 1 / 0 | 0 / 0 | 7 / 0 | 4 / 0 | 3 / 0 | 6 / 0 |
| oracle@0 | phone 6 % | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| oracle@1500 | phone 6 % | 0 / 0 | 0 / 0 | 1 / 0 | 0 / 0 | 1 / 0 | 1 / 0 |
| oracle@3000 | phone 6 % | 0 / 0 | 1 / 0 | 1 / 0 | 1 / 0 | 1 / 0 | 1 / 0 |
| rush | phone 6 % | 2 / 0 | 1 / 0 | 7 / 1 | 3 / 0 | 6 / 0 | 4 / 0 |
| climber | phone 6 % | 1 / 0 | 1 / 0 | 4 / 1 | 3 / 0 | 6 / 0 | 4 / 0 |
| fighter | phone 6 % | 0 / 0 | 1 / 0 | 6 / 0 | 4 / 0 | 5 / 0 | 6 / 1 |
| carried | phone 6 % | 3 / 0 | 0 / 0 | 10 / 1 | 4 / 0 | 7 / 0 | 6 / 0 |

**Table M7 — how far ahead RIG can see.** Tiles of ROUTE ahead of RIG's front (to the right screen edge, clipped at the active corner's bend — beyond it the next side is round the limb), counted only on frames where the pursuing edge is moving (the race, not a held gate). `p10 / median / p90`; in brackets the share of those frames with < 3 tiles of route visible.

| group | desktop | phone FAR | phone 6 % | portrait |
|---|---|---|---|---|
| oracle@0 | 0 / 5 / 25 (45%) | 0 / 15 / 39 (40%) | 0 / 1 / 21 (54%) | 0 / 0 / 0 (97%) |
| oracle@1500 | 0 / 6 / 25 (41%) | 0 / 15 / 39 (41%) | 0 / 3 / 21 (47%) | 0 / 0 / 3 (89%) |
| oracle@3000 | 0 / 5 / 24 (45%) | 0 / 16 / 38 (40%) | 0 / 2 / 20 (52%) | 0 / 0 / 2 (90%) |
| rush | 0 / 4 / 24 (46%) | 0 / 16 / 38 (40%) | 0 / 1 / 20 (55%) | 0 / 0 / 1 (92%) |
| climber | 0 / 0 / 25 (57%) | 0 / 9 / 39 (46%) | 0 / 0 / 21 (62%) | 0 / 0 / 0 (97%) |
| fighter | 28 / 39 / 56 (1%) | 25 / 51 / 61 (1%) | 25 / 34 / 50 (1%) | 9 / 12 / 16 (1%) |
| carried | 38 / 57 / 68 (1%) | 51 / 70 / 87 (1%) | 33 / 51 / 58 (1%) | 11 / 13 / 14 (1%) |
| idle | 45 / 64 / 72 (0%) | 57 / 77 / 97 (0%) | 40 / 59 / 61 (0%) | 16 / 17 / 17 (0%) |

**Table M7b — daylight behind RIG.** Tiles from RIG's back to the damage plane (the left edge) on every PLAYING frame: the margin entry 11 banks, and the crush margin. `p10 / median / p90`; in brackets the share of frames with < 3 tiles.

| group | desktop | phone FAR | phone 6 % | portrait |
|---|---|---|---|---|
| oracle@0 | 41 / 56 / 70 (0%) | 53 / 68 / 83 (0%) | 34 / 49 / 61 (0%) | 15 / 15 / 17 (0%) |
| oracle@1500 | 30 / 54 / 67 (0%) | 42 / 67 / 82 (0%) | 29 / 49 / 60 (0%) | 15 / 15 / 15 (0%) |
| oracle@3000 | 27 / 50 / 68 (0%) | 37 / 63 / 80 (0%) | 19 / 43 / 60 (0%) | 15 / 15 / 15 (0%) |
| rush | 10 / 19 / 55 (0%) | 23 / 35 / 67 (0%) | 2 / 13 / 50 (15%) | 15 / 15 / 15 (0%) |
| climber | 10 / 24 / 57 (0%) | 21 / 34 / 69 (0%) | 2 / 14 / 50 (14%) | 15 / 15 / 15 (0%) |
| fighter | 9 / 22 / 32 (1%) | 12 / 23 / 43 (0%) | 2 / 7 / 26 (22%) | 3 / 6 / 8 (5%) |
| carried | 5 / 11 / 26 (1%) | 7 / 13 / 35 (1%) | 3 / 8 / 22 (8%) | 3 / 5 / 6 (9%) |
| idle | 0 / 0 / 0 (99%) | 0 / 0 / 0 (97%) | 0 / 0 / 0 (98%) | 0 / 0 / 1 (94%) |

**Table M8 — reachability by play and terrain stalls.** Authored platforms that at least one run of the matrix stood on, per viewport (union over every policy and seed), and seconds per side a policy pressed forward against terrain while not at the right clamp.

| viewport | authored platforms landed on | never landed on |
|---|---|---|
| desktop | 84 of 85 | assault-f3-recovery |
| phone FAR | 84 of 85 | assault-f3-recovery |
| phone 6 % | 84 of 85 | assault-f3-recovery |
| portrait | 46 of 85 | arena-f4-high, arena-f4-mid, arena-f4-perch, arena-f5-high, arena-f5-third, arena-f6-high, arena-f6-third, arrival-f5, assault-f3-recovery, assault-f4-approach-relay, assault-f4-arrival-upper, assault-f4-escape-bridge, assault-f4-recovery, assault-f4-transit-1, assault-f4-transit-2, assault-f4-vent-high-right, assault-f4-vent-mid-right, assault-f5-arrival-upper, assault-f5-braid-high-a, assault-f5-braid-high-b, assault-f5-braid-low-b, assault-f5-braid-mid-a, assault-f5-crossover, assault-f5-recovery, assault-f5-transit-1, assault-f5-transit-2, assault-f6-approach-relay, assault-f6-arrival-upper, assault-f6-root-high-left, assault-f6-root-high-right, assault-f6-root-mid-left, assault-f6-root-mid-right, assault-f6-root-recovery, assault-f6-root-upper-cross, assault-f6-transit-1, assault-f6-transit-2, pocket-shelf-f4, pocket-shelf-f5, pocket-shelf-f6 |

| group | viewport | terrain-stall s, sides 1–6 (median) |
|---|---|---|
| oracle@0 | desktop | 0.0 · 0.0 · 0.0 · 0.0 · 0.0 · 0.0 |
| rush | desktop | 0.0 · 0.0 · 0.0 · 0.0 · 18.0 · 0.0 |
| climber | desktop | 0.0 · 0.0 · 0.0 · 0.0 · 6.0 · 0.0 |
| fighter | desktop | 0.0 · 0.0 · 0.0 · 0.0 · 6.6 · 0.0 |
| carried | desktop | 0.0 · 0.0 · 0.1 · 0.0 · 30.3 · 0.1 |
| oracle@0 | phone 6 % | 0.0 · 0.0 · 0.0 · 0.0 · 0.0 · 0.0 |
| rush | phone 6 % | 0.0 · 0.0 · 0.1 · 0.0 · 6.9 · 0.0 |
| climber | phone 6 % | 0.0 · 0.0 · 0.0 · 0.0 · 7.3 · 0.0 |
| fighter | phone 6 % | 0.0 · 0.0 · 0.0 · 0.0 · 3.9 · 0.0 |
| carried | phone 6 % | 0.0 · 0.0 · 0.0 · 0.1 · 7.0 · 0.0 |

### 2.8 A phone defect found on the way: a gate beat that waits off-screen

`node tools/simlab/race/gate-view.mjs` (static; `gate-view.json`) resolves
every authored gate row to its Vertical Assault staging socket exactly as
`src/sim/wavegate.js` does, and asks whether that socket is inside the view
the player has while the gate holds the scroll at `HALT_S`:

| viewport | gate bodies outside the held view | gates affected | first (teaching) beats outside |
| --- | ---: | --- | --- |
| desktop 1280×800 | 0 of 39 | — | — |
| desktop 1920×1080 | 0 of 39 | — | — |
| phone landscape 844×390, FAR (shipped) | 0 of 39 | — | — |
| phone landscape 844×390, RIG 6 % (estimate) | 0 of 39 | — | — |
| **phone portrait 390×844** | **27 of 39** | 1, 2, 3, 4, 5, 6 | gate 1 crosswind, gate 2 railfang, gate 3 polyp-needle, gate 5 polyp-gateweaver, gate 6 crosswind + railfang + needle |

All 27 sit **behind the damage plane** (2.99–16.99 tiles left of the left
edge). Wasps fly to RIG and hounds charge along the deck, so most of these
eventually come into view — but **rooted teachers cannot**: gate 3's
polyp-needle is 6.0 tiles behind the edge and gate 5's polyp-gateweaver 17.0.
A beat must be cleared before the next one condenses, and an uncleared beat
holds for `LEVEL1_ECOLOGY_BEAT_LOCK_MS` = 300 s. Measured with the on-screen
oracle (a perfect shooter who can only shoot what is visible), gate 3 holds
**547 s** in 2 of 3 runs (the third killed the polyp during the moving
prelude, when it was briefly on screen, then sat **301 s** at gate 5); at 1.5
and 3 s per kill all six oracle runs are held **535–542 s** at gate 3 until
the 600 s cap; and **no bot run in portrait passes gate 3** — 47 of 48 clear
exactly 2 sides (46 run to the cap inside gate 3, one dies there), and the
48th died on side 2 (M1, M3). Gate 3 has four beats, so an off-screen teacher
there can hold the climb for up to 900 s.
Bullets are not edge-culled (`src/sim/weapons.js` culls on lifetime and bends
only), so a blind shot *can* clear it — the gate is passable only by luck.

**Visible is not the same as fightable.** The same script measures how far
each visible body stands from the damage plane in the held view: ≥ 8.4 tiles
on desktop and ≥ 20 in today's FAR phone frame, but in the estimated 6 % phone
frame 13 of 39 stand within 6 tiles of it (nearest 1.6), and bots there spend
8–22 % of their frames with under 3 tiles of daylight behind them (desktop
0–1 %, Table M7b) — see §4.5 rule 5.

A real defect in a supported orientation: the addendum makes landscape the
tuning target and keeps portrait working, and a five-minute hold that no
player can act their way out of on purpose is not "working". It is not a
softlock in LANE-BRIEF's strict sense (the 300 s lock releases), so it is
proposed at S2 rather than S1 (§9) and fixed by T-201. Landscape phones and
desktop are unaffected (0 of 39).

---

## 3. Diagnosis — why the sides feel short and the run reads stop-and-clear

Six findings, each from §2's measurements, each answered by a change in §4
or §5.

1. **A side is about one screen, and the scroll sets its length.** 88 tiles
   is 1.20 desktop screens, 0.89 on today's landscape phone, 1.41 in the 6 %
   phone frame; every play style spends 16–23 s moving per side whatever it
   does (M2). *"The sides are a little short"* is measurable: a side is
   barely longer than what the player sees on arriving at it. → §4.1.
2. **The faster you play, the less you see and the longer you wait.** A
   perfect racer is pinned against the right clamp on 44–49 % of frames
   (M5), sees a median of 5 tiles of route ahead while the scroll moves and
   has under 3 tiles on 45 % of those frames (M7; 1 tile and 54 % in the 6 %
   phone frame), and stands ≈ 5–6 s per side — over a quarter of the side, a
   third of its climb frames — at a closed joint while the scroll catches up
   (M2, §2.7). The run punishes exactly the play entry 20 asks for.
   → §4.2.
3. **The climb is mostly not a climb.** The whole run renders 35 m of rise
   (5.4 m per side); players climb 1.8–3.4 m/s locally and give it all back
   at every corner, netting 0.16–0.30 m/s (M4). A *race to the top* has
   nothing at the top to race toward. → §4.4, §5.2.
4. **Gates are cheap for a good shooter and a wall for everyone else.** The
   authored floor is 0–3.9 s per gate, but a gate is a chain of 3–5 beats
   released one by one, with armoured rooted teachers early in the chain and
   a 300 s lock as the only fallback; imperfect hands are held 26–365 s at
   gates 3–6 and spend most of the run with the scroll stopped (M3, M5). That
   is stop-and-clear, not a race. → §4.3.
5. **Death rarely ends a run; stalls do.** HULL FALLBACK absorbs about nine in
   ten lethal events, so bots lose a median of one life per run while most
   of their runs end at the time cap inside a gate (M1, M6). In the bot
   distributions, the spread entry 19 protects is mostly a spread of *how
   long a run is held at a gate*; whether that is the spread the operator
   means by "sometimes two or three faces, sometimes not past the first" is
   his to say — the lab cannot. → §4.3.
6. **Portrait cannot see its own gates.** 27 of 39 gate bodies stand outside
   the held portrait view and gate 3 becomes a 535–547 s wall (§2.8).
   Landscape phones (FAR and 6 %) and desktop see every body, but the 6 %
   frame puts 13 of them within 6 tiles of the damage plane (§2.8, §4.5).
   → T-201.

---

## 4. Level 1 as a race

Four changes, each a pace/lattice/presentation lever (never a movement
constant), each shippable on today's six-face run before any restructure,
each behind a flag until the operator judges it (entry 16).

### 4.1 Side length and vertical span — the arithmetic

Symbols: *F* side length in tiles; *W* visible route width (73.2 desktop
16:10, 81.3 desktop 16:9, 99.2 phone landscape today, **62.6 phone landscape
at the addendum's 6 %**, 19.0 phone portrait — `facts.json`); *v_r* = 9.4 t/s run speed; *v₀* = 4.3 t/s scroll floor;
*v₁* = 6.02 t/s earned momentum ceiling.

**Today, F = 88:** F/W = 1.20 screens on desktop and **0.89 on a landscape
phone** — a side is about one screen, so as it begins on a phone the next
corner is already in view. F/v₀ = 20.5 s, F/v₁ = 14.6 s, F/v_r = 9.4 s.
Measured (Table M2): every style's moving time is 16–23 s per side whatever
it does, and a perfect racer (oracle@0) covers the side's ground in roughly
11–13 s and then **stands ≈ 5.8 s at the closed joint** waiting for the
scroll to reach the halt (desktop; 5.0–5.2 s in the phone 6 % frame, 5.3–7.7 s
on today's FAR landscape phone — `baseline.md`). The side
is short, and the scroll, not the player, sets its length.

Four constraints on the new *F*:

| | constraint | bound |
| --- | --- | --- |
| C1 | a side reads as a journey, not a tableau: ≥ 2 screens on desktop FAR, ≥ 1.5 on a landscape phone (both today's FAR phone frame and the addendum's 6 % frame) | F ≥ 2 × 73.2 = 146; F ≥ 1.5 × 99.2 = 149 (FAR phone) or 1.5 × 62.6 = 94 (6 % phone) |
| C2 | a racer's side still holds a teach → test arc before the remix cell: the shipped gate scores take ~11–13 s to clear at 3 s/kill (Table M2, oracle@3000 gates 3–5); give the racer ≥ 15 s on the move | F ≥ 15 × 9.4 = 141 |
| C3 | a carried player is not stranded on one side at the floor pace: DESIGN's *"four-to-five-minute"* run ÷ 6 sides ≈ 40–50 s per side all-in, so ≤ 45 s of floor-pace travel (a design bound, not a measurement — Q3) | F ≤ 45 × 4.3 = 193 |
| C4 | keep the shipped 88-tile authoring bay as the module | F ∈ {88, 176, …} |

**Recommendation: F = 176** (two bays). 2.40 screens on desktop 16:10 (2.16
at 16:9), 1.77 on today's landscape phone, **2.81 in the addendum's 6 % phone
frame** (9.3 in portrait); **18.7 s** for a racer
at run speed, **29.2 s** at the earned ceiling, **40.9 s** at the floor
(`climb-plan.json`). The exact value stays a tuning parameter: T-205's
acceptance boxes are written in *seconds*, not tiles (§8 Q3 asks how long a
side should feel).

**Run length at F = 176, still six sides (milestone M2).** Per side: moving
time + a remix-cell hold (≈ 0–5 s at 1.5 s/kill — an estimate: today's whole
3–5-beat gate holds 0–9.8 s at that rate, Table M3, and the remix cell is its
last beat) + the 1.1 s ritual; plus the Crown finale (11–20.5 s: `FINALE_TIMING.minDefendMs` /
`hardMaxMs`, `src/sim/finale.js`). A racer under the
follow-lead: 6 × (18.7 + ~3 + 1.1) + ~12 ≈ **2.5 min**. At the earned
ceiling: 6 × (29.2 + ~4 + 1.1) + ~13 ≈ **3.6 min**. Carried at the floor:
6 × (40.9 + ~5 + 1.1) + ~15 ≈ **5.0 min**. DESIGN's target for the run is
*"four-to-five minutes … unless playtesting demonstrates that the intended
crescendo needs a different duration"*: the floor lands there, and good play
gets there faster — the spread entry 19 asks to keep.

**Vertical span — two different things:**

- **The local lattice band** (simulation *y* above a side's lowest deck)
  stays at the shipped 10–15 tiles (`VERTICAL_ASSAULT.spans`). The visible
  frame height (45.5 tiles at FAR desktop, 28.3 in the phone 6 % frame) and
  the jump envelope (apex 2.72, double 5.07 — three jump tiers in 15 tiles)
  bound it. (The authored "3–5 routes per 12-column window" target in
  `src/pure/lattice.js` is an intent metric, unproven as player experience
  under entry 21; T-205 replaces it with forks measured by play.) Measured,
  players already use the band: peak height above the deck per side in
  Table M4.
- **The rendered rise** (HUD ALT, `src/pure/ascent.js`) is where a race to
  the *top* is won or lost, and today it is **5.43 m per side, 35 m for the
  whole run** (grade 0.062, 3.5°). Because every side starts again at deck
  level, the local climbing is given back at each corner: measured net ALT
  gain is **5.4 m per side** for every style and **0.16–0.30 m/s** (Table
  M4), while players climb 1.8–3.4 m/s locally. Target: **28–36 m per
  176-tile side** (grade 0.16–0.21, 9–12°), ≈ 90–100 m per level and 274 m
  for the climb (§5.2). Rationale for the band, as hypotheses T-204 must
  test with captures: below ≈ 0.1 grade the slope does not separate from
  today's 3.5°; above ≈ 0.25 pitched tile columns step visibly and a level
  shot along the deck reads as firing into a hillside.

### 4.2 Follow-lead scroll — a racer sees ahead and never waits for the scroll

**Measured problem.** A racer is pinned against the right clamp — the screen
edge or the closed joint — for most of the run (Table M5), seeing a few
tiles ahead (Table M7), and arrives at each joint ≈ 5–6 s before the gate
starts (Table M2). The faster you play, the less you see and the longer you
wait: the opposite of *"a race to the top"*.

**Change — two terms, both in `src/sim/scroll.js`'s six-face branch.**

1. *Lead.* The pursuing edge advances at least fast enough to keep RIG
   `lead` tiles from the right edge:
   `scroll = max(pursuit step, RIG.front − (EDGE_R − lead))`, with
   `lead = clamp(0.3 × W, 6, 24)` → 22 tiles desktop (2.3 s at run speed);
   18.8 (2.0 s) in the addendum's 6 % phone frame, the phone tuning target;
   24 in today's FAR phone frame; 6 in portrait (0.3 × 19.0 = 5.7, clamped
   up; 0.64 s). The fixtures already run the same rule under another
   parameterization (`traversalFollowTarget` in `src/pure/traversal.js`:
   RIG's front ≤ scroll + `followLeadTiles`, capped so `lookAheadTiles` stay
   visible on narrow screens); today it applies only under `ACTIVE_FIXTURE`.
2. *Arm on arrival.* The lead alone does not remove the wait at a closed
   joint. A corner arms only when the scroll reaches `HALT_S` (corner − 14),
   while RIG's front may advance to corner + 0.6 (`cornerJointRule` in
   `src/pure/waves.js`), so a racer arrives with `EDGE_R − 14.6` tiles of
   scroll still to go when pinned at the right edge — 31.1 on desktop,
   consistent with the measured 5.3–5.9 s of Table M2 at a scroll pace of
   5.3–5.9 t/s, inside the 4.3–6.02 momentum band (a consistency check, not a
   measured pace) — and `EDGE_R − lead − 14.6` under the lead term: 9.2 tiles (1.5–2.1 s between the earned ceiling and the floor)
   on desktop, 8.6 (1.4–2.0 s) in the 6 % frame, 21.6 (3.6–5.0 s) in today's
   FAR phone frame, none in portrait. So the corner also arms when RIG's front
   reaches the closed joint, and the gate then holds the scroll where the
   lead put it — at most 9.2 tiles short of today's halt on desktop. The
   authored gate sockets lie at `HALT_S − 19 … HALT_S + 2.5`
   (`gate-view.json`), ≥ 10 tiles inside that earlier held view at every
   landscape viewport; T-201's visibility check runs against the held view
   actually reached, not against `HALT_S`.

A player behind the lead engages neither term, so the floor pace is
untouched.

**What it buys, in the lab's currencies:** a racer's route ahead while
racing, from a median of 5 tiles (1 in the 6 % phone frame) to ≈ `lead` at
the median frame — route still
ends at each joint, so the last few tiles before a joint stay short by
construction; wait at the closed joint from ≈ 5–6 s to ≈ 0 per side; a
racer's side from ~20 s to F/v_r (9.4 s today, 18.7 s at F = 176) plus the
remix cell. **What it costs** (named in §6): entry 11's banked daylight —
desktop's maximum daylight drops from ≈ 72 to ≈ 51 tiles (still ≈ 12 s at the
floor pace) — and T-022's momentum bank term, which reads screen position and
saturates under follow; it must be re-expressed in tiles from the damage
plane.

### 4.3 Rolling gates — teach → test → remix → break, on the move

**Measured problem.** Six times a run the climb stops. A perfect shooter is
held 0–4 s per gate (oracle@0) and a 1.5 s/kill shooter 0–10 s (Table M3);
but every gate is scored in 3–5 beats (`facts.json` `beatsPerGate`), each
later beat condensing only when the current one is cleared, and a beat that
is never cleared holds for `LEVEL1_ECOLOGY_BEAT_LOCK_MS` = **300 s**. Bots
show what that means for imperfect hands: median holds of 26–365 s at gates
3–6 (Table M3, dominated by armoured rooted teachers). And on a portrait
phone the beat that must be cleared is often off-screen (§2.8).

**Change (T-203), keeping DESIGN's teach → test → remix → break:**

1. **Teach** — a side's first beat plays in bay A, on the move, inside the
   existing lesson bubble (`CONFIG.spawner.lesson`: no unrelated body within
   its reaction window). It never holds the scroll.
2. **Test** — the middle beats play in bay B, on the move, at the authored
   staging sockets the gate uses today.
3. **Remix** — only the last beat (≤ 4 bodies) is the gate cell. It primes
   when RIG comes within ≈ 45 tiles of the joint (≈ 4.8 s at run speed) *or*
   the scroll is 18 tiles from the halt (today's rule), whichever is first,
   so a racer fights it on the run; clearing it before arriving is a
   drive-through. The halt stays as the safety net: the damage plane never
   pushes a fighting player into a locked joint.
4. **Break** — the transition ritual (1.1 s facet ratchet; flip/breach in L2)
   is the only pause on a clean run.
5. **Bounded beats** — a beat not cleared after ≈ 6 s releases the next one
   (survivors stay), replacing the 300 s lock. Nobody waits five minutes.
6. **Visible beats** — every gate body's socket must sit inside the held
   view at every supported viewport (§2.8; T-201).

Operator question Q2 asks the one thing this does not settle: whether an
uncleared remix cell should still stop the climb, or follow RIG onto the
next side.

### 4.4 The climb made literal — per-side rise (render-only)

Replace `NORMAL_ASCENT.totalRise = 35` with a per-side rise table (§5.2's
`riseTiles`), so the deck visibly climbs and the HUD's ALT readout becomes
the race's progress meter: 35 m → ≈ 90–100 m per level. The renderer
already pitches tiles, seams and dressing by the ascent grade and the camera
already tracks it (`normalAscentPitchAt` in `src/render/level.js`,
`src/render/seams.js`; `normalAscentAltAt` in `src/render/camera.js`), so
this is data plus visual QA, and it is provably render-only: every race-lab
fingerprint must stay byte-identical (T-204).

### 4.5 Phone notes — landscape first, the 6 % frame, iPhone Safari

**The phone tuning target is the addendum's frame: 844×390 landscape, RIG
≈ 6 % of the height** (23.4 px). Modelled as a pure depth pull-in from FAR
(the only model the shipped camera code has for a view change — and the model
is confirmed against the shipped page at the two shipped scales that bracket
6 %: booting the landscape phone at `?view=mid` (RIG 5.0 %, 74.6 tiles) and
`?view=near` (RIG 7.1 %, 53.3 tiles), the live edges match this model's
prediction to 1.5e-13 and 1.2e-13, and both shots are committed beside
`framing.json` as the closest look available at a closer phone frame), it
shows a **62.6 × 28.3-tile** window — 6.7 s of running ahead, 1.41 screens per
shipped side, 2.81 per proposed side. All 39 gate bodies stand inside its held
view (`gate-view.json`), so the portrait defect of §2.8 does not recur there —
but 13 of them stand within 6 tiles of the damage plane (rule 5 below).

**Readability rule for that frame (designs every side in §5):**

1. *Vertical.* A pure depth pull-in shows local heights **−9.9 … 18.7** on the
   route plane: ~12 tiles of below-deck anatomy (decks sit at y 2–4) and a
   ceiling that cuts the shipped lattice's top — face 6's apex is at y 17, so
   RIG standing there (1.7 tall) touches the frame's top edge and a wasp
   above is off-screen. Lifting the camera *and* its look target together by
   **≈ 6 tiles** (pitch unchanged) shows **−3.9 … 24.7**, which holds the
   deck, the whole 10–15-tile lattice band, RIG on the apex and one enemy lane
   above (computed with `edges.mjs`'s model). That lift is T-107's to choose
   (desktop FAR stays byte-identical); the level rule is: **keep every route
   surface and every staged body within deck + 15**, which the shipped strips
   and §5.2's plan already respect.
2. *Horizontal.* A side must still read as a journey on the phone (C1 ≥ 1.5
   screens → F ≥ 94; F = 176 gives 2.81), a racer needs ≥ 2 s of route ahead
   (§4.2's 18.8-tile lead), and a gate's whole cell must sit inside the held
   view (T-201's assertion, run at this frame too).
3. *Scale of a decision.* One tile is 13.8 px tall in this frame (390 / 28.3).
   The pocket chasm (2 columns = 27.5 px), a fork's height step (≥ 2.35
   tiles = 32 px) and the 3-tile mortar patch (41 px) all stay at or above
   ~27 px. Nothing smaller than one tile (13.8 px) should carry a route
   decision on a phone.
4. *The frame is not all playfield.* Measured from the live DOM on a
   844×390 landscape phone (`framing.json`): the RIG instrument panel covers
   the top-left **35.5 % × 29.7 %** of the frame and the objective banner the
   top-right **37.9 % × 8.7 %**; the touch deck's input surface covers the
   bottom **46 %** (its drawn parts are the stick ring and the two chips in
   the corners). A route decision authored to read only in the top-left
   third of a phone frame is invisible; the readable band is the middle and
   the lower-left. (HUD and deck layout belong to T-101/T-105 — this is the
   level-design consequence, not a request.)
5. *Room in front of the damage plane.* The closer frame brings the left
   edge in to `HALT_S − 20.6` while the authored gate sockets reach
   `HALT_S − 19`: **13 of 39 gate bodies stand < 6 tiles from the damage
   plane** in the held 6 % view (nearest 1.6 — gate 5's rooted gateweaver;
   gate 6's rooted needle 2.1), against ≥ 8.4 tiles on desktop and ≥ 20 in
   today's FAR phone frame (`gate-view.mjs`). Bots in that frame spend
   8–22 % of all frames with < 3 tiles of daylight behind them, against
   0–1 % on desktop (Table M7b). Four traced runs (`run-child.mjs` with
   `traceEveryMs: 100`) say where those frames are: `rush` seed 1 — 302 of
   6,000 samples under 3 tiles, every one inside the gate 5 and 6 fights;
   `fighter` seed 3 — 304 of 1,836 (275 in gates); `carried` seed 1 — 2,301
   of 4,384 (2,295 in gates, 4 in the joint approach); the same `carried`
   seed on desktop — 16 of 6,000, all while moving
   (`daylight.mjs --preset phone-crowding`). The closer frame does not
   crowd the run; it crowds the **gate fights**. Rule:
   **every gate body ≥ 6 tiles inside the damage plane of the held view at
   the phone frame** (T-201; arm-on-arrival, §4.2, moves the held view
   8.6 tiles left for a racer, but not for a player who arrives late).

**Portrait (secondary).** It shows 19.0 tiles — 2.0 s of running — and
27 of 39 gate bodies stand outside its held view (§2.8). The addendum keeps
portrait working but not tuned; T-201 still fixes the stall, because a
five-minute hold is a defect in any supported orientation.

**iPhone Safari** (addendum) touches this plan in four places: no element
fullscreen on iPhone, so the between-level card (§5.5) must sit inside the
browser's own chrome and the landscape notch/home-indicator safe areas;
audio unlocks on a gesture, so the card's *CONTINUE* tap is also the audio
re-unlock after a background/foreground switch; Safari may clear
script-writable storage (private tabs; its privacy policy can expire site
storage after a period without use) — the resume of §5.5 must say "saved on
this device" and be verified on a device, and a home-screen install (T-105's
manifest) is the more durable path; and the race lab measures a desktop
SwiftShader sim, not iPhone frame times — longer sides and steeper rise need
an on-device frame-time check (§1.3).

---

## 5. Levels 2 and 3

### 5.1 Two ways to cut one climb into three levels (operator question Q1)

`STORY.md`: *"The Crown's defensive states are the story layer of the six
gameplay phases … There is no seventh narrative escalation."* Today the one
level carries all six states and ends at the Crown. A second and third level
force a choice, and it is the operator's (§8 Q1):

| | **A — one escalation across three levels** (recommended) | **B — every level escalates on its own** |
| --- | --- | --- |
| Defense states | L1 OBSERVE + INTERCEPT · L2 CONTAIN + QUARANTINE · L3 STERILIZE + SCUTTLE → Crown | each level OBSERVE → SCUTTLE; the Crown only at the end of L3 |
| Story | STORY's north star intact: *"The higher RIG climbs, the more the Meridian recognizes the threat—and the more of itself it is willing to destroy…"* | the ship resets its alarm twice; contradicts STORY's single escalation unless STORY is rewritten |
| Content reuse | the six shipped authored strips and the 39-row ecology score are each used **once**, in order (§5.2) | needs three six-beat scores (3 × 39 rows) or repeats L1's teaching beats in L2 and L3 |
| Level 1 alone | becomes the first act: wasps and hounds, no Crown | stays a complete game |
| A phone session | one level ≈ one step of the escalation, ≈ 1.5–3 min (§5.2) | one level ≈ a whole arc |
| New sides to author | 3 new bay-B strips + 9 bay-A climbs | 12 new bay-B strips + 18 bay-A climbs |

A is recommended because it keeps the story spine, reuses every shipped
encounter exactly once, and needs a third of B's new authoring. Its cost is
real and named: level 1 on its own stops being the whole game.

### 5.2 The recommended climb: nine long sides, three levels, one Meridian

`node tools/simlab/race/climb-plan.mjs` states this plan in the frozen
segment schema of `src/pure/track-archetypes.js` and runs the shipped
validator over it: **0 violations**, 9 segments, 1,584 tiles, 274 m of rise,
7 exterior / 2 interior (`artifacts/t104-race/climb-plan.json`).

| # | level | segment id | defense state | surface | tiles | rise m (grade, pitch) | transition after | bay B (authored strip) | sockets |
|---:|---|---|---|---|---:|---|---|---|---|
| 1 | L1 THE LEG | `leg-p1-ankle-scutes` | OBSERVE | exterior | 176 | 28 (0.159, 9.0°) | facet ratchet — *turn around the leg* | `split-rib` (shipped face 1) | aerial-nest, arc-intercept, carrier-dare |
| 2 | L1 | `leg-p2-shin-ribline` | INTERCEPT | exterior | 176 | 30 (0.170, 9.7°) | facet ratchet | `chimney-fork` (face 2) | ground-pursuit, arc-intercept, aerial-nest |
| 3 | L1 | `leg-p2-knee-gimbal` | INTERCEPT | exterior | 176 | 30 (0.170, 9.7°) | joint hub → **level 1 ends at the haunch** | NEW knee-gimbal | joint-clamp, ground-pursuit, carrier-dare |
| 4 | L2 RIBLINE & NECK | `rib-p3-haunch-ribline` | CONTAIN | exterior | 176 | 36 (0.205, 11.6°) — *a long straight up a ribline* | access-plate flip — *indoor through the neck* | NEW haunch-ribline | rooted-interlock, under-rib-ambush, carrier-dare |
| 5 | L2 | `neck-p3-cervical-interior` | CONTAIN | interior | 176 | 20 (0.114, 6.5°) | interior ring ratchet | `crossfire-cavity` (face 3) | rooted-interlock, under-rib-ambush, mortar-perch |
| 6 | L2 | `neck-p4-pressure-tract` | QUARANTINE | interior | 176 | 30 (0.170, 9.7°), earned on foot | vent breach — *back out of some vent up higher* → **level 2 ends** | `vent-stack` (face 4) | mortar-perch, countermeasure-vent, rupture-chain |
| 7 | L3 SPINE & CROWN | `spine-p5-dorsal-ridge` | STERILIZE | exterior | 176 | 32 (0.182, 10.3°) | collar ratchet | `kill-braid` (face 5) | aerial-nest, ground-pursuit, mortar-perch |
| 8 | L3 | `spine-p5-collar` | STERILIZE | exterior | 176 | 32 (0.182, 10.3°) | collar ratchet | NEW collar | joint-clamp, rupture-chain, carrier-dare |
| 9 | L3 | `crown-p6-crown-roots` | SCUTTLE | exterior | 176 | 36 (0.205, 11.6°) | crown entry → **the shipped Crown finale** | `crown-roots` (face 6) | summit-defense, rooted-interlock, carrier-dare |

Per level (same file): 3 sides, 528 tiles — **each level is as long as
today's whole six-face run (6 × 88 = 528 face tiles)**, carved into three long
sides instead of six short ones. Moving time per level: 56.1 s at RIG's run
speed (a racer under the follow-lead of §4.2), 87.6 s at the earned momentum
ceiling (6.02 t/s), 122.7 s at the 4.3 t/s floor. Rise per level: 88 / 86 /
100 m, against 35 m for the whole shipped run.

Entry 1, read against the table: *"turns around the leg"* = L1's facet
ratchets around the shipped static faceted limb (`src/pure/limb.js`,
`src/render/limb.js`); *"a long straight up a ribline"* = side 4; *"flipping
indoor through the neck"* = the access-plate flip ending side 4 (the G2
fixture, `?g2=1`, already authors a `haunch-ribline` band and a carried neck
plate); *"back out of some vent up higher"* = the vent breach ending L2 (the
transform slice's breach, `?slice=transform`). The Crown remains a
command/defense/transmitter complex at the top of one body (entry 1, STORY) —
no second or third creature (entry 1 declines board 12's three-ship framing).

**Concept-board grounding (boards 09–14, `docs/concept-art/README.md`).**
Board 09's three body plans are read as *regions of one body*, per the pack's
own synthesis ("the Spine-Serpent's climbable ascent structure with the
Sky-Ray's broad scutes and gill cavities"): L1 is the limb, L2 the ribline,
neck and gill/pressure cavities, L3 the dorsal spine and Crownback. Board 13
is level 2 almost panel for panel — *"a long phase can run up one ribline"*,
*"one door-like neck access plate can flip inward while carrying the
player"*, *"an upper vent cover can open onto an already-existing exterior
far higher"*. Board 11 is L2's two set pieces (neck access-plate flip, dorsal
vent breach), with its rolling scutes superseded by entry 3. Board 14 sets
the altitude rule all three levels follow: *"altitude is earned continuously
on the traversal stretches themselves; gates are compact switchback turns …
and grant zero altitude"* — hence rise per side (§4.4) and none at the
ratchets. Board 10 is L3's intensity target. Board 12's anthology is used
only for its idea of distinct climb identities; its three-ship framing stays
rejected (entry 1).

**Each side = bay A + bay B.** Bay A (~88 tiles, new) is the climb: a rising
lattice that carries the side's teach and test beats *on the move*. Bay B
(~88 tiles) is the side's authored assault strip ending in its remix cell and
transition. Six bay-B strips already exist (`src/pure/vertical-assault.js`
faces 1–6, `docs/LEVEL1-MAP-V2.md`) and are reused once each; three are new.

**Encounters (structure A).** The 39-row Level 1 ecology score
(`src/pure/level1-ecology-encounters.js`) keeps its rows, beats and staging
roles; only *where* each beat plays moves. Shipped gate k's first beat →
its side's bay A (teach, isolated, on the move), middle beats → bay B on the
move (test), last beat → the side's remix cell (§4.3). Gate 1 (Observe) →
side 1; gate 2 (Intercept) → sides 2–3; gate 3 (Contain) → sides 4–5; gate 4
(Quarantine) → side 6; gate 5 (Sterilize) → sides 7–8; gate 6 (Scuttle) →
side 9. No HP, damage or tell changes (`LEVEL1-ENEMY-ECOLOGY-PACK.md`'s
rule: every variant changes a route, timing, elevation or target decision).

### 5.3 Level 2 — RIBLINE & NECK (CONTAIN → QUARANTINE)

- **Fantasy.** RIG leaves the leg at the haunch and sprints a long, rising
  ribline in the open; the neck access plate flips inward carrying RIG into
  the creature; inside, compressed cervical cavities and a pressure tract
  climb toward a vent; the vent cover blows and RIG comes out far higher.
  STORY's phase-3/4 facts land here: *"the crew is gone"* (empty stations in
  the neck) and *"it knows you are human"* (the quarantine machinery).
- **Built from what exists.** The transform fixture system
  (`src/pure/transform.js`, `src/sim/transform.js`, `src/render/transform.js`)
  already is a data-driven level format: exterior/interior bands, `flip` and
  `breach` events, a render `altitudeProfile`, per-band `atmosphere`/`tone`/
  `shipState`, threat sockets, and a follow-lead camera (`followLeadTiles`).
  `monster-g2-neck-flip` (`?g2=1`) already authors an 88-tile
  `haunch-ribline` band and a 10–12-tile carried neck plate. Level 2 is that
  fixture lengthened to three 176-tile bands, given encounters and gates.
- **Identity against L1.** Surface (out → in → out), light (interior bands
  carry their own atmosphere/tone), compression (dense 4–5 bands, overheads,
  shafts — DESIGN "interior phases favor walls, ceilings, shafts, traps,
  turrets and compressed routes"), and two signature transitions (flip and
  breach) instead of facet ratchets.
- **Roster (A).** Iris Polyp needle and sweepfan lock connectors in tight
  space; Pincer Relay wasps; the pressure tract adds Craterpod and Bracketpod
  landing denial and the Rebound hound. Same bodies, same tells as today.

### 5.4 Level 3 — SPINE & CROWN (STERILIZE → SCUTTLE)

- **Fantasy.** High exterior on the dorsal spine: weather, the settlement far
  below, the Crown growing in frame; two collar ratchets around the spine;
  the Crown roots; then the shipped Crown finale.
- **Built from what exists.** `kill-braid` and `crown-roots` strips; the
  Crown finale (`src/sim/finale.js`, `src/render/crown.js`, the Crown command
  kit); STERILIZE/SCUTTLE defense VFX sheets; the transform fixture's
  `weather` band field (outer-face-c already rains).
- **Roster (A).** Gateweaver and Aircomb, then readable SCUTTLE triads —
  unchanged rows from shipped gates 5 and 6.

### 5.5 How levels chain, and what a phone player sees between them

Recommended shape (the operator decides the details — §8 Q4, Q5):

1. **One climb, played in order.** L1 → L2 → L3 is a single run; level
   boundaries are diegetic set pieces, not menus: the knee-to-haunch joint
   hub (L1 → L2: a camera reveal around a static joint, nothing moves) and
   the vent breach (L2 → L3: only the vent cover moves). Static anatomy
   throughout: the next region already exists and is revealed by the camera
   (entry 3); inside L2 the neck access plate is the one other moving part.
2. **A between-level card, phone-first.** On the safe apron after the set
   piece (no hostiles, scroll held), a card for about three seconds: level
   name, ALT reached and gained, time, kills; one large *CONTINUE* target
   inside the safe area (auto-continues), one small *SAVE & QUIT*. No
   keyboard words on touch devices (T-105's rule). The next level's critical
   art joins the preload gate during the previous level's last side, so the
   card never hides a texture stall.
3. **A resume point, if the operator wants one** (Q5). Written at the card:
   `{schemaVersion, levelReached}`. Durability contract (LANE-BRIEF: *"a lost
   save is P1"*): one atomic key; unreadable / corrupt / older schema →
   ignored and rewritten; storage unavailable (private mode, quota, eviction)
   → no resume and a visible *"progress is not saved on this device"* line,
   never a blocked title; the title always starts L1 on the first input. A
   resumed level starts with the rifle, as a fresh run and a death already do
   (the `starter-weapon` entry of `src/boot/run-reset.js`; `loseLife` in
   `src/sim/player.js`).

**Conflicts named, not resolved:** a "start at a level you reached" choice is
an unlock in form (entry 19 dropped unlocks as a retention device) and a
level-start resume is a checkpoint (entry 0a asked setback design to avoid
lives-and-checkpoints retreads). The resume is session structure for a phone,
not a death penalty — but it is both of those things, so it is the operator's
call (Q5).

### 5.6 Art per level from the existing kit (no image generation available)

Inventory used (all shipped under `assets/generated/` or as procedural
renderers): backdrop plates `limb-segment`, `spine-coil`, `gill-cavity`,
`colony-cluster`, `meridian-anatomy-v1`, `meridian-coils-v3`,
`crown-horizon`, `crown-summit-v2`; the 32-component atlas
(`meridian-component-atlas-v1`, including per-state dressing:
`observe-*`, `intercept-*`, `contain-*`, `quarantine-*`, `sterilize-*`,
`scuttle-*`); the 64-cell foreground surface pack; the detail atlas (vent
hatch, pipe stacks, broken hull, generator); the Crown command kit; the
defense-VFX pack (one sheet pair per two states); the 12-variant enemy
ecology atlas; the procedural static limb (`src/render/limb.js`) and the
procedural access plate / vent cover (`src/render/transform.js`). Backdrop
placement is already a per-face data table (`CONFIG.BACKDROP_TUNE.placements`).

| level | surfaces and anatomy | backdrop tiers (near / mid / far) | dressing | gap, stated honestly |
| --- | --- | --- | --- | --- |
| L1 THE LEG | procedural faceted limb (shipped); foreground scute/plate cells | `limb-segment` / `spine-coil` / `colony-cluster` + `crown-horizon` | `observe-*`, `intercept-*`, braces, ladder rails | none blocking — it is today's level, re-proportioned |
| L2 RIBLINE & NECK | ribline: scute cells + `keel-fin`, `armor-shoulder` as rib heads; neck: procedural access plate (shipped, CP3 v2 re-judgment still pending); interior: transform interior band (procedural ribs/alcoves/pipes) + grate/louver cells | `spine-coil` (the ribs) / `gill-cavity` (interior windows) / `meridian-anatomy-v1` | `contain-*`, `quarantine-*`, pipes, vent hood, purge nozzle | no painted rib-cage *interior wall*; options: palette/tone per band (exists), procedural canvas panel lines, PIL recolor of hull cells |
| L3 SPINE & CROWN | exterior scute cells; collar = the limb machinery at a second radius | `meridian-coils-v3` / `spine-coil` / `crown-summit-v2` (the Crown grows in frame) | `sterilize-*`, `scuttle-*`, Crown command kit | none blocking; weather is a shipped band field |

Every new look must pass LANE-BRIEF's *bound is not visible* test (mean
row-to-row luminance detail on the real surface at true size, against its own
escape-hatch control) before it is reported as done.

### 5.7 Level authoring pipeline — should level design move into Blender?

Added at the integrator's request, answering an operator **musing** (not a
decision), 2026-10-22: *"i wonder if the level design should also be in
blender? i think we did a bunch of threejs math to create the 2d platformer to
3d 'hard turn' feature. it worked ok, but was complex to iterate on."* Entry 22
delegates tool choice to the integrator, so this section is a recommendation to
him, not a question for the operator. Blender 5.2 headless (`bpy`,
`/opt/hb-art/bin/python`, Cycles CPU / Workbench, no EEVEE) is installed, and
T-109 is proving Blender → sprite for RIG and the wasp.

**(a) Where the iteration cost of the hard turn actually lives.** Line counts
from this tree (`wc -l`), with what each layer owns:

| layer | files (lines) | owns | does the turn make it hard to iterate? |
| --- | --- | --- | --- |
| authored level data | `src/pure/vertical-assault.js` 636, `src/pure/lattice.js` 835, the `path`/`waves`/`BACKDROP_TUNE` tables inside `src/config.js` (1,548) | 68 platform rows, 38 connectors, 33 staging sockets, 6 pockets — every one a rectangle in `(s, y)` with a face index (`{ key, u0, u1, h, role }`) | **No.** A row knows nothing about 3D; the corner is only *which face owns the column*. |
| simulation | `src/pure/path.js` 136, `src/pure/waves.js` 168, `src/sim/wavegate.js` 467, `src/sim/scroll.js` 126 | corner list, chamfer bends, the joint frontier/seal rule (`cornerJointRule`, 13 lines), the corner lifecycle idle → gate → approach → turning → done, halt targets | **No.** The sim never leaves `(s, y)`; a corner is a 1-D interval rule. |
| path → 3D mapping | the `yawAt` / `bendSList` / `facetAtBends` / `routeRenderOwned` half of `src/pure/path.js` (~60 of its 136 lines) | heading per segment, the smoothstepped yaw blend across a bend, which facet owns a column | **This is the actual "2D→3D math" — and it is ~60 lines.** |
| procedural render geometry | `src/render/level.js` **2,632**, `src/render/limb.js` 611 + `src/pure/limb.js` 721, `src/render/seams.js` 220, `src/render/tower.js` 62 | every tile, panel, catwalk, gusset, pipe, scute built *in code* (227 `dress*` references), merged into per-facet pools with per-facet UVs (`panelUvFor`, `buildDressingPool`, `buildDressingPanelPools`) and culled by ownership at bends (`updateWorldDressingCull`; 81 mentions of bend/facet/corner/chamfer) | **Yes.** "Move that rib" is a code edit; every new piece must also satisfy facet ownership, the cull and the draw-call budget. |
| camera ratchet | `src/render/camera.js` 343 | the 60° turn choreography and the frozen FAR framing | Partly: small, but global and frozen by entries 7/17. |

So the pain is **not** the turn's trigonometry and **not** the simulation. It
is ~4,250 lines of procedural geometry written in JavaScript that has to agree
with the data, with facet ownership and with the perf contract. A pipeline
that does not touch `src/render/level.js` does not touch the iteration cost.

Also load-bearing: today **collision and visuals come from the same rows** —
`src/sim/level.js` exports `groundH, platforms, ladders, solidRects` from the
pure generators, and `src/render/level.js` imports exactly those symbols from
`src/sim/level.js`. Nothing in the renderer invents a surface. That property is
what the options below must not spend.

**(b) The options.**

| option | removes | adds | single-source-of-truth risk | parallel agents | cost |
| --- | --- | --- | --- | --- | --- |
| **1. Blender as a KIT source; the 2D data stays the source of truth** (recommended) — rib heads, corner/joint pieces, vent hoods, collar machinery modelled once, exported as glTF or as baked sprite cells, *placed by the existing data tables* | the hand-written geometry builders for the pieces it replaces (`dressGusset`, `catwalkGussetGeometry`, `extrudedProfile`, parts of the limb mesh) — the dressing half of the 2,632-line file | a glTF load path (`three/addons/loaders/GLTFLoader.js` is already in the import map, no build step) or more atlas cells; entry 16's degrade-safely contract per asset; a provenance row | **Low** — placement still comes from the same rows; a missing mesh changes the picture, never the collision | **Good** if the authoring artifact is a `bpy` **Python script** (text, diffable, deterministic) that emits the mesh, as entry 22's sprite rule already requires. A committed `.blend` would not diff or merge and must not become the source | **S–M per piece**, incremental, stoppable at any point |
| **2. Blender scene as the authoring source, with an exporter producing the 2D collision data** | the authored JS tables (`vertical-assault.js`, parts of `lattice.js`) | a whole exporter + schema + round-trip validator; an opaque binary between the designer and the game; every pure validator (reachability, pockets, archetypes) now runs on exporter output | **High** — the game's guarantee inverts: collision becomes *derived from a mesh*, and a modelling mistake (a 0.01-tile gap, a flipped normal, a scaled collection) becomes a gameplay defect | **Bad** — `.blend` is binary: two lanes editing the same level cannot merge, and the merge gate cannot review a diff | **L / high risk** |
| **3. A 2D editor (LDtk or Tiled, JSON on disk)** | hand-editing JS object literals | an import step and a second schema; LDtk/Tiled grids assume square tiles and no `u`-local-to-face indirection, so either the editor model or the data model bends | **Medium** — JSON is still one source, but now the *authoring* copy and the *pure generator* can disagree | **Fine** — JSON diffs; one file per level | **M**, and it buys layout convenience the data already has (rows are 5 fields) |
| **4. A fast offline level PREVIEW** — a deterministic unrolled 2D map of the authored data (PIL/SVG, sub-second), plus the existing headless captures for the turns | nothing | ~200 lines of tooling | **None** — read-only | **Ideal** — text in, PNG/SVG out | **S** |

**Recommendation: 1 + 4, and explicitly not 2.** Blender earns its place where
entry 22 already put it — *making the pieces* — while the 2D tables stay the
one place a route exists. The measured reason is in the table above: the hard
turn costs ~60 lines of mapping and ~4,250 lines of procedural dressing, and
option 2 would spend the codebase's best property (collision and visuals from
one row) to fix neither. The thing that actually makes iteration slow — you
cannot see a side without booting the game, and on this host a single phone
capture took 392–652 s — is fixed by option 4 for a fraction of the cost, and
option 4 is also what lets a lattice lane judge a layout before it renders it.
Option 3 is a reasonable later convenience, not a current need: the authored
row is five fields wide, and T-205 adds sides, not a new coordinate system.

Two sequencing notes. First, **let T-109 land before any level kit**: it is
already proving the render → palette → true-size path on characters, and a kit
piece is the same pipeline with a different subject. Second, **a Blender kit
piece is a *look* change** — entry 16 means it ships behind an A/B flag with
today's procedural piece as the control and becomes default only on the
operator's verdict.

**Conflicts, named:** entry 3 (static anatomy — modelled *pieces* are fine,
imported *animation* of anatomy is not); entry 16 (A/B flag + verdict for every
look change); entry 18 (60 fps with 200+ projectiles: imported meshes must join
the existing merged/instanced pools and the render-submission contract, not add
per-piece draw calls); entry 14 (the half-dose value ladder and the ≤ 8-colour
rule still govern, so a Cycles render is raw material, never the shipped
pixels); entry 22 (tool choice is the integrator's, dev-only, no runtime
dependency, no build step); entries 7/17 (the camera ratchet stays frozen — a
kit does not get to move the camera); and the CC0-only provenance rule for any
third-party model. None of these blocks option 1; all of them bind it.

---

## 6. Checked against the decision log and the frozen constants

Legend: **aligned** · **tension** (compatible, but a judged mechanic or
verdict is touched — the build task must re-derive it openly) · **conflict**
(contradicts a recorded verdict or rule — the operator decides; this proposal
does not).

| proposal | entry 3 static anatomy | entries 7/17 FAR camera | entry 10 split decisions / climb / currency rule | entry 11 dead ends, pace at the player's momentum | entry 12 price is pressure | entry 19 variance is the feature | frozen movement constants |
| --- | --- | --- | --- | --- | --- | --- | --- |
| §4.1 longer sides (176 tiles) | aligned — every bay prebuilt and revealed by camera and fog; more prebuilt geometry is a render cost (entry 18 budget) | aligned — FAR untouched; a side becomes 2.4 desktop screens | aligned — climb is the dominant motion; bay A must keep fork density (T-205 box) | aligned — more distance for earned pace to act on | — | **tension** — a longer side lengthens a weak player's run (floor longer, not harder); report the spread | aligned — `faceTiles` is not a movement constant, but ~every corner-position assertion encodes 88 and must change intentionally |
| §4.2 follow-lead scroll + arm on arrival | aligned — camera/scroll motion only | **tension** — FAR depth and framing are unchanged, but the view gains horizontal tracking of a racer; entries 7/17 froze the view *scale*, not tracking. Fixtures already track (`followLeadTiles`). Operator judges the feel | aligned — *"keep going faster"* | **tension** — entry 11 makes banked daylight the currency of escalation; follow-lead converts the leading ~30% of the screen from bank into lookahead (desktop maximum daylight ≈ 72 → ≈ 51 tiles), and T-022's bank term (screen fraction) saturates under follow. Must be re-derived in tiles-from-the-plane, not silently changed | — | likely aligned — raises the ceiling (racers), floor untouched (a player behind the lead never engages it); measure | aligned — adds a scroll term; `runSpeed`, jump, gravity untouched |
| §4.3 rolling gates | aligned — no anatomy moves; zip-assembly stays reserved for things the ship builds | — | aligned — race instead of stop-and-clear; every box names its currency | aligned — drive-through is earned by killing the remix cell before arrival | aligned — the price of racing is pressure: the cell is fought on the move | **tension** — a bounded beat lock stacks the next beat on a player who cannot clear the current one (harder floor) while drive-throughs raise the ceiling; the distribution is the operator's to judge | aligned |
| §4.4 per-side rise (render) | aligned — the same static anatomy placed higher | aligned — the camera already tracks the ascent profile (`src/render/camera.js`) | aligned — *"a face that reads as a flat corridor is a defect"* | aligned — the *"scaling a goliath"* feel | — | aligned — render-only: race-lab fingerprints must be byte-identical | aligned — render-only, provable |
| §5 three levels, structure A | aligned — flip and breach move only the access plate and vent cover (the transform slice already complies; CP3's re-judgment of v2 is still pending — a dependency, not a conflict) | aligned | aligned — scene transitions as punctuation | aligned — *"boosts and scene transitions may rocket the player forward and upward"* (entry 11's parked T-023 direction) | — | **tension** — level 1 alone stops being a complete arc (Q1) | aligned |
| §5.5 resume at a reached level | — | — | — | — | — | **conflict** — an unlock in form; entry 19 dropped unlocks/meta-progression as retention (Q5). Also **conflicts with entry 0a** (see below) | — |
| T-201 gate beats visible and bounded | aligned | aligned — framing unchanged; staging moves into the view | aligned | aligned | aligned | aligned — removes a 300 s stall nobody can act their way out of | aligned |

Other entries touched: **0a** (setback design should avoid
lives-and-checkpoints retreads) — **conflict** for §5.5's resume: a
level-start resume is a checkpoint, even if its purpose is phone session
length rather than punishment (Q5). **1** (single Meridian, Crown not a body part) —
aligned, three regions of one body. **13** (the slice under-reads pressure)
— rolling gates are pressure-priced, so they are built and judged in the
default run, never in `?slice=traversal`. **16** (unjudged → flag, judged →
default) — every mechanic here ships behind a flag (`?follow=`, `?gates=`,
`?rise=`, `?level=`) until the operator judges it. **18** (60 fps with 200+
projectiles) — longer sides and steeper rise add prebuilt geometry; T-204/
T-205 measure `worstMs`/`over20ms`. **20 and its addendum** (phone
first-class, landscape first, phones at RIG ≈ 6 %, desktop FAR unchanged,
milestone releases, iPhone Safari) — aligned: the plan designs readability for
the 6 % landscape frame (§4.5), keeps desktop FAR byte-identical, treats
portrait as secondary but still fixes its stall, and is ordered into playable
milestones (§7). The follow-lead of §4.2 applies on desktop FAR too, which is
why it is listed as a tension with entries 7/17 above.

**Frozen movement constants.** Nothing in this proposal changes
`CONFIG.player` (run 9.4 t/s, jump 14, air jump 13, gravity −36, …), the
4.3 t/s scroll floor, or the momentum ceilings (6.02 / 7.31 t/s). Side length,
render rise, gate sequencing and the scroll's follow term are pace, lattice
and presentation levers — the ones entries 10/11/20 authorize.

---

## 7. Build plan as playable milestones (ready-to-dispatch task blocks)

Ordered into **four playable milestones** (entry 20 addendum: gated merges go
to main; the operator tags a Pages release whenever a milestone is playable
and tests it on an iPhone). **Each milestone is a complete, shippable game on
its own**, and no milestone throws away an earlier one's content: M2's six
long sides are exactly six of the nine final sides (§5.2), redistributed in
M4 only if the operator picks structure A (§8 Q1). M1 and the level framework
do not depend on any operator answer. New mechanics land behind a flag
(entry 16) so each release carries its own A/B URL; once judged they become
the default with the flag as the escape hatch.

| milestone | what the operator plays on the Pages release (iPhone landscape + desktop) | tasks | depends on |
| --- | --- | --- | --- |
| **M1 — the race pass** | today's level 1 (6 × 88), but a racer sees ahead and never waits at a closed joint, gates never wait on an invisible or five-minute beat, the deck visibly climbs; in the 6 % phone frame once T-107 lands | T-201, T-202, T-204 | T-102 merged; T-101 (touch) for phone play; T-107 for the phone frame |
| **M2 — long sides** | level 1 with six 176-tile sides (≈ 2.5 min for a racer, ≈ 4–5 min at the floor pace, §4.1) and rolling gates: teach and test on the move, one remix cell per side | T-205, T-203 | M1 |
| **M3 — a second level** | level 1 as in M2 (still ending at the Crown), plus **level 2 RIBLINE & NECK** reachable through the level framework, the between-level card and (per Q4/Q5) a resume | T-206, T-207, T-208 (L2 half), T-210 | M2; T-105 (phone shell) for the card |
| **M4 — the full climb** | the three-level climb: L1 THE LEG → L2 → L3 SPINE & CROWN, the Crown at the top; level 1 re-cut to three sides if Q1 = A | T-209, T-208 (L3 half) | M3; Q1 answered |

**Dependencies on lanes in flight.** T-102 (corner turns) owns
`src/sim/wavegate.js`, `src/sim/scroll.js`, `src/pure/path.js` and
`src/render/camera.js`: T-201, T-202, T-203, T-204 and T-205 must be
dispatched after T-102 merges (or with T-102's explicit hand-off). T-107 (the
6 % phone frame, now authorized and also gated on T-102) shares
`src/render/camera.js` with T-202/T-204 — sequence them, and give T-107 §4.5's
readability rule (lift the frame ≈ 6 tiles; keep deck + 15 in view). T-101 and
T-105 own the touch deck and phone shell that the between-level card (T-206)
must sit inside. T-106 (*"longer faces … built from T-104's accepted plan"*)
is T-205's content; the integrator may renumber T-205 as T-106.

**Legacy checks this plan collides with (entry 21).** Under entry 21 the
legacy suite is unproven and none of it is cited as evidence in this
document — every baseline number above comes from driving the simulation
like a player. These existing checks pin implementation details the plan
would change; each is a candidate to **rewrite as the behaviour test named or
retire**, listed here so the lane that hits it does not "fix" the plan to
satisfy it. T-108 is auditing the whole suite and has the final word; hard-rule
assertions (boot, page errors, determinism, layer purity, the movement
envelope, softlocks, frame budget, safe asset degradation) are not on this
list and stay.

| check | what it pins | collides with | replace with (behaviour, measured by play) |
| --- | --- | --- | --- |
| `tools/track-archetypes-check.mjs` (the WORM compatibility block) | literal corners `[112, 200, 288, 376, 464, 552]` and `583` total tiles | T-205 (176-tile sides), T-209 | assert WORM is *derived from* `CONFIG.path` (no literals); corner positions observed in the lab trace |
| `tools/pathcheck/vertical-assault-geometry.mjs` and its twin `tools/vertical-assault-check.mjs` | exactly six assault faces with six distinct silhouettes; spans equal `[10 … 15]`; per face ≥ 5 connectors, ≥ 5 staging sites, ≥ 1 cover, authored `routeMin ≥ 3 && routeMax ≤ 5` | T-205 bay A, T-209 (three sides per level) | T-205's "reachability by play", "a fork players take", "terrain never stops a racer" boxes |
| `tools/pathcheck/t-009-six-face-lattice.mjs` | 3–5 authored route bands in every 12-column window; one pocket per face with an exactly-2-column chasm and a shelf exactly one tier up; a retreat margin computed from an assumed 14 tiles of entry daylight and the 4.3 t/s plane | T-205 (pockets may move into bay A), T-202 (the plane can lead) | the same play-measured fork/reachability boxes; pocket capsule collected by at least one policy, no fall inside a pocket, and retreat measured at the daylight runs really enter with (T-205's pocket box) |
| `tools/level1-ecology-encounter-check.mjs` ("later beats cannot overlap the clean lesson") | every later beat delayed ≥ `LEVEL1_ECOLOGY_BEAT_LOCK_MS` (300 s) | T-201, T-203 (bounded beats) | T-203's trace test: no second first-time variant inside a lesson window, and no beat waits more than its bound |
| `tools/pathcheck/gate-prelude-runtime.mjs` | the gate cohort primes exactly when the scroll is `GATE_PRELUDE_TILES` (18) from the halt | T-203 (player-proximity priming) | cohort primes when RIG is within the new distance *or* the scroll within 18, observed in the lab trace |
| `tools/pathcheck/momentum-earned-pace-escalation.mjs` | the momentum bank term as a screen fraction | T-202 (follow-lead) | the floor promise as behaviour: a player behind the lead keeps today's fingerprint; drive bounds measured on lab traces |
| `tools/pathcheck/t-051-backdrop.mjs` | backdrop placements keyed to six faces' midpoints | T-206/T-208 (per-level tables) | per-level table derived from the level descriptor; plates visible in captures (the "bound is not visible" measurement) |

Copy-paste-ready blocks (SPRINT.md schema, numbered T-2xx for the integrator
to renumber). Every box names its currency and the test that would falsify
it (entry 10). All lab commands are under `tools/simlab/race/`; a box that
cites "today" quotes `artifacts/t104-race/baseline.json` at `98b12c9`. Lab
viewport ids: `desktop-16x10`, `phone-landscape` (today's FAR phone frame),
`phone-landscape-6pct` (the addendum's phone frame, estimated until T-107
lands — re-point it at the built frame then), `phone-portrait` (secondary).

#### M1 — the race pass (today's 6 × 88 run, no restructure)

```markdown
## T-201 | bug | todo | P1

goal: every gate body the player must kill is inside the view the player has
while that gate holds the scroll, at every supported viewport, and no gate
beat can wait more than a few seconds for one that is never cleared
(docs/proposals/2026-10-race-to-the-top.md §2.8, §4.3 items 5–6).

accept:
- [ ] Behaviour (the gate): seconds a perfect on-screen shooter is held per
      gate. Test:
      `lab.mjs one '{"policy":"rush","seed":1,"viewport":"<vp>","instrument":"oracle"}'`
      has every side's `ms.gate` ≤ 8000 at all four lab viewports. Red today
      in portrait: gate 3 held up to 547 s (2 of 3 oracle runs), gate 5 301 s,
      and no bot run passes gate 3 (Tables M1, M3). Falsify:
      restore `LEVEL1_ECOLOGY_BEAT_LOCK_MS = 300000` AND the old staging → red.
- [ ] Diagnostic (static, explains the behaviour box above): gate bodies
      outside the held view. Test:
      `node tools/simlab/race/gate-view.mjs` reports 0 of 39 outside at every
      viewport it knows — desktop 16:10 and 16:9, phone landscape (FAR and the
      6 % frame) AND phone portrait (today: 0 / 0 / 0 / 0 / 27). Falsify:
      restore the old socket resolution and show portrait > 0.
- [ ] Currency: tiles between each gate body and the damage plane in the held
      view (§4.5 rule 5). Test: `gate-view.mjs` reports no visible gate body
      < 6 tiles from the damage plane at any landscape viewport (today 13 of
      39 at the phone 6 % estimate, nearest 1.6; desktop nearest 8.4), and
      lab bots at phone-landscape-6pct spend ≤ 2 % of frames with < 3 tiles
      of daylight (today 8–22 % of all frames, and 52 % in the worst traced
      `carried` run — almost all inside gate fights, §4.5 rule 5).
      Re-run at T-107's built frame.
      Falsify: restore the old socket resolution → 13 bodies again.
- [ ] A pathcheck domain runs the four oracle runs above (≈ 30 s wall) and
      asserts the gate bound and the static bounds; prove it binds by breaking
      each fix in a scratch copy and showing it go red; restore;
      `git status --short` clean.
- [ ] Spread (entry 19): `lab.mjs baseline --seeds 6` before/after; report
      best/worst/median sides cleared per policy and viewport. Reported, not
      asserted — the operator judges a moved distribution.
- [ ] No feel claim; no operator packet needed (correctness).
owner: gameplay-engineer
fences: owns src/pure/level1-ecology-encounters.js and the gate-staging
  section of src/sim/wavegate.js (after T-102 merges), one new pathcheck
  domain. Must not touch lattice geometry, the camera or movement constants.
verify: node tools/pathcheck.mjs; node tools/simlab/race/gate-view.mjs;
  node tools/simlab/race/lab.mjs baseline --seeds 6
size/risk: S / medium — small code, but it sits in gate sequencing that T-102
  is also changing; depends on T-102.

## T-202 | feature | todo | P1

goal: in the six-face run the pursuing edge never lets a racer press against
the right edge blind: it advances at least fast enough to keep RIG `lead =
clamp(0.3 × visible width, 6, 24)` tiles from the right edge (the fixtures'
follow rule), and a corner arms when RIG reaches its closed joint as well as
when the scroll reaches the halt, so a racer never waits for the scroll
(§4.2). Behind `?follow=1` until judged.

accept:
- [ ] Currency: tiles of route a racer sees ahead while racing (RIG's front
      to the right edge, clipped at the next bend, on frames where the scroll
      moves — Table M7). Test: lab `oracle@0` (racer movement) median ≥ 0.9 ×
      `lead` — ≥ 19.8 at desktop-16x10, ≥ 16.9 at phone-landscape-6pct (the
      phone tuning target), ≥ 21.6 at phone-landscape, ≥ 5.4 in portrait — and
      ≤ 5 % of those frames under 3 tiles (the route really ends at each
      joint: at constant run speed the last 3 of 88 tiles are 3.4 %). Today:
      desktop 0 / 5 / 25 with 45 % of frames under 3 tiles, phone 6 %
      0 / 1 / 21 with 54 % (Table M7). Falsify: `?follow=0` → today's values.
- [ ] Currency: why a racer's view is empty, decomposed. Test:
      `node tools/simlab/race/sight.mjs --preset racer` — climb frames spent
      at a closed joint ≤ 5 % and pinned at the right clamp ≤ 5 % at every
      viewport (today 34 % / 8 % on desktop, 32 % / 20 % in the 6 % phone
      frame). Falsify: `?follow=0`.
- [ ] Currency: seconds a racer stands at a closed joint before the gate
      starts. Test: lab `rush` and `oracle@0` "wait at joint" p90 ≤ 0.5 s on
      every side (today 5.3–5.9 s desktop and 5.0–5.2 s phone 6 %, Table M2;
      5.3–7.7 s on today's FAR phone, `baseline.md`).
      Falsify as above.
- [ ] Floor promise: a player who never passes the lead is unaffected —
      `carried` run fingerprints identical with `?follow=1` and `?follow=0`
      for every run in which neither term ever bound (a lab extension flags
      frames where RIG's front is within `lead` of the right edge, or RIG
      stands at a closed joint before the halt). Red: apply the follow term
      to every frame.
- [ ] Entry 11 tension handled openly: T-022's momentum bank term
      re-expressed in tiles from the damage plane (or measured to saturate
      harmlessly on lab traces); the legacy momentum domain rewritten as that
      behaviour test and named in the report (§7 "Legacy checks").
- [ ] Hard rules (entry 21) untouched: the movement envelope — `CONFIG.player`
      and the momentum ceilings byte-identical — determinism, layer purity.
- [ ] Operator packet on the M1 Pages release: `?follow=1` vs `?follow=0`,
      desktop and iPhone landscape; 3–5 non-leading questions (e.g. "where
      did you look while running right?", "did the screen ever move when you
      did not expect it to?").
owner: gameplay-engineer
fences: src/sim/scroll.js, src/sim/pace.js, src/pure/momentum.js, a new
  CONFIG.follow block, src/mode.js flag line, new pathcheck domain. After
  T-102. Must not change FAR depth or framing (entries 7/17).
verify: node tools/pathcheck.mjs; node tools/simlab/race/lab.mjs baseline --seeds 6
size/risk: M / medium — the crush plane's semantics and the momentum system
  both move; the fixtures prove the follow rule itself works.

## T-204 | render | todo | P2

goal: the climb made literal — replace the uniform 35 m helix with a
per-side rise table so a side visibly climbs and HUD ALT becomes the race's
progress meter (§4.1, §4.4). Behind `?rise=` until judged.

accept:
- [ ] Currency: HUD-ALT metres gained per side and per second. Test: lab
      net ALT gain ≥ 25 m per side and ≥ 1.0 m/s for `oracle@0` (today 5.4 m
      and 0.25–0.30 m/s, Table M4). Falsify: `?rise=0`.
- [ ] Render-only proof: all race-lab run fingerprints byte-identical with
      and without the flag (`lab.mjs check` against a baseline taken with the
      flag off). Falsify: change any sim constant → fingerprints differ.
- [ ] Visual QA at 9–12° pitch: captures at FAR desktop 1280×800 and
      landscape 844×390 (DPR 1–2) of a straight, a ratchet and the Crown
      approach; measured tile-seam gap (px) and RIG foot-to-deck offset (px)
      before/after, compared with boards 13/14.
- [ ] Perf (entry 18): `worstMs` / `over20ms` under the 256-projectile stress
      path before/after, plus an on-device iPhone frame-time note from the
      Pages release.
- [ ] Operator packet on the M1 Pages release: `?rise=steep` vs `?rise=0`;
      questions incl. "does the ground read as climbing the beast or as a
      ramp?".
owner: gameplay-engineer
fences: src/pure/ascent.js (+ a per-side rise table), its render consumers
  (src/render/level.js, limb.js, seams.js, tower.js, atmosphere.js;
  src/render/camera.js after T-102), src/ui/hud.js ALT line only.
verify: node tools/pathcheck.mjs; node tools/simlab/race/lab.mjs check
size/risk: S–M / medium — data change, visual artifacts likely at pitch.
```

#### M2 — long sides and rolling gates (the operator's ask), still one complete level

```markdown
## T-205 | lattice | todo | P1

goal: six sides of 176 tiles (bay A climb + the shipped bay B strip),
proved by play rather than by authored-geometry counts (entry 21; §4.1,
§5.2). This is T-106's content.

accept (every box is measured by driving the sim like a player — the race
lab, extended where noted — and must be shown red on today's tree or on a
deliberately broken bay):
- [ ] Currency: seconds per side. Test: lab `carried` moving seconds per side
      median in [30, 45]; `rush` (with T-202) ≥ 15 (today ≈ 20 and ≈ 17,
      Table M2). Red today: 20 s < 30.
- [ ] Currency: screens per side ≥ 2.0 at desktop FAR and ≥ 1.5 in the phone
      6 % frame (`facts.mjs` faceTilesPerScreen; today 1.20 / 1.41). Red today.
- [ ] Reachability by play (replaces authored reachability counts): the lab
      records every platform any run lands on; across the matrix every bay-A
      and bay-B surface is landed on by at least one policy, and the
      unreached list is printed. Red: a deliberately floating platform in one
      bay stays unreached.
- [ ] A fork players actually take (replaces "3–5 routes per 12-column
      window"): in every bay A, `climber` and `rush` runs are ≥ 2.35 tiles
      apart in height for ≥ 30 % of the bay's frames and both leave the bay
      alive. Red: a flattened bay (all surfaces on one band) drops below 30 %.
- [ ] Terrain never stops a racer: lab `rush` spends ≤ 0.5 s per side pressed
      forward against terrain while NOT at the right clamp **and the corner is
      idle** (today's metric also counts held-gate frames and so reads 18–30 s
      on side 5 for reasons that are not terrain — §2.7b; fix the metric in
      the same task). Red: a one-tile lip with no jump room in a bay.
- [ ] Falls: lab `carried` falls per side ≤ today's (Table M6 baseline), and
      no fall inside a pocket.
- [ ] Dare pockets keep their retreat guarantee *measured*, not assumed: the
      lab records daylight (RIG's back to the damage plane) at the frame each
      run enters a pocket and at the frame it leaves the tip; across the
      matrix no run is inside the damage plane within 1 s of leaving a tip,
      and the entry-daylight distribution is reported per viewport. Today the
      authored contract assumes 14 tiles of daylight at entry
      (`LATTICE.pocket.timing.entryEdgeMarginTiles`) and charges 1.83 of them
      (2 × 2 tiles at 9.4 t/s × the 4.3 t/s plane; 2.56 at the earned
      ceiling), while measured daylight p10 is 5 tiles for `carried` on
      desktop and 2–3 in the phone 6 % frame (Table M7b) — those low frames
      sit inside held gate fights, where the plane is frozen (traced), so the
      guarantee is not falsified today; it is simply never checked where the
      player actually stands. Red: author a pocket whose tip is 6 tiles deep
      instead of 2 → a `carried` run is caught by the plane.
- [ ] Climb (entry 10): lab `climber` share of time ≥ 6 above deck per side
      ≥ today's median (Table M4).
- [ ] Phone readability (entry 20 addendum, §4.5): every route surface and
      staged body within deck + 15 — measured as the highest y any policy
      stands at plus RIG's height inside the T-107 frame's visible band.
- [ ] Whole run: lab `oracle@0` reaches VICTORY at all four viewports; lab
      `oracle@1500` run seconds reported (today 160.8 s desktop).
- [ ] Perf (entry 18): `worstMs` / `over20ms` before/after (more prebuilt
      anatomy, entry 3); and an on-device iPhone frame-time note from the
      operator's Pages build.
- [ ] Legacy pins this task collides with are rewritten as the behaviour
      tests above or retired, each named with its reason in the report (§7
      "Legacy checks"); hard-rule assertions (movement envelope, determinism,
      softlocks, layer purity) are untouched.
- [ ] Captures of every new bay at FAR desktop and the phone frame (T-107's
      if built, else 844×390 FAR), judged against boards 13/14 and the visual
      invariants (connected anatomy, RIG 3–5 % on desktop); operator packet
      with the Pages URL and questions.
owner: lattice-designer
fences: src/pure/vertical-assault.js, src/pure/lattice.js, CONFIG.path
  (faceTiles, levelLength), CONFIG.BACKDROP_TUNE placements, the WORM
  fixture in src/pure/track-archetypes.js, the pathcheck domains that encode
  88-tile geometry. After T-102 (src/pure/path.js).
verify: node tools/pathcheck.mjs; node tools/simlab/race/lab.mjs baseline --seeds 6;
  node tools/simlab/race/facts.mjs
size/risk: L / high — many assertions encode 88; six new bays of authoring.

## T-203 | feature | todo | P1

goal: rolling gates — a side's teach beat plays in its bay A (lesson
bubble), its test beats on the move at the authored sockets, and only the
last beat is the gate cell, primed by RIG's proximity (≈ 45 tiles) as well
as the scroll; the halt stays as the safety net; beats are bounded
(§4.3). Ships with T-205 in M2 (bay A is where the teach beat plays).
Behind `?gates=rolling` until judged.

accept:
- [ ] Currency: seconds the scroll is held per gate for a competent shooter.
      Test: lab `oracle@1500` max gate hold ≤ 4 s on every side at all four
      viewports (today desktop 0–9.8 s, phone 6 % 0–9.3 s; portrait 535–542 s
      at gate 3, Table M3); drive-through rate ≥ 0.5 on every gate (today
      desktop 0–0.67, median 0.33). Falsify: `?gates=legacy`.
- [ ] Currency: share of a competent racer's frames spent advancing vs held.
      Test: lab `oracle@1500` (rush movement, 1.5 s/kill) forward share ≥ 0.60
      and scroll-held share ≤ 0.12 at desktop and phone 6 % (today 0.46 /
      0.32 desktop, 0.49 / 0.25 phone 6 %, Table M5). Bot rows reported, not
      asserted (their holds are dominated by bot aim, §1.3). Falsify:
      `?gates=legacy`.
- [ ] teach → test → remix → break preserved, observed in play: from the
      lab trace, each ecology variant's FIRST appearance has no other
      first-time variant materialized within its lesson window, and every one
      of the 39 variants materializes at least once across the oracle runs.
      Falsify: move a test beat into the teach window → red. (A pure check
      that the score still holds the 39 rows is bookkeeping, not evidence.)
- [ ] Entry 13: judged in the default run, never in `?slice=traversal`.
- [ ] Spread (entry 19): before/after distributions of sides cleared and run
      seconds for all four bot styles; reported, not asserted.
- [ ] Operator packet on the M2 Pages release: `?gates=rolling` vs
      `?gates=legacy`; questions incl. "which side made you stop moving, and
      why?".
owner: gameplay-engineer
fences: src/pure/level1-ecology-encounters.js, src/sim/wavegate.js,
  src/sim/spawner.js (lesson bubble), src/pure/waves.js, new pathcheck
  domain. After T-102, T-201 and T-205 (same milestone). Must not touch
  lattice geometry.
verify: node tools/pathcheck.mjs; node tools/simlab/race/lab.mjs baseline --seeds 6
size/risk: L / high — touches the gate lifecycle, the encounter score and the
  pressure director together.
```

#### M3 — levels as data, chaining, a second level

```markdown
## T-206 | feature | todo | P1

goal: a pure level descriptor (src/pure/levels.js, track-archetype segment
schema) drives path, sides, transitions, backdrop table and encounter score;
the run chains levels; between levels a phone-first card; an optional
resume that cannot be lost silently (§5.5; operator Q4/Q5 decide the
options shown).

accept:
- [ ] No-change proof: with one descriptor equal to today's run, every
      race-lab fingerprint is identical to the committed baseline
      (`lab.mjs check` exit 0). Falsify: perturb one descriptor field → mismatch.
- [ ] Durability (LANE-BRIEF: a lost save is P1): a pathcheck domain with a
      fake storage covers unavailable / throwing / quota / corrupt JSON /
      older schema; in every case the title starts level 1 on the first input
      and a visible "progress is not saved on this device" line appears; the
      save is one atomic key. Falsify: make the read throw unguarded → red.
- [ ] Phone: the card is touch-operable inside safe-area insets (T-101/T-105
      layout), shows no keyboard words on touch devices, auto-continues;
      captures at 844×390 and 390×844, DPR 1–2.
- [ ] Next level's critical art joins the preload gate during the previous
      level's last side: no frame over 50 ms on the card (perf sampler).
- [ ] iPhone Safari (entry 20 addendum), observed on the M3 Pages release by
      the operator: the card fits inside the notch/home-indicator safe areas
      in landscape with no element fullscreen; its CONTINUE tap re-unlocks
      audio after a background/foreground switch; a resume written in a
      normal tab survives closing and reopening it; a private tab shows the
      "not saved" line instead of failing.
- [ ] Operator packet per Q4/Q5 answers.
owner: gameplay-engineer
fences: new src/pure/levels.js, src/sim/level.js (selection), src/main.js run
  lifecycle, src/ui/shell.js (card), new pathcheck domain. Coordinate with
  T-101/T-105 for the deck and shell.
verify: node tools/pathcheck.mjs; node tools/simlab/race/lab.mjs check
size/risk: L / high — composition root and run lifecycle; a new durable
  surface.

## T-207 | lattice | todo | P1

goal: Level 2 RIBLINE & NECK — haunch ribline (exterior, 176) → neck
access-plate flip → cervical interior (176, crossfire-cavity bay B) →
interior ring ratchet → pressure tract (176, vent-stack bay B) → vent breach
(level end), built on the transform fixture system from the G2 neck fixture,
with CONTAIN/QUARANTINE encounters (§5.3).

accept (behaviour, entry 21 — each red on today's tree or on a broken fixture):
- [ ] Completion by play: lab `oracle@0` and all four bot styles start level
      2 and reach its vent breach at all four viewports (race lab extended to
      levels, T-210); distributions of level seconds reported (entry 19).
      Red: block the vent apron.
- [ ] The flip carries RIG: across every lab run, no fall (y < killY) and no
      teleport beyond the movement envelope within ±6 tiles of the neck seam
      during the flip ritual. Red: remove the carried plate's collision.
- [ ] A fork players take, per side (same test as T-205): `climber` vs
      `rush` height separation ≥ 2.35 tiles for ≥ 30 % of each side's frames.
- [ ] Currency: seconds per side and gate holds within T-205/T-203's bands;
      `gate-view` 0 bodies outside the held view at every viewport.
- [ ] Currency: HUD-ALT gained across the level ≥ 80 m (plan: 86 m), from
      the lab's ALT trace, not from the authored profile.
- [ ] Static anatomy (entry 3), observed: a capture script records every
      anatomy mesh's world matrix before, during and after the flip and the
      breach; only the access plate and the vent cover change. Red: animate
      one rib.
- [ ] Captures at FAR desktop + the phone frame vs boards 11/13; operator
      packet (`?level=2` on the Pages release).
owner: lattice-designer
fences: src/pure/transform.js (new fixture), src/pure/levels.js entry,
  vertical-assault bay data for L2; render through existing transform
  renderers only.
verify: node tools/pathcheck.mjs; node tools/simlab/race/lab.mjs baseline --seeds 6
size/risk: L / high — first level built on the transform machinery with
  enemies and gates.

## T-208 | art | todo | P2

goal: Level 2 and Level 3 dressing from the existing kit — per-level backdrop
tables, band atmosphere/tone, state-specific components (contain/quarantine,
sterilize/scuttle) — with no new generated images (§5.6).

accept:
- [ ] Currency: visible surface detail. Test: LANE-BRIEF's mean row-to-row
      luminance detail on each level's main surface at true FAR size, vs its
      own `?dress=0` control; report both numbers. Falsify: if the two are
      within 10 %, the dressing is invisible — not done.
- [ ] Each level identifiable in one still: captures of all three levels side
      by side at FAR desktop and landscape phone; operator question "which
      level is this?" on unlabeled stills.
- [ ] Palette tokens only (pathcheck palette guard); assets degrade safely.
owner: asset-artist
fences: CONFIG.BACKDROP_TUNE (per-level tables), transform band atmosphere/
  tone data, render dressing tables; no sim files.
verify: node tools/pathcheck.mjs; the capture script it adds
size/risk: M / low.
```

#### M4 — level 3 and the Crown at the top

```markdown
## T-209 | lattice | todo | P1

goal: Level 3 SPINE & CROWN — dorsal ridge (kill-braid bay B) → collar (new)
→ crown roots (crown-roots bay B) → the shipped Crown finale; and, if the
operator chose structure A (Q1), level 1 becomes the three-side Leg and the
39-row ecology score is re-scored across the nine sides (§5.2, §5.4).

accept:
- [ ] Observed in play: every one of the 39 ecology variants materializes
      at least once across the lab's oracle runs of the three-level climb,
      first appearances in the shipped order of defense states (OBSERVE →
      SCUTTLE). Red: drop or reorder a row. (The pure "each row used once"
      check is bookkeeping, kept but not cited as evidence.)
- [ ] Every level completes under `oracle@0` at all four viewports;
      `gate-view` 0 outside for every level.
- [ ] Currency: whole-climb seconds for `oracle@1500` and the four bot styles
      reported as distributions (entry 19) — no target asserted.
- [ ] Currency: HUD-ALT at the Crown ≥ 250 m (plan: 274 m).
- [ ] Crown finale contracts unchanged (existing finale pathcheck domains).
- [ ] Captures and operator packet for the full three-level climb.
owner: lattice-designer
fences: src/pure/levels.js, src/pure/level1-ecology-encounters.js,
  src/pure/vertical-assault.js, finale placement only.
verify: node tools/pathcheck.mjs; node tools/simlab/race/lab.mjs baseline --seeds 6
size/risk: L / high.

## T-210 | harness | todo | P2

goal: the race lab follows the levels — drive any level descriptor, report
per-level and per-side metrics, and add a CI-sized oracle subset to
pathcheck (§1.1, Appendix A).

accept:
- [ ] `lab.mjs check` still reproduces the committed T-104 baseline exactly
      (zero effect on the game; falsify by editing a sim constant → mismatch).
- [ ] A pathcheck domain runs `oracle@0` on every level at four viewports in
      ≤ 30 s wall and asserts completion; prove it binds by breaking a gate
      in a scratch copy.
- [ ] `browser-check.mjs` re-proves replica = Chrome on the new level path.
- [ ] tools/simlab/README.md honesty notes updated.
owner: gameplay-engineer
fences: tools/simlab/race/*, one new pathcheck domain; no src/ changes.
verify: node tools/simlab/race/lab.mjs check; node tools/pathcheck.mjs
size/risk: M / low.
```

---

## 8. Open questions for the operator

Five, each with neutral options. The build plan proceeds on everything that
does not depend on them (§7's milestone M1 and the level framework).

1. **The six defense states across three levels.** Should the ship's six
   states (Observe → Scuttle) happen once across the whole game — two per
   level, with the Crown at the end of level 3 — or should each level run
   through all six on its own?
2. **Enemies still alive at the end of a side.** Should the climb stop until
   they are destroyed (as now), or should it keep going with them following
   you onto the next side?
3. **Length of a side.** Today a side takes about 20 seconds from turn to
   turn (18–22 s measured for a perfect run; 26–36 s when a gate is fought).
   On a good run, should a side take about 15 seconds, about 25, or about 40?
4. **Between levels on a phone.** When a level ends, should the climb carry
   straight on into the next one, stop on a short card you tap to continue,
   or go back to a menu where you pick a level?
5. **Starting point.** Should you be able to start from a later level you
   have already reached on this device, or should every run start at the
   bottom of the Meridian?

---

## 9. Proposed inbox issues

LANE-BRIEF schema; the integrator assigns numbers.

```
## I-??? | bug | S2 | repro: node tools/simlab/race/gate-view.mjs; node tools/simlab/race/lab.mjs one '{"policy":"rush","seed":1,"viewport":"phone-portrait","instrument":"oracle"}' @ 98b12c9 | evidence: artifacts/t104-race/gate-view.json, artifacts/t104-race/baseline.json (oracle@0 phone-portrait)
In phone portrait (390x844) 27 of the 39 authored gate bodies stand behind the
damage plane while their gate holds the scroll; the rooted teaching beats at
gate 3 (polyp-needle, 6.0 tiles off-screen) and gate 5 (polyp-gateweaver,
17.0 tiles) cannot come into view, the next beat waits for them, and the gate
holds until LEVEL1_ECOLOGY_BEAT_LOCK_MS (300 s) per uncleared beat. A perfect
on-screen shooter is held 547 s at gate 3 in 2 of 3 runs (the third sat 301 s
at gate 5); at 1.5 and 3 s per kill all six runs sit 535–542 s at gate 3 until
the 600 s cap; no bot run passes gate 3. Desktop and landscape (FAR and the estimated 6 %
frame): 0 of 39. S2 not S1: portrait is supported but not the tuning target
(entry 20 addendum), and the lock does release. Fix direction:
resolve gate sockets against the held view at the live viewport (or widen the
held portrait view at gates), and bound the beat lock to seconds (T-201).

## I-??? | fairness | S3 | repro: node tools/simlab/race/lab.mjs baseline (Table M6) @ 98b12c9 | evidence: artifacts/t104-race/baseline.json
HULL FALLBACK's consecutive-fallback ceiling resets after 8 tiles of
CUMULATIVE rightward movement (src/sim/player.js: fallbackEarnedTiles +=
any positive per-frame dx). Inside a held gate arena a player moving back and
forth re-earns the reset without advancing, so lethal events there are almost
always absorbed as fallbacks (full heal) rather than spending lives. Possibly
intended ("RIG who fights back … earns the next fallback"); reported because
it shapes deaths per side and therefore the spread entry 19 protects. Fix
direction if unintended: count progress past the previous high-water mark.

## I-??? | docs | S3 | repro: node tools/simlab/race/facts.mjs (archetypes.WORM) @ 98b12c9 | evidence: artifacts/t104-race/facts.json
docs/TRACK-ARCHETYPES.md still describes WORM as 6 × 65 = 390 track tiles and
"24 + 6 × 88 + 31 = 583" in the same file; src/pure/track-archetypes.js
builds 6 × 88 = 528. The architecture table's WORM row is stale.

## I-??? | bug | S2 | repro: HB_PROBE_BOOT_MS=180000 HB_PROBE_SPAWN_MS=300000 node tools/pathcheck.mjs on a loaded host (load average ~40) @ 98b12c9 | evidence: this lane's pathcheck log (3988 passed, 1 failed) and /private/tmp/hullbreaker-pathcheck-render-submission/result.json (mtime 20:23, run at 21:4x)
tools/pathcheck/render-submission-contract.mjs writes and reads a fixed,
shared path (/private/tmp/hullbreaker-pathcheck-render-submission/result.json).
When the probe fails to boot, the domain still reads whatever result.json an
earlier run left there — any lane's — and certifies materialViolations === 0,
instanceUploadKbPerFrame === 0 and the MSAA sample count from stale data:
observed on this lane's run, where "boots the shipped scene" failed and the
three result assertions passed off a file written ~80 minutes earlier. Under
entry 21 this is the gate-reports-green-while-broken class (SPRINT's schema
would call a corrupted gate S1; filed S2 because no player is affected). Also:
the probe's page.goto has a hard-coded 45 s 'load' timeout that
HB_PROBE_BOOT_MS does not widen, so the domain fails on a loaded host whatever
the game does. Observed twice in this lane on the same unmodified tree: at the
start (19:55, before any edit) 3,985 passed / 4 failed with result.json absent,
and at the end (22:44, with HB_PROBE_BOOT_MS=180000 HB_PROBE_SPAWN_MS=420000)
3,988 passed / 1 failed — the same boot timeout, with the other three
assertions now certified from a result.json another lane wrote at 20:23. Fix direction: per-run temp dir, delete before spawn, refuse a
report older than the spawn; route the goto timeout through HB_PROBE_BOOT_MS.
For T-108.

## I-??? | docs | S3 | repro: node tools/simlab/race/edges.mjs; node tools/simlab/race/probe-framing.mjs @ 98b12c9 | evidence: artifacts/t104-race/facts.json, artifacts/t104-race/framing.json
src/render/camera.js's PORTRAIT_SAFE comment says portrait "changes the
visible width from roughly 21 to 41 world tiles"; with the later compact
portrait multiplier (1.15) and the 46 px insets the shipped 390x844 view is
19.0 tiles wide. The comment describes a superseded camera.
```

---

## Appendix A — reproduce every number

All commands run from the worktree root with plain `node` (v22); none needs a
build step or network. Every output lands in `artifacts/t104-race/`.

| number(s) | command | artifact |
| --- | --- | --- |
| §2.2–2.7 distributions, Tables M1–M8 | `node tools/simlab/race/lab.mjs baseline` (232 runs; `--jobs 2`), then `node tools/simlab/race/doc-tables.mjs --condensed` (the tables in §2) or without `--condensed` (every viewport) | `baseline.json`, `baseline.md` |
| reproduce the matrix exactly | `node tools/simlab/race/lab.mjs check` (every run fingerprint must match; exit 0) | — |
| one run, any config | `node tools/simlab/race/lab.mjs one '{"policy":"rush","seed":1,"viewport":"phone-portrait","instrument":"oracle"}'` | stdout |
| §2.1 course arithmetic, view widths, RIG pixel height, ascent per side | `node tools/simlab/race/facts.mjs` | `facts.json` |
| §5.2 the proposed climb, validated against `src/pure/track-archetypes.js` | `node tools/simlab/race/climb-plan.mjs` | `climb-plan.json` |
| §1.2 replica = Chrome | `node tools/simlab/race/browser-check.mjs` (defaults: 640×400, 24 s) | `browser-check-640x400.json` |
| §1.2 / §2.1 live edges per viewport + framing screenshots (`--only phone-landscape-view-mid,phone-landscape-view-near` for the two shipped scales that bracket the addendum's 6 % frame) | `node tools/simlab/race/probe-framing.mjs` | `framing.json`, `framing-*.png` |
| §2.8 gate bodies outside the held view, and how close the visible ones stand to the damage plane | `node tools/simlab/race/gate-view.mjs` | `gate-view.json` |
| §2.7 why a racer's view is empty (joint / clamp / free split) | `node tools/simlab/race/sight.mjs --preset racer` | stdout (prints each run's fingerprint) |
| §4.5 rule 5 — which frames lose the daylight behind RIG, and in what corner state | `node tools/simlab/race/daylight.mjs --preset phone-crowding` | stdout (prints each run's fingerprint) |

Inputs the numbers depend on: `src/config.js` (`path`, `waves`, `spawner`,
`momentum`, `player`, `camera`, `viewScales`), `src/pure/path.js`,
`src/pure/waves.js`, `src/pure/ascent.js`, `src/pure/vertical-assault.js`,
`src/pure/level1-ecology-encounters.js`, `src/sim/*` and `src/main.js` at
`98b12c9`. If any of them moves, re-run `lab.mjs check`: a mismatch means the
doc's measured numbers are stale for that tree (LANE-BRIEF: never inherit a
measured number across a change that could move it).
