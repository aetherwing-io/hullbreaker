#!/bin/zsh
set -e
ROUNDS=${1:-12}
OUT=/private/tmp/claude-501/-Users-scottmeyer-projects-hullbreaker/c3d9d3c6-20d5-4194-9407-9c10d4ab6a1e/scratchpad/t049-latency
mkdir -p $OUT; CSV=$OUT/results.csv
echo "round,condition,gameMsMax,stopReason,dispatched,events,crush" > $CSV
cd /Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-049/tools/playtest
for r in $(seq 1 $ROUNDS); do
  for cond url in main "http://127.0.0.1:8793/index.html?slice=traversal&testapi=1" delay25 "http://127.0.0.1:8795/index.html?slice=traversal&testapi=1" loadnodraw "http://127.0.0.1:8794/index.html?slice=traversal&testapi=1"; do
    D=$OUT/r$r-$cond; rm -rf $D
    node run.mjs scripts/mid-route.json --deterministic --url "$url" --out $D > /dev/null 2>&1 || true
    python3 - <<PY
import json
try:
    d = json.load(open('$D/report.json')); dd = d['meta']['deterministicDispatch']; m = d['metrics']
    row = '%s,%s,%.1f,%s,%s,%s,%.3f' % ($r,'$cond',dd['gameMsMax'],d['meta']['stopReason'],dd['dispatched'],dd['events'],m['closestCrushApproachTiles'])
except Exception as e:
    row = '%s,%s,ERROR,%s,,,' % ($r,'$cond',e)
open('$CSV','a').write(row+'\n')
PY
  done
  echo "round $r done"
done
echo ALL DONE
