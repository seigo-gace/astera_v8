'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const KaguraEngine = require('../src/kagura-engine');
const { analyzeRequest, deriveEvidenceNeed, normalizeEvidencePacket } = require('../src/judgment-materials-analyzer');
const { routeDomainTemplates } = require('../src/domain-template-router');
const { JapaneseParserMCPClient, MCP_PROTOCOL_VERSION, needsJapaneseParser } = require('../src/japanese-parser-mcp-client');

const silentLogger = { write() {} };
const tenant = { id: 'test', is_global: true, plan: 'admin' };

function validEvidence(claim, candidates = null) {
  const evidence = candidates || [{
    candidate_id: 'ev-official-1',
    canonical_record_id: 'official-record-1',
    content_hash: 'hash-official-1',
    source_role: 'OFFICIAL',
    source_family_id: 'official-family-1',
    source_id: 'official-test',
    provider_id: 'official-provider',
    authority_id: 'authority-test',
    canonical_locator: { url: 'https://example.test/evidence', replayable: true },
    updated_at: '2026-08-16T00:00:00.000Z',
    fields: { claim },
    excerpt: claim
  }];
  return {
    schema_version: 'astera.evidence-search.result.v1',
    request_id: 'ev-test',
    tenant_id: 'test',
    status: 'FINAL_VALID',
    effective_as_of: '2026-08-16T00:00:00.000Z',
    evidence,
    coverage: { discovery_scope_state: 'COMPLETE_FOR_QUERY_SCOPE', registry_coverage_state: 'COMPLETE' },
    quality: {
      initial: {
        status: 'REINFORCEMENT_REQUIRED',
        phase: 'INITIAL',
        score_bp: 8500,
        gates: { initial_minimum_bp: 8000, final_minimum_bp: 9500 },
        blocking_reasons: []
      },
      reinforcement_attempt_count: 1,
      new_corroboration_count: 1,
      final: {
        status: 'FINAL_VALID',
        phase: 'FINAL',
        score_bp: 9700,
        gates: { initial_minimum_bp: 8000, final_minimum_bp: 9500 },
        blocking_reasons: []
      }
    },
    provider_execution: {
      initial: [{ provider_id: 'official-provider', status: 'FULFILLED' }],
      reinforcement: [{ provider_id: 'corroboration-provider', status: 'FULFILLED' }]
    },
    ai_used: false,
    payment_executed: false
  };
}

function secondaryEvidence(claim) {
  return validEvidence(claim, [
    {
      candidate_id: 'ev-secondary-1', canonical_record_id: 'secondary-record-1', content_hash: 'hash-secondary-1',
      source_role: 'SECONDARY', source_family_id: 'secondary-family-1', source_id: 'secondary-source-1', provider_id: 'secondary-provider-1', authority_id: 'secondary-authority-1',
      canonical_locator: { url: 'https://secondary1.test/evidence', replayable: true }, updated_at: '2026-08-16T00:00:00.000Z', fields: { claim }, excerpt: claim
    },
    {
      candidate_id: 'ev-secondary-2', canonical_record_id: 'secondary-record-2', content_hash: 'hash-secondary-2',
      source_role: 'SECONDARY', source_family_id: 'secondary-family-2', source_id: 'secondary-source-2', provider_id: 'secondary-provider-2', authority_id: 'secondary-authority-2',
      canonical_locator: { url: 'https://secondary2.test/evidence', replayable: true }, updated_at: '2026-08-16T00:00:00.000Z', fields: { claim }, excerpt: claim
    }
  ]);
}

function span(text, part) {
  const start = text.indexOf(part);
  assert.notEqual(start, -1, `missing span source: ${part}`);
  return { start, end: start + part.length, source_text: part };
}

