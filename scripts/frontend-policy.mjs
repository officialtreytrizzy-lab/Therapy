#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

const root = process.cwd();
const publicDir = join(root, 'public');
const violations = [];
const warnings = [];

const legacyInlineFiles = new Set([
  'app1.js',
  'app2.js',
  'app3.js',
  'app4.js',
  'email-auth-fallback-addon.js',
  'email-link-confirmation.js',
  'firebase-client.js',
  'google-auth-addon.js',
  'relationship-v2.js',
  'luxury-ui.js',
  'experience-polish.js',
  'inclusive-foundation.js',
  'real-loop.js',
  'premium-motion.js',
]);

function walk(dir) {
  const files = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

function count(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

for (const file of walk(publicDir).filter(file => ['.js', '.html'].includes(extname(file)))) {
  const relativePath = relative(publicDir, file).split(sep).join('/');
  const source = readFileSync(file, 'utf8');

  const dangerous = [
    [/\beval\s*\(/g, 'eval()'],
    [/\bnew\s+Function\s*\(/g, 'new Function()'],
    [/javascript\s*:/gi, 'javascript: URL'],
    [/document\.write\s*\(/g, 'document.write()'],
    [/set(?:Timeout|Interval)\s*\(\s*['"`]/g, 'string-based timer'],
  ];
  for (const [pattern, label] of dangerous) {
    if (pattern.test(source)) violations.push(`${relativePath}: ${label} is not allowed.`);
  }

  if (extname(file) === '.html' && /<script\b(?![^>]*\bsrc=)[^>]*>/i.test(source)) {
    violations.push(`${relativePath}: inline <script> blocks are not allowed.`);
  }

  const inlineHandlers = count(source, /\son[a-z]+\s*=\s*["']/gi);
  const inlineStyles = count(source, /\sstyle\s*=\s*["']/gi);
  const dynamicStyles = count(source, /createElement\(\s*['"]style['"]\s*\)/g);
  if (inlineHandlers || inlineStyles || dynamicStyles) {
    if (legacyInlineFiles.has(relativePath)) {
      warnings.push(`${relativePath}: legacy inline debt (${inlineHandlers} handlers, ${inlineStyles} style attributes, ${dynamicStyles} dynamic style blocks).`);
    } else {
      if (inlineHandlers) violations.push(`${relativePath}: new inline event handlers are not allowed; use addEventListener().`);
      if (inlineStyles) violations.push(`${relativePath}: new inline style attributes are not allowed; use a stylesheet class.`);
      if (dynamicStyles) violations.push(`${relativePath}: new runtime style blocks are not allowed; use a static stylesheet.`);
    }
  }
}

if (warnings.length) {
  console.warn('Frontend policy legacy debt:');
  warnings.forEach(message => console.warn(`  - ${message}`));
}
if (violations.length) {
  console.error('Frontend policy failed:');
  violations.forEach(message => console.error(`  - ${message}`));
  process.exit(1);
}
console.log('Frontend policy OK: no new inline execution/style debt or dynamic-code primitives.');
