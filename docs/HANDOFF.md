# HULLBREAKER — handoff (state at the end of 2026-10-23)

This file is the live state: what landed, what is in flight, what waits on
the operator, and the host's quirks. Read order and hard rules live in
`CLAUDE.md`. The task queue lives in `SPRINT.md`, and operator verdicts in
`docs/decisions.md` (entries 20-29 are this push).

## Where the game is

- `main` passes the full pathcheck at its last merge gate: 4611 passed, 0
  failed. The 4 browser-probe assertions are skipped on this GPU-less host.
  Both smoke scripts pass.
- **Not yet released.** Pages still serves `v0.1.9`. The next tag, `v0.2.0`,
  is planned once T-107 (phone camera) and T-126 (pause-screen touch safety)
  merge.
- A release is a pushed annotated `v*` tag equal to `main`'s tip
  (`.github/workflows/deploy-pages.yml` refuses any other commit).

Merged in this push (wave 5, the phone-first polish of entry 20):

| task | what changed for a player | escape hatch |
|---|---|---|
| T-101 | two-thumb touch deck, on by default on touch hardware | `?touch=legacy\|0\|1`, `?autofire=1\|0` |
| T-102 | corner turns fixed; proved headlessly by the turnlab | — |
| T-103 | guns sit in RIG's hands (arm meshes, grip solve) | — |
| T-201 | race pass: the scroll keeps a follow lead; corners never wait; a side's survivors chase RIG onto the next side | `?follow=0`, `?gates=legacy`; `?hinge=flow` is an unjudged A/B |
| T-105 | phone shell: touch copy on every screen, one-strip HUD, safe areas, freeze-watchdog warm-up, home-screen manifest | `?touch=0` restores keyboard copy |
| T-121 | cleanup phase 1, behaviour-neutral (dead code, orphan assets, the zip corner's render side) | — |

Docs and proposals that landed: T-104's race plan
(`docs/proposals/2026-10-race-to-the-top.md`, plus the race lab in
`tools/simlab/race/`) and T-108's test audit
(`docs/proposals/2026-10-test-audit.md`).

## In flight

Every agent was stopped at session end, and every branch is pushed. Each
lane's brief is `reports/tasks/T-xxx/dispatch.md` on its branch; T-120's brief
is its SPRINT block plus `build.md`.

| task | branch head | state | next step |
|---|---|---|---|
| T-107 phone camera (RIG ~6% of a phone's height; T-204 per-side rise; R2/R3) | `task/T-107` dc27d3c | near done; PENDING-* items in its build.md | finish, full tier, reviewer + playtester |
| T-126 pause-screen touch safety (arm RESTART/START SCREEN; 44 px options; no history entries) | `task/T-126` 7dcc351 | code committed; report unwritten | finish walks + report, gate; **release blocker** |
| T-120 gate rebuild (CORE/PLAY/DEEP tiers) | `task/T-120` e860a9d | fix round 1 done | merge main, re-dispatch re-review + re-playtest |
| T-127 hook v1 + zip deletion (T-121 phase 2) | `task/T-127` 0db04bd | mid-way | resume; staged scripts in `reports/tasks/T-127/staged-scripts/` |
| T-123 crisp sprite path (unlit, nearest, device-grid, no resample) | `task/T-123` aad2ef1 | was writing its report | resume, gate; still needed by any art route |
| T-124 RIG v3 / v3.1 | `task/T-124` 30a4c80 | **blocked** (entry 29) | operator's art decision |

## Waiting on the operator

1. **Art production method for RIG and the enemies** (entry 29). The CC0 3D
   route did not reach board 01's marine. The options on record are a paid
   pack, a pixel artist, or a hybrid paint-over (T-109 spike §6). Two
   related open questions:
   - shoulder vs hip hold, which may need the firing line raised (a sim
     change);
   - board 01's foot-jet flare, which `tools/player-presentation-check.mjs`
     currently forbids.
2. **Play packets.** SPRINT's "Operator checkpoint queue" holds the T-201
   race pass and T-105 phone shell packets. T-101/T-102/T-103 keep theirs in
   their build reports. They are best played on the iPhone after `v0.2.0`.
3. **Optional hook change** proposed by T-120. It is not made, because it is
   Claude Code hook configuration. `.claude/hooks/check-changed.sh` should
   also fire on `tools/pathcheck/*.mjs` and `index.html`, and should report
   honestly when its watchdog kills a run (today that exits 0 silently).
4. **Housekeeping only the operator can do.** The agent was refused
   force-pushes and remote branch deletion.
   - `origin/task/T-105` (0cd186f) and `origin/task/T-201` (1c65ce5) are
     stale WIP snapshots of lanes that have since merged.
   - The merged lanes' `task/*` backups (T-103, T-109, T-121) can go.

## Host quirks (cloud container)

- **No GPU.** Chromium runs on SwiftShader with 4 shared cores, so browsers
  boot in 20-100 s. DPR 3 trips the freeze watchdog; that is a host
  artefact, not a game bug.
- **Shell setup.** Run `. ~/.hullbreaker-host.env` in every shell.
  `tools/orch/cloud-setup.sh` restores the toolchain idempotently: the
  Chrome symlink, apt libraries, the `/opt/hb-art` Blender/imaging venv and
  the knobs file.
- **Container restarts kill every agent** (twice this push). Commit WIP
  early. After a restart, snapshot each worktree's diff as a WIP commit and
  re-dispatch with a resume brief.
- **Disk.** The allowance is fixed and hit 99% once. Delete `git archive`
  exports as soon as they are used.
- **Killing processes.** `pkill -f <pattern>` can match the calling shell's
  own command line; kill by PID.
- **Merge gate** (`tools/orch/merge-task.sh`):
  - Never edit `main` while it runs.
  - `--accept-stale-verdicts` only for an integrator merge commit the
    verdicts already cover.
  - `--skip-smoke` only when the playtester ran both smoke scripts at a
    runtime-identical head and the integrator re-judged them with
    `tools/orch/smoke-verdict.mjs`.
- **Pathcheck manifest.** Every lane that adds a domain collides in
  `tools/pathcheck/manifest.mjs`. Keep both sides and renumber; d81 is T-201
  and d82 is T-105.
