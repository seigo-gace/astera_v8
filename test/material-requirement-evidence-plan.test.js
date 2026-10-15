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

test('material evidence ledger rejects executions carrying another Request or requirement slot', () => {
  const { materialEvidenceExecution } = require('../src/runtime/material-requirement-evidence-plan');
  const plan = materialEvidencePlan(task, graph, {}, base);
  const query = plan.search_plan.queries.find(q => q.requirement_slot_id === 'R01:MR01');
  const candidate = { candidate_id:'request-isolated', canonical_record_id:'record-isolated' };
  const execution = {
    query_id: query.query_id, claim_id: query.claim_id, status:'FOUND',
    provider_records:[{provider_id:'provider',status:'FOUND',candidate_record_ids:['request-isolated']}]
  };
  const packet = (patch) => ({ status:'FINAL_VALID', evidence:[candidate],
    query_execution:{initial:[{...execution,...patch}],reinforcement:[]} });
  const observed = materialEvidenceExecution(plan,packet({}),{state:'VALID'});
  assert.equal(observed.requirements.find(r => r.slot_id === 'R01:MR01').adopted_evidence_refs.length,1);
  for (const foreign of [{owner_request_id:'R02'},{requirement_slot_id:'R01:MR02'},
    {owner_request_id:'R02',requirement_slot_id:'R01:MR02'}]) {
    const isolated = materialEvidenceExecution(plan,packet(foreign),{state:'VALID'});
    assert.equal(isolated.requirements.find(r => r.slot_id === 'R01:MR01').adopted_evidence_refs.length,0);
    assert.equal(isolated.attributed_adopted_count,0);
    assert.equal(isolated.requirements.find(r => r.slot_id === 'R01:MR01').confirmation_status,'UNRESOLVED');
  }
});

test('Evidence Search module-response envelope preserves adopted requirement lineage', () => {
  const { materialEvidenceExecution } = require('../src/runtime/material-requirement-evidence-plan');
  const plan = materialEvidencePlan(task, graph, {}, base);
  const query = plan.search_plan.queries.find(q => q.requirement_slot_id === 'R01:MR01');
  const raw = { status:'FINAL_VALID', evidence:[{
    candidate_id:'wrapped-candidate', canonical_record_id:'wrapped-record'
  }], query_execution:{initial:[{
    query_id:query.query_id, claim_id:query.claim_id, status:'FOUND',
    provider_records:[{provider_id:'official-one',status:'FOUND',
      candidate_record_ids:['wrapped-candidate']}]
  }],reinforcement:[]} };
  const flat = materialEvidenceExecution(plan,raw,{state:'VALID'});
  const wrapped = materialEvidenceExecution(plan,{
    schema_version:'astera.evidence-search.module-response.v1', result:raw
  },{state:'VALID'});
  assert.deepEqual(wrapped.requirements,flat.requirements);
  assert.equal(wrapped.attributed_adopted_count,1);
  assert.equal(wrapped.requirements.find(r=>r.slot_id==='R01:MR01').confirmation_status,'UNRESOLVED');
});

