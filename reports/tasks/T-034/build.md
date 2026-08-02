# T-034 — build report

Static-host bundle for itch.io. Worktree
`/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-034`, branch
`task/T-034`. **Zero `src/` changes** — `git status --porcelain` shows only
one new, untracked directory: `tools/deploy/`.

## What changed and why

Nothing in the shipped game changed, because nothing needed to. This task's
job was to verify a claim (subpath hosting, CDN behavior) and hand the
operator a repeatable build + a set of instructions, not to fix a defect.

Added:

- `tools/deploy/build-bundle.mjs` — `git archive --format=zip` restricted to
  `index.html` + `src/` (the only two things a browser fetches from this
  host), so the operator gets a one-command, always-in-sync-with-a-real-commit
  zip instead of hand-picking files. Zero new dependencies (git is already
  required). Validates the ref actually contains `index.html` and `src/`
  before archiving, so a typo'd `--ref` fails loudly instead of shipping an
  empty zip.
- `tools/deploy/README.md` — the deploy story: how to build the bundle, what
  was verified about subpath hosting, the CDN risk stated plainly, and the
  itch.io upload walkthrough for a first-time user. Full text there; summary
  below.

## What was verified, and how

### 1. Subpath hosting: works today, unmodified

Code inspection first: `index.html` loads `src/main.js` via a relative
`<script type="module" src="src/main.js">`; every import inside `src/` is
either a relative specifier or the bare `three`/`three/addons/` specifiers
resolved by the import map. `grep` across `src/` and `index.html` found no
absolute-root path (`/src/...`), no `fetch()`/`import()`/`new URL()`/`Worker`
calls that could carry a hidden absolute assumption, and the one runtime use
of `location` — `src/ui/shell.js`'s "copy a link with this flag" helper —
reads `location.pathname` rather than hard-coding a path, so it's subpath-safe
by construction.

Then proved empirically rather than trusting the read: built the zip with
`tools/deploy/build-bundle.mjs`, unzipped it fresh under a **synthetic
itch.io-shaped path** three directories deep
(`/html/999999/hullbreaker-alpha/index.html`, matching itch.io's real
`https://html.itch.zone/html/<upload-id>/<slug>/` scheme, not just a shallow
one-level test), served it with `tools/serve.mjs` on a scratch port (8744 —
**8741/8742 were never touched**), and drove it with a real headless Chrome
via `playwright-core` (borrowed read-only from the main checkout's
`tools/playtest/node_modules` via a symlink inside my own scratch directory —
`tools/playtest/**` itself was never written to, per the lane fence).

Result:

```
http://127.0.0.1:8744/html/999999/hullbreaker-alpha/index.html?selftest=1
→ page title: "SELFTEST PASS (29 checks)"
```

Full request list captured and inspected by hand: every request resolved
under that same three-level prefix except one, to
`https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js` (expected —
see the CDN section). Zero absolute-root or wrong-prefix requests, zero
failed requests besides the one 404 below.

**Because it already works, the correct outcome is to change nothing** —
no edit to `index.html`/`src/main.js`/`src/ui/**` was needed or made. (Those
paths are fenced to T-032 in any case; there is nothing to hand the
integrator to sequence after that merge.)

**One pre-existing, unrelated 404, reported for completeness.** Chrome
auto-probes `/favicon.ico` at the domain root for every tab; this game ships
no `favicon.ico` and `index.html` has no `<link rel="icon">`, so that request
404s — both at the test subpath AND at domain root. Confirmed this is not a
subpath artifact by reproducing it against the operator's own live dev server
(`curl -o /dev/null -w '%{http_code}' http://127.0.0.1:8741/favicon.ico` →
`404`, read-only GET, nothing else touched on that port). Zero effect on
play, invisible to a player (browser-chrome-only, and itch.io additionally
iframes the game so only itch.io's own top-level page's favicon is ever
requested by the visible tab). Not fixed here since `index.html` is fenced
to T-032; noted in `tools/deploy/README.md` as a someday nice-to-have, not a
blocker.

### 2. The CDN question — answered with real network manipulation, not a guess

three.js loads from `cdn.jsdelivr.net` via the import map. Did **not** vendor
it — that would need a recorded operator decision against the no-runtime-deps
/ no-build-step hard rules, and the task explicitly said not to. Instead,
used Playwright's request interception against the real, unmodified
`index.html` to answer "what does the CDN-blocked/slow case actually look
like":

| scenario | mechanism | result |
|---|---|---|
| CDN fully blocked | `route.abort('connectionfailed')` on every `cdn.jsdelivr.net` request | Page never renders anything: no canvas, no HUD, no visible error — just the plain `#232830` dark background from the page's own CSS, forever. `<title>` stays the static `"HULLBREAKER — grey-box"`. Only evidence is a browser-console `net::ERR_CONNECTION_FAILED` a player would never see. |
| CDN slow (4s artificial delay) | `route.continue()` after an `await sleep(4000)` | Polled the DOM every 500ms *during* the delay: identical blank dark screen, no spinner, no "Loading…" text, for the entire 4s, then the whole game appears at once the instant the module resolves. This matches `tools/serve.mjs`'s own header comment that ES module graphs are all-or-nothing — nothing downstream of the `three` import can execute until it resolves. |