function parserResponse(originalText, { executionAllowed = true, blockedReasons = [] } = {}) {
  const preserveText = originalText.includes('UIは残せ') ? 'UIは残せ。' : originalText;
  const modifyText = originalText.includes('APIだけ変更しろ') ? 'APIだけ変更しろ。' : originalText;
  const tasks = originalText.includes('UIは残せ') ? [
    {
      task_id: 'P001', action: '維持対象を保護する', target: 'UI', intent_type: 'preserve', execution_order: 1,
      constraints: ['UIを維持する'], structured_constraints: [{ constraint_type: 'preserve', value: 'UI', status: 'RESOLVED' }], dependencies: [], completion_criteria: ['UIが変更されない'], verification_criteria: ['UI差分がない'], external_action: false, status: 'RESOLVED', original_span: span(originalText, preserveText), proposition_id: 'prop-preserve'
    },
    {
      task_id: 'P002', action: '対象を変更する', target: 'API', intent_type: 'modify', execution_order: 2,
      constraints: ['UIを維持する'], structured_constraints: [{ constraint_type: 'preserve', value: 'UI', status: 'RESOLVED' }], dependencies: ['P001'], completion_criteria: ['APIだけが変更される'], verification_criteria: ['API Testが通る'], external_action: true, status: 'RESOLVED', original_span: span(originalText, modifyText), proposition_id: 'prop-modify'
    }
  ] : [
    {
      task_id: 'P001', action: '対象を解析する', target: '入力対象', intent_type: 'request', execution_order: 1,
      constraints: [], structured_constraints: [], dependencies: [], completion_criteria: ['要求を判断材料へ変換する'], verification_criteria: [], external_action: false, status: 'RESOLVED', original_span: { start: 0, end: originalText.length, source_text: originalText }, proposition_id: 'prop-1'
    }
  ];
  return {
    overall_status: executionAllowed ? 'COMPLETE' : 'PARTIAL', execution_allowed: executionAllowed, blocked_reasons: blockedReasons,
    original_text: originalText, normalized_text: originalText, analysis_path: 'DEEP',
    meaning_graph: { graph_version: '2.2.0', semantic_hash: 'semantic-test-hash', unresolved: executionAllowed ? [] : [{ code: 'AMBIGUOUS_ACTION' }] },
    task_graph: { graph_version: '2.0.0', tasks, edges: tasks.length > 1 ? [{ source: 'P001', target: 'P002', relation: 'depends_on' }] : [], constraints: [], status: executionAllowed ? 'RESOLVED' : 'AMBIGUOUS' },
    ambiguities: executionAllowed ? [] : [{ code: 'AMBIGUOUS_ACTION' }], missing_information: [], contradictions: [], unsupported_elements: [], timeouts: [],
    versions: { parser: 'test-parser', grammar: 'test-grammar' }, metrics: { elapsed_ms: 3.1 },
    astera_mcp_transport: { protocol_version: MCP_PROTOCOL_VERSION, elapsed_ms: 3.2, tool: 'analyze_japanese' }
  };
}

function evidenceParserResponse(originalText, claim) {
  return {
    overall_status: 'COMPLETE', execution_allowed: true, blocked_reasons: [], original_text: originalText, normalized_text: originalText, analysis_path: 'DEEP',
    meaning_graph: { graph_version: '2.2.0', semantic_hash: 'semantic-evidence-hash', unresolved: [] },
    task_graph: {
      graph_version: '2.0.0',
      tasks: [{
        task_id: 'P-EV', action: '公式根拠で検証する', target: 'Node.js 22 production support', intent_type: 'verification_criteria', execution_order: 1,
        constraints: [], structured_constraints: [{ constraint_type: 'premise', value: claim, status: 'RESOLVED' }], dependencies: [],
        completion_criteria: ['公式根拠で対応状況を確定する'], verification_criteria: ['公式Sourceを使用する'], external_action: false, status: 'RESOLVED',
        original_span: { start: 0, end: originalText.length, source_text: originalText }, proposition_id: 'prop-evidence'
      }],
      edges: [], constraints: [], status: 'RESOLVED'
    },
    ambiguities: [], missing_information: [], contradictions: [], unsupported_elements: [], timeouts: [],
    versions: { parser: 'test-parser', grammar: 'test-grammar' }, metrics: { elapsed_ms: 3.1 },
    astera_mcp_transport: { protocol_version: MCP_PROTOCOL_VERSION, elapsed_ms: 3.2, tool: 'analyze_japanese' }
  };
}

