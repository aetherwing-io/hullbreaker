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

out="$(cd "$root" && node tools/pathcheck.mjs 2>&1)"
status=$?
if [ $status -ne 0 ]; then
  # Exit 2 feeds stderr back to the agent as blocking feedback.
  printf 'pathcheck FAILED after editing %s:\n%s\n' "$file" "$(printf '%s' "$out" | tail -40)" >&2
  exit 2
fi
exit 0
