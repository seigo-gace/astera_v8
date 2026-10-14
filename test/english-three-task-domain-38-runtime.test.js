'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const AsteraEngine=require('../src/astera-engine');
const createEvidenceSearchModule=require('../src/evidence-search');
const {routeDomainTemplates}=require('../src/domain-template-router');
const {loadEnglishThreeTaskCases}=require('./english-three-task-domain-38-corpus');

const CASES=loadEnglishThreeTaskCases();
const caller={id:'en-three-task-lens-audit',is_global:true,plan:'admin'};
const logger={write(){},async flush(){}};
const provider=(id,source_class)=>({
  provider_id:id,source_class,source_family_id:'independent-'+id,
  priority:2,certified:true,domains:[],routing_terms:[],
  capabilities:['NO_REINFORCEMENT'],search:async plan=>({
    coverage_state:'COMPLETE_FOR_QUERY_SCOPE',
    candidates:[],
    query_results:(plan.query_set||[]).map(query=>({
      query_id:query.query_id,retrieval_status:'NOT_FOUND',candidate_record_ids:[]
    }))
  })
});
const normalized=s=>String(s||'').normalize('NFKC').toLowerCase();
function topicalAnchor(value) {
  return normalized(value).replace(/[^a-z0-9\s]+/g,' ')
    .split(/\s+/).filter(x=>x.length>=5&&!['against','across','original','current','record','records','with','without','under','using','after','before','their','review','results','change'].includes(x)).slice(0,3);
}
function contentHasAnchor(text,value) {
  const t=normalized(text);
  return topicalAnchor(value).some(x=>t.includes(x));
}
function evaluate(caseRow,out,searchRecords,naturalRoute) {
  const checks={};
  const result=out.result||{},sections=out.material?.sections||[];
  const packet=result.analysis_task_packet||{};
  const graph=packet.material_requirement_graph||{};
  const tasks=result.task_results||[];
  const sourceRequests=packet.case_model?.judgment_requests||[];
  const plain=String(out.material?.text||'');
  const rawTaskText=packet.tasks?.map(t=>t.source_span?.text||t.raw_text||t.target||'').join(' ')||'';
  const stageTasks=result.five_stage?.tasks||[];
  const evidencePlans=tasks.flatMap(r=>r.task?.canonical_plan?.search_plan?.queries||[]);
  const materialPlans=tasks.flatMap(r=>r.task?.material_evidence_execution?.requirements||[]);
  const lenses=tasks.map(r=>r.task?.domain?.primary?.id||'NONE');
  const stages=['fact','risk','multi','inquiry','compare'];

  checks.natural_lens=naturalRoute===caseRow.id;
  checks.runtime_lens=lenses.includes(caseRow.id);
  checks.three_separate_tasks=sourceRequests.length>=3;
  checks.no_phantom_sprawl=sourceRequests.length<=5;
  checks.task_source_preservation=[1,2,3].every(n=>rawTaskText.includes('Task '+n));
  checks.canonical_need_graph=Array.isArray(graph.requests)&&graph.requests.length>=3;
  checks.evidence_planned=evidencePlans.length>=3&&evidencePlans.some(q=>String(q.requirement_slot_id||'').length>0);
  checks.requirement_lineage=materialPlans.length>0&&materialPlans.some(x=>x.source==='DECISION_BACKWARD_MATERIAL_REQUIREMENT');
  checks.both_search_routes=searchRecords.length>0&&searchRecords.every(x=>
    x.route_execution?.specialist_authoritative?.attempted&&x.route_execution?.general_current?.attempted&&x.route_execution?.distinct_provider_count>=2);
  checks.five_substantive_lanes=stageTasks.length>=3&&stageTasks.every(t=>stages.every(k=>t[k]&&typeof t[k]==='object'));
  checks.main8_complete=sections.length===8&&sections.every(s=>String(s.text||'').trim().length>0);
  checks.fact_source_specific=contentHasAnchor(sections[2]?.text,caseRow.sources);
  checks.risk_specific=contentHasAnchor(sections[3]?.text,caseRow.risks);
  checks.comparison_specific=contentHasAnchor(sections[5]?.text,caseRow.alternatives);
  checks.section07_uncertainty=/unknown|unresolved|missing|not verified|not confirmed|evidence|unavailable|not found/i.test(String(sections[6]?.text||''));
  checks.no_fabricated_support=(result.canonical_claims?.confirmed_count||0)===0&&materialPlans.every(x=>x.confirmation_status==='UNRESOLVED');
  checks.no_normative_decision=result.no_normative_decision_generated===true&&!/\b(?:you should choose|the best option is|we recommend selecting)\b/i.test(plain);
  checks.no_unusable_inflation=plain.length<=caseRow.length*9;
  return {
    id:caseRow.id,characters:caseRow.length,checks,
    natural_lens:naturalRoute,runtime_lenses:[...new Set(lenses)],
    source_requests:sourceRequests.length,tasks:tasks.length,
    search_calls:searchRecords.length,queries:evidencePlans.length,
    requirement_slots:materialPlans.length,sections:sections.length,
    output_chars:plain.length,output_to_input_ratio:Number((plain.length/caseRow.length).toFixed(1)),
    confirmed_claims:result.canonical_claims?.confirmed_count||0,
    truly_decision_ready:false, // The fake providers return NO EVIDENCE. Never report product completion.
    failures:Object.keys(checks).filter(k=>!checks[k]),
    ...(caseRow.id==='G01'||caseRow.id==='G29'?{
      diagnostic_excerpt:{
        task_source_spans:(packet.tasks||[]).slice(0,6).map(x=>String(x.source_span?.text||x.raw_text||x.target||'').slice(0,150)),
        original_requests:sourceRequests.slice(0,6).map(x=>String(x.request_text||x.text||'').slice(0,135)),
        section03:String(sections[2]?.text||'').slice(0,550),
        section04:String(sections[3]?.text||'').slice(0,550),
        section06:String(sections[5]?.text||'').slice(0,550),
        raw_task_count:packet.tasks?.length
      }
    }:{})
  };
}