function mcpSpawnStub(log) {
  return () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.exitCode = null;
    child.killed = false;
    let inputBuffer = '';
    child.stdin = new Writable({
      write(chunk, encoding, callback) {
        inputBuffer += String(chunk);
        while (inputBuffer.includes('\n')) {
          const index = inputBuffer.indexOf('\n');
          const raw = inputBuffer.slice(0, index).trim();
          inputBuffer = inputBuffer.slice(index + 1);
          if (!raw) continue;
          const message = JSON.parse(raw);
          log.push(message);
          if (!Object.hasOwn(message, 'id')) continue;
          let result;
          if (message.method === 'initialize') result = { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: 'parser-test', version: '1' } };
          else if (message.method === 'tools/list') result = { tools: [{ name: 'analyze_japanese', inputSchema: { type: 'object' }, outputSchema: { type: 'object' } }] };
          else if (message.method === 'tools/call') result = { structuredContent: parserResponse(message.params.arguments.original_text) };
          else result = {};
          queueMicrotask(() => child.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }) + '\n'));
        }
        callback();
      }
    });
    child.kill = () => {
      child.killed = true;
      child.exitCode = 0;
      queueMicrotask(() => child.emit('exit', 0, 'SIGTERM'));
      return true;
    };
    return child;
  };
}

async function withEngine(fn, japaneseParserClient = null) {
  const engine = new KaguraEngine({ poolSize: 4, logger: silentLogger, japaneseParserClient });
  try { await fn(engine); } finally { await engine.destroy(); }
}

function parserClient(factory) {
  return { async analyze({ originalText }) { return factory(originalText); }, async destroy() {} };
}

test('non-AI runtime keeps exact 5-stage order and all Main8 sections carry decision traces', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({ question: 'Improve the API runtime. Keep compatibility. Verify rollback before completion.', language: 'en' }, tenant);
    assert.equal(out.result.non_ai, true);
    assert.equal(out.runtime.ai_used, false);
    assert.equal(out.runtime.llm_called, false);
    assert.equal(out.runtime.engine, 'v8_deterministic_rules');
    assert.equal(Object.hasOwn(out, 'answer'), false);
    assert.equal(out.result.five_stage.order.join(','), 'fact,risk,multi,inquiry,compare');
    assert.equal(out.result.judgment.order.length, 8);
    for (const key of out.result.judgment.order) {
      const section = out.result.judgment[key];
      assert.ok(section.decision_basis);
      assert.ok(section.decision_basis.rule_ids.length >= 1);
      assert.equal(section.decision_basis.task_ids.length, out.result.analysis_task_packet.tasks.length);
      assert.ok(Array.isArray(section.decision_basis.source_spans));
      assert.equal(section.decision_basis.instruction_understanding.mode, 'FAST_PATH');
    }
    assert.match(out.material.text, /Decision Basis/);
  }, null);
});

test('Japanese fast analyzer never guesses meaning and emits an explicit Parser MCP guard packet', () => {
  const request = analyzeRequest({ question: 'READMEは残す。APIを改善する。mainは変更するな。' });
  assert.equal(request.language, 'ja');
  assert.equal(request.analysis_task_packet.tasks.length, 1);
  assert.equal(request.analysis_task_packet.tasks[0].id, 'JP-MCP-REQUIRED');
  assert.ok(request.analysis_task_packet.hard_blockers.includes('JAPANESE_READING_REQUIRES_MCP'));
  assert.ok(request.analysis_task_packet.unresolved.includes('JAPANESE_READING_REQUIRES_MCP'));
});

