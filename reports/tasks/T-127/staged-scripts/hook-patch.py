#!/usr/bin/env python3
"""T-121: delete the hook v1 prototype (decisions.md entry 25).

Exact-match edits: every replacement asserts how many times its old text
occurs, so a file that drifted (an in-flight lane merged) fails loudly instead
of being half-patched. usage: hook-patch.py <repo root>"""
import os, sys

ROOT = sys.argv[1]
log = []

def edit(path, pairs):
    p = os.path.join(ROOT, path)
    s = open(p, encoding='utf8').read()
    for pair in pairs:
        old, new = pair[0], pair[1]
        want = pair[2] if len(pair) > 2 else 1
        n = s.count(old)
        if n != want:
            raise SystemExit(f'{path}: expected {want} match(es), found {n}:\n---\n{old}\n---')
        s = s.replace(old, new)
    open(p, 'w', encoding='utf8').write(s)
    log.append('edited  ' + path)

def cut(path, start_marker, end_marker):
    """remove [start_marker, end_marker) — both must occur exactly once"""
    p = os.path.join(ROOT, path)
    s = open(p, encoding='utf8').read()
    for m in (start_marker, end_marker):
        if s.count(m) != 1:
            raise SystemExit(f'{path}: marker not unique: {m!r}')
    a, b = s.index(start_marker), s.index(end_marker)
    if b <= a:
        raise SystemExit(f'{path}: end marker before start marker')
    s = s[:a] + s[b:]
    open(p, 'w', encoding='utf8').write(s)
    log.append('cut     ' + path)

def delete(path):
    os.remove(os.path.join(ROOT, path))
    log.append('deleted ' + path)

# ---- whole modules ---------------------------------------------------------
delete('src/sim/hook.js')
delete('src/pure/hook.js')
delete('src/render/hook.js')
delete('tools/pathcheck/snap-hook-driven-through-real-sim.mjs')
delete('tools/movement/evidence.mjs')   # claims A and C are hook A/Bs; B only ever ran with ?hook=1

# ---- src/mode.js -------------------------------------------------------------
edit('src/mode.js', [
("""/* Movement-verb prototypes (fleet wave 3), both default OFF and both scoped to
   the slice, so every shipped URL keeps its exact behavior:
     ?hook=1        arms the snap hook / tether (src/sim/hook.js)
     ?hookinput=    which trigger the hook listens to — `key` (default: the
                    dedicated L / E key) or `auto` (a valid anchor grabs itself
                    while airborne, the way a ledge catch does). An A/B for
                    DESIGN's open "jump vs fire vs dedicated" question.
     ?flow=1        arms the momentum spine (src/sim/flow.js) on ANY pace""",
"""/* Movement-verb prototypes (fleet wave 3), default OFF and scoped to the
   slice, so every shipped URL keeps its exact behavior. (The snap hook,
   ?hook=1 / ?hookinput=, was deleted under decisions.md entry 25; it is
   recoverable from git at bb8e4df.)
     ?flow=1        arms the momentum spine (src/sim/flow.js) on ANY pace"""),
("""export const HOOK_ENABLED = IS_TRAVERSAL_SLICE && QUERY.get('hook') === '1';
export const HOOK_INPUT = QUERY.get('hookinput') === 'auto' ? 'auto' : 'key';
""", ""),
("""   resolves byte-for-byte as before. Not composed with ?hound=/?polyp=/
   ?hook= — those roster and anchor placements are authored against the
   lattice this overlay replaces. */""",
"""   resolves byte-for-byte as before. Not composed with ?hound=/?polyp= —
   those roster placements are authored against the lattice this overlay
   replaces. */"""),
("""      { hook: HOOK_ENABLED, flow: FLOW_ENABLED })""", """      { flow: FLOW_ENABLED })"""),
])

# ---- src/pure/traversal.js -------------------------------------------------
cut('src/pure/traversal.js',
    '  /* ---------------------- SNAP HOOK anchors (?hook=1) ------------------ *',
    '  // HULL FALLBACK tier 1 (proposal B.1)')
