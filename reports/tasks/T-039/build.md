# T-039 build report — contact shadows (packet §3 S6)

**Lane:** `task/T-039`, worktree `.claude/worktrees/T-039`. **Nothing merged
to main.**

**UPDATED — see §8.** Sections 1–7 below describe the build as it stood at
commit `9c6752b`, which shipped `?shadow=1`-gated, off by default, per the
dispatch's instruction at the time. Playtest FAILed that build: `decisions.md`
entries 16 and 17 (both landed before the build/addendum commits finished)
retire the blanket off-by-default rule and name contact shadows explicitly as
approved work that "must not stay hidden behind flags." **§8 is the fix**:
shadows now ship ON by default, `?shadow=0` is the escape hatch. Read §8 for
the current, correct state; §1–7 are kept for the record of what was measured
against the flat, pre-ladder build and are labelled accordingly.

**Draw-call delta: exactly +1**, idle and under load, measured via
`renderer.info` in real headless Chrome (not asserted, not assumed):

| | draw calls | triangles | geometries | textures |
|---|---|---|---|---|
| idle, `?shadow=1` absent | 94 | 50,196 | 58 | 5 |
| idle, `?shadow=1` | 95 | 50,292 | 59 | 5 |
| loaded (256 live projectiles + 60/frame injected fire), absent | 107 | 50,348 | — | — |
| loaded, `?shadow=1` | 108 | 50,444 | — | — |

The +96 triangle delta is `POOL_MAX(48) × 2 tris/plane` — three.js's
`InstancedMesh` reports triangles for the whole allocated pool regardless of
how many rows are actually live, so this number does not grow with the
number of on-screen actors. Evidence:
`reports/tasks/T-039/evidence/06-stress-perf.json`.

**Frame time under load: no measurable regression.** Same method as
`tools/playtest/juice-stress.mjs` (60 projectiles/frame via the game's own
`fireWeapon(clone=true)` + one death burst/flash per frame, right key held,
1200ms warm-up + 5000ms sustained, read from the 180-frame `window.HB.perf()`
ring), run against a served copy of this worktree:

| | avgMs | worstMs | fps | over20ms |
|---|---|---|---|---|
| control, `?shadow=1` absent | 8.33 | 9.4 | 120.1 | 0 |
| `?shadow=1` | 8.33 | 9.3 | 120 | 0 |

Both hit the test machine's 120Hz vsync ceiling with zero dropped frames —
"60fps with 200+ live projectiles" holds comfortably in both configurations.
Honesty note, inherited from `juice-stress.mjs`'s own: one headless-Chrome
machine, one run per reading — evidence about this code's per-frame work, not
a claim about the operator's device.

**The transformation slice's 580-call path is not multiplied — it is
untouched.** `?slice=transform` measures **580/580** draw calls and
geometries whether or not `?shadow=1` is requested, because contact shadows
are guarded off entirely there (see §3).

---

## 1. What changed and why

Per the dispatch and `docs/proposals/2026-08-look-direction.md` §3 S6: one
instanced, `MultiplyBlending` quad pool so RIG, hostiles and capsules read as
sitting **on** the world instead of floating over it — the cheapest legal
source of the "nothing reads as lit" finding (0.0% of playfield pixels exceed
luminance 200 in every gameplay capture the audit measured; the light rig is
two lights and zero shadows of any kind).