test('native MCP stdio client uses NDJSON initialize/list/call and validates structured result', async () => {
  const log = [];
  const client = new JapaneseParserMCPClient({ spawnImpl: mcpSpawnStub(log), timeoutMs: 100, initTimeoutMs: 200 });
  try {
    const originalText = 'UIは残せ。APIだけ変更しろ。';
    const result = await client.analyze({ originalText, executionMode: 'external_action', runDeepAnalysis: true, deadlineMs: 50 });
    assert.equal(result.original_text, originalText);
    assert.equal(result.meaning_graph.semantic_hash, 'semantic-test-hash');
    assert.equal(result.astera_mcp_transport.protocol_version, MCP_PROTOCOL_VERSION);
    assert.deepEqual(log.map((message) => message.method), ['initialize', 'notifications/initialized', 'tools/list', 'tools/call']);
    assert.equal(log[3].params.name, 'analyze_japanese');
    assert.equal(log[3].params.arguments.execution_mode, 'external_action');
  } finally { await client.destroy(); }
});

test('every Japanese request uses Parser MCP, including short single-task input', async () => {
  const heavy = 'UIは残せ。APIだけ変更しろ。';
  const short = 'APIを改善する。';
  assert.equal(needsJapaneseParser(heavy, analyzeRequest({ question: heavy })), true);
  assert.equal(needsJapaneseParser(short, analyzeRequest({ question: short })), true);
  let calls = 0;
  const client = { async analyze({ originalText }) { calls += 1; return parserResponse(originalText); }, async destroy() {} };
  await withEngine(async (engine) => {
    const preparedHeavy = await engine.prepareRequest({ question: heavy });
    assert.equal(preparedHeavy.instruction_understanding.mode, 'DEEP_PATH');
    assert.deepEqual(preparedHeavy.analysis_task_packet.tasks.map((item) => item.id), ['P001', 'P002']);
    const preparedShort = await engine.prepareRequest({ question: short });
    assert.equal(preparedShort.instruction_understanding.mode, 'DEEP_PATH');
    assert.equal(calls, 2);
  }, client);
});

test('Parser task graph is routed through Lens per task before 5-stage processing', async () => {
  const question = 'UIは残せ。APIだけ変更しろ。';
  await withEngine(async (engine) => {
    const out = await engine.process({ question }, tenant);
    assert.equal(out.runtime.instruction_mode, 'DEEP_PATH');
    assert.deepEqual(out.result.analysis_task_packet.tasks.map((item) => item.id), ['P001', 'P002']);
    assert.equal(Object.keys(out.result.judgment.lens_routing.per_task).length, 2);
    assert.ok(out.result.judgment.lens_routing.per_task.P001);
    assert.ok(out.result.judgment.lens_routing.per_task.P002);
    assert.equal(out.result.judgment.lens_routing.per_task.P002.primary?.id, 'G29');
    assert.equal(out.result.five_stage.tasks.length, 2);
    assert.deepEqual(out.result.five_stage.execution_waves, [['P001'], ['P002']]);
    for (const key of out.result.judgment.order) assert.equal(out.result.judgment[key].decision_basis.instruction_understanding.semantic_hash, 'semantic-test-hash');
  }, parserClient(parserResponse));
});

test('Parser action guard blocks external action regardless of candidate score', async () => {
  const question = 'UIは残せ。APIだけ変更しろ。';
  const client = parserClient((originalText) => parserResponse(originalText, { executionAllowed: false, blockedReasons: ['UNRESOLVED_REFERENCE'] }));
  await withEngine(async (engine) => {
    const out = await engine.process({ question }, tenant);
    const modify = out.result.task_results.find((item) => item.task.id === 'P002');
    assert.ok(modify.task.hard_blockers.includes('PARSER_ACTION_GUARD_BLOCKED'));
    assert.equal(modify.comparison.verdict.decision, 'hold_and_clarify');
    assert.ok(modify.comparison.verdict.gate_rule_ids.includes('COMPARE-GATE-HARD-BLOCKER'));
    assert.equal(out.result.comparison.verdict.decision, 'hold_and_clarify');
  }, client);
});