Both runs used the real shipped `index.html`/`src/` (no edits, no fixture),
network-intercepted rather than DNS- or file-edited, so this is the actual
failure mode a player would hit if jsdelivr were unreachable — not a
simulation of a simulation.

**Stated plainly for the operator (also in `tools/deploy/README.md` § 3):**
today, if the CDN is unreachable, the game shows a blank dark screen with
zero explanation, indistinguishable from "broken" to a 9-year-old. This is a
real, generally low-probability risk (jsdelivr is a large CDN; most home
networks don't block it) — flagged as an open decision (accept, or vendor
three.js as a static file), not resolved unilaterally.

### 3. Upload instructions

`tools/deploy/README.md` § 4–5 — a step-by-step written for someone who has
never used itch.io: setting "Kind of project" to HTML (the field that makes
"played in browser" even appear), the viewport-size and fullscreen-button
embed options, visibility settings for a private test link, and a
post-upload checklist (boots at all, keyboard focus inside the iframe, CDN
reachability from inside itch.io's own sandbox — the one thing that
genuinely cannot be verified without the operator's own live upload). No
account was created, no credentials entered, nothing was uploaded to
itch.io — that line was not crossed.

## Verification

All commands run from this worktree; ports **8741/8742 were never bound** —
scratch servers used 8743 and 8744, both stopped after use.

| command | result |
|---|---|
| `node tools/pathcheck.mjs` | **1724 passed, 0 failed** (exit 0) — this worktree's base includes merges landed after the task was handed out, so the count is higher than the 1704 quoted in the task; 0 failed is what was gated |
| `node tools/deploy/build-bundle.mjs` | writes `hullbreaker-web.zip`, 63 tracked files, `index.html` at zip root |
| `node tools/deploy/build-bundle.mjs --help` | prints usage, exits 0 |
| `node tools/deploy/build-bundle.mjs --ref not-a-real-ref` | fails loudly, exit 1, writes nothing |
| `diff` of file list: manual `git archive --format=zip` vs. the script's output | identical |
| unzip the built zip fresh under `/html/999999/hullbreaker-alpha/`, serve via `tools/serve.mjs 8744 --root <scratch>`, `?selftest=1` in headless Chrome | `SELFTEST PASS (29 checks)`, no absolute-path requests, one expected CDN request, one pre-existing unrelated favicon 404 |
| same subpath, CDN requests hard-aborted | blank `#232830` screen, no canvas/HUD/error text, one console `net::ERR_CONNECTION_FAILED` |
| same subpath, CDN requests delayed 4s | identical blank screen polled every 500ms through the whole delay, then the game appears once the import resolves |
| `curl http://127.0.0.1:8741/favicon.ico` (read-only, operator's own port, untouched otherwise) | `404` — confirms the favicon 404 is pre-existing and subpath-independent |
| `git status --porcelain` (this worktree) | `?? tools/deploy/` only |

## Open items

None outstanding for this task's own scope. Two items handed to others by
design, not left half-done:

1. The favicon 404 (cosmetic, zero play effect) — noted for whoever next
   touches `index.html` (currently T-032's lane); not a blocker for T-034.
2. Whether to accept the CDN risk or vendor three.js — an operator decision,
   not mine to make; framed with the actual measured failure mode above so
   it can be made on real information.

## Open feel questions for the operator

I judge none of this — these are the operator's calls, not a machine gate's:

1. Is the measured CDN-outage behavior (blank screen, zero feedback)
   acceptable for a 9-year-old to hit occasionally, or is that worth a
   vendoring decision now rather than after the first confusing "it's
   broken" report?
2. `1280×720` was picked as the itch.io embed's starting viewport size in the
   instructions — happy with that, or is there a preferred window size for
   his laptop?
3. Visibility: the instructions suggest itch.io's "Restricted"/"Draft" mode
   for a private test link before deciding whether the page goes public —
   confirm that's the intended rollout, not a public listing from the start.

## Worktree / branch

- Worktree: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-034`
- Branch: `task/T-034` (not merged; `main` untouched)
- Files added: `tools/deploy/build-bundle.mjs`, `tools/deploy/README.md`,
  `reports/tasks/T-034/build.md` (this report). No other files touched;
  `src/`, `index.html`, `tools/pathcheck.mjs`, `tools/playtest/**`,
  `SPRINT.md`, `CLAUDE.md` all unmodified.

## Single best next action

Operator decides the two open questions above (CDN risk acceptance vs.
vendoring; embed viewport size), then performs the manual itch.io upload in
`tools/deploy/README.md` § 4 themself using `hullbreaker-web.zip` built by
`node tools/deploy/build-bundle.mjs`. Once the game boots on a live itch.io
page, run the § 5 post-upload checklist (especially the one thing that can't
be verified from here: whether itch.io's own iframe sandbox actually reaches
the CDN in practice).
