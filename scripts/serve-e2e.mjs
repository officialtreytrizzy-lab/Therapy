import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const host = '127.0.0.1';
const port = Number(process.env.PORT || 4173);
const publicRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.webp', 'image/webp'],
]);

function safePath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const resolved = path.resolve(publicRoot, `.${decoded}`);
  if (resolved !== publicRoot && !resolved.startsWith(`${publicRoot}${path.sep}`)) return null;
  return resolved;
}

async function existingFile(candidate) {
  try {
    const details = await stat(candidate);
    if (details.isFile()) return candidate;
    if (details.isDirectory()) {
      const indexFile = path.join(candidate, 'index.html');
      if ((await stat(indexFile)).isFile()) return indexFile;
    }
  } catch {
    return null;
  }
  return null;
}

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || '/', `http://${host}:${port}`);
    const candidate = safePath(requestUrl.pathname);
    if (!candidate) {
      response.writeHead(403).end('Forbidden');
      return;
    }

    const exactFile = await existingFile(candidate);
    const file = exactFile || (path.extname(requestUrl.pathname) ? null : path.join(publicRoot, 'index.html'));
    if (!file) {
      response.writeHead(404).end('Not found');
      return;
    }

    const body = await readFile(file);
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': contentTypes.get(path.extname(file).toLowerCase()) || 'application/octet-stream',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    console.error(error);
    response.writeHead(500).end('Internal server error');
  }
});

server.listen(port, host, () => {
  console.log(`E2E server listening at http://${host}:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
