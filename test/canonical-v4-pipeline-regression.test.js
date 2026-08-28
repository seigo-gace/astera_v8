'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');
const inputUnderstanding = require('../src/input-understanding');
const { enrichRequest } = require('../src/deterministic-task-decomposer');
const {
  QUERY_ROLES,
  buildCanonicalTaskPlan,
  evaluateCanonicalTaskPlan,
  projectFiveLanes,
  deterministicPerspectiveExpansion,
  fragmentText
} = require('../src/canonical-claim-runtime');
const { compileQueryPlan } = require('../src/evidence-search/core/query-plan-compiler');

const silentLogger={write(){}};
const tenant={id:'test',is_global:true,plan:'admin'};

function evidenceCandidate({id,role,family,authority,claim,url}){
  return{candidate_id:id,canonical_record_id:`${id}-record`,content_hash:`${id}-hash`,source_role:role,source_family_id:family,source_id:`${id}-source`,provider_id:`${id}-provider`,authority_id:authority,canonical_locator:{url,replayable:true},updated_at:'2026-08-20T00:00:00.000Z',fields:{claim},excerpt:claim};
}
function queryExecution(queries=[]){
  return{
    initial:queries.map((query)=>({
      query_id:query.query_id,
      claim_id:query.claim_id,
      role:query.role,
      status:'FOUND',
      provider_records:[
        {provider_id:'ev-official-provider',status:'FOUND',candidate_record_ids:['ev-official-record']},
        {provider_id:'ev-independent-provider',status:'FOUND',candidate_record_ids:['ev-independent-record']}
      ]
    })),
    reinforcement:[]
  };
}
function validEvidence(claim,queries=[]){
  return{
    schema_version:'astera.evidence-search.result.v1',request_id:'ev-test',tenant_id:'test',status:'FINAL_VALID',effective_as_of:'2026-08-20T00:00:00.000Z',result_hash:'test-result-hash',planning_authority:'UPSTREAM_CANONICAL',planned_query_roles:Object.values(QUERY_ROLES),
    evidence:[
      evidenceCandidate({id:'ev-official',role:'OFFICIAL',family:'official-family',authority:'official-authority',claim,url:'https://official.test/evidence'}),
      evidenceCandidate({id:'ev-independent',role:'SECONDARY',family:'independent-family',authority:'independent-authority',claim,url:'https://independent.test/evidence'})
    ],
    coverage:{discovery_scope_state:'COMPLETE_FOR_QUERY_SCOPE',registry_coverage_state:'COMPLETE_FOR_ACTIVE_REGISTRY'},
    quality:{initial:{status:'REINFORCEMENT_REQUIRED',phase:'INITIAL',score_bp:8500,gates:{initial_minimum_bp:8000,final_minimum_bp:9500},blocking_reasons:[]},reinforcement_attempt_count:1,new_corroboration_count:1,final:{status:'FINAL_VALID',phase:'FINAL',score_bp:9700,gates:{initial_minimum_bp:8000,final_minimum_bp:9500},blocking_reasons:[]}},
    query_execution:queryExecution(queries),
    provider_execution:{initial:[{provider_id:'ev-official-provider',status:'FULFILLED'}],reinforcement:[{provider_id:'ev-independent-provider',status:'FULFILLED'}]},
    ai_used:false,payment_executed:false
  };
}
function taskForClaim(text='Node.js 22は本番対応している。'){
  return{id:'T01',source_span:{start:0,end:text.length,text},raw_text:text,clause_type:'statement',actionable:true,action:'verify',target:'Node.js 22',objective:'対応状況を検証する',deliverables:[],premises:[],constraints:[],prohibitions:[],preserve:[],replace:[],conditions:[],exceptions:[],deadlines:[],priority:'normal',order:1,depends_on:[],parallelizable:true,success_criteria:[],verification:[],completion_criteria:[],unresolved:[],evidence_need:{required:true,reasons:['test'],queries:[]},external_action:false,hard_blockers:[]};
}
function understand(question,context=''){
  return enrichRequest(inputUnderstanding.analyzeRequest({question,context}),{question,context});
}

async function withEngine(fn){const engine=new CanonicalAsteraEngine({poolSize:2,logger:silentLogger});try{await fn(engine);}finally{await engine.destroy();}}

