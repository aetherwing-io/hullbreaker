# T-024 build — no-cache dev server

Worktree: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-024`
Branch: `task/T-024`

## What changed and why

**`tools/serve.mjs` (new, 1 file, zero dependencies).** The repo's dev server.
Every response carries `Cache-Control: no-store, no-cache, must-revalidate,
max-age=0` plus `Pragma`/`Expires`; no `ETag` and no `Last-Modified` are ever
emitted, and the five conditional request headers (`If-Modified-Since`,
`If-None-Match`, `If-Match`, `If-Unmodified-Since`, `If-Range`) are deleted on
arrival. The server therefore never answers 304 — a warm cache has nothing to
revalidate with and nothing to win with. Dual-stack: it binds the IPv6 wildcard
with `IPV6_V6ONLY` off, so `localhost` (which macOS resolves to `::1` first)
and `127.0.0.1` both reach it; hosts without IPv6 fall back to `0.0.0.0`.
Root defaults to the repo the script lives in (resolved from the script path,
not the cwd), port to 8741; `--root`, `--port`/positional, `--host`, `--quiet`,
`--help`, `--selftest`. Also does directory listings, `301` on a directory
without a trailing slash, `HEAD`, and single-range `206` (for scrubbing a
harness `.webm`).

**Node, not python.** Every other gate in this repo is `node tools/…`; node is
already a hard prerequisite (pathcheck, playtest, simlab, assets) while python3
was used for exactly one thing. Node's `http` also lets the tool *omit*
validators rather than merely ignore them, which is the half of the contract
that `SimpleHTTPRequestHandler` cannot express without subclassing internals.
The reference implementation in the task's scratchpad was the starting point;
its hardcoded ROOT/PORT are now flags, and the `send_head` header-mutation
hack is replaced by deleting the headers up front.

**Docs naming the new command:** `CLAUDE.md` § Commands, `README.md` § Play
(plus a new `### tools/serve.mjs` block under § Verification with the
honesty/limitations note), `tools/playtest/README.md` (the `--url` note and the
pinned-worktree recipe), and `.claude/agents/playtester.md` step 1. Historical
records (`docs/playtests/**`, `reports/tasks/**`, `artifacts/**`) were left
alone — they record what was actually run at the time.

**`docs/ORCHESTRATION.md` § Merge playbook:** new entry — blank `#232830` page
+ ONE console SyntaxError naming a missing export = cache artifact, and the
first diagnostic is `fetch(url)` vs `fetch(url, {cache:'reload'})` byte counts
(1275 vs 5727 in the incident), not editing the module. The adjacent "stale
`http.server` processes squat gate ports" entry now greps for `serve.mjs` too,
and the "no build step" bullet at line 27 no longer names python.

**`tools/playtest/lib/server.mjs` (in-scope addition, 2 hunks).** The harness's
built-in static server had the same defect: no `Cache-Control`. It now sends
the same `no-store` set and drops conditional headers. This is insurance, not a
live fix — nothing in the harness uses `launchPersistentContext` (verified by
grep), so every run today gets a fresh cold profile. It is called out here
because it is beyond the literal accept boxes; revert it if the reviewer
disagrees, nothing else depends on it.

**`tools/orch/merge-task.sh` deliberately NOT changed.** It pins the *lane's*
worktree (`cd "$WT" && python3 -m http.server`), and a worktree branched before
T-024 has no `tools/serve.mjs` — switching that line would break every lane
currently in flight. Its Playwright runs get cold profiles anyway. The safe
version, once this is merged and lanes have rebased, is
`node "$MAIN_ROOT/tools/serve.mjs" "$PORT" --root "$WT" --quiet`, which works
for old worktrees because it runs main's copy. Recorded in the playbook entry.

No file under `src/` changed: `git diff --name-only` + untracked, filtered to
`^src/`, is 0.

## Verification (every command, and its result)

Ports 8741/8742 were occupied by the operator (and 8753 by something else)
for the whole session, so **live tests ran on 8767**, with a python control on
8768 (killed after).

