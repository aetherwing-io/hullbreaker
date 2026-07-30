/* ============================== FLOW ============================== */
/* MOMENTUM SPINE — the pure half of the ?flow=1 prototype.

   The surge pace proved that chained launches are worth testing as a core
   mechanic rather than one variant's override (docs/FLEET-PLAN.md, wave 3).
   This module generalizes that idea so it composes with ANY pace, and adds
   the piece surge was missing: surge amplified the launch *instant*, but the
   controller's horizontal drive pulled the extra speed back out inside ~30 ms
   (approach() targets runSpeed every frame). Here a live chain raises the
   drive's target as well, so momentum is something you keep while you keep
   chaining, and lose on the floor.

   Four rules, all asserted in tools/pathcheck.mjs:
     1. Links come only from CONTACT launches (ledge / wall / hook). An air
        jump neither builds nor breaks a chain, so mashing jump pays nothing.
     2. A chain expires after windowMs airborne without a new contact — a long
        fall is not a chain.
     3. Ground contact decays it QUICKLY BUT NOT INSTANTLY: a bounce through
        the floor inside groundGraceMs keeps everything; standing there sheds
        one link per groundDecayMs.
     4. The composed amplification (a pace's own chain × flow's) is hard-capped
        by maxTotalMult, which is what keeps every attainable speed inside the
        dt-clamp displacement budget.                                       */

export function flowClampLinks(links, cfg) {
  return Math.max(0, Math.min(cfg.max, links));
}

// The chain's own multiplier: 1 at rest, +step per link.
export function flowMult(links, cfg) {
  if (!cfg) return 1;
  return 1 + cfg.step * flowClampLinks(links, cfg);
}

// Composed with whatever the active pace already does to a launch, capped.
export function flowCompose(paceMult, links, cfg) {
  if (!cfg) return paceMult;
  return Math.min(cfg.maxTotalMult, (paceMult || 1) * flowMult(links, cfg));
}

/* The same composition, expressed as a multiplier that cannot put `baseVx` past
   cfg.launchCeiling. A launch preserves the speed it arrived with (ledge, wall
   and hook launches all do), so amplifying it compounds across a chain; the
   ceiling is what the endpoint-only wall check in sim/player.js relies on. With
   no cfg this returns paceMult untouched, which is why a flags-off run is
   bit-identical.                                                            */
export function flowLaunchMultFor(paceMult, links, cfg, baseVx) {
  if (!cfg) return paceMult;
  const composed = flowCompose(paceMult, links, cfg);
  const speed = Math.abs(baseVx || 0);
  if (speed <= 1e-9) return composed;
  return Math.min(composed, cfg.launchCeiling / speed);
}

// Sustained top speed while the chain lives. Capped separately so a retune of
// launch amplification cannot silently raise run speed past its own budget.
export function flowSpeedMult(links, cfg) {
  if (!cfg) return 1;
  return Math.min(cfg.speedMultCap, flowMult(links, cfg));
}

export function flowFreshState() {
  return { links: 0, expiresAt: 0, groundedMs: 0, decayAcc: 0 };
}

// A contact launch: one link, window refreshed, ground timers cleared.
export function flowAddLink(st, now, cfg) {
  return {
    links: flowClampLinks(st.links + 1, cfg),
    expiresAt: now + cfg.windowMs,
    groundedMs: 0,
    decayAcc: 0,
  };
}

/* One frame of decay. ctx = { dtMs, grounded, now }. Pure in, pure out, so the
   harness can assert the whole curve without stepping the simulation.      */
export function flowStepState(st, ctx, cfg) {
  if (!cfg || st.links <= 0) {
    return { links: 0, expiresAt: st.expiresAt, groundedMs: 0, decayAcc: 0 };
  }
  if (!ctx.grounded) {
    if (ctx.now > st.expiresAt) return flowFreshState();
    return { links: st.links, expiresAt: st.expiresAt, groundedMs: 0, decayAcc: 0 };
  }
  const groundedMs = st.groundedMs + ctx.dtMs;
  if (groundedMs <= cfg.groundGraceMs) {
    return { links: st.links, expiresAt: st.expiresAt, groundedMs, decayAcc: 0 };
  }
  let links = st.links;
  let decayAcc = st.decayAcc + (st.groundedMs > cfg.groundGraceMs
    ? ctx.dtMs
    : groundedMs - cfg.groundGraceMs);
  while (decayAcc >= cfg.groundDecayMs && links > 0) {
    decayAcc -= cfg.groundDecayMs;
    links--;
  }
  if (links <= 0) return { links: 0, expiresAt: st.expiresAt, groundedMs, decayAcc: 0 };
  return { links, expiresAt: st.expiresAt, groundedMs, decayAcc };
}

// How long a full chain survives standing still — the operator-facing number
// behind "quickly but not instantly".
export function flowGroundLifetimeMs(links, cfg) {
  return cfg.groundGraceMs + flowClampLinks(links, cfg) * cfg.groundDecayMs;
}