cut('src/pure/traversal.js',
    '/* ======================= SNAP HOOK tuning (?hook=1) ================== *',
    '/* ==================== MOMENTUM SPINE tuning (?flow=1) ================ *')
edit('src/pure/traversal.js', [
("""  // …and the same absolute bound the hook carries, applied to the amplified
  // launch itself, because a launch inherits the speed it arrived with: no
  // chain of any length can put a horizontal launch past this.""",
"""  // An absolute bound on the amplified launch itself, because a launch
  // inherits the speed it arrived with: no chain of any length can put a
  // horizontal launch past this."""),
])
edit('src/pure/traversal.js', [
("""   `opts` carries the movement-verb prototype flags (?hook=1 / ?flow=1). With
   no opts — every shipped URL — the result is byte-for-byte what it was
   before those verbs existed: `hook` and `flow` resolve to null and no
   movement field moves.""",
"""   `opts` carries the movement-verb prototype flag (?flow=1). With no opts —
   every shipped URL — the result is byte-for-byte what it was before that
   verb existed: `flow` resolves to null and no movement field moves."""),
("""  const hook = opts.hook ? { ...TRAVERSAL_HOOK } : null;
""", ""),
("""    ...fixture,
    hook,
    flow,""", """    ...fixture,
    flow,"""),
])

# ---- src/sim/player.js -----------------------------------------------------
edit('src/sim/player.js', [
("""  ACTIVE_FIXTURE, ACTIVE_SLICE, AUTOBOUNCE_ENABLED, CROUCH_ENABLED, FLOW_ENABLED,
  HOOK_ENABLED, IS_TRAVERSAL_SLICE, RUN_FALLBACK_ENABLED, SLICE_FALLBACK_ENABLED,
} from '../mode.js';""",
"""  ACTIVE_FIXTURE, ACTIVE_SLICE, AUTOBOUNCE_ENABLED, CROUCH_ENABLED, FLOW_ENABLED,
  IS_TRAVERSAL_SLICE, RUN_FALLBACK_ENABLED, SLICE_FALLBACK_ENABLED,
} from '../mode.js';"""),
("""// Movement-verb prototypes (?hook=1 / ?flow=1). Both modules are inert without
// their flag, and every call below is an identity operation when they are off.
import { hookCancel, hookUpdate } from './hook.js';
""",
"""// Movement-verb prototype (?flow=1). Inert without its flag, and every call
// below is an identity operation when it is off.
"""),
("""// The two things sim/hook.js cannot reach on its own without importing this
// module back (which would close the import cycle): the pace's launch chain and
// the traversal-state clear. Allocated once, not per frame.
const hookApi = { chainMult: chainLaunchMult, clearTraversal: clearPlayerTraversal };

""", ""),
("""  // SNAP HOOK (?hook=1): runs before the ledge/wall branches so a grab can take
  // over a hang or a slide — every grab wants to become another launch. While
  // the tether is taut it owns position, exactly as a ledge hang does, so the
  // drive, gravity and both integrations below stand down for that frame.
  const hooked = HOOK_ENABLED ? hookUpdate(player, dt, hookApi) : false;
""", ""),
("""  if (LADDERS_ENABLED && player.traversalState === 'free' && !hooked && v &&""",
 """  if (LADDERS_ENABLED && player.traversalState === 'free' && v &&"""),
("""  if (!ledgeHanging && !wallSliding && !ladderClimbing && !hooked &&""",
 """  if (!ledgeHanging && !wallSliding && !ladderClimbing &&"""),
("""  if (player.traversalState === 'free' && !hooked && jumpBufferedUntil > gameMs) {""",
 """  if (player.traversalState === 'free' && jumpBufferedUntil > gameMs) {"""),
("""  if (!ledgeHanging && !ladderClimbing && !hooked) {""",
 """  if (!ledgeHanging && !ladderClimbing) {""", 2),
("""  if (!ledgeHanging && !wallSliding && !ladderClimbing && !hooked) {""",
 """  if (!ledgeHanging && !wallSliding && !ladderClimbing) {"""),
("""  if (TRAVERSAL_CONTACTS_ENABLED && player.traversalState === 'free' && !hooked &&""",
 """  if (TRAVERSAL_CONTACTS_ENABLED && player.traversalState === 'free' &&"""),
("""  // taking a hit knocks RIG off the tether and off the chain: momentum is
  // earned, and a hit is exactly the thing that un-earns it
  if (HOOK_ENABLED) hookCancel();
""",
"""  // taking a hit knocks RIG off the chain: momentum is earned, and a hit is
  // exactly the thing that un-earns it
"""),
("""  clearJumpBuffer();
  if (HOOK_ENABLED) hookCancel();
  if (FLOW_ENABLED) flowBreak();
  if (ACTIVE_FIXTURE) {""",
"""  clearJumpBuffer();
  if (FLOW_ENABLED) flowBreak();
  if (ACTIVE_FIXTURE) {"""),
])

