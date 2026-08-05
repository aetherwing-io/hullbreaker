/* Frame-cadence policy only. Rendering owns the quality changes; this state
 * machine decides when sustained misses justify the next rung and when a
 * much longer stable window earns one rung back. One hitch cannot degrade a
 * run, and the asymmetric windows prevent visible resolution pumping. */

export const ADAPTIVE_FIDELITY_TUNE = Object.freeze({
  warmupFrames: 120,
  batchFrames: 120,
  badBatchesRequired: 2,
  goodBatchesRequired: 6,
  avgBudgetMs: 19.5,
  slowFrameMs: 24,
  slowShare: 0.20,
  goodAvgMs: 17.0,
  goodSlowShare: 0.02,
  maxLevel: 3,
});

export function createAdaptiveFidelityController(tune = ADAPTIVE_FIDELITY_TUNE) {
  let warmup = 0, samples = 0, sum = 0, worst = 0, slow = 0;
  let badBatches = 0, goodBatches = 0, batches = 0, level = 0, last = null;
  const clearBatch = () => { samples = 0; sum = 0; worst = 0; slow = 0; };

  return Object.freeze({
    sample(frameMs) {
      if (!Number.isFinite(frameMs) || frameMs <= 0) return null;
      if (warmup < tune.warmupFrames) { warmup++; return null; }
      samples++;
      sum += frameMs;
      if (frameMs > worst) worst = frameMs;
      if (frameMs >= tune.slowFrameMs) slow++;
      if (samples < tune.batchFrames) return null;

      batches++;
      const avgMs = sum / samples;
      const slowFraction = slow / samples;
      const bad = avgMs >= tune.avgBudgetMs || slowFraction >= tune.slowShare;
      const good = avgMs <= tune.goodAvgMs && slowFraction <= tune.goodSlowShare;
      badBatches = bad ? badBatches + 1 : 0;
      goodBatches = good ? goodBatches + 1 : 0;
      const reading = { avgMs, worstMs: worst, slowFraction, batches };
      clearBatch();
      let direction = null;
      if (bad && badBatches >= tune.badBatchesRequired && level < tune.maxLevel) {
        level++;
        direction = 'down';
      } else if (good && goodBatches >= tune.goodBatchesRequired && level > 0) {
        level--;
        direction = 'up';
      }
      if (!direction) return null;
      badBatches = 0;
      goodBatches = 0;
      last = Object.freeze({
        level,
        direction,
        avgMs: Number(reading.avgMs.toFixed(2)),
        worstMs: Number(reading.worstMs.toFixed(2)),
        slowShare: Number(reading.slowFraction.toFixed(3)),
        batch: reading.batches,
      });
      return last;
    },
    snapshot() {
      return { level, warmup, batches, badBatches, goodBatches,
        pendingFrames: samples, last };
    },
  });
}
