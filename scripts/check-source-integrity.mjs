import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const srcRoot = path.join(root, 'src');
const sourceFiles = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) sourceFiles.push(full);
  }
}

function resolveInternal(fromFile, rawSpecifier) {
  const specifier = rawSpecifier.split('?')[0].split('#')[0];
  const base = specifier.startsWith('@/')
    ? path.join(srcRoot, specifier.slice(2))
    : path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.css`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  return candidates.some((candidate) => fs.existsSync(candidate));
}

walk(srcRoot);
const broken = [];
const importPattern = /(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;
for (const file of sourceFiles) {
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(importPattern)) {
    const specifier = match[1];
    if (!specifier.startsWith('@/') && !specifier.startsWith('.')) continue;
    if (!resolveInternal(file, specifier)) broken.push(`${path.relative(root, file)} -> ${specifier}`);
  }
}

if (broken.length) {
  console.error(`Source integrity failed: ${broken.length} unresolved internal import(s)`);
  for (const item of broken) console.error(`  ${item}`);
  process.exit(1);
}

console.log(`Source integrity OK: ${sourceFiles.length} TS/TSX files, 0 unresolved internal imports.`);
