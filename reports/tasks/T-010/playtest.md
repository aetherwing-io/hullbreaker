PASS

# T-010 palette pass — playtest gate

Worktree under test: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-010`
(branch `task/T-010`, HEAD `0c4c003`, clean tree), pinned via
`python3 -m http.server 8781` serving from the worktree. Harness run from the
MAIN checkout's `tools/playtest`. Server killed after the runs.

## Run commands (all exit 0, no retries needed — no bootError)

```sh
# pin (cwd = the T-010 worktree):
python3 -m http.server 8781

# from /Users/scottmeyer/projects/hullbreaker/tools/playtest:
node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000 \
  --base-url http://127.0.0.1:8781 --out runs/gate-T-010-mid
node run.mjs scripts/transform-slice.json --deterministic --max-runtime-ms 20000 \
  --base-url http://127.0.0.1:8781 --out runs/gate-T-010-transform
# independent classic-mode verification (gate's own, beyond the committed pairs):
node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000 \
  --url "http://127.0.0.1:8781/index.html?slice=traversal&palette=classic" \
  --out runs/gate-T-010-mid-classic

# in the worktree:
node tools/pathcheck.mjs        # 692 passed, 0 failed
```

## Machine evidence

- `tools/playtest/runs/gate-T-010-mid/report.json` — `"result": "completed"`,
  attempt 1, 0 deaths, consoleErrors `[]`, pageErrors `[]`, bootError none,
  fidelity testapi. idleTimeFraction 0.024, minEdgeMargin 35.44 (exactly the
  deterministic baseline value), protoScore 84.7 (inside the README's
  deterministic baseline band 83.0–85.7). Victory 6.4s.
- `tools/playtest/runs/gate-T-010-transform/report.json` — `"result":
  "completed"`, attempt 1, 0 deaths, consoleErrors `[]`, pageErrors `[]`,
  2/2 transformations, 15.7s, idle 0.
- `tools/playtest/runs/gate-T-010-mid-classic/report.json` — `?palette=classic`
  live run: `"result": "completed"`, attempt 1, minEdgeMargin identical
  (35.44) to the concept run — behavioral evidence the palette is
  render-only. (6.8s vs 6.4s victory time is the harness's documented
  residual frame-alignment spread, not a palette effect.)
- Worktree pathcheck: 692 passed, 0 failed (includes T-010's new palette
  assertions).
- Diff scope check (`git diff main...HEAD --stat`): render/ui files, palette
  module, pathcheck assertions, capture rig, artifacts, docs only — no
  `src/pure/`, no `src/sim/`, no fixtures.

## What I judged (screenshots)

Sources: the two gate-run screenshots (default FAR view), the worktree's
committed side-by-sides `artifacts/palette-v1/` (all five pairs:
traversal-action, sixface-boot, sixface-action, transform-boot, g1-limb),
judged against `docs/concept-art/01-exterior-gameplay.png`,
`10-creature-lattice-chaos.png`, `13-human-scale-monster-climb-grammar.png`
and DESIGN §Concept's color roles.

- **Fog matched to background:** yes, by construction — `src/render/scene.js`
  builds both `scene.background` and `scene.fog` from the single `PAL.bg`
  token; the transform atmosphere remap shares it. Visually coherent in
  every concept capture.
- **Environment deep-teal / rust-orange:** matches the boards' hierarchy —
  rust-orange deck/body mass reads FORWARD (brightest large surface, checker
  intact), bright-orange catwalk lips echo board 01's route lips, teal
  shadow-steel backdrop and haze sit behind. The g1-limb pair shows the rust
  facet separating from the teal wall the way board 13's limbs separate.
  Transform slice: rust hull/ribs, teal wall/skyline, warm panel on the
  cover — consistent inside the body.
- **Pickups hot-magenta:** the capsule token was already the role color; it
  pops against both rust and teal in traversal-action and the gate-run shot.
- **Player fire warm-white:** tracer dots and RIG's warm off-white read
  clearly against the teal sky in every action capture — RIG silhouette
  separation is visibly better than grey-on-grey classic.
- **Threats acid-green:** partial — green reads as the hostile color in all
  captures and separation holds, but hostile meshes still use the muted
  grey-box greens (`hostiles.js` reads `CONFIG.palette.*` directly; the
  brighter CONCEPT acid tokens are authored and asserted but not yet
  applied, lane-fenced to in-flight T-004). Not board-01 acid intensity yet.
  Filed as **I-004 (art, S3)** in SPRINT's Inbox; one-line repoint after
  T-004 merges, per palette.js's own FOLLOW-UP note.
- **Readability holds or improves in the side-by-sides:** holds everywhere,
  improves for RIG, tracers, and capsules (contrast against teal vs grey);
  no element got harder to read. The known FAR glyph-scale issue (capsule
  letter ~9.6px) predates T-010 and is already in the operator checkpoint
  queue — no regression here.
- **`?palette=classic` still renders the old look:** confirmed twice — the
  committed pairs, and my own independent live run
  (`runs/gate-T-010-mid-classic/screenshot.png`: neutral grey-box, byte-true
  feel, completed).
- **No assembling anatomy:** nothing in any capture shows geometry
  assembling/slamming; the diff touches `transform.js`/`limb.js` for color
  tokens only, and the transform run completed 2/2 turns under the merged
  T-001 v3 static-anatomy choreography.

## Not judged here (feel — operator questions, already queued per worktree SPRINT)

Bots and screenshots are evidence, not a fun/taste verdict. For the
operator's palette packet: (1) does the rust deck read as armored machinery
or too warm/bright at FAR? (2) does the dark-teal sky read as deep
atmosphere or just dark? (3) after the T-004 repoint, is the acid-green
intensity right, or does board 01's brightness overshoot at FAR?
