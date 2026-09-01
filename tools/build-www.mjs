#!/usr/bin/env node
/**
 * Assembles `www/` — the exact set of files that ship inside the Android app.
 *
 * Capacitor copies a single directory into the APK, so the web game is staged
 * here rather than pointing Capacitor at the repository root (which would drag
 * in node_modules, tests, tooling and the Android project itself).
 *
 * Usage: node tools/build-www.mjs
 */
import { cp, mkdir, rm, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const OUT = 'www';

/** Everything the game needs at runtime, and nothing else. */
const INCLUDE = ['index.html', 'src', 'assets'];

/** Source-only files that would otherwise be copied along with the above. */
const EXCLUDE = new Set(['.DS_Store']);

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

for (const entry of INCLUDE) {
  await cp(entry, join(OUT, entry), {
    recursive: true,
    filter: (src) => !EXCLUDE.has(src.split('/').pop()),
  });
}

async function measure(dir) {
  let bytes = 0;
  let files = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const inner = await measure(path);
      bytes += inner.bytes;
      files += inner.files;
    } else {
      bytes += (await stat(path)).size;
      files += 1;
    }
  }
  return { bytes, files };
}

const { bytes, files } = await measure(OUT);
console.log(`${OUT}/ ready — ${files} files, ${(bytes / 1024).toFixed(0)} KB`);
