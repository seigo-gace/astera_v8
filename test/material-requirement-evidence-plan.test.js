'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { materialEvidencePlan, requestGraphForTask } = require('../src/runtime/material-requirement-evidence-plan');
const { compileQueryPlan } = require('../src/evidence-search/core/query-plan-compiler');

const base = { schema_version: 'astera.canonical-task-plan.v2', task_id: 'T01', claims: [], policy_by_claim_id: {}, search_plan: {
  schema_version: 'astera.upstream-search-plan.v2', planning_authority: 'ASTERA_DECISION_MATERIALS_V4',
  query_template_version: 'v4.0.0', queries: [], planned_query_roles: []
}};
const task = { id: 'T01', request_id: 'R01', target: '予約変更システムの移行', evidence_need: { required: true } };
const graph = { requests: [
  { owner_request_id: 'R01', nodes: [
    { slot_id: 'R01:MR01', material_kind: 'DECISION_CRITERION', question: '同時予約を防止する基準は何か', status: 'MISSING', required: true },
    { slot_id: 'R01:MR02', material_kind: 'FALSIFICATION_OR_DISQUALIFIER', question: '二重予約を生む反例', status: 'UNRESOLVED', required: true },
    { slot_id: 'R01:MR03', material_kind: 'OBSERVATION_VALIDATION', question: '遅延の報告は正しいか', status: 'UNRESOLVED', required: true },
    { slot_id: 'R01:MR04', material_kind: 'BOUNDARY_OR_PRECONDITION', question: '予約データは削除禁止', status: 'SATISFIED', required: true }
  ] },
  { owner_request_id: 'R02', nodes: [
    { slot_id: 'R02:MR01', material_kind: 'UNRESOLVED_ITEM', question: '別利用者の予算は何か', status: 'MISSING', required: true }
  ] }
] };

test('Material Graph requirements and additive Lens are included after routing, by Request only', () => {
  const domain = { primary: { id: 'G25', name: 'Engineering' } };
  const plan = materialEvidencePlan(task, graph, domain, base);
  assert.equal(requestGraphForTask(task, graph).owner_request_id, 'R01');
  const ids = plan.material_evidence_plan.planned_slot_ids;
  assert.ok(ids.includes('R01:MR01') && ids.includes('R01:MR02') && ids.includes('R01:MR03'));
  assert.ok(!ids.includes('R01:MR04'));
  assert.ok(ids.every(id => !id.startsWith('R02:')));
  assert.ok(ids.some(id => id.includes('LENS:risk:')), 'Lens risk requirements must be searched');
  assert.ok(ids.some(id => id.includes('LENS:compare:')), 'Lens comparison requirements must be searched');
  assert.ok(ids.some(id => id.includes('LENS:evidence:')) || ids.some(id => id.includes('LENS:fact:')));
  for (const id of ids) {
    const queries = plan.search_plan.queries.filter(q => q.requirement_slot_id === id);
    assert.deepEqual(queries.map(q => q.role), ['OFFICIAL', 'COUNTER']);
    assert.ok(queries.every(q => q.claim_id.startsWith('material-requirement:')));
    assert.ok(queries.every(q => q.owner_request_id === 'R01'));
  }
  const request = {
    question: task.target,
    upstream_search_plan: plan.search_plan,
    search: { free_projection: true, free_current: true, free_general_web: true },
    paid_search: { enabled: false },
    domain_lens: { id: 'G25' }
  };
  const compiled = compileQueryPlan(request);
  assert.equal(compiled.planning_authority, 'UPSTREAM_CANONICAL');
  assert.equal(compiled.primary_query_set.length, plan.search_plan.queries.length);
  assert.equal(plan.material_evidence_plan.coverage_complete, true);
});

