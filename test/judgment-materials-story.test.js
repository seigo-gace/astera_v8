'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');
const KaguraEngine = require('../src/kagura-engine');
const { analyzeRequest } = require('../src/judgment-materials-analyzer');
const { routeDomainTemplates } = require('../src/domain-template-router');
const {
  QUERY_ROLES,
  buildCanonicalTaskPlan
} = require('../src/canonical-claim-runtime');
const { projectCanonicalTask } = require('../src/canonical-task-projection');
const { UndeterminedReason } = require('../src/v4-canonical/confirmation');
const { CandidateRelation, EvidenceSource } = require('../src/v4-canonical/evidence-binding');

const {
  createMockJapaneseParserClient,
  mockJapaneseParserResult,
  mockJapaneseParserResultFromSentences
} = require('./helpers/japanese-parser-mcp-mock');

const silentLogger = { write() {} };
const tenant = { id: 'judgment-materials-story', is_global: true, plan: 'admin' };

const MAIN8_ORDER = Object.freeze([
  '01_purpose',
  '02_premise',
  '03_facts',
  '04_crisis',
  '05_opposition',
  '06_comparison',
  '07_evidence_status',
  '08_reinstruction'
]);

async function withEngine(options, fn) {
  const engine = new CanonicalAsteraEngine({
    poolSize: 2,
    logger: silentLogger,
    japaneseParserClient: createMockJapaneseParserClient(),
    ...options
  });
  try {
    await fn(engine);
  } finally {
    await engine.destroy();
  }
}

class ConflictEvidenceEngine extends CanonicalAsteraEngine {
  constructor(options = {}) {
    super(options);
    this._fixtureEvidence = null;
  }

  setFixtureEvidence(packet) {
    this._fixtureEvidence = packet;
    return this;
  }

  async resolveEvidenceForTask() {
    return this._fixtureEvidence;
  }
}

function evidenceCandidate({ id, role, family, authority, claim, url }) {
  return {
    candidate_id: id,
    canonical_record_id: `${id}-record`,
    content_hash: `${id}-hash`,
    source_role: role,
    source_family_id: family,
    source_id: `${id}-source`,
    provider_id: `${id}-provider`,
    authority_id: authority,
    canonical_locator: { url, replayable: true },
    updated_at: '2026-08-20T00:00:00.000Z',
    fields: { claim },
    excerpt: claim
  };
}

function queryExecution(queries = []) {
  return {
    initial: queries.map((query) => ({
      query_id: query.query_id,
      claim_id: query.claim_id,
      role: query.role,
      status: 'FOUND',
      provider_records: [
        { provider_id: 'ev-official-provider', status: 'FOUND', candidate_record_ids: ['ev-official-record'] },
        { provider_id: 'ev-corroboration-provider', status: 'FOUND', candidate_record_ids: ['ev-corroboration-record'] }
      ]
    })),
    reinforcement: []
  };
}

function validEvidence(claim, queries = [], extraCandidates = []) {
  return {
    schema_version: 'astera.evidence-search.result.v1',
    request_id: 'ev-story',
    tenant_id: 'test',
    status: 'FINAL_VALID',
    effective_as_of: '2026-08-20T00:00:00.000Z',
    result_hash: 'test-result-hash',
    planning_authority: 'UPSTREAM_CANONICAL',
    planned_query_roles: Object.values(QUERY_ROLES),
    evidence: [
      evidenceCandidate({ id: 'ev-official', role: 'OFFICIAL', family: 'official-family', authority: 'official-authority', claim, url: 'https://official.test/evidence' }),
      evidenceCandidate({ id: 'ev-corroboration', role: 'SECONDARY', family: 'corroboration-family', authority: 'corroboration-authority', claim, url: 'https://corroboration.test/evidence' }),
      ...extraCandidates
    ],
    coverage: { discovery_scope_state: 'COMPLETE_FOR_QUERY_SCOPE', registry_coverage_state: 'COMPLETE_FOR_ACTIVE_REGISTRY' },
    quality: {
      initial: { status: 'REINFORCEMENT_REQUIRED', phase: 'INITIAL', score_bp: 8500, gates: { initial_minimum_bp: 8000, final_minimum_bp: 9500 }, blocking_reasons: [] },
      reinforcement_attempt_count: 1,
      new_corroboration_count: 1,
      final: { status: 'FINAL_VALID', phase: 'FINAL', score_bp: 9700, gates: { initial_minimum_bp: 8000, final_minimum_bp: 9500 }, blocking_reasons: [] }
    },
    query_execution: queryExecution(queries),
    provider_execution: {
      initial: [{ provider_id: 'ev-official-provider', status: 'FULFILLED' }],
      reinforcement: [{ provider_id: 'ev-corroboration-provider', status: 'FULFILLED' }]
    },
    ai_used: false,
    payment_executed: false
  };
}

