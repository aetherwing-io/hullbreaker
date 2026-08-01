// browser.mjs — the one place that knows how to get a Chrome.
//
// This pipeline does not own a browser dependency. `tools/playtest/` already
// vendors `playwright-core` and already drives the *installed system Chrome*
// over CDP (`channel: 'chrome'`, no bundled-binary download — see that tool's
// README for why that choice was made for this environment). Rasterizing an SVG
// and screenshotting a viewer page need exactly the same thing, so this module
// borrows that install rather than starting a second dependency tree that would
// then have to be kept in step with it.
//
// Resolution order, first hit wins:
//   1. tools/assets/node_modules  — only if someone ran `npm install` here
//   2. tools/playtest/node_modules — the expected path
//   3. a hard error naming the exact command to fix it
//
// The static file server is imported straight from `tools/playtest/lib/`
// (zero-dependency, Node http only) instead of being copied, so a fix there is
// a fix here.

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ASSETS_DIR = resolve(HERE, '..');
export const REPO_ROOT = resolve(HERE, '../../..');
export const PLAYTEST_DIR = join(REPO_ROOT, 'tools', 'playtest');

export { startStaticServer } from '../../playtest/lib/server.mjs';

let cached = null;

/** -> { chromium, source } — `source` is the path the module was loaded from. */
export async function loadPlaywright() {
  if (cached) return cached;
  const candidates = [
    { from: join(ASSETS_DIR, 'package.json'), label: 'tools/assets/node_modules' },
    { from: join(PLAYTEST_DIR, 'package.json'), label: 'tools/playtest/node_modules' },
  ];
  const tried = [];
  for (const c of candidates) {
    if (!existsSync(c.from)) { tried.push(`${c.label} (no package.json)`); continue; }
    try {
      const req = createRequire(c.from);
      const entry = req.resolve('playwright-core');
      const mod = await import(pathToFileURL(entry).href);
      // playwright-core is CommonJS: under ESM interop its exports arrive on
      // `default`, and reading `mod.chromium` alone silently yields undefined.
      const chromium = mod.chromium ?? mod.default?.chromium;
      if (!chromium) { tried.push(`${c.label} (resolved but exposes no chromium)`); continue; }
      cached = { chromium, source: entry, via: c.label };
      return cached;
    } catch (err) {
      tried.push(`${c.label} (${err.code || err.message})`);
    }
  }
  throw new Error(
    'playwright-core not found — the rasterizer and viewer need a browser.\n' +
    `  tried: ${tried.join('; ')}\n` +
    '  fix:   cd tools/playtest && npm install     (shared install, preferred)\n' +
    '  note:  node tools/assets/check.mjs needs none of this and still runs.'
  );
}

/**
 * Launch the same browser the playtest harness uses.
 * `channel: 'chrome'` drives installed system Chrome; `--channel chromium`
 * (after `npx playwright install chromium`) is the fallback for a machine
 * without it, matching the playtest harness's flag.
 */
export async function launchBrowser({ channel = 'chrome', headed = false } = {}) {
  const { chromium, via, source } = await loadPlaywright();
  try {
    const browser = await chromium.launch({ channel, headless: !headed });
    return { browser, via, source, channel };
  } catch (err) {
    throw new Error(
      `could not launch Chrome (channel: '${channel}'): ${err.message}\n` +
      "  on a machine without system Chrome: npx playwright install chromium, then pass --channel chromium"
    );
  }
}
