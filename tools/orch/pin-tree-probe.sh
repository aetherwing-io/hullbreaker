#!/usr/bin/env bash
# pin-tree-probe.sh — the falsifier for tools/orch/lib/pin-tree.sh (the merge
# gate's server pin, T-120 fix round 1, playtest I-B).
#
#   bash tools/orch/pin-tree-probe.sh <tree-under-test> <other-tree> <port>
#
#   1  pin <tree-under-test> on an ephemeral port         -> must succeed, and serve it
#   2  a server for <other-tree> holds <port> (a squatter); pin <tree-under-test>
#      on <port>                                          -> must REFUSE
#   3  control: the OLD readiness loop (any 200 on the port) against that
#      squatter                                            -> is fooled (reports ready)
# Exit 0 iff 1 succeeds, 2 refuses and 3 is fooled (the probe can see the defect).
# Starts and stops its own servers; zero effect on the trees.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd -P)"
TREE="$1"; OTHER="$2"; PORT="$3"
SCRATCH="$(mktemp -d)"
. "$HERE/lib/pin-tree.sh"
bad=0
say() { printf 'pin-tree-probe %s %s\n' "$1" "$2"; [ "$1" = OK ] || bad=$((bad + 1)); }

# 1
if pin_tree "$TREE" "$SCRATCH/1.log"; then
  got="$(node -e "require('http').get('http://127.0.0.1:$PIN_PORT/index.html', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))" && echo 200)"
  [ "$got" = 200 ] && say OK "1 pinned $TREE on ephemeral port :$PIN_PORT (pid $PIN_PID)" || say BAD "1 pinned but :$PIN_PORT does not answer"
  kill "$PIN_PID" 2>/dev/null
else
  say BAD "1 could not pin $TREE on an ephemeral port"
fi

# 2: a squatter for another tree on the port
node "$HERE/../serve.mjs" --root "$OTHER" --port "$PORT" --host 127.0.0.1 --quiet > "$SCRATCH/squatter.log" 2>&1 &
SQUAT=$!
trap 'kill "$SQUAT" 2>/dev/null; rm -rf "$SCRATCH"' EXIT
for _ in $(seq 1 60); do grep -q '^  http://127.0.0.1:' "$SCRATCH/squatter.log" && break; sleep 0.5; done
if pin_tree "$TREE" "$SCRATCH/2.log" "$PORT" 2> "$SCRATCH/2.err"; then
  say BAD "2 pinned $TREE on :$PORT although $OTHER's server holds it"
  kill "$PIN_PID" 2>/dev/null
else
  say OK "2 refused: $(tr '\n' ' ' < "$SCRATCH/2.err" | cut -c1-160)"
fi

# 3: control — the readiness loop merge-task.sh used before this fix
ready=no
for _ in 1 2 3; do
  node -e "require('http').get('http://127.0.0.1:$PORT/index.html', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))" 2>/dev/null && { ready=yes; break; }
  sleep 1
done
[ "$ready" = yes ] && say OK "3 control: the old any-200 loop reports ready against the squatter (the defect is visible)" \
  || say BAD "3 control: the old loop did not see the squatter — this probe proves nothing"

printf 'pin-tree-probe: %s\n' "$([ "$bad" = 0 ] && echo 'all as expected' || echo "$bad not as expected")"
exit "$bad"