function assertNoNormativeDecisionArtifacts(result, materialText = '') {
  assert.equal(result.decision_authority, 'EXTERNAL_ONLY');
  assert.equal(result.no_normative_decision_generated, true);
  assert.equal(result.comparison?.material_only, true);
  assert.equal(result.comparison?.selected_candidate, null);
  assert.deepEqual(result.comparison?.candidate_ranking || [], []);
  assert.equal(Object.hasOwn(result, 'recommendation'), false);
  assert.equal(Object.hasOwn(result, 'winner'), false);
  if (materialText) {
    assert.doesNotMatch(materialText, /\bWinner\b/i);
    assert.doesNotMatch(materialText, /selected_candidate=/);
  }
}

function partialMockClient(extra = {}) {
  return createMockJapaneseParserClient({
    resolveResult: (text) => Object.assign(mockJapaneseParserResultFromSentences(text), {
      overall_status: 'PARTIAL',
      ambiguities: [{ type: 'SCOPE_AMBIGUOUS', note: 'environment scope unresolved' }],
      ...extra
    })
  });
}

test('Story 01: English single analyze yields cognitive_map, Main8, EXTERNAL_ONLY', async () => {
  await withEngine({}, async (engine) => {
    const out = await engine.process({
      question: 'Compare two API migration options. Success means compatibility and rollback.',
      language: 'en'
    }, tenant);
    assert.equal(out.result.type, 'cognitive_map');
    assert.deepEqual(out.result.judgment.order, MAIN8_ORDER);
    assert.equal(out.result.judgment.order.length, 8);
    assertNoNormativeDecisionArtifacts(out.result, out.material.text);
    for (const key of MAIN8_ORDER) {
      assert.ok(out.result.judgment[key], `missing ${key}`);
    }
  });
});

test('Story 02: Japanese mock MCP uses DEEP_PATH, meaning projection, and Main8', async () => {
  await withEngine({}, async (engine) => {
    const out = await engine.process({
      question: 'APIを検証する。成功条件は互換性を維持することである。',
      language: 'ja'
    }, tenant);
    assert.equal(out.result.type, 'cognitive_map');
    assert.equal(out.result.instruction_understanding.mode, 'DEEP_PATH');
    assert.equal(out.result.instruction_understanding.parser, 'Deterministic-Japanese-Parser-MCP');
    assert.ok(out.result.instruction_understanding.semantic_hash || out.result.instruction_understanding.transport?.semantic_hash);
    assert.deepEqual(out.result.judgment.order, MAIN8_ORDER);
    assert.equal(out.result.judgment['01_purpose'].decision_basis.instruction_understanding.mode, 'DEEP_PATH');
  });
});

test('Story 03: sequential multi-task input uses multiple execution waves', async () => {
  await withEngine({}, async (engine) => {
    const out = await engine.process({
      question: 'API仕様を公式根拠で検証する。その後、互換性を維持して段階移行する。最後にテストする。成功条件はRollback可能であること。'
    }, tenant);
    assert.equal(out.result.type, 'cognitive_map');
    assert.ok(out.result.analysis_task_packet.tasks.length >= 2);
    assert.ok(out.result.analysis_task_packet.execution_waves.length >= 2);
    assert.ok(out.result.analysis_task_packet.execution_waves.every((wave) => wave.length >= 1));
  });
});

