'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractCanonicalTaskClaims,
  buildCanonicalTaskPlan
} = require('../src/canonical-claim-runtime');

const DOMAIN = Object.freeze({ primary: Object.freeze({ id: 'G01' }), secondary: [], overlays: [] });
const EXECUTION_AT = '2026-10-05T00:00:00.000Z';

function task(id, text, { target = text, evidenceRequired = false } = {}) {
  return {
    id,
    raw_text: text,
    source_span: { start: 0, end: text.length, text },
    source_role: 'DIRECT_INPUT',
    actionable: true,
    action: 'analyze',
    target,
    objective: text,
    premises: [],
    constraints: [],
    prohibitions: [],
    preserve: [],
    replace: [],
    conditions: [],
    exceptions: [],
    deadlines: [],
    completion_criteria: [],
    success_criteria: [],
    unresolved: [],
    hard_blockers: [],
    evidence_need: { required: evidenceRequired, reasons: [], queries: [] }
  };
}

test('M5 canonical plan reuse preserves the final plan while reusing the exact extraction', () => {
  const text = 'According to NodeJS, "Node.js 22 is supported."';
  const baseTask = task('T1', text, { target: 'Node.js 22' });
  const extraction = extractCanonicalTaskClaims(baseTask, { executionAt: EXECUTION_AT });
  assert.ok(extraction.claims.length > 0);

  const routedTask = { ...baseTask, domain: DOMAIN };
  const reused = buildCanonicalTaskPlan(routedTask, DOMAIN, { executionAt: EXECUTION_AT, extraction });
  const fresh = buildCanonicalTaskPlan(routedTask, DOMAIN, { executionAt: EXECUTION_AT });

  assert.deepEqual(reused, fresh);
  assert.strictEqual(reused.claims, extraction.claims);
  assert.deepEqual(reused.search_plan, fresh.search_plan);
  assert.deepEqual(reused.policy_by_claim_id, fresh.policy_by_claim_id);
});

test('M5 extraction reuse preserves verification-target semantics added after evidence need is known', () => {
  const text = 'Please compare option A and option B.';
  const baseTask = task('T2', text, { target: 'option A and option B', evidenceRequired: false });
  const extraction = extractCanonicalTaskClaims(baseTask, { executionAt: EXECUTION_AT });
  assert.equal(extraction.claims.length, 0, 'routing extraction should not invent a verification target before evidence need is known');

  const routedTask = {
    ...baseTask,
    domain: DOMAIN,
    evidence_need: { required: true, reasons: ['DOMAIN_REQUIRES_VERIFICATION'], queries: [] }
  };
  const reused = buildCanonicalTaskPlan(routedTask, DOMAIN, { executionAt: EXECUTION_AT, extraction });
  const fresh = buildCanonicalTaskPlan(routedTask, DOMAIN, { executionAt: EXECUTION_AT });

  assert.deepEqual(reused, fresh);
  assert.ok(reused.claims.length > extraction.claims.length);
  assert.ok(reused.claims.some((claim) => claim.predicate === 'VERIFICATION_TARGET'));
});