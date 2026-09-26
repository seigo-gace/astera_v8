'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildInitialJudgmentMaterial, resolveInitialDomainLens, ORDER } = require('../src/runtime/initial-material-fast-path');

test('initial Fast Path returns usable Main8 without Parser, Evidence Search, or network wait', () => {
  const out = buildInitialJudgmentMaterial({
    question: '現在のNode.js仕様を公式根拠で確認し、A案とB案の比較材料を出せ。最終判断はするな。',
    context: '本番環境は変更せず、根拠がない事項は断定しない。',
    language: 'ja',
    output_language: 'ja'
  }, { id: 'test-caller' });

  assert.equal(out.result.phase, 'INITIAL_FAST_PATH');
  assert.equal(out.result.revision, 1);
  assert.equal(out.result.decision_authority, 'EXTERNAL_ONLY');
  assert.equal(out.result.no_normative_decision_generated, true);
  assert.equal(out.result.evidence_required, true);
  assert.equal(out.result.evidence_route_policy, 'BOTH_ROUTES_REQUIRED');
  assert.ok(['SELECTED', 'NOT_SELECTED'].includes(out.result.lens_status));
  assert.equal(out.result.lens_error_code, null);
  assert.equal(out.runtime.lens_status, out.result.lens_status);
  assert.equal(out.runtime.lens_error_code, null);
  assert.deepEqual(out.result.judgment.order, ORDER);
  assert.equal(ORDER.length, 8);
  for (const key of ORDER) {
    assert.ok(out.material.sections[key]);
    assert.ok(Array.isArray(out.material.sections[key].items));
    assert.ok(out.material.sections[key].items.length > 0);
  }
  assert.equal(out.material.sections['06_comparison'].selected_candidate, null);
  assert.deepEqual(out.material.sections['06_comparison'].candidate_ranking, []);
  assert.equal(out.runtime.japanese_parser_used, false);
  assert.equal(out.runtime.evidence_search_used, false);
  assert.equal(out.runtime.external_network_wait, false);
  assert.equal(out.runtime.within_basic_target, true);
  assert.match(out.material.text, /01 本当の目的/);
  assert.match(out.material.text, /07 根拠成立状態/);
  assert.match(out.material.text, /SEARCH_REQUIRED_BOTH_ROUTES/);
});

test('initial Fast Path requires Evidence when the input contains externally verifiable claims even without explicit evidence cue words', () => {
  const out = buildInitialJudgmentMaterial({
    question: '- Colibri: 744Bモデルを25GB RAMで動かせる。\n- FreeToken: 35Bモデルを8GB GPUで動かせる。',
    language: 'ja',
    output_language: 'ja'
  });

  assert.equal(out.result.evidence_required, true);
  assert.equal(out.result.evidence_route_policy, 'BOTH_ROUTES_REQUIRED');
  assert.equal(out.material.sections['07_evidence_status'].state, 'SEARCH_REQUIRED');
  assert.match(out.material.text, /SEARCH_REQUIRED_BOTH_ROUTES/);
});

test('initial Fast Path exposes Domain Lens routing failure instead of silently collapsing to null', () => {
  const resolved = resolveInitialDomainLens('Node.jsの仕様を確認する', '', () => {
    const error = new Error('synthetic router failure');
    error.code = 'DOMAIN_ROUTER_TEST_FAILURE';
    throw error;
  });

  assert.equal(resolved.lens, null);
  assert.equal(resolved.status, 'FAILED');
  assert.equal(resolved.error_code, 'DOMAIN_ROUTER_TEST_FAILURE');
});

test('initial Fast Path local p95 stays within the 0.1 second engineering class', () => {
  const samples = [];
  for (let index = 0; index < 100; index += 1) {
    const out = buildInitialJudgmentMaterial({
      question: `判断材料ModuleのFast Pathを検証する。制約を保持し、未確認事項を断定するな。case=${index}`,
      language: 'ja',
      output_language: 'ja'
    });
    samples.push(out.runtime.duration_ms);
    assert.ok(out.runtime.duration_ms < 1000, `basic target exceeded: ${out.runtime.duration_ms}ms`);
  }
  samples.sort((a, b) => a - b);
  const p95 = samples[Math.ceil(samples.length * 0.95) - 1];
  assert.ok(p95 < 100, `Fast Path p95=${p95}ms must remain below 100ms`);
});