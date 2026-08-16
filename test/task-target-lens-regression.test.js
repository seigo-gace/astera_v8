'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const KaguraEngine = require('../src/kagura-engine');

const tenant = { id: 'test', is_global: true, plan: 'admin' };
const silentLogger = { write() {} };

function resolvedFollowup(originalText) {
  return {
    overall_status: 'COMPLETE',
    execution_allowed: true,
    blocked_reasons: [],
    original_text: originalText,
    normalized_text: originalText,
    analysis_path: 'DEEP',
    meaning_graph: {
      graph_version: '2.2.0',
      semantic_hash: 'resolved-followup-api-server',
      unresolved: []
    },
    task_graph: {
      graph_version: '2.0.0',
      tasks: [{
        task_id: 'P-FOLLOWUP',
        action: '改善する',
        target: 'APIサーバーのシステム開発',
        intent_type: 'modify',
        execution_order: 1,
        constraints: [],
        structured_constraints: [],
        dependencies: [],
        completion_criteria: ['改善対象を維持したまま判断材料を生成する'],
        verification_criteria: ['回帰Testで確認する'],
        external_action: false,
        status: 'RESOLVED',
        original_span: {
          start: 0,
          end: originalText.length,
          source_text: originalText
        },
        proposition_id: 'followup-proposition'
      }],
      edges: [],
      constraints: [],
      status: 'RESOLVED'
    },
    ambiguities: [],
    missing_information: [],
    contradictions: [],
    unsupported_elements: [],
    timeouts: [],
    versions: { parser: 'test-parser', grammar: 'test-grammar' },
    metrics: { elapsed_ms: 2.8 },
    astera_mcp_transport: {
      protocol_version: '2025-11-25',
      elapsed_ms: 3.0,
      tool: 'analyze_japanese'
    }
  };
}

function parserClient() {
  return {
    async analyze({ originalText }) {
      return resolvedFollowup(originalText);
    },
    async destroy() {}
  };
}

test('Parserが解決したTask targetをLensへ渡し、表面上の指示語だけでABSTAINしない', async () => {
  const engine = new KaguraEngine({
    poolSize: 4,
    logger: silentLogger,
    japaneseParserClient: parserClient()
  });
  try {
    const out = await engine.process({ question: 'これを改善して。' }, tenant);
    const task = out.result.task_results[0];
    assert.equal(task.task.target, 'APIサーバーのシステム開発');
    assert.equal(task.task.domain.primary?.id, 'G29');
    assert.equal(out.result.judgment.lens_routing.per_task['P-FOLLOWUP'].primary?.id, 'G29');
    assert.equal(out.result.five_stage.tasks[0].lens_id, 'G29');
    assert.equal(out.result.judgment['08_reinstruction'].decision_basis.lens_ids.includes('G29'), true);
  } finally {
    await engine.destroy();
  }
});

test('5本柱の公開順はFact/Risk/Multi/Inquiry/Compareのまま維持する', async () => {
  const engine = new KaguraEngine({
    poolSize: 4,
    logger: silentLogger,
    japaneseParserClient: parserClient()
  });
  try {
    const out = await engine.process({ question: 'これを改善して。' }, tenant);
    assert.deepEqual(out.result.five_stage.order, ['fact', 'risk', 'multi', 'inquiry', 'compare']);
    assert.equal(out.result.judgment.order.length, 8);
  } finally {
    await engine.destroy();
  }
});
