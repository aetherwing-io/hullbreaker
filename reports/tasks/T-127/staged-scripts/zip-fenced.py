#!/usr/bin/env python3
"""T-121: delete the zip-assembly corner's RENDER side and its flag (decisions.md
entry 25; integrator scope split: the SIM-side zipper state in wavegate.js /
sim/level.js / pure/waves.js stays — it still gates gameplay, inbox I-105).

?zip=1 and ?g1=0 become inert: IS_G1 now means exactly "the six-face run"
(ACTIVE_FIXTURE === null), which is what it already was at every URL except
those two. Exact-match edits; usage: zip-patch.py <repo root> [--with-fenced]"""
import os, sys

ROOT = sys.argv[1]
FENCED = True   # zip-fenced.py: only the fenced remainder (batch 4 applied the rest)
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

# ---- FENCED files (apply after the in-flight lanes merge) -------------------------------
if FENCED:
    edit('src/main.js', [
    ("""  // static-anatomy reveal (default since T-009; ?zip=1 restores the legacy
  // brick-slam) — render-mode facts only, deliberately OUTSIDE""",
     """  // static-anatomy reveal (the six-face run's only corner since entry 25)
  // — render-mode facts only, deliberately OUTSIDE"""),
    ])
    edit('src/ui/audio.js', [
    ("""   The zipper columns (view.level.zipperColumn) are deliberately silent:""",
     """   The sim's zipper-column hook (view.level.zipperColumn, no render
   implementation since decisions.md entry 25) is deliberately silent:"""),
    ])
    edit('src/sim/player.js', [
    ("""// Simulation capability follows the selected level, never a renderer flag.
// `?zip=1` changes only the corner reveal and must remain byte-identical to the
// ordinary six-face controller. Authored fixtures keep their prior domains.""",
     """// Simulation capability follows the selected level, never a renderer flag.
// Authored fixtures keep their prior domains."""),
    ])
# ---- the transform slice's reserved band-slam assembly curve -------------------------
# A second copy of the assembly choreography, "reserved for hostile constructs"
# by entry 3's addendum: bandSlamOffset / bandSlamLockMs have no caller in src/
# (graph.mjs: dead exports) and CONFIG.transform.assembly feeds only them. Entry 25
# releases it with the zipper; T-108 lists its two tests as delete-with-feature.
# All three files are fenced (pure/transform.js: T-102 area; config.js: T-101).
if FENCED:
    edit('src/pure/transform.js', [
    ("""/* ------------------- reserved: assembly choreography ---------------- *
 * RETIRED FROM TRANSITIONS, RESERVED FOR HOSTILE CONSTRUCTS (FLEET-PLAN
 * July 30 addendum). The creature's own body never assembles — it is
 * static and RIG moves around it — but things the ship BUILDS should:
 * traps that snap together, emplacements that deploy, later enemies that
 * arrive in pieces. That reads as hostile activity precisely because the
 * anatomy never does it. The staggered drop curve below is kept whole and
 * callable so a traps/enemies lane can lift it as-is; nothing in the
 * transformation path calls it.                                       */

export function bandSlamOffset(tMs, chunkIdx, cfg, out = { phase: 'hidden', dy: 0 }) {
  const T = cfg.transform.assembly;
  const local = tMs - (T.startMs + chunkIdx * T.perColMs);
  if (local < 0) { out.phase = 'hidden'; out.dy = 0; return out; }
  if (local < T.dropMs) {
    const u = local / T.dropMs;
    out.phase = 'drop'; out.dy = T.dropTiles * (1 - u * u);
    return out;
  }
  if (local < T.dropMs + T.dipMs) { out.phase = 'dip'; out.dy = -T.dipTiles; return out; }
  out.phase = 'locked'; out.dy = 0;
  return out;
}

export function bandSlamLockMs(cfg, chunks) {     // last chunk settles at this t
  const T = cfg.transform.assembly;
  return T.startMs + (chunks - 1) * T.perColMs + T.dropMs + T.dipMs;
}

""", ""),
    ])
    edit('src/config.js', [
    ("""    // RETIRED FROM TRANSITIONS, RESERVED FOR HOSTILE CONSTRUCTS (FLEET-PLAN
    // July 30 addendum): the staggered assembly drop. The creature's body
    // never assembles; things the ship builds do. Kept whole for a later
    // traps/enemies lane — nothing in the transition path reads it.
    assembly: {
      startMs: 200, chunks: 24, perColMs: 12, dropMs: 130,
      dropTiles: 3.2, dipTiles: 0.06, dipMs: 40,
    },
""", ""),
    ])
    edit('tools/pathcheck/world-transitions.mjs', [
    ("""  TRANSFORM_FIXTURE, TRANSFORM_PATH, bandSlamOffset, buildTransformLevel,""",
     """  TRANSFORM_FIXTURE, TRANSFORM_PATH, buildTransformLevel,"""),
    ("""  // Nothing arrives: the assembly curve still exists, but it is reserved for
  // hostile constructs and no transition parameter references it.
  ok(!!XT.assembly && XT.assembly.chunks > 0,
     'the assembly choreography is retained for later hostile constructs');
  const transitionKeys = Object.keys(XT).filter((k) => k !== 'assembly');
  ok(transitionKeys.every((k) => !/slam|assemble/i.test(k)),
     'no transition constant drives an assembly, got ' + transitionKeys.join(','));
  const slam = bandSlamOffset(XT.assembly.startMs + XT.assembly.dropMs + XT.assembly.dipMs + 1,
                              0, CONFIG);
  ok(slam.phase === 'locked' && slam.dy === 0,
     'the reserved assembly curve still settles to its base');""",
     """  // Nothing arrives: no transition parameter drives an assembly (the reserved
  // assembly curve itself was deleted under decisions.md entry 25 by T-121;
  // recover it from git at bb8e4df for a hostile construct that assembles).
  const transitionKeys = Object.keys(XT);
  ok(transitionKeys.every((k) => !/slam|assemble/i.test(k)),
     'no transition constant drives an assembly, got ' + transitionKeys.join(','));"""),
    ])

for line in log:
    print(line)
