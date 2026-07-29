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
  lines.push(`- Fidelity: **${metrics.fidelity}**${metrics.hbDetected ? '' : ' (no `window.HB` — degraded/DOM mode, see limitations)'}`);
  lines.push(`- Sampling: requested every ${meta.sampleIntervalRequestedMs}ms, achieved avg ${metrics.sampling.avgIntervalMs}ms / max ${metrics.sampling.maxIntervalMs}ms (${metrics.sampling.requestedCount} samples)`);
  lines.push('');
  lines.push('## Outcome');
  lines.push(`- Result: **${metrics.outcome.result}**`);
  lines.push(`- Attempts: ${metrics.outcome.attempts ?? 'n/a'}, falls (final attempt, only visible on victory): ${metrics.outcome.falls ?? 'n/a'}`);
  lines.push(`- Kills: ${metrics.finalKills ?? 'n/a'}, deaths observed: ${metrics.deaths}, hits survived: ${metrics.hitsWithoutDeath}`);
  lines.push('');
  lines.push('## Pacing / fairness metrics');
  if (metrics.idleTime.unavailableReason) {
    lines.push(`- Idle time: **unavailable** — ${metrics.idleTime.unavailableReason}`);
  } else {
    lines.push(`- Idle time: ${fmtMs(metrics.idleTime.idleTimeMs)} of ${fmtMs(metrics.idleTime.playingTimeMs)} PLAYING time (fraction ${metrics.idleTime.idleTimeFraction})`);
  }
  lines.push(`- Closest approach to crush edge: ${metrics.closestCrushApproachTiles ?? 'n/a'} tiles`);
  if (metrics.verticalRange.unavailableReason) {
    lines.push(`- Vertical range: **unavailable** — ${metrics.verticalRange.unavailableReason}`);
  } else {
    lines.push(`- Vertical range: y ${metrics.verticalRange.minY}–${metrics.verticalRange.maxY} (span ${metrics.verticalRange.span})`);
  }
  if (metrics.route.unavailableReason) {
    lines.push(`- Route inference: **unavailable** — ${metrics.route.unavailableReason}`);
  } else {
    lines.push(`- Route inference: best match **${metrics.route.matchedRouteId}** (confidence ${metrics.route.confidence}, ${metrics.route.matchedConnectors.length} connectors matched)`);
  }
  if (metrics.jumpCounts.unavailableReason) {
    lines.push(`- Air jumps: **unavailable** — ${metrics.jumpCounts.unavailableReason}`);
  } else {
    lines.push(`- Air jumps: ${metrics.jumpCounts.finalAttemptAirJumps} final attempt (peak single attempt ${metrics.jumpCounts.peakSingleAttemptAirJumps}; resets every retry)`);
  }
  lines.push(`- Dare pocket: entered=${metrics.darePocket.entered} (${metrics.darePocket.enteredMethod ?? 'not observed'}), reward taken=${metrics.darePocket.rewardTaken}`);
  lines.push(`- Input density: ${metrics.input.eventsPerSecond} events/sec (${metrics.input.totalEvents} total: ${metrics.input.keydownCount} down / ${metrics.input.keyupCount} up)`);
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
