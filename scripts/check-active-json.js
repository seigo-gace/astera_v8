'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ACTIVE_ROOTS = ['config', 'src', 'web'];
const ROOT_JSON = ['package.json'];
const EXCLUDED_DIRS = new Set(['archive', 'node_modules', '.git']);

function collectJsonFiles(relativeDir, output = []) {
  const absoluteDir = path.join(ROOT, relativeDir);
  if (!fs.existsSync(absoluteDir)) return output;

  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      collectJsonFiles(relativePath, output);
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      output.push(relativePath);
    }
  }
  return output;
}

const files = [
  ...ROOT_JSON.filter((file) => fs.existsSync(path.join(ROOT, file))),
  ...ACTIVE_ROOTS.flatMap((root) => collectJsonFiles(root))
].sort();

const failures = [];
for (const file of files) {
  try {
    JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  } catch (error) {
    failures.push({ file, message: error.message });
  }
}

if (failures.length) {
  console.error(`Active JSON parse check failed: ${failures.length}/${files.length}`);
  for (const failure of failures) console.error(`[FAIL] ${failure.file}: ${failure.message}`);
  process.exit(1);
}

console.log(`Active JSON parse check passed: ${files.length}/${files.length}`);
