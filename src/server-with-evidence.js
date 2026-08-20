'use strict';

const AsteraServer = require('./server');
const EvidenceSearchClient = require('./evidence-search/api/client');
const { routeDomainTemplates } = require('./domain-template-router');
const { analyzeRequest, deriveEvidenceNeed, unique } = require('./judgment-materials-analyzer');
const { buildCanonicalTaskPlan, evaluateCanonicalTaskPlan } = require('./canonical-claim-runtime');
const { isSkillApiConfigured } = require('./auth/skill-api-key');

const EVIDENCE_REQUEST_LIMIT=256*1024;
const INTEGRATED_REQUEST_LIMIT=1024*1024;

function evidenceClientConfigured(options={}){return Boolean(options.evidenceClient||options.internalSecret||options.internalSecretFile||process.env.ASTERA_INTERNAL_SERVICE_SECRET||process.env.ASTERA_INTERNAL_SERVICE_SECRET_FILE);}
function validDomainId(value){return /^G(?:0[1-9]|[12][0-9]|3[0-8])$/.test(String(value||''));}
function notRequired(taskId){return{schema_version:'astera.evidence-search.result.v1',status:'NOT_REQUIRED',task_id:taskId,evidence:[],coverage:{discovery_scope_state:'NOT_REQUIRED'},quality:{final:{status:'NOT_REQUIRED',score_bp:null}},provider_execution:{initial:[],reinforcement:[]},ai_used:false,payment_executed:false};}
function failedEvidence(taskId,error){return{schema_version:'astera.evidence-search.result.v1',status:'REJECTED_PROVIDER_FAILURE',task_id:taskId,evidence:[],coverage:{discovery_scope_state:'PARTIAL'},quality:{final:{status:'REJECTED_PROVIDER_FAILURE',score_bp:0,reasons:['PROVIDER_FAILURE']}},provider_execution:{initial:[{provider_id:'task_evidence_search',status:'REJECTED',error_code:error?.code||'PROVIDER_FAILURE'}],reinforcement:[]},ai_used:false,payment_executed:false};}
function claimRouteText(task,preliminaryPlan){return unique([...(preliminaryPlan?.claims||[]).map((claim)=>claim.raw_text),task.target||'',...(task.premises||[]),task.source_span?.text||'']).join('\n');}
function evidenceQuestion(task){return unique([task.target||'',task.source_span?.text||'']).join('\n')||String(task.objective||'');}
function evidenceContext(task,bodyContext){return unique([task.objective||'',...(task.premises||[]),...(task.conditions||[]),...(task.verification||[]),task.source_span?.text||'',bodyContext||'']).join('\n');}
function aggregateEvidence(byTask){const entries=Object.entries(byTask),searched=entries.filter(([,value])=>value.status!=='NOT_REQUIRED');if(!searched.length)return{status:'NOT_REQUIRED',searched_task_count:0,valid_task_count:0,rejected_task_count:0,evidence:[]};const valid=searched.filter(([,value])=>value.status==='FINAL_VALID'),rejected=searched.filter(([,value])=>String(value.status||'').startsWith('REJECTED')),status=valid.length===searched.length?'FINAL_VALID':rejected.length===searched.length?'REJECTED_TASK_EVIDENCE':'PARTIAL_TASK_EVIDENCE';return{status,searched_task_count:searched.length,valid_task_count:valid.length,rejected_task_count:rejected.length,evidence:searched.flatMap(([taskId,value])=>(value.evidence||[]).map((item)=>({task_id:taskId,...item})))};}
function aggregateClaimState(byTask){const records=Object.values(byTask).flatMap((value)=>value.records||[]),confirmed=records.filter((record)=>record.confirmation?.status==='CONFIRMED').length,undetermined=records.length-confirmed;return{status:records.length&&undetermined===0?'CONFIRMED':'UNDETERMINED',claim_count:records.length,confirmed_count:confirmed,undetermined_count:undetermined};}