test('Story 04: parallelizable tasks share one execution wave', async () => {
  await withEngine({}, async (engine) => {
    const out = await engine.process({ question: 'Aを実装する。Bを実装する。', language: 'ja' }, tenant);
    assert.equal(out.result.type, 'cognitive_map');
    assert.ok(out.result.analysis_task_packet.execution_waves[0].length >= 2);
    const waveIds = new Set(out.result.analysis_task_packet.execution_waves[0]);
    const groups = out.result.analysis_task_packet.tasks
      .filter((task) => waveIds.has(task.id))
      .map((task) => task.parallel_group);
    assert.equal(new Set(groups).size, 1);
    assert.ok(groups[0]);
  });
});

test('Story 05: compare input keeps material-only comparison lanes', async () => {
  await withEngine({}, async (engine) => {
    const out = await engine.process({
      question: 'A案とB案を費用と安全性で比較する。',
      language: 'ja'
    }, tenant);
    assert.equal(out.result.type, 'cognitive_map');
    const s06 = out.result.judgment['06_comparison'];
    assert.deepEqual(s06.comparison_candidates.map((c) => c.label || c), ['A案', 'B案']);
    assert.equal(s06.selected_candidate, null);
    assert.deepEqual(s06.candidate_ranking, []);
    assert.match(out.material.text, /candidate_id: candidate:1:A案/);
    assertNoNormativeDecisionArtifacts(out.result, out.material.text);
  });
});

test('Story 06: prohibitions and preserve remain on Task Graph constraints', async () => {
  await withEngine({}, async (engine) => {
    const out = await engine.process({
      question: 'READMEは残す。APIを改善する。成功条件は互換性維持とRollback可能であること。mainは変更するな。',
      language: 'ja'
    }, tenant);
    assert.equal(out.result.type, 'cognitive_map');
    const packet = out.result.analysis_task_packet;
    assert.ok(packet.preserve.some((item) => /README/i.test(item)));
    assert.ok(packet.prohibitions.some((item) => /main|変更するな/i.test(item)));
    const constraintsUsed = out.result.judgment['02_premise'].decision_basis.constraints_used || [];
    assert.ok(constraintsUsed.some((item) => /README|main|変更/i.test(String(item))));
  });
});

test('Story 07: conditional branches remain attached to tasks', async () => {
  await withEngine({}, async (engine) => {
    const out = await engine.process({
      question: 'APIサーバーを検証する。検証が成功した場合に互換性を確認する。',
      language: 'ja'
    }, tenant);
    assert.equal(out.result.type, 'cognitive_map');
    assert.ok(out.result.analysis_task_packet.branches.length >= 1);
    assert.ok(out.result.judgment.task_graph.branches.length >= 1);
    assert.ok(out.result.analysis_task_packet.tasks.some((task) => (task.branches || []).length >= 1));
  });
});

test('Story 08: hard_blockers stop Task/Claim/Evidence without fabricated Main8', async () => {
  await withEngine({}, async (engine) => {
    const out = await engine.process({
      question: 'APIを変更する。APIを変更するな。成功条件は互換性を維持することである。',
      language: 'ja'
    }, tenant);
    assert.equal(out.result.type, 'task_graph_blocked');
    assert.equal(out.result.task_processing_started, false);
    assert.equal(out.result.evidence_processing_started, false);
    assert.equal(out.result.judgment, undefined);
    assert.match(out.material.text, /Task Graphを安全に実行できないため/);
  });
});

