'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');
const { JapaneseParserMCPClient } = require('../src/japanese-parser-mcp-client');

const silentLogger = { write() {} };
const tenant = { id: 'ja-mcp-test', is_global: true, plan: 'admin' };

function parserResponse(overrides = {}) {
  const text = overrides.original_text || 'UIは維持する。APIを変更する。';
  return {
    overall_status: overrides.overall_status || 'COMPLETE',
    execution_allowed: true,
    blocked_reasons: [],
    original_text: text,
    normalized_text: text,
    analysis_path: 'FAST',
    tokens: [],
    meaning_graph: {
      graph_version: '2.3.0',
      semantic_hash: overrides.semantic_hash || 'semantic-test-hash',
      entities: [{ entity_id: 'E1', canonical: 'API' }],
      clauses: [{ clause_id: 'C1', text, source_span: { start: 0, end: text.length, source_text: text }, status: 'RESOLVED' }],
      propositions: [{
        proposition_id: 'P1', predicate: '変更する', intent_type: 'modify', value: 'APIを変更する',
        arguments: [{ role: 'object', value: 'API', status: 'RESOLVED' }], polarity: 'positive', sentence_mood: 'imperative',
        source_span: { start: 0, end: text.length, source_text: text }, status: 'RESOLVED'
      }],
      lexical_nodes: [], scope_edges: [], language_features: [], decision_state_changes: [], evidence_rule_ids: [],
      reading_analysis: { predicate_frames: [], dependency_arcs: [], scope_operators: [], attribution_frames: [], discourse_relations: [], unresolved: [], status: 'RESOLVED' },
      unresolved: overrides.unresolved || []
    },
    task_graph: {
      graph_version: '2.0.0', status: 'RESOLVED', constraints: [], edges: [],
      tasks: [{
        task_id: 'A-001', action: 'APIを変更する', target: 'API', intent_type: 'modify', execution_order: 0,
        constraints: ['UIは維持する'],
        structured_constraints: [{ constraint_type: 'preserve', value: 'UIは維持する', status: 'RESOLVED' }],
        dependencies: [], completion_criteria: ['変更後に検証できる'], verification_criteria: ['変更後を検証する'],
        external_action: true, status: 'RESOLVED', original_span: { start: 0, end: text.length, source_text: text }, proposition_id: 'P1'
      }]
    },
    intents: [], metaphors: [], references: [], tasks: [], ambiguities: [], missing_information: [], contradictions: [], unsupported_elements: [], timeouts: [],
    versions: { parser: '0.4.0', graph: '2.3.0' }, metrics: { total_ms: 1 }
  };
}

class FakeParserClient {
  constructor(response = parserResponse()) {
    this.response = response;
    this.calls = [];
  }
  async analyze(input) {
    this.calls.push(input);
    return this.response;
  }
}

class FailingParserClient {
  async analyze() {
    const error = new Error('synthetic parser outage');
    error.code = 'PARSER_SYNTHETIC_OUTAGE';
    throw error;
  }
}

test('Japanese canonical processing uses MCP TaskGraph as the sole semantic authority', async () => {
  const parser = new FakeParserClient();
  const engine = new CanonicalAsteraEngine({ poolSize: 1, logger: silentLogger, japaneseParserClient: parser });
  try {
    const out = await engine.process({ question: 'UIは維持する。APIを変更する。', language: 'ja' }, tenant);
    assert.equal(parser.calls.length, 1);
    assert.equal(parser.calls[0].executionMode, 'analysis');
    assert.equal(out.result.type, 'cognitive_map');
    assert.equal(out.result.instruction_understanding.adapter, 'deterministic-japanese-parser-mcp');
    assert.equal(out.result.instruction_understanding.parser.semantic_hash, 'semantic-test-hash');
    assert.equal(out.result.analysis_task_packet.task_decomposition_version, 'djpmcp-task-graph-v2');
    assert.equal(out.result.analysis_task_packet.tasks[0].parser_task_id, 'A-001');
    assert.deepEqual(out.result.analysis_task_packet.preserve, ['UIは維持する']);
    assert.notEqual(out.result.instruction_understanding.adapter, 'builtin-ja');
  } finally {
    await engine.destroy();
  }
});

test('PARTIAL parser result remains unresolved and is never promoted by a legacy fallback', async () => {
  const response = parserResponse({ overall_status: 'PARTIAL', unresolved: [{ code: 'REFERENCE_AMBIGUOUS' }] });
  const parser = new FakeParserClient(response);
  const engine = new CanonicalAsteraEngine({ poolSize: 1, logger: silentLogger, japaneseParserClient: parser });
  try {
    const out = await engine.process({ question: response.original_text, language: 'ja' }, tenant);
    assert.equal(out.result.type, 'cognitive_map');
    assert.equal(out.result.instruction_understanding.semantic_resolution, 'meaning-graph-partial');
    assert.ok(out.result.analysis_task_packet.unresolved.some((item) => item.includes('REFERENCE_AMBIGUOUS')));
    assert.notEqual(out.result.instruction_understanding.adapter, 'builtin-ja');
  } finally {
    await engine.destroy();
  }
});

test('MCP transport failure blocks before Task Claim Evidence processing with no builtin fallback', async () => {
  const engine = new CanonicalAsteraEngine({ poolSize: 1, logger: silentLogger, japaneseParserClient: new FailingParserClient() });
  try {
    const out = await engine.process({ question: 'APIを変更する。', language: 'ja' }, tenant);
    assert.equal(out.result.type, 'task_graph_blocked');
    assert.equal(out.result.task_processing_started, false);
    assert.equal(out.result.evidence_processing_started, false);
    assert.ok(out.result.hard_blockers.some((item) => item.includes('PARSER_SYNTHETIC_OUTAGE')));
    assert.equal(out.result.instruction_understanding.adapter, 'deterministic-japanese-parser-mcp');
    assert.equal(out.result.instruction_understanding.execution_allowed, false);
  } finally {
    await engine.destroy();
  }
});

test('real MCP stdio exposes analyze_japanese and returns a MeaningGraph', { skip: process.env.ASTERA_TEST_REAL_JAPANESE_PARSER !== '1' }, async () => {
  const client = new JapaneseParserMCPClient({ timeoutMs: 5000, initTimeoutMs: 20000 });
  try {
    const out = await client.analyze({
      originalText: 'UIは維持する。APIだけ変更しろ。',
      executionMode: 'analysis',
      analysisDepth: 'auto',
      deadlineMs: 5000
    });
    assert.ok(['COMPLETE', 'PARTIAL'].includes(out.overall_status));
    assert.ok(out.meaning_graph);
    assert.equal(typeof out.meaning_graph.semantic_hash, 'string');
    assert.ok(out.meaning_graph.semantic_hash.length > 0);
    assert.ok(Array.isArray(out.meaning_graph.propositions));
    assert.equal(out.astera_mcp_transport.tool, 'analyze_japanese');
  } finally {
    await client.destroy();
  }
});
