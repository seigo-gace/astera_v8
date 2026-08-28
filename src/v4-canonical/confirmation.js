'use strict';

const {normalizeEvidencePacket}=require('../judgment-materials-analyzer');
const {ClaimOrigin,deepFreeze}=require('./core');
const {CandidateRelation,EvidenceSource}=require('./evidence-binding');

const ClaimStatus=Object.freeze({CONFIRMED:'CONFIRMED',UNDETERMINED:'UNDETERMINED'});
const RetrievalStatus=Object.freeze({FOUND:'FOUND',NOT_FOUND:'NOT_FOUND',RETRIEVAL_FAILED:'RETRIEVAL_FAILED'});
const UndeterminedReason=Object.freeze({PARSE_UNRESOLVED:'PARSE_UNRESOLVED',MODALITY_NOT_VERIFIABLE:'MODALITY_NOT_VERIFIABLE',SCOPE_UNKNOWN:'SCOPE_UNKNOWN',INSUFFICIENT_EVIDENCE:'INSUFFICIENT_EVIDENCE',RETRIEVAL_FAILED:'RETRIEVAL_FAILED',RESOURCE_LIMIT_EXCEEDED:'RESOURCE_LIMIT_EXCEEDED',CONFLICT:'CONFLICT'});
const CODE_PREDICATES=new Set(['DECLARES_SYMBOL','IMPORTS_MODULE','EXPORTS_SYMBOL','CALLS_FUNCTION','USES_IDENTIFIER','DEFINES_ROUTE','DEPENDS_ON_PACKAGE','CODE_STRUCTURE']);

const scopeKnown=(value)=>value!==null&&value!==undefined&&String(value).trim()!==''&&String(value).trim()!=='UNKNOWN';
function retrievalRecords(rawEvidence){const initial=Array.isArray(rawEvidence?.query_execution?.initial)?rawEvidence.query_execution.initial:[],reinforcement=Array.isArray(rawEvidence?.query_execution?.reinforcement)?rawEvidence.query_execution.reinforcement:[];return [...initial,...reinforcement].map((record)=>({query_id:record.query_id,retrieval_status:record.status,resource_limit_exceeded:record.resource_limit_exceeded===true,provider_records:record.provider_records||[]}));}
function retrievalGate(policy,queries,records){if(!policy.external_search_required)return deepFreeze({passed:true,details:[]});const byQuery=new Map();for(const record of records){if(!byQuery.has(record.query_id))byQuery.set(record.query_id,[]);byQuery.get(record.query_id).push(record.retrieval_status);}const details=queries.map((query)=>{const statuses=byQuery.get(query.query_id)||[],failed=statuses.length===0||statuses.includes(RetrievalStatus.RETRIEVAL_FAILED),valid=statuses.length>0&&statuses.every((status)=>status===RetrievalStatus.FOUND||status===RetrievalStatus.NOT_FOUND);return deepFreeze({query_id:query.query_id,role:query.role,statuses,passed:!failed&&valid});});return deepFreeze({passed:details.every((item)=>item.passed),details});}
function evidenceSearchStatusGate(policy,rawEvidence){if(!policy.external_search_required)return deepFreeze({passed:true,status:'NOT_REQUIRED'});const status=String(rawEvidence?.status||'').toUpperCase();return deepFreeze({passed:status==='FINAL_VALID',status:status||'UNKNOWN'});}
function requiredSourceRolesSatisfied(policy,supports){const required=policy.required_source_roles||[];return required.every((role)=>supports.some((binding)=>binding.source_roles?.includes(role)));}
function evaluateIndependence(policy,supports){
  if(!policy.external_search_required)return deepFreeze({satisfied:true,status:'NOT_REQUIRED',reasons:[]});
  const external=supports.filter((binding)=>binding.evidence_source===EvidenceSource.EXTERNAL_RETRIEVED_EVIDENCE);
  const familyId=(binding)=>binding.source_family_id||binding.authority_id||null;
  const authorityFamilies=new Set(external.filter((binding)=>binding.source_roles?.some((role)=>['OFFICIAL','PRIMARY'].includes(role))).map(familyId).filter(Boolean));
  const independentFamilies=new Set(external.filter((binding)=>!binding.source_roles?.some((role)=>['OFFICIAL','PRIMARY'].includes(role))).map(familyId).filter(Boolean));
  const allFamilies=new Set(external.map(familyId).filter(Boolean));
  const overlappingRoleFamilies=[...authorityFamilies].filter((family)=>independentFamilies.has(family));
  const hasDistinctAuthorityIndependentPair=[...authorityFamilies].some((authorityFamily)=>[...independentFamilies].some((independentFamily)=>independentFamily!==authorityFamily));
  const satisfied=policy.independence_requirement==='LOCAL_INPUT_ONLY'
    ? true
    : policy.independence_requirement==='AUTHORITY_PLUS_INDEPENDENT_OR_TWO_FAMILIES'
      ? hasDistinctAuthorityIndependentPair||allFamilies.size>=2
      : allFamilies.size>=2;
  return deepFreeze({
    satisfied,
    status:satisfied?'SATISFIED':'INSUFFICIENT',
    reasons:satisfied?[]:['INDEPENDENCE_INSUFFICIENT'],
    authority_family_count:authorityFamilies.size,
    independent_family_count:independentFamilies.size,
    distinct_family_count:allFamilies.size,
    authority_independent_distinct_pair:hasDistinctAuthorityIndependentPair,
    overlapping_role_family_count:overlappingRoleFamilies.length
  });
}
function originWithinConfirmableRange(claim,supports){if(claim.claim_origin===ClaimOrigin.DIRECT_ASSERTION)return supports.every((binding)=>binding.evidence_source===EvidenceSource.EXTERNAL_RETRIEVED_EVIDENCE);if(claim.claim_origin===ClaimOrigin.ATTRIBUTED_ASSERTION)return claim.predicate==='STATED'&&supports.every((binding)=>binding.evidence_source===EvidenceSource.LOCAL_INPUT_EVIDENCE);if(claim.claim_origin===ClaimOrigin.CODE_STRUCTURE)return CODE_PREDICATES.has(claim.predicate)&&supports.every((binding)=>binding.evidence_source===EvidenceSource.LOCAL_INPUT_EVIDENCE);if(claim.claim_origin===ClaimOrigin.LOG_OBSERVATION)return claim.predicate==='LOG_RECORD_EXISTS'&&supports.every((binding)=>binding.evidence_source===EvidenceSource.LOCAL_INPUT_EVIDENCE);if(claim.claim_origin===ClaimOrigin.TABLE_OBSERVATION)return supports.every((binding)=>binding.evidence_source===EvidenceSource.LOCAL_INPUT_EVIDENCE);return false;}