# ---- src/sim/input.js ------------------------------------------------------
edit('src/sim/input.js', [
("""  swap: false,
  // snap hook (?hook=1). Present unconditionally so releaseAllKeys and any
  // harness see one stable key set; inert unless the flag arms sim/hook.js.
  hook: false,
};""", """  swap: false,
};"""),
("""export let hookBufferedUntil = 0;
""", ""),
("""// The hook is a buffered PRESS, like the jump: pressing a beat before an
// anchor becomes valid still grabs it, which is what keeps the verb from
// needing an aiming pause (DESIGN: "minimal aiming interruption").
export function bufferHookUntil(ms) { hookBufferedUntil = ms; }
export function clearHookBuffer() { hookBufferedUntil = 0; }

""", ""),
])

# ---- src/pure/frame-input.js -----------------------------------------------
edit('src/pure/frame-input.js', [
("""  KeyC: 'swap',
  KeyL: 'hook', KeyE: 'hook',
});""", """  KeyC: 'swap',
});"""),
])

# ---- src/boot/run-reset.js / view-init.js ------------------------------------
edit('src/boot/run-reset.js', [
("""import { resetHook } from '../sim/hook.js';
import { clearHookBuffer, clearSwapBuffer, releaseAllKeys } from '../sim/input.js';""",
 """import { clearSwapBuffer, releaseAllKeys } from '../sim/input.js';"""),
("""  { id: 'hook-input', reset: clearHookBuffer },
  { id: 'hook', reset: resetHook },
""", ""),
])
edit('src/boot/view-init.js', [
("""import { initHookView } from '../render/hook.js';
""", ""),
("""  Object.freeze({ id: 'hook', init: initHookView }),
""", ""),
])

# ---- src/sim/bridge.js -----------------------------------------------------
edit('src/sim/bridge.js', [
("""  hook:     { sync: noop },              // anchor markers + the live tether line
""", ""),
])

# ---- src/config.js (palette tokens only render/hook.js read) ------------------
edit('src/config.js', [
("""    // snap-hook markers (?hook=1): warm hardware idle, hot when live, pale
    // tether. Never the pickup magenta and never the hostile green — an anchor
    // has to read as grabbable machinery at a glance (DESIGN's aiming rule).
    hookAnchor: 0xc8a04a, hookLive: 0xffd166, hookTether: 0xfff0c2,
""", ""),
])

# ---- src/render/palette.js (comment about the exemption) ---------------------
edit('src/render/palette.js', [
("""   module carries no CONFIG.palette reads and no raw color literals.
   src/render/hook.js stays exempt (judged-rejected prototype, deliberately
   untouched — it keeps CONFIG.palette.hook*).
""", """   module carries no CONFIG.palette reads and no raw color literals.
"""),
])

