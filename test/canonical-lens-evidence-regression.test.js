'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { routeDomainTemplates, TEMPLATES, medicalSafetyFallback } = require('../src/domain-template-router');
const fact = require('../src/pillars/fact-worker');

function syntheticG23Score() {
  const genre = TEMPLATES.find((item) => item.id === 'G23');
  assert.ok(genre, 'G23 must exist in the canonical 38-lens catalog');
  return [{ genre, score: 0.2, exact_hits: 0, similarity: 0.01, matched_signals: [] }];
}

test('weak generic wording still abstains and never falls into G20', () => {
  const result = routeDomainTemplates({ question: '判断材料を改善する' });
  assert.equal(result.primary, null);
  assert.equal(result.classification_basis, 'ABSTAIN_LOW_SIGNAL');
  assert.notEqual(result.primary?.id, 'G20');
});

test('medical safety canonical hint activates only for medical_safety overlay', () => {
  const scored = syntheticG23Score();
  assert.equal(medicalSafetyFallback(scored, [{ id: 'evidence_strict' }]), null);
  const fallback = medicalSafetyFallback(scored, [{ id: 'medical_safety' }]);
  assert.equal(fallback.id, 'G23');
  assert.equal(fallback.classification_basis, 'SAFETY_OVERLAY_CANONICAL_HINT');
  assert.equal(fallback.confidence, 0.5);
  assert.equal(fallback.taxonomy_review_required, true);
});

test('ordinary strong primary classification is not overridden by medical overlay logic', () => {
  const result = routeDomainTemplates({ question: 'APIサーバーのシステム開発でemergency停止処理を実装する' });
  assert.equal(result.primary?.id, 'G29');
  assert.ok(result.overlays.some((item) => item.id === 'medical_safety'));
  assert.notEqual(result.classification_basis, 'SAFETY_OVERLAY_CANONICAL_HINT');
});

test('Fact keeps lens-specific evidence requirements even when Evidence Search is not required', async () => {
  const task = {
    id: 'T01',
    clause_type: 'instruction',
    source_span: { start: 0, end: 7, text: 'APIを改善する' },
    premises: [],
    evidence_need: { required: false },
    target: 'API',
    action: 'improve',
    objective: 'APIを改善する'
  };
  const domain = {
    primary: {
      id: 'G29',
      name: 'Software / System Development',
      evidence_to_collect: ['現行仕様', '回帰Test', '互換性条件']
    }
  };
  const result = await fact.run({ question: task.source_span.text, task, domain, evidence_packet: null });
  assert.deepEqual(result.evidence_gaps.map((item) => item.item), ['現行仕様', '回帰Test', '互換性条件']);
  assert.equal(result.evidence_state.state, 'NOT_PROVIDED');
});
