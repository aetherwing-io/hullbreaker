#!/usr/bin/env bash
# PostToolUse hook (Edit|Write): run the headless gate when runtime code
# changes. Async — feedback arrives without blocking the agent. No jq
# dependency; node parses the hook payload.
set -uo pipefail

payload="$(cat)"
file="$(printf '%s' "$payload" | node -e '
let d = "";
process.stdin.on("data", c => d += c).on("end", () => {
  try { process.stdout.write(JSON.parse(d).tool_input?.file_path || ""); }
  catch { /* not our problem; stay silent */ }
})')"

[ -n "$file" ] || exit 0

case "$file" in
  */src/*|*/tools/pathcheck.mjs) ;;
  *) exit 0 ;;
esac

# Run the check in the checkout that owns the edited file (worktree-safe).
root="$(git -C "$(dirname "$file")" rev-parse --show-toplevel 2>/dev/null)" || exit 0
[ -f "$root/tools/pathcheck.mjs" ] || exit 0

# Bounded, because an unbounded one cost a day of wall-clock CPU.
#
# On 2026-08-02 two `node tools/pathcheck.mjs` processes were found pinning a
# core each for 24h48m. Both had been launched by this hook inside
# .claude/worktrees/T-009; that worktree was pruned while they ran, so they
# spun against a filesystem that no longer existed and nothing ever reaped
# them. A normal run of this same command is 4.3 seconds.
#
# macOS ships no timeout(1) and this repo adds no dependencies, so the watchdog
# is a background sleep that kills the run if it outlives the budget. 120s is
# ~28x the observed runtime — generous for a loaded machine, still bounded.
PATHCHECK_TIMEOUT_S=120
out="$(
  cd "$root" || exit 0
  node tools/pathcheck.mjs 2>&1 &
  pc=$!
  # >/dev/null is load-bearing, not tidiness: the watchdog inherits this
  # subshell's stdout, and command substitution blocks until EVERY holder of
  # that pipe exits. Without it the hook takes the full timeout on every run
  # even when pathcheck finished in 4s. Measured: 2:00.05 vs 4.6s.
  ( sleep "$PATHCHECK_TIMEOUT_S"; kill -9 "$pc" 2>/dev/null ) >/dev/null 2>&1 &
  watchdog=$!
  wait "$pc"; rc=$?
  # Kill the watchdog's `sleep` child before the watchdog itself: killing only
  # the subshell orphans the sleep, which then lingers for the full budget.
  # Costs no CPU, but it accumulates one stray process per hook fire, and this
  # hook exists because stray processes accumulated.
  pkill -P "$watchdog" 2>/dev/null
  kill "$watchdog" 2>/dev/null
  exit $rc
)"
status=$?
# 137 = SIGKILL from the watchdog. Report it as a hook problem, not a pathcheck
# failure — blocking an agent on "your edit broke the build" would be a lie.
if [ $status -eq 137 ]; then
  printf 'check-changed: pathcheck exceeded %ss and was killed (was the worktree removed mid-run?). Not treating this as a pathcheck failure.\n' \
    "$PATHCHECK_TIMEOUT_S" >&2
  exit 0
fi
if [ $status -ne 0 ]; then
  # Exit 2 feeds stderr back to the agent as blocking feedback.
  printf 'pathcheck FAILED after editing %s:\n%s\n' "$file" "$(printf '%s' "$out" | tail -40)" >&2
  exit 2
fi
exit 0
