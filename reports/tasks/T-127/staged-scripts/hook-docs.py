#!/usr/bin/env python3
"""T-121: keep docs/DESIGN.md truthful once hook v1 is deleted (entry 25).
Exact-match edits; usage: hook-docs.py <repo root>"""
import os, sys

ROOT = sys.argv[1]

def edit(path, pairs):
    p = os.path.join(ROOT, path)
    s = open(p, encoding='utf8').read()
    for old, new in pairs:
        n = s.count(old)
        if n != 1:
            raise SystemExit(f'{path}: expected 1 match, found {n}:\n---\n{old}\n---')
        s = s.replace(old, new)
    open(p, 'w', encoding='utf8').write(s)
    print('edited  ' + path)

edit('docs/DESIGN.md', [
("""to `CONFIG.palette`. Every render module except the judged-rejected
`?hook=1` prototype reads its colors from the palette tokens.)""",
 """to `CONFIG.palette`. Every render module reads its colors from the palette
tokens; the one exception, the judged-rejected `?hook=1` prototype, was
deleted under `decisions.md` entry 25.)"""),
("""  `decisions.md` entry 5). The verb itself is not banned; a future tether""",
 """  `decisions.md` entry 5), and the prototype was deleted under entry 25
  (recoverable from git at `bb8e4df`). The verb itself is not banned; a future tether"""),
])