# ---- src/sim/score.js (comment) ----------------------------------------------
edit('src/sim/score.js', [
("""  // (hanging or hopping in place must pay nothing — A.3 anti-degenerate). This
  // was an allow-list of ledge|wall, which is the same set today plus the snap
  // hook (?hook=1): a tether launch that changes elevation links like any other.""",
"""  // (hanging or hopping in place must pay nothing — A.3 anti-degenerate)."""),
])

# ---- src/ui/hud.js -------------------------------------------------------------
edit('src/ui/hud.js', [
("""  CROUCH_ENABLED, FLOW_ENABLED, HOOK_ENABLED, HOOK_INPUT, HOUND_TRIAL_STAGE,""",
 """  CROUCH_ENABLED, FLOW_ENABLED, HOUND_TRIAL_STAGE,"""),
("""import { hookSnapshot } from '../sim/hook.js';
""", ""),
("""const HOOK_LEGEND = HOOK_ENABLED
  ? (HOOK_INPUT === 'auto'
    ? ' · HOOK AUTO'
    : ' · HOOK L/E')
  : '';
""", ""),
("""    HOOK_LEGEND + FLOW_LEGEND + BOUNCE_LEGEND +""", """    FLOW_LEGEND + BOUNCE_LEGEND +"""),
("""  // kept to one short word: this readout sits beside the centered slice banner,
  // and an anchor id here overlapped it (browser screenshot)
  if (HOOK_ENABLED) {
    const hk = hookSnapshot();
    if (hk.phase !== 'idle') statuses.push('TETHER');
    else if (hk.acquirable) statuses.push('HOOK READY');
  }
""", ""),
])

# ---- src/main.js -----------------------------------------------------------------
edit('src/main.js', [
("""  ACTIVE_FIXTURE, ACTIVE_SLICE, AUTOBOUNCE_ENABLED, FLOW_ENABLED, HOOK_ENABLED,
  HOOK_INPUT, IS_G1, IS_G2,""",
 """  ACTIVE_FIXTURE, ACTIVE_SLICE, AUTOBOUNCE_ENABLED, FLOW_ENABLED,
  IS_G1, IS_G2,"""),
("""  bufferHookUntil, bufferJumpUntil, bufferSwapUntil, keys, releaseAllKeys,""",
 """  bufferJumpUntil, bufferSwapUntil, keys, releaseAllKeys,"""),
("""import { hookSnapshot } from './sim/hook.js';
""", ""),
("""/* The snap hook takes a DEDICATED key, not jump and not fire (DESIGN's open
   question). Jump already carries five meanings (jump, air jump, drop-through,
   ledge launch, wall launch) and overloading it would make the game choose
   between hooking and jumping for the player; fire is held continuously for
   auto-fire, so a hook on fire would trigger constantly. L sits next to
   J (fire) and K (jump) so the right hand keeps one cluster; E is the
   left-hand alternate for WASD players. Both are the same intent — the A/B
   the operator is asked to judge is ?hookinput=auto, which needs no key at
   all (see src/mode.js). */
const KEYMAP""", """const KEYMAP"""),
("""// frame timeline. Keeping jump/hook buffering here is load-bearing: a test""",
 """// frame timeline. Keeping jump/swap buffering here is load-bearing: a test"""),
("""  if (k === 'hook' && !repeat && ACTIVE_SLICE && ACTIVE_SLICE.hook)
    bufferHookUntil(gameMs + ACTIVE_SLICE.hook.bufferMs);
""", ""),
("""  // jump/fire resumes, but reset never invents another jump/hook press edge.""",
 """  // jump/fire resumes, but reset never invents another jump press edge."""),
("""    // without ?momentum=1, exactly like `hook`/`flow` above.""",
 """    // without ?momentum=1, exactly like `flow` below."""),
("""    // movement-verb prototypes, additive and inert when their flags are off:
    // the tether's phase/anchor and the momentum chain's live multiplier, so a
    // bot run can prove a hook route was actually hooked. `player.*` above is
    // untouched — traversalState keeps its frozen free|ledge|wall domain.
    hook: HOOK_ENABLED ? hookSnapshot() : undefined,
    flow:""",
"""    // movement-verb prototype, additive and inert when its flag is off: the
    // momentum chain's live multiplier. `player.*` above is untouched —
    // traversalState keeps its frozen free|ledge|wall domain.
    flow:"""),
("""  // movement-verb prototypes: read surfaces only (the verbs live in the sim)
  hook: { enabled: HOOK_ENABLED, input: HOOK_INPUT, snapshot: hookSnapshot },
  flow:""",
"""  // movement-verb prototype: read surface only (the verb lives in the sim)
  flow:"""),
("""    // Movement-verb prototypes: both directions checked, so this also proves an
    // ordinary URL leaves them completely inert (the flags-off contract).
    {
      const hk = hookSnapshot(), fl = flowSnapshot();
      check('hook flag matches its module',
        hk.enabled === HOOK_ENABLED && (!HOOK_ENABLED || !!ACTIVE_SLICE.hook));
      check('hook idle after restart', hk.phase === 'idle' && hk.grabs === 0);
      check('hook anchors authored',
        !HOOK_ENABLED || ACTIVE_SLICE.hookAnchors.length >= 4);
      check('flow flag""",
"""    // Movement-verb prototype: both directions checked, so this also proves an
    // ordinary URL leaves it completely inert (the flags-off contract).
    {
      const fl = flowSnapshot();
      check('flow flag"""),
])


