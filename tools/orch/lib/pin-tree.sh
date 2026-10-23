# pin-tree.sh — serve a tree for a gate, and PROVE the server that answers is
# ours and serves that tree (T-120 fix round 1: playtest I-B, review finding 8).
#
# The old merge-gate pin drew a random port in 8760-8959 and waited for ANY
# HTTP 200: when another lane's server already held the port, our serve.mjs
# exited 1 ("already in use") and the gate went on to judge the other lane's
# tree (reproduced live against T-121's server on :8791).
#
#   . tools/orch/lib/pin-tree.sh
#   pin_tree <tree> <logfile> [port]     # port defaults to 0 = an ephemeral port
#   -> sets PIN_PORT and PIN_PID, returns 0; or prints why and returns 1
#
# It binds port 0 by default (the kernel picks a free port, so no squatter can
# hold it), reads the bound port back from serve.mjs's own banner, requires the
# banner's root to be <tree>, our process to be alive (kill -0) and the bytes of
# /index.html to equal <tree>/index.html. The server is a child of the caller's
# shell (--quiet: it exits if its launcher dies); the caller kills PIN_PID.
# SERVE_MJS overrides which serve.mjs runs (default: this checkout's).

pin_tree() {
  local tree log port serve bound root i
  tree="$(cd "$1" 2>/dev/null && pwd -P)" || { printf 'pin-tree: no such tree: %s\n' "$1" >&2; return 1; }
  log="$2"; port="${3:-0}"
  serve="${SERVE_MJS:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)/serve.mjs}"
  PIN_PORT=''; PIN_PID=''
  node "$serve" --root "$tree" --port "$port" --host 127.0.0.1 --quiet > "$log" 2>&1 &
  PIN_PID=$!
  bound=''
  for i in $(seq 1 120); do
    if ! kill -0 "$PIN_PID" 2>/dev/null; then
      printf 'pin-tree: the server for %s exited before it was ready: %s\n' "$tree" "$(tr '\n' ' ' < "$log")" >&2
      PIN_PID=''; return 1
    fi
    bound="$(sed -n 's#^  http://127\.0\.0\.1:\([0-9][0-9]*\)/index\.html$#\1#p' "$log" | head -1)"
    [ -n "$bound" ] && break
    sleep 0.5
  done
  if [ -z "$bound" ]; then
    printf 'pin-tree: no listening banner from the server in 60 s (%s)\n' "$log" >&2
    kill "$PIN_PID" 2>/dev/null; PIN_PID=''; return 1
  fi
  root="$(sed -n 's#^serving \(.*\)$#\1#p' "$log" | head -1)"
  root="$(cd "$root" 2>/dev/null && pwd -P)"
  if [ "$root" != "$tree" ]; then
    printf "pin-tree: the server on :%s serves '%s', not '%s'\n" "$bound" "$root" "$tree" >&2
    kill "$PIN_PID" 2>/dev/null; PIN_PID=''; return 1
  fi
  if ! node -e "
    const [url, file] = process.argv.slice(1);
    const want = require('fs').readFileSync(file);
    require('http').get(url, (r) => { const b = []; r.on('data', (c) => b.push(c));
      r.on('end', () => process.exit(r.statusCode === 200 && Buffer.concat(b).equals(want) ? 0 : 1)); })
      .on('error', () => process.exit(1));" "http://127.0.0.1:$bound/index.html" "$tree/index.html"; then
    printf 'pin-tree: http://127.0.0.1:%s/index.html is not the bytes of %s/index.html\n' "$bound" "$tree" >&2
    kill "$PIN_PID" 2>/dev/null; PIN_PID=''; return 1
  fi
  if ! kill -0 "$PIN_PID" 2>/dev/null; then
    printf 'pin-tree: the server for %s died while it was checked\n' "$tree" >&2; PIN_PID=''; return 1
  fi
  PIN_PORT="$bound"
  return 0
}
