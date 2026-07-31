#!/usr/bin/env node
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';

const root = resolve(process.cwd(), 'public');
const port = Math.max(1, Math.min(65_535, Number(process.env.PORT) || 4173));
const host = process.env.HOST || '127.0.0.1';
const types = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
]);

function safeCandidate(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { return null; }
  const normalized = normalize(decoded.replace(/^\/+/, '')).split(sep).join('/');
  if (normalized.startsWith('../') || normalized === '..') return null;
  const candidate = resolve(root, normalized);
  return relative(root, candidate).startsWith('..') ? null : candidate;
}

function existingFile(candidate) {
  return candidate && existsSync(candidate) && statSync(candidate).isFile() ? candidate : null;
}

function resolveRequest(pathname) {
  if (pathname === '/') return join(root, 'index.html');
  const candidate = safeCandidate(pathname);
  const direct = existingFile(candidate);
  if (direct) return direct;
  if (!extname(pathname)) {
    const cleanHtml = existingFile(`${candidate}.html`);
    if (cleanHtml) return cleanHtml;
    const nestedIndex = existingFile(join(candidate, 'index.html'));
    if (nestedIndex) return nestedIndex;
  }
  return join(root, 'index.html');
}

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || `${host}:${port}`}`);
  const file = resolveRequest(url.pathname);
  if (!file || !existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    return res.end('Not found');
  }
  const contentType = types.get(extname(file).toLowerCase()) || 'application/octet-stream';
  res.writeHead(200, {
    'content-type': contentType,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  if (req.method === 'HEAD') return res.end();
  return createReadStream(file).pipe(res);
});

server.listen(port, host, () => {
  console.log(`Test server listening on http://${host}:${port}`);
});

function shutdown() {
  server.close(error => process.exit(error ? 1 : 0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
