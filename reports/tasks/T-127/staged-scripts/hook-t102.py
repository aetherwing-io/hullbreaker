#!/usr/bin/env python3
"""T-121: the hook-v1 rows T-102's headless turn proof transcribes (apply with
hook-patch.py, once T-102 has merged). sixface-host.mjs replicates the run-reset
registry and imports src/sim/hook.js; t-102-corner-turns.mjs pins that registry's
id list. Both lose exactly the two hook rows (hook-input, hook) that
src/boot/run-reset.js loses. Exact-match edits; usage: hook-t102.py <repo root>"""
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

edit('tools/simlab/lib/sixface-host.mjs', [
("""  const [PC, HK, FL, XF] = await Promise.all([
    'sim/pace.js', 'sim/hook.js', 'sim/flow.js', 'sim/transform.js',
  ].map(imp));""",
 """  const [PC, FL, XF] = await Promise.all([
    'sim/pace.js', 'sim/flow.js', 'sim/transform.js',
  ].map(imp));"""),
("""    IN.clearHookBuffer();                          // hook-input
    HK.resetHook();                                // hook
""", ""),
])
edit('tools/pathcheck/t-102-corner-turns.mjs', [
("""    'hostile-rng', 'kill-count', 'shot-count', 'player', 'hook-input', 'hook', 'flow',
    'corner-events', 'transform', 'hit-stop', 'camera-yaw', 'future-faces', 'juice-presentation',
    'slice-stats']),""",
 """    'hostile-rng', 'kill-count', 'shot-count', 'player', 'flow',
    'corner-events', 'transform', 'hit-stop', 'camera-yaw', 'future-faces', 'juice-presentation',
    'slice-stats']),"""),
])

for line in log:
    print(line)
