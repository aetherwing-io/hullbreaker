// One resource owner for short-lived visual/performance probes.
//
// This launches a separate HEADLESS Chrome process with fresh incognito
// contexts. It never connects to the Chrome extension, the in-app browser, a
// debugging port, or the operator's profile, so a capture cannot navigate a
// visible tab. One browser and one ephemeral in-process server are reused for
// every viewport/variant in a probe, then closed in a single finally block.

import { launchBrowser } from '../../assets/lib/browser.mjs';
import { startStaticServer } from './server.mjs';

export async function withIsolatedBrowser(rootDir, run, {
  channel = 'chrome',
} = {}) {
  let server = null;
  let browser = null;
  let launch = null;
  let cleanupPromise = null;
  const contexts = new Set();

  const cleanup = () => {
    if (cleanupPromise) return cleanupPromise;
    cleanupPromise = (async () => {
      for (const context of contexts) {
        try { await context.close(); } catch { /* browser may already be gone */ }
      }
      contexts.clear();
      if (browser) {
        try { await browser.close(); } catch { /* process may already be gone */ }
      }
      if (server) {
        try { await server.close(); } catch { /* listener may already be gone */ }
      }
    })();
    return cleanupPromise;
  };

  const onSignal = (code) => { cleanup().finally(() => { process.exitCode = code; }); };
  const onSigint = () => onSignal(130);
  const onSigterm = () => onSignal(143);
  const onSighup = () => onSignal(129);

  try {
    server = await startStaticServer(rootDir, { port: 0 });
    launch = await launchBrowser({ channel, headed: false });
    ({ browser } = launch);
    process.once('SIGINT', onSigint);
    process.once('SIGTERM', onSigterm);
    process.once('SIGHUP', onSighup);

    const newPage = async (options = {}) => {
      const context = await browser.newContext(options);
      contexts.add(context);
      const page = await context.newPage();
      return {
        page,
        context,
        close: async () => {
          contexts.delete(context);
          await context.close();
        },
      };
    };

    return await run({
      baseUrl: server.baseUrl.replace(/\/$/, ''),
      browser,
      launch: { channel: launch.channel, via: launch.via, source: launch.source },
      newPage,
    });
  } finally {
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);
    process.removeListener('SIGHUP', onSighup);
    await cleanup();
  }
}
