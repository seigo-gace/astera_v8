'use strict';

const {createEvidenceBindingId,normalizeText,parseNaturalStructure,detectPolarity,deepFreeze}=require('./core');

const CandidateRelation=Object.freeze({SUPPORTS:'SUPPORTS',CONTRADICTS:'CONTRADICTS',PARTIALLY_SUPPORTS:'PARTIALLY_SUPPORTS',NO_MATCH:'NO_MATCH',NOT_RELEVANT_PREFILTER:'NOT_RELEVANT_PREFILTER'});
const EvidenceSource=Object.freeze({LOCAL_INPUT_EVIDENCE:'LOCAL_INPUT_EVIDENCE',EXTERNAL_RETRIEVED_EVIDENCE:'EXTERNAL_RETRIEVED_EVIDENCE'});

function candidateText(candidate){return normalizeText(candidate?.fields?.claim||candidate?.excerpt||candidate?.text||candidate?.content||candidate?.title||'');}
function fixedContains(haystack,needle){const left=normalizeText(haystack).toLocaleLowerCase('und'),right=normalizeText(needle).toLocaleLowerCase('und');return Boolean(right)&&left.includes(right);}
function candidateClaim(candidate){const text=candidateText(candidate);if(!text)return{resolved:false,diagnostic:'EMPTY_CANDIDATE_TEXT'};const structure=parseNaturalStructure(text);if(structure.unresolved)return{resolved:false,diagnostic:structure.diagnostic,text};return{resolved:true,...structure,polarity:detectPolarity(text),text};}
function sourceSpan(candidate){return candidate?.canonical_locator?.url||candidate?.url||candidate?.canonical_record_id||candidate?.candidate_id||'UNKNOWN';}
function bindingBase(claim,candidate,relation,extra={}){const span=sourceSpan(candidate);return deepFreeze({evidence_binding_id:createEvidenceBindingId({claimId:claim.claim_id,candidateId:candidate.candidate_id||candidate.canonical_record_id||span,sourceSpan:span,relation}),claim_id:claim.claim_id,candidate_id:candidate.candidate_id||candidate.canonical_record_id||span,source_span:span,relation,evidence_source:EvidenceSource.EXTERNAL_RETRIEVED_EVIDENCE,source_roles:[String(candidate.source_role||'SECONDARY').toUpperCase()],source_family_id:candidate.source_family_id||null,authority_id:candidate.authority_id||null,provenance_series_id:candidate.provenance_series_id||null,...extra});}
function bindExternalCandidate(claim,candidate){
  const extracted=candidateClaim(candidate);
  if(!extracted.resolved)return bindingBase(claim,candidate,CandidateRelation.NO_MATCH,{parse_unresolved:true,reasons:['PARSE_UNRESOLVED'],diagnostics:[extracted.diagnostic]});
  const raw=candidateText(candidate),subjectMatch=claim.subject!=='UNKNOWN'&&fixedContains(raw,claim.subject),predicateMatch=claim.predicate==='VERIFICATION_TARGET'||claim.predicate==='STATED_CONTENT'||fixedContains(raw,claim.predicate)||normalizeText(extracted.predicate)===normalizeText(claim.predicate),objectKnown=claim.object_or_value!=='UNKNOWN'&&claim.object_or_value!==null,objectMatch=!objectKnown||fixedContains(raw,String(claim.object_or_value)),exactRaw=fixedContains(raw,claim.raw_text),polarityMatch=claim.polarity===extracted.polarity||claim.polarity==='UNKNOWN'||extracted.polarity==='UNKNOWN';
  let relation=CandidateRelation.NO_MATCH;
  if(exactRaw||(subjectMatch&&predicateMatch&&objectMatch&&polarityMatch))relation=CandidateRelation.SUPPORTS;
  else if(subjectMatch&&predicateMatch&&objectKnown&&!objectMatch&&claim.polarity!==extracted.polarity)relation=CandidateRelation.CONTRADICTS;
  return bindingBase(claim,candidate,relation,{extracted_subject:extracted.subject,extracted_predicate:extracted.predicate,extracted_object_or_value:extracted.object_or_value,extracted_polarity:extracted.polarity,extracted_scope:{subject:extracted.subject,property:extracted.predicate,time_scope:candidate.updated_at||candidate.published_at||'UNKNOWN',jurisdiction:candidate.jurisdiction||'UNKNOWN',version_scope:candidate.version||'UNKNOWN'},parse_unresolved:false,reasons:[],diagnostics:[]});
}
function localBinding(claim){
  if(claim.verification_line?.passed!==true)return null;
  const relation=CandidateRelation.SUPPORTS,span=claim.canonical_source_position||`${claim.source_span?.start??0}:${claim.source_span?.end??0}`,candidateId=`local:${claim.fragment_id}`;
  return deepFreeze({evidence_binding_id:createEvidenceBindingId({claimId:claim.claim_id,candidateId,sourceSpan:span,relation}),claim_id:claim.claim_id,candidate_id:candidateId,source_span:span,relation,evidence_source:EvidenceSource.LOCAL_INPUT_EVIDENCE,source_roles:['LOCAL'],source_family_id:`local:${claim.fragment_id}`,authority_id:null,parse_unresolved:false,reasons:[],diagnostics:[]});
}
function bindClaimEvidence(claim,policy,rawEvidence){
  if(!policy.external_search_required){const local=localBinding(claim);return deepFreeze({bindings:local?[local]:[],candidate_by_id:new Map()});}
  const candidates=Array.isArray(rawEvidence?.evidence)?rawEvidence.evidence:[],bindings=candidates.map((candidate)=>bindExternalCandidate(claim,candidate)),candidateById=new Map(candidates.map((candidate)=>[candidate.candidate_id||candidate.canonical_record_id||sourceSpan(candidate),candidate]));
  return deepFreeze({bindings,candidate_by_id:candidateById});
}

module.exports={CandidateRelation,EvidenceSource,candidateText,candidateClaim,bindExternalCandidate,bindClaimEvidence,localBinding};
