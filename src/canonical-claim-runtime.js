'use strict';

const {unique}=require('./judgment-materials-analyzer');
const {deepFreeze}=require('./v4-canonical/core');
const {fragmentInput}=require('./v4-canonical/fragmenter');
const {extractClaimsForTask}=require('./v4-canonical/claim-extractor');
const {QUERY_ROLES,policyForClaim}=require('./v4-canonical/policy-registry');
const {planQueriesForClaim,planTaskQueries}=require('./v4-canonical/query-planner');
const {bindClaimEvidence}=require('./v4-canonical/evidence-binding');
const {ClaimStatus,evaluateClaimConfirmation}=require('./v4-canonical/confirmation');
const {buildFiveLanes}=require('./v4-canonical/lanes');

const CONFIRMED=ClaimStatus.CONFIRMED;
const UNDETERMINED=ClaimStatus.UNDETERMINED;

function fragmentText(text,baseOffset=0){
  const result=fragmentInput({inputDocumentId:`adhoc:${baseOffset}`,text,sourceAxes:{},maxFragments:256});
  if(!baseOffset)return result.fragments;
  return deepFreeze(result.fragments.map((fragment)=>({...fragment,span:{start:fragment.span.start+baseOffset,end:fragment.span.end+baseOffset},canonical_source_position:`${fragment.span.start+baseOffset}:${fragment.span.end+baseOffset}`})));
}

function claimsForTask(task,options={}){
  return extractClaimsForTask(task,options).claims;
}
function policyFor(claim){return policyForClaim(claim);}
function queriesForClaim(claim,policy,domainId=null){return planQueriesForClaim(claim,policy,{primary:domainId?{id:domainId}:null});}

function buildCanonicalTaskPlan(task,domain={},options={}){
  const extraction=extractClaimsForTask(task,{executionAt:options.executionAt||new Date().toISOString(),documentReferenceDate:options.documentReferenceDate||null,knownNames:options.knownNames||[]});
  const policyByClaim={};
  for(const claim of extraction.claims)policyByClaim[claim.claim_id]=policyForClaim(claim);
  const searchPlan=planTaskQueries(extraction.claims,policyByClaim,domain);
  return deepFreeze({schema_version:'astera.canonical-task-plan.v2',task_id:task.id,fragments:extraction.fragments,unmapped_fragments:extraction.unmapped,diagnostics:extraction.diagnostics,claims:extraction.claims,policy_by_claim_id:policyByClaim,search_plan:{...searchPlan,task_id:task.id,planned_query_roles:unique(searchPlan.queries.map((query)=>query.role)).sort()}});
}

function evaluateCanonicalTaskPlan(plan,rawEvidence){
  const records=plan.claims.map((claim)=>{
    const policy=plan.policy_by_claim_id[claim.claim_id],bindingResult=bindClaimEvidence(claim,policy,rawEvidence),queries=plan.search_plan.queries.filter((query)=>query.claim_id===claim.claim_id),confirmation=evaluateClaimConfirmation({claim,policy,bindings:bindingResult.bindings,queries,rawEvidence}),confirmationWithBindings=deepFreeze({...confirmation,bindings:bindingResult.bindings});
    return deepFreeze({claim,policy,bindings:bindingResult.bindings,confirmation:confirmationWithBindings});
  });
  return deepFreeze({schema_version:'astera.canonical-claim-records.v2',task_id:plan.task_id,search_plan:plan.search_plan,records,confirmed_count:records.filter((record)=>record.confirmation.status===CONFIRMED).length,undetermined_count:records.filter((record)=>record.confirmation.status===UNDETERMINED).length});
}

function projectFiveLanes({task,canonical,domain={}}){
  const claims=(canonical.records||[]).map((record)=>record.claim),results=(canonical.records||[]).map((record)=>record.confirmation),policyByClaimId=Object.fromEntries((canonical.records||[]).map((record)=>[record.claim.claim_id,record.policy]));
  return buildFiveLanes({claims,results,policyByClaimId,task,domain});
}

function domainArray(domain,names){for(const name of names)if(Array.isArray(domain?.primary?.[name]))return domain.primary[name];return[];}
function deterministicPerspectiveExpansion({task,canonical,domain={}}){
  const records=canonical?.records||[],confirmed=records.filter((record)=>record.confirmation.status===CONFIRMED).length,undetermined=records.length-confirmed;
  return deepFreeze({engine:'Astera Deterministic Perspective Expansion',mode:'MATERIAL_ONLY',candidates:[],selected:null,rejected:[],perspectives:[
    {id:'forward',focus:task.objective||task.target||'',basis:{confirmed,undetermined,rule_id:'PERSPECTIVE-FORWARD-MATERIAL'}},
    {id:'counter',focus:'Counter-evidence and failure conditions',basis:{query_role:QUERY_ROLES.COUNTER,rule_id:'PERSPECTIVE-COUNTER-MATERIAL'}},
    {id:'constraint',focus:unique([...(task.constraints||[]),...(task.prohibitions||[]),...(task.preserve||[])]),basis:{rule_id:'PERSPECTIVE-CONSTRAINT-MATERIAL'}},
    {id:'domain',focus:domainArray(domain,['multi_lens','perspectives']).map(String),basis:{lens_id:domain.primary?.id||null,rule_id:'PERSPECTIVE-DOMAIN-MATERIAL'}}
  ]});
}

module.exports={QUERY_ROLES,CONFIRMED,UNDETERMINED,fragmentText,claimsForTask,policyFor,queriesForClaim,buildCanonicalTaskPlan,evaluateCanonicalTaskPlan,projectFiveLanes,deterministicPerspectiveExpansion};