# ---- flow comments (the hook was one of the contact launches) ---------------
edit('src/pure/flow.js', [
("""     1. Links come only from CONTACT launches (ledge / wall / hook). An air""",
 """     1. Links come only from CONTACT launches (ledge / wall). An air"""),
("""   cfg.launchCeiling. A launch preserves the speed it arrived with (ledge, wall
   and hook launches all do), so amplifying it compounds across a chain; the""",
 """   cfg.launchCeiling. A launch preserves the speed it arrived with (ledge and
   wall launches both do), so amplifying it compounds across a chain; the"""),
])
edit('src/sim/flow.js', [
("""     1. a CONTACT launch (ledge / wall / hook) adds a chain link and refunds""",
 """     1. a CONTACT launch (ledge / wall) adds a chain link and refunds"""),
])

# =============================================================================
# tools — pathcheck exception (hook-only assertions; every removed label is
# listed in reports/tasks/T-121/build.md) and the non-test movement tools
# =============================================================================
import hashlib, shutil
HF = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hook-files')

def replace_whole(path, expected_sha16, new_file):
    p = os.path.join(ROOT, path)
    got = hashlib.sha256(open(p, 'rb').read()).hexdigest()[:16]
    if got != expected_sha16:
        raise SystemExit(f'{path} changed since the patch was prepared ({got} != {expected_sha16}); re-derive it')
    shutil.copy(new_file, p)
    log.append('rewrote ' + path)

replace_whole('tools/pathcheck/movement-verb-prototypes.mjs', 'e0d5dec0caa93cfa',
              os.path.join(HF, 'movement-verb-prototypes.mjs'))
# the snap-hook domain's crush-contract half is kept, renamed (its hook half is deleted)
shutil.copy(os.path.join(HF, 'flow-chain-crush-contract.mjs'),
            os.path.join(ROOT, 'tools/pathcheck/flow-chain-crush-contract.mjs'))
log.append('added   tools/pathcheck/flow-chain-crush-contract.mjs')
edit('tools/pathcheck/manifest.mjs', [
("""import * as d15 from './snap-hook-driven-through-real-sim.mjs';""",
 """import * as d15 from './flow-chain-crush-contract.mjs';"""),
("""  d15,    // the snap hook, driven through the REAL sim loop --------------""",
 """  d15,    // a live momentum chain under the crush contract (T-121: was the snap-hook domain)"""),
])
def edit_if_present(path, pairs):
    """T-120 batch 5 deletes the boot-registry checker and its domain; once
    that has merged there is nothing to edit (and nothing pins the hook)."""
    if not os.path.exists(os.path.join(ROOT, path)):
        log.append('absent  ' + path + ' (deleted upstream; nothing to edit)')
        return
    edit(path, pairs)

