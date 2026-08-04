#!/usr/bin/env node
// serve.mjs — HULLBREAKER's dev server. Static files from the repo root, with
// caching switched off hard.
//
// WHY THIS EXISTS. `python3 -m http.server` sends no `Cache-Control` at all,
// which lets Chrome apply its heuristic freshness rule (roughly a tenth of the
// file's age since Last-Modified) and reuse `src/*.js` from disk without
// asking. On 2026-08-02 that served the operator a pre-T-022 `src/sim/pace.js`
// alongside a post-T-022 `src/sim/level.js` that imports `momentumScrollSpeed`
// from it. One failed ES-module import kills the whole graph, so the page
// rendered blank on a tree where pathcheck was 1674/0 and the selftest was
// 29/29. There is no partial failure mode to notice: modules are all-or-nothing.
//
// So every response here carries `no-store`, no validator is ever emitted
// (`ETag`/`Last-Modified` are deliberately absent), and any conditional request
// headers a warm cache sends are dropped on arrival — this server never answers
// 304, so a stale copy can never win. Zero dependencies, no build step, and it
// touches nothing under `src/`.
//
// Usage:
//   node tools/serve.mjs                 # repo root on 8741, dual-stack
//   node tools/serve.mjs 8749            # another port (gate pins, captures)
//   node tools/serve.mjs --root /tmp/hb-pin --port 8749
//   node tools/serve.mjs --host 127.0.0.1    # IPv4 only, if you need it
//   node tools/serve.mjs --quiet         # no request logs; exits if its launcher dies
//   node tools/serve.mjs --quiet --keep-orphan # explicit persistent quiet server
//   node tools/serve.mjs --selftest      # prove the no-cache contract, exit 0/1
//
// The default root is the repo this file lives in, resolved from the script
// path rather than the cwd, so serving a pinned worktree is just running that
// worktree's copy: `node <worktree>/tools/serve.mjs 8749`.

import http from 'node:http';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEFAULT_PORT = 8741;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

// Sent on EVERY response, including 403/404 — a cached error would be just as
// confusing as a cached module. `no-store` alone is the load-bearing one; the
// other three are belt-and-braces for older/proxy behavior.
const NO_CACHE_HEADERS = Object.freeze({
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
});

// Conditional-request headers a warm cache sends. We delete them before doing
// anything else so no code path downstream can be tempted into a 304.
const CONDITIONAL_HEADERS = [
  'if-modified-since',
  'if-none-match',
  'if-match',
  'if-unmodified-since',
  'if-range',
];

function contentType(path) {
  return MIME[extname(path).toLowerCase()] || 'application/octet-stream';
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function head(res, status, headers = {}) {
  res.writeHead(status, { ...NO_CACHE_HEADERS, ...headers });
}

function plain(res, status, body, method) {
  const buf = Buffer.from(body + '\n', 'utf8');
  head(res, status, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': buf.length });
  res.end(method === 'HEAD' ? undefined : buf);
  return status;
}

// Single-range only (`bytes=a-b`, `bytes=a-`, `bytes=-n`). Chrome asks for one
// range when scrubbing a .webm capture from tools/playtest/reports; multi-range
// is not worth the complexity here and falls back to a full 200.
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec((header || '').trim());
  if (!m) return null;
  const [, rawStart, rawEnd] = m;
  if (rawStart === '' && rawEnd === '') return null;
  let start;
  let end;
  if (rawStart === '') {
    const len = Number(rawEnd);
    if (!len) return null;
    start = Math.max(0, size - len);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return { unsatisfiable: true };
  }
  return { start, end };
}

async function listing(res, dirPath, urlPath, method) {
  const names = (await readdir(dirPath, { withFileTypes: true }))
    .filter((d) => !d.name.startsWith('.'))
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
    .map((d) => d.name + (d.isDirectory() ? '/' : ''));
  const rows = names
    .map((n) => `<li><a href="${escapeHtml(encodeURIComponent(n).replace(/%2F$/, '/'))}">${escapeHtml(n)}</a></li>`)
    .join('\n');
  const body = Buffer.from(
    `<!doctype html><meta charset="utf-8"><title>${escapeHtml(urlPath)}</title>`
    + `<h1>${escapeHtml(urlPath)}</h1><ul>${urlPath === '/' ? '' : '<li><a href="../">../</a></li>'}\n${rows}\n</ul>\n`,
    'utf8',
  );
  head(res, 200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': body.length });
  res.end(method === 'HEAD' ? undefined : body);
  return 200;
}

async function handle(req, res, root) {
  for (const h of CONDITIONAL_HEADERS) delete req.headers[h];

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return plain(res, 405, 'method not allowed', req.method);
  }

  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return plain(res, 400, 'bad request', req.method);
  }

  const full = normalize(join(root, urlPath));
  if (full !== root && !full.startsWith(root + sep)) {
    return plain(res, 403, 'forbidden', req.method);
  }

  let s;
  try {
    s = await stat(full);
  } catch {
    return plain(res, 404, 'not found: ' + urlPath, req.method);
  }

  if (s.isDirectory()) {
    if (!urlPath.endsWith('/')) {
      head(res, 301, { Location: urlPath + '/' + (new URL(req.url, 'http://localhost').search || '') });
      res.end();
      return 301;
    }
    try {
      const index = join(full, 'index.html');
      const is = await stat(index);
      if (is.isFile()) return sendFile(req, res, index, is);
    } catch { /* no index.html — fall through to a listing */ }
    return listing(res, full, urlPath, req.method);
  }

  return sendFile(req, res, full, s);
}