test('Parser failure is explicit degraded mode and Japanese decisions fail closed', async () => {
  const question = 'APIを改善する。';
  const error = new Error('parser unavailable'); error.code = 'PARSER_PROCESS_UNAVAILABLE';
  const client = { async analyze() { throw error; }, async destroy() {} };
  await withEngine(async (engine) => {
    const out = await engine.process({ question }, tenant);
    assert.equal(out.runtime.instruction_mode, 'DEGRADED');
    assert.ok(out.result.analysis_task_packet.unresolved.some((item) => /JAPANESE_PARSER_DEGRADED/.test(item)));
    assert.ok(out.result.analysis_task_packet.hard_blockers.includes('JAPANESE_PARSER_DEGRADED'));
    assert.equal(out.result.comparison.verdict.decision, 'hold_and_clarify');
  }, client);
});

test('internal runtime tests do not force Evidence Search while external fact verification does', () => {
  const external = {
    id: 'T-EXT', action: 'verify', target: 'current API specification', objective: 'Verify the current API specification from an official source.',
    verification: ['official source'], success_criteria: [], completion_criteria: [], conditions: [], evidence_need: { required: false, reasons: [], queries: [] }
  };
  const internal = {
    id: 'T-INT', action: 'verify', target: 'regression test', objective: 'Run the regression test and verify the build result.',
    verification: ['regression test passes'], success_criteria: [], completion_criteria: [], conditions: [], evidence_need: { required: false, reasons: [], queries: [] }
  };
  const externalDomain = routeDomainTemplates({ question: 'current API server specification official source verify' });
  const internalDomain = routeDomainTemplates({ question: 'API regression test build verification' });
  assert.equal(deriveEvidenceNeed(external, externalDomain).required, true);
  assert.equal(deriveEvidenceNeed(internal, internalDomain).required, false);
});

test('input premise is never promoted to fact without a VALID evidence packet', async () => {
  const claim = 'Node.js 22は本番で対応している';
  const question = `${claim}。公式根拠で対応状況を検証する。`;
  await withEngine(async (engine) => {
    const out = await engine.process({ question }, tenant);
    assert.equal(out.result.facts.confirmed.length, 0);
    assert.ok(out.result.facts.unconfirmed.length >= 1);
    assert.equal(out.result.comparison.verdict.decision, 'hold_and_clarify');
  }, parserClient((originalText) => evidenceParserResponse(originalText, claim)));
});

test('FINAL_VALID OFFICIAL evidence supports a matching parser premise and reaches Main8', async () => {
  const claim = 'Node.js 22は本番で対応している';
  const question = `${claim}。公式根拠で対応状況を検証する。`;
  await withEngine(async (engine) => {
    const out = await engine.process({ question, evidencePacket: validEvidence(claim) }, tenant);
    assert.ok(out.result.facts.confirmed.some((item) => item.status === 'AUTHORITATIVE_EVIDENCE_SUPPORTED'));
    assert.equal(out.result.facts.evidence_state.state, 'VALID');
    assert.ok(out.result.judgment['03_facts'].confirmed.length >= 1);
    assert.ok(out.result.judgment['03_facts'].decision_basis.evidence_refs.length >= 1);
  }, parserClient((originalText) => evidenceParserResponse(originalText, claim)));
});

test('two independent SECONDARY sources can corroborate a premise after the final evidence quality gate', async () => {
  const claim = 'Node.js 22は本番で対応している';
  const question = `${claim}。根拠で対応状況を検証する。`;
  await withEngine(async (engine) => {
    const out = await engine.process({ question, evidencePacket: secondaryEvidence(claim) }, tenant);
    assert.ok(out.result.facts.confirmed.some((item) => item.status === 'INDEPENDENT_CORROBORATION_SUPPORTED'));
    assert.ok(out.result.facts.corroborating_evidence.length >= 2);
  }, parserClient((originalText) => evidenceParserResponse(originalText, claim)));
});

