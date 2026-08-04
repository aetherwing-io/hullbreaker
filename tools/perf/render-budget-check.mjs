#!/usr/bin/env node
// Cheap deterministic proof for the drawing-buffer ceiling and composer MSAA
// policy. No browser, server, GPU, capture, or background process is created.

import assert from 'node:assert/strict';
import { POST_TUNE } from '../../src/config.js';
import {
  POST_MSAA_PIXEL_CEILING, resolveRuntimeSamples,
} from '../../src/pure/post.js';
import {
  RENDER_PIXEL_BUDGET, renderPixelBudget, resolveRenderPixelRatio,
} from '../../src/pure/render-budget.js';

const EPSILON = 1e-6;

function reading(width, height, dpr, budgeted = true) {
  const ratio = resolveRenderPixelRatio(dpr, width, height, budgeted);
  return { width, height, dpr, ratio, pixels: width * height * ratio * ratio };
}

const portrait = reading(390, 844, 3);
const ordinaryDesktop = reading(1440, 900, 2);
const retina1080 = reading(1920, 1080, 2);
const largeDesktop = reading(2560, 1600, 2);
const giantCssDisplay = reading(5120, 2880, 2);

assert.equal(portrait.ratio, 2.2, 'compact portrait keeps its authored 2.2x quality');
assert.equal(
  portrait.ratio,
  reading(390, 844, 3, false).ratio,
  'ordinary portrait is byte-for-byte unchanged from legacy',
);
assert.equal(ordinaryDesktop.ratio, 2.25, 'ordinary desktop keeps its 2.25x quality');

for (const profile of [portrait, ordinaryDesktop, retina1080, largeDesktop, giantCssDisplay]) {
  const budget = renderPixelBudget(profile.width, profile.height);
  assert.ok(
    profile.pixels <= budget + EPSILON,
    `${profile.width}x${profile.height}@${profile.dpr} exceeds ${budget} drawing pixels`,
  );
}

const expected1080Ratio = Math.sqrt(
  RENDER_PIXEL_BUDGET.desktop / (1920 * 1080),
);
assert.ok(Math.abs(retina1080.ratio - expected1080Ratio) < Number.EPSILON * 8,
  '1920x1080@2 binds exactly to the desktop budget ratio');
assert.ok(Math.abs(retina1080.pixels - RENDER_PIXEL_BUDGET.desktop) < EPSILON,
  '1920x1080@2 resolves to exactly 6.6M drawing pixels');

const expectedLargeRatio = Math.sqrt(
  RENDER_PIXEL_BUDGET.desktop / (2560 * 1600),
);
assert.ok(Math.abs(largeDesktop.ratio - expectedLargeRatio) < Number.EPSILON * 8,
  '2560x1600@2 binds exactly to the desktop budget ratio');
assert.ok(largeDesktop.ratio < 1.65,
  '2560x1600@2 cannot retain the former floor that broke the hard cap');
assert.ok(Math.abs(largeDesktop.pixels - RENDER_PIXEL_BUDGET.desktop) < EPSILON,
  '2560x1600@2 resolves to exactly 6.6M drawing pixels');
assert.ok(giantCssDisplay.ratio < 1,
  'an exceptionally large CSS display may step below 1x to keep the cap honest');

const legacyLarge = reading(2560, 1600, 2, false);
assert.equal(legacyLarge.ratio, 2,
  'the legacy measurement escape hatch preserves the former native-DPR ordering');
assert.ok(legacyLarge.pixels > RENDER_PIXEL_BUDGET.desktop,
  'the legacy fixture still demonstrates the defect production removes');

assert.equal(resolveRuntimeSamples(null, POST_TUNE, POST_MSAA_PIXEL_CEILING), 2,
  'default composer MSAA remains on at the documented ceiling');
assert.equal(resolveRuntimeSamples(null, POST_TUNE, POST_MSAA_PIXEL_CEILING + 1), 0,
  'default composer MSAA stands down only above the high-load threshold');
assert.equal(resolveRuntimeSamples('junk', POST_TUNE, RENDER_PIXEL_BUDGET.desktop), 0,
  'junk is still default policy, including its high-load adaptation');
assert.equal(resolveRuntimeSamples('2', POST_TUNE, RENDER_PIXEL_BUDGET.desktop), 2,
  'an explicit ?aa=2 measurement override remains authoritative');
assert.equal(resolveRuntimeSamples('0', POST_TUNE, 1), 0,
  'an explicit ?aa=0 remains authoritative on a small buffer');

console.log(JSON.stringify({
  ok: true,
  budgets: RENDER_PIXEL_BUDGET,
  msaaPixelCeiling: POST_MSAA_PIXEL_CEILING,
  profiles: { portrait, ordinaryDesktop, retina1080, largeDesktop, giantCssDisplay },
}, null, 2));
