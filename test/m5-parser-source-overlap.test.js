'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const AsteraEngine = require('../src/astera-engine');
const Logger = require('../src/logger');
const { applyUniversalCaseGraph } = require('../src/runtime/universal-case-graph');
const { buildUniversalSourceUnderstanding } = require('../src/runtime/universal-source-graph');
const { mockJapaneseParserResultFromSentences } = require('./helpers/japanese-parser-mcp-mock');

function preparedWithNoTasks(question) {
  return {
    original_question: question,
    normalized_question: question,
    language: 'ja',
    instruction_understanding: { overall_status: 'PARTIAL', blocked_reasons: [] },
    analysis_task_packet: {
      tasks: [],
      dependencies: [],
      execution_waves: [],
      hard_blockers: [],
      unresolved: ['NO_EXECUTABLE_ACTION'],
      constraints: [],
      prohibitions: [],
      preserve: [],
      deadlines: [],
      conditions: [],
      exceptions: [],
      observable_material: {},
      task_graph_validation: { valid: true, cycle: [], dependency_count: 0, wave_count: 0 }
    }
  };
}

function delayedJapaneseParserClient(delayMs = 25) {
  return {
    async analyze({ originalText }) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const structured = mockJapaneseParserResultFromSentences(originalText);
      return {
        ...structured,
        astera_mcp_transport: {
          parser: 'deterministic-japanese-parser',
          transport: 'mock-delayed',
          protocol_version: '2025-03-26',
          server_version: 'mock',
          semantic_hash: structured.meaning_graph?.semantic_hash || null,
          overall_status: structured.overall_status,
          execution_allowed: structured.execution_allowed,
          latency_ms: delayMs,
          tool: 'analyze_japanese'
        }
      };
    },
    async destroy() {}
  };
}

function spansByName(trace) {
  return new Map((trace?.spans || []).map((span) => [span.name, span]));
}

test('Universal Case Graph reuses exact-source precomputed understanding and rejects stale input', () => {
  const question = '現在仕様を確認して。その後、主要なリスクを整理して。';
  const input = { question, language: 'ja' };
  const understanding = buildUniversalSourceUnderstanding(question, 'ja');
  const out = applyUniversalCaseGraph(preparedWithNoTasks(question), input, understanding);

  assert.strictEqual(out.universal_source_graph, understanding.source_graph);
  assert.strictEqual(out.universal_semantic_atoms, understanding.semantic_atoms);
  assert.equal(out.universal_source_graph.source, question);

  const stale = buildUniversalSourceUnderstanding('別の入力を確認して。', 'ja');
  const staleRejected = applyUniversalCaseGraph(preparedWithNoTasks(question), input, stale);
  assert.equal(staleRejected.universal_source_graph.source, question);
  assert.notStrictEqual(staleRejected.universal_source_graph, stale.source_graph);
  assert.notStrictEqual(staleRejected.universal_semantic_atoms, stale.semantic_atoms);
});

test('Japanese Parser wait overlaps one source-understanding build without changing parser authority', async (t) => {
  const engine = new AsteraEngine({
    japaneseParserClient: delayedJapaneseParserClient(),
    evidenceSearchClient: null,
    logger: new Logger({ tgsEnabled: false })
  });
  t.after(async () => engine.destroy());

  const question = '現在仕様を確認して。その後、主要なリスクを整理して。勝者は選ばず判断材料だけ返して。';
  const out = await engine.process({ question, language: 'ja', output_language: 'ja' }, { id: 'm5-overlap-test' });

  assert.equal(out?.result?.type, 'cognitive_map');
  assert.equal(out.result.decision_authority, 'EXTERNAL_ONLY');
  assert.equal(out.result.no_normative_decision_generated, true);
  assert.equal(out.result.request_model?.instruction_understanding?.parser, 'deterministic-japanese-parser');

  const trace = out.result.runtime_trace;
  assert.ok(trace);
  assert.equal(trace.status, 'COMPLETE');
  const spans = spansByName(trace);
  assert.equal(spans.get('parser_wait')?.external_wait, true);
  assert.equal(spans.get('parser_wait')?.invocations, 1);
  assert.equal(spans.get('source_graph')?.invocations, 1);
  assert.equal(spans.get('semantic_atoms')?.invocations, 1);
  assert.equal(spans.get('case_graph')?.invocations, 1);
  assert.ok((spans.get('parser_wait')?.wall_time_ms || 0) >= 10);
});