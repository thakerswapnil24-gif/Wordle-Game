#!/usr/bin/env node
/**
 * Bundles the whole game into one self-contained HTML file.
 *
 * The normal build keeps the source as ES modules, which browsers refuse to
 * load over file:// — so index.html needs a web server. This produces a single
 * file with the styles and every module inlined, which plays by double-clicking
 * it, or by opening it from a phone's downloads. Handy for sending the game to
 * someone who just wants to try it.
 *
 * The bundling is a deliberate, small transform rather than a real bundler:
 * modules are ordered by their import graph, then `import`/`export` keywords are
 * stripped so the concatenation runs as one script. That is only safe because
 * every module here uses static imports and no two share a top-level name — both
 * of which are checked below and fail the build if they stop being true.
 *
 * Namespace imports (`import * as storage from './storage.js'`) survive as a
 * synthesised object literal gathering that module's exports, emitted directly
 * after it. Without this the concatenated script has no `storage` binding at
 * all, and the app dies on load with "storage is not defined".
 *
 * Usage: node tools/build-standalone.mjs [outfile]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

const ENTRY = 'src/js/main.js';
const OUT = process.argv[2] ?? 'pentaword-standalone.html';

const IMPORT_RE = /^\s*import\s+(?:(?<names>[\s\S]+?)\s+from\s+)?['"](?<spec>[^'"]+)['"];?\s*$/gm;

/**
 * Resolve the module graph depth-first and record each module only once its
 * dependencies are recorded, so the emitted order is dependency-first.
 *
 * The `visiting` set is separate from the output map on purpose: using the
 * output map as the cycle guard would insert each module at the moment it is
 * first *seen* rather than finished, which puts the entry point — seen first,
 * finished last — at the top of the bundle, ahead of everything it needs.
 */
const modules = new Map();
const visiting = new Set();
async function collect(file) {
  const path = resolve(file);
  if (modules.has(path) || visiting.has(path)) return;
  visiting.add(path);
  const source = await readFile(path, 'utf8');
  const deps = [...source.matchAll(IMPORT_RE)]
    .map((m) => m.groups.spec)
    .filter((spec) => spec.startsWith('.'));
  for (const spec of deps) await collect(resolve(dirname(path), spec));
  visiting.delete(path);
  modules.set(path, source);
}
await collect(ENTRY);

/** Strip module syntax so the pieces concatenate into one script. */
function flatten(source) {
  return source
    .replace(IMPORT_RE, '')
    // `export { a, b };` re-export statements carry no declaration to keep.
    .replace(/^\s*export\s+\{[^}]*\};?\s*$/gm, '')
    .replace(/^(\s*)export\s+(default\s+)?/gm, '$1');
}

/** The names a module exports, for rebuilding namespace imports. */
function exportedNames(source) {
  const names = new Set();
  for (const m of source.matchAll(/^\s*export\s+(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    names.add(m[1]);
  }
  for (const m of source.matchAll(/^\s*export\s+\{([^}]*)\};?\s*$/gm)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  return [...names];
}

/** `import * as NS from './x.js'` -> the module path it names, keyed by NS. */
function namespaceImports(source, fromDir) {
  const found = [];
  for (const m of source.matchAll(/^\s*import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"];?\s*$/gm)) {
    found.push({ alias: m[1], path: resolve(fromDir, m[2]) });
  }
  return found;
}

/** Top-level declarations, used to prove no two modules collide. */
function declarations(source) {
  const names = new Set();
  for (const m of source.matchAll(/^(?:export\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    names.add(m[1]);
  }
  return names;
}

// Collect every namespace import so each target module can publish a binding.
const namespaces = new Map(); // module path -> Set of alias names
for (const [path, source] of modules) {
  for (const { alias, path: target } of namespaceImports(source, dirname(path))) {
    if (!modules.has(target)) throw new Error(`${relative('.', path)} imports an unknown module: ${target}`);
    if (!namespaces.has(target)) namespaces.set(target, new Set());
    namespaces.get(target).add(alias);
  }
}

const seen = new Map();
const clashes = [];
for (const [path, source] of modules) {
  for (const name of declarations(source)) {
    if (seen.has(name)) clashes.push(`${name} (${relative('.', seen.get(name))} and ${relative('.', path)})`);
    else seen.set(name, path);
  }
}
for (const aliases of namespaces.values()) {
  for (const alias of aliases) {
    if (seen.has(alias)) clashes.push(`${alias} (a namespace import shadows a declaration)`);
    else seen.set(alias, 'namespace import');
  }
}
if (clashes.length > 0) {
  throw new Error(
    `Cannot flatten: these top-level names are declared in more than one module:\n  ${clashes.join('\n  ')}\n`
    + 'Rename one of each pair, or switch this tool to a real bundler.',
  );
}

const script = [...modules]
  .map(([path, source]) => {
    let block = `\n/* ---- ${relative('.', path)} ---- */\n${flatten(source)}`;
    for (const alias of namespaces.get(path) ?? []) {
      const names = exportedNames(source);
      if (names.length === 0) throw new Error(`${relative('.', path)} is imported as a namespace but exports nothing`);
      block += `\nconst ${alias} = { ${names.join(', ')} };\n`;
    }
    return block;
  })
  .join('\n');

/* ------------------------------- assemble --------------------------------- */

let html = await readFile('index.html', 'utf8');

// Inline the stylesheets in the order they were linked.
const styles = [];
for (const m of [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)]) {
  styles.push(`/* ---- ${m[1]} ---- */\n${await readFile(m[1], 'utf8')}`);
}
html = html.replace(/\s*<link rel="stylesheet" href="[^"]+">/g, '');
html = html.replace('</head>', `<style>\n${styles.join('\n\n')}\n</style>\n</head>`);

// The favicon and manifest are separate files that will not exist beside a
// standalone copy; inline the icon and drop the rest.
const favicon = await readFile('assets/favicon.svg', 'utf8');
html = html.replace(
  /<link rel="icon"[^>]*>/,
  `<link rel="icon" href="data:image/svg+xml;base64,${Buffer.from(favicon).toString('base64')}">`,
);
html = html.replace(/\s*<link rel="(apple-touch-icon|manifest)"[^>]*>/g, '');

// The boot-failure notice exists for the file:// module problem this file solves.
html = html.replace(/\s*<div class="fallback" id="boot-error"[\s\S]*?<\/div>\n(?=\n<!--)/, '\n');

html = html.replace(
  /<script type="module" src="[^"]+"><\/script>/,
  `<script type="module">\n${script}\n</script>`,
);

// A page loaded from file:// has a null origin, so 'self' matches nothing and
// the inlined styles and scripts would all be refused.
html = html.replace(/<meta http-equiv="Content-Security-Policy"[\s\S]*?">/, `<meta http-equiv="Content-Security-Policy" content="
  default-src 'none';
  script-src 'unsafe-inline';
  style-src 'unsafe-inline';
  img-src data:;
  connect-src 'none';
  base-uri 'none';
  form-action 'none';
">`);

await writeFile(OUT, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`${OUT} — ${modules.size} modules, ${styles.length} stylesheets, ${kb} KB`);
