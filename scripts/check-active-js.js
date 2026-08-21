'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const ACTIVE_ROOTS = ['src', 'test', 'scripts'];
const EXCLUDED_DIRS = new Set(['archive', 'node_modules', '.git']);

function collectJavaScriptFiles(relativeDir, output = []) {
  const absoluteDir = path.join(ROOT, relativeDir);
  if (!fs.existsSync(absoluteDir)) return output;

  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      collectJavaScriptFiles(relativePath, output);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      output.push(relativePath);
    }
  }
  return output;
}

const files = ACTIVE_ROOTS.flatMap((root) => collectJavaScriptFiles(root));
files.sort();

const failures = [];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: ROOT,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    failures.push({
      file,
      status: result.status,
      stderr: String(result.stderr || '').trim(),
      stdout: String(result.stdout || '').trim()
    });
  }
}

if (failures.length) {
  console.error(`Active JavaScript syntax check failed: ${failures.length}/${files.length}`);
  for (const failure of failures) {
    console.error(`\n[FAIL] ${failure.file}`);
    if (failure.stderr) console.error(failure.stderr);
    if (failure.stdout) console.error(failure.stdout);
  }
  process.exit(1);
}

console.log(`Active JavaScript syntax check passed: ${files.length}/${files.length}`);
