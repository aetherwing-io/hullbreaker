#!/usr/bin/env bash
# merge-task.sh <task-id> — the ONLY way work reaches main.
#
# Deterministic merge gate (script > prompt). Refuses unless ALL of:
#   1. run from the main checkout, on main, with a clean tree;
#   2. a worktree for branch task/<id> exists;
#   3. reviewer verdict   reports/tasks/<id>/review.md   first line APPROVE;
#   4. playtester verdict reports/tasks/<id>/playtest.md first line PASS;
#      — and BOTH verdicts newer than the branch head's commit, so a verdict
#        left over from an earlier pass cannot stand in for the current code;
#   5. the CORE gate green IN THE WORKTREE: node tools/pathcheck.mjs (the
#      CORE tier, full — HB_GATE_FAST is unset below);
#   6. the PLAY gate green against the PINNED worktree, served by
#      tools/serve.mjs (no-store; never python3 -m http.server, T-024):
#      tools/orch/play-gate.mjs — the default URL at desktop and both phone
#      orientations, the failsafe reaching the player, ?selftest=1, a boot
#      with the art blocked, and the deterministic smoke (mid-route,
#      transform-slice, default-url-smoke; best of three each, flakes
#      recorded). T-120, docs/proposals/2026-10-test-audit.md §7.2, §7.6 rule 6.
# Then: merge --no-ff, re-run the CORE gate on main, append reports/STATUS.md,
# and commit the status line. Prints the worktree prune command; does not
# prune automatically. (The DEEP tier — node tools/pathcheck.mjs --deep — is
# on demand and never merge-blocking.)
#
# Flags: --skip-smoke              (the PLAY gate's smoke scripts only; the boot,
#                                   failsafe, selftest and degrade steps still run)
#        --skip-play               (the whole PLAY gate: the documented escape
#                                   hatch for pure-docs tasks; the reviewer
#                                   verdict must justify it)
#        --accept-stale-verdicts   (escape hatch for an integrator-only commit
#                                   on the branch — e.g. composing a doc merge
#                                   conflict — that the landed verdicts already
#                                   cover; never for unjudged runtime changes)
set -euo pipefail

# Records any smoke script that needed more than one attempt, so a flaky pass
# is stated in the merge commit rather than looking identical to a clean one.
# Declared here, not inside the smoke block: `set -u` would abort on the merge
# message below when --skip-smoke leaves the block unentered.
SMOKE_FLAKES=''
# Optional smaller smoke viewport for GPU-less hosts (SwiftShader renders the
# shipped scene at ~1 fps at 1280x800 under load). The smoke criterion is
# boot + full deterministic schedule + no page errors, none of which depends
# on canvas size. Unset = the script's own viewport, exactly as before.
SMOKE_VIEWPORT="${HB_SMOKE_VIEWPORT:-}"

TASK="${1:?usage: tools/orch/merge-task.sh <task-id> [--skip-smoke] [--skip-play] [--accept-stale-verdicts]}"
SKIP_SMOKE=0
SKIP_PLAY=0
ACCEPT_STALE=0
shift
for arg in "$@"; do
  case "$arg" in
    --skip-smoke)             SKIP_SMOKE=1 ;;
    --skip-play)              SKIP_PLAY=1 ;;
    --accept-stale-verdicts)  ACCEPT_STALE=1 ;;
    *) printf 'merge-task: unknown flag %s\n' "$arg" >&2; exit 2 ;;
  esac
done

# Host knobs for a GPU-less container, if tools/orch/cloud-setup.sh wrote them
# (slower boot budgets, smaller smoke canvas, browser perf probe skipped).
# Absent on a normal workstation, where nothing changes.
[ -f "$HOME/.hullbreaker-host.env" ] && . "$HOME/.hullbreaker-host.env"
# The merge gate always runs the FULL tier: HB_GATE_FAST (the per-edit hook's
# representative subset) must never leak in from the caller's environment.
unset HB_GATE_FAST

BRANCH="task/$TASK"
MAIN_ROOT="$(git rev-parse --show-toplevel)"
cd "$MAIN_ROOT"

fail() { printf 'merge-task REFUSED: %s\n' "$1" >&2; exit 1; }

