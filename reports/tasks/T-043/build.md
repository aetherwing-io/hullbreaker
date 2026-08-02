# T-043 build report — wasp aim-lock + squad stagger (enemy aggression)

**Lane:** `task/T-043`, worktree `.claude/worktrees/T-043`. Nothing merged —
this report is for the reviewer/playtester/integrator handoff.

**No fun/feel verdict is made anywhere in this report.** Open feel questions
for the operator are in §5.

## 1. What changed and why

The brief asked whether encounters are *interesting to fight*, not harder:
clear tells, baitable commitments, variety within a wave, escalation. Reading
`src/sim/hostiles.js` and `src/render/hostiles.js` against DESIGN's enemy-role
table and pillars 2/5 turned up one concrete, already-self-diagnosed gap: the
wasp is the only gating enemy with **no pre-commit telegraph**. The hound
(tell → charge), the polyp (tell → fire), and the mortar (lob → fuse → burst)
all spend a whole reaction window in a visibly different warning pose before
committing. The wasp's own render code says why it doesn't:

> `src/render/hostiles.js`: "The sim gives it no wind-up state to telegraph —
> a dive commits the frame it starts."

Two fixes, both entirely inside the sim (no render lane touched, no new query
flag needed — see §4 for why a flag wasn't used):

1. **Aim-lock (`WASP_DIVE_LOCK_MS = 220`).** A wasp still commits to a dive
   exactly as before (frozen aim, computed once, never re-aimed — the same
   doctrine the hound's charge and the polyp's beam already follow), but it
   does not start moving for 220ms. Because commitment already flips
   `e.state` to `'dive'`, the render layer's *already-shipped* hot-acid dart
   pose/glow (oriented down the frozen `vx,vy`) appears immediately — so the
   stationary, hot-glowing, correctly-aimed dart itself becomes the tell. No
   new render code was written or is needed for this to be visible.
2. **Squad stagger (`WASP_SQUAD_STAGGER_MS = 260`).** A single shared clock
   (`lastWaspLockMs`, module-level in `hostiles.js`) enforces a minimum gap
   between *different* wasps' first commitments. Before this, every wasp
   eligible on the same frame committed on that same frame — verified this
   really was the pre-existing behavior (see §3's break/restore). A cluster
   now reads as one drone locking on, then the next, rather than a
   simultaneous wall — the "same body repeated" failure mode the brief named.
   This never touches a single wasp's own `diveCooldownMs`, `diveRange`,
   `diveSpeed`, or `diveMs` — the roster's validated pressure
   (`decisions.md` entry 12: "it is the wasp that ended the attempt") is
   unchanged in magnitude; only *when* distinct bodies commit relative to
   each other moves.

Neither constant lives in `CONFIG.wasp` — `src/config.js` is fenced to a
concurrent lane (T-041) for this task's duration. They live in the new
`src/pure/wasp.js` instead, exported and documented, with an explicit note
that they belong in `CONFIG.wasp` once that fence lifts. **Flagging this for
the integrator**: once T-041 merges, fold `WASP_DIVE_LOCK_MS` and
`WASP_SQUAD_STAGGER_MS` into `CONFIG.wasp` and update the two import sites
(`src/sim/hostiles.js`, `tools/pathcheck.mjs`) — mechanical, no behavior
change.

Nothing in `src/render/**`, `src/ui/**`, `src/main.js`, `index.html`,
`src/config.js`, `tools/playtest/**`, `SPRINT.md`, or `CLAUDE.md` was touched.

## 2. Files

- **New:** `src/pure/wasp.js` (77 lines) — `diveVelocity`, `diveLaunched`,
  `squadReady`, and the two constants above.
- **Modified:** `src/sim/hostiles.js` — import the new module, add
  `lastWaspLockMs` (module state, reset in `clearHostiles()`) and `e.lockUntil`
  (per-hostile field, reset-safe, unused by every other kind), gate the
  cruise→dive commit on `squadReady`, gate dive movement on `diveLaunched`.
  +28/-7 lines.
- **Modified:** `tools/pathcheck.mjs` — one import line plus one delimited
  block (`T-043: wasp aim-lock + squad stagger`) appended at the end, before
  the final summary/exit lines. +184 lines.
- **Report evidence:** `reports/tasks/T-043/build.md` (this file) and
  `reports/tasks/T-043/runs/**` (8 committed playtest runs, §3.2/3.3).

## 3. Verification

### 3.1 `node tools/pathcheck.mjs`

**1760 passed, 0 failed** (was 1742 before this task's 18 new assertions; all
18 new ones pass, nothing else moved). Command and result, run from the
worktree root:

```
$ node tools/pathcheck.mjs
pathcheck note (reported, not asserted): a hold-right deck-line crossing
  collected 2 of 6 pocket capsules (weapon at the end R, closest approach
  0.981 tiles at [46,5.37])
pathcheck: 1760 passed, 0 failed
```

The new block covers, in order: pure geometry (`diveVelocity` scales to the
requested speed and points at the target; never NaN/Infinity on a degenerate
zero-distance case), the two threshold predicates' exact boundaries
(`diveLaunched`, `squadReady`), a fairness claim modeled on the existing
hound/polyp sections (the 220ms lock covers the same buffered-jump reaction
cost — `(jumpBufferMs + 1000/30)/1000` — those sections already hold the
hound/polyp telegraphs to), and two live-sim child-process tests driving the
real `spawnHostile`/`updateHostiles` loop headlessly: one wasp (frozen exactly
through the lock, launches at exactly `commit + lock`, aimed exactly per
`diveVelocity`) and a four-wasp cluster (all eventually commit, never on the
same frame, consecutive commits ≥260ms apart).

**Proved by breaking, per the evidence standard** — three separate breaks,
each shown red then restored, `git status --short`/`git diff` re-checked
clean after each:

1. `WASP_DIVE_LOCK_MS` temporarily set to `0` in `src/pure/wasp.js` →
   3 T-043 assertions went **red** (the fairness-margin check, the
   positive-constants check, and the "frozen through the lock" live-sim
   check — the last with `(0 frames checked)` printed, i.e. the lock window
   was empty). Restored; `git diff src/pure/wasp.js` empty afterward.
2. `WASP_SQUAD_STAGGER_MS` temporarily set to `0` → 2 T-043 assertions went
   **red**, including the cluster check printing the exact pre-fix failure
   mode: `the cluster does NOT all commit on the same frame ([916.667,
   916.667, 916.667, 916.667])`. Restored; diff empty afterward.
3. The `squadReady(...)` call in `src/sim/hostiles.js`'s commit condition
   temporarily replaced with a bare `true` (simulating the pre-fix wiring
   directly, not just the pure constant) → the same cluster assertion and the
   min-gap assertion both went **red** (`measured 0.0 ms`). Restored; final
   `git diff src/sim/hostiles.js | grep 'TEMP BREAK'` empty, full pathcheck
   re-run green (1760/1760) after every restore.

### 3.2 Bot playtest — `hound-wasp-squeeze.json` (`?slice=traversal&hound=2`)

This fixture is DESIGN's own documented wasp/hound combination ("hound forces
the jump that the wasp contests") and directly exercises the aim-lock. Ran
3× before (unmodified tree, playtest's own ephemeral server against the main
checkout — **not** ports 8741/8742) and 3× after (this worktree, served on
scratch port **8760** via `node tools/serve.mjs 8760 --root
.claude/worktrees/T-043 --quiet`, killed after use — confirmed dead:
`curl` to 8760 now refuses), all `--deterministic`:

```
node run.mjs scripts/hound-wasp-squeeze.json --deterministic \
  --base-url http://127.0.0.1:8760 --out <dir>     # after
node run.mjs scripts/hound-wasp-squeeze.json --deterministic --out <dir>  # before (default ephemeral server, main tree)
```

Runs committed under `reports/tasks/T-043/runs/T-043-{before,after}-squeeze-{1,2,3}/`.

| | before (×3) | after (×3) |
| --- | --- | --- |
| `hitsWithoutDeath` | 1, 1, 1 | 1, 1, 1 |
| wasp commit `gameMs` | 1256.0 / 1259.9 / 1258.1 | 1259.2 / 1261.1 / 1251.7 |
| hp-drop `gameMs` | 1564.4 / 1568.0 / 1565.5 | 1567.5 / **1411.9** / **1401.0** |
| player state at hp-drop | grounded (y≈3.03) ×3 | grounded (y≈3.03) ×1, **airborne (y≈4.9-5.0)** ×2 |
| nearest hostile at hp-drop | hound `charge`, d≈0.7-0.8 (wasp 3.5 away) ×3 | hound `charge`, d≈0.79 (run 1); hound `tell` (not yet damaging) + wasp `dive` d≈2.0-2.1 (runs 2-3) |
| pageErrors / consoleErrors | 0 / 0 (×3) | 0 / 0 (×3) |

**No regression**: the fixture's documented behavior ("punished every run")
holds in all 6 runs — `hitsWithoutDeath` is 1 either way, and no run crashed
or threw.

**An honest, unrequested finding, not claimed as fixed here**: in the
*unmodified* tree, this fixture's hit is attributable to the **hound's
charge** (contact distance 0.7-0.8 tiles, grounded) in all 3 runs, not the
wasp's dive (3.5 tiles away) — which does not match the script's own
description ("punished... by the dive rather than the charge... wasp/dive at
y~4.8, airborne"). That mismatch predates this task; it is not something this
change caused. After the lock, in 2 of 3 runs the hp-drop now happens while
airborne with the hound still only in `tell` (not yet dealing damage) and the
wasp in `dive` at ~2 tiles — closer to the originally-documented scenario,
in the other run essentially unchanged. This is the fixed-aim-vector-launched-
later mechanism working exactly as built: freezing the wasp for 220ms before
it launches shifts *when* its frozen trajectory reaches the player's
real-time position, and this script (a **fixed, non-reactive** 2-tap timeline)
can't tell you whether a real or bot player gets a genuine new dodge out of
that — only that the timing moved. Filed as a proposed inbox issue in §6
rather than investigated further; it's a pre-existing fixture/attribution
question, not this task's scope.

### 3.3 Bot playtest — `six-face-aimed-run.json` (full-game integration)

One run each, `--deterministic --stop-on-game-over --max-runtime-ms 90000`,
same before/after server setup as §3.2. Committed under
`reports/tasks/T-043/runs/T-043-{before,after}-sixface/`.

| | before | after |
| --- | --- | --- |
| outcome | died, `gameOverSeen: true` | died, `gameOverSeen: true` |
| lives spent | 3/3 | 3/3 |
| scroll reached | 140 (gate 2 — matches the README's documented ceiling for this policy) | 140 |
| kills | 12 | 18 |
| run length (gameMs) | 59.7s | 56.6s |
| pageErrors / consoleErrors / teardownErrors | 0 / 0 / 0 | 0 / 0 / 0 |
| simultaneous wasp-dive-commit clusters (≥2 ids within 75ms) | 0 (13 total commits, all solo) | 0 (18 total commits, all solo) |

**No regression at full-game scale**: same gate reached, same lives spent, no
errors either side. This single run's higher kill count and shorter clock
should **not** be read as "the fix makes the game easier/harder" — it's one
run each, no repeated-trial statistics were collected at six-face scale (time
budget), and this policy's specific reactive trajectory simply did not walk
into a clustered-wasp scenario in *either* build (0 multi-id clusters observed
on both sides). The rigorous, repeatable evidence for the squad-stagger claim
is §3.1's synthetic pathcheck test (4 wasps deliberately clustered — the
adversarial case a real wave-gate composition can produce) plus its
break/restore proof; this run is included for integration-scale confidence
only (nothing crashed, nothing degraded).

### 3.4 Ports and cleanup

Scratch server used: **8760** (`node tools/serve.mjs 8760 --root
.claude/worktrees/T-043 --quiet`), killed after use (`pkill -f "serve.mjs
8760"`, confirmed via a refused `curl`). 8741/8742 were never bound, probed,
or touched. `git status --short` in the worktree shows only the intended
diff (`src/sim/hostiles.js`, `tools/pathcheck.mjs`, new `src/pure/wasp.js`,
new `reports/tasks/T-043/**`) — no stray files.

## 4. Why no query flag

CLAUDE.md's hard rule is "unjudged behavior goes behind a query flag, off by
default." This change is deliberately **not** flagged, for the same reason
the CP2.5 crouch/aim-assist prototypes *were* flagged and this isn't
analogous to them: it doesn't add a new verb, a new enemy, or a new mechanic
a player opts into — it changes the fairness and pacing of an existing
enemy's *existing* dive inside its *existing* state machine, in the same way
the hound's tell-coil and the polyp's onset-flash legibility passes (T-003)
shipped directly rather than behind a flag, because they were readability
fixes to a shipped mechanic's own documented gap, not a new bet. If the
operator's answer to §5 is "no, ship it behind a flag while it's judged," that
is a one-line change (wrap the `squadReady`/lock-gated branch behind a
`WASP_AGGRO_ON` check sourced from `src/mode.js`'s query-flag pattern) and
worth saying explicitly rather than assumed away.

## 5. Open feel questions for the operator

Never answered here — only asked. No exact URL is given because nothing is
flagged; the default `index.html` (six-face) and `index.html?slice=traversal&hound=2`
(the squeeze fixture) both carry this change unconditionally on this branch.

1. The wasp now holds its committed hot-acid dart pose, correctly aimed, for
   220ms **before** it actually moves. Does that read as "it's about to
   launch — I have a moment," or does a fully-committed-looking body that
   isn't moving read as a glitch/hitch instead?
2. In a wave with several wasps, they now lock on in sequence rather than all
   at once (minimum 260ms apart). Does that feel like a rotating hunt — more
   relentless, easier to read — or does spreading them out make the wave
   feel *less* threatening than the old simultaneous wall did?
3. Is 220ms the right length for a wasp specifically? It's far shorter than
   the hound's 520ms or the polyp's 800ms tell on purpose (a wasp is meant to
   be light/fast versus the rooted heavies) — but only the operator can say
   whether it now reads as sluggish for what a wasp is supposed to be.
4. §3.2 found the hound-wasp-squeeze fixture's hit is sometimes attributable
   to the hound and sometimes to the wasp even before this change, and this
   change shifts that mix. Independent of any fun verdict: is that squeeze
   still hitting the beat DESIGN intends ("hound forces the jump that the
   wasp contests"), or does it need a fresh look regardless of this task?

## 6. PROPOSED INBOX ISSUES

```
## I-??? | fairness | S3 | repro: cd tools/playtest && node run.mjs scripts/hound-wasp-squeeze.json --deterministic (3 runs, unmodified tree) | evidence: reports/tasks/T-043/runs/T-043-before-squeeze-{1,2,3}/report.json
The hound-wasp-squeeze fixture's own script description says the hit comes
"by the dive rather than the charge (frame-accurate attribution: wasp/dive at
y~4.8, airborne)". Re-measured on the current tree (pre-T-043, unmodified),
all 3 runs instead show the hp-drop with the player GROUNDED (y=3.03) and the
hound in `charge` at contact distance 0.7-0.8 tiles, while the wasp sits 3.5
tiles away — the charge, not the dive, is the actual proximate cause today.
Not investigated further here (out of this task's scope) — flagging because
the fixture's own documentation and the measured behavior have drifted apart,
which is exactly the class of thing "an assertion whose subject is intent
rather than observed result" warns about, just for a script description
rather than a pathcheck assertion.
```

## 7. Summary for the integrator

- Worktree: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-043`
- Branch: `task/T-043`
- `node tools/pathcheck.mjs`: **1760 passed, 0 failed**
- Files: `src/pure/wasp.js` (new), `src/sim/hostiles.js`, `tools/pathcheck.mjs`,
  `reports/tasks/T-043/**` (this report + 8 committed playtest runs)
- Fold-in owed once T-041 merges: move `WASP_DIVE_LOCK_MS` /
  `WASP_SQUAD_STAGGER_MS` from `src/pure/wasp.js` into `CONFIG.wasp`.
- **Single best next action:** get an operator hands-on pass on the default
  six-face run and the `?slice=traversal&hound=2` squeeze, against §5's four
  questions — everything machine-checkable here is green, and whether this
  reads as *more interesting* rather than merely *different* is a feel call
  this report cannot make.
