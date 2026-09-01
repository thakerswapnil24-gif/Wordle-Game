#!/usr/bin/env node
/**
 * A dependency-free static file server for local development.
 *
 * The game itself needs no server in production — any static host works — but
 * browsers refuse to load JavaScript modules over `file://`, so opening
 * index.html directly will not work. Run `npm start` instead.
 */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const ROOT = resolve(process.argv[3] ?? '.');
const PORT = Number(process.env.PORT ?? process.argv[2] ?? 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const requested = decodeURIComponent(url.pathname);
    // Resolve inside ROOT only — never serve files above the project directory.
    const target = resolve(join(ROOT, normalize(requested)));
    if (target !== ROOT && !target.startsWith(ROOT + sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    let file = target;
    const info = await stat(file).catch(() => null);
    if (info?.isDirectory()) file = join(file, 'index.html');
    else if (!info) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
      return;
    }

    res.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    createReadStream(file).pipe(res);
  } catch (error) {
    res.writeHead(500, { 'content-type': 'text/plain' }).end(String(error));
  }
});

server.listen(PORT, () => {
  console.log(`Quintle is running at http://localhost:${PORT}`);
});