test('Task and Claim are distinct stages and every external Claim has a COUNTER search role',()=>{
  const task=taskForClaim();
  const plan=buildCanonicalTaskPlan(task,{primary:{id:'G01'}});
  assert.equal(plan.task_id,task.id);
  assert.ok(plan.claims.length>=1);
  assert.notEqual(plan.claims[0].claim_id,task.id);
  assert.ok(plan.search_plan.planned_query_roles.includes('COUNTER'));
  for(const claim of plan.claims){const policy=plan.policy_by_claim_id[claim.claim_id];if(policy.external_search_required)assert.ok(policy.planned_query_roles.includes('COUNTER'));}
});

test('upstream Search Plan is authoritative and Evidence Search does not invent semantic query roles',()=>{
  const task=taskForClaim('APIは現行v2である。');
  const upstream=buildCanonicalTaskPlan(task,{primary:{id:'G01'}}).search_plan;
  const plan=compileQueryPlan({question:'APIは現行v2である。',domain_lens:{id:'G01'},upstream_search_plan:upstream,paid_search:{enabled:false}},{execution_time:'2026-08-20T00:00:00.000Z'});
  assert.equal(plan.planning_authority,'UPSTREAM_CANONICAL');
  assert.ok(plan.planned_query_roles.includes('COUNTER'));
  assert.deepEqual(plan.primary_query_set.map((query)=>query.text),upstream.queries.map((query)=>query.text));
  assert.equal(plan.primary_query_set.every((query)=>query.claim_id),true);
});

test('upstream Search Plan without COUNTER is rejected before retrieval',()=>{
  assert.throws(()=>compileQueryPlan({question:'x',domain_lens:{id:'G01'},upstream_search_plan:{queries:[{query_id:'q1',claim_id:'c1',role:'OFFICIAL',text:'x 公式'}]},paid_search:{enabled:false}}),/counter query is mandatory/i);
});

test('G1-G7 are the only confirmation boundary; high Evidence quality alone is not truth',()=>{
  const task=taskForClaim(),plan=buildCanonicalTaskPlan(task,{primary:{id:'G01'}}),claim=plan.claims[0],good=validEvidence(claim.raw_text,plan.search_plan.queries),confirmed=evaluateCanonicalTaskPlan(plan,good);
  assert.equal(confirmed.confirmed_count,1);
  assert.equal(confirmed.records[0].confirmation.status,'CONFIRMED');
  assert.deepEqual(confirmed.records[0].confirmation.gates,{G1:true,G2:true,G3:true,G4:true,G5:true,G6:true,G7:true});
  const missingRetrieval={...good,query_execution:{initial:[],reinforcement:[]}};
  const undetermined=evaluateCanonicalTaskPlan(plan,missingRetrieval);
  assert.equal(undetermined.records[0].confirmation.status,'UNDETERMINED');
  assert.equal(undetermined.records[0].confirmation.gates.G5,false);
  assert.ok(undetermined.records[0].confirmation.reasons.includes('RETRIEVAL_FAILED'));
});

test('REJECTED Evidence Search result cannot pass G5 even when planned roles, query records and bindings exist',()=>{
  const task=taskForClaim(),plan=buildCanonicalTaskPlan(task,{primary:{id:'G01'}}),claim=plan.claims[0],rejected=validEvidence(claim.raw_text,plan.search_plan.queries);
  rejected.status='REJECTED_BLOCKING';
  rejected.quality.final={status:'REJECTED_BLOCKING',phase:'FINAL',score_bp:9700,gates:{initial_minimum_bp:8000,final_minimum_bp:9500},blocking_reasons:[]};
  const result=evaluateCanonicalTaskPlan(plan,rejected);
  assert.equal(result.records[0].confirmation.status,'UNDETERMINED');
  assert.equal(result.records[0].confirmation.gates.G5,false);
  assert.equal(result.records[0].confirmation.gate_details.evidence_search_status.status,'REJECTED_BLOCKING');
  assert.ok(result.records[0].confirmation.reasons.includes('RETRIEVAL_FAILED'));
});