test('forged FINAL_VALID without the one reinforcement and new corroboration is rejected and held', async () => {
  const claim = 'Node.js 22は本番で対応している';
  const packet = validEvidence(claim);
  packet.quality.reinforcement_attempt_count = 0;
  packet.quality.new_corroboration_count = 0;
  const normalized = normalizeEvidencePacket(packet);
  assert.equal(normalized.state, 'REJECTED');
  assert.ok(normalized.eligibility_reasons.includes('REINFORCEMENT_COUNT_INVALID'));
  assert.ok(normalized.eligibility_reasons.includes('NEW_CORROBORATION_MISSING'));
  const question = `${claim}。公式根拠で対応状況を検証する。`;
  await withEngine(async (engine) => {
    const out = await engine.process({ question, evidencePacket: packet }, tenant);
    assert.equal(out.result.facts.confirmed.length, 0);
    assert.equal(out.result.comparison.verdict.decision, 'hold_and_clarify');
    assert.ok(out.result.risks.risks.some((item) => item.key === 'required_evidence_missing'));
  }, parserClient((originalText) => evidenceParserResponse(originalText, claim)));
});

test('REJECTED evidence never becomes a supported fact and blocks recommendation when evidence is required', async () => {
  const claim = 'Node.js 22は本番で対応している';
  const packet = validEvidence(claim);
  packet.status = 'REJECTED_BLOCKING';
  packet.quality.final = { status: 'REJECTED_BLOCKING', phase: 'FINAL', score_bp: 4200, gates: { final_minimum_bp: 9500 }, blocking_reasons: ['SOURCE_CONFLICT'] };
  const question = `${claim}。公式根拠で対応状況を検証する。`;
  await withEngine(async (engine) => {
    const out = await engine.process({ question, evidencePacket: packet }, tenant);
    assert.equal(out.result.facts.confirmed.length, 0);
    assert.equal(out.result.facts.evidence_state.state, 'REJECTED');
    assert.ok(out.result.risks.risks.some((item) => item.key === 'evidence_quality'));
    assert.equal(out.result.comparison.verdict.decision, 'hold_and_clarify');
  }, parserClient((originalText) => evidenceParserResponse(originalText, claim)));
});

test('five deterministic dialectic candidates use evidence-aware metrics and bad-hand is never selected', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({ question: 'Improve Astera decision materials while preserving non-AI boundaries and rollback. Compare risks before completion.', language: 'en' }, tenant);
    const candidates = out.result.hyperion.dialectic.candidates;
    assert.ok(candidates.length >= 5);
    assert.ok(candidates.every((candidate) => candidate.metrics && Number.isInteger(candidate.score)));
    assert.ok(candidates.every((candidate) => Number.isInteger(candidate.metrics.evidenceFit)));
    assert.notEqual(out.result.comparison.selected_candidate?.id, 'bad_hand');
    assert.ok(out.result.comparison.rejected_candidates.some((candidate) => candidate.id === 'bad_hand'));
  }, null);
});

test('same English task graph stays deterministic across repeated executions', async () => {
  await withEngine(async (engine) => {
    const input = { question: 'Verify the current API specification from an official source. Then compare migration options. Finally verify rollback tests.', taskEvidencePackets: { T01: validEvidence('current API specification') }, language: 'en' };
    const first = await engine.process(input, tenant);
    const expected = JSON.stringify({ task_graph: first.result.analysis_task_packet, five: first.result.five_stage, comparison: first.result.comparison, judgment: first.result.judgment, material: first.material });
    for (let i = 0; i < 10; i += 1) {
      const next = await engine.process(input, tenant);
      assert.equal(JSON.stringify({ task_graph: next.result.analysis_task_packet, five: next.result.five_stage, comparison: next.result.comparison, judgment: next.result.judgment, material: next.material }), expected);
    }
  }, null);
});

test('visible English output keeps fixed Main8 and explicit decision basis without Parser MCP', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({ question: 'Compare two API migration options. Success means compatibility and rollback.', language: 'en' }, tenant);
    assert.equal(out.result.judgment.output_language, 'en');
    assert.equal(out.result.judgment['01_purpose'].label, '01 True Objective');
    assert.match(out.material.text, /Decision Basis/);
    assert.doesNotMatch(out.material.text, /判断基準/);
    assert.equal(out.runtime.instruction_mode, 'FAST_PATH');
  }, null);
});
