'use strict';

const {
  AssertionType,ClaimOrigin,Modality,Polarity,VerificationLine,
  classifyAssertionType,extractIdentifiers,parseNaturalStructure,detectModality,detectPolarity,detectPolarityTags,
  normalizeText,resolveRelativeTime,parseVersionScheme,createClaimId,createFragmentId,COMPLEX_NEGATION_PATTERNS,deepFreeze
}=require('./core');

function policyFor({origin,structure,timeScope,explicitPolicyId=null,explicitPredicateFamily=null}){
  if(explicitPolicyId||explicitPredicateFamily)return{claim_policy_id:explicitPolicyId,predicate_family:explicitPredicateFamily};
  if(origin===ClaimOrigin.ATTRIBUTED_ASSERTION)return{claim_policy_id:'POLICY_ATTRIBUTION',predicate_family:'ATTRIBUTION'};
  if(origin===ClaimOrigin.CODE_STRUCTURE)return{claim_policy_id:'POLICY_CODE_STRUCTURE',predicate_family:'CODE_STRUCTURE'};
  if(origin===ClaimOrigin.LOG_OBSERVATION)return{claim_policy_id:'POLICY_LOG_RECORD',predicate_family:'LOG_RECORD'};
  if(origin===ClaimOrigin.TABLE_OBSERVATION)return{claim_policy_id:'POLICY_TABLE_VALUE',predicate_family:'TABLE_VALUE'};
  const numeric=/\d+(?:\.\d+)?(?:円|GB|%|％|件|ms|req)?/u.test(String(structure.object_or_value??''));
  if(numeric)return{claim_policy_id:'POLICY_NUMERIC_FACT',predicate_family:'NUMERIC_FACT'};
  if(timeScope!=='UNKNOWN')return{claim_policy_id:'POLICY_CURRENT_FACT',predicate_family:'CURRENT_FACT'};
  return{claim_policy_id:'POLICY_GENERAL_FACT',predicate_family:'GENERAL_FACT'};
}
function verification(line,gates){return deepFreeze({line,gates,passed:Object.values(gates).every(Boolean)});}
function extractVersion(text,explicit){if(explicit)return normalizeText(explicit);const candidate=normalizeText(text).match(/\bv?\d+(?:\.\d+){0,2}\b|\b\d{4}-\d{2}(?:-\d{2})?\b|\bRev\.?\s*\d+\b/iu)?.[0];return candidate?parseVersionScheme(candidate).normalized:'UNKNOWN';}
function quoteInner(text){return normalizeText(text).match(/[『「“"]([^』」”"]+)[』」”"]/u)?.[1]??null;}
function buildClaim({fragment,structure,origin,modality,polarity,timeScope,jurisdiction,versionScope,policy,sourceAxes,verificationLine,splitDepth=0,parentClaimId=null,diagnostics=[]}){
  const payload={subject:normalizeText(structure.subject||'UNKNOWN'),predicate:normalizeText(structure.predicate||'UNKNOWN'),object_or_value:structure.object_or_value??'UNKNOWN',polarity,modality,time_scope:timeScope||'UNKNOWN',jurisdiction:normalizeText(jurisdiction||'UNKNOWN'),version_scope:normalizeText(versionScope||'UNKNOWN'),claim_origin:origin};
  const claimId=createClaimId({fragmentId:fragment.fragment_id,canonicalClaimPayload:payload});
  return deepFreeze({claim_id:claimId,fragment_id:fragment.fragment_id,...payload,raw_text:fragment.normalized_fragment,source_span:fragment.span,canonical_source_position:fragment.canonical_source_position,polarity_tags:detectPolarityTags(fragment.normalized_fragment),predicate_parts:[...(structure.predicate_parts??[])],condition:structure.condition??null,claim_policy_id:policy.claim_policy_id??null,predicate_family:policy.predicate_family??null,source_axes:sourceAxes,verification_line:verificationLine,split_depth:splitDepth,parent_claim_id:parentClaimId,diagnostics:[...diagnostics]});
}
function unresolvedCodeClaim(fragment){
  return buildClaim({fragment,structure:{subject:'UNKNOWN',predicate:'CODE_STRUCTURE_UNRESOLVED',object_or_value:'UNKNOWN'},origin:ClaimOrigin.CODE_STRUCTURE,modality:Modality.OBSERVED,polarity:Polarity.UNKNOWN,timeScope:'UNKNOWN',jurisdiction:'UNKNOWN',versionScope:'UNKNOWN',policy:policyFor({origin:ClaimOrigin.CODE_STRUCTURE,structure:{},timeScope:'UNKNOWN'}),sourceAxes:fragment.source_axes,verificationLine:verification(VerificationLine.CODE_STRUCTURE_LINE,{PARSER_SUPPORTED:false,AST_NODE_EXTRACTED:false,SUBJECT_IDENTIFIED:false,PREDICATE_RESOLVED:false,SOURCE_LOCATION_FIXED:Boolean(fragment.span)}),diagnostics:['PARSER_UNSUPPORTED_OR_NOT_EXECUTED']});
}
function extractClaimsFromFragment(fragment,context={}){
  if(fragment.source_axes?.container_role?.includes('FENCED_CONTAINER'))return deepFreeze({claims:[unresolvedCodeClaim(fragment)],unmapped:false,assertion_type:AssertionType.UNKNOWN,identifiers:[]});
  const assertionType=classifyAssertionType(fragment.normalized_fragment),sourceRole=context.sourceRole??'DIRECT_INPUT',executionDate=new Date(context.executionAt||Date.now()),documentReferenceDate=context.documentReferenceDate?new Date(context.documentReferenceDate):null,time=resolveRelativeTime(fragment.normalized_fragment,{sourceRole,executionDate,documentReferenceDate}),modality=detectModality(fragment.normalized_fragment),polarity=detectPolarity(fragment.normalized_fragment),versionScope=extractVersion(fragment.normalized_fragment,context.versionScope),jurisdiction=context.jurisdiction??'UNKNOWN',identifiers=extractIdentifiers(fragment.normalized_fragment,context.knownNames??[]),output=[];
  const inner=quoteInner(fragment.normalized_fragment);
  if(inner){
    const attributionSource=normalizeText(context.attributionSource||'UNKNOWN'),outerStructure={subject:attributionSource,predicate:'STATED',object_or_value:inner},outerPolicy=policyFor({origin:ClaimOrigin.ATTRIBUTED_ASSERTION,structure:outerStructure,timeScope:time.time_scope}),outerVerification=verification(VerificationLine.ATTRIBUTED_ASSERTION_LINE,{ATTRIBUTION_SOURCE_IDENTIFIED:attributionSource!=='UNKNOWN',INNER_PROPOSITION_EXTRACTED:Boolean(inner)});
    output.push(buildClaim({fragment,structure:outerStructure,origin:ClaimOrigin.ATTRIBUTED_ASSERTION,modality:Modality.OBSERVED,polarity:Polarity.AFFIRMATIVE,timeScope:time.time_scope,jurisdiction,versionScope,policy:outerPolicy,sourceAxes:fragment.source_axes,verificationLine:outerVerification}));
    const innerText=normalizeText(inner),innerFragment={...fragment,fragment_id:createFragmentId({inputDocumentId:fragment.input_document_id,canonicalSourcePosition:`${fragment.canonical_source_position}:quote`,normalizedFragment:innerText}),normalized_fragment:innerText,text:inner,canonical_source_position:`${fragment.canonical_source_position}:quote`,source_axes:{...fragment.source_axes,quotation_role:['INNER_PROPOSITION']}},innerStructure=parseNaturalStructure(innerText),innerPolicy=policyFor({origin:ClaimOrigin.DIRECT_ASSERTION,structure:innerStructure,timeScope:time.time_scope}),innerPolarity=detectPolarity(innerText),innerVerification=verification(VerificationLine.NATURAL_LANGUAGE_LINE,{ASSERTION:classifyAssertionType(innerText)===AssertionType.ASSERTION,SPECIFIC:!innerStructure.unresolved&&(innerStructure.subject!=='UNKNOWN'||extractIdentifiers(innerText).length>0),POLARITY_RESOLVED:innerPolarity!==Polarity.UNKNOWN});
    output.push(buildClaim({fragment:innerFragment,structure:innerStructure,origin:ClaimOrigin.DIRECT_ASSERTION,modality:detectModality(innerText),polarity:innerPolarity,timeScope:time.time_scope,jurisdiction,versionScope,policy:innerPolicy,sourceAxes:innerFragment.source_axes,verificationLine:innerVerification,diagnostics:innerStructure.unresolved?[innerStructure.diagnostic]:[]}));
    return deepFreeze({claims:output,unmapped:false,assertion_type:assertionType,identifiers});
  }
  if(assertionType!==AssertionType.ASSERTION)return deepFreeze({claims:[],unmapped:true,assertion_type:assertionType,identifiers});
  const structure=parseNaturalStructure(time.text),policy=policyFor({origin:ClaimOrigin.DIRECT_ASSERTION,structure,timeScope:time.time_scope,explicitPolicyId:context.claimPolicyId,explicitPredicateFamily:context.predicateFamily}),verificationLine=verification(VerificationLine.NATURAL_LANGUAGE_LINE,{ASSERTION:true,SPECIFIC:!structure.unresolved&&(structure.subject!=='UNKNOWN'||identifiers.length>0),POLARITY_RESOLVED:polarity!==Polarity.UNKNOWN});
  output.push(buildClaim({fragment,structure,origin:ClaimOrigin.DIRECT_ASSERTION,modality,polarity,timeScope:time.time_scope,jurisdiction,versionScope,policy,sourceAxes:fragment.source_axes,verificationLine,diagnostics:structure.unresolved?[structure.diagnostic]:[]}));
  return deepFreeze({claims:output,unmapped:false,assertion_type:assertionType,identifiers});
}
function buildVerificationTargetClaim({task,inputDocumentId,executionAt}){
  const raw=normalizeText(task.target||task.source_span?.text||task.objective||'UNKNOWN'),position=`task-target:${task.id}`,fragment={fragment_id:createFragmentId({inputDocumentId,canonicalSourcePosition:position,normalizedFragment:raw}),input_document_id:inputDocumentId,text:raw,normalized_fragment:raw,canonical_source_position:position,span:task.source_span||null,source_axes:{container_role:['TASK_TARGET'],content_role:['VERIFICATION_TARGET'],quotation_role:['DIRECT']}},structure={subject:raw||'UNKNOWN',predicate:'VERIFICATION_TARGET',object_or_value:'UNKNOWN'},policy=policyFor({origin:ClaimOrigin.DIRECT_ASSERTION,structure,timeScope:'UNKNOWN'}),line=verification(VerificationLine.NATURAL_LANGUAGE_LINE,{ASSERTION:true,SPECIFIC:raw!=='UNKNOWN',POLARITY_RESOLVED:true});
  return buildClaim({fragment,structure,origin:ClaimOrigin.DIRECT_ASSERTION,modality:Modality.OBSERVED,polarity:Polarity.AFFIRMATIVE,timeScope:'UNKNOWN',jurisdiction:'UNKNOWN',versionScope:extractVersion(raw,null),policy,sourceAxes:fragment.source_axes,verificationLine:line,diagnostics:raw==='UNKNOWN'?['TARGET_UNRESOLVED']:[]});
}
function extractClaimsForTask(task,{executionAt=new Date().toISOString(),documentReferenceDate=null,knownNames=[]}={}){
  const {fragmentInput}=require('./fragmenter'),inputDocumentId=`task:${task.id}`,sourceText=String(task.source_span?.text||task.raw_text||''),fragmented=fragmentInput({inputDocumentId,text:sourceText,sourceAxes:{task_id:task.id},maxFragments:256}),claims=[],unmapped=[];
  for(const fragment of fragmented.fragments){const result=extractClaimsFromFragment(fragment,{sourceRole:task.source_role||'DIRECT_INPUT',executionAt,documentReferenceDate,knownNames});claims.push(...result.claims);if(result.unmapped)unmapped.push({fragment_id:fragment.fragment_id,assertion_type:result.assertion_type});}
  if(!claims.some((claim)=>claim.claim_origin===ClaimOrigin.DIRECT_ASSERTION)&&task.evidence_need?.required)claims.push(buildVerificationTargetClaim({task,inputDocumentId,executionAt}));
  return deepFreeze({claims:[...new Map(claims.map((claim)=>[claim.claim_id,claim])).values()].sort((a,b)=>a.claim_id.localeCompare(b.claim_id)),fragments:fragmented.fragments,unmapped,resource_limited:fragmented.resource_limited,diagnostics:[...fragmented.diagnostics]});
}

module.exports={policyFor,verification,extractClaimsFromFragment,extractClaimsForTask,buildVerificationTargetClaim,unresolvedCodeClaim};