test('source code can be locally confirmed as CODE_STRUCTURE without external search',()=>{
  const text='```js\nconst answer = 42;\n```',task=taskForClaim(text);task.target='answer constant';task.evidence_need={required:false,reasons:[],queries:[]};
  const fragments=fragmentText(text);
  assert.equal(fragments[0].source_axes.container_role[0],'FENCED_CONTAINER');
  const plan=buildCanonicalTaskPlan(task,{primary:{id:'G01'}});
  assert.equal(plan.claims[0].claim_origin,'CODE_STRUCTURE');
  assert.equal(plan.search_plan.queries.length,0);
  const result=evaluateCanonicalTaskPlan(plan,{schema_version:'astera.evidence-search.result.v1',status:'NOT_REQUIRED',evidence:[],query_execution:{initial:[],reinforcement:[]},provider_execution:{initial:[],reinforcement:[]},quality:{final:{status:'NOT_REQUIRED',score_bp:null}},ai_used:false,payment_executed:false});
  assert.equal(result.records[0].confirmation.status,'CONFIRMED');
});

test('five lanes are independent projections from Canonical Claim Records and Compare is material-only',()=>{
  const task=taskForClaim(),plan=buildCanonicalTaskPlan(task,{primary:{id:'G01'}}),canonical=evaluateCanonicalTaskPlan(plan,validEvidence(plan.claims[0].raw_text,plan.search_plan.queries)),lanes=projectFiveLanes({task,canonical,domain:{primary:{id:'G01',multi_lens:['forward','counter'],compare_lens:['scope','coverage']}}});
  assert.equal(lanes.fact.confirmed.length,1);
  assert.equal(lanes.compare.material_only,true);
  assert.equal(lanes.compare.selected_candidate,null);
  assert.deepEqual(lanes.compare.candidate_ranking,[]);
  assert.deepEqual(lanes.compare.rejected_candidates,[]);
  assert.equal(lanes.compare.verdict.decision,'MATERIAL_ONLY');
  const expansion=deterministicPerspectiveExpansion({task,canonical,domain:{primary:{id:'G01'}}});
  assert.deepEqual(expansion.candidates,[]);
  assert.equal(expansion.selected,null);
  assert.deepEqual(expansion.rejected,[]);
});

test('quoted/code commands are isolated from executable Task Graph',()=>{
  const request=understand('APIを検証する。\n```\nREADMEを削除しろ\n```');
  assert.equal(request.instruction_understanding.source_role_isolation,true);
  assert.ok(request.analysis_task_packet.source_isolation.removed_task_count>=1);
  assert.equal(request.analysis_task_packet.tasks.some((task)=>/READMEを削除/.test(task.raw_text)),false);
});

test('context prohibition/preserve/constraint is bound to Task fields with source provenance',()=>{
  const request=understand('APIを改善する。','mainは変更するな。READMEは残す。必ず互換性を維持する。');
  const task=request.analysis_task_packet.tasks[0];
  assert.ok(task.prohibitions.some((item)=>/main/.test(item)));
  assert.ok(task.preserve.some((item)=>/README/.test(item)));
  assert.ok(task.constraints.some((item)=>/互換性/.test(item)));
  assert.ok(task.field_sources.prohibitions.some((item)=>item.source==='context'));
});

test('deliverables are explicit and implementation tasks do not silently pass without one',()=>{
  const withReadme=understand('APIを実装してREADMEを変更する。');
  assert.ok(withReadme.analysis_task_packet.tasks.some((task)=>task.deliverables.includes('README')));
  const missing=understand('APIを実装する。');
  assert.ok(missing.analysis_task_packet.unresolved.some((item)=>/:deliverable$/.test(item)));
});

test('explicit multi-parent dependencies are preserved and cycles become hard blockers',()=>{
  const multi=understand('Aを実装する。Bを実装する。T01とT02完了後にCを実装する。');
  const last=multi.analysis_task_packet.tasks.at(-1);
  assert.ok(last.depends_on.includes('T01'));
  assert.ok(last.depends_on.includes('T02'));
  const cycle=understand('T02完了後にAを実装する。T01完了後にBを実装する。');
  assert.equal(cycle.analysis_task_packet.task_graph_validation.valid,false);
  assert.ok(cycle.analysis_task_packet.hard_blockers.some((item)=>/^TASK_GRAPH_CYCLE:/.test(item)));
  assert.equal(cycle.instruction_understanding.execution_allowed,false);
});