# T-120's tier map (tools/pathcheck/_tiers.mjs, once T-120 has merged) names the
# renamed domain, and its runner refuses to start on a stale name.
edit_if_present('tools/pathcheck/_tiers.mjs', [
("""  'snap-hook-driven-through-real-sim',""",
 """  'flow-chain-crush-contract',"""),
])
edit_if_present('tools/boot-registry-check.mjs', [
("""  'player', 'capsules', 'bullets', 'mods', 'hook', 'loot', 'overlay',""",
 """  'player', 'capsules', 'bullets', 'mods', 'loot', 'overlay',"""),
("""  /import ['"]\\.\\/render\\/(?:finale|transform|player|capsules|mods|hook|meridian-defense-vfx)\\.js['"]/,""",
 """  /import ['"]\\.\\/render\\/(?:finale|transform|player|capsules|mods|meridian-defense-vfx)\\.js['"]/,"""),
("""  'src/render/bullets.js', 'src/render/mods.js', 'src/render/hook.js',""",
 """  'src/render/bullets.js', 'src/render/mods.js',"""),
("""assert.equal(resetIds.length, 31, 'the full run has thirty-one named reset owners');""",
 """assert.equal(resetIds.length, 29, 'the full run has twenty-nine named reset owners');"""),
])
edit_if_present('tools/pathcheck/boot-registry-contract.mjs', [
("""  ok(/BOOT REGISTRIES: 13 views, 31 reset owners/.test(result.stdout || ''),""",
 """  ok(/BOOT REGISTRIES: 12 views, 29 reset owners/.test(result.stdout || ''),"""),
])

