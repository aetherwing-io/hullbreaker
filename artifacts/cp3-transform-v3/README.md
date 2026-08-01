# CP3 v3 — transform slice under the static-anatomy rule (T-001)

Evidence pack for the CP3 second-pass rework: flip and breach as RIG
ascending around a monstrous, prebuilt body (`decisions.md` entry 3; G2/G4
in `docs/proposals/2026-07-meridian-monster-greybox-map.md` are the target
shape).

**URL for judgment:** `http://127.0.0.1:8741/index.html?slice=transform`
(serve with `python3 -m http.server 8741` from the repo root; add
`&enemies=0` to watch choreography without wasps, `&view=near` for the
pre-view-scale framing).

## What changed since the judged v2 frames

- The access plate now finishes its swing ON the camera's detents and
  **relocks flush against the interior wall during the ratchet hold** (the
  G2 beat: snap 1 exposes and carries the plate, the hold relocks it, snap
  2 commits only the camera). It stays in the world afterwards as interior
  dressing — v2 deleted it when the ritual ended.
- The vent cover is **no longer blown into nine tumbling debris pieces**.
  It is a hinged cover blown open past its stop and caught there, one
  motion landing exactly on the first detent, hanging open afterwards. A
  pressure-vapor burst (atmosphere, deterministic) peaks on the detent and
  fully clears before snap 2 commits the camera — the G4 reveal beat.
- The slice's per-band fog now shifts with the camera pull-back (the same
  depth-delta rule every other mode already applies), so the prebuilt
  interior actually READS at the shipped `?view=far` default instead of
  compressing into a void. `?view=near` at 16:9 is unchanged (shift 0).
- Nothing else moves: bands are boot-baked, the camera yaw is the only
  animated world quantity, the sim is untouched (see `equivalence.md`).

## Frames

Keyed on the ritual's telemetry clock; exact `tMs` per frame in
`index.json`. `00`–`05` approach → flip (ajar, windup, snap-1 clack,
relocked hold, snap-2 commit); `06`–`07` prebuilt interior climb at the
far default; `08`–`12` breach (shut vent, strain, blow + vapor peak,
clearing hold, committed altitude); `13`–`14` high face run and BREACH
CLEAR. `run-transform-slice.webm` is the same deterministic script
end-to-end.

Operator questions travel with the task report / SPRINT checkpoint queue.
