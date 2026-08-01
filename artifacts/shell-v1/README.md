# Game shell v1 (T-013) — start screen, pause/options, death + run stats

Evidence pack for the front end: a start screen built as a **composition
study of concept board 05**, a pause/options panel, the death/restart flow,
and an end-of-run stats screen fed from telemetry the game already keeps.

**URLs for judgment** (serve with `python3 -m http.server 8741` from the repo
root):

| What | URL |
| --- | --- |
| Start screen, canon default (board 05 middle, "The Ship Wakes") | `index.html` |
| The other two directions | `index.html?title=climb` · `index.html?title=crown` |
| Switch live, without reloading | press `1` / `2` / `3` on the start screen |
| Pause / options | any run, then `P` or `Esc` |
| Death → stats → restart | `index.html`, stand still ~21 s (the crush edge spends all three lives), then `R` (restart) or `Q` (start screen) |
| Victory stats | `index.html?slice=transform&enemies=0` and finish the breach |
| Pre-shell boot, unchanged | `index.html?shell=0` |

## Frames

| File | What it shows |
| --- | --- |
| `title-wake.png` | direction 2 — "The Ship Wakes" (shipped default): the hull plate hinged out of the body, RIG running *along* it at human scale (3.8% declared, 4.54% of frame height as rendered on the 37° plate) with the muzzle flash off his barrel, acid-lit interior below, magenta service lamps in the mass |
| `title-climb.png` | direction 1 — "The Impossible Climb": one unbroken hull face running off frame, catwalks for scale, cloud layers, the settlement lost in fog, the Crown's beacon far above |
| `title-crown.png` | direction 3 — "Scuttle the Crown": the Crown complex lit from inside, transmitter firing, hull thrown clear, the approach gantry underneath |
| `title-narrow.png` | the default direction at 480×780 — the composition and the title space at a phone-ish aspect |
| `pause-options.png` | the pause/options panel (keys, mode, and the flags that need a reload) |
| `gameover-stats.png` | `SIGNAL LOST` with the run-stats panel (time, distance, kills, shots, deaths, falls, air jumps) |
| `victory-stats-transform.png` | `BREACH CLEAR` with the transform-mode stat set (altitude climbed, turns taken) |

The four title frames are captured at 1280×800 (480×780 for the narrow one)
with `prefers-reduced-motion: reduce`, so the vapour drift, the "PRESS ANY
KEY" pulse and the muzzle-flash blink are frozen rather than caught at a
random phase — a live screen animates all three.

## Contracts this pack is also evidence for

- **The overlay text is unchanged.** Every outcome title (`SIGNAL LOST`,
  `TRAVERSAL CLEAR`, `BREACH CLEAR`, `SECTOR CLEAR`, `PAUSED`, `ROUTE
  LOST`) and its body lines are byte-identical to the pre-shell build — the
  stats panel is an added sibling above them, so
  `tools/playtest/lib/sampler.mjs` classifies outcomes exactly as before.
  Both `gameover-stats.png` and `victory-stats-transform.png` show the old
  lines still under the new panel.
- **No image assets.** Every mark in these three compositions is a
  flat-shaded box, a CSS gradient or one clip-path silhouette; pathcheck
  asserts that `index.html`, `src/ui/shell.js` and `src/pure/shell.js`
  reference no `url(...)`, `<img>`, `.png`, `.jpg` or `.svg`.
- **Board 13's scale rule holds on the title too.** RIG is declared at 3.8%
  of frame height in all three directions (the concept-art range is 3–5%).
  Two gates, because a data check cannot see a screen: `tools/pathcheck.mjs`
  asserts the composition data in `src/pure/shell.js`, and `?selftest=1`
  measures the *rendered* figure on every direction — its own rotation
  (zero: it stands at its surface's angle, not at twice it) and its box
  against the 3–5% band. Rendered heights in these frames: 4.54% (wake, on
  the 37° plate), 3.90% (climb), 3.80% (crown).
- **The static-anatomy rule (decisions.md entry 3) applies here as well.**
  Nothing on the start screen assembles: the plate is already hinged open
  when we arrive, and the only motion is light, vapour and haze.

## Open question for the operator

Which board-05 direction should be canon? The middle one ships as the
default because the concept-art README calls it the most game-specific, not
because it won anything — no direction has been judged. See the T-013
report's feel questions.
