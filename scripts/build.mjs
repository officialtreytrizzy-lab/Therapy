#!/usr/bin/env node
// Real build/verification step for the static Firebase-enabled app.
// It does not bundle (the app ships as plain static files) but it DOES validate
// that the browser can actually load everything: syntax-checks every JS file,
// confirms every local asset referenced by index.html exists, and flags local
// assets in public/ that nothing references (dead assets).
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const root = process.cwd();
const errors = [];
const warnings = [];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

// 1. Syntax-check every JS/MJS file under api/ and public/ and scripts/.
const jsFiles = ['api', 'public', 'scripts', 'tests']
  .filter(d => existsSync(join(root, d)))
  .flatMap(d => walk(join(root, d)))
  .filter(f => ['.js', '.mjs'].includes(extname(f)));

for (const file of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    errors.push(`Syntax error: ${file}\n${error.stderr?.toString?.() || error.message}`);
  }
}

// 2. Validate index.html references resolve to real files in public/.
const publicDir = join(root, 'public');
const indexPath = join(publicDir, 'index.html');
if (!existsSync(indexPath)) {
  errors.push('public/index.html is missing.');
} else {
  const html = readFileSync(indexPath, 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]);
  const localRefs = refs.filter(r => r.startsWith('/') && !r.startsWith('//'));
  const referenced = new Set();
  for (const ref of localRefs) {
    const clean = ref.split('?')[0].split('#')[0];
    const target = join(publicDir, clean);
    referenced.add(clean.replace(/^\//, ''));
    if (!existsSync(target)) errors.push(`index.html references missing asset: ${ref}`);
  }

  // 3. Warn about unreferenced local JS/CSS assets (dead assets).
  const shipped = walk(publicDir)
    .map(f => f.replace(publicDir + '/', ''))
    .filter(f => ['.js', '.css'].includes(extname(f)));
  const entryChain = new Set(['app1.js', 'app2.js', 'app3.js', 'app4.js', 'firebase-client.js', 'relationship-v2.js']);
  for (const asset of shipped) {
    if (!referenced.has(asset) && !entryChain.has(asset)) {
      warnings.push(`Unreferenced asset in public/: ${asset}`);
    }
  }
}

if (warnings.length) {
  console.warn('Build warnings:');
  for (const w of warnings) console.warn('  - ' + w);
}

if (errors.length) {
  console.error('Build failed:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

console.log(`Build OK: ${jsFiles.length} JS files checked, index.html asset references validated.`);