function sendFile(req, res, path, s) {
  // No ETag, no Last-Modified: without a validator the browser has nothing to
  // revalidate with, which is the second half of the no-stale-module contract.
  const base = { 'Content-Type': contentType(path), 'Accept-Ranges': 'bytes' };
  const range = parseRange(req.headers.range, s.size);

  if (range?.unsatisfiable) {
    head(res, 416, { ...base, 'Content-Range': `bytes */${s.size}` });
    res.end();
    return 416;
  }

  if (range) {
    const length = range.end - range.start + 1;
    head(res, 206, {
      ...base,
      'Content-Range': `bytes ${range.start}-${range.end}/${s.size}`,
      'Content-Length': length,
    });
    if (req.method === 'HEAD') { res.end(); return 206; }
    createReadStream(path, { start: range.start, end: range.end }).pipe(res);
    return 206;
  }

  head(res, 200, { ...base, 'Content-Length': s.size });
  if (req.method === 'HEAD') { res.end(); return 200; }
  createReadStream(path).pipe(res);
  return 200;
}

export function startServer({ root = REPO_ROOT, port = DEFAULT_PORT, host, quiet = false } = {}) {
  const rootDir = resolve(root);
  const server = http.createServer((req, res) => {
    const started = Date.now();
    Promise.resolve(handle(req, res, rootDir))
      .then((status) => {
        if (!quiet) {
          process.stdout.write(`${req.method} ${req.url} ${status} ${Date.now() - started}ms\n`);
        }
      })
      .catch((err) => {
        if (!res.headersSent) plain(res, 500, 'server error: ' + err.message, req.method);
        else res.end();
        if (!quiet) process.stdout.write(`${req.method} ${req.url} 500 ${err.message}\n`);
      });
  });

  return new Promise((resolvePromise, reject) => {
    const listen = (opts, onFail) => {
      const onError = (err) => { server.removeListener('error', onError); onFail(err); };
      server.once('error', onError);
      server.listen(opts, () => {
        server.removeListener('error', onError);
        const addr = server.address();
        resolvePromise({
          port: addr.port,
          root: rootDir,
          baseUrl: `http://127.0.0.1:${addr.port}`,
          close: () => new Promise((r) => server.close(r)),
        });
      });
    };

    if (host) {
      listen({ port, host }, reject);
      return;
    }
    // Dual-stack by default: bind the IPv6 wildcard with V6ONLY off, so
    // http://localhost:<port> (which macOS resolves to ::1 first) and
    // http://127.0.0.1:<port> both reach the same server. Hosts without IPv6
    // fall back to the IPv4 wildcard.
    listen({ port, host: '::', ipv6Only: false }, (err) => {
      if (err.code === 'EADDRINUSE') { reject(err); return; }
      listen({ port, host: '0.0.0.0' }, reject);
    });
  });
}

function parseArgs(argv) {
  const opts = {
    root: REPO_ROOT, port: DEFAULT_PORT, host: undefined, quiet: false,
    selftest: false, orphanExit: undefined,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--quiet' || a === '-q') opts.quiet = true;
    else if (a === '--orphan-exit') opts.orphanExit = true;
    else if (a === '--keep-orphan') opts.orphanExit = false;
    else if (a === '--selftest') opts.selftest = true;
    else if (a === '--port' || a === '-p') opts.port = Number(argv[++i]);
    else if (a.startsWith('--port=')) opts.port = Number(a.slice(7));
    else if (a === '--root') opts.root = argv[++i];
    else if (a.startsWith('--root=')) opts.root = a.slice(7);
    else if (a === '--host') opts.host = argv[++i];
    else if (a.startsWith('--host=')) opts.host = a.slice(7);
    else if (/^\d+$/.test(a)) opts.port = Number(a);
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!Number.isInteger(opts.port) || opts.port < 0 || opts.port > 65535) {
    throw new Error(`bad port: ${opts.port}`);
  }
  // Quiet servers are capture/agent infrastructure in this repository. Give
  // those an ownership lease by default so a killed agent cannot leave a
  // listener around for days. A human can make persistence explicit.
  if (opts.orphanExit === undefined) opts.orphanExit = opts.quiet;
  return opts;
}

