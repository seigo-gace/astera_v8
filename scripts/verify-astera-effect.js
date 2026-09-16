'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function run(cmd, args, env = {}) {
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  process.stdout.write(res.stdout || '');
  process.stderr.write(res.stderr || '');
  return res;
}

function assertFile(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    console.error(`Missing required file: ${rel}`);
    process.exit(1);
  }
}

function main() {
  assertFile('test/purpose-effect-story.test.js');
  assertFile('test/false-confirmation-effect.test.js');
  assertFile('test/human-reader-effect-boundary.test.js');
  assertFile('test/evidence-lineage-effect.test.js');

  const rubric = run('node', ['--test', 'test/astera-effect-rubric.test.js']);
  if (rubric.status !== 0) process.exit(rubric.status || 1);

  const purpose = run('node', ['--test',
    'test/purpose-effect-story.test.js',
    'test/false-confirmation-effect.test.js',
    'test/evidence-lineage-effect.test.js',
    'test/human-reader-effect-boundary.test.js'
  ]);
  if (purpose.status !== 0) process.exit(purpose.status || 1);

  const runner = run('node', ['scripts/run-astera-effect-stories-v1.js', '--mock-mcp'], {
    ASTERA_EFFECT_PARSER_DEADLINE_MS: '6000'
  });
  if (runner.status !== 0) {
    console.error('verify:effect hard gate failed (v1 runner)');
    process.exit(1);
  }

  const summaryPath = path.join(ROOT, 'artifacts', 'astera-effect-stories-v1', 'summary-first-run.json');
  if (!fs.existsSync(summaryPath)) {
    console.error('Missing v1 summary artifact');
    process.exit(1);
  }
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  const critical = (summary.HALLUCINATION_COUNT || 0)
    + (summary.CONSTRAINT_LOSS_COUNT || 0)
    + (summary.FALSE_CONFIRMATION_COUNT || 0)
    + (summary.FINAL_DECISION_VIOLATION_COUNT || 0)
    + (summary.UNCERTAINTY_LOSS_COUNT || 0)
    + (summary.TASK_DECOMPOSITION_FAILURE_COUNT || 0);
  if (critical > 0) {
    console.error(`verify:effect critical violations=${critical}`);
    process.exit(1);
  }
  if ((summary.IMPROVEMENT_DELTA || 0) <= 0) {
    console.error('verify:effect requires IMPROVEMENT_DELTA > 0 with zero critical violations');
    process.exit(1);
  }
  console.log('verify:effect PASS');
}

main();
