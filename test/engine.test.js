'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');
const { analyzeRequest, deriveEvidenceNeed, normalizeEvidencePacket } = require('../src/judgment-materials-analyzer');
const { routeDomainTemplates } = require('../src/domain-template-router');

const silentLogger = { write() {} };
const tenant = { id: 'test', is_global: true, plan: 'admin' };

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
    updated_at: '2026-08-16T00:00:00.000Z',
    fields: { claim },
    excerpt: claim
  };
}

function validEvidence(claim) {
  return {
    schema_version: 'astera.evidence-search.result.v1',
    request_id: 'ev-test', tenant_id: 'test', status: 'FINAL_VALID', effective_as_of: '2026-08-16T00:00:00.000Z', result_hash: 'test-result-hash',
    evidence: [
      evidenceCandidate({ id:'ev-official', role:'OFFICIAL', family:'official-family', authority:'official-authority', claim, url:'https://official.test/evidence' }),
      evidenceCandidate({ id:'ev-corroboration', role:'SECONDARY', family:'corroboration-family', authority:'corroboration-authority', claim, url:'https://corroboration.test/evidence' })
    ],
    coverage: { discovery_scope_state:'COMPLETE_FOR_QUERY_SCOPE', registry_coverage_state:'COMPLETE' },
    quality: {
      initial: { status:'REINFORCEMENT_REQUIRED', phase:'INITIAL', score_bp:8500, gates:{initial_minimum_bp:8000,final_minimum_bp:9500}, blocking_reasons:[] },
      reinforcement_attempt_count: 1,
      new_corroboration_count: 1,
      final: { status:'FINAL_VALID', phase:'FINAL', score_bp:9700, gates:{initial_minimum_bp:8000,final_minimum_bp:9500}, blocking_reasons:[] }
    },
    provider_execution: { initial:[{provider_id:'ev-official-provider',status:'FULFILLED'}], reinforcement:[{provider_id:'ev-corroboration-provider',status:'FULFILLED'}] },
    ai_used:false, payment_executed:false
  };
}

async function withEngine(fn) {
  const engine = new CanonicalAsteraEngine({ poolSize:4, logger:silentLogger });
  try { await fn(engine); } finally { await engine.destroy(); }
}

test('Japanese input is decomposed internally without any MCP-required placeholder', () => {
  const request=analyzeRequest({question:'READMEは残す。APIを改善する。mainは変更するな。成功条件はRollback可能であること。'});
  const packet=request.analysis_task_packet;
  assert.equal(request.language,'ja');
  assert.equal(request.instruction_understanding.mode,'INTERNAL_DETERMINISTIC');
  assert.equal(packet.tasks.some((task)=>task.id==='JP-MCP-REQUIRED'),false);
  assert.equal(packet.unresolved.some((item)=>/MCP/i.test(item)),false);
  assert.ok(packet.tasks.length>=2);
  assert.ok(packet.preserve.some((item)=>/README/.test(item)));
  assert.ok(packet.prohibitions.some((item)=>/main/.test(item)));
});

test('compound instruction preserves prohibition, preserve, dependencies, completion criteria and execution waves', () => {
  const request=analyzeRequest({question:'READMEは残す。APIの現状を公式根拠で検証する。その後、互換性を維持したままAPIを改善する。最後にテストで確認する。勝手にmainは変更するな。成功条件はRollback可能であること。'});
  const packet=request.analysis_task_packet;
  assert.ok(packet.tasks.length>=4);
  assert.ok(packet.preserve.some((item)=>/README|互換性/.test(item)));
  assert.ok(packet.prohibitions.some((item)=>/main/.test(item)));
  assert.ok(packet.dependencies.some((item)=>item.to==='T03'));
  assert.ok(packet.dependencies.some((item)=>item.to==='T04'));
  assert.ok(packet.execution_waves.length>=3);
  assert.ok(packet.source_spans.every((item)=>Number.isInteger(item.start)&&Number.isInteger(item.end)));
  assert.equal(packet.tasks[1].target,'APIの現状');
  assert.equal(packet.tasks[2].action,'improve');
  assert.ok(packet.completion_criteria.some((item)=>/Rollback/.test(item)));
});