# ---- tools/movement (non-test tools; this lane's) ------------------------------
edit('tools/movement/selftest.mjs', [
(""" *   node tools/movement/selftest.mjs --url 'index.html?slice=traversal&hook=1'""",
 """ *   node tools/movement/selftest.mjs --url 'index.html?slice=traversal&flow=1'"""),
("""  'index.html?slice=traversal&hook=1',
  'index.html?slice=traversal&hook=1&hookinput=auto',
  'index.html?slice=traversal&flow=1',
  'index.html?slice=traversal&hook=1&flow=1',
  'index.html?slice=traversal&pace=surge&hook=1',
  'index.html?slice=traversal&pace=surge&flow=1',
  'index.html?slice=traversal&pace=surge&hook=1&flow=1',
  'index.html?slice=traversal&pace=hunt&hook=1&flow=1',
  'index.html?slice=traversal&pace=swarm&hook=1&flow=1',
  'index.html?slice=traversal&hound=1&hook=1&flow=1',
  'index.html?slice=traversal&pace=surge&hound=3&hook=1&flow=1&score=1',
  'index.html?slice=traversal&hook=1&flow=1&enemies=0',
  'index.html?slice=traversal&autobounce=1',
  'index.html?slice=traversal&pace=surge&hook=1&flow=1&autobounce=1&view=far',""",
"""  'index.html?slice=traversal&flow=1',
  'index.html?slice=traversal&pace=surge&flow=1',
  'index.html?slice=traversal&pace=hunt&flow=1',
  'index.html?slice=traversal&pace=swarm&flow=1',
  'index.html?slice=traversal&hound=1&flow=1',
  'index.html?slice=traversal&pace=surge&hound=3&flow=1&score=1',
  'index.html?slice=traversal&flow=1&enemies=0',
  'index.html?slice=traversal&autobounce=1',
  'index.html?slice=traversal&pace=surge&flow=1&autobounce=1&view=far',"""),
])
edit('tools/movement/matrix.mjs', [
("""  // The two new verbs, on and off, against the paces the operator plays.
  evidence: {
    queries: [
      'slice=traversal',
      'slice=traversal&hook=1',
      'slice=traversal&flow=1',
      'slice=traversal&hook=1&flow=1',
      'slice=traversal&pace=surge',
      'slice=traversal&pace=surge&hook=1',
      'slice=traversal&pace=surge&flow=1',
      'slice=traversal&pace=surge&hook=1&flow=1',
      'slice=traversal&hook=1&hookinput=auto',
      // the verbs against the merged houndframe trial: floor denial is the
      // thing a hook route is supposed to answer
      'slice=traversal&hound=1',
      'slice=traversal&hound=1&hook=1&flow=1',
      'slice=traversal&pace=surge&hound=3',
      'slice=traversal&pace=surge&hound=3&hook=1&flow=1',
    ],
    policies: ['dash', 'roof', 'hook-line', 'chain'],""",
"""  // The momentum spine, on and off, against the paces the operator plays.
  evidence: {
    queries: [
      'slice=traversal',
      'slice=traversal&flow=1',
      'slice=traversal&pace=surge',
      'slice=traversal&pace=surge&flow=1',
      'slice=traversal&hound=1',
      'slice=traversal&hound=1&flow=1',
      'slice=traversal&pace=surge&hound=3',
      'slice=traversal&pace=surge&hound=3&flow=1',
    ],
    policies: ['dash', 'roof', 'chain'],"""),
])
edit('tools/movement/matrix.mjs', [
("""    'air', 'stall', 'hooks', 'links', 'flowMult', 'peakVx', 'routes', 'fp'];""",
 """    'air', 'stall', 'links', 'flowMult', 'peakVx', 'routes', 'fp'];"""),
("""    String(r.m.maxY), String(r.m.airFraction), String(r.m.stallFraction),
    String(r.m.hooks), String(r.m.links || 0), String(r.m.flowPeakMult),""",
 """    String(r.m.maxY), String(r.m.airFraction), String(r.m.stallFraction),
    String(r.m.links || 0), String(r.m.flowPeakMult),"""),
])
edit('tools/movement/simrun.mjs', [
(""" *     hook, which an open-loop key script cannot aim;""",
 """ *     contact launch, which an open-loop key script cannot time;"""),
(""" *   node tools/movement/simrun.mjs --query 'slice=traversal&pace=surge&hook=1' \\
 *        --policy hook-line [--seconds 14] [--dt 0.0166667] [--json] [--trace]""",
 """ *   node tools/movement/simrun.mjs --query 'slice=traversal&pace=surge&flow=1' \\
 *        --policy chain [--seconds 14] [--dt 0.0166667] [--json] [--trace]"""),
(""" *   ctx = { player, fixture, gameMs, margin, hook, flow, prev }
 *   intent = { right, left, up, down, jump, fire, hook }""",
 """ *   ctx = { player, fixture, gameMs, margin, flow, prev }
 *   intent = { right, left, up, down, jump, fire }"""),
("""  // Hold right and take every anchor the game offers. With the flag off the key
  // is inert, which makes this policy its own control group.
  'hook-line'(ctx) {
    const p = ctx.player;
    const canHook = !!(ctx.hook && ctx.hook.acquirable);
    if (canHook) return { right: true, hook: true, fire: true };
    return contactIntent(p) ||
      { right: true, jump: p.grounded || p.vy < -8, fire: true };
  },

""", ""),
("""  // Chain-hungry: convert EVERY contact into a launch and take every anchor,
  // spending the air jump only to reach the next contact.""",
 """  // Chain-hungry: convert EVERY contact into a launch, spending the air jump
  // only to reach the next contact."""),
("""    const p = ctx.player;
    const canHook = !!(ctx.hook && ctx.hook.acquirable);
    if (canHook) return { right: true, hook: true, fire: true };
    const contact = contactIntent(p);""",
 """    const p = ctx.player;
    const contact = contactIntent(p);"""),
("""  let HOOK = null, FLOW = null;
  try { HOOK = await import(mod('sim/hook.js')); } catch { /* pre-hook tree */ }
  try { FLOW""",
 """  let FLOW = null;
  try { FLOW"""),
("""    if (I.clearHookBuffer) I.clearHookBuffer();
    if (HOOK) HOOK.resetHook();
""", ""),
("""    hooks: 0, hookBlocked: 0, hookReleases: 0,
""", ""),
("""    const hookInfo = HOOK ? HOOK.hookSnapshot() : null;
""", ""),
("""      hook: hookInfo, flow: flowInfo,""", """      flow: flowInfo,"""),
("""    // key edges: jump and hook are buffered presses in the real game
    const wantJump = !!intent.jump, wantHook = !!intent.hook;
    if (wantJump && !I.keys.jump) I.bufferJumpUntil(T.gameMs + CONFIG.player.jumpBufferMs);
    if (wantHook && !I.keys.hook && I.bufferHookUntil)
      I.bufferHookUntil(T.gameMs + (slice.hook ? slice.hook.bufferMs : 140));""",
 """    // key edges: jump is a buffered press in the real game
    const wantJump = !!intent.jump;
    if (wantJump && !I.keys.jump) I.bufferJumpUntil(T.gameMs + CONFIG.player.jumpBufferMs);"""),
("""    if ('hook' in I.keys) I.keys.hook = wantHook;
""", ""),
("""    const hs = HOOK ? HOOK.hookSnapshot() : null;
    if (hs) {
      m.hooks = hs.grabs;
      m.hookBlocked = hs.blocked;
      m.hookReleases = hs.releases;
    }
""", ""),
("""      L('contacts', 'ledge ' + m.contacts.ledge + '  wall ' + m.contacts.wall +
        '  hook ' + m.hooks + (m.hookBlocked ? ' (blocked ' + m.hookBlocked + ')' : ''));""",
 """      L('contacts', 'ledge ' + m.contacts.ledge + '  wall ' + m.contacts.wall);"""),
])