test('38 unique canonical English cases have three domain-specific tasks and ~1000 characters',()=>{
  assert.equal(CASES.length,38);
  assert.equal(new Set(CASES.map(x=>x.id)).size,38);
  const inputs=new Set();
  for(const row of CASES) {
    assert.ok(row.length>=850&&row.length<=1250,row.id+' size '+row.length);
    assert.equal(row.tasks.length,3);
    for(const n of [1,2,3]) assert.ok(row.input.includes('Task '+n+' —'),row.id+' task '+n);
    assert.ok(!inputs.has(row.input),row.id+' input duplicated');
    inputs.add(row.input);
  }
});

for(const scenario of CASES) {
  test('English 3-task decision material acceptance: '+scenario.id,{timeout:120000},async()=>{
    const natural=routeDomainTemplates({question:scenario.input}).primary?.id||'NONE';
    const evidenceModule=createEvidenceSearchModule({
      providers:[provider('domain-research','FREE_PROJECTION'),provider('public-current','FREE_GENERAL_WEB')],
      informationQualityEvaluator:async request=>({
        schema_version:'astera.information-quality-result.v1',phase:request.phase,
        status:'REJECTED_BLOCKING',score_bp:0,criterion_scores:{},
        blocking_reasons:['NO_ADOPTABLE_EXTERNAL_EVIDENCE']
      })
    });
    const records=[];
    const evidenceSearchClient={search:async(payload,ctx)=>{
      const response=await evidenceModule.execute({
        schema_version:'astera.evidence-search.module-request.v1',operation:'SEARCH_EVIDENCE',
        context:{request_id:ctx.requestId,caller_id:ctx.callerId,execution_time:'2026-10-14T00:00:00.000Z',
          effective_as_of:'2026-10-14T00:00:00.000Z'},
        payload:{...payload,deadline_ms:4000}
      });
      records.push(response.result);
      return response.result;
    }};
    const engine=new AsteraEngine({poolSize:2,logger,evidenceSearchClient});
    try{
      // The explicit controlled ID tests all 38 configured Lenses even if free-text routing misclassifies.
      // Free-text routing is separately checked and reported as its own potential defect.
      const out=await engine.process({
        question:'['+scenario.id+'] '+scenario.input,
        evidence_search:{provider_allowlist:['domain-research','public-current']}
      },caller);
      const report=evaluate(scenario,out,records,natural);
      console.log('DOMAIN38_DIAGNOSTIC '+JSON.stringify(report));
      assert.deepEqual(report.failures,[],scenario.id+' product-purpose failure(s): '+report.failures.join(', '));
    }finally {await engine.destroy();}
  });
}