test('No cross-Request borrowing when Request ID is absent or mismatched', () => {
  const wrong = { ...task, request_id: 'R99' };
  assert.equal(requestGraphForTask(wrong, graph), null);
  const plan = materialEvidencePlan(wrong, graph, {}, base);
  assert.deepEqual(plan.material_evidence_plan.planned_slot_ids, []);
  assert.deepEqual(plan.search_plan.queries, []);
});

test('No network search for local-only Request solely because structural requirements are unresolved', () => {
  const local = { ...task, evidence_need: { required: false } };
  const plan = materialEvidencePlan(local, graph, { primary: { id: 'G25' } }, base);
  assert.equal(plan.material_evidence_plan.search_authorized, false);
  assert.equal(plan.search_plan.queries.length, 0);
  assert.ok(plan.material_evidence_plan.unplanned_slot_ids.includes('R01:MR01'));
});

test('Query plan capacity is explicit and never silently drops a material requirement', () => {
  const many = { requests: [{ owner_request_id: 'R01', nodes:
    Array.from({ length: 90 }, (_, i) => ({
      slot_id: 'R01:MR' + String(i).padStart(3, '0'),
      material_kind: 'SUBQUESTION_ANSWER',
      question: '必要情報' + i,
      status: 'UNRESOLVED', required: true
    }))
  }] };
  const plan = materialEvidencePlan(task, many, {}, base);
  assert.equal(plan.search_plan.queries.length, 128);
  assert.equal(plan.material_evidence_plan.coverage_complete, false);
  assert.equal(plan.material_evidence_plan.planned_slot_ids.length, 64);
  assert.equal(plan.material_evidence_plan.unplanned_slot_ids.length, 26);
});


test('Public AsteraEngine sends decision requirement and Lens searches before five lanes', { timeout: 120000 }, async () => {
  const AsteraEngine = require('../src/astera-engine');
  const { defaultMockJapaneseParserClient } = require('./helpers/default-mock-japanese-parser');
  const calls = [];
  const engine = new AsteraEngine({
    poolSize: 2,
    japaneseParserClient: defaultMockJapaneseParserClient(),
    evidenceSearchClient: {
      async search(payload) {
        calls.push(payload);
        return {
          schema_version: 'astera.evidence-search.result.v1',
          status: 'REJECTED_NO_EVIDENCE',
          evidence: [],
          quality: { final: { status: 'REJECTED_NO_EVIDENCE', blocking_reasons: ['NO_EVIDENCE_CANDIDATE'] } },
          provider_execution: { initial: [], reinforcement: [] },
          query_execution: { initial: [], reinforcement: [] }
        };
      }
    },
    logger: { write() {}, async flush() {} }
  });
  try {
    const out = await engine.process({
      question: '予約変更の安全性を公式資料と一次資料で調査して検証する。既存予約データは必ず保持する。候補Aのキャッシュと候補Bの検索最適化を同一の速度・整合性基準で比較し、二重予約の失敗条件と未確認情報を示してください。'
    }, { id: 'material-evidence-integration', is_global: true, plan: 'admin' });
    assert.equal(out.result?.type, 'cognitive_map');
    assert.ok(calls.length > 0, 'Evidence Search API must be called');
    const allQueries = calls.flatMap(c => c.upstream_search_plan?.queries || []);
    assert.ok(allQueries.some(q => q.requirement_slot_id && q.material_kind), 'decision material evidence is missing from actual Evidence request');
    assert.ok(allQueries.some(q => String(q.material_kind || '').startsWith('LENS_')), 'specialist requirements must reach Evidence Search');
    assert.ok(allQueries.some(q => q.material_kind === 'FALSIFICATION_OR_DISQUALIFIER' || q.material_kind === 'DECISION_CRITERION'));
    assert.ok(out.result?.five_stage?.tasks?.length > 0);
    const materialRecords = out.result.task_results.flatMap(row =>
      row.task?.material_evidence_execution?.requirements || []);
    assert.ok(materialRecords.some(row => row.source === 'DECISION_BACKWARD_MATERIAL_REQUIREMENT'));
    assert.ok(materialRecords.every(row => row.confirmation_status === 'UNRESOLVED'));
    assert.ok(out.result.five_stage.tasks.some(row =>
      (row.inquiry?.missing_questions || []).some(q => String(q).includes('必要根拠が未確認') || String(q).includes('必要根拠が未検索'))),
      'unverified evidence needs must enter five-stage inquiry before Main8');
    assert.match(String(out.material?.text || ''), /必要根拠が未確認|必要根拠が未検索/u,
      'a missing judgment material source must reach public Main8, not remain only in an internal trace');
    assert.equal(out.result?.canonical_claims?.confirmed_count || 0, 0, 'search attempt must not auto-confirm claims');
  } finally { await engine.destroy(); }
});