test('adopted candidate with foreign explicit scope never satisfies local requirement attribution', () => {
  const { materialEvidenceExecution } = require('../src/runtime/material-requirement-evidence-plan');
  const plan = materialEvidencePlan(task, graph, {}, base);
  const query = plan.search_plan.queries.find(q => q.requirement_slot_id === 'R01:MR01');
  const run = {query_id:query.query_id,claim_id:query.claim_id,status:'FOUND',
    provider_records:[{provider_id:'official-one',status:'FOUND',candidate_record_ids:['candidate-scope']}]};
  const ledger = (fields) => materialEvidenceExecution(plan,{status:'FINAL_VALID',
    evidence:[{candidate_id:'candidate-scope',canonical_record_id:'record-scope',...fields}],
    query_execution:{initial:[run],reinforcement:[]}}, {state:'VALID'});
  assert.equal(ledger({owner_request_id:'R01',requirement_slot_id:'R01:MR01'}).attributed_adopted_count,1);
  for (const foreign of [{owner_request_id:'R02'}, {requirement_slot_id:'R01:MR02'},
    {owner_request_id:'R02',requirement_slot_id:'R01:MR02'}]) {
    const result=ledger(foreign);
    assert.equal(result.attributed_adopted_count,0);
    assert.equal(result.requirements.find(row=>row.slot_id==='R01:MR01').confirmation_status,'UNRESOLVED');
  }
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

test('a source-backed disqualifying risk must still be searched, not treated as verified', () => {
  const sourceRisk={requests:[{owner_request_id:'R01',nodes:[
    {slot_id:'R01:MR_RISK',required:true,material_kind:'FALSIFICATION_OR_DISQUALIFIER',
      question:'Unverified overheating during repeated use',status:'SATISFIED',
      truth_state:'SOURCE_BACKED_RULE_OR_CONTEXT',value_refs:['overheating']},
    {slot_id:'R01:MR_RULE',required:true,material_kind:'BOUNDARY_OR_PRECONDITION',
      question:'Keep the existing safety inspection record',status:'SATISFIED'}
  ]}]};
  const plan=materialEvidencePlan(task,sourceRisk,{},base);
  assert.ok(plan.material_evidence_plan.planned_slot_ids.includes('R01:MR_RISK'));
  assert.ok(!plan.material_evidence_plan.planned_slot_ids.includes('R01:MR_RULE'));
  const execution=require('../src/runtime/material-requirement-evidence-plan')
    .materialEvidenceExecution(plan,null,{state:'REJECTED'});
  assert.equal(execution.requirements.find(r=>r.slot_id==='R01:MR_RISK').confirmation_status,'UNRESOLVED');
});


test('specialist mandatory counterevidence is searched when linked to a real risk requirement even if not literally named in the input', () => {
  const domain = { primary: {
    id: 'G99', risk_lens: ['pressure relief valve failure mode'],
    compare_lens: ['unrelated financial forecast'],
    fact_lens: ['unrelated rainfall index']
  } };
  const need = { requests: [{ owner_request_id:'R01', nodes: [{
    slot_id:'R01:REAL_RISK', material_kind:'FALSIFICATION_OR_DISQUALIFIER',
    question:'Which independent safety failure condition can invalidate the proposal?',
    required:true,status:'MISSING'
  }]}] };
  const plan = materialEvidencePlan({ ...task,target:'Inspect the new pump proposal' },need,domain,base);
  const risk = plan.material_evidence_plan.targets.find(t=>t.question==='pressure relief valve failure mode');
  const unrelated = plan.material_evidence_plan.targets.find(t=>t.question==='unrelated financial forecast');
  assert.equal(risk.applicability,'APPLICABLE_REQUIRED');
  assert.deepEqual(risk.linked_requirement_slot_ids,['R01:REAL_RISK']);
  assert.ok(plan.material_evidence_plan.planned_slot_ids.includes(risk.slot_id));
  assert.equal(plan.search_plan.queries.filter(q=>q.requirement_slot_id===risk.slot_id).length,2);
  assert.equal(unrelated.applicability,'DEFERRED_APPLICABILITY_UNKNOWN');
  assert.match(unrelated.applicability_reason,/NO_REQUEST_LOCAL_COMPARE_REQUIREMENT_LINK/);
  assert.ok(plan.material_evidence_plan.unplanned_slot_ids.includes(unrelated.slot_id));
  assert.ok(plan.material_evidence_plan.deferred_slot_ids.includes(unrelated.slot_id));
  assert.equal(plan.search_plan.queries.filter(q=>q.requirement_slot_id===unrelated.slot_id).length,0);
  assert.equal(plan.material_evidence_plan.coverage_complete,false);
});

test('distinct risk falsifiers and different Request scopes cannot be merged to reduce query counts', () => {
  const need={ requests:[{owner_request_id:'R01',nodes:[
    {slot_id:'R01:SAFETY_A',material_kind:'FALSIFICATION_OR_DISQUALIFIER',
      question:'Failure under hot weather',status:'UNRESOLVED',required:true},
    {slot_id:'R01:SAFETY_B',material_kind:'FALSIFICATION_OR_DISQUALIFIER',
      question:'Failure after cold storage',status:'UNRESOLVED',required:true}
  ]},{owner_request_id:'R02',nodes:[
    {slot_id:'R02:SAFETY_A',material_kind:'FALSIFICATION_OR_DISQUALIFIER',
      question:'Failure under hot weather in another jurisdiction',status:'UNRESOLVED',required:true}
  ]}]};
  const domain={primary:{id:'G99',risk_lens:['Safety inspection protocol']}};
  const first=materialEvidencePlan(task,need,domain,base);
  const second=materialEvidencePlan({...task,id:'T02',request_id:'R02'},need,domain,base);
  for(const slot of ['R01:SAFETY_A','R01:SAFETY_B']){
    assert.equal(first.search_plan.queries.filter(q=>q.requirement_slot_id===slot).length,2);
  }
  assert.equal(second.search_plan.queries.filter(q=>q.requirement_slot_id==='R02:SAFETY_A').length,2);
  const firstIds=new Set(first.search_plan.queries.map(q=>q.query_id));
  assert.ok(second.search_plan.queries.every(q=>!firstIds.has(q.query_id)));
});

test('uncertain Lens applicability is explicitly deferred, never fabricated as search coverage',()=>{
  const domain={primary:{id:'G99',fact_lens:['authoritative independent standard'],
    risk_lens:['engineering failure threshold']}};
  const plan=materialEvidencePlan({...task,target:'Assess an unspecified proposal'},null,domain,base);
  assert.equal(plan.material_evidence_plan.search_authorized,true);
  assert.equal(plan.material_evidence_plan.planned_slot_ids.length,0);
  assert.equal(plan.material_evidence_plan.deferred_slot_ids.length,2);
  assert.equal(plan.material_evidence_plan.coverage_complete,false);
  const ledger=require('../src/runtime/material-requirement-evidence-plan')
    .materialEvidenceExecution(plan,null,{state:'REJECTED'});
  assert.equal(ledger.unresolved_count,2);
  assert.ok(ledger.requirements.every(r=>r.planning_status==='DEFERRED_APPLICABILITY_UNKNOWN'));
});


test('false secondary/overlay Lens match is deferred with reason; explicit local applicability can activate it',()=>{
  const graph={requests:[{owner_request_id:'R01',nodes:[{
    slot_id:'R01:DISQUALIFIER',material_kind:'FALSIFICATION_OR_DISQUALIFIER',
    question:'Identify a valid independent safety counterexample',required:true,status:'MISSING'
  }]}]};
  const domain={
    primary:{id:'G99',risk_lens:['Primary safety examination']},
    overlays:[{id:'O1',risk_lens:['Highly specific river-basin flooding control']}]
  };
  const unqualified=materialEvidencePlan(
    {...task,target:'Inspect a pump under pressure'},graph,domain,base);
  const primary=unqualified.material_evidence_plan.targets.find(t=>t.question==='Primary safety examination');
  const overlay=unqualified.material_evidence_plan.targets.find(t=>t.question==='Highly specific river-basin flooding control');
  assert.equal(primary.applicability,'APPLICABLE_REQUIRED');
  assert.equal(overlay.applicability,'DEFERRED_APPLICABILITY_UNKNOWN');
  assert.deepEqual(overlay.lens_source_tiers,['OVERLAY']);
  assert.ok(unqualified.material_evidence_plan.unplanned_slot_ids.includes(overlay.slot_id));
  assert.ok(!unqualified.material_evidence_plan.coverage_complete);
  const justified=materialEvidencePlan({...task,
    source_span:{text:'Inspect the pump and Highly specific river-basin flooding control'},
    target:'Inspect a pump under pressure'},graph,domain,base);
  const activated=justified.material_evidence_plan.targets.find(t=>t.question===overlay.question);
  assert.equal(activated.applicability,'APPLICABLE_REQUIRED');
  assert.match(activated.applicability_reason,/EXPLICIT_SOURCE_SCOPE/);
  assert.ok(justified.material_evidence_plan.planned_slot_ids.includes(activated.slot_id));
});


test('five-stage Inquiry owns full deferred specialist slot ledger and does not disguise unknown as a healthy case', () => {
  const { inquiryLane } = require('../src/v4-canonical/lanes');
  const requirements = [
    {slot_id:'R01:LENS:risk:1',source:'ADDITIVE_SPECIALIST_LENS',material_kind:'LENS_RISK',
      planning_status:'DEFERRED_APPLICABILITY_UNKNOWN',confirmation_status:'UNRESOLVED'},
    {slot_id:'R01:LENS:fact:2',source:'ADDITIVE_SPECIALIST_LENS',material_kind:'LENS_FACT',
      planning_status:'DEFERRED_APPLICABILITY_UNKNOWN',confirmation_status:'UNRESOLVED'},
    {slot_id:'R01:MR01',source:'DECISION_BACKWARD_MATERIAL_REQUIREMENT',material_kind:'FALSIFICATION_OR_DISQUALIFIER',
      question:'Was the failure confirmed?',planning_status:'PLANNED',confirmation_status:'UNRESOLVED'}
  ];
  const lane = inquiryLane([],[],{primary:{id:'G99'}},
    {id:'T01',target:'Check an unresolved proposal',material_evidence_execution:{requirements}});
  assert.equal(lane.specialist_applicability.state,'DEFERRED_APPLICABILITY_UNKNOWN');
  assert.equal(lane.specialist_applicability.deferred_count,2);
  assert.deepEqual(lane.specialist_applicability.slot_ids,
    ['R01:LENS:risk:1','R01:LENS:fact:2']);
  assert.deepEqual(lane.specialist_applicability.material_kinds,['FACT','RISK']);
  assert.equal(lane.problem_health.healthy,false);
  assert.ok(lane.missing_questions.some(q=>q.includes('Was the failure confirmed?')));
});


test('required falsifiers and comparison bases outrank generic question slots when the fixed query limit is reached', () => {
  const nodes = Array.from({length: 74}, (_, i) => ({
    slot_id:'R01:GENERIC_'+String(i).padStart(3,'0'),
    material_kind:'SUBQUESTION_ANSWER',
    question:'Generic required question '+i,
    status:'MISSING',required:true
  }));
  nodes.push({
    slot_id:'R01:LATE_COUNTEREXAMPLE',
    material_kind:'FALSIFICATION_OR_DISQUALIFIER',
    question:'Safety failure condition that invalidates the entire proposal',
    status:'CONFLICTING',required:true
  },{
    slot_id:'R01:LATE_COMPARISON',
    material_kind:'COMPARISON_BASIS',
    question:'Equal decision metric for two competing options',
    status:'MISSING',required:true
  });
  const many={requests:[{owner_request_id:'R01',nodes}]};
  const plan=materialEvidencePlan(task,many,{},base);
  const contract=plan.material_evidence_plan;
  assert.equal(plan.search_plan.queries.length,128,'must preserve external 128-query contract');
  assert.equal(contract.planned_slot_ids.length,64);
  assert.equal(contract.unplanned_slot_ids.length,12);
  assert.ok(contract.planned_slot_ids.includes('R01:LATE_COUNTEREXAMPLE'),
    'last-listed mandatory disqualifier must be searched, not displaced by generic questions');
  assert.ok(contract.planned_slot_ids.includes('R01:LATE_COMPARISON'),
    'decision comparison basis must remain searchable under fixed budget');
  assert.ok(!contract.coverage_complete,'unsearched required slots cannot be described as complete');
  assert.equal(contract.unplanned_reasons.length,12);
  assert.ok(contract.unplanned_reasons.every(row=>row.reason==='PLAN_QUERY_LIMIT'));
  assert.deepEqual(new Set(contract.unplanned_reasons.map(row=>row.slot_id)),
    new Set(contract.unplanned_slot_ids));
  assert.deepEqual(new Set([...contract.planned_slot_ids,...contract.unplanned_slot_ids]),
    new Set(contract.required_slot_ids),'budget priorities must never erase source requirements');
});

test('local-only and uncertain specialist slots retain distinct reasons, never invented search coverage',()=>{
  const taskWithoutNetwork={...task,evidence_need:{required:false}};
  const plan=materialEvidencePlan(taskWithoutNetwork,graph,{},base);
  assert.equal(plan.material_evidence_plan.search_authorized,false);
  assert.ok(plan.material_evidence_plan.unplanned_reasons.every(
    item=>item.reason==='EXTERNAL_SEARCH_NOT_AUTHORIZED'
      || item.reason==='DEFERRED_APPLICABILITY_UNKNOWN'));
  assert.equal(plan.material_evidence_plan.coverage_complete,false);
});


test('post-canonical reconciliation requires direct claim owner/slot and bound adopted source', () => {
  const { reconcileMaterialEvidenceExecution } = require('../src/runtime/material-requirement-evidence-plan');
  const ledger={requirements:[{slot_id:'R01:MR01',owner_request_id:'R01',confirmation_status:'UNRESOLVED',
    adopted_evidence_refs:[{candidate_id:'e1'}]}],unresolved_count:1};
  const claim=(owner,slot,id,status='CONFIRMED')=>({claim:{claim_id:'c1',owner_request_id:owner,requirement_slot_id:slot},
    confirmation:{status,bindings:[{candidate_id:id}]}});
  for(const record of [claim('R02','R01:MR01','e1'),claim('R01','R01:MR02','e1'),
    claim('R01','R01:MR01','different'),claim('R01','R01:MR01','e1','UNDETERMINED')]) {
    const result=reconcileMaterialEvidenceExecution(ledger,{records:[record]});
    assert.deepEqual(result.requirements[0].confirmed_claim_ids,[]);
    assert.equal(result.requirements[0].confirmation_status,'UNRESOLVED');
  }
  const matched=reconcileMaterialEvidenceExecution(ledger,{records:[claim('R01','R01:MR01','e1')]});
  const missingRelation=reconcileMaterialEvidenceExecution(ledger,{records:[]});
  assert.equal(missingRelation.requirements[0].confirmation_reason,'NO_DIRECT_CANONICAL_CLAIM_FOR_REQUIREMENT');
  assert.deepEqual(matched.requirements[0].confirmed_claim_ids,['c1']);
  assert.equal(matched.requirements[0].confirmation_status,'UNRESOLVED');
  assert.equal(matched.requirements[0].confirmation_reason,'CLAIM_CONFIRMED_REQUIREMENT_CRITERIA_NOT_RECONCILED');
  assert.equal(matched.unresolved_count,1);
  assert.equal(matched.directly_linked_confirmed_claim_count,1);
  assert.equal(matched.missing_direct_claim_count,0);
  assert.equal(missingRelation.missing_direct_claim_count,1);
  assert.equal(missingRelation.directly_linked_confirmed_claim_count,0);
});


test('colliding adopted candidate identifiers fail closed rather than attribute another source', () => {
  const { materialEvidenceExecution } = require('../src/runtime/material-requirement-evidence-plan');
  const plan=materialEvidencePlan(task,graph,{},base);
  const query=plan.search_plan.queries.find(q => q.requirement_slot_id==='R01:MR01');
  const packet=(evidence)=>({status:'FINAL_VALID',evidence,
    query_execution:{initial:[{query_id:query.query_id,claim_id:query.claim_id,status:'FOUND',
      provider_records:[{provider_id:'primary',status:'FOUND',candidate_record_ids:['same-id']}]}],reinforcement:[]}});
  const valid=materialEvidenceExecution(plan,packet([{candidate_id:'same-id',canonical_record_id:'record-1'}]),{state:'VALID'});
  assert.equal(valid.attributed_adopted_count,1);
  const collision=materialEvidenceExecution(plan,packet([
    {candidate_id:'same-id',canonical_record_id:'record-1'},
    {candidate_id:'same-id',canonical_record_id:'record-2',owner_request_id:'R02'}
  ]),{state:'VALID'});
  assert.equal(collision.attributed_adopted_count,0);
  assert.equal(collision.requirements.find(row=>row.slot_id==='R01:MR01').confirmation_status,'UNRESOLVED');
});


test('Inquiry lane distinguishes Claim confirmation from Requirement satisfaction', () => {
  const { inquiryLane } = require('../src/v4-canonical/lanes');
  const taskWithStatus = status => ({
    id:'T01',request_id:'R01',target:'予約システムの妥当性検証',
    material_evidence_execution:{requirements:[{
      slot_id:'R01:MR01',source:'DECISION_BACKWARD_MATERIAL_REQUIREMENT',
      planning_status:'PLANNED',question:'公式根拠と反例は十分か',confirmation_status:status
    }]}
  });
  const unresolved = inquiryLane([],[],{},taskWithStatus('UNRESOLVED'));
  const claimOnly = inquiryLane([],[],{},taskWithStatus('CONFIRMED'));
  const complete = inquiryLane([],[],{},taskWithStatus('SATISFIED'));
  assert.ok(unresolved.missing_questions.some(q=>q.includes('公式根拠と反例は十分か')));
  assert.ok(claimOnly.missing_questions.some(q=>q.includes('公式根拠と反例は十分か')));
  assert.ok(!complete.missing_questions.some(q=>q.includes('公式根拠と反例は十分か')));
});