class AsteraServerWithEvidence extends AsteraServer {
  constructor(options={}){super(options);this.evidenceClient=options.evidenceClient||(evidenceClientConfigured(options)?new EvidenceSearchClient({baseUrl:options.evidenceBaseUrl,timeoutMs:options.evidenceTimeoutMs,internalSecret:options.internalSecret,internalSecretFile:options.internalSecretFile,fetch:options.fetch}):null);}

  async _handle(req,res,context={tenantId:'anonymous'}){
    const pathname=String(req.url||'').split('?')[0],isIntegrated=req.method==='POST'&&pathname==='/v1/integrated/process',isPublicEvidence=req.method==='POST'&&pathname==='/v1/evidence/search',isSkillEvidence=req.method==='POST'&&pathname==='/v1/skill/evidence/search';
    if(!isIntegrated&&!isPublicEvidence&&!isSkillEvidence)return super._handle(req,res,context);
    try{
      if(this._requiresHttps(req))return this._json(req,res,426,{error:'https_required',hint:'Set HTTPS at the reverse proxy or send X-Forwarded-Proto: https.'});
      if(req.headers.origin&&!this._corsOriginFor(req))return this._json(req,res,403,{error:'cors_origin_denied'});
      if(!this.evidenceClient)return this._json(req,res,503,{error:'evidence_search_not_configured'});
      const tenant=isSkillEvidence?await this._authenticateSkill(req):await this._authenticate(req);
      if(isSkillEvidence&&!isSkillApiConfigured())return this._json(req,res,503,{error:'skill_api_not_configured'});
      if(!tenant)return this._json(req,res,401,{error:'unauthorized',hint:isSkillEvidence?'Valid ASTERA_SKILL_API_KEY is required.':'X-API-Key header is required. Provision tenant credentials outside the Astera Core runtime.'});
      context.tenantId=tenant.id;
      if(!isSkillEvidence){const limits=this.tenants.limitsFor(tenant),rate=this.limiter.check({key:`${isIntegrated?'integrated':'evidence'}:${tenant.id}`,limit:limits.perMinute,windowMs:60_000});if(!rate.allowed)return this._json(req,res,429,{error:'rate_limited',rate});}
      if(isIntegrated)return this._handleIntegrated(req,res,context,tenant);
      const body=await this._readJsonObject(req,EVIDENCE_REQUEST_LIMIT);
      if(body.paid_search?.enabled===true){const error=new Error('paid search is disabled; free providers only');error.code='PAID_SEARCH_DISABLED';error.status=400;throw error;}
      const result=await this.evidenceClient.search({...body,request_id:req.requestId,tenant_id:tenant.id,paid_search:{enabled:false}},{requestId:req.requestId,tenantId:tenant.id});
      if(!isSkillEvidence)this.meter.record({tenant,route:'/v1/evidence/search',units:1,status:result.status,meta:{evidence_count:Array.isArray(result.evidence)?result.evidence.length:0,final_score_bp:result.quality?.final?.score_bp??null}});
      this.logger.write({tenantId:tenant.id,type:'evidence_search_proxy_completed',text:`Evidence search proxy returned ${result.status}`,payload:{request_id:req.requestId,access_mode:isSkillEvidence?'owner_skill_private':'tenant',status:result.status,evidence_count:Array.isArray(result.evidence)?result.evidence.length:0,final_score_bp:result.quality?.final?.score_bp??null}});
      return this._json(req,res,200,result);
    }catch(error){const requestedStatus=Number(error?.status),status=requestedStatus>=400&&requestedStatus<=599?requestedStatus:500;this.logger.write({tenantId:context.tenantId,type:'evidence_or_integrated_failed',severity:status>=500?'error':'warn',text:`${req.method} ${pathname} failed`,payload:{request_id:req.requestId,status,error_code:error.code||'INTERNAL_ERROR'}});return this._json(req,res,status,{error:status>=500?'internal_error':error.message,code:error.code||'INTERNAL_ERROR',status,requestId:req.requestId});}
  }

