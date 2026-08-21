'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Composition Root routes all decision-material execution through Canonical AsteraEngine', () => {
  const start = read('start.js');
  const moduleSwitchServer = read('src/server-with-module-switch.js');
  const asteraEngine = read('src/astera-engine.js');
  const canonicalBase = read('src/canonical-astera-engine-base.js');

  assert.match(start, /require\('\.\/src\/server-with-module-switch'\)/);
  assert.match(moduleSwitchServer, /require\('\.\/canonical-astera-engine'\)/);
  assert.match(asteraEngine, /require\('\.\/canonical-astera-engine'\)/);
  assert.doesNotMatch(asteraEngine, /WorkerPool|07_recommendation|Weighted|candidate_ranking|globalDecision/);
  assert.match(canonicalBase, /require\('\.\/canonical-engine-support'\)/);
  assert.doesNotMatch(canonicalBase, /require\('\.\/astera-engine'\)/);
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

    const likelyInit = Math.min(
      ...['new AsteraServer', 'new SQLiteStore', 'server.start()', 'new EvidenceSearchServer', 'new EvaluatorServer']
        .map((needle) => source.indexOf(needle))
        .filter((index) => index >= 0)
    );
    if (Number.isFinite(likelyInit)) {
      assert.ok(guardCall < likelyInit, `${file}: runtime initialization occurs before container gate`);
    }
  }
});

test('Integrated API hard-block check occurs before Evidence Search planning/execution', () => {
  const source = read('src/server-with-evidence.js');
  const blockState = source.indexOf('const blockState=taskGraphBlockState(request)');
  const blockedBranch = source.indexOf('if(blockState.blocked)', blockState);
  const evidenceExecution = source.indexOf('await Promise.all(taskPlans.map', blockedBranch);

  assert.ok(blockState >= 0, 'Integrated Task Graph block state is missing');
  assert.ok(blockedBranch > blockState, 'Integrated hard-block branch is missing');
  assert.ok(evidenceExecution > blockedBranch, 'Evidence Search must not precede hard-block handling');
});

test('Canonical public runtime contains no normative recommendation section or weighted selection output', () => {
  const base = read('src/canonical-astera-engine-base.js');
  const current = read('src/canonical-astera-engine.js');
  const combined = `${base}\n${current}`;

  assert.match(combined, /07_evidence_status/);
  assert.match(combined, /MATERIAL_ONLY/);
  assert.doesNotMatch(combined, /07_recommendation/);
  assert.doesNotMatch(combined, /globalDecision\s*=\s*['"]recommend/);
  assert.doesNotMatch(combined, /WEIGHTED-CANDIDATE-COMPARE/);
});
