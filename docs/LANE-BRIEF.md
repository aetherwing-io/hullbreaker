# Lane brief — standing rules for every dispatched agent

**Read this first, then your task block.** It exists so dispatch prompts carry
only what is specific to your task; everything an agent needs *every* time lives
here. If this file and your task block disagree, the task block wins for scope
and this file wins for rules.

Written 2026-08-02, after a session where the integrator hand-wrote the same
fences into eight consecutive dispatch prompts and got one of them wrong.

## Who the game is for

**Current (2026-10-22, `decisions.md` entry 20):** the operator wants to play
it **on their phone** as well as on a keyboard. The game's identity, in
their words: *"a fast pace, race to the top, shoot-em up."* Touch is a first-class
input; the old one-thumb scheme was judged "too wonky" and is being replaced.
Every lane checks its work at a phone viewport (landscape 844x390 and portrait
390x844, `hasTouch: true`) as well as desktop.

**Still binding from 2026-08-02:** durability outranks difficulty. A blank
page, a softlock, a lost save or a crash is a P1 defect. Assume a systematic,
curious player who backtracks, sequence-breaks and stresses the lifecycle on
purpose — "a player would never do that" is not a defence. Do not tune the
difficulty curve; report outcome *distributions* (entry 19), never one run.

## Working rules (all lanes)

- **Stay in your worktree.** Absolute paths only; never `cd` into the main
  checkout. Commit on your `task/<id>` branch. Never merge to main.
- **Respect lane fences.** Multiple lanes run concurrently. Your task block
  names your files. Touching another lane's file buys a merge conflict that
  costs more than your change saves. If your work genuinely needs a fenced
  file, **report what is needed and why — do not edit it.** A blocked item
  honestly reported is worth more than a conflict.
- **Never touch `SPRINT.md`, `CLAUDE.md`, or `README.md`** unless your task
  block explicitly assigns them. The integrator owns status lines.
- **Ports 8741 and 8742 belong to the operator.** Never bind, probe, or kill
  them. Pick another port, name it in your report, and kill it when done.
  Serve with `node tools/serve.mjs <port> --root <path> --quiet`. If your
  branch predates T-024, use the **main checkout's** copy of `serve.mjs`.
- **Never create accounts, enter credentials, or upload anything.** Those are
  the operator's, always.

## Hard rules that fail the gate

- **Layer purity.** `src/pure/` and `src/sim/` never reference THREE,
  `document`, or `window`, and never import upward. Sim↔render crossings go
  through `src/sim/bridge.js`.
- **Determinism.** Randomness only via seeded `src/pure/rng.js`. No
  `Math.random`, `Date.now`, or `performance.now` in `src/pure/` or `src/sim/`.
- **Palette.** Colors come from `src/render/palette.js` tokens. A raw hex
  literal in a tokenized render file is rejected by pathcheck.
- **Assets degrade safely** (entry 16 retired "asset independence"). Runtime
  sprites and textures are allowed. A missing or failed asset must degrade
  visibly and safely, never wedge the game, and the sim must never branch on
  whether an asset loaded.
- **No build step, no runtime dependencies.** Dev-only deps are allowed under
  `tools/*/` with their own `package.json`, never for the game.
- **Frozen constants.** Jump/movement constants in `CONFIG` are asserted. If
  one moves, that is a signal you have the wrong fix.
- **Static anatomy** (decisions entry 3) and the **frozen FAR camera**
  (entry 7) are law. `docs/decisions.md` verdicts are never re-litigated —
  propose a new decision instead.

## Bound is not visible (art lanes)

**2026-08-02.** The operator looked at the shipped build and said the thing
floating in the background had more detail than the thing in the foreground.
He was right, and four gate agents had passed the lane that caused it.

Every gate did its job. They verified the hull texture was **bound** — that the
maps reached the right material buckets, that a missing tile degraded safely,
that draw calls and frame time held. All true. **Nobody measured whether it was
visible.** It was delivering 0.24 luminance levels of surface detail against a
deck checker beside it delivering ~30. Present in the scene graph, absent to
the eye.

