#!/usr/bin/env python3
"""T-121: the ?zip=1-only branch T-102 left in src/render/route-visibility.js
(decisions.md entry 25; apply only after T-102 has merged and the integrator
says so). Since batch 4, IS_G1 === (ACTIVE_FIXTURE === null), so after the
fixture early-return `IS_G1 || routeColumnBuilt(s)` is always true and the
build-revision stamp is unreachable. routeColumnBuilt stays exported (the
integrator keeps the sim-side zipper surface, I-105). Exact-match edits.
usage: route-zip.py <repo root>"""
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

edit('src/render/route-visibility.js', [
("""import { ACTIVE_FIXTURE, IS_G1 } from '../mode.js';
import { LEVEL_LEN, columnBuilt, levelBuildRevision } from '../sim/level.js';""",
 """import { ACTIVE_FIXTURE } from '../mode.js';
import { LEVEL_LEN, columnBuilt } from '../sim/level.js';"""),
("""  // T-102: under the default static-anatomy reveal (decisions.md entry 3) the
  // arriving face was baked at boot and is REVEALED by camera ownership alone.
  // Gating it on the simulation's construction rows — which still settle on
  // the retired zipper's schedule (one column per 16 ms from 380 to 860 ms,
  // the far set at 1100 ms) — made the arriving catwalks, ladders and hull
  // assemble column by column after the camera handoff, and hid the pre-bend
  // column RIG fights from. Only the retired ?zip=1 brick reveal, which does
  // assemble, still reads the construction rows.
  return routeRenderOwned(
    s, IS_G1 || routeColumnBuilt(s), scrollX, cameraFacingFacet(), CONFIG, BEND_S,
  );
}

// A cheap cache key for static instance pools. It changes only at an intro /
// camera-facet handoff, or (?zip=1 only) whenever the sim commits another
// construction row.
export function routeVisibilityStamp() {
  if (ACTIVE_FIXTURE !== null) return 'fixture';
  if (IS_G1) return `${currentWorldFacet()}`;
  return `${currentWorldFacet()}:${levelBuildRevision()}`;
}""",
 """  // T-102: under the static-anatomy reveal (decisions.md entry 3) the
  // arriving face was baked at boot and is REVEALED by camera ownership alone.
  // Gating it on the simulation's construction rows — which still settle on
  // the retired zipper's schedule (one column per 16 ms from 380 to 860 ms,
  // the far set at 1100 ms) — made the arriving catwalks, ladders and hull
  // assemble column by column after the camera handoff, and hid the pre-bend
  // column RIG fights from. The ?zip=1 brick reveal, the one reader of those
  // rows, was deleted under decisions.md entry 25 (T-121).
  return routeRenderOwned(s, true, scrollX, cameraFacingFacet(), CONFIG, BEND_S);
}

// A cheap cache key for static instance pools. It changes only at an intro /
// camera-facet handoff.
export function routeVisibilityStamp() {
  if (ACTIVE_FIXTURE !== null) return 'fixture';
  return `${currentWorldFacet()}`;
}"""),
])

# tools/pathcheck — narrow exception: the zip-only half of T-102's pin
edit('tools/pathcheck/vertical-assault-geometry.mjs', [
("""  // ?zip=1 changes only the corner theater. Real rails and every other
  // route-bound visual retain the normal run's camera/build ownership.""",
 """  // Real rails and every other route-bound visual follow the normal run's
  // camera ownership."""),
("""  // T-102 rewrite (decisions.md entry 21 — legacy implementation pin): this
  // used to require that route-visibility.js never mention IS_G1. What it
  // protects is that neither reveal style can expose a facet the camera does
  // not own; that stays asserted. The default static-anatomy reveal now
  // ignores the sim's zipper-era construction rows (entry 3: revealed, never
  // assembled); only ?zip=1 still reads them.
  ok(/if\\s*\\(ACTIVE_FIXTURE !== null\\) return true/.test(route) &&
    /routeRenderOwned\\(\\s*s,\\s*IS_G1 \\|\\| routeColumnBuilt\\(s\\),\\s*scrollX,\\s*cameraFacingFacet\\(\\)/
      .test(route),
  'route ownership is camera-facet topology in both normal-run reveal styles; only ?zip=1 adds build state');""",
 """  // T-102 rewrite (decisions.md entry 21 — legacy implementation pin): this
  // used to require that route-visibility.js never mention IS_G1. What it
  // protects is that the run cannot expose a facet the camera does not own;
  // that stays asserted. The static-anatomy reveal ignores the sim's
  // zipper-era construction rows (entry 3: revealed, never assembled); the
  // ?zip=1 reveal that read them was deleted under entry 25 (T-121).
  ok(/if\\s*\\(ACTIVE_FIXTURE !== null\\) return true/.test(route) &&
    /routeRenderOwned\\(\\s*s,\\s*true,\\s*scrollX,\\s*cameraFacingFacet\\(\\)/.test(route) &&
    !/\\bIS_G1\\b|levelBuildRevision/.test(route),
  'route ownership is camera-facet topology alone in the normal run; no build state since entry 25');"""),
])

# T-102's own corner-turn domain and its falsification row pin the same branch
edit('tools/pathcheck/t-102-corner-turns.mjs', [
("""    const g1 = visibleArriving(true, handoffMs), zip = visibleArriving(false, handoffMs);
    ok(start >= 0 && end > start && g1.shown === g1.rows,
      `T-102: the shipped routeRenderable draws the whole arriving facet (${g1.rows} rows) at the ` +
      `${handoffMs} ms handoff under the default reveal, not a construction prefix (drew ${g1.shown})`);
    ok(zip.shown < zip.rows,
      `T-102: ?zip=1 keeps its assembling reveal (${zip.shown} of ${zip.rows} rows at the handoff)`);""",
 """    const g1 = visibleArriving(true, handoffMs);
    ok(start >= 0 && end > start && g1.shown === g1.rows,
      `T-102: the shipped routeRenderable draws the whole arriving facet (${g1.rows} rows) at the ` +
      `${handoffMs} ms handoff under the default reveal, not a construction prefix (drew ${g1.shown})`);"""),
("""  ok(/IS_G1 \\|\\| routeColumnBuilt\\(s\\)/.test(routeSrc) &&
     /if \\(IS_G1\\) return `\\$\\{currentWorldFacet\\(\\)\\}`/.test(routeSrc),
    'T-102: render/route-visibility.js reads construction rows only under ?zip=1, and its cache stamp ' +
    'changes only at facet handoffs under the default reveal');""",
 """  ok(!/routeColumnBuilt\\(s\\)|levelBuildRevision/.test(
       routeSrc.slice(routeSrc.indexOf('function routeRenderable('))) &&
     /return `\\$\\{currentWorldFacet\\(\\)\\}`;\\s*\\}/.test(routeSrc),
    'T-121: render/route-visibility.js reads no construction rows (the ?zip=1 reveal that did was ' +
    'deleted, entry 25), and its cache stamp changes only at facet handoffs');"""),
])
edit('tools/simlab/turnlab-falsify.mjs', [
("""    'IS_G1 || routeColumnBuilt(s)', 'routeColumnBuilt(s)',""",
 """    'routeRenderOwned(s, true, scrollX', 'routeRenderOwned(s, routeColumnBuilt(s), scrollX',"""),
])

for line in log:
    print(line)
