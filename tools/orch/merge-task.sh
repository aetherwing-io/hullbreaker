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
#   5. node tools/pathcheck.mjs green IN THE WORKTREE;
#   6. smoke playtest green against the PINNED worktree (mid-route +
#      transform-slice, deterministic injection), run by the main checkout's
#      harness via --base-url (tools/playtest/README.md §Pinned-worktree).
# Then: merge --no-ff, re-run pathcheck on main, append reports/STATUS.md,
# and commit the status line. Prints the worktree prune command; does not
# prune automatically.
#
# Flags: --skip-smoke              (documented escape hatch for pure-docs tasks;
#                                   the reviewer verdict must justify it)
#        --accept-stale-verdicts   (escape hatch for an integrator-only commit
#                                   on the branch — e.g. composing a doc merge
#                                   conflict — that the landed verdicts already
#                                   cover; never for unjudged runtime changes)
set -euo pipefail

TASK="${1:?usage: tools/orch/merge-task.sh <task-id> [--skip-smoke] [--accept-stale-verdicts]}"
SKIP_SMOKE=0
ACCEPT_STALE=0
shift
for arg in "$@"; do
  case "$arg" in
    --skip-smoke)             SKIP_SMOKE=1 ;;
    --accept-stale-verdicts)  ACCEPT_STALE=1 ;;
    *) printf 'merge-task: unknown flag %s\n' "$arg" >&2; exit 2 ;;
  esac
done

BRANCH="task/$TASK"
MAIN_ROOT="$(git rev-parse --show-toplevel)"
cd "$MAIN_ROOT"

fail() { printf 'merge-task REFUSED: %s\n' "$1" >&2; exit 1; }

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
    V_TIME="$(stat -f %m "$v" 2>/dev/null || stat -c %Y "$v")"
    [ "$V_TIME" -ge "$HEAD_TIME" ] || fail "stale verdict: $v predates $BRANCH's head commit ($(git log -1 --format=%h\ %s "$BRANCH")) — re-gate the branch, or pass --accept-stale-verdicts with justification"
  done
fi

# --- 5. headless gate in the worktree ---------------------------------------
printf '== pathcheck (worktree)\n'
(cd "$WT" && node tools/pathcheck.mjs) || fail "pathcheck failed in worktree"

# --- 6. smoke playtest against the pinned worktree ---------------------------
if [ "$SKIP_SMOKE" = "0" ]; then
  [ -d "$MAIN_ROOT/tools/playtest/node_modules" ] \
    || fail "tools/playtest deps missing — run: cd tools/playtest && npm install"
  PORT=$(( 8760 + RANDOM % 200 ))
  (cd "$WT" && exec python3 -m http.server "$PORT" >/dev/null 2>&1) &
  SRV=$!
  trap 'kill "$SRV" 2>/dev/null || true' EXIT
  sleep 1

  smoke() { # smoke <script> <max-runtime-ms>
    local script="$1" budget="$2"
    local out="$MAIN_ROOT/tools/playtest/runs/merge-$TASK-$(basename "$script" .json)"
    rm -rf "$out"
    printf '== smoke: %s\n' "$script"
    (cd "$MAIN_ROOT/tools/playtest" && node run.mjs "scripts/$script" \
        --deterministic --max-runtime-ms "$budget" \
        --base-url "http://127.0.0.1:$PORT" --out "$out") \
      || fail "smoke run errored: $script"
    grep -q '"result": *"completed"' "$out/report.json" \
      || fail "smoke did not complete: $script (see $out/report.json)"
  }
  smoke mid-route.json 15000
  smoke transform-slice.json 20000
  kill "$SRV" 2>/dev/null || true
  trap - EXIT
else
  printf '== smoke SKIPPED (--skip-smoke)\n'
fi

# --- merge -------------------------------------------------------------------
# Re-check cleanliness HERE, not only at step 1: the smoke suite above takes
# minutes, and gate agents file Inbox issues into SPRINT.md while it runs. The
# step-1 check can pass and the merge still abort on a dirty tree. Fail early
# with the actual reason instead of inside git.
git diff --quiet && git diff --cached --quiet \
  || fail "main tree went dirty during the gate (a lane filed an issue mid-run) — commit it and re-run"

printf '== merging %s\n' "$BRANCH"
if ! git merge --no-ff "$BRANCH" -m "Merge $TASK ($BRANCH)"; then
  git merge --abort 2>/dev/null || true
  fail "merge conflict (aborted, main left clean) — resolve manually or rebase the task branch"
fi

printf '== pathcheck (main, post-merge)\n'
if ! node tools/pathcheck.mjs; then
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