function evaluateClaimConfirmation({claim,policy,bindings,queries,rawEvidence,additionalReasons=[]}){
  const reasons=new Set(additionalReasons),compact=normalizeEvidencePacket(rawEvidence||{}),records=retrievalRecords(rawEvidence||{});
  if(!policy)return deepFreeze({claim_id:claim.claim_id,status:ClaimStatus.UNDETERMINED,reasons:[UndeterminedReason.INSUFFICIENT_EVIDENCE],gates:{G1:false,G2:false,G3:false,G4:false,G5:false,G6:true,G7:false},gate_details:{missing_scope_fields:[],source_roles_satisfied:false,independence:{satisfied:false},retrieval:[],evidence_search_status:{passed:false,status:'UNKNOWN'},contradiction_binding_ids:[]},diagnostics:['APPLICABLE_POLICY_NOT_REGISTERED'],policy_resolution:'NOT_REGISTERED',supported_scope:{subject:claim.subject,property:claim.predicate,time:claim.time_scope,jurisdiction:claim.jurisdiction,version:claim.version_scope},support_binding_ids:[]});
  const g1=claim.verification_line?.passed===true;if(!g1)reasons.add(UndeterminedReason.PARSE_UNRESOLVED);
  const g2=policy.verifiable_modalities.includes(claim.modality);if(!g2)reasons.add(UndeterminedReason.MODALITY_NOT_VERIFIABLE);
  const missingScope=(policy.required_scope_fields||[]).filter((field)=>!scopeKnown(claim[field])),g3=missingScope.length===0;if(!g3)reasons.add(UndeterminedReason.SCOPE_UNKNOWN);
  const supports=(bindings||[]).filter((binding)=>binding.relation===CandidateRelation.SUPPORTS&&(policy.allowed_evidence_sources||[]).includes(binding.evidence_source)),sourceRolesOk=requiredSourceRolesSatisfied(policy,supports),independence=evaluateIndependence(policy,supports),g4=supports.length>0&&sourceRolesOk&&independence.satisfied;if(!g4)reasons.add(UndeterminedReason.INSUFFICIENT_EVIDENCE);
  const retrieval=retrievalGate(policy,queries||[],records),evidenceStatus=evidenceSearchStatusGate(policy,rawEvidence||{}),g5=retrieval.passed&&evidenceStatus.passed;if(!g5)reasons.add(UndeterminedReason.RETRIEVAL_FAILED);if(records.some((record)=>record.resource_limit_exceeded))reasons.add(UndeterminedReason.RESOURCE_LIMIT_EXCEEDED);
  const contradictions=(bindings||[]).filter((binding)=>binding.relation===CandidateRelation.CONTRADICTS),g6=contradictions.length===0&&compact.conflict_detected!==true;if(!g6)reasons.add(UndeterminedReason.CONFLICT);
  const g7=supports.length>0&&originWithinConfirmableRange(claim,supports);if(!g7)reasons.add(UndeterminedReason.INSUFFICIENT_EVIDENCE);
  for(const binding of bindings||[]){if(binding.parse_unresolved)reasons.add(UndeterminedReason.PARSE_UNRESOLVED);for(const reason of binding.reasons||[])reasons.add(reason);}
  const gates=deepFreeze({G1:g1,G2:g2,G3:g3,G4:g4,G5:g5,G6:g6,G7:g7}),confirmed=Object.values(gates).every(Boolean);
  return deepFreeze({claim_id:claim.claim_id,status:confirmed?ClaimStatus.CONFIRMED:ClaimStatus.UNDETERMINED,reasons:[...reasons].sort(),gates,gate_details:{missing_scope_fields:missingScope,source_roles_satisfied:sourceRolesOk,independence,retrieval:retrieval.details,evidence_search_status:evidenceStatus,contradiction_binding_ids:contradictions.map((binding)=>binding.evidence_binding_id).sort()},diagnostics:[],policy_resolution:'REGISTERED',supported_scope:{subject:claim.subject,property:claim.predicate,time:claim.time_scope,jurisdiction:claim.jurisdiction,version:claim.version_scope},support_binding_ids:supports.map((binding)=>binding.evidence_binding_id).sort(),evidence_quality_status:compact.source_status,evidence_quality_score_bp:compact.quality_score_bp});
}

module.exports={ClaimStatus,RetrievalStatus,UndeterminedReason,retrievalRecords,retrievalGate,evidenceSearchStatusGate,evaluateIndependence,originWithinConfirmableRange,evaluateClaimConfirmation};