| command | result |
|---|---|
| `node --input-type=module --check < tools/serve.mjs` | ESM parse OK (per the playbook: `node --check` alone parses as CommonJS) |
| `node tools/pathcheck.mjs` | **1674 passed, 0 failed** (identical before and after; nothing pure changed) |
| `node tools/serve.mjs --selftest` | **14/14 passed**, exit 0 |
| `node tools/serve.mjs 8767` then `curl -sI http://127.0.0.1:8767/index.html` | `HTTP/1.1 200`, `Cache-Control: no-store, no-cache, must-revalidate, max-age=0`, `Pragma: no-cache`, `Expires: 0`, **no `ETag`, no `Last-Modified`** |
| `curl -sI http://localhost:8767/src/sim/pace.js` | same headers — dual-stack confirmed (IPv6 `localhost` and IPv4 both served) |
| `curl -s -H 'If-Modified-Since: …2099…' -H 'If-None-Match: "x"' …/src/sim/pace.js` | `status=200 bytes=5741` — a warm-cache revalidation gets a full body, never a 304 |
| control: `python3 -m http.server 8768`, `curl -sI …/src/sim/pace.js` | no `Cache-Control` at all, `Last-Modified` present — the exact heuristic-caching setup the incident needed |
| `index.html?selftest=1` in real Chrome against 8767 (Playwright, `channel: 'chrome'`) | **SELFTEST PASS (29 checks)**; the only console error is `GET /favicon.ico 404`, pre-existing and identical under python |
| A/B stale-module reproduction in real Chrome (below) | python: **STALE**, `serve.mjs`: **FRESH** |
| `node run.mjs scripts/mid-route.json --deterministic --max-runtime-ms 15000` (run **from this worktree**, so it exercises the edited `lib/server.mjs`) | `outcome: completed`, `"result": "completed"`, no `bootError`, `errors: []` |
| `node run.mjs scripts/transform-slice.json --deterministic --max-runtime-ms 20000` (same) | `outcome: completed`, `"result": "completed"`, no `bootError`, `errors: []` |

### The A/B that actually falsifies the claim

Headers prove intent; this proves behavior. A two-file ES-module page
(`index.html` importing `./mod.js`) in a scratch dir, `mod.js` backdated 8 days
so Chrome's heuristic freshness window is ~19h — the operator's
afternoon-of-iteration case. Same real Chrome, one persistent profile per pass:
load `?v=1`, rewrite `mod.js` on disk (OLD → NEW, mtime still backdated), load
`?v=2` (a different document URL, so only the *module's* cache entry is in
question), read what the page ran:

```
python3 -m http.server : first=VALUE=OLD secondAfterEdit=VALUE=OLD  -> STALE
node tools/serve.mjs   : first=VALUE=OLD secondAfterEdit=VALUE=NEW  -> FRESH
```

Script: `<scratchpad>/cachelab.mjs` (scratch, not committed — it writes and
backdates files outside the repo).

### Reproducing the harness runs

`tools/playtest/node_modules` is not installed in this worktree. For the two
smoke runs it was temporarily symlinked to the main checkout's copy and removed
afterwards, so the worktree is clean:

```sh
ln -s /Users/scottmeyer/projects/hullbreaker/tools/playtest/node_modules \
      <worktree>/tools/playtest/node_modules   # gitignored; rm when done
```

## Honesty / limitations

Written into `README.md` under `### tools/serve.mjs`, in full: it is a
development server (binds all interfaces by default, lists directories, one
traversal guard, not a reviewed security posture); `no-store` means every load
refetches all ~35 modules (milliseconds locally, not free over a network); it
does **not** affect the cross-origin three.js CDN fetch, so a stale *three.js*
is not a failure mode it prevents; range support is single-range only; the
`/favicon.ico` 404 is pre-existing.

One measurement caveat: the STALE/FRESH A/B above used a backdated mtime to
force a long heuristic window deterministically. That is a faithful model of
the incident (a module untouched for days, cached during an afternoon of
iteration), but it is a *model* — I did not sit through a real multi-hour
freshness window.

No pathcheck assertions were added: nothing pure changed, and per the merge
playbook `tools/pathcheck.mjs` is the worst file in the repo to touch for a
conflict-prone reason. `node tools/serve.mjs --selftest` is the machine gate
for this tool instead, and it is documented in the README next to the command.

## Open questions for the operator

1. **Port 8741 is currently held by a python server you started.** The new
   command will refuse to bind until that process exits (it prints the
   `lsof` line to find it). Kill it before the next session, or say the word
   and a lane can add a `--port-fallback` that walks to the next free port.
2. **Should `tools/orch/merge-task.sh` switch over?** It is safe to do once
   in-flight lanes have rebased past this commit (the reason it was left alone
   is above). Your call on when, since it is the gate's critical path.
3. **Directory listings on by default** — handy for browsing `artifacts/` and
   `reports/` while judging, but it does expose the tree to anything on your
   network. Say if you would rather it 404 directories without an
   `index.html`.

Nothing here is a feel judgment; this task never touches the game.

## Single best next action

Merge it, then kill the python server on 8741 and start `node tools/serve.mjs`
for the next judging session — the checkpoint queue's URLs are all `:8741`, and
this is the one change that makes a blank-page report trustworthy.