So: if your lane's output is meant to be *seen*, "it is wired in correctly" is
not evidence that it works. Measure the thing the operator would actually
notice:

    fine detail = mean |luminance(x) - luminance(x-1)| along rows,
                  over a band of the surface, at true on-screen size

Run it on your build **and on your own escape-hatch control** (`?tex=flat`,
`?backdrop=flat`, whatever yours is). If the two numbers are close, your
feature is invisible no matter how correctly it is bound, and reporting it as
done is reporting the wrong thing. Put both numbers in the report.

Two traps this one walked into, both worth knowing:

- **Normalizing a mean is not preserving a range.** Correcting an asset's
  average brightness with a multiply clips the highlights that carry its
  detail. Two separate lanes each reduced contrast for a good reason
  (fixing a darkening; painting a smoother tile) and the product had nothing
  left to see. Neither lane was wrong alone.
- **A tiled surface texture and a painted backdrop do not want the same
  qualities.** More colours and smoother gradients improved the backdrop and
  hurt the tile: what reads on a tiled surface is local contrast at the
  tiling frequency, not colour count.

## Evidence standard

**Read `decisions.md` entry 21 first (2026-10-22).** The operator: *"the
tests may be misleading or not valuable too, i had no idea what i was
doing."* The legacy pathcheck suite is unproven: a green gate is not
evidence that anything works or looks right. A legacy assertion that pins an
implementation detail (source text, an exact constant no decision protects, a
retired design) may be rewritten or deleted when it blocks a real improvement
— list each one with its reason in your report. Assertions guarding
player-observable behaviour or a hard rule (boot, page errors, determinism,
layer purity, reachability, softlocks, the movement envelope, frame budget,
safe asset degradation) are never weakened.

This project's signature failure is **an assertion whose subject is the
author's intent rather than the observable result** — a gate that reports green
while the thing it guards is broken (see I-019, I-031, and the four gate holes
fixed in T-025/T-026). Guard against it:

- **Prove a new assertion binds by breaking the thing it guards** and showing
  the gate go red, then restoring. Report what you broke and what printed. A
  green gate is not evidence that a gate works.
- **Assert against what a PLAYER can do**, with every verb on by default — not
  against authored geometry or intended routes.
- **Never invent a measurement.** Every number traces to a committed artifact,
  a real run, or the code, cited by path. Dropping an unsupported claim is a
  correct outcome.
- **Never inherit a measured number across a change that could move it.**
  Re-measure or annotate it as pre-change.
- **Leave the worktree clean.** After any break/restore, verify with
  `git status --short` and `git diff HEAD --stat`.

## Judging a diff (gate agents)

- `main` advances while you work, so a two-dot `git diff main..HEAD` shows
  **phantom hunks the branch did not author**. Judge authorship from
  `git show <commit>` or the three-dot `git diff main...HEAD`.
- **Compute the expected pathcheck count yourself** rather than trusting a
  number in the brief: run `node tools/pathcheck.mjs` in the worktree, and for
  the base run it against `git merge-base main HEAD` in a scratch copy. Branch
  bases differ by several dozen assertions depending on dispatch order.
- **Verify claims; do not inherit them.** Re-run what the report asserts. If a
  claim is not reproducible by you, say so plainly.

## Feel and look are not yours to judge

Machine gates never judge fun. The operator is the only oracle for look and
feel. Never declare work good-looking, fun, punchy, or better. Produce
measurements, captures, costs, and questions. Anything needing a feel verdict
goes to the operator with an **exact URL and 3–5 specific, non-leading
questions**.

## Filing issues

Do **not** assign your own `I-###` number — concurrent agents collide. Write
findings in your report under a `## PROPOSED INBOX ISSUES` heading using the
schema below with `I-???`; the integrator assigns numbers on triage.

```
## I-??? | bug|feel|fairness|art|docs | S1|S2|S3 | repro: <script + flags + commit> | evidence: <path>
one paragraph: what, why it matters, and what the fix direction is
```

Severity is judged by impact on a player playing a lot, on a phone or a
keyboard: a softlock or lost-progress bug is S1 even if an expert could avoid
it. Difficulty is not a
defect axis right now.
