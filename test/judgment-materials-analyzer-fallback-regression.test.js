'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeRequest } = require('../src/judgment-materials-analyzer');

test('plain English material still produces one analysis task when no instruction clause exists', () => {
  const result = analyzeRequest({
    question: 'Node.js 22 is the active runtime.'
  });

  const tasks = result.analysis_task_packet.tasks;
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].actionable, true);
  assert.equal(tasks[0].action, 'analyze');
  assert.match(tasks[0].target, /node\.js/i);
  assert.deepEqual(result.analysis_task_packet.execution_waves, [['T01']]);
});

test('missing-evidence statement remains material instead of disappearing as a zero-task request', () => {
  const source = 'There is no official measurement for the current result.';
  const result = analyzeRequest({ question: source });

  const tasks = result.analysis_task_packet.tasks;
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].clause_role, 'MISSING_EVIDENCE');
  assert.equal(tasks[0].actionable, true);
  assert.deepEqual(tasks[0].semantic_states.missing_evidence, [source]);
});
