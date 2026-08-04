# Hullbreaker resource/performance probes

Use the isolated owner for visual or performance automation:

```js
import { withIsolatedBrowser } from '../playtest/lib/isolated-browser.mjs';

await withIsolatedBrowser(repoRoot, async ({ baseUrl, newPage }) => {
  const owned = await newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await owned.page.goto(`${baseUrl}/index.html?testapi=1`);
  } finally {
    await owned.close();
  }
});
```

The wrapper owns one ephemeral in-process static server and one separate
headless Chrome. It reuses that browser across variants, creates fresh
incognito contexts, and closes contexts/browser/server on success, failure,
or an ordinary termination signal. It never connects to the Chrome extension,
in-app Browser, a CDP debugging port, or the operator's visible Chrome profile.

Rules for parallel lanes:

- Do not use the browser-control plugins for repetitive captures. They are for
  interactive review and can leave a fixture in the operator's visible tab.
- Do not launch one browser per screenshot. Reuse the wrapper's browser and
  use one fresh context per independent measurement.
- Prefer its ephemeral server to `node tools/serve.mjs ... &`. If a manual
  quiet server is necessary, it now exits when its launcher dies; use
  `--keep-orphan` only for an intentionally persistent listener.
- Always stop page-side stress loops before closing their context.

Run the current ceiling proof with:

```sh
node tools/perf/resource-stress.mjs
node tools/perf/capture-isolation-contract.mjs
```

It measures desktop Retina and compact portrait profiles under 256 live
projectiles. `legacy` is the exact previous DPR expression selected with
`?renderbudget=legacy`; `bounded` is the shipped policy. Evidence is written
to `/private/tmp/hullbreaker-resource-stress/result.json` by default.
