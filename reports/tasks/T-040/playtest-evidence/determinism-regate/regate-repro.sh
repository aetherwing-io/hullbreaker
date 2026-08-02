#!/bin/bash
set -e
cd /Users/scottmeyer/projects/hullbreaker/tools/playtest
OUT=/private/tmp/claude-501/-Users-scottmeyer-projects-hullbreaker/c3d9d3c6-20d5-4194-9407-9c10d4ab6a1e/scratchpad/t040-qa/runs
mkdir -p "$OUT"
ROUNDS=16
CSV="$OUT/results.csv"
echo "round,condition,gameMsMax,stopReason,dispatched,events,x_last,minEdgeMargin" > "$CSV"

for r in $(seq 1 $ROUNDS); do
  for cond in base hatch ship; do
    case $cond in
      base) ARGS="--base-url http://127.0.0.1:8782" ;;
      hatch) ARGS="--url http://127.0.0.1:8781/index.html?slice=traversal&rig=canvas" ;;
      ship) ARGS="--base-url http://127.0.0.1:8781" ;;
    esac
    OUTDIR="$OUT/r${r}-${cond}"
    rm -rf "$OUTDIR"
    node run.mjs scripts/mid-route.json --deterministic $ARGS --out "$OUTDIR" > "$OUTDIR.log" 2>&1 || echo "RUN FAILED r=$r cond=$cond" >> "$OUT/failures.log"
    python3 - "$OUTDIR/report.json" "$r" "$cond" "$CSV" << 'PYEOF'
import json, sys
report_path, r, cond, csv_path = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
try:
    d = json.load(open(report_path))
    dd = d.get('meta', {}).get('deterministicDispatch', {})
    gm = dd.get('gameMsMax')
    stopReason = dd.get('stopReason')
    dispatched = dd.get('dispatched')
    events = dd.get('events')
    trace = d.get('trace') or []
    xlast = trace[-1].get('x') if trace else None
    mem = d.get('metrics', {}).get('minEdgeMargin')
    with open(csv_path, 'a') as f:
        f.write(f"{r},{cond},{gm},{stopReason},{dispatched},{events},{xlast},{mem}\n")
except Exception as e:
    with open(csv_path, 'a') as f:
        f.write(f"{r},{cond},ERROR,{e},,,,\n")
PYEOF
    echo "round $r cond $cond done"
  done
done
echo "ALL DONE"
