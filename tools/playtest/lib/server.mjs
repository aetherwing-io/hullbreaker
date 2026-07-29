// server.mjs — tiny static file server for the repo root, so the harness can
// load index.html the same way a browser would over http:// (file:// breaks
// the three.js CDN import map's relative resolution in some engines, and
// module scripts are picky about file:// in general). No dependency beyond
// Node's own http/fs — this stays a dev-only zero-dependency detail.

import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

export function startStaticServer(rootDir, { port = 0 } = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const rel = urlPath === '/' ? '/index.html' : urlPath;
      const full = normalize(join(rootDir, rel));
      if (!full.startsWith(normalize(rootDir) + sep) && full !== normalize(rootDir)) {
        res.writeHead(403); res.end('forbidden'); return;
      }
      const s = await stat(full);
      if (s.isDirectory()) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[extname(full)] || 'application/octet-stream' });
      createReadStream(full).pipe(res);
    } catch (err) {
      res.writeHead(404); res.end('not found: ' + err.message);
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
