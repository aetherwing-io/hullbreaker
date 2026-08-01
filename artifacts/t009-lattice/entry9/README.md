# entry 9 — the pocket capsule as a plain pickup, and the shape that carries it

Two frames of the SAME moment on face 1's pocket — RIG standing on the
approach deck two columns short of the chasm lip, x = 44.37, default URL
(`index.html`, no flags, FAR view), headless Chrome 1440x900. Only the
pocket geometry differs.

| shot | geometry | what to look at |
| --- | --- | --- |
| `01-pocket-plain-shape.png` | **shipped** — shelf one generator tier over its mid lane, capsule +0.7 over the tip (deck + 5.05) | the magenta `S` sits ON the shelf line, inside the same band of catwalk routes the rest of the face reads in. It is a pickup on a route. |
| `02-pocket-raised-tier-withdrawn.png` | the withdrawn pass-3 shape — shelf +4.45 of its own, capsule +2.30 over it (deck + 8.10) | the same capsule floats a body-height clear of every route line, above the lattice band, with nothing under it at that distance. It reads as a mote in the sky. |

The raised tier existed only to put the capsule outside RIG's jump envelope
so that collecting it would have to be paid for; `decisions.md` entry 9
withdrew that requirement, and these two frames are why the revert also
costs nothing visually — at FAR the plain shape is the more legible of the
two, and it is one catwalk cheaper (62 platforms vs 63: the raised shelf
changed the bands the patch pass reads and bought an extra lane).

## Honesty notes

- Captured with a throwaway Playwright driver (hold right, hold a jump when
  the deck 1.2 tiles ahead is a hole or a step — the same policy
  `tools/pathcheck.mjs`'s full-run child uses), not with
  `tools/playtest/run.mjs`. Nothing in the page was modified: no HP top-up,
  no flags, no injected state. Both frames come from the same driver at the
  same trigger, one against this branch and one against a detached checkout
  of `149220e`.
- These frames are evidence about **legibility of the shape**, not about
  difficulty, pacing, or whether a free pickup is the right call. That last
  one is the operator's, and it is the question in this task's checkpoint
  packet.