test('Story 09: evidence SUPPORT, COUNTER, and UNDETERMINED are all preserved', async () => {
  const engine = new ConflictEvidenceEngine({
    poolSize: 2,
    logger: silentLogger,
    japaneseParserClient: createMockJapaneseParserClient()
  });
  try {
    const claimText = 'Node.js 22は本番で対応している。';
    const prepared = await engine.prepareRequest({ question: claimText, language: 'ja' });
    const task = prepared.analysis_task_packet.tasks[0];
    const domain = routeDomainTemplates({ question: claimText });
    const plan = buildCanonicalTaskPlan(task, domain);
    const claim = plan.claims[0];
    const contradictClaim = 'Node.js 22は本番で対応していない。';
    engine.setFixtureEvidence(validEvidence(claim.raw_text, plan.search_plan.queries, [
      evidenceCandidate({
        id: 'ev-contradict',
        role: 'SECONDARY',
        family: 'contradict-family',
        authority: 'contradict-authority',
        claim: contradictClaim,
        url: 'https://contradict.test/evidence'
      })
    ]));

    const out = await engine.process({ question: claimText, language: 'ja' }, tenant);
    assert.equal(out.result.canonical_claims.status, 'UNDETERMINED');
    const record = out.result.canonical_claims.records[0];
    const relations = (record.confirmation.bindings || []).map((binding) => binding.relation);
    assert.ok(relations.includes(CandidateRelation.SUPPORTS));
    assert.ok(relations.includes(CandidateRelation.CONTRADICTS));
    assert.ok(record.confirmation.reasons.includes(UndeterminedReason.CONFLICT));

    const projected = projectCanonicalTask({
      task: { ...task, canonical_plan: plan, domain },
      evidenceRaw: engine._fixtureEvidence
    });
    assert.equal(projected.canonical.records[0].confirmation.status, 'UNDETERMINED');
    assert.ok(
      (projected.canonical.records[0].confirmation.bindings || []).some((binding) => binding.relation === CandidateRelation.CONTRADICTS)
    );
  } finally {
    await engine.destroy();
  }
});

test('Story 10: MCP unavailable fails closed and never uses builtin Japanese analyzer', async () => {
  assert.throws(
    () => analyzeRequest({ question: 'APIを改善する。' }),
    (error) => error.code === 'JAPANESE_BUILTIN_ANALYZER_DISABLED'
  );
  await withEngine({ japaneseParserClient: null }, async (engine) => {
    const out = await engine.process({
      question: 'APIを改善する。成功条件は互換性である。',
      language: 'ja'
    }, tenant);
    assert.equal(out.result.type, 'clarification_needed');
    assert.equal(out.result.request_model.instruction_understanding.mode, 'FAIL_CLOSED');
    assert.ok(out.result.request_model.analysis_task_packet.unresolved.some((item) => /JAPANESE_PARSER_FAIL_CLOSED/.test(item)));
    assert.equal(out.result.judgment, undefined);
  });
  await withEngine({
    japaneseParserClient: createMockJapaneseParserClient({
      resolveResult: () => mockJapaneseParserResult('APIを改善する。', { overall_status: 'FAILED', execution_allowed: false })
    })
  }, async (engine) => {
    const out = await engine.process({ question: 'APIを改善する。', language: 'ja' }, tenant);
    assert.equal(out.result.type, 'clarification_needed');
    assert.equal(out.result.request_model.instruction_understanding.mode, 'FAIL_CLOSED');
    assert.ok(out.result.request_model.analysis_task_packet.hard_blockers.some((item) => /PARSER_OVERALL_FAILED|JAPANESE_PARSER_FAIL_CLOSED/.test(String(item))));
  });
});

test('Story 11: MCP PARTIAL keeps ambiguity and still processes resolved tasks', async () => {
  await withEngine({ japaneseParserClient: partialMockClient() }, async (engine) => {
    const out = await engine.process({ question: 'Aを実装する。Bを実装する。', language: 'ja' }, tenant);
    assert.equal(out.result.type, 'cognitive_map');
    assert.equal(out.result.instruction_understanding.overall_status, 'PARTIAL');
    const unresolved = out.result.analysis_task_packet.unresolved || [];
    assert.ok(unresolved.some((item) => /ambiguity:/.test(item)));
    assert.ok(unresolved.some((item) => item === 'parser_overall_status:PARTIAL'));
    assert.ok(out.result.analysis_task_packet.tasks.length >= 1);
    assert.deepEqual(out.result.judgment.order, MAIN8_ORDER);
  });
});