const HELP = `HULLBREAKER dev server — static files, caching off.

  node tools/serve.mjs [port] [--port N] [--root DIR] [--host H] [--quiet]
                       [--orphan-exit | --keep-orphan]
  node tools/serve.mjs --selftest

Defaults: port ${DEFAULT_PORT}, root = the repo this script lives in, dual-stack
(127.0.0.1 and localhost both work). Every response carries no-store and no
validator, and conditional request headers are ignored, so a warm browser cache
can never serve a stale ES module against fresh code. Quiet servers are leased
to their launching process and exit if it disappears; use --keep-orphan only
when a persistent background listener is intentional.
`;

function installCliLease(srv, enabled) {
  if (!enabled || process.ppid <= 1) return;
  const ownerPid = process.ppid;
  let closing = false;
  let timer;

  const close = (exitCode, reason) => {
    if (closing) return;
    closing = true;
    clearInterval(timer);
    if (reason) process.stderr.write(reason + '\n');
    // Closing the only listener lets Node exit naturally after in-flight file
    // streams finish. This is deliberately graceful: an interrupted capture
    // may complete its current response, but cannot create a week-long orphan.
    srv.close().finally(() => { process.exitCode = exitCode; });
  };

  timer = setInterval(() => {
    if (process.ppid === 1) {
      close(0, `launcher ${ownerPid} disappeared; closing leased Hullbreaker server`);
    }
  }, 2000);
  timer.unref();

  process.once('SIGINT', () => close(130));
  process.once('SIGTERM', () => close(143));
  process.once('SIGHUP', () => close(129));
}

// --selftest: boot on an ephemeral port and prove the contract that this tool
// exists for. Machine-checkable, no browser, ~200ms.
async function selftest() {
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
  const url = (p) => `${srv.baseUrl}${p}`;
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok, detail });

  try {
    const r = await fetch(url('/index.html'));
    const body = await r.text();
    check('index.html 200', r.status === 200, `status ${r.status}`);
    check('no-store on index.html', /no-store/.test(r.headers.get('cache-control') || ''),
      `cache-control: ${r.headers.get('cache-control')}`);
    check('no ETag validator', r.headers.get('etag') === null);
    check('no Last-Modified validator', r.headers.get('last-modified') === null);
    check('body non-empty', body.length > 0, `${body.length} bytes`);

    // The incident's exact shape: a warm cache revalidating a module.
    const cond = await fetch(url('/src/sim/pace.js'), {
      headers: {
        'If-Modified-Since': 'Wed, 21 Oct 2099 07:28:00 GMT',
        'If-None-Match': '"anything"',
      },
    });
    const condBody = await cond.text();
    check('conditional GET is not 304', cond.status === 200, `status ${cond.status}`);
    check('conditional GET returns a full body', condBody.length > 0, `${condBody.length} bytes`);
    check('module content-type', /javascript/.test(cond.headers.get('content-type') || ''),
      `content-type: ${cond.headers.get('content-type')}`);

    const h = await fetch(url('/index.html'), { method: 'HEAD' });
    check('HEAD 200 + no-store', h.status === 200 && /no-store/.test(h.headers.get('cache-control') || ''));

    const miss = await fetch(url('/definitely-not-here.js'));
    check('404 for a missing file', miss.status === 404, `status ${miss.status}`);
    check('no-store on 404', /no-store/.test(miss.headers.get('cache-control') || ''));

    const esc = await fetch(url('/%2e%2e/%2e%2e/etc/passwd'));
    check('escape above root refused', esc.status === 403 || esc.status === 404, `status ${esc.status}`);

    const dir = await fetch(url('/src/'));
    check('directory listing 200', dir.status === 200, `status ${dir.status}`);

    const ranged = await fetch(url('/index.html'), { headers: { Range: 'bytes=0-9' } });
    const rangedBody = await ranged.text();
    check('range request 206 of 10 bytes', ranged.status === 206 && rangedBody.length === 10,
      `status ${ranged.status}, ${rangedBody.length} bytes`);
  } finally {
    await srv.close();
  }

  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) {
    process.stdout.write(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}\n`);
  }
  process.stdout.write(`\nserve.mjs selftest: ${checks.length - failed.length}/${checks.length} passed\n`);
  return failed.length === 0;
}

const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n\n${HELP}`);
    process.exit(2);
  }
  if (opts.help) {
    process.stdout.write(HELP);
  } else if (opts.selftest) {
    process.exit((await selftest()) ? 0 : 1);
  } else {
    try {
      const srv = await startServer(opts);
      process.stdout.write(
        `serving ${srv.root}\n`
        + `  http://127.0.0.1:${srv.port}/index.html\n`
        + `  http://localhost:${srv.port}/index.html\n`
        + 'caching: no-store, no validators, conditional requests ignored\n',
      );
      installCliLease(srv, opts.orphanExit);
    } catch (err) {
      if (err.code === 'EADDRINUSE') {
        process.stderr.write(
          `port ${opts.port} is already in use.\n`
          + `  lsof -nP -iTCP:${opts.port} -sTCP:LISTEN   # find the squatter\n`,
        );
      } else {
        process.stderr.write(`${err.message}\n`);
      }
      process.exit(1);
    }
  }
}
