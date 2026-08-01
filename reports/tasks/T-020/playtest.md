PASS

# T-020 playtest gate — "the first gap (I-021): is it fair?"

Worktree under test: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-020`
(`task/T-020` @ `6bba7c4`, merge-base `3a1fc74`; `main` @ `58f2b62` — **no `src/`
change on `main` since the merge-base**, so the finding's arithmetic is measured
against the same runtime the integrator will merge into).

Diff under test: `docs/playtests/2026-08-first-gap-triage.md` (new, 378 lines) and
`tools/pathcheck.mjs` (+254). **No `src/` file changed at all** — verified
`git diff main...task/T-020 --stat -- src/` is empty, so the shipped game is
byte-identical and nothing here can regress rendering, physics or determinism.

---

## 1. Runs (pinned worktree, main checkout's harness)

Served the worktree on 8992 (`python3 -m http.server 8992`, cwd = the worktree;
killed after the last run). Harness invoked from
`/Users/scottmeyer/projects/hullbreaker/tools/playtest`.

```sh
node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000 \
     --base-url http://127.0.0.1:8992 --out runs/gate-T-020-mid
node run.mjs scripts/transform-slice.json --deterministic --max-runtime-ms 20000 \
     --base-url http://127.0.0.1:8992 --out runs/gate-T-020-transform
```

| run | exit | `outcome.result` | fidelity | bootError | console/page errors | headline metrics |
| --- | --- | --- | --- | --- | --- | --- |
| `gate-T-020-mid` | 0 | **completed** | testapi | null | 0 / 0 | 1 attempt, 0 falls, idle fraction 0.022, `minEdgeMargin` 35.42 t, protoScore 93.4 (proxy) |
| `gate-T-020-transform` | 0 | **completed** | testapi | null | 0 / 0 | 1 attempt, lives 3→3 (0 spent), idle fraction 0, `minEdgeMargin` 30.12 t, routes `[mid-catwalk, wall-launch]` |

No retry was needed — neither run produced a `bootError`.
`minEdgeMargin` 35.42 vs the README's 35.44 deterministic baseline is inside the
documented ±1 sample-interval polling caveat (honesty item 4), not a movement.

Evidence: `tools/playtest/runs/gate-T-020-{mid,transform}/report.json` + `summary.md`
(`runs/` is gitignored — regenerate with the two commands above).

## 2. Gates that are not the harness

- `node tools/pathcheck.mjs` in the worktree → **1527 passed, 0 failed, exit 0**
  (main: 1517/0, exit 0 — the +10 are this task's).
- Browser smoke, pinned worktree: `index.html?selftest=1` → title
  **`SELFTEST PASS (26 checks)`**, exit 0. The only console error in the page is
  `GET /favicon.ico 404` from `http.server`, pre-existing and unrelated.
- `git diff main...task/T-020 -- src/config.js` → **empty**. No frozen constant moved.
- Seeded chunk stream unchanged and deterministic: `groundH`/`chunkLog`/`platforms`
  SHA-256 prefixes are identical across two separate node processes **and** across
  the two trees (`groundH 61e18e751f7b0064`, `chunkLog 6817808fabe7bb0a`,
  `platforms 820ed6afc9c8a7de`, len 445). The generator was not touched, and this
  proves it.

## 3. The claim, re-measured independently — not accepted on the builder's word

**(a) I reproduced the death on pristine `main` first.** Ran the finding's §1 repro
against the main checkout (`58f2b62`, `src/` clean):

```
hold-right   life lost t=3.08s at x=31.649 | left the lip t=2.52s x=29.363
floor-probe  reached the first wave gate x=88.1 t=10.02s with 3 lives
```

Byte-identical output from the worktree. I-021 is real, it is on `main`, and
`31.649 = 32 − hw − 0.001` is the x-resolution against the far lip's wall face —
the number is a constant of the geometry, not a symptom.

**(b) I re-measured the crossing with my own probe, not theirs.** Wrote an
independent sweep (my own reset/attempt/window code, not the pathcheck child)
that drives the real `src/sim/player.js` over the real `groundH`, holding right,
one held jump, `dt = 1/60`, on **pristine main**. Frozen constants read at
runtime: `scrollSpeed 4.3, runSpeed 9.4, jumpVel 14, gravity −36, fallMult 1.5,
airJumps 1, coyoteMs 100, jumpBufferMs 120`.

| gap | w | floor (SCROLL 4.3) single jump | at run speed | late-press grace, floor, with air jump | grace without air jump |
| --- | - | --- | --- | --- | --- |
| **29-31** | 3 | **0.74 t / 172 ms** | **4.22 t / 449 ms** | 16 f (267 ms) | 0 f |
| 48-50 | 3 | 0.74 t / 172 ms | 2.14 t / 228 ms | 16 f | 0 f |
| 102-104 | 3 | 0.82 t / 191 ms | 4.22 t / 449 ms | 16 f | 0 f |
| 263-266 | 4 | **none** (air jump only, 5.62 t) | 3.22 t / 343 ms | — | — |
| 294-297 / 321-325 | 4 / 5 | 1.82 t / 4.82 t (via catwalk) | 4.20 t / 6.82 t | 0 f | 0 f |

Every number in the doc's §3 table that the assertions depend on reproduces
**exactly** under independent code. (My grace column differs on three
post-gate-1 gaps — 357-358, 392-393 — because my probe re-arms the air jump
differently; none of those feed an assertion, and the face-1 rows agree.)

**(c) The premise the task handed me was wrong, and the builder is right that it
is wrong — I checked it in a real browser, not on paper.** The task's arithmetic
("RIG crosses ground at 4.3, so a held jump travels ~3.0 tiles, so a 3-tile gap
is exactly marginal") assumes the right screen clamp binds at x = 29. It does
not, in the shipped FAR view. Measured from the browser trace of a real six-face
run against the pinned worktree: x 15.48 → 25.43 between `gameMs` 1102 and 2161 =
**9.40 t/s, exactly `runSpeed`**, approaching the first gap. The clamp is tens of
tiles ahead. So the honest window at the first gap is 449 ms of takeoff, not 172.

**(d) Frame-perfect? No.** 449 ms of takeoff positions ≈ 27 frames at 60 Hz, plus
16 frames (267 ms) of late-press grace via the air jump. Even the hypothetical
pinned-to-the-clamp case is ~10 frames of takeoff. What is *zero* is coyote grace
without the air jump (0 f on every level gap — one frame past the lip the feet
are already below the far lip's top): the recovery verb is the air jump, and the
doc says so explicitly rather than claiming coyote covers it.

**(e) Real browser, shipped camera, terrain-aware reflex.** Authored a
throwaway policy script (hold right + `tap jump` on `terrain.gapDist<2.2`, no
bare `pinned` rule — the documented retry trap) and ran it against the pinned
worktree:

```sh
node run.mjs <scratch>/first-gap-cross.json --deterministic --max-runtime-ms 20000 \
     --base-url http://127.0.0.1:8992 --out runs/gate-T-020-firstgap