test('Story 12: empty Task Graph returns clarification with parser_task_graph_empty', async () => {
  await withEngine({
    japaneseParserClient: createMockJapaneseParserClient({
      resolveResult: (text) => mockJapaneseParserResult(text, {
        task_graph: { graph_version: 'mock-v1', tasks: [], edges: [], constraints: [] }
      })
    })
  }, async (engine) => {
    const out = await engine.process({ question: 'APIを改善する。', language: 'ja' }, tenant);
    assert.equal(out.result.type, 'clarification_needed');
    const unresolved = out.result.request_model?.analysis_task_packet?.unresolved || [];
    assert.ok(unresolved.includes('parser_task_graph_empty'));
    assert.equal(out.result.judgment, undefined);
    assert.doesNotMatch(out.material.text, /07 根拠成立状態/);
  });
});

test('Story 13: repeated process stays deterministic on core material fields', async () => {
  await withEngine({}, async (engine) => {
    const input = {
      question: 'API仕様を公式根拠で検証する。その後、互換性を維持して段階移行する。最後にテストする。成功条件はRollback可能であること。'
    };
    const first = await engine.process(input, tenant);
    const fingerprint = JSON.stringify({
      task_graph: first.result.analysis_task_packet,
      judgment: first.result.judgment,
      comparison: first.result.comparison,
      material: first.material
    });
    const second = await engine.process(input, tenant);
    assert.equal(JSON.stringify({
      task_graph: second.result.analysis_task_packet,
      judgment: second.result.judgment,
      comparison: second.result.comparison,
      material: second.material
    }), fingerprint);
  });
});

test('Story 14: judgment material text exposes Main8 section headers', async () => {
  await withEngine({}, async (engine) => {
    const out = await engine.process({
      question: 'Compare API options on cost and safety.',
      language: 'en'
    }, tenant);
    assert.match(out.material.text, /01 True Objective/);
    assert.match(out.material.text, /08 Re-instruction to Main AI/);
    assert.equal((out.material.text.match(/^---$/gm) || []).length, 7);
    assert.match(out.material.text, /07 Evidence Status/);
  });
});

test('Story 15: resolved Lens and domain attach to each Task', async () => {
  await withEngine({}, async (engine) => {
    const out = await engine.process({
      question: 'APIサーバーのシステム開発を改善する。契約条件を確認する。',
      language: 'ja'
    }, tenant);
    assert.equal(out.result.type, 'cognitive_map');
    const tasks = out.result.analysis_task_packet.tasks;
    assert.ok(tasks.length >= 2);
    assert.equal(out.result.task_results[0].task.domain.primary?.id, 'G29');
    assert.equal(out.result.judgment.lens_routing.per_task[tasks[0].id].primary?.id, 'G29');
    assert.equal(out.result.judgment.lens_routing.per_task[tasks[1].id].primary, null);
  });
});

test('Story 16: evidence search boundary invokes external search client once per required task', async () => {
  const calls = [];
  const evidenceSearchClient = {
    async search(payload, context) {
      calls.push({ payload, context });
      return validEvidence('verified official API compatibility', payload.preplanned_queries || []);
    }
  };
  const engine = new KaguraEngine({
    poolSize: 2,
    logger: silentLogger,
    evidenceSearchClient,
    japaneseParserClient: createMockJapaneseParserClient()
  });
  try {
    const out = await engine.process({
      question: 'Verify the current API specification using official evidence.',
      language: 'en'
    }, tenant);
    assert.equal(out.result.type, 'cognitive_map');
    assert.ok(calls.length >= 1);
    assert.ok(calls.every((call) => call.payload.paid_search.enabled === false));
    assert.ok(out.result.task_results.some((result) => result.evidence?.source_status === 'FINAL_VALID'));
  } finally {
    await engine.destroy();
  }
});