test('multi-task Request gives requirement searches to evidence-capable Task, never silently to its earlier local Task', () => {
  const { selectRequestMaterialOwners } = require('../src/runtime/material-requirement-evidence-plan');
  const localTask = {
    id:'T01',request_id:'R01', evidence_need:{required:false},
    canonical_plan: {search_plan:{queries:[]}}
  };
  const evidenceTask = {
    id:'T02',request_id:'R01', evidence_need:{required:true},
    canonical_plan: {search_plan:{queries:[]}}
  };
  const owners = selectRequestMaterialOwners([localTask,evidenceTask],graph);
  assert.equal(owners.get('R01'), 'T02');
  const absentFromLocal = materialEvidencePlan(localTask,graph,{},base,{ownsRequest:false});
  const presentInSearch = materialEvidencePlan(evidenceTask,graph,{},base,{ownsRequest:true});
  assert.equal(absentFromLocal.search_plan.queries.length,0);
  assert.ok(presentInSearch.material_evidence_plan.planned_slot_ids.includes('R01:MR01'));
  assert.ok(presentInSearch.material_evidence_plan.planned_slot_ids.includes('R01:MR02'));
});

test('Request Graph explicit external Evidence support can authorize required search without keyword matching', () => {
  const { selectRequestMaterialOwners } = require('../src/runtime/material-requirement-evidence-plan');
  const noKeyword = { id:'T07', request_id:'R07',target:'安全性の判断材料',evidence_need:{required:false},canonical_plan:{search_plan:{queries:[]}} };
  const explicit = {requests:[{owner_request_id:'R07',nodes:[
    {slot_id:'R07:MR09',material_kind:'EVIDENCE_SUPPORT',question:'判断材料の裏付けとなる一次根拠',status:'MISSING',required:true}
  ]}]};
  const owners = selectRequestMaterialOwners([noKeyword],explicit);
  assert.equal(owners.get('R07'),'T07');
  const plan = materialEvidencePlan(noKeyword,explicit,{},base,{ownsRequest:true});
  assert.equal(plan.material_evidence_plan.search_authorized,true);
  assert.ok(plan.material_evidence_plan.planned_slot_ids.includes('R07:MR09'));
});


