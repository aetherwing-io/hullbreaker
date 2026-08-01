// report.mjs — writes report.json (full machine-readable trace + metrics)
// and summary.md (short human-readable digest) into a run's output dir.

import { mkdir, writeFile } from 'node:fs/promises';

function fmtMs(ms) {
  if (ms === null || ms === undefined) return 'n/a';
  return (ms / 1000).toFixed(1) + 's';
}

function renderSummary(report) {
  const { meta, outcome, input, metrics } = report;
  const lines = [];
  lines.push(`# ${meta.scriptName} — playtest report`);
  lines.push('');
  lines.push(`- URL: \`${meta.url}\``);
  lines.push(`- Started: ${meta.startedAt}`);
  lines.push(`- Wall time: ${fmtMs(meta.wallTimeMs)}`);
  lines.push(`- Fidelity: **${metrics.fidelity}**${metrics.highFidelityDetected ? '' : ' (no `?testapi=1` / `window.HB` signal seen — degraded/DOM mode, see limitations)'}`);
  lines.push(`- Sampling: requested every ${meta.sampleIntervalRequestedMs}ms, achieved avg ${metrics.sampling.avgIntervalMs}ms / max ${metrics.sampling.maxIntervalMs}ms (${metrics.sampling.requestedCount} samples)`);
  lines.push('');
  lines.push('## Outcome');
  lines.push(`- Result: **${metrics.outcome.result}**`);
  lines.push(`- Attempts: ${metrics.outcome.attempts ?? 'n/a'}, falls (final attempt, only visible on victory): ${metrics.outcome.falls ?? 'n/a'}`);
  lines.push(`- Kills: ${metrics.finalKills ?? 'n/a'}, attempt-counter deaths (FIXTURE-ONLY, structurally 0 in the default run): ${metrics.deaths}, hits survived: ${metrics.hitsWithoutDeath}`);
  if (metrics.lives.unavailableReason) {
    lines.push(`- Stock lives (HUD \`×N\`): **unavailable** — ${metrics.lives.unavailableReason}`);
  } else {
    lines.push(`- Stock lives (HUD \`×N\` — the failure counter that works outside fixtures): ${metrics.lives.start} → ${metrics.lives.end}, **${metrics.lives.spent} spent**${metrics.lives.losses.length ? ` (at ${metrics.lives.losses.map((l) => `${fmtMs(l.gameMs)}${l.xBefore != null && l.x != null ? ` x ${l.xBefore}→${l.x}` : ''}`).join(', ')})` : ''}`);
  }
  const rr = report.retryReassertions || [];
  if ((metrics.outcome.attempts ?? 1) > 1) {
    lines.push(rr.length
      ? `- Retry key re-assertion: ${rr.length} retry transition(s) detected, held keys re-pressed within <=${report.retryDetection.maxLagMs}ms each time (script held: ${[...new Set(rr.flatMap((r) => r.codes))].join(', ') || 'none'}) — see README "Fixed: zombie attempts (F7)"`
      : '- Retry key re-assertion: multiple attempts observed but no held keys needed re-pressing (nothing was down at any retry instant)');
  }
  lines.push('');
  lines.push('## Pacing / fairness metrics');
  if (metrics.idleTime.unavailableReason) {
    lines.push(`- Idle time (A.5 \`stallMs\`, grounded && |vx|<2 && traversalState==='free'): **unavailable** — ${metrics.idleTime.unavailableReason}`);
  } else {
    lines.push(`- Idle time (A.5 \`stallMs\`): ${fmtMs(metrics.idleTime.idleTimeMs)} of ${fmtMs(metrics.idleTime.playingTimeMs)} PLAYING time (fraction ${metrics.idleTime.idleTimeFraction})`);
  }
  if (metrics.airborneTime.unavailableReason) {
    lines.push(`- Airborne time (\`airMs\`): **unavailable** — ${metrics.airborneTime.unavailableReason}`);
  } else {
    lines.push(`- Airborne time (\`airMs\`): ${fmtMs(metrics.airborneTime.airMs)}`);
  }
  lines.push(`- Closest approach to crush edge (\`minEdgeMargin\`): ${metrics.closestCrushApproachTiles ?? 'n/a'} tiles`);
  if (metrics.verticalRange.unavailableReason) {
    lines.push(`- Vertical range: **unavailable** — ${metrics.verticalRange.unavailableReason}`);
  } else {
    lines.push(`- Vertical range: y ${metrics.verticalRange.minY}–${metrics.verticalRange.maxY} (span ${metrics.verticalRange.span})`);
  }
  if (metrics.route.unavailableReason) {
    lines.push(`- Route coverage / inference: **unavailable** — ${metrics.route.unavailableReason}`);
  } else {
    lines.push(`- Route coverage (A.5 \`routeIds\`, >=3 connectors matched in order): **[${metrics.route.routeIds.join(', ') || 'none'}]**`);
    lines.push(`- Route inference (harness-only best guess): **${metrics.route.matchedRouteId}** (confidence ${metrics.route.confidence}, ${metrics.route.matchedConnectors.length} connectors matched)`);
  }
  if (metrics.jumpCounts.unavailableReason) {
    lines.push(`- Air jumps: **unavailable** — ${metrics.jumpCounts.unavailableReason}`);
  } else {
    lines.push(`- Air jumps: ${metrics.jumpCounts.finalAttemptAirJumps} final attempt (peak single attempt ${metrics.jumpCounts.peakSingleAttemptAirJumps}; resets every retry)`);
  }
  lines.push(`- Dare pocket: entered=${metrics.darePocket.entered} (${metrics.darePocket.enteredMethod ?? 'not observed'}), reward taken=${metrics.darePocket.rewardTaken}`);
  lines.push(`- Input density (A.5: deliberately NOT a score input): ${metrics.input.eventsPerSecond} events/sec (${metrics.input.totalEvents} total: ${metrics.input.keydownCount} down / ${metrics.input.keyupCount} up)`);
  if (metrics.protoScore.unavailableReason) {
    lines.push(`- protoScore (A.5 formula): **unavailable** — ${metrics.protoScore.unavailableReason}`);
  } else if (metrics.protoScore.source === 'HB.score') {
    lines.push(`- protoScore (A.5 formula, REAL — from the game's own event stream, ?score=1): **${metrics.protoScore.protoScore}** (airborne_kill=${metrics.score.counts.airborne_kill}, link=${metrics.score.counts.link}, airMs=${metrics.score.airMs}, stallMs=${metrics.score.stallMs})`);
  } else {
    lines.push(`- protoScore (A.5 formula, proxy airborneKills/links — see README): **${metrics.protoScore.protoScore}** (airborneKills=${metrics.airborneKills.airborneKills}, links≈${metrics.protoScore.linksApprox}, airMs=${metrics.airborneTime.airMs}, stallMs=${metrics.idleTime.idleTimeMs})`);
  }
  if (metrics.score) {
    lines.push(`- Score snapshot (final, tune=${metrics.score.tune}): CHARGE ${metrics.score.charge} (notch ${metrics.score.notch} ${metrics.score.notchName}), THREAT **${metrics.score.threat}** → ${metrics.score.classification}; counts ${JSON.stringify(metrics.score.counts)}; hot ${metrics.score.hotMs}ms of ${metrics.score.playMs}ms; setbacks ${metrics.score.setbacks}`);
  }
  lines.push('');
  if (report.consoleErrors.length || report.pageErrors.length) {
    lines.push('## Errors observed');
    for (const e of report.pageErrors) lines.push(`- [page error] ${e.message}`);
    for (const e of report.consoleErrors) lines.push(`- [console error] ${e.text}`);
    lines.push('');
  }
  if (report.meta.bootError) {
    lines.push(`## Boot failure\n${report.meta.bootError}\n`);
  }
  return lines.join('\n') + '\n';
}

export async function writeReport(outDir, report) {
  await mkdir(outDir, { recursive: true });
  await writeFile(`${outDir}/report.json`, JSON.stringify(report, null, 2));
  await writeFile(`${outDir}/summary.md`, renderSummary(report));
}
