'use strict';

function splitWithSpans(text) {
  const input = String(text || '');
  const items = [];
  let start = 0;
  for (let index = 0; index < input.length; index += 1) {
    if (!/[。！？!?;；\n]/u.test(input[index])) continue;
    const raw = input.slice(start, index + 1);
    const left = raw.length - raw.trimStart().length;
    const right = raw.length - raw.trimEnd().length;
    if (index + 1 - right > start + left) items.push({ start: start + left, end: index + 1 - right, text: input.slice(start + left, index + 1 - right) });
    start = index + 1;
  }
  if (start < input.length) {
    const raw = input.slice(start);
    const left = raw.length - raw.trimStart().length;
    const right = raw.length - raw.trimEnd().length;
    if (input.length - right > start + left) items.push({ start: start + left, end: input.length - right, text: input.slice(start + left, input.length - right) });
  }
  return items;
}

function inferIntentType(slice) {
  const text = String(slice || '');
  if (/(?:訂正|撤回|前言|ではなく|じゃなく|retract|withdraw|correct|instead)/i.test(text)) return 'correction';
  if (/(?:するな|しない(?:で|。|$)|禁止|してはいけ|must not|do not|never)/i.test(text)) return 'prohibition';
  if (/(?:残す|維持|保持|keep|preserve|retain)/i.test(text)) return 'preserve';
  if (/(?:比較|compare|\bvs\b)/i.test(text)) return 'comparison';
  if (/(?:削除|除去|remove|delete)/i.test(text)) return 'remove';
  if (/(?:改善|修正|変更|更新|modify|improve|fix|update)/i.test(text)) return 'modify';
  if (/(?:実装|作成|構築|開発|implement|build|create|develop)/i.test(text)) return 'action';
  if (/(?:移行|migrate|switch)/i.test(text)) return 'action';
  if (/(?:検証|確認|verify|validate|check|test)/i.test(text)) return 'request';
  if (/(?:場合|なら|if\b|when\b|成功したら|失敗したら|問題なければ|確認できたら)/i.test(text)) return 'condition';
  if (/(?:例外|except|however|ただし)/i.test(text)) return 'exception';
  return 'request';
}

function inferTarget(slice) {
  const text = String(slice || '');
  const patterns = [
    /API(?:サーバー)?/i,
    /README/i,
    /\bmain\b/i,
    /Node\.js\s*22/i,
    /互換性/i,
    /API仕様/i,
    /小規模事業者/i,
    /ニッチ/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  if (/^[A-Z]案/.test(text.trim())) return text.trim().slice(0, 2);
  return text.includes('API') ? 'API' : 'UNRESOLVED_JAPANESE_TARGET';
}

function mockParserTasksFromText(originalText) {
  const text = String(originalText || '');
  if (/判断したい|比較したい|決めたい|分けて判断したい/.test(text)) {
    return [{
      task_id: 'A-001',
      intent_type: 'request',
      action: 'analyze',
      target: inferTarget(text),
      status: 'RESOLVED',
      original_span: { start: 0, end: text.length, source_text: text },
      dependencies: [],
      external_action: false,
      constraints: [],
      completion_criteria: [],
      verification_criteria: [],
      structured_constraints: []
    }];
  }
  const spans = splitWithSpans(text);
  if (!spans.length) {
    return [{
      task_id: 'A-001',
      intent_type: 'request',
      action: 'analyze',
      target: inferTarget(text),
      status: 'RESOLVED',
      original_span: { start: 0, end: text.length, source_text: text },
      dependencies: [],
      external_action: /改善|変更|実装|修正|削除|接続|反映/i.test(text),
      constraints: [],
      completion_criteria: [],
      verification_criteria: [],
      structured_constraints: []
    }];
  }
  return spans.map((span, index) => {
    const slice = span.text;
    const intent_type = inferIntentType(slice);
    return {
      task_id: `A-${String(index + 1).padStart(3, '0')}`,
      intent_type,
      action: intent_type === 'modify' ? '変更する' : intent_type === 'action' ? '実装する' : intent_type === 'request' ? '検証する' : slice.slice(0, 24),
      target: inferTarget(slice),
      status: 'RESOLVED',
      original_span: { start: span.start, end: span.end, source_text: slice },
      dependencies: [],
      external_action: /改善|変更|実装|修正|削除|接続|反映/i.test(slice),
      constraints: [],
      completion_criteria: [],
      verification_criteria: [],
      structured_constraints: []
    };
  });
}

function mockJapaneseParserResult(originalText, overrides = {}) {
  const text = String(originalText || '');
  if (/^(?:どう|これ|それ|あれ)[？?]?$/u.test(text.trim())) {
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
        reading_analysis: { predicate_frames: [], scope_operators: [] }
      },
      task_graph: { graph_version: 'mock-v1', tasks: [], edges: [], constraints: [] },
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

function mockJapaneseParserResultFromSentences(originalText, overrides = {}) {
  const text = String(originalText || '');
  if (/^(?:どう|これ|それ|あれ)[？?]?$/u.test(text.trim())) {
    return mockJapaneseParserResult(text, overrides);
  }
  const tasks = mockParserTasksFromText(text);
  return mockJapaneseParserResult(text, {
    meaning_graph: {
      semantic_hash: `mock-${Buffer.from(text).toString('base64url').slice(0, 24)}`,
      graph_version: 'mock-v1',
      propositions: tasks.map((item, index) => ({ proposition_id: `P${index + 1}`, text: item.original_span.source_text })),
      unresolved: [],
      reading_analysis: { predicate_frames: [{ frame_id: 'F1' }], scope_operators: [] }
    },
    task_graph: {
      graph_version: 'mock-v1',
      tasks,
      edges: [],
      constraints: []
    },
    ...overrides
  });
}

function createMockJapaneseParserClient(options = {}) {
  const resolver = options.resolveResult || ((text) => mockJapaneseParserResultFromSentences(text));
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
  mockJapaneseParserResultFromSentences,
  mockParserTasksFromText,
  createMockJapaneseParserClient
};