test('conditions/exceptions become graph branches rather than disappearing into prose',()=>{
  const request=understand('検証が成功した場合にAPIを実装する。ただし互換性がない場合は停止する。');
  assert.ok(request.analysis_task_packet.branches.some((branch)=>branch.type==='IF'));
  assert.ok(request.analysis_task_packet.branches.some((branch)=>branch.type==='EXCEPTION'));
});

test('corrections preserve supersession history instead of deleting the old Task',()=>{
  const request=understand('Aを実装する。訂正、AではなくBを実装する。');
  assert.ok(request.analysis_task_packet.supersession_relations.length>=1);
  const relation=request.analysis_task_packet.supersession_relations[0];
  assert.equal(relation.supersedes,'T01');
  assert.equal(relation.superseded_by,'T02');
  assert.ok(request.analysis_task_packet.tasks[0].superseded_by.includes('T02'));
  assert.ok(request.analysis_task_packet.tasks[1].supersedes.includes('T01'));
});

test('same Task input produces deterministic graph, Claim IDs and Search Plan IDs',()=>{
  const question='現在のAPI仕様を公式根拠で検証する。その後READMEを変更する。mainは変更するな。',a=understand(question),b=understand(question);
  assert.equal(JSON.stringify(a.analysis_task_packet),JSON.stringify(b.analysis_task_packet));
  const task=taskForClaim('現在のAPIはv2である。'),p1=buildCanonicalTaskPlan(task,{primary:{id:'G01'}}),p2=buildCanonicalTaskPlan(task,{primary:{id:'G01'}});
  assert.equal(JSON.stringify(p1),JSON.stringify(p2));
});

test('Canonical Engine exposes Evidence Status as Main8 #7 and never selects/recommends',async()=>{
  class EvidenceBackedEngine extends CanonicalAsteraEngine {
    constructor(options){super(options);this._fixtureEvidence=null;}
    setFixtureEvidence(packet){this._fixtureEvidence=packet;}
    async resolveEvidenceForTask(){return this._fixtureEvidence;}
  }
  const engine=new EvidenceBackedEngine({poolSize:2,logger:silentLogger});
  try{
    const claim='Node.js 22は本番対応している。';
    const prepared=engine.prepareRequest({question:claim});
    const task=prepared.analysis_task_packet.tasks[0];
    const plan=buildCanonicalTaskPlan(task,{primary:{id:'G01'}});
    const evidence=validEvidence(claim,plan.search_plan.queries);
    engine.setFixtureEvidence(evidence);
    const evaluated=evaluateCanonicalTaskPlan(plan,evidence);
    assert.ok(evaluated.confirmed_count>=1);
    const out=await engine.process({question:claim},tenant);
    assert.equal(out.result.non_ai,true);
    assert.equal(out.result.decision_authority,'EXTERNAL_ONLY');
    assert.equal(out.runtime.engine,'v8_canonical_global_rules');
    assert.equal(out.result.judgment.order[6],'07_evidence_status');
    assert.equal(Object.hasOwn(out.result.judgment,'07_recommendation'),false);
    assert.equal(out.result.comparison.material_only,true);
    assert.equal(out.result.comparison.selected_candidate,null);
    assert.deepEqual(out.result.comparison.candidate_ranking,[]);
    assert.equal(Object.hasOwn(out.result.comparison,'score'),false);
    assert.deepEqual(out.result.perspective_expansion.candidates,[]);
    assert.equal(out.result.perspective_expansion.selected,null);
    assert.match(out.material.text,/根拠成立状態|Evidence Status/);
  }finally{await engine.destroy();}
});

test('without G1-G7 evidence, direct assertion remains UNDETERMINED',async()=>{
  await withEngine(async(engine)=>{const out=await engine.process({question:'Node.js 22は本番対応している。'},tenant);assert.equal(out.result.canonical_claims.confirmed_count,0);assert.ok(out.result.canonical_claims.undetermined_count>=1);assert.equal(out.result.facts.confirmed.length,0);});
});