# bounded <seconds> <cmd...> — a hung gate must fail the merge, not stall it
# (T-108 QA: a half-made level-length edit hung pathcheck forever). Portable:
# macOS ships no timeout(1). SIGTERM first, so the PLAY gate can close its
# browser and the CORE gate its lanes; SIGKILL 20 s later if that did not end
# it (pathcheck lanes also kill themselves when their runner is gone).
bounded() {
  local secs="$1"; shift
  "$@" &
  local pid=$!
  ( sleep "$secs"; kill -TERM "$pid" 2>/dev/null; sleep 20; kill -9 "$pid" 2>/dev/null ) >/dev/null 2>&1 &
  local watchdog=$!
  wait "$pid"; local rc=$?
  pkill -P "$watchdog" 2>/dev/null; kill "$watchdog" 2>/dev/null; wait "$watchdog" 2>/dev/null
  return "$rc"
}
PATHCHECK_BOUND_S="${HB_PATHCHECK_BOUND_S:-3600}"
# the PLAY gate boots a real browser a dozen times; on a loaded GPU-less host
# that is tens of minutes (reports/tasks/T-120/build.md has the measured times)
PLAY_BOUND_S="${HB_PLAY_BOUND_S:-5400}"

# --- 1. main checkout sanity -------------------------------------------------
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || fail "not on main"
git diff --quiet && git diff --cached --quiet || fail "main tree not clean"
[ -f "$MAIN_ROOT/HALT" ] && fail "HALT present at repo root"

# --- 2. locate the task worktree --------------------------------------------
WT="$(git worktree list --porcelain | awk -v b="refs/heads/$BRANCH" '
  /^worktree /{wt=$2} /^branch /{if ($2==b) print wt}')"
[ -n "$WT" ] && [ -d "$WT" ] || fail "no worktree found for branch $BRANCH"
printf '== worktree: %s\n' "$WT"

