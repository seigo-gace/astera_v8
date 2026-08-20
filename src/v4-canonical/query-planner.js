'use strict';

const {createQueryId,sanitizeQueryTerm,deepFreeze}=require('./core');
const {QUERY_ROLES}=require('./policy-registry');

const QUERY_TEMPLATE_VERSION='v4.0.0';
const MAX_QUERIES_PER_CLAIM=8;

function fixedTemplate(role,claim){
  const subject=sanitizeQueryTerm(claim.subject),predicate=sanitizeQueryTerm(claim.predicate),version=sanitizeQueryTerm(claim.version_scope);
  switch(role){
    case QUERY_ROLES.OFFICIAL:return`${subject} ${predicate} 公式`.trim();
    case QUERY_ROLES.PRIMARY:return`${subject} ${predicate} 一次資料`.trim();
    case QUERY_ROLES.INDEPENDENT:return`${subject} ${predicate} 独立資料`.trim();
    case QUERY_ROLES.VERSION:return`${subject} ${version}`.trim();
    case QUERY_ROLES.COUNTER:
      if(claim.modality==='CONDITIONAL_RULE')return`${subject} ${predicate} 反例 条件不成立 例外`.trim();
      return claim.polarity==='NEGATIVE'?`${subject} ${predicate} 肯定形`.trim():`${subject} ${predicate} 否定形`.trim();
    case QUERY_ROLES.NUMERIC_LOWER:return`${subject} ${predicate} 下限`.trim();
    case QUERY_ROLES.NUMERIC_UPPER:return`${subject} ${predicate} 上限`.trim();
    case QUERY_ROLES.NUMERIC_ALTERNATE:return`${subject} ${predicate} 別値`.trim();
    default:throw new Error(`unsupported query role: ${role}`);
  }
}
function planQueriesForClaim(claim,policy,classification={}){
  if(!policy.external_search_required)return deepFreeze([]);
  const roles=[...policy.planned_query_roles];
  if(!roles.includes(QUERY_ROLES.COUNTER))throw Object.assign(new Error(`counter query role is mandatory for ${claim.claim_id}`),{code:'COUNTER_ROLE_REQUIRED_BY_DESIGN'});
  if(roles.length>MAX_QUERIES_PER_CLAIM)throw Object.assign(new Error(`query roles exceed resource limit for ${claim.claim_id}`),{code:'RESOURCE_LIMIT_EXCEEDED'});
  const domainFilter=classification.primary?.id??classification.primary_genre_id??null,classificationStatus=domainFilter?'RESOLVED':'CLASSIFICATION_UNRESOLVED';
  return deepFreeze(roles.map((role)=>{const normalizedQueryText=fixedTemplate(role,claim);return{query_id:createQueryId({claimId:claim.claim_id,queryRole:role,normalizedQueryText,queryTemplateVersion:QUERY_TEMPLATE_VERSION}),claim_id:claim.claim_id,role,text:normalizedQueryText,normalized_query_text:normalizedQueryText,domain_filter:domainFilter,domain_id:domainFilter,classification_status:classificationStatus,query_template_version:QUERY_TEMPLATE_VERSION};}).sort((a,b)=>a.query_id.localeCompare(b.query_id)));
}
function planTaskQueries(claims,policies,classification={}){const queries=[];for(const claim of claims){const policy=policies[claim.claim_id];queries.push(...planQueriesForClaim(claim,policy,classification));}return deepFreeze({schema_version:'astera.upstream-search-plan.v2',planning_authority:'ASTERA_DECISION_MATERIALS_V4',query_template_version:QUERY_TEMPLATE_VERSION,planned_query_roles:[...new Set(queries.map((query)=>query.role))].sort(),queries:queries.sort((a,b)=>a.query_id.localeCompare(b.query_id))});}

module.exports={QUERY_TEMPLATE_VERSION,MAX_QUERIES_PER_CLAIM,fixedTemplate,planQueriesForClaim,planTaskQueries};