test('internal test verification does not force external Evidence Search while external verification does', () => {
  const request=analyzeRequest({question:'現在のAPI仕様を公式根拠で検証する。その後テストで動作確認する。'});
  assert.equal(request.analysis_task_packet.tasks.length,2);
  const external=request.analysis_task_packet.tasks[0],internal=request.analysis_task_packet.tasks[1];
  assert.equal(deriveEvidenceNeed(external,routeDomainTemplates({question:external.source_span.text})).required,true);
  assert.equal(deriveEvidenceNeed(internal,routeDomainTemplates({question:internal.source_span.text})).required,false);
});

test('Evidence FINAL_VALID is accepted only when 80/95, reinforcement, corroboration, hash and non-AI contracts hold', () => {
  const valid=normalizeEvidencePacket(validEvidence('API compatibility is preserved'));
  assert.equal(valid.state,'VALID');
  assert.equal(valid.initial_quality_score_bp,8500);
  assert.equal(valid.quality_score_bp,9700);
  assert.equal(valid.reinforcement_attempt_count,1);
  assert.equal(valid.new_corroboration_count,1);
  assert.equal(valid.distinct_authority_count,2);
  assert.equal(valid.distinct_source_family_count,2);
  const broken=validEvidence('API compatibility is preserved');
  broken.quality.reinforcement_attempt_count=0;
  broken.provider_execution.reinforcement=[];
  const rejected=normalizeEvidencePacket(broken);
  assert.equal(rejected.state,'REJECTED');
  assert.ok(rejected.eligibility_reasons.includes('REINFORCEMENT_COUNT_INVALID'));
  assert.ok(rejected.eligibility_reasons.includes('REINFORCEMENT_EXECUTION_MISSING'));
});

test('non-AI V8 runtime builds Task Graph before Lens and all Main8 sections carry decision traces', async () => {
  await withEngine(async (engine)=>{
    const out=await engine.process({question:'READMEは残す。APIを改善する。成功条件は互換性維持とRollback可能であること。mainは変更するな。'},tenant);
    assert.equal(out.result.non_ai,true); assert.equal(out.runtime.ai_used,false); assert.equal(out.runtime.llm_called,false); assert.equal(out.runtime.engine,'v8_canonical_global_rules'); assert.equal(Object.hasOwn(out,'answer'),false);
    assert.ok(out.result.analysis_task_packet.tasks.length>=2); assert.deepEqual(out.result.five_stage.order,['fact','risk','multi','inquiry','compare']); assert.equal(out.result.judgment.order.length,8);
    for(const key of out.result.judgment.order){const section=out.result.judgment[key];assert.ok(section.decision_basis);assert.ok(section.decision_basis.rule_ids.length>=1);assert.equal(section.decision_basis.task_ids.length,out.result.analysis_task_packet.tasks.length);assert.ok(Array.isArray(section.decision_basis.source_spans));}
    assert.match(out.material.text,/判断基準/);
  });
});

test('input claims are never promoted merely by wording, numbers, or product names', async () => {
  await withEngine(async (engine)=>{const out=await engine.process({question:'Node.js 22は本番で完全対応している。これを検証して判断する。成功条件は公式根拠があること。'},tenant);assert.equal(out.result.facts.confirmed.length,0);assert.ok(out.result.facts.unconfirmed.length>=1);});
});

test('strict FINAL_VALID evidence can support a matching premise in a single task', async () => {
  await withEngine(async (engine)=>{const claim='Node.js 22は本番で対応している';const out=await engine.process({question:`${claim}。対応状況を公式根拠で検証する。`,evidencePacket:validEvidence(claim)},tenant);assert.ok(out.result.facts.confirmed.some((item)=>item.status==='EVIDENCE_SUPPORTED'));assert.equal(out.result.facts.evidence_state.state,'VALID');});
});