```

RIG took off at x ≈ 28.2 and landed on the mid-lane catwalk at x = 33.16, y = 6.35.
**No life lost at the first gap**, in the shipped view, with hostiles live. The
run's later life losses are at x = 41.649 and 34.649 (a jam against a step my
4-rule script has no reflex for), not the gap. Script text is in §7 so this is
reproducible.

## 4. Is the new assertion vacuous? — negative controls, run by me

An assertion that passes before and after proves nothing, so I mutated geometry
in throwaway `git archive task/T-020` copies:

| control | mutation | result |
| --- | --- | --- |
| baseline | none | 1527 passed, **0 failed** |
| **NC-1** | widen the first gap by one column (`groundH[32] = GAP`, 29-31 → 29-32) | **5 failures, all of them the new ones**: the face-1 scroll-floor check, "the first gap is still columns 29-31", "jumpable both ways", the coyote-late-press check, and "no gap needing the air jump before the first wave gate". Pathcheck exits non-zero. |
| **NC-2** | builder's stated pin control (`windowFor(g, dt, false, false)` for the floor column) | **1 failure**, exactly the one it claims: *"the probe really is measuring the floor, not a free run"* |

NC-1 is the load-bearing one: a 4-wide first gap is still inside `gapMax = 5`, so
**no pre-existing assertion catches it** — the width guard passes, the
`runSpeed`-reach guard passes, the fingerprints pass. The new invariant is the
only thing in the tree that would. That is a real regression net, not decoration.

## 5. Screenshots — judged, not just collected

- `runs/gate-T-020-gapshot/screenshot.png` — the first gap at the moment of
  crossing, default six-face run, shipped FAR view. RIG is ~34 px of 900 =
  **3.8 % of screen height**, inside the 3–5 % invariant and consistent with
  `CONFIG.viewScales`' documented 3.74 % far figure. The hole reads clearly:
  deck ends, two mid-lane catwalk lines above it, deck resumes. Silhouettes are
  readable, hull surfaces are connected slabs, palette is the shipped concept
  set (rust deck / teal void) with no raw-hex outliers. Nothing assembles —
  the far side of the gap is simply *there* before RIG leaves the lip, which is
  the static-anatomy rule behaving.
- `runs/gate-T-020-mid/screenshot.png` — TRAVERSAL CLEAR overlay, tiers and
  catwalks legible at FAR, RIG's magenta-pocket glyph readable at ~1 % of frame
  width. No glitching, no z-fighting, no popping seams.
- `runs/gate-T-020-transform/screenshot.png` — BREACH CLEAR, 2/2 turns, weather
  streaks over connected interior hull. No assembling anatomy in the frame.

Because the diff touches zero runtime files, none of this *can* be a T-020
regression; it is recorded because the standing orders require the frames to be
looked at, and they are clean.

## 6. What I am NOT certifying

- **Fun.** "A death pit 2.5 s into the game, before any teaching" is a design
  statement, and the operator is the only oracle for it. The doc queues it
  correctly in its §6 rather than self-declaring the answer. Routed to notes.
- **Human reaction time.** 449 ms of takeoff is a geometry measurement. Whether a
  first-time player *sees* the hole in time at FAR is a feel verdict.
- **Two crossings that depend on catwalks** (294-297, 321-325). The probe reports
  they cross; nothing asserts the catwalk stays there when the reachability prune
  runs. The doc flags this in its own honesty list — believed, not verified here.
- **Gap 263-266** genuinely needs the air jump at the scroll floor (my probe
  agrees: floor single-jump window 0). It is past the first gate and the
  assertion keeps it visible; whether it should stay is the doc's §6 Q3, an
  operator call.

## 7. Reproducing my extra evidence

The throwaway browser script (kept out of `tools/playtest/scripts/` on purpose —
it is gate evidence, not a curated smoke script):

```json
{ "name": "first-gap-cross",
  "url": "index.html?enemies=0",
  "viewport": { "width": 1440, "height": 900 },
  "durationMs": 16000,
  "policy": { "rules": [
    { "when": "grounded",  "do": { "hold": "right" } },
    { "when": "!grounded", "do": { "hold": "right" } },
    { "when": "grounded && terrain.gapDist<2.2",          "do": { "tap": "jump", "holdMs": 420 } },
    { "when": "!grounded && vy<0 && terrain.gapDist<1.2", "do": { "tap": "jump", "holdMs": 300 } } ] } }