**This is NOT a shadow map.** `MultiplyBlending` is core three.js: no addon,
no light object, no `renderer.shadowMap`, no post pass, no asset. Packet
§4.1 (a real light rig / shadow-map decision) stays unopened; pathcheck now
asserts `contact.js` touches no shadow-map/light-rig surface at all (see the
new block's static checks).

Files touched, all inside the packet's own file list for S6:
- `src/pure/contactShadow.js` (new) — surface resolution + height falloff,
  THREE-free, so pathcheck can drive both directly.
- `src/render/contact.js` (new) — the one `InstancedMesh`, the fixed pool,
  and the placement math per actor per frame.
- `src/render/palette.js` — one new token, `contactShadow`, in a delimited
  `/* ==== T-039 contact shadows ==== */` block in **both** CLASSIC and
  CONCEPT.
- `src/render/player.js` — RIG calls `syncContactShadow` every `sync()`.
- `src/render/hostiles.js` — every hostile kind calls `syncContactShadow` /
  `releaseContactShadow`, with a `CONTACT_FOOTPRINT` table read straight off
  each kind's own existing `CONFIG` size (never a second authored number).
- `src/render/capsules.js` — same pair of calls.
- `tools/pathcheck.mjs` — one new import line (namespace import, same
  precedent as the T-009 lattice pass) plus one delimited block appended at
  the very end of the file. **The shared `tokenized` array and any other
  lane's assertions were not touched** — see §4 for why, and what that
  leaves for the integrator.

**Scope note — I went slightly past the dispatch's 3-file list.** The
dispatch named `contact.js` / `palette.js` / `player.js` as "your files per
the packet," but the packet's own S6 file list (which the dispatch told me to
follow, "including any corrections carried from adversarial review") also
names `hostiles.js` and `capsules.js` — without them the feature only ever
draws RIG's own shadow, which is a materially smaller deliverable than "S6"
and leaves every hostile/capsule floating exactly as before. I checked before
touching them: neither file is claimed by any other lane's `git status` this
cycle (T-035 holds `config.js`/`camera.js`/`level.js`/`limb.js`/`palette.js`;
T-038 holds `seams.js`), and both are outside the dispatch's explicit
"Do NOT touch" list. I judged the packet's file list controlling over the
dispatch's probably-abbreviated one rather than deliver a half-feature; flag
this for the integrator in case that reasoning should have gone the other
way.

## 2. Gates

| Gate | Result |
|---|---|
| `node tools/pathcheck.mjs` | **PASS** — `2015 passed, 0 failed`. Baseline at this branch's merge-base (`d3f6628`, checked in a scratch worktree) is `1741 passed, 0 failed`; the +274 delta is entirely this task's new block (mostly a dense falloff sweep, ~90 height samples × 2 bounds checks each). |
| Three negative controls, proven by breaking and restoring | **PASS**, each confirmed then reverted clean (`git status --short` / a post-restore `grep` empty): (1) flipped the platform-selection comparison → 63 assertions failed (surface selection genuinely binds); (2) removed the falloff's ceiling guard → 3 assertions failed (exact-zero-at-ceiling genuinely binds); (3) `fog:false` on the material → 1 assertion failed. All three restored, pathcheck back to `2015/0`. |
| `index.html?selftest=1` | **PASS** — `SELFTEST PASS (29 checks)`, `CONTACT_SHADOWS_ENABLED: false` on the plain URL (confirms default-off). |
| Real gameplay durability, `?shadow=1`, ~30s hold-right + periodic jump across multiple corners | **PASS** — no page errors beyond a pre-existing 404 present identically in every configuration tested (see §3); pool's live-row count peaked at 13 of 48 rows; game reached `GAME_OVER` normally (not a hang/crash) and kept progressing (`scrollX` 0 → 61.4). |
| `?slice=transform`, `?slice=traversal`, `?g2=1` boot, with and without `?shadow=1` | **PASS** — transform/g2 report `CONTACT_SHADOWS_ENABLED: false` regardless of the flag (guarded off, by design); traversal reports `true`. No page errors. |
| Baseline six-face run still completes | **PASS** — `tools/playtest/run.mjs scripts/six-face-full-run.json --deterministic` against a served copy of this worktree (no `?shadow=1`, so this is the byte-identical default path): outcome `died` (normal), not a crash. |

## 3. Visual evidence (not a verdict — that is the operator's)

Captured at the shipped FAR default, 1280×800, real headless Chrome. Full
frames: `reports/tasks/T-039/evidence/01-far-default-no-shadow.png` /
`02-far-default-shadow-1.png` — at ordinary crop/zoom the effect is subtle
enough that a full-frame diff is not a useful comparison (RIG is ~30px tall
at FAR). Cropped 4x around RIG's feet:
`03-rig-feet-crop-no-shadow.png` / `04-rig-feet-crop-shadow-1.png` shows a
faint darkening of the checker tile directly under his feet.