test('Requirement attribution uses matching query candidate lineage and eligible adopted evidence only', () => {
  const { materialEvidenceExecution } = require('../src/runtime/material-requirement-evidence-plan');
  const plan = materialEvidencePlan(task,graph,{},base);
  const query = plan.search_plan.queries.find(q => q.requirement_slot_id === 'R01:MR01' && q.role === 'OFFICIAL');
  const candidate = {
    candidate_id: 'accepted-one', canonical_record_id: 'record-one',
    provider_id: 'official-one', source_family_id: 'primary-series',
    canonical_locator: { url:'https://example.org/reference' }
  };
  const result = {
    status:'FINAL_VALID',
    evidence:[candidate],
    query_execution: {initial:[{
      query_id:query.query_id, claim_id:query.claim_id, role:query.role, status:'FOUND',
      provider_records:[{provider_id:'official-one',status:'FOUND',candidate_record_ids:['record-one']}]
    }],reinforcement:[]}
  };
  const verified = materialEvidenceExecution(plan,result,{state:'VALID'});
  const row = verified.requirements.find(r=>r.slot_id==='R01:MR01');
  assert.equal(row.adopted_evidence_refs.length,1);
  assert.equal(row.adopted_evidence_refs[0].candidate_id,'accepted-one');
  assert.equal(row.confirmation_status,'UNRESOLVED');
  assert.equal(verified.attributed_adopted_count,1);
  const notAdopted = materialEvidenceExecution(plan,result,{state:'REJECTED'});
  assert.deepEqual(notAdopted.requirements.find(r=>r.slot_id==='R01:MR01').adopted_evidence_refs,[]);
  const crossed = { ...result, query_execution: {initial:[
    {...result.query_execution.initial[0],claim_id:'material-requirement:R02:MR01'}
  ],reinforcement:[]} };
  assert.equal(materialEvidenceExecution(plan,crossed,{state:'VALID'}).attributed_adopted_count,0);
});

test('Reinforcement Evidence is attributed by originating slot and cannot confirm a judgment by itself', () => {
  const { materialEvidenceExecution } = require('../src/runtime/material-requirement-evidence-plan');
  const plan = materialEvidencePlan(task,graph,{},base);
  const counter = plan.search_plan.queries.find(q => q.requirement_slot_id === 'R01:MR02' && q.role === 'COUNTER');
  const result = {status:'FINAL_VALID',evidence:[{
    candidate_id:'candidate-retry',canonical_record_id:'record-retry'
  }],query_execution:{initial:[],reinforcement:[{
    query_id:'retry_1_'+counter.query_id,claim_id:counter.claim_id,
    status:'FOUND',provider_records:[{provider_id:'independent',status:'FOUND',candidate_record_ids:['candidate-retry']}]
  }]}};
  const ledger = materialEvidenceExecution(plan,result,{state:'VALID'});
  assert.equal(ledger.requirements.find(r=>r.slot_id==='R01:MR02').adopted_evidence_refs.length,1);
  assert.equal(ledger.requirements.find(r=>r.slot_id==='R01:MR01').adopted_evidence_refs.length,0);
  assert.equal(ledger.requirements.find(r=>r.slot_id==='R01:MR02').confirmation_status,'UNRESOLVED');
});


test('comparison lane preserves both candidates even inside longer Japanese Request text', () => {
  const { extractComparisonCandidates } = require('../src/v4-canonical/lanes');
  const sentence = '背景：予約変更の応答が遅いという未検証の報告がある。候補Aのキャッシュと候補Bの検索最適化を同一の速度・整合性条件で比較し、最終選定は行わない。';
  assert.deepEqual(extractComparisonCandidates({source_span:{text:sentence}}),
    ['候補Aのキャッシュ','候補Bの検索最適化']);
  assert.deepEqual(extractComparisonCandidates({
    candidates:[{label:'候補Aのキャッシュ'},{label:'候補Bの検索最適化'}],
    source_span:{text:'既存データを失わず両候補を比較する'}
  }), ['候補Aのキャッシュ','候補Bの検索最適化']);
  assert.deepEqual(extractComparisonCandidates({source_span:{text:'単一の現行システムを調査する。'}}),[]);
});

test('Japanese text survives mixed ASCII query compilation', () => {
  const sample='API予約管理の整合性と公式情報';
  const queries=[{query_id:'ja-1',claim_id:'ja-case',role:'OFFICIAL',text:sample},
    {query_id:'ja-2',claim_id:'ja-case',role:'COUNTER',text:sample+' 反証'}];
  const plan=compileQueryPlan({question:sample,upstream_search_plan:{queries}});
  assert.match(plan.primary_query_set[0].text,/予約管理/u);
  assert.match(plan.primary_query_set[0].text,/API/u);
  assert.match(plan.primary_query_set[1].text,/反証/u);
});
