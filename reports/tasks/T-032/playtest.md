PASS

Pinned worktree: `/Users/scottmeyer/projects/hullbreaker/.claude/worktrees/T-032`, branch
`task/T-032`, HEAD `3290d2f`. Served with `node tools/serve.mjs <port> --root <path> --quiet`
throughout (never python's http.server, per T-024). Ports used: 8761–8765 (scratch trees),
8771/8772 (durability harness, explicit `--port`/`--broken-port`). 8741/8742 were never bound,
probed, or killed — confirmed by `lsof` before and after. All my servers killed at the end;
verified with `lsof -iTCP -sTCP:LISTEN` (clean) and `ps aux | grep serve.mjs` (clean).

## 1. THE CENTRAL TEST — five failure classes, in a real browser, done myself

Independent of `tools/durability/abuse.mjs`'s own `broken-import` scenario and independent of
the reviewer's single reproduction: I made my own scratch copies of the worktree (NOT the
worktree itself — `git status --short` confirms the worktree stayed clean throughout, see
§6) and drove each with a fresh headless Chrome via `playwright-core` (same channel
`tools/durability` and `tools/playtest` already use). Script:
`/private/tmp/claude-501/.../scratchpad/qa-t032-drive.mjs`. Screenshots:
`/private/tmp/claude-501/.../scratchpad/qa-t032-shots/{b-404,b-throw,b-syntax,cdn-blocked}.png`.

