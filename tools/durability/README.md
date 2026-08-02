# Durability harness (T-032)

Dev-only. Drives a real browser through the things a 9-year-old does to a
game and reports what the page did about each one. It touches nothing under
`src/`, ships with the repo only as a tool, and the game cannot tell it is
running.

```sh
node tools/durability/abuse.mjs                       # everything, ~4 minutes
node tools/durability/abuse.mjs --only boot,resize
node tools/durability/abuse.mjs --background-seconds 60 --json out.json
node tools/durability/abuse.mjs --headed               # watch it happen
```

`npm install` once in this directory (playwright-core only, no browser
download — it drives the installed system Chrome, the same channel
`tools/playtest` uses). If that install is missing, the harness falls back to
`tools/playtest/node_modules/playwright-core` and then to
`$HB_PLAYWRIGHT_CORE`.

**Ports.** 8741 and 8742 belong to the operator and this harness refuses to
bind them. It serves the tree under test on 8747 and a deliberately broken
copy of it on 8748 (`--port` / `--broken-port` to move them). A server that
cannot bind is fatal rather than silently testing whatever else is listening.

Screenshots land in `artifacts/t032-durability/`; `--json` writes the machine
-readable result.

## Scenarios

| name | what it drives | what would falsify it |
| --- | --- | --- |
| `boot` | a plain load | no boot signal, a panel on a healthy page, a dead heartbeat, anything thrown |
| `broken-import` | a copy of the tree with one module that will not parse | no panel (the 2026-08-02 incident: a black page and one console line) |
| `background` | the tab hidden for 60 s with a key held | the simulation catching up on the wall clock, RIG teleporting, a stuck key, a false "stuck" panel |
| `frozen-watchdog` | the frame loop silently unscheduled | no panel — a still picture at a live page |
| `resize` | 40 window sizes mid-play, including 320×200 | anything thrown, a non-finite position or edge |
| `pause-transitions` | pause at the title handoff, during a fixture retry, during a corner gate, and 100 toggles | anything thrown, a clock that keeps running while paused, a run stuck behind an invisible pause |
| `restart-spam` | 60 restarts as fast as the keyboard allows | anything thrown, a non-finite position |
| `key-mash` | 1000 random key events | anything thrown, a non-finite position, a fault |
| `stray-error` | 4 unrelated failures over 5 s | a panel — one blip must not cost a run |
| `error-storm` | a continuous storm of failures | no panel, or a panel that does not offer a way back |
| `frame-crash` | a throwing accessor on the live player row | no panel, or a loop that keeps grinding behind one |
| `context-lost` | `WEBGL_lose_context` | no panel — the canvas would simply stop changing |

## Honesty notes

- **The `background` scenario reproduces the browser's behaviour; it is not
  the browser doing it.** Measured here: headless Chrome keeps every tab
  visible (a second tab brought to the front left the game's page reporting
  `visibilityState: 'visible'` and still painting ~120 frames a second),
  `Page.setWebLifecycleState('frozen')` was accepted and changed nothing
  (7200 frames painted across a 60 s "suspension"), and
  `Emulation.setPageVisibilityOverride` no longer exists in the protocol. So
  the scenario performs the same sequence inside the page: `visibilityState`
  flips to hidden, `visibilitychange` fires, `requestAnimationFrame` stops
  being serviced for the whole minute, and the one frame that lands on return
  carries a timestamp a minute later. That is exactly what the dt clamp, the
  key release and the freeze watchdog have to survive — but a real laptop
  should still be alt-tabbed once by a person before anyone calls it proven.
- **`pause-transitions` does not reach the 1100 ms corner turn.** The policy
  here is deliberately stupid (hold right, auto-fire, hop) and a corner's yaw
  ritual only starts once its gate wave is dead. Measured over four 90-second
  runs it reaches the gate every time and never clears it, so the pause is
  taken during the gate phase — scroll halted, wave live, ritual armed — and
  a watcher stays armed for the turn in case the wave does die. Pausing
  *inside* the yaw snaps still needs `tools/playtest`'s real policy, or a
  person.
- **Injected failures are stated, not hidden.** `stray-error`,
  `error-storm`, `frame-crash`, `context-lost` and `broken-import` plant the
  failure they test and mark their own page errors as expected; every other
  scenario fails on any page error at all.
- **What none of this can catch:** a game that keeps running while quietly
  doing the wrong thing. Nothing throws, the loop keeps beating, and no
  watchdog fires. That is a playtest question, not a durability one.
- The harness reports SKIP, not PASS, when it could not create the condition
  a scenario is about.