test('rejected evidence never becomes a supported fact and blocks plain recommendation when required', async () => {
  await withEngine(async (engine)=>{const packet=validEvidence('Node.js 22は本番で対応している');packet.status='REJECTED_BLOCKING';packet.quality.final={status:'REJECTED_BLOCKING',phase:'FINAL',score_bp:4200,gates:{initial_minimum_bp:8000,final_minimum_bp:9500},blocking_reasons:['SOURCE_CONFLICT']};const out=await engine.process({question:'Node.js 22は本番で対応している。対応状況を公式根拠で検証する。',evidencePacket:packet},tenant);assert.equal(out.result.facts.confirmed.length,0);assert.equal(out.result.facts.evidence_state.state,'REJECTED');assert.ok(out.result.risks.risks.some((item)=>item.key==='evidence_quality'||item.key==='evidence_conflict'));assert.notEqual(out.result.comparison.verdict.decision,'recommend');});
});

test('five deterministic dialectic candidates remain input-specific and only Compare owns final scores and selection', async () => {
  await withEngine(async (engine)=>{const out=await engine.process({question:'旧Codeを分析し、根拠検索と責務分離を維持したままAstera本体を改善する。成功条件は非AIを維持し、未確認を事実化しないこと。'},tenant);const candidates=out.result.hyperion.dialectic.candidates;assert.ok(candidates.length>=5);assert.ok(candidates.some((candidate)=>/旧Code|Astera|根拠/.test(candidate.thesis)));assert.ok(candidates.every((candidate)=>candidate.metrics&&!Object.hasOwn(candidate,'score')));assert.ok(out.result.comparison.candidate_ranking.every((candidate)=>Number.isInteger(candidate.score)));assert.notEqual(out.result.comparison.selected_candidate?.id,'bad_hand');assert.ok(out.result.comparison.rejected_candidates.some((candidate)=>candidate.id==='bad_hand'));});
});

test('Task-specific Lens routing is retained per Analysis Task', async () => {
  await withEngine(async (engine)=>{const out=await engine.process({question:'契約条件を確認する。API実装を改善する。'},tenant);const routes=out.result.judgment.lens_routing.per_task;assert.equal(Object.keys(routes).length,out.result.analysis_task_packet.tasks.length);for(const task of out.result.analysis_task_packet.tasks)assert.ok(routes[task.id].primary?.id);});
});

test('same compound input remains deterministic across repeated executions', async () => {
  await withEngine(async (engine)=>{const input={question:'API仕様を公式根拠で検証する。その後、互換性を維持して段階移行する。最後にテストする。成功条件はRollback可能であること。',taskEvidencePackets:{T01:validEvidence('API仕様は互換性を維持する')}};const first=await engine.process(input,tenant);const expected=JSON.stringify({task_graph:first.result.analysis_task_packet,five:first.result.five_stage,comparison:first.result.comparison,judgment:first.result.judgment,material:first.material});for(let index=0;index<10;index+=1){const next=await engine.process(input,tenant);assert.equal(JSON.stringify({task_graph:next.result.analysis_task_packet,five:next.result.five_stage,comparison:next.result.comparison,judgment:next.result.judgment,material:next.material}),expected);}});
});

test('visible English output keeps fixed Main8 and explicit decision basis', async () => {
  await withEngine(async (engine)=>{const out=await engine.process({question:'Compare two API migration options. Success means compatibility and rollback.',language:'en'},tenant);assert.equal(out.result.judgment.output_language,'en');assert.equal(out.result.judgment['01_purpose'].label,'01 True Objective');assert.match(out.material.text,/Decision Basis/);assert.doesNotMatch(out.material.text,/判断基準/);});
});
