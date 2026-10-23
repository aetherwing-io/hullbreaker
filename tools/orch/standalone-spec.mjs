// standalone-spec.mjs — T-108's hand classification of every test surface that
// is NOT a pathcheck ok() call site: the standalone tools/*-check.mjs files (and
// the check-shaped tools in subdirectories), the in-page ?selftest=1, the
// deploy verifiers, the merge-gate smoke and the playtest capture scripts.
//
// Data only; joined with tools/orch/evidence/standalone-census.json (one timed
// run of each check on this tree) by tools/orch/test-census.mjs.
//
// gated: 'pathcheck' = a tools/pathcheck/*-contract.mjs domain spawns it, so the
//        merge gate runs it; 'merge-smoke' = tools/orch/merge-task.sh runs it;
//        false = nothing automatic runs it (docs mention at most).
// class: the dominant class of what it asserts (same rubric as test-audit-spec.mjs).

export const STANDALONE = [
  { check: 'tools/action-vfx-check.mjs', gated: false, cls: 'PIN', what: 'regex over juice/fx/bullets source (88 regex ops): VFX budgets and family grammar', verdict: 'DELETE' },
  { check: 'tools/action-vfx-v2-check.mjs', gated: false, cls: 'PIN', what: 'asset manifest/provenance/sha256 of the v2 VFX atlas', verdict: 'DELETE' },
  { check: 'tools/action-vfx-v2-runtime-check.mjs', gated: false, cls: 'PIN', what: 'atlas/spec/pool/bridge contract by regex', verdict: 'DELETE' },
  { check: 'tools/actor-motion-check.mjs', gated: 'pathcheck', cls: 'PURE-INVARIANT', what: 'atlas alpha boxes, clips, sockets vs the motion spec (PNG data)', verdict: 'CORE-GATE' },
  { check: 'tools/adaptive-fidelity-check.mjs', gated: 'pathcheck', cls: 'PURE-INVARIANT', what: 'drives the pure adaptive-fidelity controller: sustained misses step down, no oscillation', verdict: 'CORE-GATE' },
  { check: 'tools/boot-registry-check.mjs', gated: 'pathcheck', cls: 'PIN', what: 'exact ordered id lists of the view/reset registries parsed from main.js / boot/*.js', verdict: 'DELETED by T-120 batch 4: replaced by tools/pathcheck/t-120-retry-replays-the-run.mjs (M34, M45 red there; this check was green on M34 and red on M24, a whitespace refactor)' },
  { check: 'tools/capsule-reliquary-check.mjs', gated: 'pathcheck', cls: 'PIN', what: '"fast source contract" — 27 regexes over render/capsules.js', verdict: 'DELETE' },
  { check: 'tools/cindermouth-ground-fire-check.mjs', gated: 'pathcheck', cls: 'CORE', what: 'exact user repro: drives the real bullet loop for the HEAVY Cindermouth ground fire', verdict: 'CORE-GATE' },
  { check: 'tools/defense-vfx-pack-check.mjs', gated: false, cls: 'PIN', what: 'manifest + module text for the defense VFX pack', verdict: 'DELETE' },
  { check: 'tools/depth-composition-check.mjs', gated: false, cls: 'PIN', what: 'exact depth-volume budgets/ids + regex', verdict: 'DELETE' },
  { check: 'tools/destruction-flourish-check.mjs', gated: 'pathcheck', cls: 'PIN', what: 'regex-heavy (44 ops) destruction architecture contract', verdict: 'DELETE' },
  { check: 'tools/enemy-ecology-render-check.mjs', gated: 'pathcheck', cls: 'PIN', what: 'selector coverage + regex over render source; wrapper pins 192/768/2', verdict: 'DELETE' },
  { check: 'tools/enemy-ecology-runtime-check.mjs', gated: false, cls: 'PURE-INVARIANT', what: 'deterministic ecology runtime decisions — RED on this tree (an exact visual-identity table drifted)', verdict: 'TRIAGE (red today, cause unknown: its owner fixes it or deletes it)' },
  { check: 'tools/enemy-motion-check.mjs', gated: false, cls: 'PURE-INVARIANT', what: 'what survives FAR minification of enemy frames (PNG alpha) — RED on this tree ("wasp frame 0: substantial opaque body")', verdict: 'TRIAGE (red today, cause unknown: its owner fixes it or deletes it)' },
  { check: 'tools/finale-pacing-check.mjs', gated: false, cls: 'CORE', what: 'Crown finale: pure pressure decisions + two identical accelerated real-runtime replays — RED on this tree (pins "reviewed neutral forms")', verdict: 'REWRITE (keep the twin-replay determinism, drop the form pin)' },
  { check: 'tools/foreground-kit-check.mjs', gated: false, cls: 'PIN', what: 'cold body / warm route split, silhouettes, culling — mostly regex (44 ops)', verdict: 'DELETE' },
  { check: 'tools/foreground-pack-check.mjs', gated: false, cls: 'SLOW-ENV', what: 'foreground art provenance; shells out to ImageMagick `magick` — RED here (ENOENT: not installed)', verdict: 'DELETE (host-tool dependent)' },
  { check: 'tools/hostile-presenter-check.mjs', gated: 'pathcheck', cls: 'PIN', what: 'presenter priority list by regex over index.js + a small registry behaviour test', verdict: 'DELETE' },
  { check: 'tools/level1-ecology-encounter-check.mjs', gated: false, cls: 'PURE-INVARIANT', what: 'Level 1 ecology spawns resolve to real sockets; primes the live gate seam', verdict: 'DEEP' },
  { check: 'tools/level1-enemy-ecology-check.mjs', gated: false, cls: 'PIN', what: 'atlas manifest/provenance/file census', verdict: 'DELETE' },
  { check: 'tools/meridian-defense-check.mjs', gated: false, cls: 'PURE-INVARIANT', what: 'six-face defense lifecycle (pure) + regex', verdict: 'DEEP' },
  { check: 'tools/player-presentation-check.mjs', gated: false, cls: 'PIN', what: 'RIG aim attachment by regex (`gunGroup.position.set(0, player.muzzleY, 0.25)`) + PNG signatures — the closest thing to a guns-in-hands check, and it pins a source line', verdict: 'REWRITE (measure the painted hand anchor vs the gun socket per frame)' },
  { check: 'tools/pressure-envelope-check.mjs', gated: false, cls: 'PURE-INVARIANT', what: 'six faces replayed for low / average / dominant play — outcome DISTRIBUTION of the pressure director (entry 19)', verdict: 'DEEP' },
  { check: 'tools/projectile-presentation-check.mjs', gated: 'pathcheck', cls: 'PIN', what: 'five projectile families: regex (41 ops) + alpha mip proxy', verdict: 'DELETE' },
  { check: 'tools/projectile-terminal-check.mjs', gated: 'pathcheck', cls: 'CORE', what: 'steps real bullet rows through terrain/hostile/lifetime/bend exits', verdict: 'CORE-GATE' },
  { check: 'tools/rig-slender-check.mjs', gated: false, cls: 'PIN', what: 'slender RIG atlas geometry/palette contract — RED on this tree', verdict: 'TRIAGE (red today, cause unknown: its owner fixes it or deletes it)' },
  { check: 'tools/track-archetypes-check.mjs', gated: false, cls: 'PURE-INVARIANT', what: 'track grammar data seam, with its own mutation fixtures (good practice)', verdict: 'DEEP' },
  { check: 'tools/vertical-assault-check.mjs', gated: false, cls: 'PURE-INVARIANT', what: 'Vertical Assault decision quality / connectivity ("rather than pinning the incidental platform count")', verdict: 'DEEP' },
  { check: 'tools/wasp-modular-v2-check.mjs', gated: false, cls: 'PURE-INVARIANT', what: 'modular wasp atlas manifest + pose selection functions', verdict: 'DEEP' },
  { check: 'tools/world-detail-check.mjs', gated: false, cls: 'PIN', what: 'hull fixture alpha + boot/merge/cull source architecture by regex', verdict: 'DELETE' },
  { check: 'tools/perf/render-budget-check.mjs', gated: false, cls: 'PURE-INVARIANT', what: 'drawing-buffer ceiling and composer MSAA policy (pure)', verdict: 'CORE-GATE (frame budget support)' },
  { check: 'tools/playtest/sprite-fallback-check.mjs', gated: false, cls: 'CORE', what: 'BROWSER: entry 16\'s safe-degradation gate run as a test (assets blocked -> fallbacks draw, no wedge) — RED on this host', verdict: 'PLAY-GATE (after fixing)' },
  { check: 'tools/playtest/preload-concurrency-check.mjs', gated: false, cls: 'CORE', what: 'BROWSER: preload.js really is the shared boot gate (fixture lanes register late/early)', verdict: 'PLAY-GATE' },
  { check: 'tools/vertical-assault/runtime-check.mjs', gated: false, cls: 'PURE-INVARIANT', what: 'pure ladder feel + source ownership of the sim/render seam', verdict: 'DEEP' },
  { check: 'tools/vertical-assault/runtime-sim-check.mjs', gated: false, cls: 'CORE', what: 'drives a generated ladder through the real updatePlayer path with continuous fire (shipped movement verb)', verdict: 'CORE-GATE' },
  { check: 'tools/assets/check.mjs', gated: false, cls: 'RETIRED', what: 'asset gate whose headline "game independence" check enforces the rule entry 16 retired (entry 16: re-aim it) — TIMED OUT at 300 s here', verdict: 'RE-AIM (entry 16) or DELETE the independence half' },
  { check: 'tools/gatecheck.mjs', gated: false, cls: 'PURE-INVARIANT', what: 'negative controls: proves the FAIR-GAP probe and assets/check.mjs can fail. Its two asset controls guard the RETIRED independence gate; its baseline runs the whole pathcheck incl. the browser domain — TIMED OUT at 300 s here', verdict: 'KEEP the FAIR-GAP controls; fold into the mutation harness' },
  { check: 'tools/movement/selftest.mjs', gated: false, cls: 'SLOW-ENV', what: 'BROWSER: runs ?selftest=1 across a URL matrix and reads the page-title verdicts + page errors', verdict: 'PLAY-GATE (desktop + phone rows)' },
  { check: 'tools/deploy/asset-union-selftest.mjs', gated: false, cls: 'PURE-INVARIANT', what: 'falsifier for the old-only asset collision in the deploy union', verdict: 'DEEP (deploy)' },
];