  async _prepareIntegratedRequest(body){if(this.engine&&typeof this.engine.prepareRequest==='function')return this.engine.prepareRequest({question:body.question,context:body.context||'',language:body.language,output_language:body.output_language});const fallback=analyzeRequest({question:body.question,context:body.context||''});fallback.instruction_understanding={mode:'FAST_PATH_COMPATIBILITY_FALLBACK',parser:null,execution_allowed:true,blocked_reasons:[]};return fallback;}

  async _handleIntegrated(req,res,context,tenant){
    const body=await this._readJsonObject(req,INTEGRATED_REQUEST_LIMIT);
    if(typeof body.question!=='string'||!body.question.trim()){const error=new Error('question must be a non-empty string');error.code='INVALID_QUESTION';error.status=400;throw error;}
    if(body.context!==undefined&&typeof body.context!=='string'){const error=new Error('context must be a string');error.code='INVALID_CONTEXT';error.status=400;throw error;}
    const evidenceOptions=body.evidence_search&&typeof body.evidence_search==='object'?body.evidence_search:{};
    if(evidenceOptions.paid_search?.enabled===true){const error=new Error('paid search is disabled; free providers only');error.code='PAID_SEARCH_DISABLED';error.status=400;throw error;}

    const request=await this._prepareIntegratedRequest(body),tasks=request.analysis_task_packet?.tasks||[];
    if(!tasks.length){const error=new Error('analysis task graph is empty');error.code='TASK_GRAPH_EMPTY';error.status=422;throw error;}

    const taskPlans=tasks.map((baseTask)=>{
      const preliminaryPlan=buildCanonicalTaskPlan(baseTask,{});
      const domain=routeDomainTemplates({question:claimRouteText(baseTask,preliminaryPlan),context:body.context||''});
      const evidenceNeed=deriveEvidenceNeed(baseTask,domain);
      const task={...baseTask,domain,evidence_need:evidenceNeed};
      const canonicalPlan=buildCanonicalTaskPlan(task,domain);
      const explicitSingleDomain=tasks.length===1&&validDomainId(body.domain_lens?.id)?body.domain_lens.id:null,domainId=explicitSingleDomain||domain.primary?.id;
      if(!validDomainId(domainId)&&canonicalPlan.search_plan.queries.length)return{...task,canonical_plan:canonicalPlan,domain_error:'DOMAIN_LENS_UNRESOLVED'};
      return{...task,canonical_plan:canonicalPlan,domain_id:domainId};
    });

    request.analysis_task_packet={...request.analysis_task_packet,tasks:taskPlans.map(({canonical_plan,...task})=>task)};
    const evidenceByTask={};
    await Promise.all(taskPlans.map(async(task)=>{
      const upstreamPlan=task.canonical_plan.search_plan;
      if(task.domain_error&&upstreamPlan.queries.length){evidenceByTask[task.id]={...failedEvidence(task.id,Object.assign(new Error(task.domain_error),{code:task.domain_error})),planning_authority:'UPSTREAM_CANONICAL',planned_query_roles:upstreamPlan.planned_query_roles};return;}
      if(!upstreamPlan.queries.length){evidenceByTask[task.id]={...notRequired(task.id),planning_authority:'UPSTREAM_CANONICAL',planned_query_roles:[]};return;}
      const evidenceRequest={question:evidenceQuestion(task),context:evidenceContext(task,body.context||''),domain_lens:{id:task.domain_id,...(task.domain.primary?.taxonomy_version?{taxonomy_version:task.domain.primary.taxonomy_version}:{})},overlays:(task.domain.overlays||[]).map((overlay)=>overlay.id).filter(Boolean).slice(0,16),upstream_search_plan:upstreamPlan,preplanned_queries:upstreamPlan.queries,search:{free_projection:true,free_current:true},paid_search:{enabled:false},...(Array.isArray(evidenceOptions.conditions)&&evidenceOptions.conditions.length?{conditions:evidenceOptions.conditions}:{}),...(Array.isArray(evidenceOptions.provider_allowlist)?{provider_allowlist:evidenceOptions.provider_allowlist}:{}),...(Array.isArray(evidenceOptions.provider_denylist)?{provider_denylist:evidenceOptions.provider_denylist}:{}),...(Number.isInteger(evidenceOptions.maximum_results)?{maximum_results:evidenceOptions.maximum_results}:{}),...(Number.isInteger(evidenceOptions.deadline_ms)?{deadline_ms:evidenceOptions.deadline_ms}:{}),request_id:`${req.requestId}:${task.id}`,tenant_id:tenant.id};
      try{const result=await this.evidenceClient.search(evidenceRequest,{requestId:`${req.requestId}:${task.id}`,tenantId:tenant.id});evidenceByTask[task.id]={...result,planning_authority:'UPSTREAM_CANONICAL',planned_query_roles:upstreamPlan.planned_query_roles,query_plan:{planning_authority:'UPSTREAM_CANONICAL',planned_query_roles:upstreamPlan.planned_query_roles,query_ids:upstreamPlan.queries.map((query)=>query.query_id)}};}catch(error){evidenceByTask[task.id]={...failedEvidence(task.id,error),planning_authority:'UPSTREAM_CANONICAL',planned_query_roles:upstreamPlan.planned_query_roles};}
    }));

    const canonicalByTask=Object.fromEntries(taskPlans.map((task)=>[task.id,evaluateCanonicalTaskPlan(task.canonical_plan,evidenceByTask[task.id])])),evidenceSummary=aggregateEvidence(evidenceByTask),claimSummary=aggregateClaimState(canonicalByTask),decision=await this.engine.process({question:body.question,context:body.context||'',language:body.language,output_language:body.output_language,moodAnswers:body.moodAnswers||{},taskEvidencePackets:evidenceByTask,canonicalClaimRecordsByTask:canonicalByTask,preparedRequest:request},tenant);
    this.meter.record({tenant,route:'/v1/integrated/process',units:1,status:claimSummary.status,meta:{instruction_mode:request.instruction_understanding?.mode||'UNKNOWN',evidence_status:evidenceSummary.status,claim_status:claimSummary.status,searched_task_count:evidenceSummary.searched_task_count,confirmed_claim_count:claimSummary.confirmed_count,undetermined_claim_count:claimSummary.undetermined_count,ai_used:false}});
    this.logger.write({tenantId:tenant.id,type:'integrated_process_completed',text:`Integrated task graph completed: instruction=${request.instruction_understanding?.mode||'UNKNOWN'} evidence=${evidenceSummary.status} claims=${claimSummary.status}`,payload:{request_id:req.requestId,task_count:tasks.length,searched_task_count:evidenceSummary.searched_task_count,instruction_mode:request.instruction_understanding?.mode||'UNKNOWN',evidence_status:evidenceSummary.status,claim_status:claimSummary.status,confirmed_claim_count:claimSummary.confirmed_count,undetermined_claim_count:claimSummary.undetermined_count,ai_used:false}});
    return this._json(req,res,200,{schema_version:'astera.integrated.result.v2',request_id:req.requestId,non_ai:true,instruction_understanding:request.instruction_understanding||null,task_graph:{task_count:tasks.length,dependencies:request.analysis_task_packet.dependencies,execution_waves:request.analysis_task_packet.execution_waves,hard_blockers:request.analysis_task_packet.hard_blockers||[]},canonical:{claim_summary:claimSummary,by_task:canonicalByTask},evidence:{...evidenceSummary,by_task:evidenceByTask},decision_materials:{result:decision.result,material:decision.material,runtime:decision.runtime}});
  }
}

module.exports=AsteraServerWithEvidence;
