// server.mjs — tiny static file server for the repo root, so the harness can
// load index.html the same way a browser would over http:// (file:// breaks
// the three.js CDN import map's relative resolution in some engines, and
// module scripts are picky about file:// in general). No dependency beyond
// Node's own http/fs — this stays a dev-only zero-dependency detail.

import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

// Same no-cache contract as the repo's dev server (`tools/serve.mjs`, T-024):
// no-store, no validator emitted, so a browser can never run a stale module
// against fresh code. Every harness run launches a fresh Chrome profile today,
// so this is insurance rather than a live fix — but a `--base-url` run against
// a warm profile would otherwise be exposed, and a blank page reads as a
// `bootError` in the tree under test rather than as a caching artifact.
const NO_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

export function startStaticServer(rootDir, { port = 0 } = {}) {
  const server = http.createServer(async (req, res) => {
    // Drop conditional headers before anything else: this server never answers
    // 304, so a warm cache cannot win a revalidation.
    for (const h of ['if-modified-since', 'if-none-match', 'if-match', 'if-range']) delete req.headers[h];
    try {
      const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const rel = urlPath === '/' ? '/index.html' : urlPath;
      const full = normalize(join(rootDir, rel));
      if (!full.startsWith(normalize(rootDir) + sep) && full !== normalize(rootDir)) {
        res.writeHead(403, NO_CACHE); res.end('forbidden'); return;
      }
      const s = await stat(full);
      if (s.isDirectory()) { res.writeHead(404, NO_CACHE); res.end('not found'); return; }
      res.writeHead(200, { ...NO_CACHE, 'Content-Type': MIME[extname(full)] || 'application/octet-stream' });
      createReadStream(full).pipe(res);
    } catch (err) {
      res.writeHead(404, NO_CACHE); res.end('not found: ' + err.message);
    }
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}