export const OTHER = [
  {
    surface: 'in-page ?selftest=1 (src/main.js:873-1135)', gated: false, cls: 'CORE+SLOW-ENV',
    checks: '48 check() call sites (some in loops): canvas attached, render loop alive, pause/resume, resize, restart, flags plumbed, failsafe panel renders and reads plainly, title consumes no gameplay key, RIG renders at 3-5 % on the title',
    note: 'Real boot/lifecycle behaviour, but only run by hand, by tools/movement/selftest.mjs and by verify-bundle\'s subpath check — never by merge-task.sh. Desktop-shaped: no touch, no phone viewport, keyboard-only key checks.',
    verdict: 'PLAY-GATE (run it at desktop + phone viewports)',
  },
  {
    surface: 'tools/deploy/verify-bundle.mjs', gated: false, cls: 'CORE+SLOW-ENV',
    checks: 'builds the zip, unzips OUTSIDE the repo, serves it, drives real Chrome, asserts every art surface reached "ready" (not its fallback), ?selftest=1 at a subpath',
    note: 'The best-designed falsifying test in the repo (it was written because a file-count check would have passed a bundle with no art). 1280x800 only; collects page errors but not console warnings, so the preload double-fetch warnings are invisible to it.',
    verdict: 'KEEP (release gate); add a phone viewport row + console-warning capture',
  },
  {
    surface: 'tools/deploy/verify-pages-site.mjs', gated: false, cls: 'CORE+SLOW-ENV',
    checks: 'warm-cache release race: an old cached document and a new one each boot only their own module graph',
    note: 'Guards a real incident (a new document loading an older cached HUD module).',
    verdict: 'KEEP (release gate)',
  },
  {
    surface: 'merge-gate smoke: tools/playtest/run.mjs scripts/mid-route.json + scripts/transform-slice.json --deterministic, judged by tools/orch/smoke-verdict.mjs', gated: 'merge-smoke', cls: 'CORE+SLOW-ENV',
    checks: 'boots, plays the full deterministic schedule to its exact terminal tick, no page errors, no stall',
    note: 'The only browser evidence in the merge gate. Desktop viewport (or HB_SMOKE_VIEWPORT=480x300 on a GPU-less host), keyboard input only; best-of-three because I-040 records the deterministic mode as noisy; served by python3 -m http.server even though CLAUDE.md says to use tools/serve.mjs (T-024 cache trap).',
    verdict: 'KEEP as the PLAY gate core; add a phone/touch row',
  },
  {
    surface: 'tools/playtest/*.mjs capture scripts (58 files: harness run.mjs/analyze-run.mjs/verify-served.mjs + 3 browser checks + 52 capture/stress/probe tools)', gated: false, cls: 'SLOW-ENV',
    checks: 'screenshots, contact sheets and metrics for operator judgement; 31 have a non-zero exit path (usage error, failed capture or a local threshold); one (hud-instrument-smoke.mjs) asserts HUD panel containment/overlap at 390x844 and 844x390 with hasTouch',
    note: 'Evidence instruments, not gates — correctly so (machine gates never judge fun). hud-instrument-smoke is the only phone-viewport assertion in the repo and it checks HUD-vs-HUD overlap and safe areas, not how much of the play field the HUD covers.',
    verdict: 'KEEP as evidence tools; promote hud-instrument-smoke (with a play-field-coverage bound) into the PLAY gate',
  },
  {
    surface: 'tools/playtest/scripts/*.json (42 bot scripts + 18 under adversarial/; its 19th entry is repeat.mjs)', gated: 'merge-smoke (2 of 60)', cls: 'SLOW-ENV',
    checks: 'scripted/policy bot runs; reports carry outcome, deaths, routes, stalls',
    note: 'Only mid-route and transform-slice gate a merge. dare-pocket.json and the hook/pace scripts exercise retired or flag-only designs.',
    verdict: 'KEEP the six-face/policy scripts for the deep suite; retire dare-pocket/hook ones with their designs',
  },
];