# --- 3+4. gate artifacts -----------------------------------------------------
REVIEW="$MAIN_ROOT/reports/tasks/$TASK/review.md"
PLAYTEST="$MAIN_ROOT/reports/tasks/$TASK/playtest.md"
[ -f "$REVIEW" ]   || fail "missing $REVIEW"
[ -f "$PLAYTEST" ] || fail "missing $PLAYTEST"
# Verdict = the first bare verdict token in the file's opening lines. Tolerates
# a leading markdown header and surrounding decoration (`## PASS`, `**APPROVE**`,
# `_FAIL_`), but a REQUEST_CHANGES/FAIL token still wins if it comes first — the
# token order in the file is what decides.
#
# Strip decoration only from the ENDS of the line. Stripping `_` everywhere
# (as this did until 2026-08-01) turns REQUEST_CHANGES into REQUESTCHANGES,
# which matches no token: the reject verdict goes unseen and parsing falls
# through to whatever appears on a later line — an APPROVE below a
# REQUEST_CHANGES header would have merged a rejected task.
verdict_of() { # verdict_of <file> <ok-token> <bad-token>
  awk -v ok="$2" -v bad="$3" 'NR<=8 {
    gsub(/^[[:space:]#*_`>-]+|[[:space:]#*_`]+$/, "", $0)
    if ($0 == ok || $0 == bad) { print $0; exit }
  }' "$1"
}
[ "$(verdict_of "$REVIEW" APPROVE REQUEST_CHANGES)" = "APPROVE" ] \
  || fail "reviewer verdict is not APPROVE (see $REVIEW)"
[ "$(verdict_of "$PLAYTEST" PASS FAIL)" = "PASS" ] \
  || fail "playtester verdict is not PASS (see $PLAYTEST)"

# Freshness: a verdict older than the code it judged is not evidence. Lanes get
# re-dispatched (fix cycles, budget restarts) and leave last pass's verdict file
# on disk — a stale FAIL merely refuses, but a stale PASS would merge unjudged
# commits. Compare each verdict's mtime against the branch head's commit time.
if [ "$ACCEPT_STALE" = "0" ]; then
  HEAD_TIME="$(git log -1 --format=%ct "$BRANCH")"
  for v in "$REVIEW" "$PLAYTEST"; do
    # GNU stat first: on Linux `stat -f` means FILESYSTEM status and prints
    # pages of it before failing on %m, so the old BSD-first order captured
    # garbage and called every fresh verdict stale. BSD/macOS rejects -c.
    if V_TIME="$(stat -c %Y "$v" 2>/dev/null)"; then :; else V_TIME="$(stat -f %m "$v")"; fi
    [ "$V_TIME" -ge "$HEAD_TIME" ] || fail "stale verdict: $v predates $BRANCH's head commit ($(git log -1 --format=%h\ %s "$BRANCH")) — re-gate the branch, or pass --accept-stale-verdicts with justification"
  done
fi

# --- 5. the CORE gate in the worktree ----------------------------------------
printf '== pathcheck: the CORE tier (worktree)\n'
(cd "$WT" && bounded "$PATHCHECK_BOUND_S" node tools/pathcheck.mjs) \
  || fail "pathcheck failed (or exceeded ${PATHCHECK_BOUND_S}s) in worktree"

# --- 6. the PLAY gate against the pinned worktree -----------------------------
# The worktree is served read-only by the main checkout's tools/serve.mjs
# (no-store, never 304: a warm cache cannot run a stale module, T-024). The PLAY
# gate itself is trusted infrastructure, so main's copy judges the lane; the
# merge that INTRODUCES it (T-120) has no main copy yet and uses the lane's.
if [ "$SKIP_PLAY" = "0" ]; then
  if [ -f "$MAIN_ROOT/tools/orch/play-gate.mjs" ]; then PLAY_ROOT="$MAIN_ROOT"; else PLAY_ROOT="$WT"; fi
  [ -d "$PLAY_ROOT/tools/playtest/node_modules" ] \
    || fail "tools/playtest deps missing in $PLAY_ROOT — run: cd tools/playtest && npm install"
  PORT=$(( 8760 + RANDOM % 200 ))
  node "$MAIN_ROOT/tools/serve.mjs" --root "$WT" --port "$PORT" --host 127.0.0.1 --quiet &
  SRV=$!
  trap 'kill "$SRV" 2>/dev/null || true' EXIT
  for _ in $(seq 1 60); do
    node -e "require('http').get('http://127.0.0.1:$PORT/index.html', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))" 2>/dev/null && break
    sleep 1
  done
  PLAY_OUT="$MAIN_ROOT/tools/playtest/runs/merge-$TASK-play"
  rm -rf "$PLAY_OUT"; mkdir -p "$PLAY_OUT"
  printf '== PLAY gate (pinned worktree on :%s, %s)\n' "$PORT" "$PLAY_ROOT/tools/orch/play-gate.mjs"
  PLAY_ARGS=(--base-url "http://127.0.0.1:$PORT" --root "$PLAY_ROOT" --out "$PLAY_OUT")
  [ "$SKIP_SMOKE" = "1" ] && PLAY_ARGS+=(--skip-smoke)
  if ! (cd "$PLAY_ROOT" && bounded "$PLAY_BOUND_S" node tools/orch/play-gate.mjs "${PLAY_ARGS[@]}") 2>&1 \
      | tee "$PLAY_OUT/play-gate.log"; then
    fail "PLAY gate failed (or exceeded ${PLAY_BOUND_S}s) — see $PLAY_OUT/play-gate.log"
  fi
  # A smoke that needed more than one attempt is stated in the merge commit
  # rather than looking identical to a clean pass (I-040: the harness's
  # deterministic mode was once unsound; best of three is a sample, not a retry).
  SMOKE_FLAKES="$(grep -o 'smoke: [a-z.-]*\.json: .*on attempt [0-9] of 3' "$PLAY_OUT/play-gate.log" \
    | sed -E 's/smoke: ([a-z.-]*\.json).*on attempt ([0-9]) of 3/\1 passed on attempt \2\/3/' | paste -sd ';' - || true)"
  kill "$SRV" 2>/dev/null || true
  trap - EXIT
else
  printf '== PLAY gate SKIPPED (--skip-play)\n'
fi

# --- merge -------------------------------------------------------------------
# Re-check cleanliness HERE, not only at step 1: the smoke suite above takes
# minutes, and gate agents file Inbox issues into SPRINT.md while it runs. The
# step-1 check can pass and the merge still abort on a dirty tree. Fail early
# with the actual reason instead of inside git.
git diff --quiet && git diff --cached --quiet \
  || fail "main tree went dirty during the gate (a lane filed an issue mid-run) — commit it and re-run"

printf '== merging %s\n' "$BRANCH"
MERGE_MSG="Merge $TASK ($BRANCH)"
[ -n "$SMOKE_FLAKES" ] && MERGE_MSG="$MERGE_MSG

Smoke flake (recorded, not hidden): ${SMOKE_FLAKES%; }. A regression fails all
three attempts; this one did not. See I-040 — the harness's --deterministic
mode is unsound, which is why the gate samples three times instead of once."
if ! git merge --no-ff "$BRANCH" -m "$MERGE_MSG"; then
  git merge --abort 2>/dev/null || true
  fail "merge conflict (aborted, main left clean) — resolve manually or rebase the task branch"
fi

printf '== pathcheck: the CORE tier (main, post-merge)\n'
if ! bounded "$PATHCHECK_BOUND_S" node tools/pathcheck.mjs; then
  printf 'POST-MERGE pathcheck FAILED — reverting merge.\n' >&2
  git reset --hard HEAD~1
  fail "post-merge pathcheck failed; merge reverted"
fi

mkdir -p reports
printf '%s | %s | %s | merged %s\n' \
  "$(date '+%Y-%m-%d %H:%M')" "$TASK" "$(git rev-parse --short HEAD)" "$BRANCH" \
  >> reports/STATUS.md
git add reports/STATUS.md
git commit -q -m "STATUS: $TASK merged"

printf 'MERGED %s. Prune with: git worktree remove %s && git branch -d %s\n' \
  "$TASK" "$WT" "$BRANCH"
