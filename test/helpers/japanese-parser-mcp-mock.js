'use strict';

function mockJapaneseParserResult(originalText, overrides = {}) {
  const text = String(originalText || '');
  const task = {
    task_id: 'A-001',
    intent_type: 'request',
    action: 'analyze',
    target: text.includes('API') ? 'API' : 'UNRESOLVED_JAPANESE_TARGET',
    status: 'RESOLVED',
    original_span: { start: 0, end: text.length, source_text: text },
    dependencies: [],
    external_action: /改善|変更|実装|修正|削除|接続|反映/i.test(text),
    constraints: [],
    completion_criteria: [],
    verification_criteria: [],
    structured_constraints: []
  };
  return {
    overall_status: 'COMPLETE',
    execution_allowed: true,
    original_text: text,
    normalized_text: text,
    analysis_path: 'FAST',
    meaning_graph: {
      semantic_hash: `mock-${Buffer.from(text).toString('base64url').slice(0, 24)}`,
      graph_version: 'mock-v1',
      propositions: [{ proposition_id: 'P1', text }],
      unresolved: [],
      reading_analysis: { predicate_frames: [{ frame_id: 'F1' }], scope_operators: [] }
    },
    task_graph: {
      graph_version: 'mock-v1',
      tasks: [task],
      edges: [],
      constraints: []
    },
    versions: { parser: 'mock-0.4.0' },
    contradictions: [],
    ambiguities: [],
    missing_information: [],
    unsupported_elements: [],
    timeouts: [],
    metrics: { total_ms: 1 },
    blocked_reasons: [],
    ...overrides
  };
}

function createMockJapaneseParserClient(options = {}) {
  const resolver = options.resolveResult || ((text) => mockJapaneseParserResult(text));
  return {
    async initialize() {},
    async analyze({ originalText }) {
      const structured = resolver(String(originalText || ''));
      return {
        ...structured,
        astera_mcp_transport: {
          parser: 'deterministic-japanese-parser',
          transport: 'mock',
          protocol_version: '2025-03-26',
          server_version: 'mock',
          semantic_hash: structured.meaning_graph?.semantic_hash || null,
          overall_status: structured.overall_status,
          execution_allowed: structured.execution_allowed,
          latency_ms: 0.1,
          tool: 'analyze_japanese'
        }
      };
    },
    async destroy() {}
  };
}

module.exports = {
  mockJapaneseParserResult,
  createMockJapaneseParserClient
};
