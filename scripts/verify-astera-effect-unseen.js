'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { summarizePairs } = require('../src/astera-effect-pair');

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

function main() {
  const fixtureTest = run('node', ['--test', 'test/astera-effect-stories-unseen-v1-fixture.test.js']);
  if (fixtureTest.status !== 0) process.exit(fixtureTest.status || 1);

  const runner = run('node', ['scripts/run-astera-effect-stories-unseen-v1.js', '--mock-mcp'], {
    ASTERA_EFFECT_PARSER_DEADLINE_MS: '6000'
  });
  if (runner.status !== 0) {
    console.error('verify:effect-unseen runner failed');
    process.exit(1);
  }

  const summaryPath = path.join(ROOT, 'artifacts', 'astera-effect-stories-unseen-v1', 'summary-first-run.json');
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  const critical = (summary.HALLUCINATION_COUNT || 0)
    + (summary.CONSTRAINT_LOSS_COUNT || 0)
    + (summary.FALSE_CONFIRMATION_COUNT || 0)
    + (summary.FINAL_DECISION_VIOLATION_COUNT || 0)
    + (summary.UNCERTAINTY_LOSS_COUNT || 0)
    + (summary.TASK_DECOMPOSITION_FAILURE_COUNT || 0);
  if (critical > 0) {
    console.error(`verify:effect-unseen critical violations=${critical}`);
    process.exit(1);
  }

  const results = summary.results || [];
  const missingPair = results.filter((r) => r.pair_outcome == null || r.paired_delta == null);
  if (missingPair.length > 0) {
    console.error(`verify:effect-unseen pair_outcome missing for ${missingPair.length} stories (fail closed)`);
    process.exit(1);
  }
  const pairSummary = summary.pair_summary || summarizePairs(results.map((r) => ({
    story_id: r.story_id,
    pair_outcome: r.pair_outcome,
    paired_delta: r.paired_delta,
    evaluation: r.evaluation || { violations: r.violations || {} }
  })));

  const winRate = pairSummary.count ? pairSummary.WIN / pairSummary.count : 0;
  const lossRate = pairSummary.count ? pairSummary.LOSS / pairSummary.count : 1;
  if (winRate < 0.7 || lossRate > 0.05 || pairSummary.median_paired_delta <= 0) {
    console.error(JSON.stringify({ winRate, lossRate, pairSummary }, null, 2));
    console.error('verify:effect-unseen utility gate failed');
    process.exit(1);
  }
  console.log('verify:effect-unseen PASS', JSON.stringify(pairSummary));
}

main();
