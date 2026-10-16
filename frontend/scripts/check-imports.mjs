/**
 * Frontend import-graph check. Run with: node scripts/check-imports.mjs
 *
 * Vite 5 needs Node 18+, so on older toolchains this is the fastest way to
 * catch the errors a refactor actually causes: a file that no longer exists,
 * or a named import that its module no longer exports.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'src');

async function listFiles(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full)));
    else if (/\.(jsx?|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function exportedNames(source) {
  const names = new Set();
  for (const pattern of [
    /export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g,
    /export\s+(?:const|let|var|class)\s+([A-Za-z0-9_$]+)/g,
  ]) {
    for (const match of source.matchAll(pattern)) names.add(match[1]);
  }
  for (const match of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of match[1].split(',')) {
      const alias = part.split(/\s+as\s+/).pop().trim();
      if (alias) names.add(alias);
    }
  }
  if (/export\s+default/.test(source)) names.add('default');
  return names;
}

const files = await listFiles(SRC);
const sources = new Map();
for (const file of files) sources.set(file, await fs.readFile(file, 'utf8'));

/** Resolves ./x, ./x.js, ./x/index.js the way the bundler would. */
function resolve(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [base, `${base}.js`, `${base}.jsx`, path.join(base, 'index.js'), path.join(base, 'index.jsx')];
  return candidates.find((candidate) => sources.has(candidate)) ?? null;
}

let problems = 0;
for (const [file, source] of sources) {
  const rel = path.relative(SRC, file).replace(/\\/g, '/');

  for (const match of source.matchAll(/import\s+([^;]*?)\s+from\s+['"]([^'"]+)['"]/g)) {
    const [, clause, specifier] = match;
    if (!specifier.startsWith('.')) continue;

    const target = resolve(file, specifier);
    if (!target) {
      problems += 1;
      console.log(`FAIL ${rel}: cannot resolve "${specifier}"`);
      continue;
    }
    if (/^\*\s+as\s+/.test(clause.trim())) continue;

    const available = exportedNames(sources.get(target));
    const braces = /\{([^}]*)\}/.exec(clause);
    const named = braces
      ? braces[1].split(',').map((p) => p.split(/\s+as\s+/)[0].trim()).filter(Boolean)
      : [];

    if (/^[A-Za-z0-9_$]+\s*(,|$)/.test(clause.trim()) && !available.has('default')) {
      problems += 1;
      console.log(`FAIL ${rel}: "${specifier}" has no default export`);
    }
    for (const name of named) {
      if (!available.has(name)) {
        problems += 1;
        console.log(`FAIL ${rel}: "${specifier}" does not export "${name}"`);
      }
    }
  }
}

console.log(problems === 0 ? `OK — ${sources.size} files, all imports resolve.` : `\n${problems} problem(s).`);
process.exit(problems === 0 ? 0 : 1);