To positively confirm placement (rather than trust a subtle diff), I
temporarily swapped `PAL.contactShadow` to pure red, captured
`05-rig-feet-crop-debug-red-tint.png` (a plainly visible mark exactly under
RIG's feet, correctly sized, correctly following him), then reverted the
token — `git status --short` / a post-revert `grep contactShadow`
confirmed the swap left nothing behind, and pathcheck was re-run green
after.

**One real defect this surfaced, now understood as correct behavior, not a
bug:** my first capture attempt (`?shadow=1`, 6s hold-right) showed no visible
shadow at all. I initially suspected a placement bug; instrumenting
`contactShadowPlacement` live against the running sim showed RIG's `y` had
gone to −5.96 with `groundTopAt(x) === -999` — he was mid-fall over one of
the level's authored gaps at the moment I happened to screenshot. Opacity 0
there is the intended behavior (no surface to cast onto), not a defect. Noted
here because it is exactly the kind of thing a screenshot-only check would
have missed or misread.

**Console errors:** one 404 appears identically in every configuration tested
(default, `?shadow=1`, `?slice=transform`, `?slice=traversal`, `?selftest=1`)
— present before this branch, unrelated to this change, not investigated
further (out of scope for S6).

**A shadow this restrained (`maxOpacity` 0.55 over a near-black token,
`0x1c140f` concept / `0x14171c` classic) is a deliberate, honest choice, not
a claim it is enough.** The audit's finding was that 0% of pixels exceed
L200 and the darkest large surface never drops below L43 — S6 alone (no
S1 value-ladder, no S4 backdrop) does not change either of those numbers by
much; it is one grounding cue, not a repaint. I have not measured its
luminance-histogram contribution and would not want that number over-read
without S1 landing first, per the packet's own sequencing note ("everything
else is calibrated against S1").

## 4. What I deliberately did NOT touch, and why

- **The shared `tokenized` array in `tools/pathcheck.mjs`** (the literal
  scan list that already includes `player.js`/`hostiles.js`/`capsules.js`).
  The dispatch flagged this file as having already cost a dropped-assertion
  scare this cycle from a hand-merge, and T-038 (seams.js) likely needs the
  same array edited for its own new file. Instead, `contact.js`'s own
  literal-color/legality checks are a **standalone** block (source
  inspection) that proves the same property without touching shared state.
  **Suggested integrator follow-up:** fold `contact.js` (and probably
  `seams.js`) into that array during the merge — two lines, low risk once
  both branches are in hand together.
- **`src/config.js`** — not in the packet's S6 file list and actively
  contended by T-035 this cycle. Tunables (`ceiling`/`maxOpacity`/
  `minRadiusMult`) live in `src/pure/contactShadow.js` instead, the same
  precedent `src/render/legibility.js` already sets for its own `SHARE`/
  `NEAR_RIG_PCT`.
- **`src/main.js`** — explicitly forbidden. `contactShadowStats()` is
  exported from `contact.js` (same shape as `fx.js`'s `fxStats()`, which
  `window.HB.juice` already surfaces) but is not wired to `window.HB` — that
  needs a `main.js` edit outside this task's scope. Flagging in case the
  integrator wants it on the telemetry surface.
- **A game-reset hook.** Looked for one, concluded it is unnecessary rather
  than just skipping it: `sim/hostiles.js`'s `clearHostiles()` and `main.js`'s
  capsule-clear loop both already call each actor's `removed()` before
  truncating their arrays, so `releaseContactShadow` already fires through
  the wiring in `hostiles.js`/`capsules.js` on every reset. Documented in
  `contact.js`'s own comments rather than left as a silent assumption.

## 5. Open questions for the operator (feel, not mine to judge)

Exact URL: `http://127.0.0.1:<port>/index.html?shadow=1` (served locally;
never bound to 8741/8742).

1. Is the shadow visible/strong enough at the shipped FAR default to read as
   "sitting on the world," or does it need S1's value ladder underneath it
   first before it's worth judging on its own?
2. Is the chosen near-black tone (warm, `#1c140f`) right, or should it be
   cooler/more neutral to match the atmosphere instead of the lit deck?
3. Is the height ceiling (6 tiles) — the point where the cue disappears
   entirely for an airborne actor — too short (blinks out too easily on a
   jump) or too tall (never reads as "off the ground" for a normal hop)?

## 6. Addendum — calibrated against decisions.md entry 14 (half-dose ladder)

**All measurements and captures in §1–3 above predate this addendum and were
taken against a flat pre-T-035 build (no value ladder at all)** — `task/T-039`
forked before T-035's palette/limb/level/camera changes existed, and neither
branch has merged to main yet, so my committed code never saw the ladder.
The team lead flagged, correctly, that a multiply-blended quad's visible
strength depends entirely on what it multiplies against, and that the
shipped default is now `?shade=` at the operator-approved **0.5 dose**
(entry 14), not the flat build I tuned `PAL.contactShadow`/`maxOpacity`
against.

**What I did to check this, without touching either branch's committed
code:** built a throwaway scratch merge (`git worktree add --detach
task/T-035`, `git checkout -b scratch-combo`, `git merge task/T-039`),
resolved the two real conflicts by hand for testing purposes only
(`src/render/palette.js` and `tools/pathcheck.mjs` both append near the
same spot — concatenating both sides was enough, no logic changes), ran
`node tools/pathcheck.mjs` on the combined tree (**2060 passed, 0 failed** —
T-035's 45 new assertions plus my 274, both green together), served it on a
scratch port, and captured RIG's feet at a **confirmed-grounded** frame
(polled `HB.player.grounded` rather than a blind wait, after my first
attempt caught him mid-air over an authored gap) at three points on the
ladder: `?shade=0` (old flat look), the shipped half-dose default (no flag),
and `?shade=1` (the rejected full ladder) — each with and without
`?shadow=1`. The scratch worktree was removed after; nothing from it is
committed anywhere. Evidence copied into this report:
`evidence/07-halfdose-crop-no-shadow.png` / `08-...-shadow.png` (crops),
`11-halfdose-fullframe-no-shadow.png` / `12-...-shadow.png` (full frames),
`09-fulldose-rejected-crop-no-shadow.png` / `10-...-shadow.png`.

**Finding 1 — no "crush the deck into mud" risk observed.** Frame-wide
luminance barely moves: mean gray value 63.71 → 63.74 (whole 1280×800 frame,
`?shadow=1` on vs. off, half-dose default) — a shadow scoped to one actor's
own footprint radius is a tiny fraction of total frame area, so it cannot
meaningfully darken the frame even summed across a few live actors. The full
frame captures (`11`/`12`) show the checker deck still clearly legible with
the ladder's own per-column darkening visible; contact shadows add one more
small, localized, correctly-bounded dark patch per actor, not a repaint.

**Finding 2 — at half-dose the cue is still visibly present, if
restrained.** The 4x crop pair (`07`/`08`) shows a faint but real darkening
of the checker tile directly under RIG's feet in the `shadow` capture that
is absent in the `no-shadow` capture. It reads more subtly than it did
against the flat pre-ladder build in §3, because the ladder has already
spent some of the same "darks" budget on the per-column deck ramp.

**Finding 3 — at full dose (rejected, `?shade=1`) the cue nearly
disappears into the ladder's own darkening**, exactly the "too weak" failure
mode the team lead named. The `09`/`10` crop pair is hard to tell apart —
the deck top row is already dark enough there that `CONTACT_SHADOW.maxOpacity`
(0.55) no longer reads as a distinct, separate cue. This is not a live risk
today (full dose is rejected, not shipped), but it is the concrete evidence
that S6's constants were tuned against the wrong baseline and would need a
pass if the dose ever moved back up.

**What I did NOT do:** retune `CONTACT_SHADOW.maxOpacity` / the palette
token against the half-dose numbers. The scratch merge is not committed
code, S1/S2 (T-035) has not merged to main, and `src/pure/contactShadow.js`'s
constants are not a file either branch currently shares — recalibrating now
against a moving, unmerged target risks tuning against the wrong number
twice. **Recommendation:** re-check this exact comparison for real once
T-035 lands on main (or merges into this branch's target), before this
ships as the judged default — the two sentences above should be treated as
"proof the interaction was checked," not "proof the numbers are right
forever."

## 7. Housekeeping

- Server: `node tools/serve.mjs 8799 --quiet` against this worktree only
  (scratch ports 8801/8810 for the §6 addendum's combined-tree check, after
  confirming 8801 was already claimed by another concurrent lane), killed
  after every measurement session (`lsof -ti:<port>` empty on exit).
  8741/8742/8743 never touched.
- `git status --short` in this worktree, post-commit: clean.
- Scratch measurement/capture scripts used to produce the numbers above live
  outside the repo (session scratchpad) — the raw JSON is copied into
  `reports/tasks/T-039/evidence/06-stress-perf.json` so the numbers in this
  report trace to a committed artifact rather than a transient run.
