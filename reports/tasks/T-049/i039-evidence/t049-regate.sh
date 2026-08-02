#!/bin/zsh
# T-049 / I-039: the GPU warm-up, measured with T-040's 16-round interleaved
# design (reports/tasks/T-040/playtest-evidence/determinism-regate/).
#
# FOUR conditions per round, so the warm-up is isolated rather than inferred:
#   main    current main (2c638aa) — no sprite path at all: the control
#   off     this branch, ?sprites=0 — the escape hatch
#   nowarm  this branch, sprites on, ?warm=0 — the state before this fix
#   warm    this branch, shipped default — sprites on, warm-up on
#
# One run of each per round means session load hits all four equally.
set -e
ROUNDS=${1:-16}
W=/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-049
OUT=/private/tmp/claude-501/-Users-scottmeyer-projects-hullbreaker/c3d9d3c6-20d5-4194-9407-9c10d4ab6a1e/scratchpad/t049-regate
mkdir -p $OUT
CSV=$OUT/results.csv
echo "round,condition,gameMsMax,stopReason,dispatched,events,crush" > $CSV
cd $W/tools/playtest
MAIN="http://127.0.0.1:8793/index.html?slice=traversal&testapi=1"
BR="http://127.0.0.1:8794/index.html?slice=traversal&testapi=1"
for r in $(seq 1 $ROUNDS); do
  for cond url in main "$MAIN" off "$BR&sprites=0" nowarm "$BR&warm=0" warm "$BR"; do
    D=$OUT/r$r-$cond
    rm -rf $D
    node run.mjs scripts/mid-route.json --deterministic --url "$url" --out $D > /dev/null 2>&1 || true
    python3 - <<PY
import json
try:
    d = json.load(open('$D/report.json'))
    dd = d['meta']['deterministicDispatch']; m = d['metrics']
    row = '%s,%s,%.1f,%s,%s,%s,%.3f' % ($r, '$cond', dd['gameMsMax'],
        d['meta']['stopReason'], dd['dispatched'], dd['events'],
        m['closestCrushApproachTiles'])
except Exception as e:
    row = '%s,%s,ERROR,%s,,,' % ($r, '$cond', e)
open('$CSV','a').write(row + '\n')
print('  ' + row)
PY
  done
  echo "round $r done"
done
echo ALL DONE
