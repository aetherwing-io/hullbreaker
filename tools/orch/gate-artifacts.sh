#!/usr/bin/env bash
# gate-artifacts.sh <task-id> — publish a lane's verdicts into the main
# checkout and commit them, so merge-task.sh can find them.
#
# WHY THIS EXISTS. merge-task.sh deliberately requires the reviewer and
# playtester verdicts to live in the MAIN checkout at reports/tasks/<id>/ and
# to be newer than the branch head, so a stale verdict cannot stand in for the
# current code. Gate agents write them into the WORKTREE. Bridging the two was
# three manual steps before every merge (cp, cp, commit), repeated once per
# task, and is pure ceremony.
#
# This does NOT judge anything and does NOT weaken the gate: it refuses unless
# both verdicts exist and both carry a passing first line, and it never edits
# their content. merge-task.sh still re-checks everything independently.
#
#   tools/orch/gate-artifacts.sh T-032
#   tools/orch/merge-task.sh    T-032
set -euo pipefail

TASK="${1:?usage: tools/orch/gate-artifacts.sh <task-id>}"
MAIN_ROOT="$(git rev-parse --show-toplevel)"
cd "$MAIN_ROOT"

fail() { printf 'gate-artifacts REFUSED: %s\n' "$1" >&2; exit 1; }

[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || fail "not on main"

# Locate the lane worktree the same way merge-task.sh does.
WT="$(git worktree list --porcelain | awk -v b="refs/heads/task/$TASK" '
  /^worktree /{wt=$2} /^branch /{if ($2==b) print wt}')"
[ -n "$WT" ] && [ -d "$WT" ] || fail "no worktree found for branch task/$TASK"

SRC="$WT/reports/tasks/$TASK"
[ -f "$SRC/review.md" ]   || fail "missing $SRC/review.md"
[ -f "$SRC/playtest.md" ] || fail "missing $SRC/playtest.md"

REVIEW_VERDICT="$(head -1 "$SRC/review.md"   | tr -d '[:space:]')"
PLAY_VERDICT="$(  head -1 "$SRC/playtest.md" | tr -d '[:space:]')"

[ "$REVIEW_VERDICT" = "APPROVE" ] || fail "review verdict is '$REVIEW_VERDICT', not APPROVE"
[ "$PLAY_VERDICT"   = "PASS" ]    || fail "playtest verdict is '$PLAY_VERDICT', not PASS"

mkdir -p "reports/tasks/$TASK"
cp "$SRC/review.md"   "reports/tasks/$TASK/review.md"
cp "$SRC/playtest.md" "reports/tasks/$TASK/playtest.md"

git add "reports/tasks/$TASK"
if git diff --cached --quiet; then
  printf '== gate artifacts for %s already current; nothing to commit\n' "$TASK"
else
  git commit -q -m "Gate artifact: $TASK review APPROVE + playtest PASS"
  printf '== committed gate artifacts for %s\n' "$TASK"
fi

printf 'next: tools/orch/merge-task.sh %s\n' "$TASK"
