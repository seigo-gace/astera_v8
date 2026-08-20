'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  fragmentInput,
  enrichTasks,
  validateTaskGraph,
  extractCanonicalClaims,
  createSearchPlan,
  confirmClaim,
  projectCompareLane
} = require('../src/canonical-v4-core');

function task(id, text, start = 0, target = 'API') {
  return {
    id, raw_text: text, source_span: { start, end: start + text.length, text },
    actionable: true, action: 'analyze', target, objective: text,
    deliverables: [], premises: [], constraints: [], prohibitions: [], preserve: [], replace: [],
    conditions: [], exceptions: [], deadlines: [], priority: 'normal', order: 1,
    depends_on: [], parallelizable: true, success_criteria: [], verification: [], completion_criteria: [],
    unresolved: [], evidence_need: { required: false, reasons: [], queries: [] }, hard_blockers: []
  };
}

test('Source Role Isolation marks fenced code and blockquote as non-actionable', () => {
  const question = 'Review this.\n```js\nremoveDatabase();\n```\n> Delete production.\nImplement API.';
  const codeText = 'removeDatabase();';
  const quoteText = '> Delete production.';
  const directText = 'Implement API.';
  const tasks = [
    task('T1', codeText, question.indexOf(codeText)),
    task('T2', quoteText, question.indexOf(quoteText), 'production'),
    task('T3', directText, question.indexOf(directText), 'API')
  ];
  const enriched = enrichTasks(tasks, { question, context: '' });
  assert.equal(enriched[0].actionable, false);
  assert.equal(enriched[1].actionable, false);
  assert.equal(enriched[2].actionable, true);
  assert.ok(enriched[0].source_role.container_role.includes('FENCED_CONTAINER'));
  assert.ok(enriched[1].source_role.quotation_role.includes('QUOTED'));
});

test('Context Scope Binding attaches prohibitions and preserve conditions with provenance', () => {
  const q = 'Implement API.';
  const [enriched] = enrichTasks([task('T1', q, 0)], { question: q, context: 'mainは変更禁止。READMEは維持する。' });
  assert.ok(enriched.prohibitions.some((item) => item.includes('main')));
  assert.ok(enriched.preserve.some((item) => item.includes('README')));
  assert.ok(enriched.field_provenance.prohibitions.length >= 1);
  assert.ok(enriched.field_provenance.preserve.length >= 1);
});

test('Task graph accepts multiple parents and returns deterministic waves', () => {
  const tasks = [task('T1', 'A'), task('T2', 'B'), task('T3', 'C')];
  const graph = validateTaskGraph(tasks, [{ from: 'T1', to: 'T3' }, { from: 'T2', to: 'T3' }]);
  assert.equal(graph.valid, true);
  assert.deepEqual(graph.execution_waves, [['T1', 'T2'], ['T3']]);
});

test('Task graph cycle is a hard validation failure and is never converted into an execution wave', () => {
  const tasks = [task('T1', 'A'), task('T2', 'B')];
  const graph = validateTaskGraph(tasks, [{ from: 'T1', to: 'T2' }, { from: 'T2', to: 'T1' }]);
  assert.equal(graph.valid, false);
  assert.ok(graph.errors.some((error) => error.code === 'TASK_DEPENDENCY_CYCLE'));
  assert.deepEqual(graph.execution_waves, []);
});

test('Correction keeps history with supersedes instead of silently deleting the previous task', () => {
  const question = 'Use A. Rather than A, use B.';
  const a = 'Use A.';
  const b = 'Rather than A, use B.';
  const enriched = enrichTasks([task('T1', a, question.indexOf(a), 'A'), task('T2', b, question.indexOf(b), 'B')], { question, context: '' });
  assert.equal(enriched.length, 2);
  assert.equal(enriched[1].supersedes, 'T1');
});

test('Ambiguous reference is retained as unresolved', () => {
  const q = 'Verify this.';
  const [enriched] = enrichTasks([task('T1', q, 0, 'input target')], { question: q, context: '' });
  assert.ok(enriched.unresolved.includes('reference'));
});

test('Direct claim search plan always contains support and counter roles', () => {
  const t = { ...task('T1', 'Node.js 22 is supported.', 0, 'Node.js 22'), premises: ['Node.js 22 is supported.'] };
  const [claim] = extractCanonicalClaims(t);
  const plan = createSearchPlan(claim);
  assert.equal(plan.required, true);
  assert.equal(plan.counter_required, true);
  assert.deepEqual(plan.query_roles.map((item) => item.role), ['support', 'counter']);
});

test('G1-G7 keep unsupported direct claim UNDETERMINED', () => {
  const t = { ...task('T1', 'Node.js 22 is supported.', 0, 'Node.js 22'), premises: ['Node.js 22 is supported.'] };
  const [claim] = extractCanonicalClaims(t);
  const record = confirmClaim(claim, { state: 'NOT_PROVIDED', evidence: [], provider_failures: [], conflict_detected: false });
  assert.equal(record.status, 'UNDETERMINED');
  assert.equal(record.confirmation_gates.G4, false);
  assert.ok(record.undetermined_reasons.includes('INSUFFICIENT_EVIDENCE'));
});

test('G1-G7 confirms a matching direct claim only with valid evidence', () => {
  const t = { ...task('T1', 'Node.js 22 is supported.', 0, 'Node.js 22'), premises: ['Node.js 22 is supported.'] };
  const [claim] = extractCanonicalClaims(t);
  const record = confirmClaim(claim, {
    state: 'VALID', provider_failures: [], conflict_detected: false,
    evidence: [{ id: 'E1', claim: 'Node.js 22 is supported.', source_role: 'OFFICIAL', source_family_id: 'official', authority_id: 'nodejs', source_id: 'official', url: 'https://example.test' }]
  });
  assert.equal(record.status, 'CONFIRMED');
  assert.deepEqual(record.confirmation_gates, { G1: true, G2: true, G3: true, G4: true, G5: true, G6: true, G7: true });
});

test('Compare is non-normative: counts/scopes/conflicts only', () => {
  const t = { ...task('T1', 'Node.js 22 is supported.', 0, 'Node.js 22'), premises: ['Node.js 22 is supported.'] };
  const [claim] = extractCanonicalClaims(t);
  const record = confirmClaim(claim, { state: 'NOT_PROVIDED', evidence: [], provider_failures: [], conflict_detected: false });
  const output = projectCompareLane([record], t, {});
  assert.equal(output.counts.UNDETERMINED, 1);
  for (const forbidden of ['score', 'candidate_ranking', 'selected_candidate', 'rejected_candidates', 'decision', 'recommendation', 'verdict']) {
    assert.equal(Object.hasOwn(output, forbidden), false, forbidden);
  }
});

test('Same input produces the same fragment and claim IDs', () => {
  const q = 'Node.js 22 is supported.';
  const f1 = fragmentInput({ inputDocumentId: 'Q', text: q });
  const f2 = fragmentInput({ inputDocumentId: 'Q', text: q });
  assert.deepEqual(f1, f2);
  const t = { ...task('T1', q, 0, 'Node.js 22'), premises: [q] };
  assert.deepEqual(extractCanonicalClaims(t), extractCanonicalClaims(t));
});