| failure class | how I made it | result |
| --- | --- | --- |
| module 404 | `src/main.js` imports a file that doesn't exist on disk | boot panel, "The game could not start.", detail: `could not load http://…/src/main.js` |
| module parses, throws at import time | prepended `throw new Error(...)` to `src/ui/hud.js`'s top level | boot panel, detail names the real error, file and line (`src/ui/hud.js:1:7`) |
| syntax error in a module (the real incident's shape) | appended `this is not valid javascript;` to `src/pure/path.js`, same technique the incident and the harness both use | boot panel, detail: `Uncaught SyntaxError: Unexpected identifier 'is' (…/src/pure/path.js:106:6)` |
| three.js CDN unreachable | `context.route('**cdn.jsdelivr.net/**', route => route.abort('failed'))` against the healthy worktree | boot panel, well under the 10s "still loading" watchdog (network fails fast in this repro); detail: `could not load .../src/main.js` — the whole module graph never resolves because the import map entry it depends on never arrived |
| exception thrown mid-run, after boot succeeded | two DISTINCT injections, neither borrowed from the harness: (a) a one-off `setTimeout(() => throw …, 0)` — a genuine blip; (b) a throwing `get` on `window.HB.player.hp` (not `.x`, which is what the harness's own `frame-crash` scenario uses) | (a) no panel, run continues, `faults` counter incremented once — correct, a single blip must not cost the run; (b) panel up, "The game stopped.", `halted: true`, `recoveries: 1` — the restart itself failed because `resetGame()` also writes `hp`, which had no setter, so it immediately gave up rather than looping; this generalizes the mechanism beyond the one accessor the harness/reviewer already tried |

All five: legible panel or correct no-panel behavior, zero uncaught exceptions leaking past the
handler in a way that produced a blank/black page. **The 2026-08-02 incident's exact shape
(syntax error in a leaf module) is caught.**

**Honesty boundary check (against `reports/tasks/T-032/build.md`'s "does/does not catch"
list):** matches what I observed in every case above, plus: I did not reproduce "the page
never arriving at all" (needs a real network-down condition, not testable from a served
tree) or "a game that keeps running while quietly doing the wrong thing" (by construction,
nothing throws — this is explicitly called out as a playtest question in build.md, not a
durability one, and I agree with that framing). No overclaim found. The boundary as stated is
accurate.

## 2. Panel readability, judged as a 9-year-old would (not an aesthetic verdict)

Screenshots above and `artifacts/t032-durability/{boot-failure,mid-run-failure}.png` (regenerated
by my own harness run, §4). Every panel: one big plain-language title, one short sentence that
names no cause and assigns no blame ("It is not your fault"), one large green button with an
obvious verb ("Try again" / "Play again"), and the only technical text (file/line/stack) sits
behind a closed `<details>` fold — I forced it open programmatically to verify content; by
default it stays closed and none of that text is visible to a player. I did not find engineer
jargon in the visible (non-folded) text in any of the five captures. This is a readability
finding, not a fun/aesthetic one; the words themselves ("Is that the right voice for Fox?") are
already correctly routed to the operator checkpoint queue in `build.md`'s own open questions —
I did not re-decide that.

## 3. The dt clamp

- **Static check:** the clamp expression `Math.min(50, t - last) / 1000` is byte-identical to
  what was on `main` before this branch — confirmed by re-diffing `git show 03f5a08:src/main.js`
  against this worktree's `src/main.js` myself; the diff hunk shows it as unchanged context, not
  an added line. A clamp whose text never changed cannot have changed ordinary-frame behavior.
- **pathcheck binds this statically:** `tools/pathcheck.mjs` (~line 9134) regexes the literal out
  of `main.js` and asserts it equals `FAILSAFE.frameDtMaxMs` (50); I read this code myself rather
  than trusting the description. I did NOT re-run the reviewer's mutation test (dt clamp 50→120)
  myself — that requires editing `src/main.js`, which is outside my lane (QA never edits `src/`,
  even with restore intent), and the harness's permission classifier correctly blocked my attempt
  to do so (see §6). The reviewer's report documents this mutation failing 8 assertions
  (`review.md`), and by reading the regex I can confirm the assertion is not decorative — a
  changed clamp literal cannot satisfy `Number(clamp[1]) === FAILSAFE.frameDtMaxMs` — so I trust
  that result without re-deriving it.
- **Background test, run myself** (`node tools/durability/abuse.mjs --port 8771 --broken-port
  8772`, full 12-scenario run, all against the pinned worktree): `background` scenario — 60.0s
  hidden, 2 frames painted, simulation advanced 57.9ms (well inside one clamped 50ms step), RIG
  moved 0.189 tiles, held key released on return, no panel while hidden or after, state stayed
  `PLAYING`. No catch-up explosion, no teleport, no physics corruption. Numbers are close to but
  not identical to build.md's own run (59.3ms) — expected run-to-run timing noise, both comfortably
  under one clamped step.
- The harness's own honesty note (which I verified is accurate, not just quoted): headless
  Chrome does not actually suspend rAF for a backgrounded tab, so the scenario reproduces the
  sequence in-page (`visibilitychange` fires, rAF stops being serviced, the resuming frame carries
  a minute of wall clock). A real laptop alt-tab is still unverified by any automated test,
  including mine — flagging this as inherited, unresolved residual risk, not a new finding.

## 4. Lifecycle abuse (corrected 9-year-old player model: systematic prober, not masher)

Scripts: `/private/tmp/claude-501/.../scratchpad/qa-t032-lifecycle.mjs`,
`qa-t032-resize-ritual.mjs`, `qa-t032-midrun.mjs`. All against the pinned worktree on 8765.

- **Pause exactly during a transition:** the wave-gated **corner turn** (`src/sim/wavegate.js`'s
  `turning` state) could not be reached by me either — confirmed independently, not inherited:
  no bot policy in this repo (including the project's best existing reflex policies,
  `tools/playtest/scripts/six-face-full-run.json` and `policy-hound-reactive.json`) has ever
  cleared a wave gate; `six-face-full-run.json`'s own committed description says so across six
  measured runs on both trees. This is a pre-existing, cross-project gap (I-020/T-009/T-018),
  not something T-032 introduced or could have fixed, and the builder's disclosure of it in
  `build.md` is accurate, not an overclaim. What IS reachable and reversible without a combat
  policy — the **transform ritual** (`bulkhead-flip`/`breach-return`, a different static-anatomy
  reveal transition, reached via `?slice=transform`) — I drove to the `turning` state myself and
  resized the viewport twice DURING it (900×500, then 1920×1080) mid-ritual: no throw, no panel,
  no fault, game continued (later reached a fresh attempt via the fixture's own auto-retry,
  unrelated to the resize). The title-handoff pause, the fixture-retry pause, and the gate-phase
  pause (scroll halted, wave live) — all three transitions any policy CAN reach — were already
  re-verified by my own full harness run in §5 with identical results to build.md's table.
- **Restart at the instant of death:** forced two distinct real deaths (not synthetic hp writes,
  which don't fire the death check — `damagePlayer`'s edge-triggered path only fires through
  `loseLife`, so I used the level-triggered `player.y < CONFIG.edges.killY` fall-death check
  instead) and mashed `KeyR` across the transition frame, 8 cycles on the fixture-retry path and
  5 on the real `GAME_OVER` path. Every cycle: clean landing back in `PLAYING` at a fresh spawn,
  zero faults, zero console/page errors.
- **Resize mid-flip:** see transform-ritual result above (2 resizes mid-ritual, clean). Also
  re-confirmed the harness's 40-size ordinary-play resize sweep myself in §5 (clean).
- **Alt-tab repeatedly:** 5 rapid hide/show cycles back-to-back (not just one, per the corrected
  player model) — ended `PLAYING`, 0 faults, not halted, no errors.
- **Two tabs at once:** two independent pages of the SAME worktree, one holding right, one
  holding left, 2.5s concurrent — both stayed `PLAYING`, 0 faults each, no console/page errors in
  either tab. No shared-state interference observed (expected: T-033's persistence hasn't landed
  yet, so there is nothing to share).

## 5. `tools/durability/abuse.mjs` — what it actually measures, run by me

`node tools/durability/abuse.mjs --port 8771 --broken-port 8772 --json qa-t032-abuse.json`
against the pinned worktree (own ports, not 8747/8748, to avoid colliding with any concurrent
run): **12 passed, 0 failed, 0 skipped** — identical verdicts to `build.md`'s and `review.md`'s
tables, numbers within expected run-to-run noise (my background: 57.9ms vs their 58.2/59.3ms,
all sub-50ms-step). **Would it catch the original incident?** Yes — its own `broken-import`
scenario reproduces the exact incident shape (a module that will not parse) and asserts the panel
appears; I additionally reproduced the same incident myself from scratch (§1) with a different
scratch copy and got the same result. What it cannot catch, honestly and correctly stated in its
own README: a game that runs but is quietly wrong (nothing throws), and the true browser-level
background-tab behavior (headless Chrome doesn't actually suspend rAF; both the harness and I
independently reproduce the *sequence* Chrome performs, not the browser doing it for real).

## 6. One incident, reported straight: a blocked action, correctly blocked

While trying to independently re-run the reviewer's dt-clamp mutation test, I attempted a shell
command that edited `src/main.js` (intending to restore it immediately after). The permission
classifier denied it — correctly: QA does not edit `src/`, even with restore intent; that's the
reviewer's job, and they already did it and documented the result. No `src/` mutation landed
(`git diff --stat` showed nothing under `src/`). One unrelated file WAS modified as a side effect
of running the durability harness earlier in this session: `artifacts/t032-durability/boot-
failure-detail.png` (a screenshot the harness regenerates on every run) — restored with
`git checkout -- artifacts/t032-durability/boot-failure-detail.png`. Worktree confirmed clean
after: `git status --short` shows only the pre-existing untracked `reports/tasks/T-032/review.md`.

## 7. Regression

- **pathcheck, computed myself, not trusted from the brief:** worktree HEAD (`3290d2f`) →
  **1775 passed, 0 failed**. Base (`git merge-base main HEAD` = `03f5a08`, already pinned at
  `/private/tmp/hb-adv-03f5a08` by another agent — verified the commit hash matches before
  trusting it) → **1704 passed, 0 failed**. Delta **+71**, matching both `build.md` and
  `review.md` exactly.
- **`?selftest=1`, all four documented URL variants, run myself in real Chrome:** bare (35),
  `shell=title` (35), `slice=traversal` (37), `g2=1` (36) — all **SELFTEST PASS** with the exact
  counts claimed.
- **Smoke scripts against the pinned worktree** (`--base-url http://127.0.0.1:8765
  --deterministic`): `mid-route.json` → completed, 0 falls, `bootError: null`, empty
  `consoleErrors`/`pageErrors` in `report.json`. `transform-slice.json` → completed, 0 falls,
  same clean `report.json`.

## Verdict

**PASS.** The central claim — a 9-year-old never meets a blank screen — holds against five
distinct failure classes I induced myself in a real browser, including the exact shape of the
motivating incident, using injection mechanisms I chose independently of the harness and the
reviewer (a different broken module, a different accessor, a route-level CDN block). The
honesty boundary in `build.md` matches what I observed; nothing there overclaims. The dt clamp
is verifiably unchanged text and asserted against its own policy constant. Lifecycle abuse
(instant-of-death restart, mid-transition resize, repeated alt-tab, two tabs) is clean. The one
acceptance box marked partial (pausing inside the wave-gated corner turn specifically) is a
pre-existing, cross-project gap this task did not create and could not reasonably have been
asked to solve — the builder disclosed it accurately rather than hiding it, and I independently
confirmed the same gap rather than just trusting the disclosure.

## PROPOSED INBOX ISSUES

None. No defects found that were not already disclosed by the builder or reviewer. The known,
pre-existing "no bot policy clears a wave gate" gap (I-020/T-009/T-018) is unaffected by this
task and already tracked; filing it again here would be noise.