// Per-file class for the 58 tools/playtest/*.mjs (test-census.mjs enumerates
// the directory; anything not listed here is a capture/evidence tool,
// SLOW-ENV, judged by a human, correctly not a gate).
export const PLAYTEST_FILES = {
  'run.mjs': { cls: 'harness', what: 'bot playtest runner (the merge smoke runs it)' },
  'analyze-run.mjs': { cls: 'harness', what: 'report analysis' },
  'verify-served.mjs': { cls: 'harness', what: 'served-bytes vs tree honesty check for captures' },
  'perf-probe.mjs': { cls: 'SLOW-ENV', what: 'real-browser perf probe; pathcheck\'s render-submission-contract spawns it' },
  'hud-instrument-smoke.mjs': { cls: 'CORE+SLOW-ENV', what: 'the only phone-viewport assertion in the repo: HUD containment/overlap/safe areas at 844x390 and 390x844 with hasTouch — not play-field coverage; ungated' },
  'sprite-fallback-check.mjs': { cls: 'CORE+SLOW-ENV', what: 'see STANDALONE' },
  'preload-concurrency-check.mjs': { cls: 'CORE+SLOW-ENV', what: 'see STANDALONE' },
  'render-equivalence.mjs': { cls: 'SLOW-ENV', what: 'render-mode equivalence capture with a pass/fail exit' },
  'asset-boot-probe.mjs': { cls: 'SLOW-ENV', what: 'asset boot timing probe' },
};
