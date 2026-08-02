# Lane brief — standing rules for every dispatched agent

**Read this first, then your task block.** It exists so dispatch prompts carry
only what is specific to your task; everything an agent needs *every* time lives
here. If this file and your task block disagree, the task block wins for scope
and this file wins for rules.

Written 2026-08-02, after a session where the integrator hand-wrote the same
fences into eight consecutive dispatch prompts and got one of them wrong.

## Who the game is for

Read the `2026-08-02 OPERATOR GOAL CHANGE` block in `SPRINT.md`. Short version:
the player is the operator's **9-year-old son**, on a laptop keyboard, reached
by a public URL. He plays a lot of games and probes systematically — he is not
a button-masher, and "a player would never do that" is not a defence.

**Durability outranks difficulty.** He is fine with hard. He is not fine with
broken. Do not tune the difficulty curve. A blank page, a softlock, a lost save
or a crash is a P1 defect.

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
- **Asset independence.** The game must boot with every file under `assets/`
  missing. Nothing in `src/` loads a file at runtime. A runtime loader needs a
  recorded operator decision first.
- **No build step, no runtime dependencies.** Dev-only deps are allowed under
  `tools/*/` with their own `package.json`, never for the game.
- **Frozen constants.** Jump/movement constants in `CONFIG` are asserted. If
  one moves, that is a signal you have the wrong fix.
- **Static anatomy** (decisions entry 3) and the **frozen FAR camera**
  (entry 7) are law. `docs/decisions.md` verdicts are never re-litigated —
  propose a new decision instead.

## Evidence standard

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

Severity is judged by impact on a 9-year-old playing a lot: a softlock or
lost-progress bug is S1 even if an expert could avoid it. Difficulty is not a
defect axis right now.