```

(For the §5 gap screenshot, the same file with `durationMs: 2350` and
`--max-runtime-ms 8000` → `runs/gate-T-020-gapshot`.)

The independent gap-window probe and the fingerprint/negative-control scripts
live in this session's scratchpad; every number they produce is reproducible from
the doc's own §1 repro plus `node tools/pathcheck.mjs`, which is the artifact that
ships.

## 8. Issues filed

- `I-024 | docs | S3` — the new probe's pin guard only catches an *exactly*
  free-running probe; losing the clamp while keeping the scroll-speed start
  inflates the measured "floor" window 0.74 → 4.12 tiles and still passes.
- `I-025 | feel | S3` — the ambient table's first wasp sits on the first gap's
  takeoff lip; a contact hit over the pit knocks RIG *backwards* into it.
  Reproduced in a real browser (hp 3→2 at `gameMs` 2769, x 30.49, airborne).
- `I-026 | docs | S3` — `?enemies=0` silently no-ops on a default six-face run
  (it gates slice fixtures only), so a "terrain-only" default-run measurement is
  quietly a live-combat one. Caught while writing §3(e).

**Verdict: PASS.** The finding's arithmetic reproduces under independent code,
the repro reproduces on pristine `main`, the new invariant is non-vacuous by
negative control, no frozen constant or generated column moved, both smoke runs
completed clean, pathcheck and the browser selftest are green, and the frames are
clean at FAR. The remaining questions are feel, and they are queued as feel.