# =============================================================================
# FENCED tools: tools/simlab (T-102 / T-104). Applied only when the integrator
# releases tools/simlab — but the race lab cannot import a deleted sim/hook.js,
# so the hook batch and these edits land together.
# =============================================================================
if '--with-simlab' in sys.argv:
    edit('tools/simlab/race/run-child.mjs', [
    ("""  'player', 'hook-input', 'hook', 'flow', 'corner-events', 'transform',
  'hit-stop', null /* camera-yaw */, 'future-faces',""",
     """  'player', 'flow', 'corner-events', 'transform',
  'hit-stop', null /* camera-yaw */, 'future-faces',"""),
    ("""  'player', 'hook-input', 'hook', 'flow', 'corner-events', 'transform',
  'hit-stop', 'camera-yaw', 'future-faces', 'juice-presentation', 'slice-stats',""",
     """  'player', 'flow', 'corner-events', 'transform',
  'hit-stop', 'camera-yaw', 'future-faces', 'juice-presentation', 'slice-stats',"""),
    ("""  const HK = await mod('sim/hook.js');
""", ""),
    ("""    'hook-input': () => IN.clearHookBuffer(),
    'hook': () => HK.resetHook(),
""", ""),
    ])
    edit('tools/simlab/t2lab.mjs', [
    ("""  const [C, B, T, E, IN, ST, LV, PC, PL, WP, HO, CA, MO, HK, FL, SCR, SP, WG, XF, SC] =""",
     """  const [C, B, T, E, IN, ST, LV, PC, PL, WP, HO, CA, MO, FL, SCR, SP, WG, XF, SC] ="""),
    ("""      '/sim/mods.js', '/sim/hook.js', '/sim/flow.js', '/sim/score.js',""",
     """      '/sim/mods.js', '/sim/flow.js', '/sim/score.js',"""),
    ("""    IN.clearHookBuffer();
    HK.resetHook();
""", ""),
    ])

for line in log:
    print(line)
