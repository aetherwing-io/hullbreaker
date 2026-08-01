#!/usr/bin/env bash
# Stop hook — the flywheel. While armed, the integrator session cannot idle
# with open sprint work. Deterministic (grep, no LLM cost).
#
# Armed only when .claude/flywheel.on exists (the orchestrator touches it at
# kickoff), so ordinary chat sessions in this repo stop normally.
# Kill switches: `touch HALT` at repo root, or `rm .claude/flywheel.on`.
set -uo pipefail

cat > /dev/null  # consume hook payload; decision is derived from repo state

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

[ -f "$root/.claude/flywheel.on" ] || exit 0
[ -f "$root/HALT" ] && exit 0
[ -f "$root/SPRINT.md" ] || exit 0

open="$(grep -E '^## (T|I)-[0-9]+ \| [^|]+ \| (todo|doing|review) \|?' "$root/SPRINT.md" \
        | sed 's/^## //' | cut -d'|' -f1 | tr -d ' ' | head -6 | paste -sd, -)"

[ -n "$open" ] || exit 0

printf '{"decision": "block", "reason": "SPRINT.md still has open tasks (%s). Continue the loop protocol in CLAUDE.md: dispatch/gate/merge or triage the Inbox. If you are genuinely blocked on the operator, mark tasks operator/blocked so the flywheel releases; kill switches: touch HALT, or rm .claude/flywheel.on."}\n' "$open"
exit 0
