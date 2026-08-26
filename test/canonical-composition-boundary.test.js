'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Composition Root exposes one Astera decision-material pipeline with Evidence Search resolved at the canonical search boundary', () => {
  const start = read('start.js');
  const moduleSwitchServer = read('src/server-with-module-switch.js');
  const server = read('src/server.js');
  const evidenceServer = read('src/server-with-evidence.js');
  const asteraEngine = read('src/astera-engine.js');
  const canonicalBase = read('src/canonical-astera-engine-base.js');
  const compatibilityAuto = read('src/canonical-evidence-auto-engine.js');

  assert.match(start, /require\('\.\/src\/server-with-module-switch'\)/);
  assert.match(moduleSwitchServer, /require\('\.\/astera-engine'\)/);
  assert.match(server, /require\('\.\/astera-engine'\)/);
  assert.doesNotMatch(evidenceServer, /domain-template-router|input-understanding|canonical-claim-runtime|buildCanonicalTaskPlan|evaluateCanonicalTaskPlan/);
  assert.match(asteraEngine, /class AsteraEngine extends CanonicalAsteraEngine/);
  assert.match(asteraEngine, /resolveEvidenceForTask/);
  assert.doesNotMatch(asteraEngine, /async process\s*\(/);
  assert.match(canonicalBase, /await this\.resolveEvidenceForTask/);
  assert.match(canonicalBase, /executeTaskWaves/);
  assert.doesNotMatch(canonicalBase, /await Promise\.all\(tasks\.map/);
  assert.doesNotMatch(canonicalBase, /require\(['"][^'"]*pillars\//);
  assert.doesNotMatch(canonicalBase, /require\(['"][^'"]*worker-pool['"]\)/);

  const compatibilityExecutable = compatibilityAuto
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && line !== "'use strict';");
  assert.deepEqual(compatibilityExecutable, ["module.exports = require('./astera-engine');"]);
});

test('all active server entrypoints fail closed through the container runtime boundary before service initialization', () => {
  const entries = [
    'start.js',
    'src/evidence-search/api/start.js',
    'src/quality-completion-evaluator/api/start.js'
  ];

  for (const file of entries) {
    const source = read(file);
    const guardImport = source.indexOf('container-boundary');
    const guardCall = source.indexOf('assertContainerRuntime()');
    assert.ok(guardImport >= 0, `${file}: container-boundary import missing`);
    assert.ok(guardCall > guardImport, `${file}: assertContainerRuntime call missing`);
  }
});

test('Canonical public runtime contains no normative recommendation section, weighted selection, or legacy worker dependency', () => {
  const files = [
    'src/canonical-astera-engine-base.js',
    'src/canonical-astera-engine.js',
    'src/canonical-claim-runtime.js'
  ];
  const combined = files.map(read).join('\n');

  assert.match(combined, /07_evidence_status/);
  assert.match(combined, /MATERIAL_ONLY/);
  assert.doesNotMatch(combined, /07_recommendation/);
  assert.doesNotMatch(combined, /globalDecision\s*=\s*['"]recommend/);
  assert.doesNotMatch(combined, /WEIGHTED-CANDIDATE-COMPARE/);
  assert.doesNotMatch(combined, /require\(['"][^'"]*worker-pool['"]\)/);
  assert.doesNotMatch(combined, /require\(['"][^'"]*pillars\//);
});
